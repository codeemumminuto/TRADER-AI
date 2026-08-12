import { useEffect, useState } from 'react'
import { fetchAssets, type AssetInfo, type RiskProfile } from '../api'

const TIMEFRAMES = ['1min', '5min', '15min']

const RISK_PROFILES: { key: RiskProfile; label: string }[] = [
  { key: 'calmo', label: 'Calmo' },
  { key: 'moderado', label: 'Moderado' },
  { key: 'volatil', label: 'Volátil' },
]

export interface AnalyzePair {
  asset: string
  timeframe: string
}

interface Props {
  onAnalyze: (pairs: AnalyzePair[], riskProfile: RiskProfile) => void
  selectedAssets: string[]
  onToggleAsset: (asset: string) => void
  minConfidence: number
  onMinConfidenceChange: (value: number) => void
  processingCount: number
  activeCount: number
  maxPairs: number
}

export default function AnalyzerForm({
  onAnalyze,
  selectedAssets,
  onToggleAsset,
  minConfidence,
  onMinConfidenceChange,
  processingCount,
  activeCount,
  maxPairs,
}: Props) {
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('calmo')
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(['5min'])
  const [assets, setAssets] = useState<AssetInfo[]>([])

  useEffect(() => {
    fetchAssets(riskProfile).then(setAssets)
  }, [riskProfile])

  function toggleTimeframe(tf: string) {
    setSelectedTimeframes((prev) => (prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]))
  }

  const pairs: AnalyzePair[] = selectedAssets.flatMap((asset) =>
    selectedTimeframes.map((timeframe) => ({ asset, timeframe })),
  )

  const remainingSlots = Math.max(0, maxPairs - activeCount)
  const exceedsLimit = pairs.length > remainingSlots

  return (
    <div className="analyzer-form">
      <div className="field">
        <label>Timeframes a monitorar</label>
        <div className="risk-toggle">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              className={selectedTimeframes.includes(tf) ? 'active' : ''}
              onClick={() => toggleTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Tipo de análise</label>
        <select disabled>
          <option>Análise Técnica Avançada</option>
        </select>
      </div>

      <div className="field">
        <label>Confiança mínima pra destacar uma previsão</label>
        <div className="min-confidence-field">
          <input
            type="number"
            min={0}
            max={100}
            step={5}
            value={minConfidence}
            onChange={(e) => onMinConfidenceChange(Math.max(0, Math.min(100, Number(e.target.value))))}
          />
          <span>%</span>
        </div>
      </div>

      <div className="field">
        <label>Perfil de mercado</label>
        <div className="risk-toggle">
          {RISK_PROFILES.map((rp) => (
            <button
              key={rp.key}
              type="button"
              className={riskProfile === rp.key ? 'active' : ''}
              onClick={() => setRiskProfile(rp.key)}
            >
              {rp.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Ativos a monitorar ({selectedAssets.length} selecionado{selectedAssets.length === 1 ? '' : 's'})</label>
        <div className="asset-grid">
          {assets.map((a) => (
            <button
              key={a.symbol}
              type="button"
              className={`asset-chip${selectedAssets.includes(a.symbol) ? ' active' : ''}`}
              onClick={() => onToggleAsset(a.symbol)}
            >
              {a.symbol}
            </button>
          ))}
        </div>
      </div>

      <p className="pairs-limit-hint">
        Monitorando {activeCount}/{maxPairs} pares — máximo permitido ao mesmo tempo.
      </p>

      <button
        type="button"
        className={`analyze-button${processingCount > 0 ? ' is-loading' : ''}`}
        disabled={pairs.length === 0 || exceedsLimit}
        onClick={() => onAnalyze(pairs, riskProfile)}
        title={exceedsLimit ? `Só cabe mais ${remainingSlots} par(es) — pare algum antes de adicionar outro.` : undefined}
      >
        {processingCount > 0
          ? `Monitorando... (${processingCount} na fila)`
          : exceedsLimit
            ? `Só cabe mais ${remainingSlots} par(es)`
            : pairs.length > 0
              ? `Monitorar (${pairs.length})`
              : 'Selecione ativo(s) e timeframe(s)'}
      </button>
    </div>
  )
}
