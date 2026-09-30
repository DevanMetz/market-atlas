import { describe, expect, it } from 'vitest'
import { parseSavedViews, preserveViewSettings } from './viewSettings'

const view = {
  id: 'a',
  name: 'Tech research',
  query: '?view=trends&period=1Y&metric=beta&lookback=20',
  savedAt: '2026-09-29T12:00:00Z',
}
describe('saved research views', () => {
  it('restores named local research settings', () => {
    expect(parseSavedViews(JSON.stringify([view]))).toEqual([view])
  })
  it('rejects external destinations, unknown pages and malformed records', () => {
    const invalid = [
      null,
      { ...view, query: 'https://example.com/' },
      { ...view, query: '//example.com/' },
      { ...view, query: 'javascript:alert(1)' },
      { ...view, query: '?view=constructor' },
      { ...view, savedAt: 'not a date' },
      { ...view, name: '' },
    ]
    expect(parseSavedViews(JSON.stringify(invalid))).toEqual([])
    expect(parseSavedViews('{bad json')).toEqual([])
    expect(parseSavedViews(null)).toEqual([])
  })
  it('caps the number and size of stored views', () => {
    expect(
      parseSavedViews(
        JSON.stringify(
          Array.from({ length: 25 }, (_, i) => ({ ...view, id: String(i) })),
        ),
      ),
    ).toHaveLength(20)
    expect(
      parseSavedViews(
        JSON.stringify([
          { ...view, name: 'a'.repeat(81) },
          { ...view, query: '?view=trends&symbols=' + 'A'.repeat(4096) },
        ]),
      ),
    ).toEqual([])
  })
})

describe('shareable chart settings', () => {
  it('keeps the active page settings while the global range changes', () => {
    const result = preserveViewSettings(
      'trends',
      '?view=trends&period=1Y&metric=beta&lookback=20&calendar=AAPL&basis=relative',
      new URLSearchParams({ view: 'trends', period: '3Y', benchmark: 'QQQ' }),
    )
    expect(result.get('period')).toBe('3Y')
    expect(result.get('metric')).toBe('beta')
    expect(result.get('lookback')).toBe('20')
    expect(result.get('calendar')).toBe('AAPL')
    expect(result.get('basis')).toBe('relative')
  })
  it('does not carry unrelated settings into a different research page', () => {
    const result = preserveViewSettings(
      'risk',
      '?metric=beta&lookback=20&calendar=AAPL&decline=10&universe=global&unexpected=1',
      new URLSearchParams({ view: 'risk' }),
    )
    expect(result.toString()).toBe('view=risk&decline=10')
  })
  it('preserves a news topic comparison when saving or sharing research', () => {
    const result = preserveViewSettings(
      'news',
      '?newsTab=sentiment&days=1&newsInterval=hour&newsChart=topics&newsTopics=Technology,Energy&feeds=bbc,cnbc&newsCompanies=AAPL,MSFT',
      new URLSearchParams({ view: 'news' }),
    )
    expect(result.get('newsInterval')).toBe('hour')
    expect(result.get('newsChart')).toBe('topics')
    expect(result.get('newsTopics')).toBe('Technology,Energy')
    expect(result.get('feeds')).toBe('bbc,cnbc')
    expect(result.get('newsCompanies')).toBe('AAPL,MSFT')
  })
})
