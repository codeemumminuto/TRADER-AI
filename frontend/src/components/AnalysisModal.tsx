import { FaTimes } from 'react-icons/fa'
import ConfluencePanel from './ConfluencePanel'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import type { AnalyzeResponse } from '../api'

interface Props {
  asset: string
  result: AnalyzeResponse
  onClose: () => void
}

export default function AnalysisModal({ asset, result, onClose }: Props) {
  useLockBodyScroll()

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="result-asset">Confluências — {asset}</span>
          <button type="button" className="modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <ConfluencePanel
          indicators={result.indicators}
          score={result.confluence_score}
          timeframeReadings={result.timeframe_readings}
          alignedTimeframes={result.aligned_timeframes}
          totalContextTimeframes={result.total_context_timeframes}
        />

        {result.reasoning.length > 0 && (
          <div className="modal-reasoning">
            <div className="modal-section-title">Análise detalhada</div>
            <ul className="reasoning-list">
              {result.reasoning.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
