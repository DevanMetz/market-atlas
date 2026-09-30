import { lazy, useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Download,
  Newspaper,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { downloadCSV, num, shortDate } from '../lib/analytics'
import {
  analyzeHeadlines,
  HEADLINE_TOPICS,
  scoreHeadline,
  summarizeHeadlines,
} from '../lib/news'
import {
  DEFAULT_NEWS_SOURCES,
  FEED_SOURCES,
  NEWS_CATEGORIES,
  NEWS_REGIONS,
  NEWS_SOURCE_MAP,
  NEWS_SOURCES,
} from '../lib/newsSources'
import type { NewsFeed } from '../lib/news'
import { useNews } from '../lib/useNews'
import { useQueryChoice, useQuerySetting } from '../lib/viewSettings'
import { Empty, Panel, Stat } from '../components/UI'
import { AsyncContent } from '../components/AsyncContent'
import { NewsCompanies } from '../components/NewsCompanies'
import { NewsSearch } from '../components/NewsSearch'
import {
  compileHeadlineSearch,
  headlineSearchDocument,
} from '../lib/newsSearch'
import { parseNewsCompanies, stockResearchHref } from '../lib/newsCompanies'

const NewsTimeline = lazy(() =>
  import('../components/NewsTimeline').then((module) => ({
    default: module.NewsTimeline,
  })),
)

const scoreLabel = (score: number | null) =>
  score === null ? 'No signal' : `${score > 0 ? '+' : ''}${num(score, 0)}`
const TONES = ['all', 'positive', 'negative', 'mixed', 'unscored'] as const
const validFeeds = (value: string) => {
  const ids = value.split(',')
  return (
    ids.length > 0 &&
    ids.length <= FEED_SOURCES.length &&
    ids.every((id) => FEED_SOURCES.some((s) => s.id === id))
  )
}
const headlineDate = (value: string | null) =>
  value
    ? `${shortDate(value)} · ${new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
    : 'Publication time unavailable'

function SentimentBadge({ item }: { item: ReturnType<typeof scoreHeadline> }) {
  return (
    <span className={`news-tone tone-${item.tone}`}>
      {item.tone === 'unscored' ? 'No signal' : item.tone}{' '}
      {item.score !== null && <b>{scoreLabel(item.score)}</b>}
    </span>
  )
}

export function NewsView({
  notify,
  watchlist,
}: {
  notify: (message: string) => void
  watchlist: string[]
}) {
  const [pane, setPane] = useQueryChoice(
    'newsTab',
    ['headlines', 'sentiment', 'sources'] as const,
    'headlines',
  )
  const [feedList, setFeedList] = useQuerySetting(
    'feeds',
    DEFAULT_NEWS_SOURCES.join(','),
    validFeeds,
  )
  const sourceIds = useMemo(() => [...new Set(feedList.split(','))], [feedList])
  const news = useNews(sourceIds)
  const [query, setQuery] = useQuerySetting('q', '', () => true)
  const search = useMemo(() => compileHeadlineSearch(query), [query])
  const [companyList, setCompanyList] = useQuerySetting(
    'newsCompanies',
    '',
    (value) => parseNewsCompanies(value) !== null,
  )
  const companies = useMemo(
    () => parseNewsCompanies(companyList) ?? [],
    [companyList],
  )
  const [days, setDays] = useQueryChoice(
    'days',
    ['1', '7', '30', 'all'] as const,
    '7',
  )
  const [tone, setTone] = useQueryChoice('tone', TONES, 'all')
  const [topic, setTopic] = useQuerySetting(
    'topic',
    'all',
    (v) => v === 'all' || HEADLINE_TOPICS.includes(v),
  )
  const [source, setSource] = useQuerySetting(
    'source',
    'all',
    (v) => v === 'all' || NEWS_SOURCE_MAP.has(v),
  )
  const [sort, setSort] = useQueryChoice(
    'newsSort',
    ['newest', 'oldest', 'strongest'] as const,
    'newest',
  )
  const [page, setPage] = useState(0)
  const [directoryQuery, setDirectoryQuery] = useQuerySetting(
    'directory',
    '',
    (v) => v.length <= 100,
  )
  const [category, setCategory] = useQuerySetting(
    'category',
    'all',
    (v) => v === 'all' || NEWS_CATEGORIES.includes(v),
  )
  const [region, setRegion] = useQuerySetting(
    'region',
    'all',
    (v) => v === 'all' || NEWS_REGIONS.includes(v),
  )
  const [availability, setAvailability] = useQueryChoice(
    'availability',
    ['all', 'feed', 'website'] as const,
    'all',
  )
  const [draftFeeds, setDraftFeeds] = useState(sourceIds)
  const [directoryPage, setDirectoryPage] = useState(0)
  const [example, setExample] = useState(
    'Stocks rally as earnings beat estimates, but banks warn of credit losses',
  )
  useEffect(() => setDraftFeeds(sourceIds), [sourceIds])
  useEffect(
    () => setPage(0),
    [query, days, tone, topic, source, sort, feedList, companyList],
  )
  useEffect(
    () => setDirectoryPage(0),
    [directoryQuery, category, region, availability],
  )
  const feeds = useMemo(
    () =>
      sourceIds.map((id) => news.feeds[id]).filter((f): f is NewsFeed => !!f),
    [sourceIds, news.feeds],
  )
  const headlines = useMemo(() => analyzeHeadlines(feeds), [feeds])
  const searchIndex = useMemo(
    () =>
      new Map(headlines.map((item) => [item, headlineSearchDocument(item)])),
    [headlines],
  )
  const filtered = useMemo(() => {
    if (search.error) return []
    const since = Date.now() - Number(days) * 86400000
    return headlines
      .filter((item) => {
        if (
          companies.length &&
          !item.tickers.some((ticker) => companies.includes(ticker))
        )
          return false
        if (
          days !== 'all' &&
          (!item.publishedAt || Date.parse(item.publishedAt) < since)
        )
          return false
        if (tone !== 'all' && item.tone !== tone) return false
        if (topic !== 'all' && !item.topics.includes(topic)) return false
        if (
          source !== 'all' &&
          !item.copies.some((copy) => copy.sourceId === source)
        )
          return false
        return search.matches(searchIndex.get(item)!)
      })
      .sort((a, b) =>
        sort === 'strongest'
          ? (b.score === null ? -1 : Math.abs(b.score)) -
              (a.score === null ? -1 : Math.abs(a.score)) ||
            (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
          : sort === 'oldest'
            ? (a.publishedAt ?? '9999').localeCompare(b.publishedAt ?? '9999')
            : (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
      )
  }, [
    headlines,
    search,
    searchIndex,
    days,
    tone,
    topic,
    source,
    sort,
    companies,
  ])
  const summary = useMemo(() => summarizeHeadlines(filtered), [filtered])
  const topics = useMemo(
    () =>
      HEADLINE_TOPICS.map((name) => ({
        name,
        ...summarizeHeadlines(
          filtered.filter((item) => item.topics.includes(name)),
        ),
      }))
        .filter((row) => row.total)
        .sort((a, b) => b.total - a.total),
    [filtered],
  )
  const publishers = useMemo(
    () =>
      sourceIds
        .map((id) => ({
          id,
          ...summarizeHeadlines(
            filtered.filter((item) =>
              item.copies.some((copy) => copy.sourceId === id),
            ),
          ),
        }))
        .filter((row) => row.total)
        .sort((a, b) => b.total - a.total),
    [filtered, sourceIds],
  )
  const tickerCounts = useMemo(() => {
    const counts = new Map<string, number>()
    filtered.forEach((item) =>
      item.tickers.forEach((ticker) =>
        counts.set(ticker, (counts.get(ticker) ?? 0) + 1),
      ),
    )
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [filtered])
  const directory = NEWS_SOURCES.filter(
    (s) =>
      `${s.name} ${s.category} ${s.region}`
        .toLowerCase()
        .includes(directoryQuery.toLowerCase()) &&
      (category === 'all' || s.category === category) &&
      (region === 'all' || s.region === region) &&
      (availability === 'all' ||
        (availability === 'feed' ? s.feedEnabled : !s.feedEnabled)),
  )
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 30) - 1),
  )
  const currentDirectoryPage = Math.min(
    directoryPage,
    Math.max(0, Math.ceil(directory.length / 24) - 1),
  )
  const sample = scoreHeadline(example)
  const exportHeadlines = () => {
    const exportedAt = new Date().toISOString()
    downloadCSV(
      'market-atlas-news-headlines.csv',
      [
        'Title',
        'URL',
        'Publisher',
        'Publication time (UTC)',
        'Headline tone',
        'Headline score (-100 to 100)',
        'Scoring terms',
        'Topics',
        'Mentioned tickers',
        'Ticker match evidence',
        'Grouped copies',
        'Feed retrieved at',
        'Feed status',
        'Search query',
        'Research URL',
        'Exported at (UTC)',
      ],
      filtered.map((item) => [
        item.title,
        item.url,
        NEWS_SOURCE_MAP.get(item.sourceId)?.name,
        item.publishedAt,
        item.tone,
        item.score,
        item.matches
          .map((m) => `${m.term}: ${m.weight}${m.negated ? ' (negated)' : ''}`)
          .join('; '),
        item.topics.join('; '),
        item.tickers.join('; '),
        item.mentions
          .map(
            (mention) => `${mention.symbol}: ${mention.text} (${mention.kind})`,
          )
          .join('; '),
        item.copies.length,
        news.feeds[item.sourceId]?.fetchedAt,
        news.feeds[item.sourceId]?.stale ? 'Stale cache' : 'Retrieved',
        query,
        window.location.href,
        exportedAt,
      ]),
    )
  }

  return (
    <div className="news-workspace">
      {pane !== 'headlines' && (
        <div className="news-banner">
          <div>
            <span className="eyebrow">THE MARKET WIRE</span>
            <h2>A wider lens on the market.</h2>
            <p>
              {NEWS_SOURCES.length} sources to explore · {FEED_SOURCES.length}{' '}
              connected feeds · Headlines, signals and original reporting.
            </p>
          </div>
          <Newspaper size={52} strokeWidth={1} aria-hidden="true" />
        </div>
      )}
      <div className="news-nav">
        <div
          className="segmented"
          role="group"
          aria-label="News workspace sections"
        >
          {(['headlines', 'sentiment', 'sources'] as const).map((value) => (
            <button
              key={value}
              className={pane === value ? 'active' : ''}
              aria-pressed={pane === value}
              onClick={() => setPane(value)}
            >
              {value === 'headlines'
                ? 'Headlines'
                : value === 'sentiment'
                  ? 'Sentiment lab'
                  : 'Source directory'}
            </button>
          ))}
        </div>
        <button
          className="button"
          onClick={news.refresh}
          disabled={news.loading.length > 0}
        >
          <RefreshCw size={14} />
          {news.loading.length
            ? `Loading ${news.loading.length} feeds…`
            : 'Refresh headlines'}
        </button>
      </div>
      <details className="news-feed-status">
        <summary>
          {feeds.length}/{sourceIds.length} selected feeds retrieved ·{' '}
          {Object.keys(news.errors).length} unavailable
          {feeds.some((f) => f.stale) ? ' · Cached headlines in use' : ''}
        </summary>
        <div className="feed-status-grid">
          {sourceIds.map((id) => (
            <div key={id}>
              <strong>{NEWS_SOURCE_MAP.get(id)?.name}</strong>
              <span>
                {news.loading.includes(id)
                  ? 'Loading…'
                  : (news.errors[id] ??
                    (news.feeds[id]
                      ? `${news.feeds[id].items.length} headlines · ${news.feeds[id].stale ? 'Stale cache · ' : ''}retrieved ${headlineDate(news.feeds[id].fetchedAt)}`
                      : 'Not loaded'))}
              </span>
            </div>
          ))}
        </div>
      </details>
      {pane !== 'sources' && (
        <>
          <div className="news-filters">
            <NewsSearch query={query} onChange={setQuery} error={search.error}>
              <label>
                Published
                <select
                  aria-label="News publication window"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                >
                  <option value="1">Last 24 hours</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="all">All retrieved headlines</option>
                </select>
              </label>
            </NewsSearch>
            <details className="news-advanced">
              <summary>
                More filters
                {[topic, source, tone].filter((value) => value !== 'all').length
                  ? ` · ${[topic, source, tone].filter((value) => value !== 'all').length} active`
                  : ''}
              </summary>
              <div className="news-advanced-grid">
                <label>
                  Topic
                  <select
                    aria-label="News topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  >
                    <option value="all">All topics</option>
                    {HEADLINE_TOPICS.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Publisher
                  <select
                    aria-label="News publisher"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="all">All selected publishers</option>
                    {sourceIds.map((id) => (
                      <option key={id} value={id}>
                        {NEWS_SOURCE_MAP.get(id)?.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Headline tone
                  <select
                    aria-label="Headline sentiment filter"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                  >
                    {TONES.map((value) => (
                      <option key={value} value={value}>
                        {value === 'all'
                          ? 'All tones'
                          : value === 'unscored'
                            ? 'No signal'
                            : value[0].toUpperCase() + value.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button"
                  onClick={() => {
                    setQuery('')
                    setDays('7')
                    setTopic('all')
                    setSource('all')
                    setTone('all')
                    setCompanyList('')
                  }}
                >
                  Reset filters
                </button>
              </div>
            </details>
          </div>
          <NewsCompanies
            companies={companies}
            onChange={(symbols) => setCompanyList(symbols.join(','))}
            watchlist={watchlist}
            notify={notify}
          />
          {pane === 'headlines' && !search.error && (
            <div className="news-compact-summary">
              <span>
                <strong>{summary.total}</strong> matching headlines
              </span>
              <span>
                <strong>{publishers.length}</strong> publishers
              </span>
              <button onClick={() => setPane('sentiment')}>
                Explore sentiment <ArrowUpRight size={13} aria-hidden="true" />
              </button>
            </div>
          )}
          {pane === 'sentiment' && !search.error && (
            <div className="stats-row news-stats">
              <Stat
                label="Matching headlines"
                value={summary.total}
                detail={`${headlines.reduce((n, item) => n + item.copies.length - 1, 0)} repeated copies grouped in retrieved sample`}
              />
              <Stat
                label="Mean headline score"
                value={scoreLabel(summary.score)}
                detail="Scored headlines only · −100 to +100"
              />
              <Stat
                label="Scoring coverage"
                value={
                  summary.total
                    ? `${num((summary.scored / summary.total) * 100, 0)}%`
                    : '—'
                }
                detail={`${summary.scored} of ${summary.total} headlines contain scoring terms`}
              />
              <Stat
                label="Publishers represented"
                value={publishers.length}
                detail={`${sourceIds.length} selected · snapshot, not a news archive`}
              />
            </div>
          )}
          {pane === 'sentiment' && !search.error && tickerCounts.length > 0 && (
            <div className="news-mentions">
              <span>Company mentions</span>
              {tickerCounts.map(([ticker, count]) => (
                <button key={ticker} onClick={() => setCompanyList(ticker)}>
                  {ticker}
                  <small>{count}</small>
                </button>
              ))}
            </div>
          )}
          {pane === 'sentiment' && !search.error && (
            <p className="news-sample-note">
              All charts and counts follow these filters. Headlines are a
              limited, changing feed snapshot. Undated items appear only under
              “All retrieved headlines.”
            </p>
          )}
        </>
      )}
      {pane === 'headlines' && !search.error && (
        <Panel
          title="Across the wire"
          action={
            <div className="news-list-actions">
              <select
                aria-label="Sort headlines"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="strongest">Strongest scored tone</option>
              </select>
              <button
                className="button"
                onClick={exportHeadlines}
                disabled={!filtered.length}
              >
                <Download size={14} />
                Export headlines
              </button>
              <button className="button" onClick={() => setPane('sources')}>
                <SlidersHorizontal size={14} />
                Sources
              </button>
            </div>
          }
        >
          <div className="headline-list">
            {filtered
              .slice(currentPage * 30, currentPage * 30 + 30)
              .map((item) => (
                <article
                  className="headline-card"
                  key={`${item.sourceId}:${item.url}`}
                >
                  <div className="headline-meta">
                    <a
                      href={NEWS_SOURCE_MAP.get(item.sourceId)?.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {NEWS_SOURCE_MAP.get(item.sourceId)?.name}
                    </a>
                    <time dateTime={item.publishedAt ?? undefined}>
                      {headlineDate(item.publishedAt)}
                    </time>
                    {news.feeds[item.sourceId]?.stale && (
                      <span className="ongoing-badge">Cached feed</span>
                    )}
                  </div>
                  <div className="headline-title">
                    <h3>
                      <a href={item.url} target="_blank" rel="noreferrer">
                        {item.title}
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </a>
                    </h3>
                    <SentimentBadge item={item} />
                  </div>
                  <div className="headline-tags">
                    {item.topics.slice(0, 3).map((name) => (
                      <button key={name} onClick={() => setTopic(name)}>
                        {name}
                      </button>
                    ))}
                    {item.tickers.map((ticker) => (
                      <a
                        key={ticker}
                        className="ticker-link"
                        aria-label={`Research ${ticker}`}
                        href={stockResearchHref(ticker, window.location.search)}
                      >
                        ${ticker} ↗
                      </a>
                    ))}
                  </div>
                  <details className="headline-explanation">
                    <summary>
                      {item.matches.length
                        ? `${item.matches.length} scoring cues`
                        : 'Why no signal?'}
                      {item.copies.length > 1
                        ? ` · ${item.copies.length} grouped copies`
                        : ''}
                    </summary>
                    <p>
                      {item.matches.length
                        ? item.matches
                            .map(
                              (match) =>
                                `${match.term} (${match.weight > 0 ? '+' : ''}${match.weight}${match.negated ? ', negation applied' : ''})`,
                            )
                            .join(' · ')
                        : 'No words or phrases in the current English lexicon were matched. This does not mean the story is neutral.'}
                    </p>
                    {item.mentions.length > 0 && (
                      <p>
                        Company matches in this headline group:{' '}
                        {item.mentions
                          .map(
                            (mention) =>
                              `${mention.symbol} via “${mention.text}” (${mention.kind})`,
                          )
                          .join(' · ')}
                        . Name matches are inferred and may be ambiguous.
                      </p>
                    )}
                    {item.copies.length > 1 && (
                      <ul>
                        {item.copies.map((copy) => (
                          <li key={`${copy.sourceId}:${copy.url}`}>
                            <a href={copy.url} target="_blank" rel="noreferrer">
                              {NEWS_SOURCE_MAP.get(copy.sourceId)?.name} ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </article>
              ))}
          </div>
          {!filtered.length && (
            <Empty
              title={
                news.loading.length
                  ? 'Collecting publisher headlines…'
                  : 'No matching headlines'
              }
            >
              Try a broader search, a longer publication window, or another set
              of sources. Unavailable feeds are listed above.
            </Empty>
          )}
          <div className="table-footer">
            <span>
              {filtered.length
                ? `${currentPage * 30 + 1}–${Math.min(filtered.length, currentPage * 30 + 30)} of ${filtered.length}`
                : '0 headlines'}
            </span>
            <div>
              <button
                aria-label="Previous headlines page"
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <button
                aria-label="Next headlines page"
                disabled={(currentPage + 1) * 30 >= filtered.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </Panel>
      )}
      {pane === 'sentiment' && !search.error && (
        <>
          <AsyncContent label="Sentiment chart">
            <NewsTimeline items={filtered} days={days} feeds={feeds} />
          </AsyncContent>
          <div className="two-col">
            <Panel title="Topics in the conversation">
              <div className="news-topic-bars">
                {topics.length ? (
                  topics.map((row) => (
                    <button key={row.name} onClick={() => setTopic(row.name)}>
                      <span>{row.name}</span>
                      <span className="news-topic-track">
                        <i
                          style={{
                            width: `${(row.total / Math.max(...topics.map((t) => t.total))) * 100}%`,
                          }}
                        />
                      </span>
                      <strong>{row.total}</strong>
                      <small>{scoreLabel(row.score)}</small>
                    </button>
                  ))
                ) : (
                  <p className="panel-note">
                    No matched topic keywords in the selected headlines.
                  </p>
                )}
              </div>
              <p className="panel-note">
                A headline can mention several topics. Topic tags use keyword
                rules and may miss context.
              </p>
            </Panel>
            <Panel title="Tone by publisher">
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Publisher sentiment comparison"
              >
                <table className="news-publisher-table">
                  <thead>
                    <tr>
                      <th>Publisher</th>
                      <th className="right">Headlines</th>
                      <th className="right">Scored</th>
                      <th className="right">Mean score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publishers.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => setSource(row.id)}
                          >
                            {NEWS_SOURCE_MAP.get(row.id)?.name}
                          </button>
                        </td>
                        <td className="right">{row.total}</td>
                        <td className="right">{row.scored}</td>
                        <td className="right">{scoreLabel(row.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="panel-note">
                Each publisher gets credit for its grouped copies. Counts can
                exceed the unique headline total. Different coverage and sample
                sizes make these descriptive, not publisher quality rankings.
              </p>
            </Panel>
          </div>
          <Panel
            title="Inspect the scoring"
            eyebrow="TRANSPARENT ENGLISH HEADLINE HEURISTIC"
          >
            <div className="headline-lab">
              <label>
                Try a headline
                <textarea
                  aria-label="Headline sentiment sandbox"
                  value={example}
                  maxLength={350}
                  onChange={(e) => setExample(e.target.value)}
                  rows={3}
                />
              </label>
              <SentimentBadge item={sample} />
              <p>
                {sample.matches.length
                  ? sample.matches
                      .map(
                        (m) =>
                          `${m.term}: ${m.weight > 0 ? '+' : ''}${m.weight}${m.negated ? ' (negated)' : ''}`,
                      )
                      .join(' · ')
                  : 'No scoring terms matched.'}
              </p>
              <small>
                This sandbox text stays in your browser and is not added to the
                news feed.
              </small>
            </div>
          </Panel>
        </>
      )}
      {pane === 'sources' && (
        <Panel
          title="The source directory"
          eyebrow={`${NEWS_SOURCES.length} PUBLISHERS & INSTITUTIONS`}
          action={
            <button
              className="button"
              onClick={() =>
                downloadCSV(
                  'market-atlas-news-sources.csv',
                  [
                    'Publisher',
                    'Website',
                    'Category',
                    'Region',
                    'Feed URL',
                    'Feed enabled',
                    'Feed checked',
                    'Notes',
                    'Reference',
                  ],
                  directory.map((s) => [
                    s.name,
                    s.url,
                    s.category,
                    s.region,
                    s.feed,
                    s.feedEnabled ? 'Yes' : 'No',
                    s.checkedAt,
                    s.note,
                    s.reference,
                  ]),
                )
              }
            >
              <Download size={14} />
              Export directory
            </button>
          }
        >
          <div className="source-directory-controls">
            <label className="news-search">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="Search news sources"
                placeholder="Search the entire source directory…"
                value={directoryQuery}
                maxLength={100}
                onChange={(e) => setDirectoryQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Source category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              {NEWS_CATEGORIES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="Source region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="all">All regions</option>
              {NEWS_REGIONS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <select
              aria-label="Source feed availability"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
            >
              <option value="all">All sources</option>
              <option value="feed">Connected feeds</option>
              <option value="website">Website links</option>
            </select>
          </div>
          <div className="source-selection">
            <div className="source-presets">
              <span>Feed sets</span>
              <button onClick={() => setDraftFeeds(DEFAULT_NEWS_SOURCES)}>
                Daily mix
              </button>
              <button
                onClick={() =>
                  setDraftFeeds(
                    FEED_SOURCES.filter((s) =>
                      ['Markets', 'Investing', 'ETFs'].includes(s.category),
                    ).map((s) => s.id),
                  )
                }
              >
                Markets
              </button>
              <button
                onClick={() =>
                  setDraftFeeds(
                    FEED_SOURCES.filter((s) => s.category === 'Technology').map(
                      (s) => s.id,
                    ),
                  )
                }
              >
                Technology
              </button>
              <button
                onClick={() =>
                  setDraftFeeds(
                    FEED_SOURCES.filter((s) => s.category === 'Official').map(
                      (s) => s.id,
                    ),
                  )
                }
              >
                Official releases
              </button>
              <button
                onClick={() => setDraftFeeds(FEED_SOURCES.map((s) => s.id))}
              >
                All {FEED_SOURCES.length} feeds
              </button>
              <button onClick={() => setDraftFeeds([])}>Clear selection</button>
            </div>
            <button
              className="button primary"
              disabled={!draftFeeds.length}
              onClick={() => {
                setFeedList(draftFeeds.join(','))
                setSource('all')
                setPane('headlines')
                notify(
                  `${draftFeeds.length} news sources selected. Feeds load in small batches.`,
                )
              }}
            >
              Apply {draftFeeds.length} sources
            </button>
          </div>
          <p className="panel-note">
            Choose feeds, then apply the selection. Website-only entries open
            the publisher directly; some require subscriptions or a separate
            syndication arrangement. Official releases and press-release
            services are labeled separately from journalism. No article bodies
            are copied.
          </p>
          <div className="source-directory">
            {directory
              .slice(currentDirectoryPage * 24, currentDirectoryPage * 24 + 24)
              .map((s) => (
                <article
                  key={s.id}
                  className={`source-card ${draftFeeds.includes(s.id) ? 'is-selected' : ''}`}
                >
                  <div className="source-card-top">
                    <span className="source-monogram">
                      {s.name.replace(/^The /, '').slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <h3>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.name}
                          <ArrowUpRight size={13} aria-hidden="true" />
                        </a>
                      </h3>
                      <p>
                        {s.category} · {s.region}
                      </p>
                    </div>
                  </div>
                  <div className="source-card-bottom">
                    {s.feedEnabled ? (
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.name} feed`}
                          checked={draftFeeds.includes(s.id)}
                          onChange={(e) =>
                            setDraftFeeds((prev) =>
                              e.target.checked
                                ? [...new Set([...prev, s.id])]
                                : prev.filter((id) => id !== s.id),
                            )
                          }
                        />{' '}
                        Include feed
                      </label>
                    ) : (
                      <span>Website link</span>
                    )}
                    <a
                      href={s.reference ?? s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.reference ? 'Feed information' : 'Visit publisher'} ↗
                    </a>
                  </div>
                  {s.note && <p className="source-note">{s.note}</p>}
                  {s.checkedAt && (
                    <small className="source-checked">
                      Feed checked {s.checkedAt}
                      {s.feedEnabled ? '' : ' · Unavailable during check'}
                    </small>
                  )}
                </article>
              ))}
          </div>
          {!directory.length && (
            <Empty title="No sources match">
              Try another publisher, category or region.
            </Empty>
          )}
          <div className="table-footer">
            <span>
              {directory.length} matching sources · {FEED_SOURCES.length}{' '}
              connected feeds overall
            </span>
            <div>
              <button
                aria-label="Previous source directory page"
                disabled={!currentDirectoryPage}
                onClick={() => setDirectoryPage(currentDirectoryPage - 1)}
              >
                Previous
              </button>
              <button
                aria-label="Next source directory page"
                disabled={(currentDirectoryPage + 1) * 24 >= directory.length}
                onClick={() => setDirectoryPage(currentDirectoryPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </Panel>
      )}
      <details className="news-methodology">
        <summary>How headline sentiment works</summary>
        <p>
          English words and phrases receive weights from −3 to +3. Longer
          phrases take precedence; a nearby negation can reverse a term. Score =
          100 × sum of weights ÷ (sum of absolute weights + 3). Positive and
          negative cues together are labeled mixed. No matched cues means no
          signal, not neutral.
        </p>
        <p>
          This estimates the language of a title, not its truth, the tone of the
          full article, a company’s outlook, or future returns. “Oil rises” and
          “unemployment rises” can receive the same positive word score despite
          different economic implications. Negation, sarcasm, questions,
          multiple companies and English-only coverage all create errors.
          Inspect each title and its scoring cues before drawing conclusions.
        </p>
        <p>
          Exact URLs and matching normalized titles on the same UTC publication
          date are grouped. Similar but differently worded stories remain
          separate. Ticker matches use explicit dollar-prefixed symbols and a
          limited company-name dictionary. Feed retention and publishing cadence
          differ; refreshes can change this snapshot. Refresh uses the newest
          available 15-minute cache, with a marked fallback of up to 24 hours
          when a publisher fails.
        </p>
      </details>
    </div>
  )
}
