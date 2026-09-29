import { describe, expect, it } from 'vitest'
import { drawdownEpisodes, quantile, riskProfile } from './risk'

const days = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
  )

describe('drawdown episodes', () => {
  it('separates completed and ongoing declines without claiming an unknown recovery', () => {
    const episodes = drawdownEpisodes(
      days(8),
      [100, 90, 80, 90, 100, 110, 100, 105],
    )
    expect(episodes).toHaveLength(2)
    expect(episodes[0]).toMatchObject({
      peak: '2026-01-01',
      trough: '2026-01-03',
      recovery: '2026-01-05',
      end: '2026-01-05',
      declineObservations: 2,
      recoveryObservations: 2,
      underwaterObservations: 4,
      calendarDays: 4,
    })
    expect(episodes[0].depth).toBeCloseTo(-20)
    expect(episodes[1]).toMatchObject({
      peak: '2026-01-06',
      trough: '2026-01-07',
      recovery: null,
      end: '2026-01-08',
      recoveryObservations: null,
      calendarDays: 2,
    })
  })
  it('begins at the last equal closing peak and recognizes an exact recovery', () => {
    const [episode] = drawdownEpisodes(days(5), [100, 100, 90, 95, 100])
    expect(episode.peak).toBe('2026-01-02')
    expect(episode.recovery).toBe('2026-01-05')
    expect(episode.calendarDays).toBe(3)
  })
  it('keeps calendar days distinct from observed trading intervals', () => {
    const [episode] = drawdownEpisodes(
      ['2026-01-02', '2026-01-05', '2026-01-06'],
      [100, 90, 100],
    )
    expect(episode.calendarDays).toBe(4)
    expect(episode.underwaterObservations).toBe(2)
    expect(episode.recoveryObservations).toBe(1)
  })
  it('does not import peaks or recoveries from outside the chosen sample', () => {
    const prices = [200, 100, 80, 100, 210]
    const dates = days(prices.length)
    const [episode] = drawdownEpisodes(dates.slice(1, 4), prices.slice(1, 4))
    expect(episode.depth).toBeCloseTo(-20)
    expect(episode.recovery).toBe('2026-01-04')
    const [ongoing] = drawdownEpisodes(dates.slice(1, 3), prices.slice(1, 3))
    expect(ongoing.recovery).toBeNull()
  })
  it('has no episodes in flat or continually rising prices', () => {
    expect(drawdownEpisodes(days(4), [100, 100, 100, 100])).toEqual([])
    expect(drawdownEpisodes(days(4), [100, 101, 102, 103])).toEqual([])
  })
  it('refuses invalid prices and unordered, duplicate or missing dates', () => {
    expect(drawdownEpisodes(days(3), [100, 0, 110])).toEqual([])
    expect(drawdownEpisodes(days(3), [100, NaN, 110])).toEqual([])
    expect(drawdownEpisodes(days(3), [100, 110])).toEqual([])
    expect(riskProfile(['2026-01-02', '2026-01-01'], [100, 110])).toBeNull()
    expect(riskProfile(['2026-01-01', '2026-01-01'], [100, 110])).toBeNull()
  })
})

describe('risk profiles', () => {
  it('reports simple observed returns and current distance below the peak', () => {
    const p = riskProfile(days(5), [100, 110, 99, 110, 105])!
    expect(p.change).toBeCloseTo(5)
    expect(p.currentDrawdown).toBeCloseTo((105 / 110 - 1) * 100)
    expect(p.maxDrawdown).toBeCloseTo(-10)
    expect(p.positiveRate).toBe(50)
    expect(p.worst).toBeCloseTo(-10)
    expect(p.observations).toBe(4)
    expect(p.longest?.calendarDays).toBe(2)
  })
  it('does not annualize a short window or create tail estimates from too few returns', () => {
    const p = riskProfile(days(4), [100, 110, 90, 100])!
    expect(p.annualized).toBeNull()
    expect(p.fifthPercentile).toBeNull()
    expect(p.worstTailMean).toBeNull()
    expect(p.tailCount).toBe(0)
  })
  it('annualizes using the actual elapsed calendar years', () => {
    const p = riskProfile(['2024-01-01', '2026-01-01'], [100, 121])!
    expect(p.annualized).toBeCloseTo((Math.pow(1.21, 365.25 / 731) - 1) * 100)
  })
  it('computes an interpolated cutoff and the rounded-up worst 5% sample', () => {
    const returns = Array.from({ length: 61 }, (_, i) => (i - 30) / 1000)
    const prices = returns.reduce((p, r) => [...p, p.at(-1)! * (1 + r)], [100])
    const p = riskProfile(days(prices.length), prices)!
    expect(p.fifthPercentile).toBeCloseTo(-2.7)
    expect(p.tailCount).toBe(4)
    expect(p.worstTailMean).toBeCloseTo(-2.85)
    expect(returns[0]).toBe(-0.03)
  })
  it('does not count flat observations as positive days', () => {
    const p = riskProfile(days(4), [100, 100, 100, 100])!
    expect(p.positiveRate).toBe(0)
    expect(p.volatility).toBe(0)
    expect(p.currentDrawdown).toBe(0)
    expect(p.longest).toBeNull()
  })
})

describe('empirical quantiles', () => {
  it('interpolates without mutating source observations', () => {
    const sample = [9, 1, 7, 3]
    expect(quantile(sample, 0.5)).toBe(5)
    expect(quantile(sample, 0.25)).toBe(2.5)
    expect(quantile(sample, 0)).toBe(1)
    expect(quantile(sample, 1)).toBe(9)
    expect(sample).toEqual([9, 1, 7, 3])
  })
  it('keeps invalid or empty distributions unavailable', () => {
    expect(quantile([], 0.5)).toBeNull()
    expect(quantile([1, NaN], 0.5)).toBeNull()
    expect(quantile([1, 2], 1.01)).toBeNull()
  })
})
