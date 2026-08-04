import type { IndicatorResult, TimeframeReading } from '../api'

const BIAS_LABEL: Record<string, string> = { alta: 'Alta', baixa: 'Baixa', neutro: 'Neutro' }

interface Props {
  indicators: IndicatorResult[]
  score: number
  timeframeReadings: TimeframeReading[]
  alignedTimeframes: number
  totalContextTimeframes: number
}

export default function ConfluencePanel({
  indicators,
  score,
  timeframeReadings,
  alignedTimeframes,
  totalContextTimeframes,
}: Props) {
  return (
    <div className="confluence-panel">
      <div className="confluence-header">
        <span>Confluências (cálculo real, não-IA)</span>
        <span className="confluence-score">Score: {score}/100</span>
      </div>
      <ul>
        {indicators.map((ind) => (
          <li key={ind.name} className={`bias-${ind.bias}`}>
            <div className="ind-text">
              <div className="ind-name">{ind.name}</div>
              <div className="ind-label">{ind.label}</div>
            </div>
            <span className="ind-tag">{BIAS_LABEL[ind.bias]}</span>
          </li>
        ))}
      </ul>

      {timeframeReadings.length > 1 && (
        <div className="mtf-section">
          <div className="mtf-header">
            <span>Alinhamento entre timeframes</span>
            {totalContextTimeframes > 0 && (
              <span className="mtf-ratio">
                {alignedTimeframes}/{totalContextTimeframes} maiores alinhados
              </span>
            )}
          </div>
          <div className="mtf-chips">
            {timeframeReadings.map((tf) => (
              <div key={tf.timeframe} className={`mtf-chip mtf-${tf.direction.toLowerCase()}`}>
                <span className="mtf-tf">{tf.timeframe}</span>
                <span className="mtf-role">{tf.role === 'entrada' ? 'entrada' : 'contexto'}</span>
                <span className="mtf-direction">{tf.direction}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
