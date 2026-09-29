import type { History, Period } from './types'
export type MarketContext = {
  data: Record<string, History>
  errors: Record<string, string>
  loading: string[]
  period: Period
  benchmark: string
  selected: string[]
  setSelected: (symbols: string[]) => void
  load: (symbols: string[], refresh?: boolean) => Promise<void>
  watchlist: string[]
  toggleWatch: (symbol: string) => void
  compare: (symbols: string[]) => void
  notify: (message: string) => void
}
