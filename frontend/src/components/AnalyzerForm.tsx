import { useEffect, useState } from 'react'
import { fetchAssets, type AssetInfo, type RiskProfile } from '../api'

const TIMEFRAMES = ['1min', '5min', '15min']

// O perfil de risco não é mais escolhido pelo usuário (removemos as tabs Calmo/Moderado/
// Volátil pra mostrar todos os ativos de uma vez) — ainda é aceito pela API, então mandamos
// um valor fixo neutro.
const DEFAULT_RISK_PROFILE: RiskProfile = 'moderado'

const CATEGORY_LABEL: Record<string, string> = {
  cripto: 'Cripto',
  forex: 'Forex — mercado aberto',
  'forex-otc': 'Forex — OTC',
  commodities: 'Commodities — mercado aberto',
  'commodities-otc': 'Commodities — OTC',
}

// OTC é um atributo do símbolo, não uma categoria própria no backend — separa visualmente aqui
// pra não misturar pares de mercado aberto com OTC dentro do mesmo grupo "Forex".
function groupKey(asset: AssetInfo): string {
  return asset.symbol.includes('(OTC)') ? `${asset.category}-otc` : asset.category
}

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
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(['5min'])
  const [assets, setAssets] = useState<AssetInfo[]>([])

  useEffect(() => {
    fetchAssets().then(setAssets)
  }, [])

  function toggleTimeframe(tf: string) {
    setSelectedTimeframes((prev) => (prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]))
  }

  const pairs: AnalyzePair[] = selectedAssets.flatMap((asset) =>
    selectedTimeframes.map((timeframe) => ({ asset, timeframe })),
  )

  const remainingSlots = Math.max(0, maxPairs - activeCount)
  const exceedsLimit = pairs.length > remainingSlots

  const assetsByCategory = assets.reduce<Record<string, AssetInfo[]>>((acc, a) => {
    ;(acc[groupKey(a)] ??= []).push(a)
    return acc
  }, {})

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
        <label>
          Ativos a monitorar ({selectedAssets.length} selecionado{selectedAssets.length === 1 ? '' : 's'})
        </label>
        {Object.entries(assetsByCategory).map(([category, list]) => (
          <div key={category} className="asset-category">
            <span className="asset-category-label">{CATEGORY_LABEL[category] ?? category}</span>
            <div className="asset-grid">
              {list.map((a) => (
                <button
                  key={a.symbol}
                  type="button"
                  className={`asset-chip${selectedAssets.includes(a.symbol) ? ' active' : ''}`}
                  onClick={() => onToggleAsset(a.symbol)}
                >
                  {a.symbol.replace(' (OTC)', '')}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="pairs-limit-hint">
        Monitorando {activeCount}/{maxPairs} pares — máximo permitido ao mesmo tempo.
      </p>

      <button
        type="button"
        className={`analyze-button${processingCount > 0 ? ' is-loading' : ''}`}
        disabled={pairs.length === 0 || exceedsLimit}
        onClick={() => onAnalyze(pairs, DEFAULT_RISK_PROFILE)}
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
