import { Plus, X } from 'lucide-react'
import {
  DEFAULT_NEWS_COMPARISONS,
  NEWS_COMPARISON_NAME_LIMIT,
} from '../lib/newsComparisons'
import type { NewsComparison } from '../lib/newsComparisons'
import { NEWS_QUERY_LIMIT } from '../lib/newsSearch'

export function NewsComparisonEditor({
  comparisons,
  errors,
  counts,
  colors,
  onChange,
}: {
  comparisons: NewsComparison[] | null
  errors: { name: string | null; query: string | null }[]
  counts: { total: number; scored: number }[]
  colors: readonly string[]
  onChange: (entries: NewsComparison[]) => void
}) {
  if (!comparisons)
    return (
      <div className="news-comparison-editor">
        <p className="news-comparison-error" role="alert">
          The shared comparison searches could not be read. Use two to four
          searches with names up to 32 characters and queries up to 400
          characters.
        </p>
        <button
          className="button"
          onClick={() => onChange(DEFAULT_NEWS_COMPARISONS)}
        >
          Reset comparison examples
        </button>
      </div>
    )
  const update = (index: number, field: keyof NewsComparison, value: string) =>
    onChange(
      comparisons.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry,
      ),
    )
  const valid = !errors.some((error) => error.name || error.query)
  return (
    <fieldset className="news-comparison-editor">
      <legend>Compare 2–4 searches</legend>
      <p>
        Use the same phrases, OR, exclusions and fields as headline search.
        Leave a query empty for all filtered headlines. All filters above still
        apply.
      </p>
      <div className="news-comparison-rows">
        {comparisons.map((entry, index) => (
          <div
            className="news-comparison-row"
            key={index}
            style={{ borderLeftColor: colors[index] }}
          >
            <label>
              Line {index + 1} name
              <input
                aria-label={`Comparison ${index + 1} name`}
                maxLength={NEWS_COMPARISON_NAME_LIMIT}
                value={entry.name}
                onChange={(event) => update(index, 'name', event.target.value)}
                aria-invalid={!!errors[index]?.name}
                aria-describedby={
                  errors[index]?.name
                    ? `comparison-name-error-${index}`
                    : undefined
                }
              />
            </label>
            <label className="news-comparison-query">
              Headline search
              <input
                aria-label={`Comparison ${index + 1} query`}
                maxLength={NEWS_QUERY_LIMIT}
                value={entry.query}
                placeholder='All filtered headlines · or try title:"rate cut"'
                onChange={(event) => update(index, 'query', event.target.value)}
                aria-invalid={!!errors[index]?.query}
                aria-describedby={
                  errors[index]?.query
                    ? `comparison-query-error-${index}`
                    : undefined
                }
              />
            </label>
            <button
              className="icon-button"
              aria-label={`Remove comparison ${index + 1}`}
              disabled={comparisons.length <= 2}
              onClick={() =>
                onChange(comparisons.filter((_, i) => i !== index))
              }
            >
              <X size={16} aria-hidden="true" />
            </button>
            <div className="news-comparison-feedback">
              {errors[index]?.name && (
                <p
                  className="news-comparison-error"
                  id={`comparison-name-error-${index}`}
                  role="alert"
                >
                  {errors[index].name}
                </p>
              )}
              {errors[index]?.query && (
                <p
                  className="news-comparison-error"
                  id={`comparison-query-error-${index}`}
                  role="alert"
                >
                  {errors[index].query}
                </p>
              )}
              {valid && (
                <span>
                  {counts[index]?.total ?? 0} dated{' '}
                  {counts[index]?.total === 1 ? 'match' : 'matches'} ·{' '}
                  {counts[index]?.scored ?? 0} scored
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="news-comparison-actions">
        <button
          className="button"
          disabled={comparisons.length === 4}
          onClick={() => {
            const names = new Set(
              comparisons.map((entry) => entry.name.trim().toLowerCase()),
            )
            let number = comparisons.length + 1
            while (names.has(`search ${number}`)) number++
            onChange([...comparisons, { name: `Search ${number}`, query: '' }])
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Add comparison
        </button>
        {!valid && (
          <span>
            Correct the highlighted fields to view or export the comparison.
          </span>
        )}
      </div>
    </fieldset>
  )
}
