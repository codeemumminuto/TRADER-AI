const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export type RiskProfile = 'calmo' | 'moderado' | 'volatil'
export type Direction = 'CALL' | 'PUT'
export type DirectionOrNeutral = 'CALL' | 'PUT' | 'NEUTRO'
export type Role = 'admin' | 'user'

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

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Erro ${res.status}`)
  }
  return res.json()
}

// Todo request inclui cookies (sessão de login é um cookie httpOnly, não token no header).
function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, { ...init, credentials: 'include' })
}

export async function fetchCandles(asset: string, timeframe: string, limit = 60): Promise<Candle[]> {
  const params = new URLSearchParams({ asset, timeframe, limit: String(limit) })
  const data = await apiFetch(`/candles?${params}`).then((r) => handle<{ candles: Candle[] }>(r))
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

export function fetchAssets(riskProfile?: RiskProfile): Promise<AssetInfo[]> {
  const qs = riskProfile ? `?risk_profile=${riskProfile}` : ''
  return apiFetch(`/assets${qs}`).then((r) => handle(r))
}

export function fetchTimeframes(): Promise<string[]> {
  return apiFetch('/timeframes').then((r) => handle(r))
}

export function analyze(asset: string, timeframe: string, riskProfile: RiskProfile): Promise<AnalyzeResponse> {
  return apiFetch('/analyze', {
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
  return apiFetch(`/history?limit=${limit}`).then((r) => handle(r))
}

export function clearHistory(): Promise<{ cleared: boolean }> {
  return apiFetch('/history', { method: 'DELETE' }).then((r) => handle(r))
}

// --- Auth / admin ----------------------------------------------------------

export interface CurrentUser {
  id: number
  email: string
  role: Role
  is_active: boolean
  next_due_date: string | null
  billing_period_days: number | null
  notes: string | null
}

export function login(email: string, password: string): Promise<CurrentUser> {
  return apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => handle(r))
}

export function logout(): Promise<{ logged_out: boolean }> {
  return apiFetch('/auth/logout', { method: 'POST' }).then((r) => handle(r))
}

export function fetchMe(): Promise<CurrentUser | null> {
  return apiFetch('/auth/me').then((r) => (r.status === 401 ? null : handle<CurrentUser>(r)))
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ changed: boolean }> {
  return apiFetch('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  }).then((r) => handle(r))
}

export function fetchUsers(): Promise<CurrentUser[]> {
  return apiFetch('/admin/users').then((r) => handle(r))
}

export function createUser(
  email: string,
  password: string,
  role: Role = 'user',
  billingPeriodDays?: number | null,
  notes?: string | null,
): Promise<CurrentUser> {
  return apiFetch('/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role, billing_period_days: billingPeriodDays ?? null, notes: notes ?? null }),
  }).then((r) => handle(r))
}

export function updateUser(
  id: number,
  patch: {
    password?: string
    is_active?: boolean
    billing_period_days?: number | null
    next_due_date?: string | null
    clear_due_date?: boolean
    notes?: string
  },
): Promise<CurrentUser> {
  return apiFetch(`/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => handle(r))
}

export function renewUser(id: number, periodDays?: number): Promise<CurrentUser> {
  return apiFetch(`/admin/users/${id}/renew`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ period_days: periodDays ?? null }),
  }).then((r) => handle(r))
}

export function deleteUser(id: number): Promise<{ deleted: boolean }> {
  return apiFetch(`/admin/users/${id}`, { method: 'DELETE' }).then((r) => handle(r))
}

export interface AllowedIp {
  id: number
  ip_or_cidr: string
  pending: boolean
}

export function fetchAllowedIps(userId: number): Promise<AllowedIp[]> {
  return apiFetch(`/admin/users/${userId}/ips`).then((r) => handle(r))
}

export function addAllowedIp(userId: number, ipOrCidr: string): Promise<AllowedIp> {
  return apiFetch(`/admin/users/${userId}/ips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip_or_cidr: ipOrCidr }),
  }).then((r) => handle(r))
}

export function removeAllowedIp(userId: number, ipId: number): Promise<{ deleted: boolean }> {
  return apiFetch(`/admin/users/${userId}/ips/${ipId}`, { method: 'DELETE' }).then((r) => handle(r))
}

export function approveAllowedIp(userId: number, ipId: number): Promise<AllowedIp> {
  return apiFetch(`/admin/users/${userId}/ips/${ipId}/approve`, { method: 'POST' }).then((r) => handle(r))
}

export interface PendingIp {
  id: number
  user_id: number
  email: string
  ip_or_cidr: string
  requested_at: string
}

export function fetchPendingIps(): Promise<PendingIp[]> {
  return apiFetch('/admin/pending-ips').then((r) => handle(r))
}
