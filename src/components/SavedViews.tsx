import { useEffect, useId, useRef, useState } from 'react'
import { BookmarkPlus, Copy, Trash2, X } from 'lucide-react'
import { parseSavedViews, SAVED_VIEWS_KEY } from '../lib/viewSettings'
import type { SavedView } from '../lib/viewSettings'

export function SavedViews({
  defaultName,
  notify,
}: {
  defaultName: string
  notify: (message: string) => void
}) {
  const [views, setViews] = useState<SavedView[]>(() => {
    try {
      return parseSavedViews(localStorage.getItem(SAVED_VIEWS_KEY))
    } catch {
      return []
    }
  })
  const [name, setName] = useState(defaultName)
  const [message, setMessage] = useState('')
  const details = useRef<HTMLDetailsElement>(null)
  const heading = useId()
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !details.current?.contains(event.target)
      )
        details.current?.removeAttribute('open')
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])
  const close = () => {
    details.current?.removeAttribute('open')
    details.current?.querySelector('summary')?.focus()
  }
  const save = (next: SavedView[]) => {
    setViews(next)
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next))
      return true
    } catch {
      setMessage(
        'Browser storage is unavailable. These views will last only for this visit.',
      )
      return false
    }
  }
  const describe = (query: string) => {
    const params = new URLSearchParams(query)
    const range = params.has('start')
      ? `${params.get('start')} → ${params.get('end')}`
      : (params.get('period') ?? 'YTD')
    return `${range} · ${params.get('benchmark') ?? 'SPY'} benchmark`
  }
  return (
    <details
      className="saved-views"
      ref={details}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          setName(defaultName)
          setMessage('')
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          close()
        }
      }}
    >
      <summary className="button" aria-label="Saved research views">
        <BookmarkPlus size={15} />
        <span>Saved views</span>
        {views.length > 0 && <small>{views.length}</small>}
      </summary>
      <div
        className="saved-views-popover"
        role="region"
        aria-labelledby={heading}
      >
        <div className="saved-views-heading">
          <strong id={heading}>Saved research views</strong>
          <button
            className="icon-button"
            type="button"
            aria-label="Close saved views"
            onClick={close}
          >
            <X size={17} />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const label = name.trim()
            if (!label) {
              setMessage('Give this view a name.')
              return
            }
            const query = window.location.search
            const duplicate = views.find((v) => v.query === query)
            if (!duplicate && views.length >= 20) {
              setMessage('You can save 20 views. Remove a view to make room.')
              return
            }
            const entry = {
              id: duplicate?.id ?? crypto.randomUUID(),
              name: label,
              query,
              savedAt: new Date().toISOString(),
            }
            const persisted = save([
              entry,
              ...views.filter((v) => v.id !== entry.id),
            ])
            if (persisted) {
              setMessage('Saved on this device.')
              notify('Research view saved on this device.')
            }
          }}
        >
          <label>
            View name
            <input
              aria-label="Saved view name"
              value={name}
              maxLength={80}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button className="button primary" type="submit">
            Save current view
          </button>
        </form>
        {message && (
          <p className="saved-views-message" role="status">
            {message}
          </p>
        )}
        {views.length ? (
          <ul className="saved-views-list">
            {views.map((view) => (
              <li key={view.id}>
                <a href={view.query}>
                  <strong>{view.name}</strong>
                  <small>{describe(view.query)}</small>
                </a>
                <div>
                  <button
                    className="icon-button"
                    aria-label={`Copy link to ${view.name}`}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          new URL(view.query, window.location.href).href,
                        )
                        setMessage('View link copied.')
                      } catch {
                        setMessage(
                          'Open the saved view and copy its address from your browser.',
                        )
                      }
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove saved view ${view.name}`}
                    onClick={() => {
                      if (save(views.filter((v) => v.id !== view.id)))
                        setMessage('Saved view removed.')
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="saved-views-empty">
            Save a comparison or research window to return to it later.
          </p>
        )}
        <p className="saved-views-note">
          Views save the current page, symbols, dates, benchmark and chart
          controls on this device. Watchlists and portfolio allocations stay in
          their separate device settings. Market data can change.
        </p>
      </div>
    </details>
  )
}
