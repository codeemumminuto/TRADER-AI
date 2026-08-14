from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

RiskProfile = Literal["calmo", "moderado", "volatil"]
Direction = Literal["CALL", "PUT"]
DirectionOrNeutral = Literal["CALL", "PUT", "NEUTRO"]


class AssetInfo(BaseModel):
    symbol: str
    category: Literal["cripto", "forex", "commodities"]
    provider: Literal["binance", "twelvedata"]
    risk: list[str]


class Candle(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


class CandlesResponse(BaseModel):
    asset: str
    timeframe: str
    candles: list[Candle]


class AnalyzeRequest(BaseModel):
    asset: str
    timeframe: str = "1min"
    risk_profile: RiskProfile = "moderado"


class IndicatorResult(BaseModel):
    name: str
    value: float
    bias: Literal["alta", "baixa", "neutro"]
    label: str


class TimeframeReading(BaseModel):
    timeframe: str
    role: Literal["entrada", "contexto"]
    direction: Literal["CALL", "PUT", "NEUTRO"]
    score: int


class AIAnalysis(BaseModel):
    direction: Direction
    confidence: int = Field(ge=0, le=100)
    patterns: list[str] = []
    reasoning: list[str]


class AnalyzeResponse(BaseModel):
    id: str
    asset: str
    timeframe: str
    direction: Direction
    confidence: int
    agreement: str
    unanimous: bool

    predicted_at: str  # ISO timestamp — quando a previsão foi feita
    target_time: str  # ISO timestamp — até quando a previsão vale (predicted_at + timeframe)

    confluence_score: int
    indicator_direction: DirectionOrNeutral
    indicator_confidence: int

    ai_direction: Direction | None = None
    ai_confidence: int | None = None
    ai_patterns: list[str] = []

    quant_direction: DirectionOrNeutral | None = None
    quant_confidence: int | None = None
    quant_predicted_price: float | None = None

    reasoning: list[str]
    indicators: list[IndicatorResult]
    timeframe_readings: list[TimeframeReading] = []
    aligned_timeframes: int = 0
    total_context_timeframes: int = 0
    disclaimer: str = (
        "Sugestão gerada a partir de indicadores técnicos reais, leitura independente da IA "
        "e (quando disponível) previsão estatística. Não é garantia de resultado — decisão final é sua."
    )


# --- Auth / admin --------------------------------------------------------

Role = Literal["admin", "user"]


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    id: int
    email: str
    role: Role
    is_active: bool
    next_due_date: date | None = None
    billing_period_days: int | None = None
    notes: str | None = None
    valor: float | None = None
    license_count: int = 1
    pending_approval: bool = False
    signup_ip: str | None = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: str
    password: str
    role: Role = "user"
    billing_period_days: int | None = None
    notes: str | None = None
    valor: float | None = None
    license_count: int = 1


class UserUpdate(BaseModel):
    password: str | None = None
    is_active: bool | None = None
    billing_period_days: int | None = None
    next_due_date: date | None = None
    clear_due_date: bool = False
    notes: str | None = None
    valor: float | None = None
    license_count: int | None = None


class RenewRequest(BaseModel):
    period_days: int | None = None


class RegisterRequest(BaseModel):
    email: str
    password: str
