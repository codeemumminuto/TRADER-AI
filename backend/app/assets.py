"""Catálogo de ativos reais suportados, agrupados por provedor e por perfil de risco."""

ASSETS = [
    # Cripto (Binance, sem necessidade de API key)
    {"symbol": "BTC/USDT", "provider": "binance", "provider_symbol": "BTCUSDT", "category": "cripto", "risk": ["moderado", "volatil"]},
    {"symbol": "ETH/USDT", "provider": "binance", "provider_symbol": "ETHUSDT", "category": "cripto", "risk": ["moderado", "volatil"]},
    {"symbol": "BNB/USDT", "provider": "binance", "provider_symbol": "BNBUSDT", "category": "cripto", "risk": ["volatil"]},
    {"symbol": "SOL/USDT", "provider": "binance", "provider_symbol": "SOLUSDT", "category": "cripto", "risk": ["volatil"]},
    {"symbol": "XRP/USDT", "provider": "binance", "provider_symbol": "XRPUSDT", "category": "cripto", "risk": ["moderado", "volatil"]},

    # Forex (Twelve Data, requer TWELVE_DATA_API_KEY gratuita)
    {"symbol": "EUR/USD", "provider": "twelvedata", "provider_symbol": "EUR/USD", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "GBP/USD", "provider": "twelvedata", "provider_symbol": "GBP/USD", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "USD/JPY", "provider": "twelvedata", "provider_symbol": "USD/JPY", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "AUD/USD", "provider": "twelvedata", "provider_symbol": "AUD/USD", "category": "forex", "risk": ["calmo"]},
    {"symbol": "USD/CAD", "provider": "twelvedata", "provider_symbol": "USD/CAD", "category": "forex", "risk": ["calmo", "moderado"]},
]

TIMEFRAMES = {
    "1min": {"binance": "1m", "twelvedata": "1min", "seconds": 60},
    "5min": {"binance": "5m", "twelvedata": "5min", "seconds": 300},
    "15min": {"binance": "15m", "twelvedata": "15min", "seconds": 900},
    "30min": {"binance": "30m", "twelvedata": "30min", "seconds": 1800},
    "1h": {"binance": "1h", "twelvedata": "1h", "seconds": 3600},
    "4h": {"binance": "4h", "twelvedata": "4h", "seconds": 14400},
}

# O timeframe escolhido pelo usuário é a DURAÇÃO da entrada dele, não o único timeframe
# analisado. Para cada timeframe de entrada, também olhamos 1-2 timeframes maiores como
# contexto de tendência, para não sugerir uma entrada contra a tendência maior.
CONTEXT_TIMEFRAMES = {
    "1min": ["5min", "15min"],
    "5min": ["15min", "1h"],
    "15min": ["1h", "4h"],
    "30min": ["1h", "4h"],
    "1h": ["4h"],
    "4h": [],
}


def find_asset(symbol: str) -> dict | None:
    return next((a for a in ASSETS if a["symbol"] == symbol), None)


def assets_for_risk(risk_profile: str | None) -> list[dict]:
    if not risk_profile:
        return ASSETS
    return [a for a in ASSETS if risk_profile in a["risk"]]
