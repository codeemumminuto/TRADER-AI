"""Engine e sessão do banco (SQLAlchemy síncrono) — o app tem pouco tráfego, então síncrono
dentro dos endpoints async é simples o bastante sem valer a complexidade de sessão async."""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Colunas adicionadas a tabelas que já existiam em produção — create_all() só cria tabelas
# novas, nunca altera uma existente. Em vez de puxar Alembic pra isso, cada entrada aqui é um
# ADD COLUMN IF NOT EXISTS idempotente, aplicado uma vez no startup.
_COLUMN_ADDITIONS = [
    ("users", "next_due_date", "DATE"),
    ("users", "billing_period_days", "INTEGER"),
]


def _apply_column_additions() -> None:
    with engine.begin() as conn:
        for table, column, sql_type in _COLUMN_ADDITIONS:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {sql_type}"))


def init_db() -> None:
    from app import models  # noqa: F401 — garante que os modelos estão registrados no Base

    Base.metadata.create_all(bind=engine)
    _apply_column_additions()
