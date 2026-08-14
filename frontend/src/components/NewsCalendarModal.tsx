import { useEffect, useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import { fetchNews, type EconomicEvent } from '../api'
import { getAlertImpacts, setAlertImpacts } from '../newsPrefs'

interface Props {
  onClose: () => void
}

const IMPACT_LEVELS = [1, 2, 3]

function bulls(impact: number): string {
  return impact > 0 ? '🐂'.repeat(impact) : '—'
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function todaysEvents(events: EconomicEvent[]): EconomicEvent[] {
  return events.filter((e) => isToday(e.date)).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export default function NewsCalendarModal({ onClose }: Props) {
  useLockBodyScroll()
  const [events, setEvents] = useState<EconomicEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [alertImpacts, setAlertImpactsState] = useState<number[]>(getAlertImpacts())

  useEffect(() => {
    fetchNews()
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar calendário'))
      .finally(() => setLoading(false))
  }, [])

  function toggleImpact(level: number) {
    const next = alertImpacts.includes(level) ? alertImpacts.filter((l) => l !== level) : [...alertImpacts, level]
    setAlertImpactsState(next)
    setAlertImpacts(next)
  }

  const today = todaysEvents(events)
  const todayLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="result-asset">Calendário econômico — hoje, {todayLabel}</span>
          <button type="button" className="modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="news-alert-settings">
          <span>Avisar no topo quando a força for:</span>
          {IMPACT_LEVELS.map((level) => (
            <label key={level} className="news-alert-checkbox">
              <input type="checkbox" checked={alertImpacts.includes(level)} onChange={() => toggleImpact(level)} />
              {bulls(level)}
            </label>
          ))}
        </div>

        {loading && <div className="placeholder">Carregando calendário...</div>}
        {error && <div className="error-banner">{error}</div>}

        {!loading && !error && (
          <div className="news-day-list">
            {today.length === 0 ? (
              <div className="history-empty">Nenhuma notícia hoje.</div>
            ) : (
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Moeda</th>
                    <th>Evento</th>
                    <th>Força</th>
                    <th>Anterior</th>
                    <th>Previsto</th>
                    <th>Atual</th>
                  </tr>
                </thead>
                <tbody>
                  {today.map((e, i) => (
                    <tr key={i}>
                      <td>{new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{e.country}</td>
                      <td>{e.title}</td>
                      <td>{bulls(e.impact)}</td>
                      <td>{e.previous ?? '—'}</td>
                      <td>{e.forecast ?? '—'}</td>
                      <td>{e.actual ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
