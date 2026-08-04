import asyncio
import collections
import time

import httpx
import pandas as pd

from app.assets import TIMEFRAMES
from app.config import settings

BASE_URL = "https://api.twelvedata.com/time_series"

# O plano gratuito da Twelve Data permite só 8 requisições/minuto no total. Como a análise
# multi-timeframe, o gráfico e o checador de histórico competem pela mesma cota, o cache
# ignora o "limit" pedido (sempre busca uma janela generosa e fatia depois) para que todos
# esses consumidores compartilhem o mesmo cache por símbolo+intervalo, e o TTL é alto o
# suficiente para não estourar o limite quando várias partes do app pedem o mesmo dado.
_FETCH_SIZE = 200
_CACHE: dict[str, tuple[float, pd.DataFrame]] = {}
_CACHE_TTL_SECONDS = 45

# Limitador de taxa proativo: quando várias análises (ex.: vários ativos forex de uma vez)
# disparam várias chamadas reais em sequência, isso espaça as requisições pra nunca estourar
# o limite de 8/min — em vez de deixar a Twelve Data devolver 429 e só reagir depois.
_MAX_REQUESTS_PER_MINUTE = 7
_request_times: collections.deque[float] = collections.deque()
_throttle_lock = asyncio.Lock()


async def _throttle() -> None:
    async with _throttle_lock:
        while True:
            now = time.monotonic()
            while _request_times and now - _request_times[0] > 60:
                _request_times.popleft()
            if len(_request_times) < _MAX_REQUESTS_PER_MINUTE:
                _request_times.append(now)
                return
            await asyncio.sleep(60 - (now - _request_times[0]) + 0.5)


class TwelveDataError(RuntimeError):
    pass


def _rows_to_df(values: list) -> pd.DataFrame:
    df = pd.DataFrame(values)
    df["time"] = pd.to_datetime(df["datetime"]).astype("int64") // 10**9
    for col in ("open", "high", "low", "close"):
        df[col] = df[col].astype(float)
    df["volume"] = df.get("volume", 0).fillna(0).astype(float) if "volume" in df else 0.0

    return df[["time", "open", "high", "low", "close", "volume"]].sort_values("time").reset_index(drop=True)


async def get_historical_candles(provider_symbol: str, timeframe: str, days: float) -> pd.DataFrame:
    """Busca um histórico mais longo, numa chamada só com outputsize alto — o limite gratuito
    da Twelve Data é por REQUISIÇÃO/minuto, não pelo volume de candles numa única resposta,
    então isso não estoura a cota do jeito que múltiplas chamadas pequenas estourariam."""
    if not settings.twelve_data_api_key:
        raise TwelveDataError(
            "TWELVE_DATA_API_KEY nao configurada. Crie uma conta gratuita em "
            "https://twelvedata.com/pricing e adicione a key no arquivo .env do backend."
        )

    interval = TIMEFRAMES[timeframe]["twelvedata"]
    seconds = TIMEFRAMES[timeframe]["seconds"]
    needed = int(days * 24 * 3600 / seconds) + 60
    outputsize = min(needed, 5000)

    await _throttle()

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.get(
                BASE_URL,
                params={
                    "symbol": provider_symbol,
                    "interval": interval,
                    "outputsize": outputsize,
                    "apikey": settings.twelve_data_api_key,
                },
            )
            resp.raise_for_status()
            payload = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            raise TwelveDataError(
                "Limite de requisições gratuitas da Twelve Data atingido (8/min). Aguarde um "
                "minuto e tente novamente."
            ) from exc
        raise TwelveDataError(f"Erro ao consultar Twelve Data: {exc}") from exc
    except httpx.HTTPError as exc:
        raise TwelveDataError(f"Falha de rede ao consultar Twelve Data: {exc}") from exc

    if payload.get("status") == "error":
        raise TwelveDataError(payload.get("message", "Erro desconhecido na Twelve Data"))

    values = payload.get("values", [])
    if not values:
        raise TwelveDataError(f"Sem dados retornados para {provider_symbol} ({interval}).")

    return _rows_to_df(values)


async def get_candles(provider_symbol: str, timeframe: str, limit: int = 150) -> pd.DataFrame:
    if not settings.twelve_data_api_key:
        raise TwelveDataError(
            "TWELVE_DATA_API_KEY nao configurada. Crie uma conta gratuita em "
            "https://twelvedata.com/pricing e adicione a key no arquivo .env do backend."
        )

    interval = TIMEFRAMES[timeframe]["twelvedata"]
    cache_key = f"{provider_symbol}:{interval}"
    cached = _CACHE.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1].tail(limit).reset_index(drop=True)

    await _throttle()

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                BASE_URL,
                params={
                    "symbol": provider_symbol,
                    "interval": interval,
                    "outputsize": _FETCH_SIZE,
                    "apikey": settings.twelve_data_api_key,
                },
            )
            resp.raise_for_status()
            payload = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429 and cached:
            # Estourou o limite de requisições, mas ainda temos um cache (mesmo vencido) —
            # melhor devolver esse dado um pouco desatualizado do que quebrar a resposta.
            return cached[1].tail(limit).reset_index(drop=True)
        if exc.response.status_code == 429:
            raise TwelveDataError(
                "Limite de requisições gratuitas da Twelve Data atingido (8/min). Aguarde um "
                "minuto e tente novamente."
            ) from exc
        raise TwelveDataError(f"Erro ao consultar Twelve Data: {exc}") from exc
    except httpx.HTTPError as exc:
        if cached:
            return cached[1].tail(limit).reset_index(drop=True)
        raise TwelveDataError(f"Falha de rede ao consultar Twelve Data: {exc}") from exc

    if payload.get("status") == "error":
        if cached:
            return cached[1].tail(limit).reset_index(drop=True)
        raise TwelveDataError(payload.get("message", "Erro desconhecido na Twelve Data"))

    values = payload.get("values", [])
    if not values:
        raise TwelveDataError(f"Sem dados retornados para {provider_symbol} ({interval}).")

    df = pd.DataFrame(values)
    df["time"] = pd.to_datetime(df["datetime"]).astype("int64") // 10**9
    for col in ("open", "high", "low", "close"):
        df[col] = df[col].astype(float)
    df["volume"] = df.get("volume", 0).fillna(0).astype(float) if "volume" in df else 0.0

    df = df[["time", "open", "high", "low", "close", "volume"]].sort_values("time").reset_index(drop=True)
    _CACHE[cache_key] = (time.monotonic(), df)
    return df.tail(limit).reset_index(drop=True)
