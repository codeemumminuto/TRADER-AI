import type { AnalyzeResponse, RiskProfile } from './api'

export type WatchStatus = 'queued' | 'running' | 'done' | 'error' | 'stopped'

export interface WatchEntry {
  key: string
  asset: string
  timeframe: string
  riskProfile: RiskProfile
  periodicityMs: number
  status: WatchStatus
  result: AnalyzeResponse | null
  error: string | null
  lastRunAt: number | null
}

export function watchKey(asset: string, timeframe: string): string {
  return `${asset}__${timeframe}`
}
