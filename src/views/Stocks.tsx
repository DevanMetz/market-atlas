import { useMemo, useState } from 'react'
import {
  ArrowDownUp,
  ExternalLink,
  SlidersHorizontal,
  Star,
} from 'lucide-react'
import { asset, SECTORS, STOCKS } from '../lib/catalog'
import {
  chartData,
  metrics,
  num,
  performance,
  shortDate,
} from '../lib/analytics'
import type { MarketContext } from '../lib/context'
import type { Asset, History } from '../lib/types'
import { Change, Empty, Panel, Stat, Toggle } from '../components/UI'
import { PerformanceChart, Sparkline } from '../components/Charts'
import { useQueryChoice, useQuerySetting } from '../lib/viewSettings'

type Sort = 'symbol' | 'price' | 'day' | 'change' | 'volatility' | 'rsi'
export function AssetTable({
  ctx,
  assets,
  onOpen,
  emptyTitle = 'No assets match these filters',
}: {
  ctx: MarketContext
  assets: Asset[]
  onOpen: (symbol: string) => void
  emptyTitle?: string
}) {
  const [sort, setSort] = useQueryChoice(
    'sort',
    ['symbol', 'price', 'day', 'change', 'volatility', 'rsi'] as const,
    'change',
  )
  const [direction, setDirection] = useQueryChoice(
    'direction',
    ['asc', 'desc'] as const,
    'desc',
  )
  const asc = direction === 'asc'
  const setAsc = (value: boolean) => setDirection(value ? 'asc' : 'desc')
  const [page, setPage] = useState(0)
  const rows = assets.map((a) => ({
    ...a,
    ...metrics(ctx.data[a.symbol], ctx.window, ctx.data[ctx.benchmark]),
    price: ctx.data[a.symbol]?.price,
  }))
  const ordered = rows.sort((a, b) => {
    const av = a[sort],
      bv = b[sort]
    if (av == null) return 1
    if (bv == null) return -1
    return (
      (typeof av === 'string'
        ? String(av).localeCompare(String(bv))
        : Number(av) - Number(bv)) * (asc ? 1 : -1)
    )
  })
  const currentPage = Math.min(
      page,
      Math.max(0, Math.ceil(ordered.length / 20) - 1),
    ),
    visible = ordered.slice(currentPage * 20, (currentPage + 1) * 20)
  const order = (key: Sort) => {
    setAsc(sort === key ? !asc : key === 'symbol')
    setSort(key)
    setPage(0)
  }
  const heading = (label: string, key: Sort) => (
    <button
      className={sort === key ? 'sort active' : 'sort'}
      onClick={() => order(key)}
    >
      {label}
      <ArrowDownUp size={12} />
    </button>
  )
  if (!assets.length)
    return (
      <Empty title={emptyTitle}>
        Try a different filter or use search to add a symbol.
      </Empty>
    )
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th />
              <th>{heading('Asset', 'symbol')}</th>
              <th className="right">{heading('Price', 'price')}</th>
              <th className="right">{heading('1D', 'day')}</th>
              <th className="right">{heading(ctx.windowLabel, 'change')}</th>
              <th className="right">vs {ctx.benchmark}</th>
              <th className="right">{heading('Volatility', 'volatility')}</th>
              <th className="right">{heading('RSI 14', 'rsi')}</th>
              <th>Trend · 40 sessions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr
                key={a.symbol}
                className={ctx.errors[a.symbol] ? 'data-error-row' : ''}
              >
                <td>
                  <button
                    className={`icon-button star-button ${ctx.watchlist.includes(a.symbol) ? 'saved' : ''}`}
                    aria-label={`${ctx.watchlist.includes(a.symbol) ? 'Remove' : 'Add'} ${a.symbol} ${ctx.watchlist.includes(a.symbol) ? 'from' : 'to'} watchlist`}
                    onClick={() => ctx.toggleWatch(a.symbol)}
                  >
                    <Star
                      size={16}
                      fill={
                        ctx.watchlist.includes(a.symbol)
                          ? 'currentColor'
                          : 'none'
                      }
                    />
                  </button>
                </td>
                <td>
                  <button
                    className="table-asset"
                    onClick={() => onOpen(a.symbol)}
                  >
                    <span className="ticker-avatar">
                      {a.symbol.slice(0, 2)}
                    </span>
                    <span>
                      <strong>{a.symbol}</strong>
                      <small>{a.name}</small>
                    </span>
                  </button>
                  {ctx.errors[a.symbol] && (
                    <small className="negative">Data unavailable</small>
                  )}
                </td>
                <td className="right">
                  {num(a.price)}
                  <small className="currency">
                    {ctx.data[a.symbol]?.currency}
                  </small>
                </td>
                <td className="right">
                  <Change value={a.day} />
                </td>
                <td className="right">
                  <Change value={a.change} />
                </td>
                <td className="right">
                  <Change value={a.excess} suffix="pp" />
                </td>
                <td className="right">
                  {a.volatility === null ? '—' : `${num(a.volatility, 1)}%`}
                </td>
                <td className="right">
                  <span
                    className={`rsi ${a.rsi !== null && a.rsi > 70 ? 'hot' : a.rsi !== null && a.rsi < 30 ? 'cold' : ''}`}
                  >
                    {num(a.rsi, 0)}
                  </span>
                </td>
                <td>
                  <Sparkline
                    history={ctx.data[a.symbol]}
                    color={(a.change ?? 0) >= 0 ? '#b8e986' : '#e59690'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          Showing {currentPage * 20 + 1}–
          {Math.min((currentPage + 1) * 20, ordered.length)} of {ordered.length}{' '}
          assets
        </span>
        <div>
          <button
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <button
            disabled={(currentPage + 1) * 20 >= ordered.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  )
}

export function StockDetail({
  symbol,
  ctx,
}: {
  symbol: string
  ctx: MarketContext
}) {
  const history = ctx.data[symbol],
    m = metrics(history, ctx.window, ctx.data[ctx.benchmark])
  const series = [...new Set([symbol, ctx.benchmark])],
    rows = chartData(
      series.map((s) => ctx.data[s]).filter((h): h is History => !!h),
      ctx.window,
    )
  const last = m.lastAdjusted
  const position =
    m.low !== null && m.high !== null && last !== null && m.high > m.low
      ? Math.max(0, Math.min(100, ((last - m.low) / (m.high - m.low)) * 100))
      : null
  return (
    <Panel className="stock-detail">
      <div className="stock-heading">
        <div className="stock-identity">
          <span className="ticker-avatar large">{symbol.slice(0, 2)}</span>
          <div>
            <span className="eyebrow">
              {history?.exchange ?? asset(symbol).sector ?? 'ASSET RESEARCH'} ·{' '}
              {history?.currency ?? '—'}
            </span>
            <h2>
              {history?.name ?? asset(symbol).name}
              <span className="muted"> {symbol}</span>
            </h2>
          </div>
        </div>
        <div className="stock-quote">
          <strong>{num(history?.price)}</strong>
          <Change value={m.day} />
          <small>latest quote · 1D adjusted change</small>
        </div>
        <button
          className={`button ${ctx.watchlist.includes(symbol) ? 'saved' : ''}`}
          onClick={() => ctx.toggleWatch(symbol)}
        >
          <Star size={15} />
          {ctx.watchlist.includes(symbol) ? 'Watching' : 'Watch'}
        </button>
        <button className="button" onClick={() => ctx.compare([symbol])}>
          Compare
        </button>
      </div>
      {ctx.errors[symbol] ? (
        <Empty
          title={`Could not load ${symbol}`}
          action={
            <button
              className="button"
              onClick={() => void ctx.load([symbol], true)}
            >
              Retry
            </button>
          }
        >
          {ctx.errors[symbol]}
        </Empty>
      ) : (
        <>
          <div className="stock-body">
            <div>
              <div className="small-chart-legend">
                <span>
                  <i style={{ background: asset(symbol).color ?? '#b8e986' }} />
                  {symbol}
                </span>
                <span>
                  <i className="dashed" />
                  {ctx.benchmark}
                </span>
              </div>
              <PerformanceChart
                rows={rows}
                symbols={series}
                benchmark={ctx.benchmark}
                height={280}
                loading={ctx.loading.includes(symbol)}
              />
            </div>
            <div className="technicals">
              <span className="eyebrow">TECHNICAL SNAPSHOT</span>
              {m.technicalDate && (
                <span className="technical-date small muted">
                  As of {shortDate(m.technicalDate)}
                </span>
              )}
              <dl>
                <div>
                  <dt>RSI (14 sessions)</dt>
                  <dd>
                    {num(m.rsi, 1)}
                    <span className="muted">
                      {' '}
                      {m.rsi === null
                        ? ''
                        : m.rsi >= 70
                          ? 'Elevated'
                          : m.rsi <= 30
                            ? 'Depressed'
                            : 'Neutral'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>50-session average</dt>
                  <dd>{num(m.sma50)}</dd>
                </div>
                <div>
                  <dt>200-session average</dt>
                  <dd>{num(m.sma200)}</dd>
                </div>
                <div>
                  <dt>Price vs 200-session avg.</dt>
                  <dd>
                    <Change
                      value={
                        m.sma200 && last ? (last / m.sma200 - 1) * 100 : null
                      }
                    />
                  </dd>
                </div>
                <div>
                  <dt>Last session volume</dt>
                  <dd>{num(m.volume, 0)}</dd>
                </div>
              </dl>
              <span className="small muted">
                252-session adjusted close range
              </span>
              <div className="range-track">
                {position !== null && <i style={{ left: `${position}%` }} />}
              </div>
              <div className="range-labels">
                <span>{num(m.low)}</span>
                <span>{num(m.high)}</span>
              </div>
              <small className="muted">
                Averages and range use adjusted prices.
              </small>
            </div>
          </div>
          <div className="detail-stats">
            <Stat
              label={`${ctx.windowLabel} return`}
              value={<Change value={m.change} />}
            />
            <Stat
              label={`Excess vs ${ctx.benchmark}`}
              value={<Change value={m.excess} suffix="pp" />}
            />
            <Stat
              label="Annualized volatility"
              value={m.volatility === null ? '—' : `${num(m.volatility, 1)}%`}
            />
            <Stat label="Max drawdown" value={<Change value={m.drawdown} />} />
            <Stat label={`Beta vs ${ctx.benchmark}`} value={num(m.beta)} />
          </div>
          <div className="chart-caption">
            <span>
              {m.start && m.end
                ? `${shortDate(m.start)} – ${shortDate(m.end)}`
                : history
                  ? 'Not enough history for this window'
                  : 'Loading history…'}
            </span>
            <a
              href={`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`}
              target="_blank"
              rel="noreferrer"
            >
              View source <ExternalLink size={12} />
            </a>
          </div>
        </>
      )}
    </Panel>
  )
}

export function StocksView({
  ctx,
  focus,
  onFocus,
}: {
  ctx: MarketContext
  focus: string
  onFocus: (symbol: string) => void
}) {
  const [sector, setSector] = useQuerySetting(
    'sector',
    'All sectors',
    (value) => value === 'All sectors' || SECTORS.some((s) => s.name === value),
  )
  const [filter, setFilter] = useQuerySetting(
    'filter',
    '',
    (value) => value.length <= 80,
  )
  const [aboveValue, setAboveValue] = useQueryChoice(
    'above200',
    ['yes', 'no'] as const,
    'no',
  )
  const [positiveValue, setPositiveValue] = useQueryChoice(
    'positive',
    ['yes', 'no'] as const,
    'no',
  )
  const above = aboveValue === 'yes',
    positive = positiveValue === 'yes'
  const setAbove = (value: boolean) => setAboveValue(value ? 'yes' : 'no')
  const setPositive = (value: boolean) => setPositiveValue(value ? 'yes' : 'no')
  const universe = useMemo(
    () =>
      STOCKS.some((s) => s.symbol === focus)
        ? STOCKS
        : [asset(focus), ...STOCKS],
    [focus],
  )
  const filtered = universe.filter((a) => {
    const history = ctx.data[a.symbol],
      m = metrics(history, ctx.window)
    return (
      (sector === 'All sectors' || a.sector === sector) &&
      `${a.symbol} ${a.name}`.toLowerCase().includes(filter.toLowerCase()) &&
      (!above ||
        (!!m.sma200 && m.lastAdjusted !== null && m.lastAdjusted > m.sma200)) &&
      (!positive || (performance(history, ctx.window) ?? -1) > 0)
    )
  })
  return (
    <>
      <StockDetail ctx={ctx} symbol={focus} />
      <Panel
        title="Stock screener"
        eyebrow={`${STOCKS.length} SELECTED U.S. LARGE CAPS`}
        action={
          <span className="small muted">Search above for any other ticker</span>
        }
      >
        <div className="screener-filters">
          <SlidersHorizontal size={17} className="muted" />
          <input
            className="filter-input"
            placeholder="Filter this list…"
            aria-label="Filter stock list"
            maxLength={80}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            value={sector}
            aria-label="Filter by sector"
            onChange={(e) => setSector(e.target.value)}
          >
            <option>All sectors</option>
            {SECTORS.map((s) => (
              <option key={s.symbol}>{s.name}</option>
            ))}
          </select>
          <Toggle checked={above} onChange={() => setAbove(!above)}>
            Above 200-day avg.
          </Toggle>
          <Toggle checked={positive} onChange={() => setPositive(!positive)}>
            Positive {ctx.windowLabel}
          </Toggle>
        </div>
        <AssetTable ctx={ctx} assets={filtered} onOpen={onFocus} />
        <p className="panel-note">
          This is a curated research list, not an exchange-wide screener. RSI
          and moving averages are descriptive indicators, not buy or sell
          signals.
        </p>
      </Panel>
    </>
  )
}
