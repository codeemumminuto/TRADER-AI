from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")  # "admin" | "user"
    is_active: Mapped[bool] = mapped_column(default=True)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Cobrança recorrente — null em ambos = sem cobrança configurada, acesso nunca expira sozinho.
    # "Registrar pagamento" empurra next_due_date pra frente em billing_period_days.
    next_due_date: Mapped[date | None] = mapped_column(Date, default=None)
    billing_period_days: Mapped[int | None] = mapped_column(Integer, default=None)

    allowed_ips: Mapped[list["AllowedIP"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class AllowedIP(Base):
    __tablename__ = "allowed_ips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    ip_or_cidr: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    user: Mapped["User"] = relationship(back_populates="allowed_ips")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # token opaco
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    ip_address: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    asset: Mapped[str] = mapped_column(String(20))
    timeframe: Mapped[str] = mapped_column(String(10))
    direction: Mapped[str] = mapped_column(String(4))
    confidence: Mapped[int] = mapped_column(Integer)
    agreement: Mapped[str] = mapped_column(String(10))
    unanimous: Mapped[bool] = mapped_column()
    confluence_score: Mapped[int] = mapped_column(Integer)

    indicator_direction: Mapped[str] = mapped_column(String(10))
    indicator_confidence: Mapped[int] = mapped_column(Integer)

    ai_direction: Mapped[str | None] = mapped_column(String(4), default=None)
    ai_confidence: Mapped[int | None] = mapped_column(Integer, default=None)
    ai_patterns: Mapped[list] = mapped_column(JSON, default=list)

    quant_direction: Mapped[str | None] = mapped_column(String(10), default=None)
    quant_confidence: Mapped[int | None] = mapped_column(Integer, default=None)
    quant_predicted_price: Mapped[float | None] = mapped_column(default=None)

    predicted_at: Mapped[str] = mapped_column(String(40))
    target_time: Mapped[str] = mapped_column(String(40))

    reasoning: Mapped[list] = mapped_column(JSON, default=list)
    indicators: Mapped[list] = mapped_column(JSON, default=list)
    timeframe_readings: Mapped[list] = mapped_column(JSON, default=list)
    aligned_timeframes: Mapped[int] = mapped_column(Integer, default=0)
    total_context_timeframes: Mapped[int] = mapped_column(Integer, default=0)
