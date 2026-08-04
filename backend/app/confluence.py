"""Agrega os indicadores reais em um score de confluência (0-100) e uma direção majoritária.

Este cálculo acontece ANTES de qualquer chamada de IA — a IA recebe este resultado
já pronto e só faz a síntese/explicação em cima dele, ao invés de "chutar" um número.
"""

BIAS_SIGN = {"alta": 1, "baixa": -1, "neutro": 0}


def compute_confluence(indicators: list[dict]) -> dict:
    total_weight = sum(i["weight"] for i in indicators)
    weighted_sum = sum(BIAS_SIGN[i["bias"]] * i["weight"] for i in indicators)

    normalized = weighted_sum / total_weight if total_weight else 0.0  # -1..1
    score = round(50 + normalized * 50)  # 0..100, 50 = neutro

    if score >= 55:
        direction = "CALL"
    elif score <= 45:
        direction = "PUT"
    else:
        direction = "NEUTRO"

    # "score" é bidirecional (50=neutro, 0=PUT máximo, 100=CALL máximo).
    # "strength" é a força do sinal na direção escolhida, sempre 0-100 (0=fraco/neutro, 100=muito forte),
    # e é isso que ancora a confiança retornada pela IA — evita confundir as duas escalas.
    strength = round(abs(score - 50) * 2)

    bullish = sum(1 for i in indicators if i["bias"] == "alta")
    bearish = sum(1 for i in indicators if i["bias"] == "baixa")
    neutral = len(indicators) - bullish - bearish

    return {
        "score": max(0, min(100, score)),
        "strength": max(0, min(100, strength)),
        "direction": direction,
        "bullish_count": bullish,
        "bearish_count": bearish,
        "neutral_count": neutral,
        "total_indicators": len(indicators),
    }


def blend_timeframes(entry: dict, contexts: list[dict]) -> dict:
    """Combina a confluência do timeframe de entrada com a dos timeframes de contexto
    (maiores), gerando um score/força final que dá mais peso à entrada mas penaliza
    quando a tendência maior discorda dela. Isso ainda é cálculo matemático puro —
    a IA recebe o resultado pronto, não decide essa ponderação."""

    if not contexts:
        return {
            **entry,
            "aligned_timeframes": 0,
            "total_context_timeframes": 0,
        }

    entry_weight = 0.6
    context_weight = 0.4 / len(contexts)

    blended_score = entry["score"] * entry_weight + sum(c["score"] * context_weight for c in contexts)
    blended_score = round(blended_score)

    if blended_score >= 55:
        direction = "CALL"
    elif blended_score <= 45:
        direction = "PUT"
    else:
        direction = entry["direction"]

    strength = round(abs(blended_score - 50) * 2)
    aligned = sum(1 for c in contexts if c["direction"] == entry["direction"])

    return {
        "score": max(0, min(100, blended_score)),
        "strength": max(0, min(100, strength)),
        "direction": direction,
        "aligned_timeframes": aligned,
        "total_context_timeframes": len(contexts),
    }
