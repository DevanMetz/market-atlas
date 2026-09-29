import { describe, expect, it } from 'vitest'
import {
  align,
  chartData,
  correlation,
  cutoff,
  dailyChange,
  dailyReturns,
  inPeriod,
  maxDrawdown,
  metrics,
  performance,
  rsi,
  stdev,
} from './analytics'
import type { History } from './types'
import { normalizeChart, parseSymbols } from '../../worker/index'
import { simulatePortfolio } from './portfolio'

function history(symbol: string, prices: number[], dates?: string[]): History {
  return {
    symbol,
    name: symbol,
    currency: 'USD',
    exchange: 'NYSE',
    fetchedAt: '2026-09-29T00:00:00Z',
    marketTime: '2026-09-28T20:00:00Z',
    price: prices.at(-1)!,
    source: 'Test fixture',
    adjusted: true,
    points: prices.map((p, i) => ({
      date: dates?.[i] ?? `2026-09-${String(i + 1).padStart(2, '0')}`,
      adjusted: p,
      close: p,
      volume: 100,
    })),
  }
}
describe('calendar windows', () => {
  it('clamps month-end cutoffs rather than overflowing into the wrong month', () => {
    expect(cutoff('1M', '2026-03-31')).toBe('2026-02-28')
    expect(cutoff('1M', '2024-03-31')).toBe('2024-02-29')
  })
  it('handles leap-year annual cutoffs and year-to-date', () => {
    expect(cutoff('1Y', '2024-02-29')).toBe('2023-02-28')
    expect(cutoff('YTD', '2026-09-29')).toBe('2025-12-31')
  })
  it('starts at the prior trading observation and refuses insufficient IPO history', () => {
    const h = history(
      'A',
      [100, 110, 120, 130],
      ['2025-12-30', '2026-01-02', '2026-09-01', '2026-09-28'],
    )
    expect(inPeriod(h.points, 'YTD')[0].date).toBe('2025-12-30')
    expect(performance(h, 'YTD')).toBeCloseTo(30)
    expect(performance(h, '3Y')).toBeNull()
  })
})
describe('financial calculations', () => {
  it('uses sample volatility and observed returns', () => {
    expect(dailyReturns([100, 110, 99])).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(-0.1),
    ])
    expect(stdev([0.1, -0.1])).toBeCloseTo(Math.sqrt(0.02))
    expect(dailyChange(history('A', [100, 110, 99]))).toBeCloseTo(-10)
  })
  it('computes peak-to-trough drawdown, including recovery', () =>
    expect(maxDrawdown([100, 120, 90, 110, 130])).toBeCloseTo(-25))
  it('handles correlation sign and constant-price series', () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
    expect(correlation([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1)
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull()
  })
  it('aligns dates before calculating comparisons', () => {
    const a = history(
        'A',
        [100, 105, 110, 120],
        ['2026-09-01', '2026-09-02', '2026-09-04', '2026-09-08'],
      ),
      b = history(
        'B',
        [100, 102, 106],
        ['2026-09-01', '2026-09-04', '2026-09-08'],
      )
    const aligned = align([a, b], '1W')
    expect(aligned.dates).toEqual(['2026-09-01', '2026-09-04', '2026-09-08'])
    expect(aligned.values.A).toEqual([100, 110, 120])
    const rows = chartData([a, b], '1W', 'relative', 'B')
    expect(rows[0].A).toBe(0)
    expect(rows.at(-1)!.A).toBeCloseTo(14)
    expect(rows.at(-1)!.B).toBe(0)
  })
  it('has no synthetic dates or forward filling in a comparison', () => {
    const a = history('A', [100, 110], ['2026-09-01', '2026-09-08']),
      b = history('B', [100, 120], ['2026-09-02', '2026-09-08'])
    expect(align([a, b], '1W').dates).toEqual(['2026-09-08'])
  })
  it('computes beta from paired daily returns', () => {
    const b = history(
      'B',
      [
        100, 101, 99.99, 101.9898, 100.969902, 102.98930004, 104.0191930404,
        102.979001109996,
      ],
    )
    const a = history(
      'A',
      [
        100, 102, 99.96, 103.9584, 101.879232, 105.95440128, 108.0734893056,
        105.912019519488,
      ],
    )
    expect(metrics(a, '1W', b).beta).toBeCloseTo(2)
    expect(metrics(a, '1W', b).correlation).toBeCloseTo(1)
  })
  it('handles flat, rising and falling RSI', () => {
    expect(rsi(Array(20).fill(100))).toBe(50)
    expect(rsi(Array.from({ length: 20 }, (_, i) => 100 + i))).toBe(100)
    expect(rsi(Array.from({ length: 20 }, (_, i) => 100 - i))).toBe(0)
    expect(rsi([100, 101])).toBeNull()
  })
  it('keeps buy-and-hold allocations fixed at inception', () => {
    const dates = ['2026-09-01', '2026-09-04', '2026-09-08'],
      a = history('A', [100, 110, 120], dates),
      b = history('B', [100, 95, 90], dates)
    const { rows } = simulatePortfolio([a, b], { A: 60, B: 40 }, '1W', a)
    expect(rows[0].Portfolio).toBe(10000)
    expect(rows.at(-1)!.Portfolio).toBeCloseTo(10800)
    expect(rows.at(-1)!.A).toBeCloseTo(12000)
  })
})
describe('market API boundaries', () => {
  it('deduplicates supported symbols and rejects arbitrary paths or large batches', () => {
    expect(parseSymbols('aapl,SPY,AAPL,BRK-B,^GSPC')).toEqual([
      'AAPL',
      'SPY',
      'BRK-B',
      '^GSPC',
    ])
    expect(() => parseSymbols('../secrets')).toThrow()
    expect(() => parseSymbols('https://example.com')).toThrow()
    expect(() => parseSymbols('')).toThrow()
    expect(() =>
      parseSymbols(Array.from({ length: 13 }, (_, i) => `A${i}`).join(',')),
    ).toThrow()
  })
  it('uses adjusted values across a split and excludes invalid prices', () => {
    const h = normalizeChart(
      {
        chart: {
          result: [
            {
              meta: { currency: 'USD', regularMarketPrice: 52 },
              timestamp: [1788307200, 1788393600, 1788480000],
              indicators: {
                quote: [{ close: [100, 51, null], volume: [10, 20, 30] }],
                adjclose: [{ adjclose: [50, 51, null] }],
              },
            },
          ],
        },
      },
      'A',
    )
    expect(h.points).toHaveLength(2)
    expect(h.adjusted).toBe(true)
    expect(dailyChange(h)).toBeCloseTo(2)
    expect(h.price).toBe(52)
  })
  it('labels an entirely unadjusted series when adjustment is incomplete', () => {
    const h = normalizeChart(
      {
        chart: {
          result: [
            {
              meta: {},
              timestamp: [1788307200, 1788393600],
              indicators: {
                quote: [{ close: [100, 51] }],
                adjclose: [{ adjclose: [50, null] }],
              },
            },
          ],
        },
      },
      'A',
    )
    expect(h.adjusted).toBe(false)
    expect(h.points.map((p) => p.adjusted)).toEqual([100, 51])
    expect(h.warning).toContain('unadjusted')
  })
  it('rejects empty market responses', () =>
    expect(() => normalizeChart({ chart: { result: [] } }, 'A')).toThrow())
})
