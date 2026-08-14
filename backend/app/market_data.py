import pandas as pd

from app.assets import find_asset
from app.providers import binance, iqoption


class UnknownAssetError(ValueError):
    pass


async def get_candles(asset_symbol: str, timeframe: str, limit: int = 150) -> pd.DataFrame:
    asset = find_asset(asset_symbol)
    if asset is None:
        raise UnknownAssetError(f"Ativo desconhecido: {asset_symbol}")

    if asset["provider"] == "binance":
        return await binance.get_candles(asset["provider_symbol"], timeframe, limit)
    if asset["provider"] == "iqoption":
        return await iqoption.get_candles(asset["provider_symbol"], timeframe, limit)

    raise UnknownAssetError(f"Provider nao suportado: {asset['provider']}")


async def get_historical_candles(asset_symbol: str, timeframe: str, days: float) -> pd.DataFrame:
    asset = find_asset(asset_symbol)
    if asset is None:
        raise UnknownAssetError(f"Ativo desconhecido: {asset_symbol}")

    if asset["provider"] == "binance":
        return await binance.get_historical_candles(asset["provider_symbol"], timeframe, days)
    if asset["provider"] == "iqoption":
        return await iqoption.get_historical_candles(asset["provider_symbol"], timeframe, days)

    raise UnknownAssetError(f"Provider nao suportado: {asset['provider']}")
