import { FaArrowLeft } from 'react-icons/fa'
import ConfluencePanel from './ConfluencePanel'
import OpinionsRow from './OpinionsRow'
import type { HistoryRecord } from '../api'

interface Props {
  record: HistoryRecord
  onBack: () => void
}

export default function HistoryDetail({ record, onBack }: Props) {
  const hasDetails = !!record.indicators?.length

  return (
    <div>
      <div className="modal-header">
        <button type="button" className="modal-back" onClick={onBack}>
          <FaArrowLeft /> Voltar
        </button>
        <div>
          <span className="result-asset">{record.asset}</span>{' '}
          <span className={`result-badge badge-${record.direction.toLowerCase()}`}>{record.direction}</span>
        </div>
      </div>

      <div className="modal-meta">
        <div>
          <span className="modal-meta-label">Timeframe</span>
          <span>{record.timeframe}</span>
        </div>
        <div>
          <span className="modal-meta-label">Confiança</span>
          <span>{record.confidence}%</span>
        </div>
        <div>
          <span className="modal-meta-label">Previsto em</span>
          <span>{new Date(record.predicted_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <div>
          <span className="modal-meta-label">Vale até</span>
          <span>{new Date(record.target_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <div>
          <span className="modal-meta-label">Preço previsto</span>
          <span>{record.quant_predicted_price ?? '—'}</span>
        </div>
      </div>

      {record.ai_direction && (
        <OpinionsRow
          indicatorDirection={record.indicator_direction}
          indicatorConfidence={record.indicator_confidence}
          aiDirection={record.ai_direction}
          aiConfidence={record.ai_confidence}
          quantDirection={record.quant_direction}
          quantConfidence={record.quant_confidence}
        />
      )}

      {record.ai_patterns && record.ai_patterns.length > 0 && (
        <div className="ai-patterns">
          {record.ai_patterns.map((p, i) => (
            <span key={i} className="pattern-tag">
              {p}
            </span>
          ))}
        </div>
      )}

      {record.reasoning && record.reasoning.length > 0 && (
        <div className="modal-reasoning">
          <div className="modal-section-title">Raciocínio da IA no momento da análise</div>
          <ul className="reasoning-list">
            {record.reasoning.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {hasDetails ? (
        <ConfluencePanel
          indicators={record.indicators!}
          score={record.confluence_score}
          timeframeReadings={record.timeframe_readings ?? []}
          alignedTimeframes={record.aligned_timeframes ?? 0}
          totalContextTimeframes={record.total_context_timeframes ?? 0}
        />
      ) : (
        <div className="modal-no-details">
          Esta análise foi feita antes de o histórico passar a salvar os detalhes completos.
        </div>
      )}
    </div>
  )
}
