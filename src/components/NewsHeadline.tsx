import { ArrowUpRight } from 'lucide-react'
import { num, shortDate } from '../lib/analytics'
import type { AnalyzedHeadline } from '../lib/news'
import { NEWS_SOURCE_MAP } from '../lib/newsSources'
import { stockResearchHref } from '../lib/newsCompanies'

export const scoreLabel = (score: number | null) =>
  score === null ? 'No signal' : `${score > 0 ? '+' : ''}${num(score, 0)}`

export const headlineDate = (value: string | null) =>
  value
    ? `${shortDate(value)} · ${new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
    : 'Publication time unavailable'

export function SentimentBadge({
  item,
}: {
  item: Pick<AnalyzedHeadline, 'tone' | 'score'>
}) {
  return (
    <span className={`news-tone tone-${item.tone}`}>
      {item.tone === 'unscored' ? 'No signal' : item.tone}{' '}
      {item.score !== null && <b>{scoreLabel(item.score)}</b>}
    </span>
  )
}

export function NewsHeadline({
  item,
  stale,
  onTopic,
}: {
  item: AnalyzedHeadline
  stale?: boolean
  onTopic?: (topic: string) => void
}) {
  return (
    <article className="headline-card">
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
        {stale && <span className="ongoing-badge">Cached feed</span>}
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
        {item.topics.slice(0, 3).map((name) =>
          onTopic ? (
            <button key={name} onClick={() => onTopic(name)}>
              {name}
            </button>
          ) : (
            <span key={name}>{name}</span>
          ),
        )}
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
  )
}
