import { useEffect, useRef, useState } from 'react'
import { FaBolt, FaChevronDown, FaChevronUp, FaInfoCircle } from 'react-icons/fa'
import CountdownRing from './CountdownRing'
import OpinionsRow from './OpinionsRow'
import ConfluencePanel from './ConfluencePanel'
import LiveChart from './LiveChart'
import type { AnalyzeResponse } from '../api'

interface Props {
  result: AnalyzeResponse
  highlighted: boolean
  onOpenDetail?: () => void
}

export default function ResultCard({ result, highlighted, onOpenDetail }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [showReasoning, setShowReasoning] = useState(false)
  const prevIdRef = useRef(result.id)

  useEffect(() => {
    if (prevIdRef.current !== result.id) {
      setShowReasoning(false)
      prevIdRef.current = result.id
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [result.id])

  const predictedAtMs = new Date(result.predicted_at).getTime()
  const targetMs = new Date(result.target_time).getTime()
  const totalSeconds = Math.max(1, Math.round((targetMs - predictedAtMs) / 1000))
  const remainingSeconds = Math.max(0, Math.round((targetMs - now) / 1000))
  const targetLabel = new Date(result.target_time).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const isHotSignal = result.confidence >= 85

  return (
    <div
      className={`result-card direction-${result.direction.toLowerCase()}${isHotSignal ? ' hot-signal' : ''}${highlighted ? ' result-highlighted' : ' result-compact'}`}
    >
      {isHotSignal && (
        <div className="hot-signal-banner">
          <span className="hot-signal-icon"><FaBolt /></span> SINAL FORTE — {result.confidence}% de confiança
        </div>
      )}

      <div className="result-header">
        <span className="result-asset">
          {result.asset} <span className="result-timeframe">{result.timeframe}</span>
        </span>
        <div className="result-header-actions">
          {highlighted ? (
            <span className={`result-badge badge-${result.direction.toLowerCase()}`}>{result.direction}</span>
          ) : (
            <span className="result-badge badge-pending">Analisando...</span>
          )}
          {onOpenDetail && (
            <button type="button" className="result-detail-button" onClick={onOpenDetail}>
              <FaInfoCircle /> ver confluências
            </button>
          )}
        </div>
      </div>

      <CountdownRing
        confidence={result.confidence}
        totalSeconds={totalSeconds}
        remainingSeconds={remainingSeconds}
        direction={result.direction}
        size={highlighted ? 160 : 90}
      />

      {result.quant_predicted_price != null ? (
        <div className="prediction-target">
          Previsão: <strong>{result.quant_predicted_price}</strong> até {targetLabel}
          {remainingSeconds > 0 ? ` (${remainingSeconds}s)` : ' — janela encerrada'}
        </div>
      ) : (
        <div className="prediction-target">Válida até {targetLabel}</div>
      )}

      <OpinionsRow
        indicatorDirection={result.indicator_direction}
        indicatorConfidence={result.indicator_confidence}
        aiDirection={result.ai_direction}
        aiConfidence={result.ai_confidence}
        quantDirection={result.quant_direction}
        quantConfidence={result.quant_confidence}
      />

      {result.ai_patterns.length > 0 && (
        <div className="ai-patterns">
          {result.ai_patterns.map((p, i) => (
            <span key={i} className="pattern-tag">
              {p}
            </span>
          ))}
        </div>
      )}

      <LiveChart
        asset={result.asset}
        timeframe={result.timeframe}
        direction={result.direction}
        predictedAt={result.predicted_at}
        targetTime={result.target_time}
        predictedPrice={result.quant_predicted_price}
        compact={!highlighted}
      />

      {highlighted && (
        <>
          <div className="consensus-note">
            {result.unanimous ? 'As leituras disponíveis concordam' : `${result.agreement} leituras concordam com a direção final`}{' '}
            — a confiança final é a média entre as que concordam.
          </div>

          {result.total_context_timeframes > 0 && (
            <div className="mtf-inline-stat">
              {result.aligned_timeframes}/{result.total_context_timeframes} timeframes maiores alinhados
            </div>
          )}

          <button type="button" className="reasoning-toggle" onClick={() => setShowReasoning((v) => !v)}>
            {showReasoning ? <FaChevronUp /> : <FaChevronDown />}
            {showReasoning ? 'Ocultar racional completo' : 'Ver racional completo'}
          </button>

          {showReasoning && (
            <ul className="reasoning-list">
              {result.reasoning.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}

          <ConfluencePanel
            indicators={result.indicators}
            score={result.confluence_score}
            timeframeReadings={result.timeframe_readings}
            alignedTimeframes={result.aligned_timeframes}
            totalContextTimeframes={result.total_context_timeframes}
          />

          <p className="disclaimer">{result.disclaimer}</p>
        </>
      )}
    </div>
  )
}
