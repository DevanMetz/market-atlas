import { describe, expect, it } from 'vitest'
import { analyzeHeadlines, headlineMeasure, headlineTimeline } from './news'
import type { NewsItem } from './news'
import {
  compareHeadlineSearches,
  headlineBucketSample,
  DEFAULT_NEWS_COMPARISONS,
  parseNewsComparisons,
} from './newsComparisons'

const items: NewsItem[] = [
  {
    title: 'Nvidia shares rally',
    sourceId: 'bbc',
    url: 'https://example.org/1',
    publishedAt: '2026-09-30T10:30:00Z',
  },
  {
    title: 'Nvidia shares rally',
    sourceId: 'cnbc',
    url: 'https://example.org/copy',
    publishedAt: '2026-09-30T10:30:00Z',
  },
  {
    title: 'Apple schedules meeting',
    sourceId: 'bbc',
    url: 'https://example.org/2',
    publishedAt: '2026-09-30T10:35:00Z',
  },
  {
    title: 'Apple earnings fall',
    sourceId: 'bbc',
    url: 'https://example.org/3',
    publishedAt: '2026-09-30T11:05:00Z',
  },
  {
    title: 'Banks plunge',
    sourceId: 'bbc',
    url: 'https://example.org/4',
    publishedAt: '2026-09-30T13:05:00Z',
  },
  {
    title: 'Nvidia earnings surge',
    sourceId: 'bbc',
    url: 'https://example.org/5',
    publishedAt: null,
  },
  {
    title: 'Apple profit warning',
    sourceId: 'bbc',
    url: 'https://example.org/6',
    publishedAt: 'bad date',
  },
]
const headlines = analyzeHeadlines([
  { sourceId: 'bbc', items, fetchedAt: '2026-09-30T14:00:00Z' },
])

describe('headlines behind chart intervals', () => {
  it('reproduces the chart sample with grouped copies and unscored titles intact', () => {
    const time = Date.parse('2026-09-30T10:00:00Z')
    const sample = headlineBucketSample(headlines, time, 'hour')
    expect(sample.items.map((item) => item.title).sort()).toEqual([
      'Apple schedules meeting',
      'Nvidia shares rally',
    ])
    expect(
      sample.items.find((item) => item.tickers.includes('NVDA'))?.copies,
    ).toHaveLength(2)
    const {
      date: _date,
      time: _time,
      ...expected
    } = headlineTimeline(headlines, 'hour')[0]
    expect(sample.summary).toEqual(expected)
    expect(sample.summary).toMatchObject({
      total: 2,
      scored: 1,
      unscored: 1,
      score: 40,
    })
  })

  it('uses the same topic and compound-query membership as plotted comparisons', () => {
    const comparisons = [
      {
        name: 'CNBC Nvidia',
        query: 'source:CNBC (ticker:NVDA OR ticker:AAPL) -title:meeting',
      },
      { name: 'All', query: '' },
    ]
    const chart = compareHeadlineSearches(
      headlines,
      comparisons,
      'hour',
    ).timeline
    for (const row of chart) {
      const sample = headlineBucketSample(
        headlines,
        row.time,
        'hour',
        comparisons[0],
      )
      expect(sample.summary).toEqual(row.groups['search-0'])
    }
    const sample = headlineBucketSample(headlines, chart[0].time, 'hour', {
      topic: 'Technology',
    })
    expect(sample.items.map((item) => item.title).sort()).toEqual([
      'Apple schedules meeting',
      'Nvidia shares rally',
    ])
  })

  it('respects the common filtered sample and keeps invalid or absent comparisons empty', () => {
    const filtered = headlines.filter((item) => item.tickers.includes('AAPL'))
    const time = Date.parse('2026-09-30T10:00:00Z')
    expect(headlineBucketSample(filtered, time, 'hour').summary).toMatchObject({
      total: 1,
      scored: 0,
      score: null,
    })
    const absent = headlineBucketSample(filtered, time, 'hour', {
      query: 'ticker:NVDA',
    })
    expect(absent.summary).toMatchObject({ total: 0, scored: 0, score: null })
    expect(
      headlineBucketSample(filtered, time, 'hour', { query: 'earnings OR' }),
    ).toMatchObject({ items: [], error: expect.any(String) })
    expect(
      headlineBucketSample(headlines, time + 1800000, 'hour').items,
    ).toEqual([])
  })

  it('shares exact UTC boundaries with the chart and excludes unknown publication times', () => {
    const shifted = analyzeHeadlines([
      {
        sourceId: 'bbc',
        fetchedAt: '2026-10-01T02:00:00Z',
        items: [
          {
            ...items[0],
            title: 'Prior day',
            url: 'https://example.org/before',
            publishedAt: '2026-09-30T18:59:59-05:00',
          },
          {
            ...items[0],
            title: 'Next day',
            url: 'https://example.org/after',
            publishedAt: '2026-09-30T19:00:00-05:00',
          },
          items[5],
          items[6],
        ],
      },
    ])
    const time = Date.parse('2026-10-01T00:00:00Z')
    expect(
      headlineBucketSample(shifted, time, 'day').items.map(
        (item) => item.title,
      ),
    ).toEqual(['Next day'])
    expect(
      headlineBucketSample(shifted, time, 'hour').items.map(
        (item) => item.title,
      ),
    ).toEqual(['Next day'])
    expect(headlineTimeline(shifted, 'day').map((row) => row.total)).toEqual([
      1, 1,
    ])
  })
})

describe('custom news comparisons', () => {
  it('keeps zero volume, zero scoring coverage and unknown scores distinct', () => {
    const { timeline } = compareHeadlineSearches(
      headlines,
      DEFAULT_NEWS_COMPARISONS,
      'hour',
    )
    const unscored = timeline[0].groups['search-1']
    const absent = timeline[2].groups['search-1']
    expect(headlineMeasure(unscored, 'volume')).toBe(1)
    expect(headlineMeasure(unscored, 'coverage')).toBe(0)
    expect(headlineMeasure(unscored, 'score')).toBeNull()
    expect(headlineMeasure(absent, 'volume')).toBe(0)
    expect(headlineMeasure(absent, 'coverage')).toBeNull()
    expect(headlineMeasure(absent, 'score')).toBeNull()
  })

  it('calculates daily coverage from daily counts, not the unweighted mean of hourly percentages', () => {
    const queries = [
      { name: 'Tech', query: 'ticker:NVDA OR ticker:AAPL' },
      { name: 'All', query: '' },
    ]
    const daily = compareHeadlineSearches(headlines, queries, 'day').timeline[0]
      .groups['search-0']
    const hourly = compareHeadlineSearches(headlines, queries, 'hour').timeline
    expect(headlineMeasure(hourly[0].groups['search-0'], 'coverage')).toBe(50)
    expect(headlineMeasure(hourly[1].groups['search-0'], 'coverage')).toBe(100)
    expect(headlineMeasure(daily, 'coverage')).toBeCloseTo(200 / 3)
    expect(headlineMeasure(daily, 'volume')).toBe(3)
    expect(headlineMeasure(daily, 'score')).toBe(7.5)
  })

  it('compares overlapping searches on the same observed UTC buckets without double-counting copies', () => {
    const { timeline, errors } = compareHeadlineSearches(
      headlines,
      [
        { name: 'Tech companies', query: '(ticker:NVDA OR ticker:AAPL)' },
        { name: 'Apple', query: 'ticker:AAPL' },
        { name: 'All headlines', query: '' },
        { name: 'CNBC', query: 'source:CNBC' },
      ],
      'hour',
    )
    expect(errors.every((error) => !error.name && !error.query)).toBe(true)
    expect(timeline.map((row) => row.date)).toEqual([
      '2026-09-30T10:00:00.000Z',
      '2026-09-30T11:00:00.000Z',
      '2026-09-30T13:00:00.000Z',
    ])
    expect(timeline[0].groups['search-0']).toMatchObject({
      total: 2,
      scored: 1,
      unscored: 1,
      score: 40,
    })
    expect(timeline[0].groups['search-1']).toMatchObject({
      total: 1,
      scored: 0,
      unscored: 1,
      score: null,
    })
    expect(timeline[0].groups['search-3']).toMatchObject({
      total: 1,
      scored: 1,
      score: 40,
    })
    expect(timeline[1].groups['search-0'].score).toBe(-25)
    expect(timeline[2].groups['search-0']).toMatchObject({
      total: 0,
      scored: 0,
      score: null,
    })
    expect(timeline[2].groups['search-2']).toMatchObject({
      total: 1,
      scored: 1,
      score: -50,
    })
    expect(timeline[2].time - timeline[1].time).toBe(7200000)
  })

  it('excludes undated titles and averages the scored sample correctly in daily buckets', () => {
    const { timeline } = compareHeadlineSearches(
      headlines,
      DEFAULT_NEWS_COMPARISONS,
      'day',
    )
    expect(timeline).toHaveLength(1)
    expect(timeline[0].groups['search-0']).toMatchObject({
      total: 1,
      scored: 1,
      score: 40,
    })
    expect(timeline[0].groups['search-1']).toMatchObject({
      total: 2,
      scored: 1,
      score: -25,
    })
    expect(
      compareHeadlineSearches([], DEFAULT_NEWS_COMPARISONS).timeline,
    ).toEqual([])
  })

  it('uses literal query matching for exclusions, phrases and common filtered samples', () => {
    const filtered = headlines.filter((item) => item.title.includes('Apple'))
    const { timeline } = compareHeadlineSearches(filtered, [
      { name: 'Meetings', query: '"schedules meeting"' },
      { name: 'No meetings', query: '-title:meeting' },
    ])
    expect(timeline[0].groups['search-0']).toMatchObject({
      total: 1,
      score: null,
    })
    expect(timeline[0].groups['search-1']).toMatchObject({
      total: 1,
      score: -25,
    })
  })

  it('reports invalid queries and ambiguous names without plotting partial comparisons', () => {
    const badQuery = compareHeadlineSearches(headlines, [
      { name: 'Nvidia', query: 'ticker:' },
      DEFAULT_NEWS_COMPARISONS[1],
    ])
    expect(badQuery.errors[0].query).toContain('after ticker:')
    expect(badQuery.timeline).toEqual([])
    const badNames = compareHeadlineSearches(headlines, [
      { name: 'Apple', query: '' },
      { name: ' apple ', query: 'ticker:AAPL' },
    ])
    expect(badNames.errors[1].name).toContain('different name')
    expect(badNames.timeline).toEqual([])
    expect(
      compareHeadlineSearches(headlines, [
        { name: '', query: '' },
        DEFAULT_NEWS_COMPARISONS[1],
      ]).errors[0].name,
    ).toContain('Give this search')
  })

  it('treats user names as labels and never as object keys', () => {
    const result = compareHeadlineSearches(headlines, [
      { name: '__proto__', query: '' },
      { name: 'constructor', query: 'ticker:AAPL' },
    ])
    expect(Object.keys(result.timeline[0].groups)).toEqual([
      'search-0',
      'search-1',
    ])
    expect(result.timeline[0].groups['search-0'].total).toBe(4)
  })

  it('validates bounded shared settings while retaining editable syntax errors', () => {
    expect(
      parseNewsComparisons(JSON.stringify(DEFAULT_NEWS_COMPARISONS)),
    ).toEqual(DEFAULT_NEWS_COMPARISONS)
    expect(
      parseNewsComparisons(
        JSON.stringify([
          { name: '', query: 'earnings OR' },
          DEFAULT_NEWS_COMPARISONS[1],
        ]),
      ),
    ).not.toBeNull()
    for (const value of [
      null,
      true,
      {},
      [],
      [DEFAULT_NEWS_COMPARISONS[0]],
      Array(5).fill(DEFAULT_NEWS_COMPARISONS[0]),
      [{ name: 'x'.repeat(33), query: '' }, DEFAULT_NEWS_COMPARISONS[1]],
      [{ name: 'Nvidia', query: 'x'.repeat(401) }, DEFAULT_NEWS_COMPARISONS[1]],
      [{ name: 3, query: '' }, DEFAULT_NEWS_COMPARISONS[1]],
      [null, DEFAULT_NEWS_COMPARISONS[1]],
    ])
      expect(parseNewsComparisons(JSON.stringify(value))).toBeNull()
    expect(parseNewsComparisons('{broken')).toBeNull()
    expect(parseNewsComparisons(' '.repeat(12001))).toBeNull()
  })
})
