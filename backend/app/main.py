import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session as DBSession

from app import auth, candle_patterns, history, market_data, quant_forecast
from app.assets import CONTEXT_TIMEFRAMES, TIMEFRAMES, assets_for_risk, find_asset
from app.auth import get_client_ip, get_current_user, require_admin
from app.config import settings
from app.confluence import blend_timeframes, compute_confluence
from app.consensus import compute_final
from app.db import SessionLocal, get_db, init_db
from app.indicators import compute_indicators
from app.market_data import UnknownAssetError
from app.models import AllowedIP, Session, User
from app.providers.binance import BinanceError
from app.providers.twelvedata import TwelveDataError
from app.schemas import (
    AIAnalysis,
    AllowedIPIn,
    AllowedIPOut,
    AnalyzeRequest,
    AnalyzeResponse,
    AssetInfo,
    Candle,
    CandlesResponse,
    ChangePasswordRequest,
    IndicatorResult,
    LoginRequest,
    PendingIpOut,
    RenewRequest,
    TimeframeReading,
    UserCreate,
    UserOut,
    UserUpdate,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = SessionLocal()
    try:
        auth.ensure_bootstrap_admin(db)
    finally:
        db.close()
    await asyncio.to_thread(quant_forecast.preload)
    yield


app = FastAPI(title="Trader AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


# --- Auth -----------------------------------------------------------------


@app.post("/auth/login", response_model=UserOut)
def login(req: LoginRequest, response: Response, request_ip: str = Depends(get_client_ip), db: DBSession = Depends(get_db)):
    user = auth.authenticate(req.email, req.password, request_ip, db)
    token = auth.create_session(user, request_ip, db)
    response.set_cookie(
        auth.COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        max_age=settings.session_ttl_hours * 3600,
    )
    return user


@app.post("/auth/logout")
def logout(
    response: Response,
    session_id: str | None = Cookie(default=None, alias=auth.COOKIE_NAME),
    db: DBSession = Depends(get_db),
):
    auth.destroy_session(session_id, db)
    response.delete_cookie(auth.COOKIE_NAME)
    return {"logged_out": True}


@app.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@app.post("/auth/change-password")
def change_password(
    req: ChangePasswordRequest,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not auth.verify_password(req.current_password, user.password_hash):
        raise HTTPException(400, "Senha atual incorreta.")
    user.password_hash = auth.hash_password(req.new_password)
    db.commit()
    return {"changed": True}


# --- Admin ------------------------------------------------------------------


@app.get("/admin/users", response_model=list[UserOut])
def list_users(db: DBSession = Depends(get_db), _admin: User = Depends(require_admin)):
    return db.query(User).order_by(User.created_at).all()


@app.post("/admin/users", response_model=UserOut)
def create_user(req: UserCreate, db: DBSession = Depends(get_db), _admin: User = Depends(require_admin)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(409, "Já existe um usuário com esse e-mail.")
    user = User(
        email=req.email,
        password_hash=auth.hash_password(req.password),
        role=req.role,
        billing_period_days=req.billing_period_days,
        next_due_date=date.today() + timedelta(days=req.billing_period_days) if req.billing_period_days else None,
        notes=req.notes,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.patch("/admin/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, req: UserUpdate, db: DBSession = Depends(get_db), _admin: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuário não encontrado.")
    if req.password is not None:
        user.password_hash = auth.hash_password(req.password)
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.billing_period_days is not None:
        user.billing_period_days = req.billing_period_days
    if req.clear_due_date:
        user.next_due_date = None
    elif req.next_due_date is not None:
        user.next_due_date = req.next_due_date
    if req.notes is not None:
        user.notes = req.notes
    db.commit()
    db.refresh(user)
    return user


@app.post("/admin/users/{user_id}/renew", response_model=UserOut)
def renew_user(user_id: int, req: RenewRequest, db: DBSession = Depends(get_db), _admin: User = Depends(require_admin)):
    """"Registrar pagamento" — empurra o vencimento pra frente em period_days, a partir do
    vencimento atual (se ainda não passou) ou de hoje (se já tinha vencido)."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuário não encontrado.")
    period = req.period_days or user.billing_period_days
    if not period:
        raise HTTPException(400, "Informe a periodicidade (em dias) — esse usuário ainda não tem uma configurada.")
    base = user.next_due_date if user.next_due_date and user.next_due_date >= date.today() else date.today()
    user.next_due_date = base + timedelta(days=period)
    user.billing_period_days = period
    db.commit()
    db.refresh(user)
    return user


@app.delete("/admin/users/{user_id}")
def delete_user(user_id: int, db: DBSession = Depends(get_db), admin: User = Depends(require_admin)):
    if user_id == admin.id:
        raise HTTPException(400, "Não dá pra apagar o próprio usuário admin logado.")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Usuário não encontrado.")
    db.query(Session).filter(Session.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return {"deleted": True}


@app.get("/admin/users/{user_id}/ips", response_model=list[AllowedIPOut])
def list_allowed_ips(user_id: int, db: DBSession = Depends(get_db), _admin: User = Depends(require_admin)):
    return db.query(AllowedIP).filter(AllowedIP.user_id == user_id).all()


@app.post("/admin/users/{user_id}/ips", response_model=AllowedIPOut)
def add_allowed_ip(user_id: int, req: AllowedIPIn, db: DBSession = Depends(get_db), _admin: User = Depends(require_admin)):
    if not db.get(User, user_id):
        raise HTTPException(404, "Usuário não encontrado.")
    entry = AllowedIP(user_id=user_id, ip_or_cidr=req.ip_or_cidr)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.delete("/admin/users/{user_id}/ips/{ip_id}")
def remove_allowed_ip(user_id: int, ip_id: int, db: DBSession = Depends(get_db), _admin: User = Depends(require_admin)):
    entry = db.get(AllowedIP, ip_id)
    if not entry or entry.user_id != user_id:
        raise HTTPException(404, "IP não encontrado pra esse usuário.")
    db.delete(entry)
    db.commit()
    return {"deleted": True}


@app.post("/admin/users/{user_id}/ips/{ip_id}/approve", response_model=AllowedIPOut)
def approve_allowed_ip(user_id: int, ip_id: int, db: DBSession = Depends(get_db), _admin: User = Depends(require_admin)):
    entry = db.get(AllowedIP, ip_id)
    if not entry or entry.user_id != user_id:
        raise HTTPException(404, "IP não encontrado pra esse usuário.")
    entry.pending = False
    db.commit()
    db.refresh(entry)
    return entry


@app.get("/admin/pending-ips", response_model=list[PendingIpOut])
def list_pending_ips(db: DBSession = Depends(get_db), _admin: User = Depends(require_admin)):
    rows = (
        db.query(AllowedIP, User.email)
        .join(User, User.id == AllowedIP.user_id)
        .filter(AllowedIP.pending.is_(True))
        .order_by(AllowedIP.created_at)
        .all()
    )
    return [
        PendingIpOut(id=ip.id, user_id=ip.user_id, email=email, ip_or_cidr=ip.ip_or_cidr, requested_at=ip.created_at)
        for ip, email in rows
    ]


# --- Mercado / análise --------------------------------------------------------


@app.get("/assets", response_model=list[AssetInfo])
def get_assets(risk_profile: str | None = None, _user: User = Depends(get_current_user)):
    return assets_for_risk(risk_profile)


@app.get("/timeframes")
def get_timeframes(_user: User = Depends(get_current_user)):
    return list(TIMEFRAMES.keys())


@app.get("/candles", response_model=CandlesResponse)
async def get_candles(asset: str, timeframe: str = "1min", limit: int = 150, _user: User = Depends(get_current_user)):
    if timeframe not in TIMEFRAMES:
        raise HTTPException(400, f"Timeframe inválido: {timeframe}")
    if find_asset(asset) is None:
        raise HTTPException(404, f"Ativo desconhecido: {asset}")

    try:
        df = await market_data.get_candles(asset, timeframe, limit)
    except (TwelveDataError, BinanceError) as exc:
        raise HTTPException(400, str(exc)) from exc

    candles = [Candle(**row) for row in df.to_dict(orient="records")]
    return CandlesResponse(asset=asset, timeframe=timeframe, candles=candles)


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    if req.timeframe not in TIMEFRAMES:
        raise HTTPException(400, f"Timeframe inválido: {req.timeframe}")
    if find_asset(req.asset) is None:
        raise HTTPException(404, f"Ativo desconhecido: {req.asset}")

    try:
        df = await market_data.get_candles(req.asset, req.timeframe, limit=150)
    except (TwelveDataError, BinanceError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except UnknownAssetError as exc:
        raise HTTPException(404, str(exc)) from exc

    if len(df) < 30:
        raise HTTPException(422, "Candles insuficientes para calcular os indicadores com confiança.")

    indicators = compute_indicators(df)
    entry_confluence = compute_confluence(indicators)

    context_readings = []
    for ctf in CONTEXT_TIMEFRAMES.get(req.timeframe, []):
        try:
            cdf = await market_data.get_candles(req.asset, ctf, limit=150)
        except (TwelveDataError, BinanceError, UnknownAssetError):
            continue
        if len(cdf) < 30:
            continue
        c_indicators = compute_indicators(cdf)
        c_confluence = compute_confluence(c_indicators)
        context_readings.append({
            "timeframe": ctf,
            "candles": cdf.tail(30).to_dict(orient="records"),
            **c_confluence,
        })

    overall = blend_timeframes(entry_confluence, context_readings)

    # Visão 1: indicadores (matemática pura, já calculada acima) — usa o score JÁ PENALIZADO
    # pela discordância dos timeframes maiores (overall), não o score cru de 1 timeframe só.
    indicator_direction = overall["direction"]
    indicator_confidence = overall["strength"]

    # Visão 2: IA — reconhecimento de padrão de candlestick por regra determinística de OHLC
    # (doji, engolfo, martelo, estrela cadente, estrela da manhã/noite, três soldados/corvos).
    # Instantâneo, sem LLM.
    pattern_result = candle_patterns.detect_patterns(df)
    ai_result = (
        AIAnalysis(
            direction=pattern_result["direction"],
            confidence=pattern_result["confidence"],
            patterns=pattern_result["patterns"],
            reasoning=[f"Padrões de candlestick identificados: {', '.join(pattern_result['patterns'])}."],
        )
        if pattern_result["direction"] is not None
        else None
    )

    # Visão 3: quant — previsão estatística real de série temporal (Chronos), quando disponível
    quant_result = quant_forecast.forecast(df["close"].tolist())

    final = compute_final(
        indicator_direction,
        indicator_confidence,
        ai_result.direction if ai_result else None,
        ai_result.confidence if ai_result else None,
        quant_result["direction"] if quant_result else None,
        quant_result["confidence"] if quant_result else None,
    )

    reasoning = (
        ai_result.reasoning
        if ai_result
        else [
            "Nenhum padrão de candlestick relevante identificado nesta janela — consenso "
            "calculado a partir de indicadores técnicos e previsão estatística."
        ]
    )

    now = datetime.now(timezone.utc)
    timeframe_seconds = TIMEFRAMES[req.timeframe]["seconds"]
    target_time = now + timedelta(seconds=timeframe_seconds)

    timeframe_readings_data = [
        {
            "timeframe": req.timeframe,
            "role": "entrada",
            "direction": entry_confluence["direction"],
            "score": entry_confluence["score"],
        },
        *[
            {"timeframe": c["timeframe"], "role": "contexto", "direction": c["direction"], "score": c["score"]}
            for c in context_readings
        ],
    ]

    record_id = str(uuid.uuid4())

    history.add_record(db, user.id, {
        "id": record_id,
        "asset": req.asset,
        "timeframe": req.timeframe,
        "direction": final["direction"],
        "confidence": final["confidence"],
        "agreement": final["agreement"],
        "unanimous": final["unanimous"],
        "confluence_score": overall["score"],
        "indicator_direction": indicator_direction,
        "indicator_confidence": indicator_confidence,
        "ai_direction": ai_result.direction if ai_result else None,
        "ai_confidence": ai_result.confidence if ai_result else None,
        "ai_patterns": ai_result.patterns if ai_result else [],
        "quant_direction": quant_result["direction"] if quant_result else None,
        "quant_confidence": quant_result["confidence"] if quant_result else None,
        "quant_predicted_price": quant_result["predicted_price"] if quant_result else None,
        "predicted_at": now.isoformat(),
        "target_time": target_time.isoformat(),
        "reasoning": reasoning,
        "indicators": indicators,
        "timeframe_readings": timeframe_readings_data,
        "aligned_timeframes": overall.get("aligned_timeframes", 0),
        "total_context_timeframes": overall.get("total_context_timeframes", 0),
    })

    timeframe_readings = [TimeframeReading(**t) for t in timeframe_readings_data]

    return AnalyzeResponse(
        id=record_id,
        asset=req.asset,
        timeframe=req.timeframe,
        direction=final["direction"],
        confidence=final["confidence"],
        agreement=final["agreement"],
        unanimous=final["unanimous"],
        predicted_at=now.isoformat(),
        target_time=target_time.isoformat(),
        confluence_score=overall["score"],
        indicator_direction=indicator_direction,
        indicator_confidence=indicator_confidence,
        ai_direction=ai_result.direction if ai_result else None,
        ai_confidence=ai_result.confidence if ai_result else None,
        ai_patterns=ai_result.patterns if ai_result else [],
        quant_direction=quant_result["direction"] if quant_result else None,
        quant_confidence=quant_result["confidence"] if quant_result else None,
        quant_predicted_price=quant_result["predicted_price"] if quant_result else None,
        reasoning=reasoning,
        indicators=[IndicatorResult(**i) for i in indicators],
        timeframe_readings=timeframe_readings,
        aligned_timeframes=overall.get("aligned_timeframes", 0),
        total_context_timeframes=overall.get("total_context_timeframes", 0),
    )


@app.get("/history")
def get_history(limit: int = 50, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    records = history.load_all(db, user.id)
    return {"records": records[:limit]}


@app.delete("/history")
def clear_history(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    history.clear_all(db, user.id)
    return {"cleared": True}


# Em produção, serve o build estático do frontend a partir do mesmo processo/porta da API —
# mesma origem, sem CORS pra configurar. Rotas de API acima são checadas primeiro; qualquer
# caminho que não bater com elas cai aqui. Em dev local não existe frontend/dist (usa-se
# `npm run dev` à parte), então isso simplesmente não monta nada.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
