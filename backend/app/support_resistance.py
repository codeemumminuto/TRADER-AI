"""Suporte e resistência por regra determinística — sem IA, só geometria de preço: identifica
topos/fundos recentes (fractais locais), agrupa níveis próximos, e avalia a posição do preço
atual em relação a eles. Inclui rompimento com reteste (quando o preço rompe um nível e volta
pra testá-lo antes de continuar — o antigo teto vira piso, ou vice-versa — um sinal clássico
de confirmação de tendência, mais forte que só "está perto de um nível").

Entra como o 6º indicador da confluência, ao lado de EMA/RSI/MACD/Bollinger/ADX: perto de
resistência forte puxa o viés pra baixa (reduz confiança de CALL), perto de suporte forte
puxa pra alta (reduz confiança de PUT) — do jeito que um trader de verdade evitaria comprar
numa resistência ou vender num suporte.
"""

import pandas as pd

LOOKBACK = 100
FRACTAL_K = 3
CLUSTER_TOLERANCE_PCT = 0.0015
PROXIMITY_PCT = 0.0025
RETEST_LOOKBACK = 10


def _find_swings(df: pd.DataFrame, k: int = FRACTAL_K) -> tuple[list[float], list[float]]:
    highs, lows = [], []
    n = len(df)
    for i in range(k, n - k):
        window_high = df["high"].iloc[i - k : i + k + 1]
        window_low = df["low"].iloc[i - k : i + k + 1]
        if df["high"].iloc[i] == window_high.max():
            highs.append(float(df["high"].iloc[i]))
        if df["low"].iloc[i] == window_low.min():
            lows.append(float(df["low"].iloc[i]))
    return highs, lows


def _cluster_levels(values: list[float], tolerance_pct: float) -> list[dict]:
    if not values:
        return []
    values = sorted(values)
    clusters = [[values[0]]]
    for v in values[1:]:
        if abs(v - clusters[-1][-1]) / clusters[-1][-1] <= tolerance_pct:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return [{"price": sum(c) / len(c), "touches": len(c)} for c in clusters]


def analyze(df: pd.DataFrame) -> dict:
    """Recebe candles (ordem ascendente) e devolve {bias, value, label} no mesmo formato dos
    outros indicadores — pronto pra entrar direto na lista de compute_indicators()."""

    recent = df.tail(LOOKBACK).reset_index(drop=True)
    last_close = float(recent["close"].iloc[-1])

    if len(recent) < FRACTAL_K * 2 + 10:
        return {"bias": "neutro", "value": last_close, "label": "Dados insuficientes pra mapear suporte/resistência"}

    highs, lows = _find_swings(recent)
    resistance_levels = _cluster_levels(highs, CLUSTER_TOLERANCE_PCT)
    support_levels = _cluster_levels(lows, CLUSTER_TOLERANCE_PCT)

    resistances_above = [lvl for lvl in resistance_levels if lvl["price"] > last_close]
    supports_below = [lvl for lvl in support_levels if lvl["price"] < last_close]
    nearest_resistance = min(resistances_above, key=lambda lvl: lvl["price"], default=None)
    nearest_support = max(supports_below, key=lambda lvl: lvl["price"], default=None)

    notes: list[str] = []
    bias_votes: list[str] = []

    if nearest_resistance and (nearest_resistance["price"] - last_close) / last_close <= PROXIMITY_PCT:
        weight = min(3, nearest_resistance["touches"])
        notes.append(f"perto de resistência em {nearest_resistance['price']:.5g} ({nearest_resistance['touches']}x testada)")
        bias_votes.extend(["baixa"] * weight)

    if nearest_support and (last_close - nearest_support["price"]) / last_close <= PROXIMITY_PCT:
        weight = min(3, nearest_support["touches"])
        notes.append(f"perto de suporte em {nearest_support['price']:.5g} ({nearest_support['touches']}x testado)")
        bias_votes.extend(["alta"] * weight)

    retest_window = recent.tail(RETEST_LOOKBACK)
    for level in resistance_levels:
        broke_above = (retest_window["close"] > level["price"] * (1 + CLUSTER_TOLERANCE_PCT)).any()
        if broke_above and last_close > level["price"] and (last_close - level["price"]) / last_close <= PROXIMITY_PCT:
            notes.append(f"rompimento e reteste de resistência em {level['price']:.5g} (virou suporte)")
            bias_votes.extend(["alta"] * 3)

    for level in support_levels:
        broke_below = (retest_window["close"] < level["price"] * (1 - CLUSTER_TOLERANCE_PCT)).any()
        if broke_below and last_close < level["price"] and (level["price"] - last_close) / last_close <= PROXIMITY_PCT:
            notes.append(f"rompimento e reteste de suporte em {level['price']:.5g} (virou resistência)")
            bias_votes.extend(["baixa"] * 3)

    if not bias_votes:
        return {"bias": "neutro", "value": last_close, "label": "Preço fora de zonas de suporte/resistência relevantes"}

    bullish = bias_votes.count("alta")
    bearish = bias_votes.count("baixa")
    bias = "alta" if bullish > bearish else "baixa" if bearish > bullish else "neutro"

    return {"bias": bias, "value": last_close, "label": "; ".join(notes).capitalize()}
