import {
  headlineGroupTimeline,
  headlinesInBucket,
  summarizeHeadlines,
} from './news'
import type { AnalyzedHeadline, NewsInterval } from './news'
import {
  compileHeadlineSearch,
  headlineSearchDocument,
  NEWS_QUERY_LIMIT,
} from './newsSearch'

export type NewsComparison = { name: string; query: string }
export const NEWS_COMPARISON_NAME_LIMIT = 32
export const DEFAULT_NEWS_COMPARISONS: NewsComparison[] = [
  { name: 'Nvidia', query: 'ticker:NVDA' },
  { name: 'Apple', query: 'ticker:AAPL' },
]

export function headlineBucketSample(
  items: AnalyzedHeadline[],
  time: number,
  interval: NewsInterval,
  filter: { topic?: string; query?: string } = {},
) {
  const search = compileHeadlineSearch(filter.query ?? '')
  const selected = search.error
    ? []
    : headlinesInBucket(items, time, interval).filter(
        (item) =>
          (!filter.topic || item.topics.includes(filter.topic)) &&
          search.matches(headlineSearchDocument(item)),
      )
  return {
    items: selected,
    summary: summarizeHeadlines(selected),
    error: search.error,
  }
}

// Validate the URL structure separately from editable query and name errors.
export function parseNewsComparisons(value: string): NewsComparison[] | null {
  if (value.length > 12000) return null
  try {
    const data: unknown = JSON.parse(value)
    if (!Array.isArray(data) || data.length < 2 || data.length > 4) return null
    if (
      !data.every(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          typeof entry.name === 'string' &&
          entry.name.length <= NEWS_COMPARISON_NAME_LIMIT &&
          typeof entry.query === 'string' &&
          entry.query.length <= NEWS_QUERY_LIMIT,
      )
    )
      return null
    return data.map(({ name, query }) => ({ name, query }))
  } catch {
    return null
  }
}

export function compareHeadlineSearches(
  items: AnalyzedHeadline[],
  comparisons: NewsComparison[],
  interval: NewsInterval = 'day',
) {
  const searches = comparisons.map((entry) =>
    compileHeadlineSearch(entry.query),
  )
  const names = comparisons.map((entry) => entry.name.trim().toLowerCase())
  const errors = comparisons.map((entry, index) => ({
    name: !entry.name.trim()
      ? 'Give this search a name.'
      : names.indexOf(names[index]) !== index
        ? 'Choose a different name for this search.'
        : null,
    query: searches[index].error,
  }))
  if (errors.some((error) => error.name || error.query))
    return { errors, timeline: [] }
  const documents = new Map(
    items.map((item) => [item, headlineSearchDocument(item)]),
  )
  const timeline = headlineGroupTimeline(
    items,
    searches.map((search, index) => ({
      id: `search-${index}`,
      matches: (item: AnalyzedHeadline) => search.matches(documents.get(item)!),
    })),
    interval,
  )
  return { errors, timeline }
}
