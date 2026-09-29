import { align } from './analytics'
import type { ChartRow, History, Rebalance, TimeWindow } from './types'

export type PortfolioSettings = { capital: number; rebalance: Rebalance }
export type HoldingResult = {
  symbol: string
  initialWeight: number
  finalWeight: number
  assetReturn: number
  profit: number
  contribution: number
}
export type PortfolioResult = {
  rows: ChartRow[]
  holdings: HoldingResult[]
  rebalances: number
}
const EMPTY: PortfolioResult = { rows: [], holdings: [], rebalances: 0 }

const interval = (date: string, frequency: Rebalance) =>
  frequency === 'monthly'
    ? date.slice(0, 7)
    : frequency === 'quarterly'
      ? `${date.slice(0, 4)}-${Math.floor((Number(date.slice(5, 7)) - 1) / 3)}`
      : date.slice(0, 4)

export function validWeights(value: unknown): value is Record<string, number> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length <= 12 &&
    Object.entries(value).every(
      ([symbol, weight]) =>
        /^[A-Z0-9^][A-Z0-9.^=\-]{0,19}$/.test(symbol) &&
        typeof weight === 'number' &&
        Number.isFinite(weight) &&
        weight >= 0 &&
        weight <= 100,
    )
  )
}

export function simulatePortfolio(
  histories: History[],
  weights: Record<string, number>,
  period: TimeWindow,
  benchmark: History | undefined,
  settings: PortfolioSettings = { capital: 10000, rebalance: 'none' },
): PortfolioResult {
  if (
    !validWeights(weights) ||
    !Number.isFinite(settings.capital) ||
    settings.capital <= 0 ||
    settings.capital > 1e9 ||
    !['none', 'monthly', 'quarterly', 'yearly'].includes(settings.rebalance)
  )
    return EMPTY
  const symbols = Object.keys(weights).filter((s) => weights[s] > 0)
  const totalWeight = symbols.reduce((sum, s) => sum + weights[s], 0)
  if (
    !symbols.length ||
    Math.abs(totalWeight - 100) >= 0.001
  )
    return EMPTY
  const unique = new Map(histories.map((h) => [h.symbol, h]))
  if (
    symbols.some((s) => !unique.has(s) || unique.get(s)!.currency !== 'USD') ||
    !benchmark ||
    benchmark.currency !== 'USD'
  )
    return EMPTY
  const members = symbols.map((s) => unique.get(s)!)
  const all = symbols.includes(benchmark.symbol)
    ? members
    : [...members, benchmark]
  const { dates, values } = align(all, period)
  if (dates.length < 2) return EMPTY
  const positions = Object.fromEntries(
    symbols.map((s) => [s, (settings.capital * weights[s]) / totalWeight]),
  )
  const profit = Object.fromEntries(symbols.map((s) => [s, 0]))
  const rows: ChartRow[] = []
  let rebalances = 0
  dates.forEach((date, i) => {
    if (i > 0)
      symbols.forEach((s) => {
        const next = (positions[s] * values[s][i]) / values[s][i - 1]
        profit[s] += next - positions[s]
        positions[s] = next
      })
    const total = symbols.reduce((sum, s) => sum + positions[s], 0)
    rows.push({
      date,
      Portfolio: total,
      [benchmark.symbol]:
        (settings.capital * values[benchmark.symbol][i]) /
        values[benchmark.symbol][0],
    })
    // Rebalance after this closing observation. Today's return is earned at
    // yesterday's holdings; only subsequent returns use the new allocation.
    if (
      i > 0 &&
      settings.rebalance !== 'none' &&
      interval(date, settings.rebalance) !==
        interval(dates[i - 1], settings.rebalance)
    ) {
      symbols.forEach((s) => {
        positions[s] = (total * weights[s]) / totalWeight
      })
      rebalances++
    }
  })
  const finalTotal = Number(rows.at(-1)!.Portfolio)
  return {
    rows,
    rebalances,
    holdings: symbols.map((s) => ({
      symbol: s,
      initialWeight: weights[s] / totalWeight * 100,
      finalWeight: (positions[s] / finalTotal) * 100,
      assetReturn: (values[s].at(-1)! / values[s][0] - 1) * 100,
      profit: profit[s],
      contribution: (profit[s] / settings.capital) * 100,
    })),
  }
}
