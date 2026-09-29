import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  Cell,
  LabelList,
} from 'recharts'
import { asset, COLORS } from '../lib/catalog'
import { num, pct, shortDate } from '../lib/analytics'
import type { ChartRow, History } from '../lib/types'

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

export function PerformanceChart({
  rows,
  symbols,
  benchmark,
  mode = 'return',
  height = 330,
  loading = false,
  baseline,
  description,
}: {
  rows: ChartRow[]
  symbols: string[]
  benchmark?: string
  mode?: string
  height?: number
  loading?: boolean
  baseline?: number
  description?: string
}) {
  if (rows.length < 2)
    return (
      <div
        className={`chart-empty ${loading ? 'is-loading' : ''}`}
        style={{ height }}
      >
        {loading ? (
          <>
            <span className="loader" />
            <p>Loading price history…</p>
          </>
        ) : (
          <>
            <p>No overlapping history for this selection.</p>
            <span>
              Choose a shorter period or remove a recently listed asset.
            </span>
          </>
        )}
      </div>
    )
  const money = mode === 'growth'
  const numeric = mode === 'correlation' || mode === 'beta'
  return (
    <div
      role="region"
      className="chart-wrap"
      style={{ height }}
      aria-label={`${description ?? (money ? 'Hypothetical investment growth' : mode === 'drawdown' ? 'Drawdown' : mode === 'relative' ? 'Performance relative to benchmark' : 'Cumulative performance')} chart from ${rows[0].date} through ${rows.at(-1)!.date}`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart
          data={rows}
          margin={{ top: 18, right: 10, bottom: 5, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid
            stroke="#2a3330"
            strokeDasharray="3 5"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            minTickGap={60}
            tickFormatter={(d) =>
              new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })
            }
            tick={{ fill: '#82908a', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            dy={12}
          />
          <YAxis
            width={60}
            tickFormatter={(v) =>
              money
                ? `$${num(v / 1000, 1)}k`
                : numeric
                  ? num(v, 2)
                  : `${v > 0 ? '+' : ''}${num(v, 0)}${mode === 'relative' ? 'pp' : '%'}`
            }
            tick={{ fill: '#82908a', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            domain={mode === 'correlation' ? [-1, 1] : ['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{
              background: '#1a2420',
              border: '1px solid #3a4941',
              borderRadius: 8,
              fontSize: 13,
            }}
            labelStyle={{ color: '#eff3ec', marginBottom: 8 }}
            labelFormatter={(v) => shortDate(String(v))}
            formatter={(v, name) => [
              money
                ? `$${num(Number(v))}`
                : numeric
                  ? num(Number(v), 3)
                  : mode === 'relative'
                    ? `${Number(v) > 0 ? '+' : ''}${num(Number(v))} pp`
                    : pct(Number(v)),
              String(name) === 'Portfolio'
                ? 'Portfolio'
                : `${name} · ${asset(String(name)).name}`,
            ]}
          />
          <ReferenceLine
            y={baseline ?? (money ? 10000 : mode === 'beta' ? 1 : 0)}
            stroke="#526158"
            strokeDasharray="3 4"
          />
          {symbols.map((symbol, i) => (
            <Line
              key={symbol}
              type="linear"
              dataKey={symbol}
              stroke={
                symbol === benchmark
                  ? '#d4d8d3'
                  : (asset(symbol).color ?? COLORS[i % COLORS.length])
              }
              strokeWidth={symbol === benchmark ? 1.7 : 2.3}
              strokeDasharray={symbol === benchmark ? '5 5' : undefined}
              dot={false}
              activeDot={{ r: 4, stroke: '#101715', strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function RotationChart({
  items,
}: {
  items: { symbol: string; name: string; x: number; y: number; color: string }[]
}) {
  const extent =
    Math.max(3, ...items.flatMap((a) => [Math.abs(a.x), Math.abs(a.y)])) * 1.2
  return (
    <div
      role="region"
      className="rotation-chart"
      aria-label="Sector relative performance: three-month excess return on the horizontal axis and one-month excess return on the vertical axis"
    >
      <div className="quadrant q-tl">RECOVERING</div>
      <div className="quadrant q-tr">LEADING</div>
      <div className="quadrant q-bl">LAGGING</div>
      <div className="quadrant q-br">COOLING</div>
      <ResponsiveContainer width="100%" height={365} minWidth={0}>
        <ScatterChart
          margin={{ top: 25, right: 35, bottom: 30, left: 15 }}
          accessibilityLayer
        >
          <CartesianGrid stroke="#27342d" strokeDasharray="3 5" />
          <XAxis
            type="number"
            dataKey="x"
            name="3M excess return"
            unit=" pp"
            domain={[-extent, extent]}
            tick={{ fill: '#819087', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => num(v, 0)}
            label={{
              value: '3M return vs benchmark (percentage points)',
              fill: '#91a196',
              position: 'bottom',
              offset: 12,
              fontSize: 12,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="1M excess return"
            unit=" pp"
            domain={[-extent, extent]}
            tick={{ fill: '#819087', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => num(v, 0)}
            width={38}
          />
          <ZAxis range={[75, 75]} />
          <ReferenceLine x={0} stroke="#56675b" />
          <ReferenceLine y={0} stroke="#56675b" />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="chart-tooltip">
                  <strong>{payload[0].payload.name}</strong>
                  <span>3M: {num(payload[0].payload.x)} pp</span>
                  <span>1M: {num(payload[0].payload.y)} pp</span>
                </div>
              ) : null
            }
          />
          <Scatter data={items} isAnimationActive={false}>
            {items.map((i) => (
              <Cell key={i.symbol} fill={i.color} />
            ))}
            <LabelList
              dataKey="symbol"
              position="top"
              fill="#e1e8df"
              fontSize={11}
              offset={10}
            />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DistributionChart({
  rows,
}: {
  rows: { name: string; value: number }[]
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart
        data={rows}
        margin={{ left: 0, right: 15, top: 10, bottom: 0 }}
      >
        <CartesianGrid stroke="#28352e" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#89978e', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#89978e', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={35}
        />
        <Tooltip
          contentStyle={{ background: '#1a2420', border: '1px solid #3a4941' }}
        />
        <Area
          dataKey="value"
          name="Observations"
          stroke="#b8e986"
          fill="#b8e98622"
          isAnimationActive={false}
        />
        <Legend />
      </AreaChart>
    </ResponsiveContainer>
  )
}
