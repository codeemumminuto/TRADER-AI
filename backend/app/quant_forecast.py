"""Previsão quantitativa real via Chronos (Amazon) — modelo de séries temporais, não LLM.

Roda 100% local, sem chave de API nem custo. É a terceira "opinião" independente: enquanto
os indicadores são fórmulas clássicas de análise técnica e a IA lê padrões/contexto, o
Chronos é um modelo treinado especificamente para prever a continuação de séries numéricas,
devolvendo quantis (faixa de incerteza), não só um número.

Se o modelo não estiver disponível (falha ao carregar, poucos dados, etc.), retorna None e
o app segue funcionando normalmente só com indicadores + IA.
"""

MODEL_NAME = "amazon/chronos-bolt-tiny"
MIN_CONTEXT_POINTS = 30
HORIZON = 2  # candles à frente — cobre a janela entre a entrada e a expiração

_pipeline = None
_load_attempted = False


def _get_pipeline():
    global _pipeline, _load_attempted
    if _pipeline is not None or _load_attempted:
        return _pipeline

    _load_attempted = True
    try:
        import torch
        from chronos import BaseChronosPipeline

        _pipeline = BaseChronosPipeline.from_pretrained(
            MODEL_NAME,
            device_map="cpu",
            torch_dtype=torch.float32,
        )
    except Exception:
        _pipeline = None

    return _pipeline


def preload() -> None:
    """Carrega o modelo antecipadamente (chamado no startup do servidor) para que a
    primeira análise do usuário não pague o custo de carregamento (~15-20s)."""
    _get_pipeline()


def forecast(closes: list[float]) -> dict | None:
    pipeline = _get_pipeline()
    if pipeline is None or len(closes) < MIN_CONTEXT_POINTS:
        return None

    import torch

    context = torch.tensor(closes, dtype=torch.float32)

    try:
        quantiles, _ = pipeline.predict_quantiles(
            inputs=context, prediction_length=HORIZON, quantile_levels=[0.1, 0.5, 0.9]
        )
    except Exception:
        return None

    low, median, high = (float(v) for v in quantiles[0, -1, :])
    last_price = closes[-1]

    direction = "CALL" if median > last_price else "PUT"

    # Confiança: o quanto o movimento previsto (distância até a mediana) preenche a
    # faixa de incerteza do próprio modelo (10%-90%). Faixa estreita + movimento claro
    # na mesma direção = mais confiança; faixa larga ou movimento minúsculo = pouca.
    spread = max(high - low, 1e-9)
    change = abs(median - last_price)
    confidence = round(min(100, (change / spread) * 100))

    return {
        "direction": direction,
        "confidence": max(0, min(100, confidence)),
        "predicted_price": median,
    }
