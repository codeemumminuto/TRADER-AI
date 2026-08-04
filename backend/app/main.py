import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import candle_patterns, history, market_data, quant_forecast
from app.assets import CONTEXT_TIMEFRAMES, TIMEFRAMES, assets_for_risk, find_asset
from app.config import settings
from app.confluence import blend_timeframes, compute_confluence
from app.consensus import compute_final
from app.indicators import compute_indicators
from app.market_data import UnknownAssetError
from app.providers.binance import BinanceError
from app.providers.twelvedata import TwelveDataError
from app.schemas import (
    AIAnalysis,
    AnalyzeRequest,
    AnalyzeResponse,
    AssetInfo,
    Candle,
    CandlesResponse,
    IndicatorResult,
    TimeframeReading,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(quant_forecast.preload)
    yield


app = FastAPI(title="Trader AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/assets", response_model=list[AssetInfo])
def get_assets(risk_profile: str | None = None):
    return assets_for_risk(risk_profile)


@app.get("/timeframes")
def get_timeframes():
    return list(TIMEFRAMES.keys())


@app.get("/candles", response_model=CandlesResponse)
async def get_candles(asset: str, timeframe: str = "1min", limit: int = 150):
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
async def analyze(req: AnalyzeRequest):
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

    history.add_record({
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
def get_history(limit: int = 50):
    records = history.load_all()
    records_sorted = sorted(records, key=lambda r: r["predicted_at"], reverse=True)
    return {"records": records_sorted[:limit]}


@app.delete("/history")
def clear_history():
    history.clear_all()
    return {"cleared": True}


# Em produção, serve o build estático do frontend a partir do mesmo processo/porta da API —
# mesma origem, sem CORS pra configurar. Rotas de API acima são checadas primeiro; qualquer
# caminho que não bater com elas cai aqui. Em dev local não existe frontend/dist (usa-se
# `npm run dev` à parte), então isso simplesmente não monta nada.
_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="frontend")
