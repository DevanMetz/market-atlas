import { useEffect, useState } from 'react'
import { Newspaper, Star, X } from 'lucide-react'
import { asset } from '../lib/catalog'
import { normalizeNewsSymbol } from '../lib/newsCompanies'
import { SymbolSearch } from './UI'

export function NewsCompanies({
  companies,
  onChange,
  watchlist,
  notify,
}: {
  companies: string[]
  onChange: (symbols: string[]) => void
  watchlist: string[]
  notify: (message: string) => void
}) {
  const [open, setOpen] = useState(companies.length > 0)
  useEffect(() => {
    if (companies.length) setOpen(true)
  }, [companies])
  return (
    <details
      className="news-company-focus"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <Newspaper size={15} aria-hidden="true" />
        Company focus
        <span>
          {companies.length
            ? `${companies.slice(0, 4).join(', ')}${companies.length > 4 ? ` +${companies.length - 4}` : ''}`
            : 'All headlines'}
        </span>
      </summary>
      <div className="news-company-body">
        <div className="news-company-actions">
          <SymbolSearch
            placeholder="Add a company or ticker to news…"
            onSelect={(symbol) => {
              const normalized = normalizeNewsSymbol(symbol)
              if (companies.includes(normalized)) return
              if (companies.length >= 100) {
                notify('A news view can include up to 100 tickers.')
                return
              }
              onChange([...companies, normalized])
            }}
          />
          <button
            className="button"
            disabled={!watchlist.length}
            onClick={() => {
              onChange([...new Set(watchlist.map(normalizeNewsSymbol))])
              notify(
                'News now matches this watchlist snapshot. Shared links keep these tickers.',
              )
            }}
          >
            <Star size={14} />
            Use my watchlist
          </button>
          {companies.length > 0 && (
            <button className="text-button" onClick={() => onChange([])}>
              Clear company focus
            </button>
          )}
        </div>
        {companies.length > 0 && (
          <div
            className="news-company-chips"
            role="group"
            aria-label="Selected news tickers"
          >
            {companies.map((symbol) => (
              <button
                key={symbol}
                title={asset(symbol).name}
                aria-label={`Remove ${symbol} from news focus`}
                onClick={() =>
                  onChange(companies.filter((value) => value !== symbol))
                }
              >
                {symbol}
                <X size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <p>
          Matches any selected ticker using recognized company names, $TICKER or
          exchange notation. Other filters still apply. Scores describe the
          whole headline, not each mentioned company. Coverage depends on the
          selected feeds; an empty result does not mean no news exists.
        </p>
      </div>
    </details>
  )
}
