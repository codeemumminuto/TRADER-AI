"""Log de previsões — cada análise gera um registro com o horário em que a previsão foi feita,
até quando ela vale, e o preço previsto. Não simula resultado (WIN/LOSS): é só um log de
referência do que o sistema já previu. Escopado por usuário — cada um só vê o que é seu."""

from sqlalchemy.orm import Session as DBSession

from app.models import Prediction

_FIELDS = [
    "asset", "timeframe", "direction", "confidence", "agreement", "unanimous", "confluence_score",
    "indicator_direction", "indicator_confidence", "ai_direction", "ai_confidence", "ai_patterns",
    "quant_direction", "quant_confidence", "quant_predicted_price", "predicted_at", "target_time",
    "reasoning", "indicators", "timeframe_readings", "aligned_timeframes", "total_context_timeframes",
]


def _to_dict(pred: Prediction) -> dict:
    return {"id": pred.id, **{f: getattr(pred, f) for f in _FIELDS}}


def add_record(db: DBSession, user_id: int, record: dict) -> None:
    db.add(Prediction(id=record["id"], user_id=user_id, **{f: record[f] for f in _FIELDS}))
    db.commit()


def load_all(db: DBSession, user_id: int) -> list[dict]:
    preds = (
        db.query(Prediction)
        .filter(Prediction.user_id == user_id)
        .order_by(Prediction.predicted_at.desc())
        .all()
    )
    return [_to_dict(p) for p in preds]


def clear_all(db: DBSession, user_id: int) -> None:
    db.query(Prediction).filter(Prediction.user_id == user_id).delete()
    db.commit()
