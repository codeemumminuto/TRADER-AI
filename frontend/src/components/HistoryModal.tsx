import { useState } from 'react'
import { FaTimes } from 'react-icons/fa'
import HistoryPanel from './HistoryPanel'
import HistoryDetail from './HistoryDetail'
import { useLockBodyScroll } from '../hooks/useLockBodyScroll'
import type { HistoryRecord } from '../api'

interface Props {
  onClose: () => void
}

export default function HistoryModal({ onClose }: Props) {
  useLockBodyScroll()
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        {selectedRecord ? (
          <HistoryDetail record={selectedRecord} onBack={() => setSelectedRecord(null)} />
        ) : (
          <>
            <div className="modal-header">
              <span className="result-asset">Histórico de acertos/erros</span>
              <button type="button" className="modal-close" onClick={onClose}>
                <FaTimes />
              </button>
            </div>
            <HistoryPanel onSelectRecord={setSelectedRecord} />
          </>
        )}
      </div>
    </div>
  )
}
