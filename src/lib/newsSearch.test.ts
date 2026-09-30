import { describe, expect, it } from 'vitest'
import { analyzeHeadlines } from './news'
import {
  compileHeadlineSearch,
  headlineSearchDocument,
  NEWS_QUERY_LIMIT,
} from './newsSearch'

const title = 'Nvidia shares rally as earnings beat estimates'
const document = headlineSearchDocument(
  analyzeHeadlines([
    {
      sourceId: 'bbc',
      fetchedAt: '2026-09-30T01:00:00Z',
      items: [
        {
          title,
          sourceId: 'bbc',
          url: 'https://example.org/story',
          publishedAt: '2026-09-30T00:00:00Z',
        },
        {
          title,
          sourceId: 'cnbc',
          url: 'https://example.org/copy',
          publishedAt: '2026-09-30T00:00:00Z',
        },
      ],
    },
  ])[0],
)
const matches = (query: string) => {
  const search = compileHeadlineSearch(query)
  expect(search.error).toBeNull()
  return search.matches(document)
}

describe('headline search', () => {
  it('keeps ordinary case-insensitive searches and requires all terms across fields', () => {
    expect(matches('')).toBe(true)
    expect(matches('  ')).toBe(true)
    expect(matches('NVIDIA earnings')).toBe(true)
    expect(matches('nvda technology CNBC')).toBe(true)
    expect(matches('$NVDA')).toBe(true)
    expect(matches('Nvidia oil')).toBe(false)
  })

  it('matches contiguous quoted phrases without crossing field or publisher boundaries', () => {
    expect(matches('"earnings beat estimates"')).toBe(true)
    expect(matches('“earnings   beat estimates”')).toBe(true)
    expect(matches('"earnings estimates"')).toBe(false)
    expect(matches('"estimates bbc"')).toBe(false)
    expect(matches('source:"business cnbc"')).toBe(false)
    expect(matches('source:"BBC News"')).toBe(true)
  })

  it('applies exclusions and AND before OR and supports grouped alternatives', () => {
    expect(matches('oil OR Nvidia earnings')).toBe(true)
    expect(matches('Nvidia OR oil losses')).toBe(true)
    expect(matches('(Nvidia OR oil) losses')).toBe(false)
    expect(matches('(Nvidia OR oil) earnings -losses')).toBe(true)
    expect(matches('Nvidia AND earnings NOT losses')).toBe(true)
    expect(matches('Nvidia -earnings')).toBe(false)
    expect(matches('NOT (oil OR earnings)')).toBe(false)
    expect(matches('-"profit warning"')).toBe(true)
    expect(matches('Nvidia or earnings')).toBe(false)
  })

  it('restricts fields and finds any publisher in a grouped headline', () => {
    expect(matches('source:CNBC')).toBe(true)
    expect(matches('source:BBC')).toBe(true)
    expect(matches('source:CNBC -source:BBC')).toBe(false)
    expect(matches('title:CNBC')).toBe(false)
    expect(matches('topic:Technology')).toBe(true)
    expect(matches('title:Technology')).toBe(false)
    expect(matches('TITLE:earnings source: cnbc')).toBe(true)
    expect(matches('source:Reuters')).toBe(false)
    expect(matches('ticker:NVDA')).toBe(true)
    expect(matches('ticker:$nvda')).toBe(true)
    expect(matches('ticker:NV')).toBe(false)
    expect(matches('ticker:Nvidia')).toBe(false)
  })

  it('normalizes ticker share classes and keeps quoted operators literal', () => {
    const data = {
      ...document,
      ticker: ['BRK-B'],
      title: [
        'and or not',
        'a "quoted" word',
        "company's plan",
        's&p 500',
        'c++',
      ],
    }
    for (const query of [
      'ticker:brk.b',
      'title:"OR"',
      'title:"a \\"quoted\\" word"',
      'title:"company’s plan"',
      'title:"S&P 500"',
      'title:C++',
    ]) {
      const search = compileHeadlineSearch(query)
      expect(search.error).toBeNull()
      expect(search.matches(data), query).toBe(true)
    }
    expect(compileHeadlineSearch('title:.*').matches(data)).toBe(false)
  })

  it.each([
    '"unfinished',
    '""',
    '()',
    '(earnings OR oil',
    'earnings)',
    'earnings OR',
    'AND earnings',
    'earnings AND OR oil',
    '-',
    'NOT',
    'title:',
    'title:()',
    'publisher:BBC',
    '"earnings"growth',
    'OR',
    'earnings OR OR oil',
    'x'.repeat(NEWS_QUERY_LIMIT + 1),
    'a '.repeat(81),
    '('.repeat(18) + 'oil' + ')'.repeat(18),
  ])('reports invalid query %s without widening the result set', (query) => {
    const search = compileHeadlineSearch(query)
    expect(search.error).toBeTruthy()
    expect(search.matches(document)).toBe(false)
  })
})
