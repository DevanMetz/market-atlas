import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { NEWS_QUERY_LIMIT } from '../lib/newsSearch'

const EXAMPLES = [
  ['Exact phrase', '"profit warning"'],
  ['Either term', 'earnings OR inflation'],
  ['Exclude a term', 'banks -crypto'],
  ['Company comparison', '(ticker:NVDA OR ticker:AAPL) earnings'],
  ['Publisher and title', 'source:CNBC title:stocks'],
  ['Topic with an exclusion', 'topic:Energy -title:oil'],
] as const

export function NewsSearch({
  query,
  onChange,
  error,
  children,
}: {
  query: string
  onChange: (query: string) => void
  error: string | null
  children: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const update = (value: string) => {
    onChange(value)
    input.current?.focus()
  }
  return (
    <>
      <div className="news-query-field">
        <label className="news-search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={input}
            aria-label="Search news headlines"
            aria-invalid={!!error}
            aria-describedby={error ? 'news-search-error' : 'news-search-hint'}
            placeholder='Search headlines · try "rate cut" OR earnings'
            maxLength={NEWS_QUERY_LIMIT}
            value={query}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        {query && (
          <button
            className="news-search-clear"
            aria-label="Clear headline search"
            onClick={() => update('')}
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
      <div className="news-query-help">
        {error && (
          <p id="news-search-error" className="news-query-error" role="alert">
            <strong>Check your search.</strong> {error} Results and charts will
            appear when the query is valid.
          </p>
        )}
        <details>
          <summary>Search help &amp; examples</summary>
          <p id="news-search-hint">
            Spaces (or uppercase AND) require every term. Uppercase OR accepts
            either side. Use quotes for a phrase, a leading minus or NOT to
            exclude, and parentheses to group alternatives. Exclusions and AND
            apply before OR.
          </p>
          <div className="news-query-examples">
            {EXAMPLES.map(([label, value]) => (
              <button
                key={label}
                onClick={() => update(value)}
                aria-label={`Try search: ${label}`}
              >
                <span>{label}</span>
                <code>{value}</code>
              </button>
            ))}
          </div>
          <p>
            Search is case-insensitive. Text matches fragments; quoted text must
            be contiguous.
            <code>title:</code> searches the displayed title,{' '}
            <code>source:</code> any grouped publisher name or ID, and{' '}
            <code>topic:</code> the assigned topic tags. <code>ticker:</code>{' '}
            matches an exact detected ticker. Company detection can miss
            headlines. Other filters still apply; full articles are not
            searched.
          </p>
        </details>
      </div>
    </>
  )
}
