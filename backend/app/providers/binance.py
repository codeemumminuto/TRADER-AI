import httpx
import pandas as pd

from app.assets import TIMEFRAMES

BASE_URL = "https://api.binance.com/api/v3/klines"
MAX_KLINES_PER_CALL = 1000


class BinanceError(RuntimeError):
    pass


def _rows_to_df(raw: list) -> pd.DataFrame:
    df = pd.DataFrame(
        raw,
        columns=[
            "open_time", "open", "high", "low", "close", "volume",
            "close_time", "quote_asset_volume", "trades",
            "taker_base_vol", "taker_quote_vol", "ignore",
        ],
    )
    df["time"] = (df["open_time"] // 1000).astype(int)
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = df[col].astype(float)

    return df[["time", "open", "high", "low", "close", "volume"]].sort_values("time").reset_index(drop=True)


async def _fetch(client: httpx.AsyncClient, provider_symbol: str, interval: str, limit: int, end_time: int | None) -> list:
    params = {"symbol": provider_symbol, "interval": interval, "limit": limit}
    if end_time is not None:
        params["endTime"] = end_time

    try:
        resp = await client.get(BASE_URL, params=params)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            raise BinanceError("Limite de requisições da Binance atingido. Tente novamente em instantes.") from exc
        raise BinanceError(f"Erro ao consultar Binance: {exc}") from exc
    except httpx.HTTPError as exc:
        raise BinanceError(f"Falha de rede ao consultar Binance: {exc}") from exc


async def get_candles(provider_symbol: str, timeframe: str, limit: int = 150) -> pd.DataFrame:
    interval = TIMEFRAMES[timeframe]["binance"]
    async with httpx.AsyncClient(timeout=10) as client:
        raw = await _fetch(client, provider_symbol, interval, limit, end_time=None)
    return _rows_to_df(raw)


async def get_historical_candles(provider_symbol: str, timeframe: str, days: float) -> pd.DataFrame:
    """Busca um histórico mais longo que os 1000 candles permitidos por chamada, paginando
    pra trás no tempo — usado pelo backtest, que precisa de dias inteiros de candles de
    timeframes curtos (ex.: 1min por 3 dias = ~4320 candles)."""
    interval = TIMEFRAMES[timeframe]["binance"]
    seconds = TIMEFRAMES[timeframe]["seconds"]
    needed = int(days * 24 * 3600 / seconds) + 60  # +margem pro aquecimento dos indicadores

    all_rows: list = []
    end_time: int | None = None
    remaining = needed

    async with httpx.AsyncClient(timeout=15) as client:
        while remaining > 0:
            batch_limit = min(remaining, MAX_KLINES_PER_CALL)
            raw = await _fetch(client, provider_symbol, interval, batch_limit, end_time)
            if not raw:
                break
            all_rows = raw + all_rows
            remaining -= len(raw)
            end_time = raw[0][0] - 1
            if len(raw) < batch_limit:
                break  # não tem mais histórico disponível

    return _rows_to_df(all_rows)
