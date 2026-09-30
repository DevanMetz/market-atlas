import { useEffect, useState } from 'react'
import type { View } from './types'

export const VIEW_SETTINGS: Record<View, readonly string[]> = {
  overview: ['mode'],
  sectors: ['basis'],
  compare: ['mode'],
  stocks: ['sector', 'filter', 'above200', 'positive', 'sort', 'direction'],
  trends: ['metric', 'lookback', 'calendar', 'basis'],
  risk: ['decline'],
  news: [
    'newsTab',
    'feeds',
    'q',
    'days',
    'tone',
    'topic',
    'source',
    'newsSort',
    'directory',
    'category',
    'region',
    'availability',
  ],
  correlations: ['universe'],
  portfolio: [],
  watchlist: ['sort', 'direction'],
  methodology: [],
}

export function preserveViewSettings(
  view: View,
  source: string,
  target: URLSearchParams,
) {
  const current = new URLSearchParams(source)
  for (const key of VIEW_SETTINGS[view]) {
    const value = current.get(key)
    if (value !== null) target.set(key, value)
  }
  return target
}

export function useQuerySetting(
  key: string,
  fallback: string,
  valid: (value: string) => boolean,
) {
  const [value, setValue] = useState(() => {
    const incoming = new URLSearchParams(window.location.search).get(key)
    return incoming !== null && valid(incoming) ? incoming : fallback
  })
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    if (query.get(key) === value) return
    query.set(key, value)
    window.history.replaceState({}, '', `${window.location.pathname}?${query}`)
  }, [key, value])
  return [
    value,
    (next: string) => {
      if (valid(next)) setValue(next)
    },
  ] as const
}

export function useQueryChoice<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T,
) {
  const [value, setValue] = useQuerySetting(key, fallback, (value) =>
    choices.includes(value as T),
  )
  return [value as T, setValue] as const
}

export type SavedView = {
  id: string
  name: string
  query: string
  savedAt: string
}
export const SAVED_VIEWS_KEY = 'market-atlas-saved-views'

export function parseSavedViews(raw: string | null): SavedView[] {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!Array.isArray(value)) return []
    return value
      .filter((item): item is SavedView => {
        if (
          !item ||
          typeof item !== 'object' ||
          typeof item.id !== 'string' ||
          item.id.length > 80 ||
          typeof item.name !== 'string' ||
          !item.name.trim() ||
          item.name.length > 80 ||
          typeof item.query !== 'string' ||
          !item.query.startsWith('?') ||
          item.query.length > 4096 ||
          typeof item.savedAt !== 'string' ||
          !Number.isFinite(Date.parse(item.savedAt))
        )
          return false
        const query = new URLSearchParams(item.query)
        return Object.hasOwn(VIEW_SETTINGS, query.get('view') ?? '')
      })
      .slice(0, 20)
  } catch {
    return []
  }
}
