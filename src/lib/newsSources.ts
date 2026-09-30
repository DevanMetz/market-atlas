import catalog from './news-sources.json'

export type NewsSource = {
  id: string
  name: string
  url: string
  category: string
  region: string
  feed?: string
  feedEnabled?: boolean
  checkedAt?: string
  note?: string
  reference?: string
}
export const NEWS_SOURCES: NewsSource[] = catalog
export const FEED_SOURCES = NEWS_SOURCES.filter((s) => s.feed && s.feedEnabled)
export const NEWS_SOURCE_MAP = new Map(NEWS_SOURCES.map((s) => [s.id, s]))
export const DEFAULT_NEWS_SOURCES = [
  'cnbc',
  'yahoo',
  'marketwatch',
  'bbc',
  'ft',
  'seekingalpha',
  'techcrunch',
  'fed',
]
export const NEWS_CATEGORIES = [
  ...new Set(NEWS_SOURCES.map((s) => s.category)),
].sort()
export const NEWS_REGIONS = [
  ...new Set(NEWS_SOURCES.map((s) => s.region)),
].sort()
