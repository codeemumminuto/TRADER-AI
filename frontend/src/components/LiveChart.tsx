import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { fetchCandles, type Direction } from '../api'

const POLL_MS = 1500
const CANDLE_LIMIT = 60
const COMPACT_CANDLE_LIMIT = 4
const COMPACT_HEIGHT = 220
const FULL_HEIGHT = 220
const MAX_PRECISION = 8

interface Props {
  asset: string
  timeframe: string
  direction: Direction
  predictedAt: string
  targetTime: string
  predictedPrice?: number | null
  compact?: boolean
}

function decimalsOf(n: number): number {
  if (!Number.isFinite(n)) return 0
  const s = n.toString()
  if (s.includes('e')) return MAX_PRECISION // notação científica (número minúsculo) — usa o teto
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : Math.min(MAX_PRECISION, s.length - dot - 1)
}

export default function LiveChart({ asset, timeframe, direction, predictedAt, targetTime, predictedPrice, compact }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const predictedPriceRef = useRef(predictedPrice)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    predictedPriceRef.current = predictedPrice
  }, [predictedPrice])

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: compact ? COMPACT_HEIGHT : FULL_HEIGHT,
      layout: { background: { color: 'transparent' }, textColor: '#8a9690' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      timeScale: { timeVisible: true, secondsVisible: true },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      // No modo compacto (preview do card, sem destaque) é só um relance rápido — desliga a
      // interação pra não brigar com o scroll da página nem "prender" o zoom sem querer.
      handleScroll: !compact,
      handleScale: !compact,
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#6fdc1e',
      downColor: '#f87171',
      borderVisible: false,
      wickUpColor: '#6fdc1e',
      wickDownColor: '#f87171',
      // A série já desenha uma linha própria pro último preço, na mesma cor de alta/baixa —
      // como também temos a linha de "previsão", as duas ficavam sobrepostas e pareciam uma
      // linha duplicada da mesma cor. Desliga a linha nativa e mantém só a nossa.
      priceLineVisible: false,
      lastValueVisible: true,
    })

    chartRef.current = chart
    seriesRef.current = series

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [compact])

  useEffect(() => {
    if (!seriesRef.current || predictedPrice == null) return
    const line = seriesRef.current.createPriceLine({
      price: predictedPrice,
      color: direction === 'CALL' ? '#6fdc1e' : '#f87171',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'previsão',
    })
    return () => {
      seriesRef.current?.removePriceLine(line)
    }
  }, [predictedPrice, direction])

  useEffect(() => {
    let cancelled = false
    let hasFitted = false

    async function load() {
      try {
        const candles = await fetchCandles(asset, timeframe, compact ? COMPACT_CANDLE_LIMIT : CANDLE_LIMIT)
        if (cancelled || !seriesRef.current) return

        // Precisão dinâmica — cripto costuma ter 2 casas, forex 5, e o preço previsto (saída
        // de um modelo estatístico) pode ter ainda mais. Usa o maior número de casas decimais
        // realmente presente nos dados, em vez do padrão fixo de 2 do gráfico.
        const precision = Math.max(
          2,
          ...candles.slice(-10).map((c) => decimalsOf(c.close)),
          predictedPriceRef.current != null ? decimalsOf(predictedPriceRef.current) : 0,
        )
        seriesRef.current.applyOptions({ priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision } })

        seriesRef.current.setData(
          candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        )
        // Só ajusta o zoom pra caber tudo na PRIMEIRA carga — repetir isso a cada poll (a
        // cada 4s) cancelava qualquer zoom/pan manual que o usuário tivesse feito no gráfico.
        if (!hasFitted) {
          chartRef.current?.timeScale().fitContent()
          hasFitted = true
        }
      } catch {
        // silencioso — gráfico é só acompanhamento visual, não crítico
      }
    }

    load()
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [asset, timeframe, compact])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const predictedAtMs = new Date(predictedAt).getTime()
  const targetMs = new Date(targetTime).getTime()
  const totalMs = Math.max(1, targetMs - predictedAtMs)
  const elapsedMs = Math.max(0, Math.min(totalMs, now - predictedAtMs))
  const progressPct = Math.round((elapsedMs / totalMs) * 100)
  const remainingSeconds = Math.max(0, Math.round((targetMs - now) / 1000))

  return (
    <div className={`live-chart${compact ? ' live-chart-compact' : ''}`}>
      <div ref={containerRef} className="live-chart-canvas" />
      <div className="live-chart-progress-bar">
        <div className="live-chart-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      {!compact && (
        <div className="live-chart-progress-label">
          {remainingSeconds > 0
            ? `previsão vale até ${new Date(targetTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} (${remainingSeconds}s)`
            : 'janela da previsão encerrada'}
        </div>
      )}
    </div>
  )
}
