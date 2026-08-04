import type { Direction } from '../api'

interface Props {
  confidence: number
  totalSeconds: number
  remainingSeconds: number
  direction: Direction
  size?: number
}

export default function CountdownRing({ confidence, totalSeconds, remainingSeconds, direction, size = 160 }: Props) {
  const stroke = Math.max(4, Math.round(size / 16))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  const fraction = totalSeconds > 0 ? Math.max(0, Math.min(1, remainingSeconds / totalSeconds)) : 0
  const offset = circumference * (1 - fraction)
  const color = direction === 'CALL' ? '#22c55e' : '#ef4444'

  const confidenceFontSize = Math.max(11, Math.round(size * 0.16))
  const countdownFontSize = Math.max(9, Math.round(size * 0.08))

  return (
    <svg width={size} height={size} className="countdown-ring">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
      <text
        x="50%"
        y="45%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="ring-confidence"
        style={{ fontSize: confidenceFontSize }}
      >
        {confidence}%
      </text>
      <text
        x="50%"
        y="65%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="ring-countdown"
        style={{ fontSize: countdownFontSize }}
      >
        {remainingSeconds}s
      </text>
    </svg>
  )
}
