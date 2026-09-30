import { STOCKS } from './catalog'

export type CompanyMention = {
  symbol: string
  text: string
  kind: 'cashtag' | 'exchange ticker' | 'ticker context' | 'company name'
}

export const normalizeNewsSymbol = (symbol: string) => {
  const value = symbol.trim().toUpperCase()
  return /^BRK\.[AB]$/.test(value) ? value.replace('.', '-') : value
}

export function parseNewsCompanies(value: string): string[] | null {
  if (!value) return []
  const symbols = value.split(',').map(normalizeNewsSymbol)
  if (
    symbols.length > 100 ||
    symbols.some((symbol) => !/^[A-Z0-9^][A-Z0-9.^=\-]{0,19}$/.test(symbol))
  )
    return null
  return [...new Set(symbols)]
}

function companyPattern(name: string) {
  const escaped = name
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[’']/g, "['’]?")
    .replace(/[-\s]+/g, '[\\s-]+')
    .replace(/&/g, '(?:&|and)')
  return new RegExp(`\\b${escaped}\\b`, 'i')
}

const overrides = new Map<string, RegExp>([
  ['AMD', /\b(?:Advanced Micro Devices|AMD)\b/],
  ['GOOGL', /\b(?:Alphabet|Google)\b/i],
  ['META', /\bMeta(?: Platforms)?\b/i],
  ['DIS', /\b(?:Walt )?Disney\b/i],
  ['JPM', /\bJP\s?Morgan(?: Chase)?\b/i],
  ['XOM', /\bExxon(?:\s?Mobil)?\b/i],
  ['UNH', /\bUnitedHealth(?: Group)?\b/i],
  ['GE', /\bGE(?: Aerospace)?\b/],
  [
    'RTX',
    /\bRTX(?=\s+(?:Corporation|Corp|shares?|stock|earnings|revenue|profit|defense|dividend))\b/i,
  ],
])
const aliases: [string, RegExp][] = [
  ...STOCKS.map((stock): [string, RegExp] => [
    stock.symbol,
    overrides.get(stock.symbol) ?? companyPattern(stock.name),
  ]),
  ['BA', /\bBoeing\b/i],
  ['COIN', /\bCoinbase\b/i],
]
const tickerContexts: [string, RegExp][] = aliases.map(
  ([symbol]): [string, RegExp] => [
    symbol,
    new RegExp(
      `\\b${symbol.replace('-', '[.-]')}(?=\\s+(?:shares?|stock|earnings|revenue|dividends?)\\b)`,
    ),
  ],
)

export function headlineCompanyMentions(title: string): CompanyMention[] {
  const mentions = new Map<string, CompanyMention>()
  const add = (symbol: string, text: string, kind: CompanyMention['kind']) => {
    const normalized = normalizeNewsSymbol(symbol)
    if (!mentions.has(normalized))
      mentions.set(normalized, { symbol: normalized, text, kind })
  }
  const ticker = '([A-Z][A-Z0-9]{0,9}(?:[.-][A-Z0-9]{1,4})?)(?![A-Za-z0-9.-])'
  for (const match of title.matchAll(new RegExp(`\\$${ticker}`, 'g')))
    add(match[1], match[0], 'cashtag')
  for (const match of title.matchAll(
    new RegExp(`\\b(?:NASDAQ|Nasdaq|NYSE|NYSEARCA|AMEX):\\s*${ticker}`, 'g'),
  ))
    add(match[1], match[0], 'exchange ticker')
  for (const [symbol, pattern] of tickerContexts) {
    const match = title.match(pattern)
    if (match) add(symbol, match[0], 'ticker context')
  }
  for (const [symbol, pattern] of aliases) {
    // The payment network's short name is also a common immigration word.
    if (
      symbol === 'V' &&
      (/\b(?:immigration|tourist|student visa|work visa|h[- ]?1b|visa applications?|visas)\b/i.test(
        title,
      ) ||
        !/\b(?:payments?|cards?|debit|credit|shares?|stock|earnings|revenue|profit|dividend|buyback|CEO|Inc|fintech|annual report)\b/i.test(
          title,
        ))
    )
      continue
    const match = title.match(pattern)
    if (match) add(symbol, match[0], 'company name')
  }
  return [...mentions.values()]
}

function researchParams(view: 'news' | 'stocks', search: string) {
  const current = new URLSearchParams(search)
  const query = new URLSearchParams({ view })
  for (const key of ['period', 'benchmark', 'symbols', 'start', 'end']) {
    const value = current.get(key)
    if (value !== null) query.set(key, value)
  }
  return query
}

export function companyNewsHref(symbols: string[], search = '') {
  const query = researchParams('news', search)
  query.set('newsTab', 'headlines')
  const companies = parseNewsCompanies(symbols.join(','))
  if (companies?.length) query.set('newsCompanies', companies.join(','))
  return `?${query}`
}

export function stockResearchHref(symbol: string, search = '') {
  const query = researchParams('stocks', search)
  query.set('stock', normalizeNewsSymbol(symbol))
  return `?${query}`
}
