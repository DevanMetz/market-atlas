import { describe, expect, it } from 'vitest'
import {
  chartData,
  inPeriod,
  metrics,
  parseDateRange,
  performance,
  stdev,
  validDate,
} from './analytics'
import { monthlyReturns, rollingSeries, seasonalSummary } from './trends'
import { simulatePortfolio, validWeights } from './portfolio'
import type { History } from './types'
import { normalizeChart } from '../../worker/index'

function history(symbol: string, prices: number[], dates?: string[]): History {
  return {
    symbol,
    name: symbol,
    currency: 'USD',
    exchange: 'Test',
    fetchedAt: '2026-09-29T00:00:00Z',
    marketTime: '2026-09-28T20:00:00Z',
    price: prices.at(-1)!,
    source: 'Test fixture',
    adjusted: true,
    points: prices.map((price, i) => ({
      date: dates?.[i] ?? `2026-09-${String(i + 1).padStart(2, '0')}`,
      adjusted: price,
      close: price,
      volume: 100 + i,
    })),
  }
}
const pricePath = (returns: number[]) =>
  returns.reduce((prices, r) => [...prices, prices.at(-1)! * (1 + r)], [100])

describe('explicit research windows', () => {
  it('rejects nonexistent dates, reversed ranges and ambiguous date strings', () => {
    expect(validDate('2024-02-29')).toBe(true)
    for (const date of [
      '2026-02-29',
      '2026-09-31',
      '9/1/2026',
      '2026-09-01T00:00:00Z',
      '',
      null,
    ])
      expect(validDate(date)).toBe(false)
    expect(parseDateRange('2026-09-02', '2026-09-01')).toBeNull()
    expect(parseDateRange('2026-09-01', '2026-09-01')).toBeNull()
  })
  it('uses the prior close for a weekend start and excludes future prices', () => {
    const h = history(
      'A',
      [100, 105, 110, 900],
      ['2026-09-04', '2026-09-08', '2026-09-09', '2026-09-10'],
    )
    const window = { start: '2026-09-06', end: '2026-09-09' }
    expect(inPeriod(h.points, window).map((p) => p.date)).toEqual([
      '2026-09-04',
      '2026-09-08',
      '2026-09-09',
    ])
    expect(performance(h, window)).toBeCloseTo(10)
    expect(chartData([h], window, 'relative', 'MISSING')).toEqual([])
  })
  it('does not use a stale baseline from weeks before the chosen start', () => {
    const h = history(
      'A',
      [100, 120, 130],
      ['2026-08-01', '2026-09-04', '2026-09-08'],
    )
    expect(
      performance(h, { start: '2026-09-01', end: '2026-09-08' }),
    ).toBeNull()
  })
  it('bounds every technical indicator to the historical end date', () => {
    const dates = Array.from({ length: 260 }, (_, i) =>
      new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
    )
    const prices = dates.map((_, i) => 100 + i)
    const full = history('A', prices, dates),
      before = history('A', prices.slice(0, 220), dates.slice(0, 220))
    const window = { start: dates[30], end: dates[219] }
    const actual = metrics(full, window),
      expected = metrics(before, window)
    for (const key of [
      'sma50',
      'sma200',
      'rsi',
      'high',
      'low',
      'lastAdjusted',
      'volume',
      'technicalDate',
    ] as const)
      expect(actual[key]).toEqual(expected[key])
    expect(actual.lastAdjusted).toBe(319)
  })
})

describe('rolling research', () => {
  it('warms up from earlier history while emitting only the requested dates', () => {
    const h = history('A', [100, 110, 99, 108.9, 119.79, 1000])
    const rows = rollingSeries(
      [h],
      'A',
      { start: '2026-09-04', end: '2026-09-05' },
      3,
      'return',
    )
    expect(rows.map((r) => r.date)).toEqual(['2026-09-04', '2026-09-05'])
    expect(rows[0].A).toBeCloseTo(8.9)
    expect(rows[1].A).toBeCloseTo(8.9)
    const prefix = { ...h, points: h.points.slice(0, 5) }
    expect(
      rollingSeries(
        [prefix],
        'A',
        { start: '2026-09-04', end: '2026-09-05' },
        3,
        'return',
      ),
    ).toEqual(rows)
  })
  it('computes paired trailing beta, correlation and sample volatility', () => {
    const r = [0.01, -0.02, 0.03, -0.01, 0.02]
    const b = history('B', pricePath(r)),
      a = history('A', pricePath(r.map((v) => v * 2)))
    const window = { start: '2026-09-01', end: '2026-09-06' }
    const beta = rollingSeries([a, b], 'B', window, 3, 'beta')
    beta.forEach((row) => expect(row.A).toBeCloseTo(2))
    rollingSeries([a, b], 'B', window, 3, 'correlation').forEach((row) =>
      expect(row.A).toBeCloseTo(1),
    )
    const volatility = rollingSeries([b], 'B', window, 3, 'volatility')
    expect(volatility[0].B).toBeCloseTo(
      stdev(r.slice(0, 3)) * Math.sqrt(252) * 100,
    )
  })
  it('keeps undefined relationships blank and requires a benchmark', () => {
    const flat = history('A', [100, 100, 100, 100, 100]),
      b = history('B', [100, 102, 99, 101, 103])
    expect(
      rollingSeries([flat, b], 'B', '1W', 3, 'correlation')[0].A,
    ).toBeNull()
    expect(rollingSeries([flat], 'MISSING', '1W', 3, 'beta')).toEqual([])
    expect(rollingSeries([b], 'B', '1W', 252, 'return')).toEqual([])
  })
})

describe('monthly returns and seasonal summaries', () => {
  const dates = [
    '2025-12-31',
    '2026-01-02',
    '2026-01-30',
    '2026-02-02',
    '2026-02-27',
    '2026-03-02',
    '2026-03-16',
  ]
  const a = history('A', [100, 102, 110, 111, 99, 100, 105], dates)
  it('uses prior-month closing baselines and labels month-to-date values', () => {
    const months = monthlyReturns(a, undefined, '2026-03-29')
    expect(months[0].value).toBeNull()
    expect(months[1]).toMatchObject({
      key: '2026-01',
      partial: false,
      start: '2025-12-31',
      end: '2026-01-30',
    })
    expect(months[1].value).toBeCloseTo(10)
    expect(months[2].value).toBeCloseTo(-10)
    expect(months[3].partial).toBe(true)
    const seasonal = seasonalSummary(months)
    expect(seasonal[0]).toMatchObject({ count: 1, positiveRate: 100 })
    expect(seasonal[1]).toMatchObject({ count: 1, positiveRate: 0 })
    expect(seasonal[2]).toMatchObject({ count: 0, average: null })
  })
  it('compares asset and benchmark on their shared monthly dates', () => {
    const b = history('B', [100, 101, 105, 106, 107, 108, 110], dates)
    expect(monthlyReturns(a, b, '2026-03-29')[1].value).toBeCloseTo(5)
    monthlyReturns(a, a, '2026-03-29')
      .filter((m) => m.value !== null)
      .forEach((m) => expect(m.value).toBe(0))
  })
  it('excludes truncated past months from the seasonal averages', () => {
    const h = history(
      'A',
      [100, 105, 110],
      ['2026-01-30', '2026-02-02', '2026-02-10'],
    )
    const months = monthlyReturns(h, undefined, '2026-03-29')
    expect(months[1].partial).toBe(true)
    expect(seasonalSummary(months)[1].count).toBe(0)
  })
})

describe('portfolio rebalancing and attribution', () => {
  const dates = ['2026-01-30', '2026-02-02', '2026-02-03', '2026-03-02']
  const a = history('A', [100, 200, 200, 100], dates),
    b = history('B', [100, 100, 200, 200], dates)
  const window = { start: dates[0], end: dates.at(-1)! },
    weights = { A: 50, B: 50 }
  it('allows buy-and-hold weights to drift with prices', () => {
    const result = simulatePortfolio([a, b], weights, window, a)
    expect(result.rows.at(-1)!.Portfolio).toBeCloseTo(15000)
    expect(result.holdings[0].finalWeight).toBeCloseTo(100 / 3)
    expect(result.rebalances).toBe(0)
  })
  it('rebalances after the first closing observation without backdating new weights', () => {
    const result = simulatePortfolio([a, b], weights, window, a, {
      capital: 10000,
      rebalance: 'monthly',
    })
    expect(result.rows.map((r) => r.Portfolio)).toEqual([
      10000, 15000, 22500, 18750,
    ])
    expect(result.rebalances).toBe(2)
    expect(result.holdings.map((h) => h.finalWeight)).toEqual([50, 50])
    expect(result.holdings.map((h) => h.profit)).toEqual([1250, 7500])
    expect(
      result.holdings.reduce((sum, h) => sum + h.contribution, 0),
    ).toBeCloseTo(87.5)
  })
  it('supports quarterly/yearly intervals and arbitrary positive capital', () => {
    const quarter = simulatePortfolio([a, b], weights, window, a, {
      capital: 20000,
      rebalance: 'quarterly',
    })
    expect(quarter.rows.at(-1)!.Portfolio).toBeCloseTo(30000)
    expect(quarter.rebalances).toBe(0)
    const newDates = ['2025-12-31', '2026-01-02', '2026-01-05', '2026-04-01']
    const aa = history('A', [100, 200, 200, 100], newDates),
      bb = history('B', [100, 100, 200, 200], newDates)
    const range = { start: newDates[0], end: newDates.at(-1)! }
    expect(
      simulatePortfolio([aa, bb], weights, range, aa, {
        capital: 10000,
        rebalance: 'yearly',
      }).rebalances,
    ).toBe(1)
    expect(
      simulatePortfolio([aa, bb], weights, range, aa, {
        capital: 10000,
        rebalance: 'quarterly',
      }).rebalances,
    ).toBe(2)
  })
  it('refuses incomplete data, unknown currencies and invalid allocations', () => {
    expect(validWeights({ A: NaN })).toBe(false)
    expect(validWeights({ A: Infinity })).toBe(false)
    expect(simulatePortfolio([a], weights, window, a).rows).toEqual([])
    expect(
      simulatePortfolio([a, { ...b, currency: 'Unknown' }], weights, window, a)
        .rows,
    ).toEqual([])
    expect(simulatePortfolio([a, b], { A: 60, B: 60 }, window, a).rows).toEqual(
      [],
    )
    expect(
      simulatePortfolio([a, b], weights, window, a, {
        capital: 0,
        rebalance: 'none',
      }).rows,
    ).toEqual([])
    expect(simulatePortfolio([a, b], weights, window, undefined).rows).toEqual(
      [],
    )
  })
  it('normalizes harmless weight rounding without creating or losing capital', () => {
    const result = simulatePortfolio([a, b], { A: 49.9999, B: 50 }, window, a, {
      capital: 10000,
      rebalance: 'monthly',
    })
    expect(result.rows[0].Portfolio).toBeCloseTo(10000, 8)
    const profit = result.holdings.reduce((sum, h) => sum + h.profit, 0)
    expect(profit).toBeCloseTo(Number(result.rows.at(-1)!.Portfolio) - 10000, 8)
  })
})

describe('normalization of missing provider metadata', () => {
  it('preserves unknown currency and volume and falls back from invalid quotes', () => {
    const h = normalizeChart(
      {
        chart: {
          result: [
            {
              meta: { regularMarketPrice: Infinity, regularMarketTime: 1e99 },
              timestamp: [1788307200, 1788393600, 1788480000, Infinity],
              indicators: {
                quote: [
                  {
                    close: [100, 101, Infinity, 104],
                    volume: [0, null, 10, 10],
                  },
                ],
                adjclose: [{ adjclose: [100, 101, 102, 104] }],
              },
            },
          ],
        },
      },
      'A',
    )
    expect(h.points).toHaveLength(2)
    expect(h.currency).toBe('Unknown')
    expect(h.points.map((p) => p.volume)).toEqual([0, null])
    expect(h.price).toBe(101)
    expect(h.marketTime).toBe(new Date(1788393600 * 1000).toISOString())
  })
})
