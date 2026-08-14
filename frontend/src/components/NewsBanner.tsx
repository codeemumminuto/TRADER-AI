import { useEffect, useState } from 'react'
import { FaExclamationTriangle } from 'react-icons/fa'
import { fetchNews, type EconomicEvent } from '../api'
import { getAlertImpacts } from '../newsPrefs'

// Janela em torno do horário da notícia em que ela é considerada "acontecendo agora" — o
// mercado costuma ficar volátil um pouco antes (ansiedade) e continua depois (reação ao dado).
const ACTIVE_BEFORE_MS = 10 * 60_000
const ACTIVE_AFTER_MS = 30 * 60_000
const REFRESH_MS = 5 * 60_000
const TICK_MS = 30_000

function bulls(impact: number): string {
  return '🐂'.repeat(impact)
}

export default function NewsBanner() {
  const [events, setEvents] = useState<EconomicEvent[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    function load() {
      fetchNews()
        .then(setEvents)
        .catch(() => {
          /* silencioso — o banner simplesmente não aparece se o calendário falhar */
        })
    }
    load()
    const refreshTimer = window.setInterval(load, REFRESH_MS)
    const tickTimer = window.setInterval(() => setNow(Date.now()), TICK_MS)
    return () => {
      window.clearInterval(refreshTimer)
      window.clearInterval(tickTimer)
    }
  }, [])

  const alertImpacts = getAlertImpacts()
  const active = events.filter((e) => {
    if (!alertImpacts.includes(e.impact)) return false
    const eventTime = new Date(e.date).getTime()
    return now >= eventTime - ACTIVE_BEFORE_MS && now <= eventTime + ACTIVE_AFTER_MS
  })

  if (active.length === 0) return null

  return (
    <div className="news-banner">
      <FaExclamationTriangle />
      <div className="news-banner-list">
        {active.map((e, i) => (
          <span key={i} className="news-banner-item">
            {bulls(e.impact)} <strong>{e.country}</strong> {e.title} —{' '}
            {new Date(e.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        ))}
      </div>
    </div>
  )
}
