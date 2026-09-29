import {
  align,
  correlation,
  cutoff,
  dailyReturns,
  mean,
  stdev,
} from './analytics'
import type { ChartRow, History, RollingMetric, TimeWindow } from './types'

export function fullAlignment(histories: History[]) {
  if (!histories.length || histories.some((h) => !h.points.length))
    return { dates: [], values: {} as Record<string, number[]> }
  // Request an explicit window spanning each supplied series. The regular
  // alignment rules still reject an asset missing the start of that window.
  const start = histories
    .map((h) => h.points[0].date)
    .sort()
    .at(-1)!
  const end = histories.map((h) => h.points.at(-1)!.date).sort()[0]
  return align(histories, { start, end })
}

export function rollingSeries(
  histories: History[],
  benchmark: string,
  period: TimeWindow,
  lookback: number,
  metric: RollingMetric,
): ChartRow[] {
  if (!Number.isInteger(lookback) || lookback < 3) return []
  const { dates, values } = fullAlignment(histories)
  if (
    !dates.length ||
    ((metric === 'correlation' || metric === 'beta') && !values[benchmark])
  )
    return []
  const end = typeof period === 'string' ? dates.at(-1)! : period.end
  const start = typeof period === 'string' ? cutoff(period, end) : period.start
  const returns = Object.fromEntries(
    Object.entries(values).map(([symbol, prices]) => [
      symbol,
      dailyReturns(prices),
    ]),
  )
  const result: ChartRow[] = []
  for (let i = lookback; i < dates.length; i++) {
    if (dates[i] < start || dates[i] > end) continue
    const row: ChartRow = { date: dates[i] }
    for (const history of histories) {
      const symbol = history.symbol,
        sample = returns[symbol].slice(i - lookback, i)
      if (metric === 'return')
        row[symbol] =
          (values[symbol][i] / values[symbol][i - lookback] - 1) * 100
      else if (metric === 'volatility')
        row[symbol] = stdev(sample) * Math.sqrt(252) * 100
      else {
        const bm = returns[benchmark].slice(i - lookback, i),
          corr = correlation(sample, bm)
        row[symbol] =
          metric === 'correlation'
            ? corr
            : corr !== null && stdev(bm) > 0
              ? (corr * stdev(sample)) / stdev(bm)
              : null
      }
    }
    result.push(row)
  }
  return result
}

export type MonthReturn = {
  year: number
  month: number
  key: string
  value: number | null
  partial: boolean
  start?: string
  end: string
  observations: number
}

export function monthlyReturns(
  history: History,
  benchmark?: History,
  asOf = new Date().toISOString().slice(0, 10),
): MonthReturn[] {
  const { dates, values } = fullAlignment(
    benchmark && benchmark.symbol !== history.symbol
      ? [history, benchmark]
      : [history],
  )
  if (dates.length < 2) return []
  const prices = values[history.symbol],
    benchmarkPrices = benchmark ? values[benchmark.symbol] : null
  const groups = new Map<string, number[]>()
  dates.forEach((date, index) => {
    const key = date.slice(0, 7)
    groups.set(key, [...(groups.get(key) ?? []), index])
  })
  return [...groups.entries()].map(([key, indices]) => {
    const [year, month] = key.split('-').map(Number),
      first = indices[0],
      last = indices.at(-1)!,
      baseline = first - 1
    const monthEnd = new Date(Date.UTC(year, month, 0))
      .toISOString()
      .slice(0, 10)
    const monthStart = `${key}-01`
    const completeBaseline =
      baseline >= 0 &&
      new Date(monthStart).getTime() - new Date(dates[baseline]).getTime() <=
        7 * 86400000
    const nearMonthEnd =
      new Date(monthEnd).getTime() - new Date(dates[last]).getTime() <=
      4 * 86400000
    const value = completeBaseline
      ? (prices[last] / prices[baseline] - 1) * 100 -
        (benchmarkPrices
          ? (benchmarkPrices[last] / benchmarkPrices[baseline] - 1) * 100
          : 0)
      : null
    return {
      year,
      month,
      key,
      value,
      partial: key >= asOf.slice(0, 7) || !nearMonthEnd,
      start: completeBaseline ? dates[baseline] : undefined,
      end: dates[last],
      observations: indices.length,
    }
  })
}

export function seasonalSummary(months: MonthReturn[]) {
  return Array.from({ length: 12 }, (_, i) => {
    const sample = months
      .filter((m) => m.month === i + 1 && !m.partial && m.value !== null)
      .map((m) => m.value!)
    return {
      month: i + 1,
      count: sample.length,
      average: sample.length ? mean(sample) : null,
      positiveRate: sample.length
        ? (sample.filter((v) => v > 0).length / sample.length) * 100
        : null,
      best: sample.length ? Math.max(...sample) : null,
      worst: sample.length ? Math.min(...sample) : null,
    }
  })
}
