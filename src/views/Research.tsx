import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { asset, CATALOG, GLOBAL, SECTORS } from '../lib/catalog'
import {
  downloadCSV,
  align,
  correlation,
  dailyReturns,
  maxDrawdown,
  metrics,
  num,
  pct,
  portfolioSeries,
  shortDate,
  stdev,
  usd,
} from '../lib/analytics'
import type { MarketContext } from '../lib/context'
import type { History } from '../lib/types'
import { Change, Empty, Panel, Stat } from '../components/UI'
import { DistributionChart, PerformanceChart } from '../components/Charts'
import { AssetTable } from './Stocks'

export function Correlations({ ctx }: { ctx: MarketContext }) {
  const [universe, setUniverse] = useState<'sectors' | 'global' | 'selection'>(
    'sectors',
  )
  const symbols = [
    ...new Set([
      ctx.benchmark,
      ...(universe === 'sectors'
        ? SECTORS.map((s) => s.symbol)
        : universe === 'global'
          ? ['QQQ', 'IWM', 'EFA', 'EEM', 'GLD', 'TLT', 'HYG', 'UUP']
          : ctx.selected),
    ]),
  ]
  const loaded = symbols
    .map((s) => ctx.data[s])
    .filter((h): h is History => !!h)
  const cells = symbols.map((a) =>
    symbols.map((b) => {
      if (!ctx.data[a] || !ctx.data[b]) return null
      const { values } = align([ctx.data[a], ctx.data[b]], ctx.period)
      return correlation(
        dailyReturns(values[a] ?? []),
        dailyReturns(values[b] ?? []),
      )
    }),
  )
  let pair: { a: string; b: string; value: number } | null = null
  cells.forEach((row, i) =>
    row.forEach((v, j) => {
      if (j > i && v !== null && (!pair || v < pair.value))
        pair = { a: symbols[i], b: symbols[j], value: v }
    }),
  )
  const lowest = pair as { a: string; b: string; value: number } | null
  return (
    <>
      <Panel
        title="How closely do assets move together?"
        action={
          <div className="segmented">
            {(['sectors', 'global', 'selection'] as const).map((u) => (
              <button
                key={u}
                className={u === universe ? 'active' : ''}
                onClick={() => {
                  setUniverse(u)
                  if (u === 'global') void ctx.load(GLOBAL.map((a) => a.symbol))
                }}
              >
                {u === 'sectors'
                  ? 'Sectors'
                  : u === 'global'
                    ? 'Global assets'
                    : 'My comparison'}
              </button>
            ))}
          </div>
        }
      >
        <div className="correlation-summary">
          <p>
            Correlation of daily adjusted returns over{' '}
            <strong>{ctx.period}</strong>. Click any pair to compare its
            performance.
          </p>
          <span className="small muted">
            {loaded.length}/{symbols.length} histories loaded
          </span>
        </div>
        <div className="table-scroll">
          <table className="correlation-table">
            <thead>
              <tr>
                <th />
                {symbols.map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {symbols.map((a, i) => (
                <tr key={a}>
                  <th>
                    <span>{a}</span>
                    <small>{asset(a).name}</small>
                  </th>
                  {symbols.map((b, j) => {
                    const v = cells[i][j]
                    return (
                      <td key={b}>
                        <button
                          aria-label={`Compare ${a} and ${b}, correlation ${num(v)}`}
                          onClick={() => ctx.compare([...new Set([a, b])])}
                          style={{
                            background:
                              v === null
                                ? '#18201c'
                                : i === j
                                  ? '#28362b'
                                  : v >= 0
                                    ? `rgba(145,195,123,${0.08 + v * 0.62})`
                                    : `rgba(196,125,128,${0.08 + Math.abs(v) * 0.6})`,
                            color:
                              v !== null && v > 0.7 ? '#eaf6df' : '#d6e1d6',
                          }}
                        >
                          {num(v)}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="correlation-legend">
          <span>−1 · Opposite movement</span>
          <i />
          <span>0 · Little linear relationship</span>
          <i />
          <span>+1 · Move together</span>
          <button className="button" onClick={() => downloadCSV(`market-atlas-correlation-${ctx.period}.csv`, ['Asset', ...symbols], symbols.map((symbol, i) => [symbol, ...cells[i]]))}>Export matrix</button>
        </div>
        <p className="panel-note">
          Pearson correlation, calculated on common trading dates for each pair;
          at least 3 returns are required. Correlation changes over time and
          does not by itself measure diversification or causation.
        </p>
      </Panel>
      <div className="two-col">
        <Panel title="The least correlated pair" eyebrow="IN THIS SELECTION">
          <div className="correlation-callout">
            {lowest ? (
              <>
                <strong>
                  {lowest.a} <span>×</span> {lowest.b}
                </strong>
                <span className="correlation-number">{num(lowest.value)}</span>
                <p>
                  {asset(lowest.a).name} and {asset(lowest.b).name} have the
                  lowest measured daily-return correlation in this set over{' '}
                  {ctx.period}.
                </p>
                <button
                  className="button"
                  onClick={() => ctx.compare([lowest.a, lowest.b])}
                >
                  Explore this pair
                </button>
              </>
            ) : (
              <p className="muted">
                Load at least two assets with enough overlapping history.
              </p>
            )}
          </div>
        </Panel>
        <Panel title="Reading the matrix">
          <div className="explanation-rows">
            <div>
              <strong>Near +1</strong>
              <p>
                Daily returns tend to move in the same direction. Similar
                exposures can behave alike in a selloff.
              </p>
            </div>
            <div>
              <strong>Near 0</strong>
              <p>
                No strong linear relationship in this window. This does not
                imply independence or eliminate risk.
              </p>
            </div>
            <div>
              <strong>Near −1</strong>
              <p>
                Daily returns tend to move in opposite directions. The
                relationship may change with market conditions.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </>
  )
}

export function Portfolio({ ctx }: { ctx: MarketContext }) {
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem('market-atlas-portfolio') ?? 'null',
      )
      if (
        stored &&
        typeof stored === 'object' &&
        !Array.isArray(stored) &&
        Object.keys(stored).length <= 12 &&
        Object.entries(stored).every(
          ([s, w]) =>
            /^[A-Z0-9^][A-Z0-9.^=\-]{0,19}$/.test(s) &&
            typeof w === 'number' &&
            w >= 0 &&
            w <= 100,
        )
      )
        return stored
    } catch {}
    return { SPY: 60, AGG: 40 }
  })
  const [newSymbol, setNewSymbol] = useState('XLK')
  useEffect(() => {
    void ctx.load(Object.keys(weights))
  }, [weights, ctx.load])
  const update = (next: Record<string, number>) => {
    setWeights(next)
    try {
      localStorage.setItem('market-atlas-portfolio', JSON.stringify(next))
    } catch {}
    void ctx.load(Object.keys(next))
  }
  const symbols = Object.keys(weights),
    total = Object.values(weights).reduce((a, b) => a + b, 0),
    valid = Math.abs(total - 100) < 0.001
  const active = symbols.filter((s) => weights[s] > 0),
    missing = active.filter((s) => !ctx.data[s]),
    foreign = active.filter(
      (s) => ctx.data[s] && ctx.data[s].currency !== 'USD',
    )
  const histories = active
    .map((s) => ctx.data[s])
    .filter((h): h is History => !!h)
  const rows =
    valid && !missing.length && !foreign.length && ctx.data[ctx.benchmark]
      ? portfolioSeries(histories, weights, ctx.period, ctx.data[ctx.benchmark])
      : []
  const values = rows.map((r) => Number(r.Portfolio)),
    returns = dailyReturns(values),
    last = values.at(-1),
    change = last == null ? null : (last / 10000 - 1) * 100
  const benchmarkEnd = rows.at(-1)?.[ctx.benchmark],
    bmChange =
      benchmarkEnd == null ? null : (Number(benchmarkEnd) / 10000 - 1) * 100
  const bins = Array.from({ length: 9 }, (_, i) => ({
    name: i === 0 ? '< −3.5%' : i === 8 ? '> 3.5%' : `${i - 4}%`,
    value: 0,
  }))
  returns.forEach((r) => {
    bins[Math.max(0, Math.min(8, Math.round(r * 100) + 4))].value++
  })
  const presets: { name: string; weights: Record<string, number> }[] = [
    { name: '60 / 40', weights: { SPY: 60, AGG: 40 } },
    { name: 'Growth', weights: { QQQ: 50, SPY: 30, IWM: 20 } },
    {
      name: 'Global balance',
      weights: { SPY: 40, EFA: 20, EEM: 10, AGG: 20, GLD: 10 },
    },
  ]
  return (
    <>
      <div className="portfolio-grid">
        <Panel
          title="Build a hypothetical portfolio"
          eyebrow="STARTING VALUE · $10,000"
        >
          <div className="preset-row">
            {presets.map((p) => (
              <button
                key={p.name}
                onClick={() => update(p.weights as Record<string, number>)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="allocations">
            {symbols.map((s, i) => (
              <div className="allocation" key={s}>
                <span
                  className="color-dot"
                  style={{
                    background: [
                      '#b8e986',
                      '#8ab4ed',
                      '#d89390',
                      '#bfabeb',
                      '#f0b26f',
                    ][i % 5],
                  }}
                />
                <span>
                  <strong>{s}</strong>
                  <small>{asset(s).name}</small>
                </span>
                <label>
                  <input
                    aria-label={`${s} allocation percent`}
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={weights[s]}
                    onChange={(e) =>
                      update({
                        ...weights,
                        [s]: Math.min(
                          100,
                          Math.max(0, Number(e.target.value) || 0),
                        ),
                      })
                    }
                  />
                  %
                </label>
                <button
                  className="icon-button"
                  aria-label={`Remove ${s} allocation`}
                  onClick={() => {
                    const next = { ...weights }
                    delete next[s]
                    update(next)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="add-allocation">
            <select
              aria-label="Asset to add to portfolio"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value)}
            >
              {CATALOG.filter((a) => !symbols.includes(a.symbol)).map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol} · {a.name}
                </option>
              ))}
            </select>
            <button
              className="icon-button"
              aria-label="Add portfolio asset"
              disabled={symbols.length >= 12 || symbols.includes(newSymbol)}
              onClick={() => update({ ...weights, [newSymbol]: 0 })}
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="allocation-total">
            <span>Total allocation</span>
            <strong className={valid ? 'positive' : 'negative'}>
              {num(total, 0)}%
            </strong>
          </div>
          {!valid && (
            <p className="validation-message">
              Set allocations to 100% to calculate the portfolio.
            </p>
          )}
          {missing.length > 0 && (
            <button
              className="button"
              onClick={() => void ctx.load(missing, true)}
            >
              Load {missing.join(', ')} history
            </button>
          )}
          {foreign.length > 0 && (
            <p className="validation-message">
              Portfolio simulation supports USD assets only. Remove{' '}
              {foreign.join(', ')} to avoid mixing currencies.
            </p>
          )}
          <p className="panel-note">
            Buy and hold from the first common observation. No rebalancing, new
            deposits, taxes or trading costs. Weights are saved on this device.
          </p>
        </Panel>
        <Panel
          title="Your portfolio through time"
          action={
            <button className="button" disabled={!rows.length} onClick={() => downloadCSV(`market-atlas-portfolio-${ctx.period}.csv`, ['Date', 'Portfolio value (USD)', `${ctx.benchmark} value (USD)`], rows.map(row => [row.date, row.Portfolio, row[ctx.benchmark]]))}>Export simulation</button>
          }
        >
          <div className="portfolio-value">
            <strong>{usd(last)}</strong>
            <Change value={change} />
            <span>from a hypothetical $10,000</span>
          </div>
          <PerformanceChart
            rows={rows}
            symbols={['Portfolio', ctx.benchmark]}
            benchmark={ctx.benchmark}
            mode="growth"
            height={330}
            loading={ctx.loading.length > 0}
          />
          <div className="chart-caption">
            <span>
              {rows.length
                ? `${shortDate(String(rows[0].date))} – ${shortDate(String(rows.at(-1)!.date))}`
                : 'Waiting for a valid allocation and complete history'}
            </span>
            <span>Adjusted close basis</span>
          </div>
        </Panel>
      </div>
      <div className="stats-row">
        <Stat label="Portfolio return" value={<Change value={change} />} />
        <Stat
          label={`Excess vs ${ctx.benchmark}`}
          value={
            <Change
              value={
                change !== null && bmChange !== null ? change - bmChange : null
              }
              suffix="pp"
            />
          }
        />
        <Stat
          label="Annualized volatility"
          value={
            returns.length > 2
              ? `${num(stdev(returns) * Math.sqrt(252) * 100, 1)}%`
              : '—'
          }
        />
        <Stat
          label="Maximum drawdown"
          value={<Change value={maxDrawdown(values)} />}
        />
      </div>
      <div className="two-col">
        <Panel title="What drove the result?">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="right">Initial weight</th>
                  <th className="right">Asset return</th>
                  <th className="right">Contribution</th>
                </tr>
              </thead>
              <tbody>
                {active.map((s) => {
                  let r: number | null = null
                  if (rows.length) {
                    const points = ctx.data[s].points.filter(
                      (p) =>
                        p.date >= String(rows[0].date) &&
                        p.date <= String(rows.at(-1)!.date),
                    )
                    if (points.length > 1)
                      r =
                        (points.at(-1)!.adjusted / points[0].adjusted - 1) * 100
                  }
                  return (
                    <tr key={s}>
                      <td>
                        <strong>{s}</strong>
                      </td>
                      <td className="right">{num(weights[s], 0)}%</td>
                      <td className="right">
                        <Change value={r} />
                      </td>
                      <td className="right">
                        <Change
                          value={r === null ? null : (r * weights[s]) / 100}
                          suffix="pp"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="panel-note">
            Contribution equals starting weight × asset return over the same
            portfolio dates. Distributions are reflected only to the extent
            included by the provider’s adjusted prices.
          </p>
        </Panel>
        <Panel
          title="Distribution of daily returns"
          action={
            <span className="small muted">{returns.length} observations</span>
          }
        >
          <DistributionChart rows={bins} />
          <p className="panel-note">
            One-percentage-point bins, with tails collected in the first and
            last bin. Historical outcomes do not predict future returns.
          </p>
        </Panel>
      </div>
    </>
  )
}

export function Watchlist({
  ctx,
  onOpen,
}: {
  ctx: MarketContext
  onOpen: (s: string) => void
}) {
  const available = ctx.watchlist.filter((s) => ctx.data[s]),
    positive = available.filter(
      (s) => (metrics(ctx.data[s], ctx.period).change ?? -1) > 0,
    )
  return (
    <>
      <div className="watchlist-intro">
        <div>
          <h2>Your market, in one place.</h2>
          <p>
            Saved on this device. Search above or star any stock to build your
            list.
          </p>
        </div>
        <span className="count-badge">{ctx.watchlist.length} assets</span>
      </div>
      {ctx.watchlist.length ? (
        <>
          <div className="stats-row three">
            <Stat label="Tracked assets" value={ctx.watchlist.length} />
            <Stat
              label={`Positive over ${ctx.period}`}
              value={`${positive.length} / ${available.length}`}
              detail="Among loaded assets"
            />
            <Stat
              label="Selected benchmark"
              value={ctx.benchmark}
              detail={asset(ctx.benchmark).name}
            />
          </div>
          <Panel
            title="Watchlist"
            action={
              <button
                className="button"
                onClick={() => ctx.compare(ctx.watchlist.slice(0, 12))}
              >
                Compare watchlist
              </button>
            }
          >
            <AssetTable
              ctx={ctx}
              assets={ctx.watchlist.map(asset)}
              onOpen={onOpen}
            />
          </Panel>
        </>
      ) : (
        <Empty
          title="Start following the market"
          action={
            <button
              className="button primary"
              onClick={() =>
                ['AAPL', 'MSFT', 'NVDA', 'SPY'].forEach(ctx.toggleWatch)
              }
            >
              Add a starter list
            </button>
          }
        >
          Star a stock, sector ETF or benchmark to save it here.
        </Empty>
      )}
    </>
  )
}

export function Methodology() {
  return (
    <div className="methodology">
      <Panel title="Know what you’re looking at" eyebrow="DATA & METHODOLOGY">
        <p>
          Market Atlas is an open research workspace for comparing market
          behavior. Every chart is calculated from retrieved market
          observations. There are no generated prices, fabricated news, or
          simulated market quotes.
        </p>
        <div className="method-grid">
          <article>
            <span className="method-number">01</span>
            <h3>Source & freshness</h3>
            <p>
              Daily price history and symbol search come from Yahoo Finance’s
              public, unofficial endpoints. Data may be delayed. Histories are
              cached for 15 minutes; if refresh fails, the last cached series
              may be served for up to seven days with a visible stale label. The
              current daily bar can change before the market closes.
            </p>
            <p>
              Check the date on the chart. Refreshing retrieves the newest
              available cached history; this is not an execution-quality
              real-time feed.
            </p>
            <a
              href="https://help.yahoo.com/kb/SLN2310.html"
              target="_blank"
              rel="noreferrer"
            >
              Exchange delays and providers ↗
            </a>
          </article>
          <article>
            <span className="method-number">02</span>
            <h3>Prices & performance</h3>
            <p>
              Return = (ending adjusted close / starting adjusted close − 1) ×
              100. Adjustment may reflect splits and distributions as provided
              by the source. If adjustment is unavailable, an explicit warning
              identifies unadjusted prices. Multi-year returns are cumulative,
              not annualized.
            </p>
            <p>
              Latest quote cards use the provider’s latest price. One-day
              changes use the last two adjusted daily observations, so a current
              quote and its daily series may have different timestamps.
            </p>
          </article>
          <article>
            <span className="method-number">03</span>
            <h3>Dates & benchmarks</h3>
            <p>
              A period starts at the last observation on or before its calendar
              cutoff. YTD starts at the prior year’s final trading observation.
              Charts use dates common to every selected asset. Assets without
              enough history show no result for that period.
            </p>
            <p>
              SPY, QQQ, DIA, IWM and VTI are ETF proxies, not the index levels
              themselves. Sector ETFs track the 11 U.S. sectors; they are not a
              global sector universe.
            </p>
            <a
              href="https://www.ssga.com/us/en/individual/capabilities/equities/sector-investing/select-sector-etfs"
              target="_blank"
              rel="noreferrer"
            >
              About the sector ETF proxies ↗
            </a>
          </article>
          <article>
            <span className="method-number">04</span>
            <h3>Risk & relationships</h3>
            <p>
              Annualized volatility is the sample standard deviation of daily
              returns × √252. Maximum drawdown is the largest adjusted-price
              decline from a running peak within the window. Beta is
              covariance(asset, benchmark) / variance(benchmark).
            </p>
            <p>
              Correlation uses Pearson’s coefficient of paired daily returns.
              Excess return is asset cumulative return minus benchmark
              cumulative return, in percentage points. These calculations use
              common observations and are not forecasts.
            </p>
          </article>
          <article>
            <span className="method-number">05</span>
            <h3>Technical indicators</h3>
            <p>
              RSI uses Wilder’s 14-session smoothing. Moving averages are simple
              means of the last 50 and 200 adjusted closes. The price range uses
              up to 252 sessions of adjusted closes, not intraday highs or lows.
            </p>
            <p>
              The momentum map compares 3-month and 1-month excess returns with
              a selected benchmark. It is a simple descriptive scatter plot, not
              a proprietary relative-rotation graph.
            </p>
          </article>
          <article>
            <span className="method-number">06</span>
            <h3>Portfolio research</h3>
            <p>
              The simulator invests a hypothetical $10,000 at initial weights on
              the first shared date, then holds those positions. Only
              USD-denominated assets are supported. No rebalancing, commissions,
              tax, cash flows or execution costs are modeled.
            </p>
            <p>
              Results depend on the selected assets and dates and omit failed or
              delisted stocks that a present-day selection may miss. This
              survivorship effect can overstate historical opportunity.
            </p>
          </article>
        </div>
      </Panel>
      <Panel title="Coverage & practical limits">
        <ul className="method-list">
          <li>
            All 11 U.S. sectors, five U.S. benchmarks, global and asset-class
            ETFs, and a curated U.S. stock screener. Search can resolve
            additional provider-supported tickers.
          </li>
          <li>
            Up to five years of daily history, subject to an asset’s listing
            date and provider availability. Fundamental valuations, analyst
            estimates, news, options chains and real-time trading are not
            included.
          </li>
          <li>
            Stock and cross-asset comparisons use local-currency percentage
            returns without foreign-exchange conversion. ETF returns include
            their own fees and tracking effects; commodity ETFs do not equal
            spot commodity returns.
          </li>
          <li>
            The screener’s sector labels and constituents are a maintained
            research catalog and may change. Missing data stays missing. Cached
            and unadjusted series are labeled.
          </li>
          <li>
            Watchlists and portfolio weights are stored only in this browser.
            There is no account sync, brokerage connection or order execution.
          </li>
        </ul>
        <div className="research-note">
          For research and education. Nothing here is personalized investment
          advice or a recommendation to trade. Historical results do not
          guarantee future performance.
        </div>
      </Panel>
      <Panel title="Open source & data rights">
        <p>
          The application code is MIT licensed. Market data remains subject to
          Yahoo and its upstream providers’ terms; the code license does not
          grant market-data redistribution rights. The unofficial endpoint has
          no guaranteed availability. For commercial public-data distribution,
          connect a feed with the display rights your use requires.
        </p>
        <div className="source-links">
          <a
            href="https://github.com/DevanMetz/market-atlas"
            target="_blank"
            rel="noreferrer"
          >
            View source on GitHub ↗
          </a>
          <a
            href="https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html"
            target="_blank"
            rel="noreferrer"
          >
            Yahoo terms ↗
          </a>
        </div>
      </Panel>
    </div>
  )
}

export const describeReturn = (value: number | null) => pct(value)
