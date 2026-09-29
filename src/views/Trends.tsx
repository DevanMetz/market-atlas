import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { asset, BENCHMARKS, COLORS, SECTORS } from '../lib/catalog'
import { downloadCSV, num, pct, shortDate, windowKey } from '../lib/analytics'
import { monthlyReturns, rollingSeries, seasonalSummary } from '../lib/trends'
import type { History, RollingMetric } from '../lib/types'
import type { MarketContext } from '../lib/context'
import { Change, Panel, Stat, SymbolChips } from '../components/UI'
import { PerformanceChart } from '../components/Charts'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const METRICS: { value: RollingMetric; name: string; description: string }[] = [
  {
    value: 'return',
    name: 'Rolling return',
    description: 'Cumulative adjusted return over each trailing window.',
  },
  {
    value: 'volatility',
    name: 'Rolling volatility',
    description:
      'Sample daily-return volatility, annualized with 252 observations.',
  },
  {
    value: 'correlation',
    name: 'Rolling correlation',
    description:
      'How the asset’s trailing daily returns move with the benchmark.',
  },
  {
    value: 'beta',
    name: 'Rolling beta',
    description:
      'Trailing covariance with the benchmark divided by benchmark variance.',
  },
]

export function TrendsView({ ctx }: { ctx: MarketContext }) {
  const [metric, setMetric] = useState<RollingMetric>('return')
  const [lookback, setLookback] = useState(60)
  const [calendarSymbol, setCalendarSymbol] = useState(
    ctx.selected[0] ?? ctx.benchmark,
  )
  const [relative, setRelative] = useState(false)
  const symbols = [...new Set([...ctx.selected, ctx.benchmark])]
  const histories = symbols
    .map((s) => ctx.data[s])
    .filter((h): h is History => !!h)
  const missing = symbols.filter((s) => !ctx.data[s])
  const rows = useMemo(
    () =>
      missing.length
        ? []
        : rollingSeries(histories, ctx.benchmark, ctx.window, lookback, metric),
    [ctx.data, ctx.selected, ctx.benchmark, ctx.window, lookback, metric],
  )
  const relation = metric === 'correlation' || metric === 'beta'
  const chartSymbols = relation
    ? symbols.filter((s) => s !== ctx.benchmark)
    : symbols
  const current = rows.at(-1)
  const format = (value: unknown) =>
    value == null ? '—' : relation ? num(Number(value), 3) : pct(Number(value))
  const months = useMemo(
    () =>
      ctx.data[calendarSymbol] && (!relative || ctx.data[ctx.benchmark])
        ? monthlyReturns(
            ctx.data[calendarSymbol],
            relative ? ctx.data[ctx.benchmark] : undefined,
          )
        : [],
    [ctx.data, calendarSymbol, relative, ctx.benchmark],
  )
  const years = [...new Set(months.map((m) => m.year))].sort((a, b) => b - a)
  const seasonal = seasonalSummary(months)
  const completed = months.filter((m) => m.value !== null && !m.partial)
  const best = completed.length
    ? completed.reduce((a, b) => (a.value! > b.value! ? a : b))
    : null
  const worst = completed.length
    ? completed.reduce((a, b) => (a.value! < b.value! ? a : b))
    : null
  const selectOptions = [
    ...new Map(
      [
        asset(calendarSymbol),
        ...symbols.map(asset),
        ...SECTORS,
        ...BENCHMARKS,
      ].map((a) => [a.symbol, a]),
    ).values(),
  ]
  const pickCalendar = (symbol: string) => {
    setCalendarSymbol(symbol)
    void ctx.load([symbol])
  }
  return (
    <>
      <Panel
        title="How is the trend changing?"
        eyebrow="TRAILING WINDOWS"
        action={
          <button
            className="button"
            disabled={!rows.length}
            onClick={() =>
              downloadCSV(
                `market-atlas-rolling-${metric}-${windowKey(ctx.window)}.csv`,
                ['Date', ...chartSymbols],
                rows.map((row) => [
                  row.date,
                  ...chartSymbols.map((s) => row[s]),
                ]),
              )
            }
          >
            <Download size={14} />
            Export rolling data
          </button>
        }
      >
        <div className="trend-controls">
          <label>
            Measure
            <select
              aria-label="Rolling measure"
              value={metric}
              onChange={(e) => setMetric(e.target.value as RollingMetric)}
            >
              {METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trailing window
            <select
              aria-label="Rolling window"
              value={lookback}
              onChange={(e) => setLookback(Number(e.target.value))}
            >
              <option value={20}>20 observations · about 1 month</option>
              <option value={60}>60 observations · about 3 months</option>
              <option value={120}>120 observations · about 6 months</option>
              <option value={252}>252 observations · about 1 year</option>
            </select>
          </label>
          <span>{METRICS.find((m) => m.value === metric)!.description}</span>
        </div>
        <SymbolChips
          symbols={symbols}
          benchmark={ctx.benchmark}
          onRemove={(s) => ctx.setSelected(ctx.selected.filter((v) => v !== s))}
          onAdd={(s) => ctx.setSelected([...ctx.selected, s].slice(0, 12))}
        />
        <PerformanceChart
          rows={rows}
          symbols={chartSymbols}
          benchmark={ctx.benchmark}
          mode={metric}
          height={390}
          loading={missing.some((s) => ctx.loading.includes(s))}
          description={`${lookback}-observation rolling ${metric}`}
        />
        <div className="rolling-latest">
          {chartSymbols.map((s, i) => (
            <div key={s}>
              <span>
                <i
                  style={{
                    background: asset(s).color ?? COLORS[i % COLORS.length],
                  }}
                />
                {s}
              </span>
              <strong>{format(current?.[s])}</strong>
            </div>
          ))}
        </div>
        <div className="chart-caption">
          <span>
            {rows.length
              ? `${shortDate(rows[0].date)} – ${shortDate(rows.at(-1)!.date)}`
              : 'Waiting for enough shared history'}
          </span>
          <span>
            Trailing observations only ·{' '}
            {relation ? `relative to ${ctx.benchmark}` : 'adjusted close basis'}
          </span>
        </div>
        <p className="panel-note">
          Each point uses only its trailing {lookback} matched observations,
          including history before the displayed range when available.{' '}
          {relation
            ? 'The benchmark itself is omitted from the lines: its correlation and beta to itself are 1 when variance is nonzero.'
            : 'Returns cover the trailing window; volatility is annualized.'}{' '}
          All selected assets must have data. Undefined relationships stay
          blank.
        </p>
      </Panel>
      <Panel
        title="The monthly return calendar"
        eyebrow="AVAILABLE FIVE-YEAR HISTORY"
        action={
          <button
            className="button"
            disabled={!months.length}
            onClick={() =>
              downloadCSV(
                `market-atlas-monthly-${calendarSymbol}.csv`,
                [
                  'Month',
                  relative
                    ? `Excess vs ${ctx.benchmark} (pp)`
                    : 'Adjusted return (%)',
                  'Baseline',
                  'Last observation',
                  'Partial',
                ],
                months.map((m) => [
                  m.key,
                  m.value,
                  m.start,
                  m.end,
                  m.partial ? 'Yes' : 'No',
                ]),
              )
            }
          >
            <Download size={14} />
            Export calendar
          </button>
        }
      >
        <div className="trend-controls">
          <label>
            Asset
            <select
              aria-label="Calendar asset"
              value={calendarSymbol}
              onChange={(e) => pickCalendar(e.target.value)}
            >
              {selectOptions.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} · {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented">
            <button
              className={!relative ? 'active' : ''}
              onClick={() => setRelative(false)}
            >
              Absolute return
            </button>
            <button
              className={relative ? 'active' : ''}
              onClick={() => setRelative(true)}
            >
              vs {ctx.benchmark}
            </button>
          </div>
          <span>
            Uses the full available history, independent of the range above.
          </span>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Monthly return calendar"
        >
          <table className="month-calendar">
            <thead>
              <tr>
                <th>Year</th>
                {MONTHS.map((m) => (
                  <th key={m}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((year) => (
                <tr key={year}>
                  <th>{year}</th>
                  {MONTHS.map((month, i) => {
                    const m = months.find(
                        (value) => value.year === year && value.month === i + 1,
                      ),
                      v = m?.value
                    return (
                      <td
                        key={month}
                        style={{
                          background:
                            v == null
                              ? 'transparent'
                              : v >= 0
                                ? `rgba(123,171,97,${Math.min(0.43, 0.1 + Math.abs(v) / 55)})`
                                : `rgba(193,107,110,${Math.min(0.43, 0.1 + Math.abs(v) / 55)})`,
                        }}
                        title={
                          m?.start
                            ? `${m.start} through ${m.end}${m.partial ? ' · incomplete month' : ''}`
                            : 'No complete prior-month baseline'
                        }
                      >
                        <span
                          className={
                            v == null
                              ? 'muted'
                              : v >= 0
                                ? 'positive'
                                : 'negative'
                          }
                        >
                          {v == null
                            ? '—'
                            : `${v > 0 ? '+' : ''}${num(v, 1)}${relative ? 'pp' : '%'}`}
                        </span>
                        {m?.partial && v != null && <small>partial</small>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!months.length && (
          <div className="inline-empty">
            {ctx.loading.includes(calendarSymbol)
              ? 'Loading monthly history…'
              : 'No monthly history is available for this selection.'}
          </div>
        )}
        <p className="panel-note">
          Each month compares its final available close with the preceding
          month’s final close. A missing prior-month baseline stays blank. The
          current month and truncated months are marked partial.{' '}
          {relative
            ? 'Excess returns use dates shared by the asset and benchmark.'
            : 'ETF distributions are reflected only to the extent included in adjusted prices.'}
        </p>
      </Panel>
      <div className="stats-row three">
        <Stat
          label="Completed months"
          value={completed.length}
          detail={`${calendarSymbol} · available history`}
        />
        <Stat
          label="Best completed month"
          value={
            best ? (
              <Change value={best.value} suffix={relative ? 'pp' : undefined} />
            ) : (
              '—'
            )
          }
          detail={best?.key}
        />
        <Stat
          label="Worst completed month"
          value={
            worst ? (
              <Change
                value={worst.value}
                suffix={relative ? 'pp' : undefined}
              />
            ) : (
              '—'
            )
          }
          detail={worst?.key}
        />
      </div>
      <Panel
        title="Do calendar months behave differently?"
        eyebrow="DESCRIPTIVE SEASONALITY"
      >
        <div className="seasonality-grid">
          {seasonal.map((s) => (
            <div className="seasonality-month" key={s.month}>
              <strong>{MONTHS[s.month - 1]}</strong>
              <Change value={s.average} suffix={relative ? 'pp' : undefined} />
              <div className="seasonality-bar">
                <i
                  style={{
                    width: `${Math.min(100, Math.abs(s.average ?? 0) * 12)}%`,
                    background: (s.average ?? 0) >= 0 ? '#98c178' : '#cb8886',
                  }}
                />
              </div>
              <small>{s.count} complete months</small>
              <span>
                {s.positiveRate === null
                  ? '—'
                  : `${num(s.positiveRate, 0)}% positive`}
              </span>
            </div>
          ))}
        </div>
        <p className="panel-note">
          Average observed return for each calendar month, excluding partial
          months. Five years supplies at most about five observations per month.
          This small, changing sample describes the past; it is not a reliable
          seasonal forecast.
        </p>
      </Panel>
    </>
  )
}
