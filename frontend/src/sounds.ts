// Sons sintetizados via Web Audio API — sem depender de arquivos externos.
const STORAGE_KEY = 'binai_sound_muted'

let audioCtx: AudioContext | null = null
let limiter: DynamicsCompressorNode | null = null
let muted = localStorage.getItem(STORAGE_KEY) === 'true'

function getCtx(): { ctx: AudioContext; out: AudioNode } {
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctor()

    // Limitador pra deixar o volume bem alto sem estourar/distorcer quando as notas se sobrepõem.
    limiter = audioCtx.createDynamicsCompressor()
    limiter.threshold.value = -10
    limiter.knee.value = 6
    limiter.ratio.value = 12
    limiter.attack.value = 0.003
    limiter.release.value = 0.15
    limiter.connect(audioCtx.destination)
  }
  return { ctx: audioCtx, out: limiter as AudioNode }
}

export function isSoundMuted(): boolean {
  return muted
}

export function setSoundMuted(value: boolean): void {
  muted = value
  localStorage.setItem(STORAGE_KEY, String(value))
}

interface Note {
  freq: number
  delay: number
  duration: number
  type?: OscillatorType
  gain?: number
}

function playNotes(notes: Note[]): void {
  if (muted) return

  const { ctx, out } = getCtx()
  if (ctx.state === 'suspended') ctx.resume()

  const now = ctx.currentTime
  for (const n of notes) {
    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    osc.type = n.type ?? 'sine'
    osc.frequency.value = n.freq

    const start = now + n.delay
    const peak = n.gain ?? 0.9
    gainNode.gain.setValueAtTime(0, start)
    gainNode.gain.linearRampToValueAtTime(peak, start + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.001, start + n.duration)

    osc.connect(gainNode)
    gainNode.connect(out)
    osc.start(start)
    osc.stop(start + n.duration + 0.05)
  }
}

/** Uma análise acabou de bater a confiança mínima — "achei um sinal". */
export function playSignal(): void {
  playNotes([
    { freq: 660, delay: 0, duration: 0.12 },
    { freq: 880, delay: 0.1, duration: 0.16 },
  ])
}
