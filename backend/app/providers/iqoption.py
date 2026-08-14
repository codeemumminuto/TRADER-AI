"""Forex/commodities via IQ Option — uma conexão única e persistente (websocket), compartilhada
por todos os usuários, em vez de uma requisição por chamada como a Twelve Data. Sem limite de
taxa pra gerenciar, e os candles são exatamente os da própria corretora (inclusive OTC).

Regra de ouro da lib (não-oficial, ver backend/iqoptionapi/): nunca instanciar mais de um
IQ_Option nem chamar métodos a partir de mais de uma thread ao mesmo tempo — o client já roda
sua própria thread de websocket internamente. Por isso todo acesso ao client passa por _lock,
e as chamadas bloqueantes da lib rodam em thread via asyncio.to_thread.
"""

import asyncio
import time

import pandas as pd

from app.assets import TIMEFRAMES
from app.config import settings

_CONNECT_TIMEOUT_SECONDS = 20
_FETCH_MARGIN = 5  # candles extras pedidos pra sobrar o bastante após descartar a vela em formação

_client = None
_lock = asyncio.Lock()


class IqOptionError(RuntimeError):
    pass


def _ensure_connected_sync() -> None:
    """Roda em thread — conecta se necessário, ou confirma que a conexão existente ainda
    está de pé (a lib reconecta sozinha em quedas curtas; se não, força uma nova)."""
    global _client

    if not settings.iq_email or not settings.iq_password:
        raise IqOptionError("IQ_EMAIL/IQ_PASSWORD não configurados no .env do backend.")

    if _client is not None and _client.check_connect():
        return

    from iqoptionapi.stable_api import IQ_Option

    api = IQ_Option(settings.iq_email, settings.iq_password)
    check, reason = api.connect()
    if not check:
        raise IqOptionError(f"Falha ao conectar na IQ Option: {reason}")
    _client = api


def _normalize_candles(raw: list, timeframe_seconds: int) -> pd.DataFrame:
    now = time.time()
    rows = []
    for c in raw or []:
        close_time = c.get("to", c["from"] + timeframe_seconds)
        if close_time > now:
            continue  # vela ainda em formação — nunca roda indicador/padrão em cima dela
        rows.append({
            "time": int(c["from"]),
            "open": float(c["open"]),
            "high": float(c["max"]),
            "low": float(c["min"]),
            "close": float(c["close"]),
            "volume": float(c.get("volume", 0.0)),
        })
    return pd.DataFrame(rows).drop_duplicates(subset="time").sort_values("time").reset_index(drop=True)


async def get_candles(provider_symbol: str, timeframe: str, limit: int = 150) -> pd.DataFrame:
    seconds = TIMEFRAMES[timeframe]["seconds"]

    async with _lock:
        try:
            await asyncio.wait_for(asyncio.to_thread(_ensure_connected_sync), timeout=_CONNECT_TIMEOUT_SECONDS)
        except asyncio.TimeoutError as exc:
            raise IqOptionError("Tempo esgotado conectando na IQ Option.") from exc

        try:
            raw = await asyncio.to_thread(
                _client.get_candles, provider_symbol, seconds, limit + _FETCH_MARGIN, time.time()
            )
        except Exception as exc:
            raise IqOptionError(f"Erro ao consultar IQ Option para {provider_symbol}: {exc}") from exc

    df = _normalize_candles(raw, seconds)
    if df.empty:
        raise IqOptionError(f"Sem dados retornados para {provider_symbol} ({timeframe}).")
    return df.tail(limit).reset_index(drop=True)


async def get_historical_candles(provider_symbol: str, timeframe: str, days: float) -> pd.DataFrame:
    seconds = TIMEFRAMES[timeframe]["seconds"]
    needed = int(days * 24 * 3600 / seconds) + 60
    return await get_candles(provider_symbol, timeframe, limit=needed)


async def preload() -> None:
    """Conecta já na subida do app, pra não pagar o custo da primeira conexão (alguns
    segundos) na hora que o primeiro usuário pedir uma análise de forex."""
    if not settings.iq_email or not settings.iq_password:
        return
    try:
        async with _lock:
            await asyncio.wait_for(asyncio.to_thread(_ensure_connected_sync), timeout=_CONNECT_TIMEOUT_SECONDS)
    except Exception:
        pass  # não trava a subida do app — a próxima chamada real tenta reconectar
