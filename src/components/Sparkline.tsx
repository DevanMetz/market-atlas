import type { History } from '../lib/types'

export function Sparkline({
  history,
  color = '#b8e986',
}: {
  history?: History
  color?: string
}) {
  const prices = history?.points.slice(-40).map((p) => p.adjusted) ?? []
  if (prices.length < 2) return <span className="spark-empty">—</span>
  const lo = Math.min(...prices),
    hi = Math.max(...prices),
    range = hi - lo || 1
  const points = prices
    .map(
      (p, i) =>
        `${(i / (prices.length - 1)) * 100},${29 - ((p - lo) / range) * 24}`,
    )
    .join(' ')
  return (
    <svg
      className="sparkline"
      viewBox="0 0 100 34"
      role="img"
      aria-label={`${history?.symbol} last 40 trading observations`}
    >
      <polyline fill="none" stroke={color} strokeWidth="1.6" points={points} />
    </svg>
  )
}
