import type { DirectionOrNeutral } from '../api'

function OpinionChip({
  label,
  direction,
  confidence,
}: {
  label: string
  direction: DirectionOrNeutral | null | undefined
  confidence: number | null | undefined
}) {
  return (
    <div className="opinion-chip">
      <span className="opinion-label">{label}</span>
      {direction && confidence !== null && confidence !== undefined ? (
        <>
          <span className={`opinion-direction dir-${direction.toLowerCase()}`}>{direction}</span>
          <span className="opinion-confidence">{confidence}%</span>
        </>
      ) : (
        <span className="opinion-unavailable">neutro</span>
      )}
    </div>
  )
}

interface Props {
  indicatorDirection?: DirectionOrNeutral | null
  indicatorConfidence?: number | null
  aiDirection?: DirectionOrNeutral | null
  aiConfidence?: number | null
  quantDirection?: DirectionOrNeutral | null
  quantConfidence?: number | null
}

export default function OpinionsRow({
  indicatorDirection,
  indicatorConfidence,
  aiDirection,
  aiConfidence,
  quantDirection,
  quantConfidence,
}: Props) {
  return (
    <div className="opinions-row">
      <OpinionChip label="Indicadores" direction={indicatorDirection} confidence={indicatorConfidence} />
      <OpinionChip label="IA" direction={aiDirection} confidence={aiConfidence} />
      <OpinionChip label="Estatística" direction={quantDirection} confidence={quantConfidence} />
    </div>
  )
}
