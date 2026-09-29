import { dailyReturns, maxDrawdown, mean, stdev, validDate } from './analytics'

export type DrawdownEpisode = {
  peak: string
  trough: string
  recovery: string | null
  end: string
  depth: number
  declineObservations: number
  recoveryObservations: number | null
  underwaterObservations: number
  calendarDays: number
}

const elapsedDays = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000)
const validSeries = (dates: string[], prices: number[]) =>
  dates.length >= 2 &&
  dates.length === prices.length &&
  dates.every(
    (date, i) =>
      validDate(date) &&
      (i === 0 || date > dates[i - 1]) &&
      Number.isFinite(prices[i]) &&
      prices[i] > 0,
  )

/** Linear interpolation between sorted observations (the inclusive quantile). */
export function quantile(values: number[], probability: number): number | null {
  if (
    !values.length ||
    probability < 0 ||
    probability > 1 ||
    !Number.isFinite(probability) ||
    values.some((v) => !Number.isFinite(v))
  )
    return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * probability,
    lower = Math.floor(index)
  return (
    sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower)
  )
}

/** Non-overlapping episodes relative to peaks observed inside this window. */
export function drawdownEpisodes(
  dates: string[],
  prices: number[],
): DrawdownEpisode[] {
  if (!validSeries(dates, prices)) return []
  const episodes: DrawdownEpisode[] = []
  let peak = 0,
    trough = 0,
    underwater = false
  const finish = (end: number, recovered: boolean) =>
    episodes.push({
      peak: dates[peak],
      trough: dates[trough],
      recovery: recovered ? dates[end] : null,
      end: dates[end],
      depth: (prices[trough] / prices[peak] - 1) * 100,
      declineObservations: trough - peak,
      recoveryObservations: recovered ? end - trough : null,
      underwaterObservations: end - peak,
      calendarDays: elapsedDays(dates[peak], dates[end]),
    })
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] >= prices[peak]) {
      if (underwater) finish(i, true)
      peak = i
      trough = i
      underwater = false
    } else {
      if (!underwater || prices[i] < prices[trough]) trough = i
      underwater = true
    }
  }
  if (underwater) finish(prices.length - 1, false)
  return episodes
}

export function riskProfile(dates: string[], prices: number[]) {
  if (!validSeries(dates, prices)) return null
  const returns = dailyReturns(prices),
    days = elapsedDays(dates[0], dates.at(-1)!)
  const episodes = drawdownEpisodes(dates, prices)
  const tailCount = returns.length >= 60 ? Math.ceil(returns.length * 0.05) : 0
  const worstTail = tailCount
    ? [...returns].sort((a, b) => a - b).slice(0, tailCount)
    : []
  return {
    start: dates[0],
    end: dates.at(-1)!,
    observations: returns.length,
    change: (prices.at(-1)! / prices[0] - 1) * 100,
    annualized:
      days >= 365
        ? (Math.pow(prices.at(-1)! / prices[0], 365.25 / days) - 1) * 100
        : null,
    volatility:
      returns.length >= 3 ? stdev(returns) * Math.sqrt(252) * 100 : null,
    maxDrawdown: maxDrawdown(prices)!,
    currentDrawdown: (prices.at(-1)! / Math.max(...prices) - 1) * 100,
    positiveRate: (returns.filter((r) => r > 0).length / returns.length) * 100,
    best: Math.max(...returns) * 100,
    worst: Math.min(...returns) * 100,
    fifthPercentile: tailCount ? quantile(returns, 0.05)! * 100 : null,
    worstTailMean: tailCount ? mean(worstTail) * 100 : null,
    tailCount,
    longest: episodes.length
      ? episodes.reduce((a, b) => (a.calendarDays >= b.calendarDays ? a : b))
      : null,
    episodes,
  }
}
