import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { asset } from '../lib/catalog'
import {
  align,
  chartData,
  downloadCSV,
  num,
  shortDate,
  windowKey,
} from '../lib/analytics'
import { riskProfile } from '../lib/risk'
import type { MarketContext } from '../lib/context'
import type { History } from '../lib/types'
import { Change, Panel, Stat, SymbolChips } from '../components/UI'
import { PerformanceChart } from '../components/Charts'

export function RiskView({
  ctx,
  focus,
  onFocus,
}: {
  ctx: MarketContext
  focus: string
  onFocus: (symbol: string) => void
}) {
  const [threshold, setThreshold] = useState(5)
  const symbols = [...new Set([...ctx.selected, ctx.benchmark])]
  const histories = symbols
    .map((s) => ctx.data[s])
    .filter((h): h is History => !!h)
  const missing = symbols.filter((s) => !ctx.data[s])
  const analysis = useMemo(() => {
    if (missing.length)
      return {
        dates: [] as string[],
        rows: [],
        profiles: symbols.map((symbol) => ({ symbol, profile: null })),
      }
    const { dates, values } = align(histories, ctx.window)
    return {
      dates,
      rows: chartData(histories, ctx.window, 'drawdown', ctx.benchmark),
      profiles: symbols.map((symbol) => ({
        symbol,
        profile: riskProfile(dates, values[symbol] ?? []),
      })),
    }
  }, [ctx.data, ctx.selected, ctx.benchmark, ctx.window])
  const current = analysis.profiles.find((p) => p.symbol === focus)?.profile
  const episodes = (current?.episodes ?? [])
    .filter((e) => -e.depth >= threshold - 1e-8)
    .sort((a, b) => a.depth - b.depth)
  const setFocus = onFocus
  const exportRisk = () =>
    downloadCSV(
      `market-atlas-risk-${windowKey(ctx.window)}.csv`,
      [
        'Asset',
        'Start',
        'End',
        'Return observations',
        'Cumulative return (%)',
        'Annualized return (%)',
        'Annualized volatility (%)',
        'Max drawdown (%)',
        'Current drawdown (%)',
        'Positive observations (%)',
        'Worst daily return (%)',
        '5th percentile daily return (%)',
        'Mean worst 5% daily returns (%)',
        'Tail observations',
        'Currency',
        'Source',
        'Fetched at',
        'Price basis',
        'Status',
      ],
      analysis.profiles.map(({ symbol, profile: p }) => [
        symbol,
        p?.start,
        p?.end,
        p?.observations,
        p?.change,
        p?.annualized,
        p?.volatility,
        p?.maxDrawdown,
        p?.currentDrawdown,
        p?.positiveRate,
        p?.worst,
        p?.fifthPercentile,
        p?.worstTailMean,
        p?.tailCount,
        ctx.data[symbol]?.currency,
        ctx.data[symbol]?.source,
        ctx.data[symbol]?.fetchedAt,
        ctx.data[symbol]?.adjusted ? 'Adjusted' : 'Unadjusted',
        ctx.data[symbol]?.stale ? 'Stale cache' : 'Retrieved',
      ]),
    )
  return (
    <>
      <Panel
        title="Depth and duration of losses"
        eyebrow="DRAWDOWN COMPARISON"
        action={
          <button className="button" onClick={exportRisk} disabled={!current}>
            <Download size={14} />
            Export risk metrics
          </button>
        }
      >
        <SymbolChips
          symbols={symbols}
          benchmark={ctx.benchmark}
          onRemove={(s) => ctx.setSelected(ctx.selected.filter((v) => v !== s))}
          onAdd={(s) => ctx.setSelected([...ctx.selected, s].slice(0, 12))}
        />
        <PerformanceChart
          rows={analysis.rows}
          symbols={symbols}
          benchmark={ctx.benchmark}
          mode="drawdown"
          height={360}
          loading={missing.some((s) => ctx.loading.includes(s))}
        />
        <div className="chart-caption">
          <span>
            {analysis.dates.length
              ? `${shortDate(analysis.dates[0])} – ${shortDate(analysis.dates.at(-1)!)}`
              : 'Waiting for shared price history'}
          </span>
          <span>Below the running peak within this window</span>
        </div>
        <p className="panel-note">
          Every asset starts at a new peak on the first shared observation. A
          return to zero means it has regained that window’s previous peak.
          Losses before the selected start date are outside this analysis; these
          are not all-time drawdowns.
        </p>
      </Panel>
      <Panel
        title="Return and risk comparison"
        action={<span className="small muted">Same dates for every asset</span>}
      >
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Risk comparison table"
        >
          <table className="risk-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="right">Total return</th>
                <th className="right">Annualized return</th>
                <th className="right">Volatility</th>
                <th className="right">Max drawdown</th>
                <th className="right">Positive days</th>
                <th className="right">Worst daily return</th>
              </tr>
            </thead>
            <tbody>
              {analysis.profiles.map(({ symbol, profile: p }) => (
                <tr
                  key={symbol}
                  className={symbol === focus ? 'selected-risk' : ''}
                >
                  <td>
                    <button
                      className="text-button"
                      aria-label={`Inspect ${symbol} drawdowns`}
                      onClick={() => setFocus(symbol)}
                    >
                      <strong>{symbol}</strong>
                      <small className="block muted">
                        {asset(symbol).name}
                      </small>
                    </button>
                  </td>
                  <td className="right">
                    <Change value={p?.change} />
                  </td>
                  <td className="right">
                    <Change value={p?.annualized} />
                  </td>
                  <td className="right">
                    {p?.volatility == null ? '—' : `${num(p.volatility)}%`}
                  </td>
                  <td className="right">
                    <Change value={p?.maxDrawdown} />
                  </td>
                  <td className="right">
                    {p ? `${num(p.positiveRate, 1)}%` : '—'}
                  </td>
                  <td className="right">
                    <Change value={p?.worst} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-note">
          Annualized return compounds the total return over elapsed calendar
          years and appears only for windows of at least 365 days. Positive days
          exclude zero returns from the positive count. Local-currency returns
          are compared without FX conversion. Select an asset to inspect its
          recovery record below.
        </p>
      </Panel>
      <div className="risk-focus">
        <label>
          Recovery record for
          <select
            aria-label="Drawdown asset"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          >
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s} · {asset(s).name}
              </option>
            ))}
          </select>
        </label>
        <span>
          {current
            ? `${current.observations} matched daily returns`
            : 'No complete sample available'}
        </span>
      </div>
      <div className="stats-row">
        <Stat
          label={`${focus} · deepest decline`}
          value={<Change value={current?.maxDrawdown} />}
        />
        <Stat
          label="Below peak at window end"
          value={<Change value={current?.currentDrawdown} />}
        />
        <Stat
          label="Longest time below peak"
          value={current ? `${current.longest?.calendarDays ?? 0} days` : '—'}
          detail={
            current?.longest
              ? current.longest.recovery
                ? 'Peak to recovery'
                : 'Still below peak at window end'
              : 'Calendar days'
          }
        />
        <Stat
          label="Recovered episodes"
          value={
            current ? current.episodes.filter((e) => e.recovery).length : '—'
          }
          detail="All observed declines, before filtering"
        />
      </div>
      <Panel
        title={`${focus} · drawdowns and recoveries`}
        action={
          <div className="recovery-actions">
            <label>
              Minimum decline
              <select
                aria-label="Minimum drawdown"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              >
                <option value={0}>Any decline</option>
                <option value={5}>5% or more</option>
                <option value={10}>10% or more</option>
                <option value={20}>20% or more</option>
              </select>
            </label>
            <button
              className="button"
              disabled={!episodes.length}
              onClick={() =>
                downloadCSV(
                  `market-atlas-drawdowns-${focus}-${windowKey(ctx.window)}.csv`,
                  [
                    'Peak',
                    'Trough',
                    'Recovered',
                    'Observed through',
                    'Depth (%)',
                    'Decline observations',
                    'Recovery observations',
                    'Peak-to-end observations',
                    'Peak-to-end calendar days',
                  ],
                  episodes.map((e) => [
                    e.peak,
                    e.trough,
                    e.recovery,
                    e.end,
                    e.depth,
                    e.declineObservations,
                    e.recoveryObservations,
                    e.underwaterObservations,
                    e.calendarDays,
                  ]),
                )
              }
            >
              Export episodes
            </button>
          </div>
        }
      >
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Drawdown episodes"
        >
          <table className="drawdown-table">
            <thead>
              <tr>
                <th>Prior peak</th>
                <th>Trough</th>
                <th>Recovery</th>
                <th className="right">Depth</th>
                <th className="right">Days below peak</th>
                <th className="right">Recovery observations</th>
              </tr>
            </thead>
            <tbody>
              {episodes.slice(0, 20).map((e) => (
                <tr key={e.peak}>
                  <td>{shortDate(e.peak)}</td>
                  <td>{shortDate(e.trough)}</td>
                  <td>
                    {e.recovery ? (
                      shortDate(e.recovery)
                    ) : (
                      <span className="ongoing-badge">Ongoing at end</span>
                    )}
                  </td>
                  <td className="right">
                    <Change value={e.depth} />
                  </td>
                  <td className="right">{num(e.calendarDays, 0)}</td>
                  <td className="right">{num(e.recoveryObservations, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!episodes.length && (
          <div className="inline-empty">
            {current
              ? `No declines${threshold ? ` of at least ${threshold}%` : ''} were observed in this window.`
              : 'Load all selected assets or choose a shorter window.'}
          </div>
        )}
        <p className="panel-note">
          {episodes.length > 20
            ? `Showing the 20 deepest of ${episodes.length} matching episodes; the export includes them all. `
            : ''}
          An episode starts at the last closing peak and ends when adjusted
          close reaches or exceeds that level. Calendar duration runs from peak
          to recovery, or the window end if still underwater. Recovery
          observations count from trough to recovery; an ongoing episode has no
          known recovery time.
        </p>
      </Panel>
      <div className="two-col risk-tail-panels">
        <Panel
          title="Lowest daily returns"
          eyebrow={`${focus} · HISTORICAL SAMPLE`}
        >
          <div className="tail-metrics">
            <Stat
              label="5th percentile daily return"
              value={<Change value={current?.fifthPercentile} />}
              detail="Interpolated historical cutoff"
            />
            <Stat
              label="Average of the worst 5%"
              value={<Change value={current?.worstTailMean} />}
              detail={
                current?.tailCount
                  ? `${current.tailCount} observations, rounded up`
                  : 'Requires 60 daily returns'
              }
            />
          </div>
          <p className="panel-note">
            These describe observed daily returns, not a loss limit or a future
            probability. Both measures require at least 60 returns; small
            samples and changing market conditions limit their usefulness.
          </p>
        </Panel>
        <Panel title="Gain needed to recover a loss">
          <div className="recovery-math">
            {[10, 20, 30, 50].map((loss) => (
              <div key={loss}>
                <span>A {loss}% decline</span>
                <strong>+{num((loss / (100 - loss)) * 100, 1)}%</strong>
                <small>gain needed to regain the peak</small>
              </div>
            ))}
          </div>
          <p className="panel-note">
            Recovery gain = loss ÷ (100 − loss) × 100. This is arithmetic, not a
            prediction of how quickly a price will recover.
          </p>
        </Panel>
      </div>
    </>
  )
}
