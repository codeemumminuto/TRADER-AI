"""Catálogo de ativos reais suportados, agrupados por provedor e por perfil de risco."""

ASSETS = [
    # Cripto (Binance, sem necessidade de API key)
    {"symbol": "BTC/USDT", "provider": "binance", "provider_symbol": "BTCUSDT", "category": "cripto", "risk": ["moderado", "volatil"]},
    {"symbol": "ETH/USDT", "provider": "binance", "provider_symbol": "ETHUSDT", "category": "cripto", "risk": ["moderado", "volatil"]},
    {"symbol": "BNB/USDT", "provider": "binance", "provider_symbol": "BNBUSDT", "category": "cripto", "risk": ["volatil"]},
    {"symbol": "SOL/USDT", "provider": "binance", "provider_symbol": "SOLUSDT", "category": "cripto", "risk": ["volatil"]},
    {"symbol": "XRP/USDT", "provider": "binance", "provider_symbol": "XRPUSDT", "category": "cripto", "risk": ["moderado", "volatil"]},
    {"symbol": "ADA/USDT", "provider": "binance", "provider_symbol": "ADAUSDT", "category": "cripto", "risk": ["moderado", "volatil"]},

    # Forex (IQ Option — conexão única compartilhada, ver providers/iqoption.py). Cada par
    # regular tem também sua variante OTC (negocia fora do horário de mercado normal, inclusive
    # fim de semana) — símbolo IQ Option correspondente sempre com sufixo "-OTC".
    {"symbol": "EUR/USD", "provider": "iqoption", "provider_symbol": "EURUSD", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "EUR/USD (OTC)", "provider": "iqoption", "provider_symbol": "EURUSD-OTC", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "GBP/USD", "provider": "iqoption", "provider_symbol": "GBPUSD", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "GBP/USD (OTC)", "provider": "iqoption", "provider_symbol": "GBPUSD-OTC", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "USD/JPY", "provider": "iqoption", "provider_symbol": "USDJPY", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "USD/JPY (OTC)", "provider": "iqoption", "provider_symbol": "USDJPY-OTC", "category": "forex", "risk": ["calmo", "moderado"]},
    # AUD/USD só existe como OTC no catálogo dessa conta — não tem variante regular pra listar.
    {"symbol": "AUD/USD (OTC)", "provider": "iqoption", "provider_symbol": "AUDUSD-OTC", "category": "forex", "risk": ["calmo"]},
    {"symbol": "USD/CAD", "provider": "iqoption", "provider_symbol": "USDCAD", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "USD/CAD (OTC)", "provider": "iqoption", "provider_symbol": "USDCAD-OTC", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "EUR/GBP", "provider": "iqoption", "provider_symbol": "EURGBP", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "EUR/GBP (OTC)", "provider": "iqoption", "provider_symbol": "EURGBP-OTC", "category": "forex", "risk": ["calmo", "moderado"]},
    {"symbol": "EUR/JPY", "provider": "iqoption", "provider_symbol": "EURJPY", "category": "forex", "risk": ["moderado", "volatil"]},
    {"symbol": "EUR/JPY (OTC)", "provider": "iqoption", "provider_symbol": "EURJPY-OTC", "category": "forex", "risk": ["moderado", "volatil"]},
    {"symbol": "GBP/JPY", "provider": "iqoption", "provider_symbol": "GBPJPY", "category": "forex", "risk": ["moderado", "volatil"]},
    {"symbol": "GBP/JPY (OTC)", "provider": "iqoption", "provider_symbol": "GBPJPY-OTC", "category": "forex", "risk": ["moderado", "volatil"]},

    # Commodities (IQ Option)
    {"symbol": "XAU/USD", "provider": "iqoption", "provider_symbol": "XAUUSD", "category": "commodities", "risk": ["moderado", "volatil"]},
    {"symbol": "XAU/USD (OTC)", "provider": "iqoption", "provider_symbol": "XAUUSD-OTC", "category": "commodities", "risk": ["moderado", "volatil"]},
]

TIMEFRAMES = {
    "1min": {"binance": "1m", "seconds": 60},
    "5min": {"binance": "5m", "seconds": 300},
    "15min": {"binance": "15m", "seconds": 900},
    "30min": {"binance": "30m", "seconds": 1800},
    "1h": {"binance": "1h", "seconds": 3600},
    "4h": {"binance": "4h", "seconds": 14400},
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
