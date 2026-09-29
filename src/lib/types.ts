export type Period = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | '5Y'
export type DateRange = { start: string; end: string }
export type TimeWindow = Period | DateRange
export type RollingMetric = 'return' | 'volatility' | 'correlation' | 'beta'
export type Rebalance = 'none' | 'monthly' | 'quarterly' | 'yearly'
export type View =
  | 'overview'
  | 'sectors'
  | 'compare'
  | 'trends'
  | 'stocks'
  | 'correlations'
  | 'portfolio'
  | 'watchlist'
  | 'methodology'
export type Asset = {
  symbol: string
  name: string
  kind: 'Sector' | 'Benchmark' | 'Stock' | 'Global'
  sector?: string
  color?: string
}
export type PricePoint = {
  date: string
  close: number
  adjusted: number
  volume: number | null
}
export type History = {
  symbol: string
  name: string
  currency: string
  exchange: string
  points: PricePoint[]
  fetchedAt: string
  marketTime: string
  price: number
  source: string
  adjusted: boolean
  stale?: boolean
  warning?: string
}
export type HistoryResponse = {
  data: History[]
  errors: { symbol: string; message: string }[]
}
export type ChartRow = { date: string; [key: string]: number | string | null }
