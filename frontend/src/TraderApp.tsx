import { useEffect, useRef, useState } from 'react'
import { FaHistory, FaKey, FaRedo, FaSignOutAlt, FaTimes } from 'react-icons/fa'
import AnalyzerForm, { type AnalyzePair } from './components/AnalyzerForm'
import ResultCard from './components/ResultCard'
import HistoryModal from './components/HistoryModal'
import AnalysisModal from './components/AnalysisModal'
import ChangePasswordModal from './components/ChangePasswordModal'
import Footer from './components/Footer'
import SoundToggle from './components/SoundToggle'
import logo from './assets/logo.png'
import {
  analyze,
  fetchAssets,
  fetchHistory,
  historyRecordToResult,
  type AnalyzeResponse,
  type AssetInfo,
  type CurrentUser,
  type RiskProfile,
} from './api'
import { watchKey, type WatchEntry, type WatchStatus } from './watchTypes'
import { playSignal } from './sounds'
import './App.css'

const WATCH_KEYS_STORAGE_KEY = 'binai_watched_keys_v1'

// Ordem fixa de exibição dos cards — por timeframe (M1, M5, M15...) e depois por ativo, nunca
// por confiança: reordenar a cada análise nova é o que deixava a tela "pulando" e confusa.
const TIMEFRAME_ORDER = ['1min', '5min', '15min', '30min', '1h', '4h']

function timeframeRank(timeframe: string): number {
  const idx = TIMEFRAME_ORDER.indexOf(timeframe)
  return idx === -1 ? TIMEFRAME_ORDER.length : idx
}

const STATUS_LABEL: Record<WatchStatus, string> = {
  queued: 'Na fila',
  running: 'Analisando...',
  done: 'Monitorando',
  error: 'Erro',
  stopped: 'Parado',
}

// Lê o mapa de entradas persistidas entre sessões (key -> ativa ou parada) — usado pra saber,
// ao recarregar a página, quais análises o usuário realmente quer de volta e em qual estado
// (em vez de reconstruir TUDO que existe no histórico, o que trazia de volta ativos já
// removidos, e sempre reativava o monitoramento contínuo mesmo pra quem tinha sido parado).
// `known=false` só na primeira vez que o app roda com essa persistência (localStorage nunca
// setado) — nesse caso cai no comportamento antigo (reidrata tudo como ativo).
function loadTrackedKeys(): { map: Record<string, boolean>; known: boolean } {
  try {
    const raw = localStorage.getItem(WATCH_KEYS_STORAGE_KEY)
    if (raw === null) return { map: {}, known: false }
    return { map: JSON.parse(raw), known: true }
  } catch {
    return { map: {}, known: false }
  }
}

interface RunParams {
  asset: string
  timeframe: string
  riskProfile: RiskProfile
  periodicityMs: number
}

interface Props {
  user: CurrentUser
  onLogout: () => void
}

function TraderApp({ user, onLogout }: Props) {
  const [selectedAssets, setSelectedAssets] = useState<string[]>([])
  const [watchlist, setWatchlist] = useState<WatchEntry[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [minConfidence, setMinConfidence] = useState(70)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [changePasswordOpen, setChangePasswordOpen] = useState(false)
  const [detailEntry, setDetailEntry] = useState<{ asset: string; result: AnalyzeResponse } | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  const trackedKeysRef = useRef<{ map: Record<string, boolean>; known: boolean } | null>(null)
  if (trackedKeysRef.current === null) trackedKeysRef.current = loadTrackedKeys()

  const queueRef = useRef<string[]>([])
  const processingRef = useRef(false)
  const inFlightRef = useRef<string | null>(null)
  const paramsRef = useRef<Record<string, RunParams>>({})
  const activeRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Record<string, number>>({})
  const minConfidenceRef = useRef(minConfidence)
  const lastAboveThresholdRef = useRef<Record<string, boolean>>({})
  const assetProviderRef = useRef<Record<string, AssetInfo['provider']>>({})

  // Frequência de reverificação automática: escalada pelo timeframe, e MUITO mais
  // conservadora pra forex (Twelve Data grátis compartilha um limite fixo de 8 req/min entre
  // todos os ativos forex monitorados — repetir rápido nesse provedor só empilha requisições
  // na fila e trava tudo). Cripto (Binance) não tem esse limite, então pode ser bem mais ágil.
  function timeframeMs(timeframe: string): number {
    switch (timeframe) {
      case '1min':
        return 60_000
      case '5min':
        return 300_000
      case '15min':
        return 900_000
      default:
        return 300_000
    }
  }

  function defaultPeriodicityMs(timeframe: string, asset: string): number {
    // Nunca reanalisa antes do fim da janela da previsão atual (predicted_at + timeframe) —
    // reconferir mais cedo não faz sentido, a previsão em curso ainda nem "venceu".
    const base = timeframeMs(timeframe)
    const provider = assetProviderRef.current[asset] ?? 'binance'
    if (provider === 'twelvedata') {
      // Forex: Twelve Data grátis compartilha um limite fixo de 8 req/min entre todos os
      // ativos monitorados — espaça ainda mais, por cima do mínimo do timeframe.
      switch (timeframe) {
        case '1min':
          return Math.max(base, 90_000)
        case '5min':
          return Math.max(base, 180_000)
        case '15min':
          return Math.max(base, 300_000)
        default:
          return Math.max(base, 180_000)
      }
    }
    return base
  }

  useEffect(() => {
    fetchAssets()
      .then((list) => {
        const map: Record<string, AssetInfo['provider']> = {}
        for (const a of list) map[a.symbol] = a.provider
        assetProviderRef.current = map
      })
      .catch(() => {})
  }, [])

  // Ticker de 1s só pra alimentar labels de "próxima verificação em Xs" e os contadores dos
  // cards — não afeta nenhuma lógica de agendamento real (essa continua nos timers dos refs).
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Persiste quais entradas (ativo+timeframe) estão na watchlist — é isso que permite saber,
  // ao recarregar a página, que uma entrada removida deve continuar removida (ver rehydrate).
  useEffect(() => {
    try {
      const map: Record<string, boolean> = {}
      for (const e of watchlist) map[e.key] = e.status !== 'stopped'
      localStorage.setItem(WATCH_KEYS_STORAGE_KEY, JSON.stringify(map))
    } catch {
      // localStorage indisponível (aba anônima etc.) — sem persistência, sem problema
    }
  }, [watchlist])

  useEffect(() => {
    minConfidenceRef.current = minConfidence
  }, [minConfidence])

  function upsertEntry(key: string, patch: Partial<WatchEntry>) {
    setWatchlist((prev) => {
      const idx = prev.findIndex((e) => e.key === key)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  function processQueue() {
    if (processingRef.current) return

    let key = queueRef.current.shift()
    while (key && !activeRef.current.has(key)) {
      // Foi removido/parado enquanto esperava na fila — descarta e segue pro próximo.
      key = queueRef.current.shift()
    }
    if (!key) return

    processingRef.current = true
    inFlightRef.current = key
    upsertEntry(key, { status: 'running', error: null })

    const params = paramsRef.current[key]

    analyze(params.asset, params.timeframe, params.riskProfile)
      .then((res) => {
        if (!activeRef.current.has(key)) return // parado enquanto a requisição estava em andamento
        upsertEntry(key, { status: 'done', result: res, error: null, lastRunAt: Date.now() })

        const aboveThreshold = res.confidence >= minConfidenceRef.current
        if (aboveThreshold && !lastAboveThresholdRef.current[key]) {
          playSignal()
        }
        lastAboveThresholdRef.current[key] = aboveThreshold
      })
      .catch((e) => {
        if (!activeRef.current.has(key)) return
        upsertEntry(key, {
          status: 'error',
          error: e instanceof Error ? e.message : 'Erro ao analisar',
          lastRunAt: Date.now(),
        })
      })
      .finally(() => {
        processingRef.current = false
        inFlightRef.current = null

        if (activeRef.current.has(key)) {
          scheduleNextRun(key, params.periodicityMs)
        }

        processQueue()
      })
  }

  function scheduleNextRun(key: string, delayMs: number) {
    const timerId = window.setTimeout(() => {
      if (!activeRef.current.has(key)) return
      enqueue(key)
    }, delayMs)
    timersRef.current[key] = timerId
  }

  function enqueue(key: string) {
    if (key === inFlightRef.current) return // já está rodando — não duplica
    if (!queueRef.current.includes(key)) {
      queueRef.current.push(key)
    }
    processQueue()
  }

  function clearTimer(key: string) {
    const timerId = timersRef.current[key]
    if (timerId) {
      window.clearTimeout(timerId)
      delete timersRef.current[key]
    }
  }

  function handleToggleAsset(asset: string) {
    setSelectedAssets((prev) => (prev.includes(asset) ? prev.filter((a) => a !== asset) : [...prev, asset]))
  }

  function handleAnalyze(pairs: AnalyzePair[], riskProfile: RiskProfile) {
    if (pairs.length === 0) return

    // Um par ativo (ativo+timeframe já sendo monitorado, não parado) é ignorado — clicar
    // "Monitorar" de novo nele não deve reiniciar o ciclo nem criar nada duplicado, só
    // continua o que já estava rodando.
    const withKey = pairs.map((p) => ({ ...p, key: watchKey(p.asset, p.timeframe) }))
    const alreadyActive = withKey.filter((p) => activeRef.current.has(p.key))
    const toRun = withKey.filter((p) => !activeRef.current.has(p.key))

    setFormError(
      alreadyActive.length > 0
        ? `Já monitorando: ${alreadyActive.map((p) => `${p.asset} (${p.timeframe})`).join(', ')}.`
        : null,
    )

    if (toRun.length === 0) return

    setWatchlist((prev) => {
      let next = [...prev]
      for (const { asset, timeframe, key } of toRun) {
        const periodicityMs = defaultPeriodicityMs(timeframe, asset)
        const idx = next.findIndex((e) => e.key === key)
        const base: WatchEntry = {
          key,
          asset,
          timeframe,
          riskProfile,
          periodicityMs,
          status: 'queued',
          result: idx !== -1 ? next[idx].result : null,
          error: null,
          lastRunAt: idx !== -1 ? next[idx].lastRunAt : null,
        }
        next = idx === -1 ? [...next, base] : next.map((e, i) => (i === idx ? base : e))
      }
      return next
    })

    for (const { asset, timeframe, key } of toRun) {
      paramsRef.current[key] = { asset, timeframe, riskProfile, periodicityMs: defaultPeriodicityMs(timeframe, asset) }
      activeRef.current.add(key)
      clearTimer(key)
      enqueue(key)
    }
  }

  function handleStop(key: string) {
    activeRef.current.delete(key)
    clearTimer(key)
    queueRef.current = queueRef.current.filter((k) => k !== key)
    upsertEntry(key, { status: 'stopped' })
  }

  function handleRemove(key: string) {
    handleStop(key)
    delete paramsRef.current[key]
    delete lastAboveThresholdRef.current[key]
    setWatchlist((prev) => prev.filter((e) => e.key !== key))
  }

  // Reconstrói a watchlist a partir do histórico ao montar — sem isso, um simples F5 (ou o
  // Fast Refresh do Vite resetando o estado do componente) faz o app "esquecer" qualquer
  // análise em andamento, mesmo com o backend continuando a processá-la normalmente.
  useEffect(() => {
    let cancelled = false

    async function rehydrate() {
      try {
        const res = await fetchHistory(100)
        if (cancelled) return

        const tracked = trackedKeysRef.current!

        const latestByKey = new Map<string, (typeof res.records)[number]>()
        for (const r of res.records) {
          // res.records já vem ordenado do mais recente pro mais antigo — a primeira
          // ocorrência de cada ativo+timeframe é a mais recente.
          const key = watchKey(r.asset, r.timeframe)
          if (tracked.known && !(key in tracked.map)) continue // removido explicitamente — não volta
          if (!latestByKey.has(key)) latestByKey.set(key, r)
        }
        if (latestByKey.size === 0) return

        const entries: WatchEntry[] = []
        for (const [key, r] of latestByKey) {
          const result = historyRecordToResult(r)
          const periodicityMs = defaultPeriodicityMs(r.timeframe, r.asset)
          const lastRunAt = new Date(r.predicted_at).getTime()
          // Se não sabemos (primeira vez com essa persistência) ou o mapa diz que estava
          // ativo, retoma o monitoramento contínuo de verdade — sem isso, qualquer refresh
          // simplesmente CONGELAVA a entrada num resultado antigo pra sempre.
          const isActive = !tracked.known || tracked.map[key] !== false
          entries.push({
            key,
            asset: r.asset,
            timeframe: r.timeframe,
            riskProfile: 'moderado',
            periodicityMs,
            status: isActive ? 'done' : 'stopped',
            result,
            error: null,
            lastRunAt,
          })
          paramsRef.current[key] = { asset: r.asset, timeframe: r.timeframe, riskProfile: 'moderado', periodicityMs }
          lastAboveThresholdRef.current[key] = r.confidence >= minConfidenceRef.current

          if (isActive) {
            activeRef.current.add(key)
            clearTimer(key)
            const elapsed = Date.now() - lastRunAt
            scheduleNextRun(key, Math.max(0, periodicityMs - elapsed))
          }
        }

        if (cancelled) return
        setWatchlist(entries)
      } catch {
        // silencioso — se o histórico não responder, o app só começa vazio mesmo
      }
    }

    rehydrate()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Destaca (card grande, com gráfico) quem bate a confiança mínima ATUAL — recalculado a
  // cada render, reage na hora se o slider mudar, sem precisar de uma análise nova.
  function isHighlighted(result: AnalyzeResponse | null): boolean {
    return !!result && result.confidence >= minConfidence
  }

  // Label "última verificação / próxima em Xs" pra deixar visível que o monitoramento
  // contínuo tá vivo mesmo quando não há nada novo pra mostrar.
  function nextCheckLabel(entry: WatchEntry): string | null {
    if (!entry.lastRunAt || entry.status === 'stopped') return null
    const lastLabel = new Date(entry.lastRunAt).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    if (entry.status === 'running') return `última verificação às ${lastLabel}`
    const remaining = Math.max(0, Math.round((entry.lastRunAt + entry.periodicityMs - nowTick) / 1000))
    return remaining > 0
      ? `última verificação às ${lastLabel} · próxima em ${remaining}s`
      : `última verificação às ${lastLabel} · verificando a qualquer momento`
  }

  const sorted = [...watchlist].sort((a, b) => {
    const tfDiff = timeframeRank(a.timeframe) - timeframeRank(b.timeframe)
    if (tfDiff !== 0) return tfDiff
    return a.asset.localeCompare(b.asset)
  })

  return (
    <div className="app-shell">
      <header className="app-header">
        <img src={logo} className="app-logo" alt="BinAI" />
        <div className="app-header-text">
          <h1>BinAI</h1>
          <p>Análise técnica em tempo real realizada por IA</p>
        </div>
        <div className="header-actions">
          <span className="header-user-email">{user.email}</span>
          <button type="button" className="history-trigger-button" onClick={() => setHistoryOpen(true)}>
            <FaHistory /> Histórico
          </button>
          <button type="button" className="history-trigger-button" onClick={() => setChangePasswordOpen(true)}>
            <FaKey /> Trocar senha
          </button>
          <button type="button" className="history-trigger-button" onClick={onLogout}>
            <FaSignOutAlt /> Sair
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="column-left">
          <AnalyzerForm
            onAnalyze={handleAnalyze}
            selectedAssets={selectedAssets}
            onToggleAsset={handleToggleAsset}
            minConfidence={minConfidence}
            onMinConfidenceChange={setMinConfidence}
            processingCount={watchlist.filter((e) => e.status === 'queued' || e.status === 'running').length}
          />
        </div>

        <div className="column-center">
          {formError && <div className="error-banner">{formError}</div>}

          {sorted.length === 0 ? (
            <div className="placeholder">
              Selecione um ou mais ativos e clique em "Monitorar". Cada previsão mostra direção,
              confiança, preço previsto e até quando ela vale — sem simular resultado.
            </div>
          ) : (
            <div className="watch-grid">
              {sorted.map((entry) => {
                const highlighted = isHighlighted(entry.result)
                return (
                  <div key={entry.key} className={`watch-item${highlighted ? ' watch-item-highlighted' : ''}`}>
                    {entry.result ? (
                      <>
                        {entry.status === 'running' && (
                          <div className="rechecking-banner">
                            <span className="status-dot dot-running" /> Verificando atualização...
                          </div>
                        )}
                        {entry.status === 'error' && entry.error && (
                          <div className="rechecking-banner rechecking-error">Erro na última verificação: {entry.error}</div>
                        )}
                        <ResultCard
                          result={entry.result}
                          highlighted={highlighted}
                          onOpenDetail={() => setDetailEntry({ asset: entry.asset, result: entry.result! })}
                        />
                        {nextCheckLabel(entry) && <div className="next-check-label">{nextCheckLabel(entry)}</div>}
                        <div className="main-controls">
                          {entry.status !== 'stopped' && (
                            <button type="button" className="secondary-stop" onClick={() => handleStop(entry.key)}>
                              <FaRedo /> parar monitoramento
                            </button>
                          )}
                          <button type="button" className="secondary-remove main-remove" onClick={() => handleRemove(entry.key)}>
                            <FaTimes /> remover
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="watch-placeholder">
                        <div className="secondary-top">
                          <span className="secondary-asset">
                            {entry.asset} <span className="secondary-timeframe">{entry.timeframe}</span>
                          </span>
                          <button type="button" className="secondary-remove" onClick={() => handleRemove(entry.key)} title="Remover">
                            <FaTimes />
                          </button>
                        </div>
                        <div className="secondary-status">
                          <span className={`status-dot dot-${entry.status === 'running' ? 'running' : 'queued'}`} />
                          {STATUS_LABEL[entry.status]}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {historyOpen && <HistoryModal onClose={() => setHistoryOpen(false)} />}
      {changePasswordOpen && <ChangePasswordModal onClose={() => setChangePasswordOpen(false)} />}
      {detailEntry && (
        <AnalysisModal asset={detailEntry.asset} result={detailEntry.result} onClose={() => setDetailEntry(null)} />
      )}

      <Footer />
      <SoundToggle />
    </div>
  )
}

export default TraderApp
