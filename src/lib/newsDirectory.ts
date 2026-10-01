import type { NewsSource } from './newsSources'

export const DIRECTORY_SORTS = [
  'relevance',
  'name',
  'region',
  'selected',
] as const
export const DIRECTORY_SELECTIONS = ['all', 'selected', 'unselected'] as const
export type DirectorySort = (typeof DIRECTORY_SORTS)[number]
export type DirectorySelection = (typeof DIRECTORY_SELECTIONS)[number]
export const connectedNewsSource = (source: NewsSource) =>
  !!source.feed && source.feedEnabled === true

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

export function findNewsSources(
  sources: NewsSource[],
  {
    query = '',
    category = 'all',
    region = 'all',
    availability = 'all',
    selection = 'all',
    sort = 'relevance',
    selected = [],
  }: {
    query?: string
    category?: string
    region?: string
    availability?: 'all' | 'feed' | 'website'
    selection?: DirectorySelection
    sort?: DirectorySort
    selected?: string[]
  } = {},
) {
  const needle = normalize(query)
  const words = [...new Set(needle.split(' ').filter(Boolean))]
  const selectedIds = new Set(selected)
  return sources
    .map((source, index) => {
      const fields = [
        source.name,
        source.id,
        source.url,
        `${source.category} ${source.region}`,
        source.note ?? '',
      ].map(normalize)
      const connected = connectedNewsSource(source)
      const isSelected = connected && selectedIds.has(source.id)
      const matches =
        words.every((word) => fields.some((field) => field.includes(word))) &&
        (category === 'all' || source.category === category) &&
        (region === 'all' || source.region === region) &&
        (availability === 'all' ||
          (availability === 'feed' ? connected : !connected)) &&
        (selection === 'all' ||
          (selection === 'selected' ? isSelected : connected && !isSelected))
      const relevance = !words.length
        ? 0
        : (fields[0] === needle ? 100 : fields[0].startsWith(needle) ? 50 : 0) +
          words.reduce(
            (score, word) =>
              score +
              ([20, 12, 6, 3, 1][
                fields.findIndex((field) => field.includes(word))
              ] ?? 0),
            0,
          )
      return { source, index, isSelected, matches, relevance }
    })
    .filter((entry) => entry.matches)
    .sort((a, b) => {
      const nameOrder = a.source.name.localeCompare(b.source.name, 'en', {
        sensitivity: 'base',
      })
      if (sort === 'name') return nameOrder
      if (sort === 'region')
        return a.source.region.localeCompare(b.source.region, 'en') || nameOrder
      if (sort === 'selected' && a.isSelected !== b.isSelected)
        return a.isSelected ? -1 : 1
      return b.relevance - a.relevance || a.index - b.index
    })
    .map((entry) => entry.source)
}

export function changeNewsFeedSelection(
  selected: string[],
  matching: NewsSource[],
  include: boolean,
): string[] {
  const ids = matching.filter(connectedNewsSource).map((source) => source.id)
  return include
    ? [...new Set([...selected, ...ids])]
    : [...new Set(selected)].filter((id) => !ids.includes(id))
}
