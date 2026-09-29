import {
  ArrowUpRight,
  ChartNoAxesCombined,
  ChevronRight,
  Layers3,
} from 'lucide-react'
import { useState } from 'react'
import { asset, SECTORS } from '../lib/catalog'
import {
  chartData,
  metrics,
  num,
  performance,
  shortDate,
} from '../lib/analytics'
import type { MarketContext } from '../lib/context'
import type { History } from '../lib/types'
import { Change, Panel, Stat, SymbolChips } from '../components/UI'
import {
  PerformanceChart,
  RotationChart,
  Sparkline,
} from '../components/Charts'

export function SectorHeatmap({
  ctx,
  relative = false,
}: {
  ctx: MarketContext
  relative?: boolean
}) {
  return (
    <div className="sector-heatmap">
      {SECTORS.map((s) => {
        const m = metrics(
            ctx.data[s.symbol],
            ctx.period,
            ctx.data[ctx.benchmark],
          ),
          value = relative ? m.excess : m.change
        const intensity =
          value == null ? 0 : Math.min(0.33, 0.09 + Math.abs(value) / 80)
        return (
          <button
            key={s.symbol}
            className={`heat-tile ${value != null && value < 0 ? 'down' : 'up'}`}
            style={{
              background:
                value == null
                  ? '#18211c'
                  : value >= 0
                    ? `rgba(119, 185, 126, ${intensity})`
                    : `rgba(211, 114, 112, ${intensity})`,
            }}
            onClick={() => ctx.compare([s.symbol])}
          >
            <span>{s.name}</span>
            <strong>
              <Change value={value} suffix={relative ? 'pp' : undefined} />
            </strong>
            <small>
              {s.symbol}
              <ArrowUpRight size={12} />
            </small>
          </button>
        )
      })}
    </div>
  )
}

export function Overview({ ctx }: { ctx: MarketContext }) {
  const [mode, setMode] = useState<'return' | 'relative' | 'drawdown'>('return')
  const series = [...new Set([...ctx.selected, ctx.benchmark])]
  const histories = series
    .map((s) => ctx.data[s])
    .filter((h): h is History => !!h)
  const rows = chartData(histories, ctx.period, mode, ctx.benchmark)
  const ranking = SECTORS.map((s) => ({
    ...s,
    ...metrics(ctx.data[s.symbol], ctx.period, ctx.data[ctx.benchmark]),
  }))
    .filter((s) => s.change !== null)
    .sort((a, b) => b.change! - a.change!)
  const winner = ranking[0],
    laggard = ranking.at(-1),
    beat = ranking.filter((s) => s.excess !== null && s.excess > 0).length
  const bm = metrics(ctx.data[ctx.benchmark], ctx.period)
  return (
    <>
      <div className="insight-strip">
        <span className="insight-icon">
          <ChartNoAxesCombined size={18} />
        </span>
        {winner ? (
          <p>
            <strong>{winner.name}</strong> leads the sectors over {ctx.period}{' '}
            with <Change value={winner.change} />
            <span className="insight-divider">/</span>
            <strong>
              {beat} of {ranking.length}
            </strong>{' '}
            sectors outperform {ctx.benchmark}.
          </p>
        ) : (
          <p>
            Bringing the market into focus. Sector comparisons will appear as
            data arrives.
          </p>
        )}
        <span className="eyebrow">MARKET SNAPSHOT</span>
      </div>
      <div className="overview-grid">
        <Panel
          title="Performance comparison"
          eyebrow="THE BIG PICTURE"
          action={
            <select
              aria-label="Chart display"
              className="subtle-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="return">Cumulative return</option>
              <option value="relative">Relative to {ctx.benchmark}</option>
              <option value="drawdown">Drawdown</option>
            </select>
          }
        >
          <SymbolChips
            symbols={series}
            benchmark={ctx.benchmark}
            onRemove={(s) =>
              ctx.setSelected(ctx.selected.filter((x) => x !== s))
            }
            onAdd={(s) => ctx.setSelected([...ctx.selected, s].slice(0, 12))}
          />
          <PerformanceChart
            rows={rows}
            symbols={series}
            benchmark={ctx.benchmark}
            mode={mode}
            loading={ctx.loading.length > 0}
          />
          <div className="chart-caption">
            <span>
              {rows.length
                ? `${shortDate(String(rows[0].date))} – ${shortDate(String(rows.at(-1)!.date))}`
                : 'Daily observations'}
            </span>
            <span>
              {mode === 'relative'
                ? 'Difference in percentage points'
                : 'Adjusted closing prices'}{' '}
              · common dates
            </span>
          </div>
        </Panel>
        <Panel
          title="Sector landscape"
          eyebrow="11 SECTORS, ONE VIEW"
          action={<Layers3 size={18} className="muted" />}
        >
          <SectorHeatmap ctx={ctx} />
          <div className="heatmap-caption">
            <span>
              <i className="legend-negative" /> Lower return
            </span>
            <span>
              Higher return <i className="legend-positive" />
            </span>
          </div>
        </Panel>
      </div>
      <div className="stats-row">
        <Stat
          label="Leading sector"
          value={winner?.name ?? '—'}
          detail={
            winner ? (
              <>
                <Change value={winner.change} />{' '}
                <span>
                  over {ctx.period} · {winner.symbol}
                </span>
              </>
            ) : undefined
          }
        />
        <Stat
          label="Lagging sector"
          value={laggard?.name ?? '—'}
          detail={
            laggard ? (
              <>
                <Change value={laggard.change} />{' '}
                <span>
                  over {ctx.period} · {laggard.symbol}
                </span>
              </>
            ) : undefined
          }
        />
        <Stat
          label={`${ctx.benchmark} annualized volatility`}
          value={bm.volatility == null ? '—' : `${num(bm.volatility, 1)}%`}
          detail={`Daily return variability · ${ctx.period}`}
        />
        <Stat
          label={`${ctx.benchmark} maximum drawdown`}
          value={<Change value={bm.drawdown} />}
          detail={`Largest peak-to-trough decline · ${ctx.period}`}
        />
      </div>
      <Panel
        title="Sector leaderboard"
        action={
          <span className="muted small">
            {ctx.period} performance · ETF proxies
          </span>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Sector</th>
                <th>Trend · 40 sessions</th>
                <th className="right">Return</th>
                <th className="right">vs {ctx.benchmark}</th>
                <th className="right">Volatility</th>
                <th className="right">Drawdown</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ranking.map((s, i) => (
                <tr key={s.symbol}>
                  <td>
                    <button
                      className="table-asset"
                      onClick={() => ctx.compare([s.symbol])}
                    >
                      <span className="rank">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className="color-square"
                        style={{ background: s.color }}
                      />
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.symbol}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <Sparkline
                      history={ctx.data[s.symbol]}
                      color={s.change! >= 0 ? '#b8e986' : '#e59690'}
                    />
                  </td>
                  <td className="right">
                    <Change value={s.change} />
                  </td>
                  <td className="right">
                    <Change value={s.excess} suffix="pp" />
                  </td>
                  <td className="right">{num(s.volatility)}%</td>
                  <td className="right">
                    <Change value={s.drawdown} />
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Compare ${s.name}`}
                      onClick={() => ctx.compare([s.symbol])}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!ranking.length && (
          <div className="inline-empty">
            {ctx.loading.length
              ? 'Loading sector histories…'
              : 'Sector data is unavailable. Use Refresh to try again.'}
          </div>
        )}
      </Panel>
    </>
  )
}

export function SectorExplorer({ ctx }: { ctx: MarketContext }) {
  const [relative, setRelative] = useState(false)
  const rotation = SECTORS.flatMap((s) => {
    const m = metrics(ctx.data[s.symbol], '3M', ctx.data[ctx.benchmark]),
      n = metrics(ctx.data[s.symbol], '1M', ctx.data[ctx.benchmark])
    return m.excess === null || n.excess === null
      ? []
      : [
          {
            symbol: s.symbol,
            name: s.name,
            x: m.excess,
            y: n.excess,
            color: s.color!,
          },
        ]
  })
  const rows = SECTORS.map((s) => ({
    ...s,
    value: relative
      ? metrics(ctx.data[s.symbol], ctx.period, ctx.data[ctx.benchmark]).excess
      : performance(ctx.data[s.symbol], ctx.period),
  })).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value ?? 0)))
  return (
    <>
      <Panel
        className="sector-detail"
        title="Every sector. A different story."
        action={
          <div className="segmented">
            <button
              onClick={() => setRelative(false)}
              className={!relative ? 'active' : ''}
            >
              Absolute return
            </button>
            <button
              onClick={() => setRelative(true)}
              className={relative ? 'active' : ''}
            >
              vs {ctx.benchmark}
            </button>
          </div>
        }
      >
        <SectorHeatmap ctx={ctx} relative={relative} />
        <div className="panel-note">
          All 11 U.S. equity sectors, represented by Select Sector SPDR ETFs.
          Tile size does not indicate market capitalization.
        </div>
      </Panel>
      <div className="two-col">
        <Panel
          title="Sector momentum map"
          eyebrow={`RELATIVE TO ${ctx.benchmark}`}
          action={<span className="small muted">Fixed 1M / 3M windows</span>}
        >
          <RotationChart items={rotation} />
          <p className="panel-note">
            Horizontal: 3-month excess return. Vertical: 1-month excess return.
            A simple momentum view, not a forecast or proprietary
            relative-rotation model.
          </p>
        </Panel>
        <Panel
          title={`${ctx.period} sector ranking`}
          eyebrow={
            relative ? 'EXCESS RETURN · PERCENTAGE POINTS' : 'ABSOLUTE RETURN'
          }
        >
          <div className="ranking-bars">
            {rows.map((s, i) => (
              <button key={s.symbol} onClick={() => ctx.compare([s.symbol])}>
                <span className="rank">{i + 1}</span>
                <span className="bar-label">
                  {s.name}
                  <small>{s.symbol}</small>
                </span>
                <span className="bar-track">
                  <i
                    style={{
                      width: `${(Math.abs(s.value ?? 0) / max) * 100}%`,
                      background:
                        s.value != null && s.value < 0 ? '#ba7772' : '#88b970',
                    }}
                  />
                </span>
                <Change value={s.value} suffix={relative ? 'pp' : undefined} />
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <Panel
        title="Performance across time"
        action={<span className="small muted">Click a sector to compare</span>}
      >
        <div className="table-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Sector</th>
                {(
                  ['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'] as const
                ).map((p) => (
                  <th key={p} className="right">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTORS.map((s) => (
                <tr key={s.symbol}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => ctx.compare([s.symbol])}
                    >
                      <span
                        className="color-dot"
                        style={{ background: s.color }}
                      />
                      {s.name}
                      <small>{s.symbol}</small>
                    </button>
                  </td>
                  {(
                    ['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'] as const
                  ).map((p) => (
                    <td key={p} className="right">
                      <Change value={performance(ctx.data[s.symbol], p)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-note">
          Multi-year returns are cumulative. ETFs are investable proxies and may
          differ from their underlying indexes because of fees, distributions
          and tracking differences.
        </p>
      </Panel>
    </>
  )
}

export function Comparison({ ctx }: { ctx: MarketContext }) {
  const [mode, setMode] = useState<
    'return' | 'relative' | 'drawdown' | 'growth'
  >('return')
  const series = [...new Set([...ctx.selected, ctx.benchmark])]
  const histories = series
    .map((s) => ctx.data[s])
    .filter((h): h is History => !!h)
  const rows = chartData(histories, ctx.period, mode, ctx.benchmark)
  return (
    <>
      <Panel
        title="Build your comparison"
        action={
          <span className="small muted">Up to 12 assets + benchmark</span>
        }
      >
        <div className="preset-row">
          <span>Quick sets</span>
          {[
            { name: 'All sectors', symbols: SECTORS.map((s) => s.symbol) },
            {
              name: 'Mega-cap tech',
              symbols: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN'],
            },
            {
              name: 'Risk & safe havens',
              symbols: ['QQQ', 'IWM', 'GLD', 'TLT', 'UUP'],
            },
            {
              name: 'Around the world',
              symbols: ['EFA', 'EEM', 'EWJ', 'FXI', 'INDA'],
            },
          ].map((p) => (
            <button key={p.name} onClick={() => ctx.setSelected(p.symbols)}>
              {p.name}
            </button>
          ))}
        </div>
        <SymbolChips
          symbols={series}
          benchmark={ctx.benchmark}
          onRemove={(s) => ctx.setSelected(ctx.selected.filter((x) => x !== s))}
          onAdd={(s) => ctx.setSelected([...ctx.selected, s].slice(0, 12))}
        />
        <p className="panel-note">
          Use the asset search above to add any supported ticker, including
          exchange suffixes such as .L or .TO. Returns are in each asset’s local
          currency.
        </p>
      </Panel>
      <Panel
        title={
          mode === 'growth'
            ? 'Growth of $10,000'
            : mode === 'relative'
              ? `Performance vs ${ctx.benchmark}`
              : mode === 'drawdown'
                ? 'The path below the peak'
                : 'Performance, on equal footing'
        }
        action={
          <div className="segmented">
            {(['return', 'relative', 'drawdown', 'growth'] as const).map(
              (m) => (
                <button
                  key={m}
                  className={mode === m ? 'active' : ''}
                  onClick={() => setMode(m)}
                >
                  {m === 'return'
                    ? 'Return'
                    : m === 'relative'
                      ? 'Relative'
                      : m === 'drawdown'
                        ? 'Drawdown'
                        : '$10k growth'}
                </button>
              ),
            )}
          </div>
        }
      >
        <PerformanceChart
          rows={rows}
          symbols={series}
          benchmark={ctx.benchmark}
          mode={mode}
          height={430}
          loading={ctx.loading.length > 0}
        />
        <div className="chart-caption">
          <span>
            {rows.length
              ? `${shortDate(String(rows[0].date))} – ${shortDate(String(rows.at(-1)!.date))}`
              : 'Common trading dates only'}
          </span>
          <span>{rows.length} matched observations</span>
        </div>
      </Panel>
      <Panel title="Beyond the return">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th className="right">Return</th>
                <th className="right">vs {ctx.benchmark}</th>
                <th className="right">Ann. volatility</th>
                <th className="right">Max drawdown</th>
                <th className="right">Beta</th>
                <th className="right">Correlation</th>
                <th className="right">Currency</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => {
                const m = metrics(
                  ctx.data[s],
                  ctx.period,
                  ctx.data[ctx.benchmark],
                )
                return (
                  <tr key={s}>
                    <td>
                      <strong>{s}</strong>
                      <small className="block muted">{asset(s).name}</small>
                    </td>
                    <td className="right">
                      <Change value={m.change} />
                    </td>
                    <td className="right">
                      <Change value={m.excess} suffix="pp" />
                    </td>
                    <td className="right">
                      {m.volatility === null ? '—' : `${num(m.volatility)}%`}
                    </td>
                    <td className="right">
                      <Change value={m.drawdown} />
                    </td>
                    <td className="right">{num(m.beta)}</td>
                    <td className="right">{num(m.correlation)}</td>
                    <td className="right muted">
                      {ctx.data[s]?.currency ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="panel-note">
          Chart dates are aligned across every selected asset; table returns use
          each asset’s full selected window. Beta, excess return and correlation
          use pairwise common dates with the benchmark. No currency conversion
          is applied.
        </p>
      </Panel>
    </>
  )
}
