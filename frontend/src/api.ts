const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export type RiskProfile = 'calmo' | 'moderado' | 'volatil'
export type Direction = 'CALL' | 'PUT'
export type DirectionOrNeutral = 'CALL' | 'PUT' | 'NEUTRO'

export interface AssetInfo {
  symbol: string
  category: 'cripto' | 'forex'
  provider: 'binance' | 'twelvedata'
  risk: string[]
}

export interface IndicatorResult {
  name: string
  value: number
  bias: 'alta' | 'baixa' | 'neutro'
  label: string
}

export interface TimeframeReading {
  timeframe: string
  role: 'entrada' | 'contexto'
  direction: 'CALL' | 'PUT' | 'NEUTRO'
  score: number
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export async function fetchCandles(asset: string, timeframe: string, limit = 60): Promise<Candle[]> {
  const params = new URLSearchParams({ asset, timeframe, limit: String(limit) })
  const data = await fetch(`${API_BASE}/candles?${params}`).then((r) => handle<{ candles: Candle[] }>(r))
  return data.candles
}

// Uma previsão: feita em predicted_at, vale até target_time. Não simula resultado — é só o
// que o sistema previu, com o preço-alvo da estatística quando disponível.
export interface AnalyzeResponse {
  id: string
  asset: string
  timeframe: string
  direction: Direction
  confidence: number
  agreement: string
  unanimous: boolean

  predicted_at: string
  target_time: string

  confluence_score: number
  indicator_direction: DirectionOrNeutral
  indicator_confidence: number

  ai_direction: Direction | null
  ai_confidence: number | null
  ai_patterns: string[]

  quant_direction: DirectionOrNeutral | null
  quant_confidence: number | null
  quant_predicted_price: number | null

  reasoning: string[]
  indicators: IndicatorResult[]
  timeframe_readings: TimeframeReading[]
  aligned_timeframes: number
  total_context_timeframes: number
  disclaimer: string
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Erro ${res.status}`)
  }
  return res.json()
}

export function fetchAssets(riskProfile?: RiskProfile): Promise<AssetInfo[]> {
  const qs = riskProfile ? `?risk_profile=${riskProfile}` : ''
  return fetch(`${API_BASE}/assets${qs}`).then((r) => handle(r))
}

export function fetchTimeframes(): Promise<string[]> {
  return fetch(`${API_BASE}/timeframes`).then((r) => handle(r))
}

export function analyze(asset: string, timeframe: string, riskProfile: RiskProfile): Promise<AnalyzeResponse> {
  return fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset, timeframe, risk_profile: riskProfile }),
  }).then((r) => handle(r))
}

export interface HistoryRecord {
  id: string
  asset: string
  timeframe: string
  direction: Direction
  confidence: number
  agreement?: string
  unanimous?: boolean
  confluence_score: number
  predicted_at: string
  target_time: string
  indicator_direction?: DirectionOrNeutral
  indicator_confidence?: number
  ai_direction?: Direction | null
  ai_confidence?: number | null
  ai_patterns?: string[]
  quant_direction?: DirectionOrNeutral | null
  quant_confidence?: number | null
  quant_predicted_price?: number | null
  reasoning?: string[]
  indicators?: IndicatorResult[]
  timeframe_readings?: TimeframeReading[]
  aligned_timeframes?: number
  total_context_timeframes?: number
}

export interface HistoryResponse {
  records: HistoryRecord[]
}

const DEFAULT_DISCLAIMER =
  'Sugestão gerada a partir de indicadores técnicos reais, leitura independente da IA ' +
  'e (quando disponível) previsão estatística. Não é garantia de resultado — decisão final é sua.'

/** Reconstrói um AnalyzeResponse a partir de um registro do histórico — usado pra recuperar
 * o que estava sendo monitorado quando a página recarrega e o estado em memória se perde. */
export function historyRecordToResult(r: HistoryRecord): AnalyzeResponse {
  return {
    id: r.id,
    asset: r.asset,
    timeframe: r.timeframe,
    direction: r.direction,
    confidence: r.confidence,
    agreement: r.agreement ?? '—',
    unanimous: r.unanimous ?? false,
    predicted_at: r.predicted_at,
    target_time: r.target_time,
    confluence_score: r.confluence_score,
    indicator_direction: r.indicator_direction ?? 'NEUTRO',
    indicator_confidence: r.indicator_confidence ?? 0,
    ai_direction: r.ai_direction ?? null,
    ai_confidence: r.ai_confidence ?? null,
    ai_patterns: r.ai_patterns ?? [],
    quant_direction: r.quant_direction ?? null,
    quant_confidence: r.quant_confidence ?? null,
    quant_predicted_price: r.quant_predicted_price ?? null,
    reasoning: r.reasoning ?? [],
    indicators: r.indicators ?? [],
    timeframe_readings: r.timeframe_readings ?? [],
    aligned_timeframes: r.aligned_timeframes ?? 0,
    total_context_timeframes: r.total_context_timeframes ?? 0,
    disclaimer: DEFAULT_DISCLAIMER,
  }
}

export function fetchHistory(limit = 50): Promise<HistoryResponse> {
  return fetch(`${API_BASE}/history?limit=${limit}`).then((r) => handle(r))
}

export function clearHistory(): Promise<{ cleared: boolean }> {
  return fetch(`${API_BASE}/history`, { method: 'DELETE' }).then((r) => handle(r))
}
