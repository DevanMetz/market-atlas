import { lazy, useCallback, useEffect, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  GitCompareArrows,
  Github,
  Globe2,
  Grid2X2,
  Layers3,
  Menu,
  Newspaper,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Search,
  Share2,
  Star,
  Wallet,
  X,
} from 'lucide-react'
import { BENCHMARKS, PERIODS, SECTORS, STOCKS, asset } from './lib/catalog'
import {
  dailyChange,
  downloadCSV,
  metrics,
  num,
  parseDateRange,
  shortDate,
  windowKey,
  windowLabel,
} from './lib/analytics'
import { useMarket } from './lib/useMarket'
import { preserveViewSettings } from './lib/viewSettings'
import { SavedViews } from './components/SavedViews'
import type { DateRange, Period, View } from './lib/types'
import type { MarketContext } from './lib/context'
import {
  BenchmarkPicker,
  Change,
  DateRangePicker,
  PeriodPicker,
  SymbolSearch,
} from './components/UI'
import { Sparkline } from './components/Sparkline'
import { AsyncContent } from './components/AsyncContent'

const Overview = lazy(() =>
  import('./views/Overview').then((module) => ({ default: module.Overview })),
)
const Comparison = lazy(() =>
  import('./views/Overview').then((module) => ({ default: module.Comparison })),
)
const SectorExplorer = lazy(() =>
  import('./views/Overview').then((module) => ({
    default: module.SectorExplorer,
  })),
)
const StocksView = lazy(() =>
  import('./views/Stocks').then((module) => ({ default: module.StocksView })),
)
const TrendsView = lazy(() =>
  import('./views/Trends').then((module) => ({ default: module.TrendsView })),
)
const RiskView = lazy(() =>
  import('./views/Risk').then((module) => ({ default: module.RiskView })),
)
const NewsView = lazy(() =>
  import('./views/News').then((module) => ({ default: module.NewsView })),
)
const Correlations = lazy(() =>
  import('./views/Research').then((module) => ({
    default: module.Correlations,
  })),
)
const Methodology = lazy(() =>
  import('./views/Research').then((module) => ({
    default: module.Methodology,
  })),
)
const Portfolio = lazy(() =>
  import('./views/Research').then((module) => ({ default: module.Portfolio })),
)
const Watchlist = lazy(() =>
  import('./views/Research').then((module) => ({ default: module.Watchlist })),
)

const NAV = [
  { id: 'overview', name: 'Market overview', icon: Grid2X2, tag: '01' },
  { id: 'sectors', name: 'Sector explorer', icon: Layers3, tag: '02' },
  { id: 'compare', name: 'Compare assets', icon: GitCompareArrows, tag: '03' },
  { id: 'stocks', name: 'Stock screener', icon: Search, tag: '04' },
  { id: 'trends', name: 'Trend lab', icon: TrendingUp, tag: '05' },
  { id: 'risk', name: 'Risk lab', icon: TrendingDown, tag: '06' },
  { id: 'news', name: 'News & sentiment', icon: Newspaper, tag: '07' },
  { id: 'correlations', name: 'Correlations', icon: Activity, tag: '08' },
  { id: 'portfolio', name: 'Portfolio lab', icon: Wallet, tag: '09' },
  { id: 'watchlist', name: 'Watchlist', icon: Star, tag: '10' },
] as const
const META: Record<View, { title: string; subtitle: string }> = {
  overview: {
    title: 'Market overview',
    subtitle: 'See the bigger picture. Find what’s moving beneath the surface.',
  },
  sectors: {
    title: 'Sector explorer',
    subtitle:
      'Follow the leaders. Understand the rotation across all 11 U.S. sectors.',
  },
  compare: {
    title: 'Compare assets',
    subtitle: 'Put stocks, sectors and benchmarks on the same starting line.',
  },
  stocks: {
    title: 'Stock screener',
    subtitle:
      'Find your next research question. Explore performance, momentum and risk.',
  },
  trends: {
    title: 'Trend lab',
    subtitle:
      'Explore changing returns, risk and relationships, one window at a time.',
  },
  risk: {
    title: 'Risk lab',
    subtitle: 'Compare losses, recovery times, and historical daily returns.',
  },
  news: {
    title: 'News & sentiment',
    subtitle:
      'Connect the headlines. Explore the language behind the market conversation.',
  },
  correlations: {
    title: 'Correlations',
    subtitle: 'Explore the relationships behind the returns.',
  },
  portfolio: {
    title: 'Portfolio lab',
    subtitle: 'Test an allocation. Understand its historical return and risk.',
  },
  watchlist: {
    title: 'Watchlist',
    subtitle: 'Keep the assets that matter to you within reach.',
  },
  methodology: {
    title: 'Data & methodology',
    subtitle: 'Transparent sources. Reproducible calculations. Clear limits.',
  },
}
const initial = new URLSearchParams(window.location.search)
function initialSymbols() {
  return (initial.get('symbols') ?? 'XLK,XLF,XLE')
    .split(',')
    .filter((s) => /^[A-Z0-9^][A-Z0-9.^=\-]{0,19}$/.test(s))
    .slice(0, 12)
}
function savedWatchlist() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem('market-atlas-watchlist') ?? 'null',
    )
    if (Array.isArray(parsed))
      return [
        ...new Set(
          parsed.filter(
            (s): s is string =>
              typeof s === 'string' && /^[A-Z0-9^][A-Z0-9.^=\-]{0,19}$/.test(s),
          ),
        ),
      ].slice(0, 100)
  } catch {}
  return ['AAPL', 'MSFT', 'NVDA', 'SPY']
}

export default function App() {
  const market = useMarket()
  const [view, setView] = useState<View>(() =>
    Object.keys(META).includes(initial.get('view') ?? '')
      ? (initial.get('view') as View)
      : 'overview',
  )
  const [period, setPeriod] = useState<Period>(() =>
    PERIODS.includes(initial.get('period') as Period)
      ? (initial.get('period') as Period)
      : 'YTD',
  )
  const [benchmark, setBenchmark] = useState(() =>
    BENCHMARKS.some((b) => b.symbol === initial.get('benchmark'))
      ? initial.get('benchmark')!
      : 'SPY',
  )
  const [dateRange, setDateRange] = useState<DateRange | null>(() =>
    parseDateRange(initial.get('start'), initial.get('end')),
  )
  const analysisWindow = dateRange ?? period
  const analysisLabel = windowLabel(analysisWindow)
  const [selected, setSelected] = useState(initialSymbols),
    [focus, setFocus] = useState(() =>
      /^[A-Z0-9^][A-Z0-9.^=\-]{0,19}$/.test(
        initial.get('stock') ?? initial.get('asset') ?? '',
      )
        ? (initial.get('stock') ?? initial.get('asset'))!
        : 'AAPL',
    ),
    [watchlist, setWatchlist] = useState<string[]>(savedWatchlist)
  const riskFocus = [...selected, benchmark].includes(focus)
    ? focus
    : (selected[0] ?? benchmark)
  const [mobile, setMobile] = useState(false),
    [toast, setToast] = useState('')
  const notify = useCallback((message: string) => setToast(message), [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4500)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    document.title = `${META[view].title} · Market Atlas`
    const query = new URLSearchParams({
      view,
      period,
      benchmark,
      symbols: selected.join(','),
    })
    if (view === 'stocks') query.set('stock', focus)
    if (view === 'risk') query.set('asset', riskFocus)
    if (dateRange) {
      query.set('start', dateRange.start)
      query.set('end', dateRange.end)
    }
    preserveViewSettings(view, window.location.search, query)
    window.history.replaceState({}, '', `${window.location.pathname}?${query}`)
  }, [view, period, benchmark, selected, focus, riskFocus, dateRange])
  useEffect(() => {
    try {
      localStorage.setItem('market-atlas-watchlist', JSON.stringify(watchlist))
    } catch {
      notify(
        'Browser storage is unavailable. This watchlist will last only for this visit.',
      )
    }
  }, [watchlist, notify])
  useEffect(() => {
    if (view !== 'news')
      void market.load([...SECTORS, ...BENCHMARKS].map((a) => a.symbol))
  }, [market.load, view])
  useEffect(() => {
    if (view !== 'news') void market.load([...selected, benchmark])
  }, [selected, benchmark, market.load, view])
  useEffect(() => {
    if (view === 'stocks')
      void market.load([focus, ...STOCKS.map((a) => a.symbol)])
    if (view === 'watchlist') void market.load(watchlist)
    if (view === 'portfolio') void market.load(['SPY', 'AGG'])
  }, [view, focus, watchlist, market.load])
  const navigate = (next: View) => {
    setView(next)
    setMobile(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const compare = (symbols: string[]) => {
    setSelected(symbols.filter((s) => s !== benchmark).slice(0, 12))
    navigate('compare')
  }
  const openStock = (symbol: string) => {
    setFocus(symbol)
    navigate('stocks')
  }
  const toggleWatch = (symbol: string) =>
    setWatchlist((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : prev.length >= 100
          ? prev
          : [...prev, symbol],
    )
  const addSymbol = (symbol: string) => {
    if (view === 'compare' || view === 'trends' || view === 'risk') {
      if (!selected.includes(symbol)) {
        if (selected.length >= 12) {
          notify('A comparison can include up to 12 assets plus its benchmark.')
          return
        }
        setSelected([...selected, symbol])
        notify(`${symbol} added to comparison`)
      }
      if (view === 'risk') setFocus(symbol)
    } else if (view === 'watchlist') {
      setWatchlist((prev) =>
        prev.includes(symbol) ? prev : [...prev, symbol].slice(0, 100),
      )
      void market.load([symbol])
      notify(`${symbol} added to watchlist`)
    } else openStock(symbol)
  }
  const ctx: MarketContext = {
    ...market,
    period,
    window: analysisWindow,
    windowLabel: analysisLabel,
    benchmark,
    selected,
    setSelected,
    watchlist,
    toggleWatch,
    compare,
    notify,
  }
  const dates = Object.values(market.data)
      .map((h) => h.points.at(-1)!.date)
      .sort(),
    latest = dates.at(-1)
  const stale = Object.values(market.data).filter((h) => h.stale),
    unadjusted = Object.values(market.data).filter((h) => !h.adjusted)
  const activeErrors = Object.entries(market.errors).filter(
    ([s]) =>
      selected.includes(s) ||
      s === benchmark ||
      SECTORS.some((a) => a.symbol === s) ||
      (view === 'stocks' && s === focus) ||
      (view === 'watchlist' && watchlist.includes(s)),
  )
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      notify('View link copied with your symbols, dates and chart settings.')
    } catch {
      notify('Copy the current address from your browser to share this view.')
    }
  }
  const exportData = () => {
    const symbols =
      view === 'watchlist'
        ? watchlist
        : view === 'stocks'
          ? [...new Set([focus, ...STOCKS.map((s) => s.symbol)])]
          : view === 'compare'
            ? [...new Set([...selected, benchmark])]
            : SECTORS.map((s) => s.symbol)
    downloadCSV(
      `market-atlas-${view}-${windowKey(analysisWindow)}.csv`,
      [
        'Symbol',
        'Name',
        'Currency',
        'Latest quote',
        'Last daily observation',
        '1D adjusted return (%)',
        `${analysisLabel} return (%)`,
        'Window start',
        'Window end',
        `Excess vs ${benchmark} (pp)`,
        'Annualized volatility (%)',
        'Max drawdown (%)',
        'Beta',
        'Correlation',
        'Source',
        'Fetched at',
        'Status',
      ],
      symbols.map((s) => {
        const h = market.data[s],
          m = metrics(h, analysisWindow, market.data[benchmark])
        return [
          s,
          h?.name ?? asset(s).name,
          h?.currency,
          h?.price,
          h?.points.at(-1)?.date,
          m.day,
          m.change,
          m.start,
          m.end,
          m.excess,
          m.volatility,
          m.drawdown,
          m.beta,
          m.correlation,
          h?.source,
          h?.fetchedAt,
          h?.stale ? 'Stale cache' : h ? 'Retrieved' : 'Unavailable',
        ]
      }),
    )
    notify('Research table exported as CSV.')
  }
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <a
          className="brand"
          href="?view=overview"
          onClick={(e) => {
            e.preventDefault()
            navigate('overview')
          }}
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>
            market<span className="brand-light">atlas</span>
            <small>YOUR MARKET. IN PERSPECTIVE.</small>
          </span>
        </a>
        <button
          className="icon-button mobile-close"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace-label">
          <Globe2 size={14} />
          <span>Market workspace</span>
          <ChevronDown size={12} />
        </div>
        <span className="nav-label">RESEARCH</span>
        <nav aria-label="Main navigation">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? 'nav-item active' : 'nav-item'}
              onClick={() => navigate(n.id)}
              aria-current={view === n.id ? 'page' : undefined}
            >
              <n.icon size={18} />
              <span>{n.name}</span>
              {n.id === 'watchlist' ? (
                <span className="nav-count">{watchlist.length}</span>
              ) : (
                <span className="nav-index">{n.tag}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="mini-line">
              <ChartNoAxesCombined size={22} />
            </span>
            <strong>A wider market lens.</strong>
            <p>
              11 sectors. Countless connections.
              <br />
              One place to explore.
            </p>
          </div>
          <button
            className={`nav-item ${view === 'methodology' ? 'active' : ''}`}
            onClick={() => navigate('methodology')}
          >
            <BookOpen size={17} />
            <span>Data & methodology</span>
          </button>
          <a
            className="nav-item"
            href="https://github.com/DevanMetz/market-atlas"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={17} />
            <span>View on GitHub</span>
            <ArrowUpRight size={13} />
          </a>
          <div className="sidebar-status">
            <span>PUBLIC RESEARCH WORKSPACE</span>
            <small>Market Atlas · v1.11</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <Globe2 size={15} />
            <span>Workspace</span>
            <span className="crumb-divider">/</span>
            <strong>{META[view].title}</strong>
          </div>
          <div className="topbar-right">
            <span className="data-badge">
              <span
                className={
                  market.loading.length ? 'status-dot loading' : 'status-dot'
                }
              />
              {view === 'news'
                ? 'Publisher headlines'
                : market.loading.length
                  ? 'Loading market data'
                  : 'Daily market data'}
            </span>
            <button
              className="icon-button"
              aria-label="Data methodology and help"
              onClick={() => navigate('methodology')}
            >
              <CircleHelp size={18} />
            </button>
            <span className="avatar">MA</span>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">THE RESEARCH DESK</span>
              <h1>
                {META[view].title}
                <span className="title-dot">.</span>
              </h1>
              <p>{META[view].subtitle}</p>
            </div>
            <div className="heading-actions">
              <SavedViews
                key={view}
                defaultName={
                  view === 'news'
                    ? 'News research'
                    : `${META[view].title} · ${analysisLabel}`
                }
                notify={notify}
              />
              <button
                className="button"
                aria-label="Share view"
                onClick={share}
              >
                <Share2 size={14} />
                <span>Share view</span>
              </button>
              {![
                'methodology',
                'portfolio',
                'correlations',
                'trends',
                'risk',
                'news',
              ].includes(view) && (
                <button
                  className="button"
                  aria-label="Export CSV"
                  onClick={exportData}
                >
                  <Download size={15} />
                  <span>Export CSV</span>
                </button>
              )}
            </div>
          </div>
          {view !== 'methodology' && view !== 'news' && (
            <>
              <div className="benchmark-cards">
                {BENCHMARKS.map((b) => {
                  const h = market.data[b.symbol],
                    day = dailyChange(h)
                  return (
                    <button
                      key={b.symbol}
                      className={`benchmark-card ${benchmark === b.symbol ? 'selected' : ''}`}
                      onClick={() => setBenchmark(b.symbol)}
                      aria-label={`Use ${b.name} as benchmark`}
                      aria-pressed={benchmark === b.symbol}
                    >
                      <div className="benchmark-title">
                        <span>{b.name}</span>
                        <small>{b.symbol}</small>
                      </div>
                      <div className="benchmark-values">
                        <strong>{num(h?.price)}</strong>
                        <Sparkline
                          history={h}
                          color={(day ?? 0) >= 0 ? '#a4ca84' : '#d48a83'}
                        />
                      </div>
                      <div className="benchmark-bottom">
                        <Change value={day} />
                        <small>1D · USD</small>
                        {benchmark === b.symbol && (
                          <span className="selected-label">BENCHMARK</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="research-toolbar">
                <SymbolSearch
                  compact
                  onSelect={addSymbol}
                  placeholder={
                    view === 'compare' || view === 'trends' || view === 'risk'
                      ? 'Add stock or ETF to comparison…'
                      : view === 'watchlist'
                        ? 'Add stock or ETF to watchlist…'
                        : 'Search any stock or ETF…'
                  }
                />
                <div className="toolbar-controls">
                  <PeriodPicker
                    value={dateRange ? undefined : period}
                    onChange={(next) => {
                      setPeriod(next)
                      setDateRange(null)
                    }}
                  />
                  <DateRangePicker
                    value={dateRange}
                    onChange={setDateRange}
                    latest={latest ?? new Date().toISOString().slice(0, 10)}
                  />
                  <BenchmarkPicker value={benchmark} onChange={setBenchmark} />
                  <button
                    className={`icon-button refresh ${market.loading.length ? 'spinning' : ''}`}
                    disabled={market.loading.length > 0}
                    aria-label="Refresh market data"
                    onClick={() =>
                      void market.load(
                        Object.keys(market.data).length ||
                          Object.keys(market.errors).length
                          ? [
                              ...new Set([
                                ...Object.keys(market.data),
                                ...Object.keys(market.errors),
                              ]),
                            ]
                          : [benchmark, ...SECTORS.map((s) => s.symbol)],
                        true,
                      )
                    }
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>
              {(stale.length > 0 ||
                unadjusted.length > 0 ||
                activeErrors.length > 0) && (
                <div className="data-warning" role="status">
                  <Activity size={16} />
                  <div>
                    {activeErrors.length > 0 && (
                      <p>
                        Data unavailable for{' '}
                        {activeErrors.map(([s]) => s).join(', ')}.{' '}
                        <button
                          onClick={() =>
                            void market.load(
                              activeErrors.map(([s]) => s),
                              true,
                            )
                          }
                        >
                          Retry unavailable data
                        </button>
                      </p>
                    )}
                    {stale.length > 0 && (
                      <p>
                        Cached data shown for{' '}
                        {stale.map((h) => h.symbol).join(', ')} after a provider
                        refresh failed. Check each series’ data date.
                      </p>
                    )}
                    {unadjusted.length > 0 && (
                      <p>
                        {unadjusted.map((h) => h.symbol).join(', ')} uses
                        unadjusted closing prices because adjusted prices are
                        unavailable.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          <AsyncContent key={view} label={META[view].title}>
            {view === 'overview' && <Overview ctx={ctx} />}
            {view === 'sectors' && <SectorExplorer ctx={ctx} />}
            {view === 'compare' && <Comparison ctx={ctx} />}
            {view === 'trends' && <TrendsView ctx={ctx} />}
            {view === 'news' && (
              <NewsView notify={notify} watchlist={watchlist} />
            )}
            {view === 'risk' && (
              <RiskView ctx={ctx} focus={riskFocus} onFocus={setFocus} />
            )}
            {view === 'stocks' && (
              <StocksView ctx={ctx} focus={focus} onFocus={openStock} />
            )}
            {view === 'correlations' && <Correlations ctx={ctx} />}
            {view === 'portfolio' && <Portfolio ctx={ctx} />}
            {view === 'watchlist' && <Watchlist ctx={ctx} onOpen={openStock} />}
            {view === 'methodology' && <Methodology />}
          </AsyncContent>
          <footer>
            <div>
              <span className="footer-mark">
                m<span>a</span>
              </span>
              <span>Market Atlas</span>
              <span className="footer-divider">/</span>
              <span>Independent market research</span>
            </div>
            <span>
              {view === 'news' ? (
                'Headlines link to their original publishers'
              ) : (
                <>
                  {latest
                    ? `Latest daily observation ${shortDate(latest)} · `
                    : ''}
                  <a
                    href="https://finance.yahoo.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Yahoo Finance
                  </a>{' '}
                  · Data may be delayed
                </>
              )}
            </span>
            <button onClick={() => navigate('methodology')}>
              Sources & calculations <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
