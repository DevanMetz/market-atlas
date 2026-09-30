import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  analyzeHeadlines,
  FEED_SOURCES,
  headlineTimeline,
  NEWS_SOURCES,
  scoreHeadline,
  summarizeHeadlines,
} from './news'
import type { NewsFeed, NewsItem } from './news'
import {
  newsResponse,
  parseNewsFeed,
  parseNewsSources,
  safeNewsUrl,
} from '../../worker/news'

const now = Date.parse('2026-09-29T20:00:00Z')
const item = (
  title: string,
  url = 'https://example.org/story',
  sourceId = 'bbc',
  publishedAt: string | null = '2026-09-29T10:00:00Z',
): NewsItem => ({ title, url, sourceId, publishedAt })
const feed = (items: NewsItem[], sourceId = 'bbc'): NewsFeed => ({
  sourceId,
  items,
  fetchedAt: '2026-09-29T20:00:00Z',
})

describe('headline sentiment', () => {
  it('keeps no-signal titles unknown instead of treating them as neutral', () => {
    expect(scoreHeadline('The company schedules its annual meeting')).toEqual({
      score: null,
      tone: 'unscored',
      matches: [],
    })
  })
  it('gives longer phrases precedence over conflicting single words', () => {
    expect(scoreHeadline('Company issues profit warning')).toMatchObject({
      tone: 'negative',
      score: -50,
      matches: [{ term: 'profit warning', weight: -3, negated: false }],
    })
    expect(scoreHeadline('Shares hit record high')).toMatchObject({
      tone: 'positive',
      score: 50,
    })
  })
  it('marks opposing cues as mixed even when the score is zero', () => {
    expect(scoreHeadline('Stocks rise while earnings fall')).toMatchObject({
      tone: 'mixed',
      score: 0,
    })
  })
  it('applies nearby negation but stops at contrasting clauses', () => {
    expect(scoreHeadline('Stocks do not rally')).toMatchObject({
      tone: 'negative',
      matches: [{ term: 'rally', weight: -2, negated: true }],
    })
    expect(scoreHeadline('No default but shares rally')).toMatchObject({
      tone: 'positive',
    })
    expect(scoreHeadline('Stocks not only rally')).toMatchObject({
      tone: 'positive',
    })
  })
  it('does not count parts of words or infer a rate decision is universally positive', () => {
    expect(
      scoreHeadline('The corporation hosts its quarterly meeting').tone,
    ).toBe('unscored')
    expect(scoreHeadline('Central bank announces a rate cut').score).toBeNull()
  })
  it('bounds repeated signals without representing a probability', () => {
    const score = scoreHeadline('rally '.repeat(100)).score!
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})

describe('headline samples', () => {
  it('groups exact titles within the same UTC date while retaining publisher links', () => {
    const items = analyzeHeadlines([
      feed([
        item('Nvidia shares rally'),
        item('NVIDIA shares rally!', 'https://other.example/story', 'cnbc'),
        item(
          'Nvidia shares rally',
          'https://example.org/next-day',
          'bbc',
          '2026-09-28T10:00:00Z',
        ),
      ]),
    ])
    expect(items).toHaveLength(2)
    expect(items[0].copies).toHaveLength(2)
    expect(items[0].tickers).toContain('NVDA')
    expect(items[0].topics).toContain('Technology')
  })
  it('avoids duplicate copies from an identical feed entry', () => {
    const items = analyzeHeadlines([
      feed([item('Stocks rally'), item('Stocks rally')]),
    ])
    expect(items[0].copies).toHaveLength(1)
  })
  it('averages scored titles only and leaves empty groups unknown', () => {
    const rows = analyzeHeadlines([
      feed([
        item('Stocks rally'),
        item('Board schedules meeting', 'https://example.org/meeting'),
      ]),
    ])
    expect(summarizeHeadlines(rows)).toMatchObject({
      total: 2,
      scored: 1,
      score: 40,
      unscored: 1,
    })
    expect(summarizeHeadlines([]).score).toBeNull()
  })
  it('excludes undated items from the timeline and never fills absent days', () => {
    const rows = analyzeHeadlines([
      feed([
        item('Stocks rally'),
        item(
          'Stocks fall',
          'https://example.org/fall',
          'bbc',
          '2026-09-27T18:00:00Z',
        ),
        item('Stocks plunge', 'https://example.org/undated', 'bbc', null),
      ]),
    ])
    expect(headlineTimeline(rows).map((row) => row.date)).toEqual([
      '2026-09-27',
      '2026-09-29',
    ])
  })
  it('recognizes explicit ticker notation without turning ordinary short words into tickers', () => {
    const [row] = analyzeHeadlines([feed([item('A look at $IBM and $MSFT')])])
    expect(row.tickers).toEqual(['IBM', 'MSFT'])
  })
})

describe('publisher feed parsing and boundaries', () => {
  it('reads RSS title, safe link, date and publisher without retaining article bodies', () => {
    const xml =
      '<rss><channel><item><title><![CDATA[Stocks &amp; bonds <b>rally</b>]]></title><link>https://example.org/story?utm_source=feed&amp;x=1</link><pubDate>Tue, 29 Sep 2026 15:00:00 GMT</pubDate><description>Article body must not be retained</description></item></channel></rss>'
    const rows = parseNewsFeed(xml, 'bbc', now)
    expect(rows).toEqual([
      {
        title: 'Stocks & bonds rally',
        url: 'https://example.org/story?x=1',
        sourceId: 'bbc',
        publishedAt: '2026-09-29T15:00:00.000Z',
      },
    ])
  })
  it('reads Atom alternate links rather than self links', () => {
    const xml =
      '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Markets &#x26; policy</title><link rel="self" href="https://example.org/api"/><link rel="alternate" href="https://example.org/article"/><published>2026-09-29T12:00:00Z</published></entry></feed>'
    expect(parseNewsFeed(xml, 'bbc', now)[0]).toMatchObject({
      title: 'Markets & policy',
      url: 'https://example.org/article',
    })
  })
  it('keeps invalid and future publication times unknown', () => {
    const xml =
      '<rss><item><title>One</title><link>https://example.org/one</link><pubDate>tomorrow-ish</pubDate></item><item><title>Two</title><link>https://example.org/two</link><pubDate>2099-01-01</pubDate></item></rss>'
    expect(
      parseNewsFeed(xml, 'bbc', now).map((row) => row.publishedAt),
    ).toEqual([null, null])
  })
  it('rejects unsafe links, credentials, entity declarations and HTML responses', () => {
    expect(safeNewsUrl('javascript:alert(1)', 'https://example.org')).toBeNull()
    expect(
      safeNewsUrl('https://user:secret@example.org', 'https://example.org'),
    ).toBeNull()
    expect(() =>
      parseNewsFeed(
        '<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss/>',
        'bbc',
      ),
    ).toThrow()
    expect(() => parseNewsFeed('<html>Access denied</html>', 'bbc')).toThrow()
    expect(
      parseNewsFeed(
        '<rss><item><title>Unsafe</title><link>javascript:alert(1)</link></item></rss>',
        'bbc',
      ),
    ).toEqual([])
  })
  it('caps entries, drops duplicate URLs and rejects oversized feeds', () => {
    const entries = Array.from(
      { length: 100 },
      (_, i) =>
        `<item><title>Headline ${i}</title><link>https://example.org/${i}</link></item>`,
    ).join('')
    expect(parseNewsFeed(`<rss>${entries}</rss>`, 'bbc')).toHaveLength(80)
    expect(
      parseNewsFeed(
        '<rss><item><title>One</title><link>https://example.org/same</link></item><item><title>Two</title><link>https://example.org/same</link></item></rss>',
        'bbc',
      ),
    ).toHaveLength(1)
    expect(() =>
      parseNewsFeed('<rss>' + ' '.repeat(2 * 1024 * 1024) + '</rss>', 'bbc'),
    ).toThrow()
  })
  it('only accepts bounded, allowlisted feed identifiers', () => {
    expect(parseNewsSources('bbc,cnbc,bbc')).toEqual(['bbc', 'cnbc'])
    for (const value of [
      null,
      '',
      'https://example.org',
      '127.0.0.1',
      'economic-times',
      FEED_SOURCES.slice(0, 7)
        .map((s) => s.id)
        .join(','),
    ])
      expect(() => parseNewsSources(value)).toThrow()
  })
  it('has unique directory IDs, valid publisher links and a substantial working feed catalog', () => {
    expect(new Set(NEWS_SOURCES.map((s) => s.id)).size).toBe(
      NEWS_SOURCES.length,
    )
    expect(NEWS_SOURCES.length).toBeGreaterThanOrEqual(100)
    expect(FEED_SOURCES.length).toBeGreaterThanOrEqual(40)
    expect(
      NEWS_SOURCES.every((s) => new URL(s.url).protocol === 'https:'),
    ).toBe(true)
    expect(
      FEED_SOURCES.every((s) => s.feed?.startsWith('https:') && s.checkedAt),
    ).toBe(true)
  })
})

describe('news request pipeline', () => {
  afterEach(() => vi.unstubAllGlobals())
  const context = () => ({ waitUntil: vi.fn() }) as unknown as ExecutionContext
  const request = () =>
    new Request('https://market.example/api/news?sources=bbc')
  it('retrieves and caches feed entries using the Worker-supported redirect mode', async () => {
    const put = vi.fn(async () => undefined)
    vi.stubGlobal('caches', { default: { match: async () => undefined, put } })
    const upstream = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.redirect === 'error')
        throw new TypeError(
          'Invalid redirect value, must be one of follow or manual',
        )
      return new Response(
        '<rss><item><title>Stocks rally</title><link>https://example.org/story</link></item></rss>',
      )
    })
    vi.stubGlobal('fetch', upstream)
    const response = await newsResponse(['bbc'], request(), context())
    expect(response.errors).toEqual([])
    expect(response.feeds[0].items[0].title).toBe('Stocks rally')
    expect(put).toHaveBeenCalledOnce()
  })
  it('rejects publisher redirects without following their destination', async () => {
    vi.stubGlobal('caches', { default: { match: async () => undefined } })
    const upstream = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.redirect).toBe('manual')
      return new Response(null, {
        status: 301,
        headers: { Location: 'https://unapproved.example/' },
      })
    })
    vi.stubGlobal('fetch', upstream)
    const response = await newsResponse(['bbc'], request(), context())
    expect(response.feeds).toEqual([])
    expect(response.errors[0].message).toContain('HTTP 301')
    expect(upstream).toHaveBeenCalledOnce()
  })
  it('returns an explicitly stale cached sample if a publisher fails', async () => {
    const prior = {
      ...feed([item('Stocks rally')]),
      fetchedAt: new Date(Date.now() - 3600000).toISOString(),
    }
    vi.stubGlobal('caches', {
      default: { match: async () => Response.json(prior) },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    )
    const response = await newsResponse(['bbc'], request(), context())
    expect(response.feeds[0]).toMatchObject({
      stale: true,
      fetchedAt: prior.fetchedAt,
      items: prior.items,
    })
  })
})
