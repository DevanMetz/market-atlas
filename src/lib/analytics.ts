import type {
  ChartRow,
  DateRange,
  History,
  Period,
  PricePoint,
  TimeWindow,
} from './types'

export const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
export const stdev = (values: number[]) => {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(
    values.reduce((sum, x) => sum + (x - average) ** 2, 0) /
      (values.length - 1),
  )
}
export const pct = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`
export const num = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('en-US', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
export const usd = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      }).format(value)
export const shortDate = (date: string) =>
  new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
export const dailyReturns = (values: number[]) =>
  values.slice(1).map((v, i) => v / values[i] - 1)

export function validDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return false
  const parsed = new Date(`${date}T12:00:00Z`)
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  )
}

export function parseDateRange(start: unknown, end: unknown): DateRange | null {
  return validDate(start) && validDate(end) && start < end
    ? { start, end }
    : null
}

export const windowLabel = (period: TimeWindow) =>
  typeof period === 'string' ? period : 'Selected dates'
export const windowKey = (period: TimeWindow) =>
  typeof period === 'string' ? period : `${period.start}_${period.end}`

export function cutoff(period: Period, end: string): string {
  const date = new Date(`${end.slice(0, 10)}T12:00:00Z`)
  if (period === 'YTD') return `${date.getUTCFullYear() - 1}-12-31`
  if (period === '1W') date.setUTCDate(date.getUTCDate() - 7)
  else if (period.endsWith('M')) {
    const day = date.getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(date.getUTCMonth() - parseInt(period))
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate()
    date.setUTCDate(Math.min(day, lastDay))
  } else {
    const month = date.getUTCMonth()
    date.setUTCFullYear(date.getUTCFullYear() - parseInt(period))
    if (date.getUTCMonth() !== month) date.setUTCDate(0)
  }
  return date.toISOString().slice(0, 10)
}

export function inPeriod(
  points: PricePoint[],
  period: TimeWindow,
  end?: string,
): PricePoint[] {
  if (!points.length) return []
  if (typeof period !== 'string' && !parseDateRange(period.start, period.end))
    return []
  const availableEnd = [
    end ?? points.at(-1)!.date,
    points.at(-1)!.date,
  ].sort()[0]
  const until =
    typeof period === 'string'
      ? availableEnd
      : [period.end, availableEnd].sort()[0]
  const from = typeof period === 'string' ? cutoff(period, until) : period.start
  if (from >= until) return []
  let baseline = -1
  points.forEach((p, i) => {
    if (p.date <= from) baseline = i
  })
  const result = points
    .slice(Math.max(0, baseline))
    .filter((p) => p.date <= until)
  // Permit exchange weekends/holidays at the history boundary, but never pass
  // a short IPO history off as a full multi-year return.
  if (
    result.length < 2 ||
    Math.abs(new Date(result[0].date).getTime() - new Date(from).getTime()) >
      7 * 86400000
  )
    return []
  return result
}

export function performance(
  history: History | undefined,
  period: TimeWindow,
  end?: string,
): number | null {
  const points = history ? inPeriod(history.points, period, end) : []
  return points.length > 1
    ? (points.at(-1)!.adjusted / points[0].adjusted - 1) * 100
    : null
}
export function dailyChange(history?: History): number | null {
  if (!history || history.points.length < 2) return null
  return (
    (history.points.at(-1)!.adjusted / history.points.at(-2)!.adjusted - 1) *
    100
  )
}

export function align(
  histories: History[],
  period: TimeWindow,
): { dates: string[]; values: Record<string, number[]> } {
  if (!histories.length || histories.some((h) => !h.points.length))
    return { dates: [], values: {} }
  const end = histories.map((h) => h.points.at(-1)!.date).sort()[0]
  const maps = histories.map(
    (h) =>
      new Map(inPeriod(h.points, period, end).map((p) => [p.date, p.adjusted])),
  )
  const dates = [...maps[0].keys()]
    .filter((date) => maps.every((m) => m.has(date)))
    .sort()
  return {
    dates,
    values: Object.fromEntries(
      histories.map((h, i) => [
        h.symbol,
        dates.map((date) => maps[i].get(date)!),
      ]),
    ),
  }
}

export function chartData(
  histories: History[],
  period: TimeWindow,
  mode: 'return' | 'relative' | 'drawdown' | 'growth' = 'return',
  benchmark = 'SPY',
): ChartRow[] {
  const { dates, values } = align(histories, period)
  if (mode === 'relative' && !values[benchmark]) return []
  const peaks: Record<string, number> = {}
  return dates.map((date, i) => {
    const row: ChartRow = { date }
    const benchmarkReturn = values[benchmark]?.length
      ? (values[benchmark][i] / values[benchmark][0] - 1) * 100
      : 0
    Object.entries(values).forEach(([symbol, prices]) => {
      peaks[symbol] = Math.max(peaks[symbol] ?? prices[0], prices[i])
      const r = (prices[i] / prices[0] - 1) * 100
      row[symbol] =
        mode === 'growth'
          ? 10000 * (1 + r / 100)
          : mode === 'drawdown'
            ? (prices[i] / peaks[symbol] - 1) * 100
            : mode === 'relative'
              ? r - benchmarkReturn
              : r
    })
    return row
  })
}

export function correlation(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null
  const ma = mean(a),
    mb = mean(b)
  let cov = 0,
    va = 0,
    vb = 0
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - ma,
      db = b[i] - mb
    cov += da * db
    va += da * da
    vb += db * db
  }
  return va > 0 && vb > 0
    ? Math.max(-1, Math.min(1, cov / Math.sqrt(va * vb)))
    : null
}

export function maxDrawdown(prices: number[]): number | null {
  if (prices.length < 2) return null
  let peak = prices[0],
    min = 0
  prices.forEach((p) => {
    peak = Math.max(peak, p)
    min = Math.min(min, p / peak - 1)
  })
  return min * 100
}
export function rsi(prices: number[], window = 14): number | null {
  if (prices.length <= window) return null
  const diffs = prices.slice(1).map((p, i) => p - prices[i])
  let gain = mean(diffs.slice(0, window).map((d) => Math.max(0, d)))
  let loss = mean(diffs.slice(0, window).map((d) => Math.max(0, -d)))
  diffs.slice(window).forEach((d) => {
    gain = (gain * (window - 1) + Math.max(0, d)) / window
    loss = (loss * (window - 1) + Math.max(0, -d)) / window
  })
  return gain === 0 && loss === 0
    ? 50
    : loss === 0
      ? 100
      : 100 - 100 / (1 + gain / loss)
}
export function metrics(
  history?: History,
  period: TimeWindow = '1Y',
  benchmark?: History,
) {
  const points = history ? inPeriod(history.points, period) : []
  const prices = points.map((p) => p.adjusted),
    returns = dailyReturns(prices)
  const available = (history?.points ?? []).filter(
    (p) => typeof period === 'string' || p.date <= period.end,
  )
  const all = available.map((p) => p.adjusted)
  let beta: number | null = null,
    corr: number | null = null,
    excess: number | null = null
  if (history && benchmark) {
    const aligned = align([history, benchmark], period)
    const a = aligned.values[history.symbol] ?? [],
      b = aligned.values[benchmark.symbol] ?? []
    const ra = dailyReturns(a),
      rb = dailyReturns(b)
    corr = correlation(ra, rb)
    if (corr !== null && stdev(rb) > 0) beta = (corr * stdev(ra)) / stdev(rb)
    if (a.length > 1) excess = (a.at(-1)! / a[0] - b.at(-1)! / b[0]) * 100
  }
  return {
    change: performance(history, period),
    day: dailyChange(history),
    volatility:
      returns.length >= 3 ? stdev(returns) * Math.sqrt(252) * 100 : null,
    drawdown: maxDrawdown(prices),
    beta,
    correlation: corr,
    excess,
    rsi: rsi(all),
    sma50: all.length >= 50 ? mean(all.slice(-50)) : null,
    sma200: all.length >= 200 ? mean(all.slice(-200)) : null,
    high: all.length ? Math.max(...all.slice(-252)) : null,
    low: all.length ? Math.min(...all.slice(-252)) : null,
    start: points[0]?.date,
    end: points.at(-1)?.date,
    observations: points.length,
    lastAdjusted: all.at(-1) ?? null,
    technicalDate: available.at(-1)?.date,
    volume: available.at(-1)?.volume ?? null,
  }
}

export function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const safe = (v: unknown) => {
    let s = v == null ? '' : String(v)
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
    return '"' + s.replaceAll('"', '""') + '"'
  }
  const blob = new Blob(
      [
        '\uFEFF' +
          [headers, ...rows].map((row) => row.map(safe).join(',')).join('\r\n'),
      ],
      { type: 'text/csv;charset=utf-8;' },
    ),
    url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
