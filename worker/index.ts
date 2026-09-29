import type { History, PricePoint } from '../src/lib/types'

type Env = {
  ASSETS: Fetcher
  API_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }
}
type Quote = { close?: (number | null)[]; volume?: (number | null)[] }
type YahooChart = {
  chart?: {
    error?: { description?: string }
    result?: {
      meta: Record<string, unknown>
      timestamp?: number[]
      indicators?: {
        quote?: Quote[]
        adjclose?: { adjclose?: (number | null)[] }[]
      }
    }[]
  }
}
const SYMBOL = /^[A-Z0-9^][A-Z0-9.^=\-]{0,19}$/
const SOURCE = 'Yahoo Finance'
const CACHE_VERSION = 'v3'

function json(
  value: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  })
}
export function parseSymbols(input: string | null): string[] {
  const symbols = [
    ...new Set((input ?? '').toUpperCase().split(',').filter(Boolean)),
  ]
  if (
    !symbols.length ||
    symbols.length > 12 ||
    symbols.some((s) => !SYMBOL.test(s))
  )
    throw new Error('Provide between 1 and 12 valid ticker symbols.')
  return symbols
}

export function normalizeChart(payload: YahooChart, symbol: string): History {
  const result = payload.chart?.result?.[0]
  if (!result || !result.timestamp?.length)
    throw new Error('No price history is available for this symbol.')
  const quote = result.indicators?.quote?.[0],
    adj = result.indicators?.adjclose?.[0]?.adjclose
  const valid = result.timestamp
    .map((time, i) => ({ time, i }))
    .filter(
      ({ i, time }) =>
        typeof quote?.close?.[i] === 'number' &&
        Number.isFinite(quote.close[i]) &&
        Number(quote.close[i]) > 0 &&
        Number.isFinite(new Date(time * 1000).getTime()),
    )
  const adjusted =
    !!adj &&
    valid.every(
      ({ i }) =>
        typeof adj[i] === 'number' &&
        Number.isFinite(adj[i]) &&
        Number(adj[i]) > 0,
    )
  const points: PricePoint[] = valid.map(({ time, i }) => ({
    date: new Date(time * 1000).toISOString().slice(0, 10),
    close: Number(quote!.close![i]),
    adjusted: adjusted ? Number(adj![i]) : Number(quote!.close![i]),
    volume:
      typeof quote?.volume?.[i] === 'number' &&
      Number.isFinite(quote.volume[i]) &&
      Number(quote.volume[i]) >= 0
        ? Number(quote.volume[i])
        : null,
  }))
  const unique = [...new Map(points.map((p) => [p.date, p])).values()].sort(
    (a, b) => a.date.localeCompare(b.date),
  )
  if (unique.length < 2)
    throw new Error('There is not enough history to compare this symbol.')
  const meta = result.meta ?? {}
  const latestPrice = Number(meta.regularMarketPrice)
  const marketTimestamp = Number(meta.regularMarketTime)
  return {
    symbol,
    name: String(meta.longName ?? meta.shortName ?? symbol),
    currency:
      typeof meta.currency === 'string' && meta.currency
        ? meta.currency
        : 'Unknown',
    exchange: String(meta.fullExchangeName ?? meta.exchangeName ?? ''),
    points: unique,
    fetchedAt: new Date().toISOString(),
    marketTime: new Date(
      (marketTimestamp > 0 &&
      Number.isFinite(new Date(marketTimestamp * 1000).getTime())
        ? marketTimestamp
        : Math.max(...valid.map((v) => v.time))) * 1000,
    ).toISOString(),
    price:
      Number.isFinite(latestPrice) && latestPrice > 0
        ? latestPrice
        : unique.at(-1)!.close,
    source: SOURCE,
    adjusted,
    ...(!adjusted
      ? {
          warning:
            'Adjusted prices unavailable; this series uses unadjusted closing prices.',
        }
      : {}),
  }
}

async function history(
  symbol: string,
  request: Request,
  ctx: ExecutionContext,
): Promise<History> {
  const cache = (caches as CacheStorage & { default: Cache }).default
  const cacheKey = new Request(
    `${new URL(request.url).origin}/__market-cache/${CACHE_VERSION}/${encodeURIComponent(symbol)}`,
  )
  const cached = await cache.match(cacheKey)
  const prior = cached ? await cached.json<History>() : null
  if (prior && Date.now() - Date.parse(prior.fetchedAt) < 15 * 60 * 1000)
    return prior
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&events=div%2Csplits&includeAdjustedClose=true`
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'MarketAtlas/1.0' },
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? 'Market-data provider is rate limiting requests. Please try again later.'
          : 'The market-data provider is temporarily unavailable.',
      )
    const data = normalizeChart((await response.json()) as YahooChart, symbol)
    ctx.waitUntil(
      cache.put(
        cacheKey,
        json(data, 200, { 'Cache-Control': 'public, max-age=604800' }),
      ),
    )
    return data
  } catch (error) {
    if (prior)
      return {
        ...prior,
        stale: true,
        warning:
          'Refresh failed. Showing the last cached history; check its data date.',
      }
    throw error
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (request.method !== 'GET')
      return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' })
    if (url.pathname === '/api/health')
      return json({
        status: 'ok',
        service: 'market-atlas',
        source: SOURCE,
        cacheMinutes: 15,
        timestamp: new Date().toISOString(),
      })
    if (env.API_LIMITER) {
      const { success } = await env.API_LIMITER.limit({
        key: request.headers.get('CF-Connecting-IP') ?? 'local',
      })
      if (!success)
        return json(
          { error: 'Too many requests. Please wait a minute.' },
          429,
          { 'Retry-After': '60' },
        )
    }
    if (url.pathname === '/api/history') {
      let symbols: string[]
      try {
        symbols = parseSymbols(url.searchParams.get('symbols'))
      } catch (error) {
        return json({ error: (error as Error).message }, 400)
      }
      const data: History[] = [],
        errors: { symbol: string; message: string }[] = []
      // Bound upstream concurrency and isolate individual symbol failures.
      for (let i = 0; i < symbols.length; i += 4) {
        await Promise.all(
          symbols.slice(i, i + 4).map(async (symbol) => {
            try {
              data.push(await history(symbol, request, ctx))
            } catch (error) {
              errors.push({
                symbol,
                message:
                  error instanceof Error
                    ? error.message
                    : 'Could not load price history.',
              })
            }
          }),
        )
      }
      return json({ data, errors }, 200, {
        'Cache-Control':
          errors.length || data.some((d) => d.stale)
            ? 'no-store'
            : 'public, max-age=60',
      })
    }
    if (url.pathname === '/api/search') {
      const q = (url.searchParams.get('q') ?? '').trim()
      if (q.length < 1 || q.length > 60)
        return json({ error: 'Search must contain 1 to 60 characters.' }, 400)
      try {
        const response = await fetch(
          `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`,
          {
            headers: { 'User-Agent': 'MarketAtlas/1.0' },
            signal: AbortSignal.timeout(8000),
          },
        )
        if (!response.ok)
          throw new Error('Search is unavailable. Enter a ticker directly.')
        const result = (await response.json()) as {
          quotes?: Record<string, unknown>[]
        }
        const matches = (result.quotes ?? [])
          .filter(
            (r) =>
              SYMBOL.test(String(r.symbol)) &&
              [
                'EQUITY',
                'ETF',
                'INDEX',
                'MUTUALFUND',
                'FUTURE',
                'CURRENCY',
                'CRYPTOCURRENCY',
              ].includes(String(r.quoteType)),
          )
          .map((r) => ({
            symbol: r.symbol,
            name: r.shortname ?? r.longname ?? r.symbol,
            exchange: r.exchDisp ?? r.exchange,
            kind: r.quoteType,
          }))
        return json({ matches }, 200, {
          'Cache-Control': 'public, max-age=3600',
        })
      } catch {
        return json(
          {
            matches: [],
            error: 'Search is unavailable. Enter a ticker directly.',
          },
          503,
        )
      }
    }
    return json({ error: 'API route not found.' }, 404)
  },
} satisfies ExportedHandler<Env>
