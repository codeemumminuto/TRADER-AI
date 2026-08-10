"""Engine e sessão do banco (SQLAlchemy síncrono) — o app tem pouco tráfego, então síncrono
dentro dos endpoints async é simples o bastante sem valer a complexidade de sessão async."""

from sqlalchemy import create_engine
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


def init_db() -> None:
    from app import models  # noqa: F401 — garante que os modelos estão registrados no Base

    Base.metadata.create_all(bind=engine)
