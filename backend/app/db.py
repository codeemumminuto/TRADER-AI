"""Engine e sessão do banco (SQLAlchemy síncrono) — o app tem pouco tráfego, então síncrono
dentro dos endpoints async é simples o bastante sem valer a complexidade de sessão async."""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# pool_size/max_overflow padrão (5+10=15) já esgotou uma vez sob uma rajada de logins
# concorrentes, derrubando o site inteiro — 20+30 dá bem mais margem pro mesmo cenário sem
# aumentar risco (Postgres aceita até 100 conexões por padrão, sobra folga).
engine = create_engine(settings.database_url, pool_pre_ping=True, pool_size=20, max_overflow=30, pool_timeout=10)
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
    ("users", "notes", "VARCHAR(500)"),
    ("users", "valor", "DOUBLE PRECISION"),
    ("users", "license_count", "INTEGER NOT NULL DEFAULT 1"),
    ("users", "pending_approval", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("users", "signup_ip", "VARCHAR(64)"),
]


def _apply_column_additions() -> None:
    # IF EXISTS na tabela também: "allowed_ips" ficou pra trás (era só a allowlist de IP,
    # substituída pelo licenciamento por sessão) — segue existindo em produções antigas, mas
    # uma instalação nova nunca cria essa tabela, então a checagem evita erro nesse caso.
    with engine.begin() as conn:
        for table, column, sql_type in _COLUMN_ADDITIONS:
            conn.execute(text(f"ALTER TABLE IF EXISTS {table} ADD COLUMN IF NOT EXISTS {column} {sql_type}"))


def init_db() -> None:
    from app import models  # noqa: F401 — garante que os modelos estão registrados no Base

    Base.metadata.create_all(bind=engine)
    _apply_column_additions()
