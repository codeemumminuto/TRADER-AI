"""Combina as leituras independentes (indicadores, IA, quant) num veredito final.

Cada método vota na sua direção com seu próprio peso de confiança. O objetivo aqui NÃO é
esconder divergência — é deixar claro quando os métodos discordam, já que isso também é
uma informação valiosa para quem vai decidir se opera ou não.

A IA é opcional: se estiver desativada (OLLAMA_ENABLED=false) ou tiver falhado nessa
análise, o consenso segue com o que estiver disponível (indicadores e/ou quant) em vez
de travar a resposta inteira por causa de um método só.
"""


def compute_final(
    indicator_direction: str,
    indicator_confidence: int,
    ai_direction: str | None,
    ai_confidence: int | None,
    quant_direction: str | None,
    quant_confidence: int | None,
) -> dict:
    votes: list[tuple[str, int]] = []

    if indicator_direction != "NEUTRO":
        votes.append((indicator_direction, indicator_confidence))

    if ai_direction is not None and ai_confidence is not None:
        votes.append((ai_direction, ai_confidence))

    if quant_direction is not None and quant_direction != "NEUTRO" and quant_confidence is not None:
        votes.append((quant_direction, quant_confidence))

    if not votes:
        # Nada disponível (caso extremo: indicadores neutros, IA desligada, quant falhou).
        return {"direction": "CALL", "confidence": 0, "agreement": "0/0", "unanimous": False}

    call_confidences = [c for d, c in votes if d == "CALL"]
    put_confidences = [c for d, c in votes if d == "PUT"]

    if len(call_confidences) > len(put_confidences):
        direction = "CALL"
        agreeing = call_confidences
    elif len(put_confidences) > len(call_confidences):
        direction = "PUT"
        agreeing = put_confidences
    else:
        # Empate — desempata pelo voto de maior confiança entre os disponíveis (a IA, quando
        # presente, tende a vencer por considerar mais contexto, mas isso não é garantido).
        direction = max(votes, key=lambda v: v[1])[0]
        agreeing = [c for d, c in votes if d == direction]

    confidence = round(sum(agreeing) / len(agreeing)) if agreeing else 0
    total_methods = len(votes)
    agreeing_methods = len(agreeing)

    return {
        "direction": direction,
        "confidence": max(0, min(100, confidence)),
        "agreement": f"{agreeing_methods}/{total_methods}",
        "unanimous": agreeing_methods == total_methods,
    }
