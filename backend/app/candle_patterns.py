"""Reconhecimento de padrões de candlestick por regras determinísticas de OHLC — análise
técnica clássica (doji, engolfo, martelo, estrela cadente, estrela da manhã/noite, três
soldados/corvos), sem LLM nenhuma. Serve de opinião instantânea quando o modelo de linguagem
local está indisponível ou lento demais (ex.: timeframe de 1min, onde a IA generativa é
pulada), e de enriquecimento complementar dos padrões já identificados pela IA quando ela
está disponível.
"""

import pandas as pd


def _trend_context(df: pd.DataFrame, lookback: int = 5) -> str:
    """'alta' se o preço vinha subindo nas velas antes da atual, 'baixa' se vinha caindo —
    usado pra distinguir formas iguais com implicações opostas (martelo vs enforcado, etc.)."""
    if len(df) < lookback + 1:
        return "neutro"
    window = df.iloc[-(lookback + 1) : -1]
    if window["close"].iloc[-1] > window["close"].iloc[0]:
        return "alta"
    if window["close"].iloc[-1] < window["close"].iloc[0]:
        return "baixa"
    return "neutro"


def _body(c) -> float:
    return abs(c["close"] - c["open"])


def _range(c) -> float:
    return max(c["high"] - c["low"], 1e-9)


def _upper_wick(c) -> float:
    return c["high"] - max(c["open"], c["close"])


def _lower_wick(c) -> float:
    return min(c["open"], c["close"]) - c["low"]


def _bullish(c) -> bool:
    return c["close"] > c["open"]


def _bearish(c) -> bool:
    return c["close"] < c["open"]


def detect_patterns(df: pd.DataFrame) -> dict:
    """Recebe candles (ordem ascendente, última linha = mais recente) e devolve uma leitura
    determinística: direção, confiança (35-75, deliberadamente moderada — leitura de padrão
    isolada não é tão forte quanto confluência de vários indicadores) e a lista de padrões
    identificados. Se nada de relevante for encontrado, direction vem None."""

    if len(df) < 3:
        return {"direction": None, "confidence": 0, "patterns": []}

    c0 = df.iloc[-1]
    c1 = df.iloc[-2]
    c2 = df.iloc[-3] if len(df) >= 3 else None
    trend = _trend_context(df)

    patterns: list[tuple[str, str]] = []

    if _body(c0) <= _range(c0) * 0.1:
        patterns.append(("Doji", "neutro"))

    if _body(c0) <= _range(c0) * 0.35 and _lower_wick(c0) >= _body(c0) * 2 and _upper_wick(c0) <= _body(c0) * 0.5:
        if trend == "baixa":
            patterns.append(("Martelo", "alta"))
        elif trend == "alta":
            patterns.append(("Enforcado", "baixa"))

    if _body(c0) <= _range(c0) * 0.35 and _upper_wick(c0) >= _body(c0) * 2 and _lower_wick(c0) <= _body(c0) * 0.5:
        if trend == "alta":
            patterns.append(("Estrela Cadente", "baixa"))
        elif trend == "baixa":
            patterns.append(("Martelo Invertido", "alta"))

    if _bearish(c1) and _bullish(c0) and c0["open"] <= c1["close"] and c0["close"] >= c1["open"]:
        patterns.append(("Engolfo de Alta", "alta"))
    if _bullish(c1) and _bearish(c0) and c0["open"] >= c1["close"] and c0["close"] <= c1["open"]:
        patterns.append(("Engolfo de Baixa", "baixa"))

    if c2 is not None:
        if (
            _bearish(c2)
            and _body(c2) >= _range(c2) * 0.5
            and _body(c1) <= _range(c1) * 0.35
            and _bullish(c0)
            and _body(c0) >= _range(c0) * 0.5
            and c0["close"] >= (c2["open"] + c2["close"]) / 2
        ):
            patterns.append(("Estrela da Manhã", "alta"))

        if (
            _bullish(c2)
            and _body(c2) >= _range(c2) * 0.5
            and _body(c1) <= _range(c1) * 0.35
            and _bearish(c0)
            and _body(c0) >= _range(c0) * 0.5
            and c0["close"] <= (c2["open"] + c2["close"]) / 2
        ):
            patterns.append(("Estrela da Noite", "baixa"))

        if (
            _bullish(c2)
            and _bullish(c1)
            and _bullish(c0)
            and c1["close"] > c2["close"]
            and c0["close"] > c1["close"]
            and _body(c2) >= _range(c2) * 0.4
            and _body(c1) >= _range(c1) * 0.4
            and _body(c0) >= _range(c0) * 0.4
        ):
            patterns.append(("Três Soldados Brancos", "alta"))

        if (
            _bearish(c2)
            and _bearish(c1)
            and _bearish(c0)
            and c1["close"] < c2["close"]
            and c0["close"] < c1["close"]
            and _body(c2) >= _range(c2) * 0.4
            and _body(c1) >= _range(c1) * 0.4
            and _body(c0) >= _range(c0) * 0.4
        ):
            patterns.append(("Três Corvos Negros", "baixa"))

    if not patterns:
        return {"direction": None, "confidence": 0, "patterns": []}

    names = [p[0] for p in patterns]
    directional = [p for p in patterns if p[1] != "neutro"]
    if not directional:
        return {"direction": None, "confidence": 0, "patterns": names}

    bullish_votes = sum(1 for _, bias in directional if bias == "alta")
    bearish_votes = sum(1 for _, bias in directional if bias == "baixa")
    direction = "CALL" if bullish_votes >= bearish_votes else "PUT"
    agreeing = max(bullish_votes, bearish_votes)
    strength = agreeing / len(directional)
    confidence = round(35 + strength * 40)

    return {"direction": direction, "confidence": confidence, "patterns": names}
