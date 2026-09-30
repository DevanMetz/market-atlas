import { useEffect, useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'
import { downloadCSV, num } from '../lib/analytics'
import type { AnalyzedHeadline, NewsFeed, NewsInterval } from '../lib/news'
import { headlineBucketSample } from '../lib/newsComparisons'
import { NEWS_SOURCE_MAP } from '../lib/newsSources'
import { NewsHeadline, scoreLabel } from './NewsHeadline'
import { Empty } from './UI'

export type NewsInspectionGroup = {
  id: string
  name: string
  query?: string
  topic?: string
}

export function NewsBucketDetails({
  items,
  feeds,
  time,
  interval,
  group,
  groups,
  buckets,
  timeLabel,
  onChange,
  onClose,
}: {
  items: AnalyzedHeadline[]
  feeds: NewsFeed[]
  time: number
  interval: NewsInterval
  group: NewsInspectionGroup
  groups: NewsInspectionGroup[]
  buckets: number[]
  timeLabel: (time: number) => string
  onChange: (time: number, groupId: string) => void
  onClose: () => void
}) {
  const [page, setPage] = useState(0)
  const sample = useMemo(
    () => headlineBucketSample(items, time, interval, group),
    [items, time, interval, group],
  )
  useEffect(() => setPage(0), [items, time, group.id])
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(sample.items.length / 8) - 1),
  )
  const summary = sample.summary
  const feedMap = new Map(feeds.map((feed) => [feed.sourceId, feed]))
  const exportSample = () => {
    const exportedAt = new Date().toISOString()
    downloadCSV(
      'market-atlas-news-inspected-headlines.csv',
      [
        'Bucket start (UTC)',
        'Bucket interval',
        'Comparison',
        'Comparison query',
        'Topic filter',
        'Title',
        'URL',
        'Publisher',
        'Publication time (UTC)',
        'Headline tone',
        'Headline score (-100 to 100)',
        'Scoring terms',
        'Grouped copies',
        'Publisher copies',
        'Feed retrieval times (UTC)',
        'Main search query',
        'Research URL',
        'Exported at (UTC)',
      ],
      sample.items.map((item) => [
        new Date(time).toISOString(),
        interval,
        group.name,
        group.query ?? '',
        group.topic ?? '',
        item.title,
        item.url,
        NEWS_SOURCE_MAP.get(item.sourceId)?.name,
        item.publishedAt,
        item.tone,
        item.score,
        item.matches
          .map(
            (match) =>
              `${match.term}: ${match.weight}${match.negated ? ' (negated)' : ''}`,
          )
          .join('; '),
        item.copies.length,
        item.copies
          .map(
            (copy) =>
              `${NEWS_SOURCE_MAP.get(copy.sourceId)?.name}: ${copy.url}`,
          )
          .join('; '),
        [...new Set(item.copies.map((copy) => copy.sourceId))]
          .map((id) => {
            const feed = feedMap.get(id)
            return `${id}: ${feed?.fetchedAt ?? 'unknown'}${feed?.stale ? ' (stale cache)' : ''}`
          })
          .join('; '),
        new URLSearchParams(window.location.search).get('q') ?? '',
        window.location.href,
        exportedAt,
      ]),
    )
  }

  return (
    <>
      <div className="news-inspector-header">
        <div>
          <span className="eyebrow">FROM CHART TO SOURCE</span>
          <h3>Headlines behind this interval</h3>
        </div>
        <button
          className="button icon-button"
          aria-label="Close headline inspector"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="news-inspector-controls">
        <label>
          Publication interval · UTC
          <select
            aria-label="Inspected news interval"
            value={time}
            onChange={(event) => onChange(Number(event.target.value), group.id)}
          >
            {!buckets.includes(time) && (
              <option value={time}>{timeLabel(time)} · no headlines now</option>
            )}
            {[...buckets].reverse().map((value) => (
              <option key={value} value={value}>
                {timeLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Headline group
          <select
            aria-label="Inspected headline group"
            value={group.id}
            onChange={(event) => onChange(time, event.target.value)}
          >
            {groups.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          disabled={!summary.total || !!sample.error}
          onClick={exportSample}
        >
          <Download size={14} /> Export these headlines
        </button>
      </div>
      <p className="news-inspector-context">
        {group.query ? (
          <>
            Search: <code>{group.query}</code>.{' '}
          </>
        ) : group.topic ? (
          <>Topic: {group.topic}. </>
        ) : null}
        All filters above still apply. Counts include unscored titles; the mean
        excludes them. Changes to filters or refreshed feeds recompute this
        sample.
      </p>
      <dl className="news-inspector-stats">
        <div>
          <dt>Headline groups</dt>
          <dd>{summary.total}</dd>
        </div>
        <div>
          <dt>Scored titles</dt>
          <dd>{summary.scored}</dd>
        </div>
        <div>
          <dt>Mean score</dt>
          <dd>{scoreLabel(summary.score)}</dd>
        </div>
        <div>
          <dt>Scoring coverage</dt>
          <dd>
            {summary.total
              ? `${num((100 * summary.scored) / summary.total, 1)}%`
              : '—'}
          </dd>
        </div>
      </dl>
      {sample.error ? (
        <p role="alert">{sample.error}</p>
      ) : sample.items.length ? (
        <div className="headline-list">
          {sample.items
            .slice(currentPage * 8, currentPage * 8 + 8)
            .map((item) => (
              <NewsHeadline
                key={`${item.sourceId}:${item.url}`}
                item={item}
                stale={feedMap.get(item.sourceId)?.stale}
              />
            ))}
        </div>
      ) : (
        <Empty title="No headlines in this selection">
          No retrieved titles match this interval and group under the current
          filters. The score and coverage are unknown, not neutral.
        </Empty>
      )}
      <div className="table-footer">
        <span aria-live="polite">
          {summary.total
            ? `${currentPage * 8 + 1}–${Math.min(summary.total, currentPage * 8 + 8)} of ${summary.total} headline groups`
            : '0 headline groups'}
        </span>
        <div>
          <button
            aria-label="Previous inspected headlines page"
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <button
            aria-label="Next inspected headlines page"
            disabled={(currentPage + 1) * 8 >= summary.total}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  )
}
