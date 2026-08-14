// Preferência de quais níveis de impacto (1-3 touros) devem gerar o banner de alerta —
// local ao navegador, mesmo padrão de sounds.ts (mute) e do min-confidence.
const STORAGE_KEY = 'binai_news_alert_impacts'
const DEFAULT_IMPACTS = [1, 2, 3]

export function getAlertImpacts(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_IMPACTS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((n) => typeof n === 'number') ? parsed : DEFAULT_IMPACTS
  } catch {
    return DEFAULT_IMPACTS
  }
}

export function setAlertImpacts(impacts: number[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(impacts))
}
