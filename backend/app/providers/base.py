from typing import Protocol

import pandas as pd


class CandleProvider(Protocol):
    async def get_candles(self, provider_symbol: str, timeframe: str, limit: int = 150) -> pd.DataFrame:
        """Retorna DataFrame ordenado ascendente por tempo com colunas:
        time (unix seconds), open, high, low, close, volume."""
        ...
