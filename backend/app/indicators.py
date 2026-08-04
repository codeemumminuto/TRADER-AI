"""Indicadores técnicos calculados por fórmula matemática real (sem IA envolvida aqui)."""

import numpy as np
import pandas as pd

from app import support_resistance


def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def _macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = _ema(series, fast)
    ema_slow = _ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def _bollinger(series: pd.Series, period: int = 20, num_std: float = 2.0):
    mid = series.rolling(period).mean()
    std = series.rolling(period).std()
    upper = mid + num_std * std
    lower = mid - num_std * std
    return upper, mid, lower


def _adx(df: pd.DataFrame, period: int = 14):
    high, low, close = df["high"], df["low"], df["close"]
    prev_close = close.shift(1)

    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)

    up_move = high.diff()
    down_move = -low.diff()
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    atr = tr.ewm(alpha=1 / period, adjust=False).mean()
    plus_di = 100 * pd.Series(plus_dm, index=df.index).ewm(alpha=1 / period, adjust=False).mean() / atr.replace(0, np.nan)
    minus_di = 100 * pd.Series(minus_dm, index=df.index).ewm(alpha=1 / period, adjust=False).mean() / atr.replace(0, np.nan)

    dx = (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan) * 100
    adx = dx.ewm(alpha=1 / period, adjust=False).mean()

    return adx.fillna(0), plus_di.fillna(0), minus_di.fillna(0)


def compute_indicators(df: pd.DataFrame) -> list[dict]:
    """Recebe candles (ordenados ascendente) e devolve uma lista de indicadores
    com bias ('alta' | 'baixa' | 'neutro') e peso para o cálculo de confluência."""

    close = df["close"]
    last_close = float(close.iloc[-1])

    ema9 = _ema(close, 9).iloc[-1]
    ema21 = _ema(close, 21).iloc[-1]
    ema50 = _ema(close, 50).iloc[-1] if len(close) >= 50 else _ema(close, len(close)).iloc[-1]

    if last_close > ema9 > ema21 > ema50:
        trend_bias, trend_label = "alta", "Tendência de alta forte (preço > EMA9 > EMA21 > EMA50)"
    elif last_close < ema9 < ema21 < ema50:
        trend_bias, trend_label = "baixa", "Tendência de baixa forte (preço < EMA9 < EMA21 < EMA50)"
    elif last_close > ema21:
        trend_bias, trend_label = "alta", "Viés de alta (preço acima da EMA21)"
    elif last_close < ema21:
        trend_bias, trend_label = "baixa", "Viés de baixa (preço abaixo da EMA21)"
    else:
        trend_bias, trend_label = "neutro", "Sem tendência clara"

    rsi_value = float(_rsi(close).iloc[-1])
    if rsi_value >= 70:
        rsi_bias, rsi_label = "baixa", f"RSI sobrecomprado ({rsi_value:.1f})"
    elif rsi_value <= 30:
        rsi_bias, rsi_label = "alta", f"RSI sobrevendido ({rsi_value:.1f})"
    else:
        rsi_bias, rsi_label = "neutro", f"RSI neutro ({rsi_value:.1f})"

    macd_line, signal_line, hist = _macd(close)
    macd_last, signal_last, hist_last = macd_line.iloc[-1], signal_line.iloc[-1], hist.iloc[-1]
    if macd_last > signal_last and hist_last > 0:
        macd_bias, macd_label = "alta", "MACD acima da linha de sinal (momentum de alta)"
    elif macd_last < signal_last and hist_last < 0:
        macd_bias, macd_label = "baixa", "MACD abaixo da linha de sinal (momentum de baixa)"
    else:
        macd_bias, macd_label = "neutro", "MACD sem cruzamento definido"

    upper, mid, lower = _bollinger(close)
    upper_last, lower_last = upper.iloc[-1], lower.iloc[-1]
    if pd.notna(upper_last) and last_close >= upper_last:
        boll_bias, boll_label = "alta", "Rompimento da banda superior de Bollinger"
    elif pd.notna(lower_last) and last_close <= lower_last:
        boll_bias, boll_label = "baixa", "Rompimento da banda inferior de Bollinger"
    else:
        boll_bias, boll_label = "neutro", "Preço dentro das bandas de Bollinger"

    adx_series, plus_di, minus_di = _adx(df)
    adx_value = float(adx_series.iloc[-1])
    plus_last, minus_last = float(plus_di.iloc[-1]), float(minus_di.iloc[-1])
    if adx_value >= 20 and plus_last > minus_last:
        adx_bias, adx_label = "alta", f"ADX {adx_value:.1f} — tendência de alta com força"
    elif adx_value >= 20 and minus_last > plus_last:
        adx_bias, adx_label = "baixa", f"ADX {adx_value:.1f} — tendência de baixa com força"
    else:
        adx_bias, adx_label = "neutro", f"ADX {adx_value:.1f} — sem força de tendência"

    sr = support_resistance.analyze(df)

    return [
        {"name": "Médias Móveis (EMA 9/21/50)", "value": round(last_close, 5), "bias": trend_bias, "label": trend_label, "weight": 1.2},
        {"name": "RSI (14)", "value": round(rsi_value, 2), "bias": rsi_bias, "label": rsi_label, "weight": 1.0},
        {"name": "MACD (12/26/9)", "value": round(float(hist_last), 6), "bias": macd_bias, "label": macd_label, "weight": 1.1},
        {"name": "Bandas de Bollinger (20,2)", "value": round(last_close, 5), "bias": boll_bias, "label": boll_label, "weight": 0.8},
        {"name": "ADX (14)", "value": round(adx_value, 2), "bias": adx_bias, "label": adx_label, "weight": 1.0},
        {"name": "Suporte/Resistência", "value": round(sr["value"], 5), "bias": sr["bias"], "label": sr["label"], "weight": 1.0},
    ]
