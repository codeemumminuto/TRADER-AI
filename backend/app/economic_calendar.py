"""Calendário econômico — usa o feed público (não-oficial, mas estável e usado por muitos
robôs/indicadores há anos) do Forex Factory. Sem chave, porém com rate limit ativo — por isso
o cache aqui é compartilhado entre TODOS os usuários com TTL generoso; nem o modal de
calendário nem o polling do banner de alerta devem gerar uma chamada nova a cada usuário."""

import time

import httpx

FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
_CACHE_TTL_SECONDS = 30 * 60

_cache: tuple[float, list[dict]] | None = None

# O feed usa Low/Medium/High/Holiday — mapeado pra "quantos touros" (0-3), que é a escala que
# o usuário já reconhece de calendários como o do Investing.com.
_IMPACT_TO_BULLS = {"Low": 1, "Medium": 2, "High": 3, "Holiday": 0}


class EconomicCalendarError(RuntimeError):
    pass


def _normalize(raw: list[dict]) -> list[dict]:
    events = []
    for e in raw:
        events.append({
            "title": e.get("title") or "",
            "country": e.get("country") or "",
            "date": e.get("date"),
            "impact": _IMPACT_TO_BULLS.get(e.get("impact"), 0),
            "forecast": e.get("forecast") or None,
            "previous": e.get("previous") or None,
            "actual": e.get("actual") or None,
        })
    return events


async def get_events() -> list[dict]:
    global _cache
    now = time.monotonic()
    if _cache and (now - _cache[0]) < _CACHE_TTL_SECONDS:
        return _cache[1]

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(FEED_URL, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            raw = resp.json()
    except Exception as exc:
        if _cache:
            # Rate limit ou instabilidade do feed — melhor servir o cache vencido do que quebrar.
            return _cache[1]
        raise EconomicCalendarError(f"Falha ao buscar calendário econômico: {exc}") from exc

    events = _normalize(raw)
    _cache = (now, events)
    return events
