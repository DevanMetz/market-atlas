import { FEED_SOURCES, NEWS_SOURCE_MAP } from '../src/lib/news'
import type { NewsFeed, NewsItem, NewsResponse } from '../src/lib/news'

const MAX_BYTES = 2 * 1024 * 1024
export function parseNewsSources(input: string | null): string[] {
  const ids = [...new Set((input ?? '').split(',').filter(Boolean))]
  if (
    !ids.length ||
    ids.length > 6 ||
    ids.some((id) => !FEED_SOURCES.some((s) => s.id === id))
  ) {
    throw new Error('Choose 1 to 6 supported news feeds per request.')
  }
  return ids
}
function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
  }
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, entity: string) => {
      if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? whole
      const point =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10)
      return point > 0 &&
        point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : ''
    },
  )
}
const unwrap = (value: string) =>
  value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
const tag = (block: string, name: string) =>
  new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`, 'i').exec(
    block,
  )?.[1] ?? ''
export function safeNewsUrl(value: string, base: string): string | null {
  try {
    const url = new URL(decodeEntities(unwrap(value).trim()), base)
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.href.length > 2048
    )
      return null
    url.hash = ''
    for (const key of [...url.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key))
        url.searchParams.delete(key)
    return url.href
  } catch {
    return null
  }
}
export function parseNewsFeed(
  xml: string,
  sourceId: string,
  now = Date.now(),
): NewsItem[] {
  const source = NEWS_SOURCE_MAP.get(sourceId)
  if (
    !source?.feed ||
    xml.length > MAX_BYTES ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    !/<(?:rss|feed|rdf:RDF)\b/i.test(xml)
  )
    throw new Error('The publisher did not return a supported news feed.')
  const items: NewsItem[] = []
  const seen = new Set<string>()
  for (const match of xml.matchAll(
    /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi,
  )) {
    const block = match[2]
    const title = decodeEntities(unwrap(tag(block, 'title')))
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 350)
    let rawLink = tag(block, 'link')
    if (!rawLink) {
      const links = [...block.matchAll(/<link\b([^>]*?)\/?\s*>/gi)]
      const alternate = links.find(
        (m) =>
          !/\brel\s*=/.test(m[1]) ||
          /\brel\s*=\s*["']alternate["']/i.test(m[1]),
      )
      rawLink =
        alternate?.[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? ''
    }
    const url = rawLink ? safeNewsUrl(rawLink, source.feed) : null
    if (!title || !url || seen.has(url)) continue
    const timestamp = Date.parse(
      decodeEntities(
        unwrap(
          tag(block, 'pubDate') ||
            tag(block, 'published') ||
            tag(block, 'updated') ||
            tag(block, 'dc:date'),
        ),
      ).trim(),
    )
    // Missing or implausibly future publication dates remain unknown.
    const publishedAt =
      Number.isFinite(timestamp) &&
      timestamp >= 0 &&
      timestamp <= now + 15 * 60000
        ? new Date(timestamp).toISOString()
        : null
    items.push({ title, url, sourceId, publishedAt })
    seen.add(url)
    if (items.length >= 80) break
  }
  return items.sort((a, b) =>
    (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  )
}
async function readBounded(response: Response) {
  if (Number(response.headers.get('Content-Length')) > MAX_BYTES)
    throw new Error('Publisher feed exceeds the size limit.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Publisher returned an empty response.')
  const decoder = new TextDecoder()
  let bytes = 0,
    text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BYTES)
        throw new Error('Publisher feed exceeds the size limit.')
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
async function readFeed(
  sourceId: string,
  request: Request,
  ctx: ExecutionContext,
): Promise<NewsFeed> {
  const source = NEWS_SOURCE_MAP.get(sourceId)!
  const cache = (caches as CacheStorage & { default: Cache }).default
  const key = new Request(
    `${new URL(request.url).origin}/__news-cache/v1/${sourceId}`,
  )
  const cached = await cache.match(key)
  const prior = cached ? await cached.json<NewsFeed>() : null
  if (prior && Date.now() - Date.parse(prior.fetchedAt) < 15 * 60000)
    return prior
  try {
    const response = await fetch(source.feed!, {
      redirect: 'error',
      signal: AbortSignal.timeout(9000),
      headers: {
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml',
        'User-Agent':
          'MarketAtlas/1.5 (+https://github.com/DevanMetz/market-atlas)',
      },
    })
    if (!response.ok)
      throw new Error(`Publisher feed unavailable (HTTP ${response.status}).`)
    const data: NewsFeed = {
      sourceId,
      fetchedAt: new Date().toISOString(),
      items: parseNewsFeed(await readBounded(response), sourceId),
    }
    ctx.waitUntil(
      cache.put(
        key,
        Response.json(data, {
          headers: { 'Cache-Control': 'public, max-age=86400' },
        }),
      ),
    )
    return data
  } catch (error) {
    if (prior && Date.now() - Date.parse(prior.fetchedAt) <= 86400000)
      return {
        ...prior,
        stale: true,
        warning: 'Refresh failed; showing a previously retrieved feed.',
      }
    throw new Error(
      error instanceof Error && error.message.startsWith('Publisher')
        ? error.message
        : 'This publisher feed is temporarily unavailable.',
    )
  }
}
export async function newsResponse(
  ids: string[],
  request: Request,
  ctx: ExecutionContext,
): Promise<NewsResponse> {
  const feeds: NewsFeed[] = [],
    errors: NewsResponse['errors'] = []
  for (let i = 0; i < ids.length; i += 2) {
    await Promise.all(
      ids.slice(i, i + 2).map(async (sourceId) => {
        try {
          feeds.push(await readFeed(sourceId, request, ctx))
        } catch (error) {
          errors.push({
            sourceId,
            message:
              error instanceof Error ? error.message : 'Feed unavailable.',
          })
        }
      }),
    )
  }
  return { feeds, errors }
}
