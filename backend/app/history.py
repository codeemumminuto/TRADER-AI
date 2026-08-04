"""Armazenamento simples em JSON do log de previsões feitas — cada análise gera um registro
com o horário em que a previsão foi feita, até quando ela vale, e o preço previsto. Não
simula resultado (WIN/LOSS): é só um log de referência do que o sistema já previu."""

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HISTORY_FILE = DATA_DIR / "history.json"


def _ensure_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not HISTORY_FILE.exists():
        HISTORY_FILE.write_text("[]", encoding="utf-8")


def load_all() -> list[dict]:
    _ensure_file()
    return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))


def save_all(records: list[dict]) -> None:
    _ensure_file()
    HISTORY_FILE.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")


def add_record(record: dict) -> None:
    records = load_all()
    records.append(record)
    save_all(records)


def clear_all() -> None:
    save_all([])
