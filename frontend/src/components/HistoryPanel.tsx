import { useEffect, useMemo, useState } from 'react'
import { FaInfoCircle, FaTrash } from 'react-icons/fa'
import { clearHistory, fetchHistory, type HistoryRecord } from '../api'
import ConfirmDialog from './ConfirmDialog'

const POLL_MS = 10000

const CONFIDENCE_FILTERS = [
  { value: 0, label: 'Todos' },
  { value: 60, label: '≥ 60%' },
  { value: 70, label: '≥ 70%' },
  { value: 80, label: '≥ 80%' },
  { value: 90, label: '≥ 90%' },
]

interface Props {
  onSelectRecord: (record: HistoryRecord) => void
}

export default function HistoryPanel({ onSelectRecord }: Props) {
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [minConfidence, setMinConfidence] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetchHistory(200)
        if (!cancelled) setRecords(res.records)
      } catch {
        // silencioso - histórico não é crítico para o fluxo principal
      }
    }

    load()
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const filtered = useMemo(() => records.filter((r) => r.confidence >= minConfidence), [records, minConfidence])

  async function doClear() {
    setConfirmClear(false)
    await clearHistory()
    setRecords([])
  }

  return (
    <div className="history-panel">
      <div className="history-header">
        <span>Log de previsões</span>
        {records.length > 0 && (
          <button type="button" className="history-clear-btn" onClick={() => setConfirmClear(true)} title="Apagar todo o histórico">
            <FaTrash /> Limpar
          </button>
        )}
      </div>

      <div className="history-filter">
        <label>Filtrar por confiança</label>
        <select value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))}>
          {CONFIDENCE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="history-empty">
          {records.length === 0
            ? 'Nenhuma previsão registrada ainda.'
            : 'Nenhum registro nesse filtro de confiança.'}
        </div>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Ativo</th>
                <th>Timeframe</th>
                <th>Direção</th>
                <th>Confiança</th>
                <th>Previsto em</th>
                <th>Vale até</th>
                <th>Preço previsto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.asset}</td>
                  <td>{r.timeframe}</td>
                  <td>
                    <span className={`mini-badge badge-${r.direction.toLowerCase()}`}>{r.direction}</span>
                  </td>
                  <td>{r.confidence}%</td>
                  <td>
                    {new Date(r.predicted_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    {new Date(r.target_time).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>{r.quant_predicted_price ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="history-info-btn"
                      onClick={() => onSelectRecord(r)}
                      title="Ver detalhes da análise"
                    >
                      <FaInfoCircle />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Limpar histórico"
          message={`Apagar todo o histórico (${records.length} registros)? Isso não pode ser desfeito.`}
          confirmLabel="Apagar"
          danger
          onConfirm={doClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  )
}
