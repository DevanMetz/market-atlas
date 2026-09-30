import { headlineCompanyMentions } from './newsCompanies'
import type { CompanyMention } from './newsCompanies'

export type NewsItem = {
  title: string
  url: string
  sourceId: string
  publishedAt: string | null
}
export type NewsFeed = {
  sourceId: string
  fetchedAt: string
  items: NewsItem[]
  stale?: boolean
  warning?: string
}
export type NewsResponse = {
  feeds: NewsFeed[]
  errors: { sourceId: string; message: string }[]
}
export type HeadlineTone = 'positive' | 'negative' | 'mixed' | 'unscored'
export type Sentiment = {
  score: number | null
  tone: HeadlineTone
  matches: { term: string; weight: number; negated: boolean }[]
}

// An inspectable English headline lexicon, not a trained model or a forecast.
// Longer phrases take precedence so "profit warning" is not also a positive profit.
const LEXICON: [string, number][] = [
  ['profit warning', -3],
  ['record high', 3],
  ['record highs', 3],
  ['record low', -3],
  ['record lows', -3],
  ['beats estimates', 3],
  ['beat estimates', 3],
  ['misses estimates', -3],
  ['miss estimates', -3],
  ['raises guidance', 3],
  ['cuts guidance', -3],
  ['cuts outlook', -3],
  ['raises outlook', 3],
  ['credit downgrade', -3],
  ['credit upgrade', 3],
  ['all time high', 3],
  ['all time low', -3],
  ['sell off', -3],
  ['rate cut', 0],
  ['rate hike', 0],
  ['rally', 2],
  ['rallies', 2],
  ['rallied', 2],
  ['rallying', 2],
  ['surge', 3],
  ['surges', 3],
  ['surged', 3],
  ['soar', 3],
  ['soars', 3],
  ['soared', 3],
  ['gain', 1],
  ['gains', 1],
  ['gained', 1],
  ['advance', 1],
  ['advances', 1],
  ['rise', 1],
  ['rises', 1],
  ['rose', 1],
  ['jump', 2],
  ['jumps', 2],
  ['jumped', 2],
  ['rebound', 2],
  ['rebounds', 2],
  ['recover', 2],
  ['recovery', 2],
  ['recovers', 2],
  ['growth', 1],
  ['strong', 1],
  ['strength', 1],
  ['bullish', 2],
  ['optimism', 2],
  ['optimistic', 2],
  ['upgrade', 2],
  ['upgrades', 2],
  ['upgraded', 2],
  ['outperform', 2],
  ['outperforms', 2],
  ['outperformed', 2],
  ['profit', 1],
  ['profits', 1],
  ['profitable', 1],
  ['breakthrough', 2],
  ['approval', 1],
  ['approved', 1],
  ['expansion', 1],
  ['resilient', 1],
  ['record', 1],
  ['beat', 1],
  ['beats', 1],
  ['decline', -1],
  ['declines', -1],
  ['declined', -1],
  ['fall', -1],
  ['falls', -1],
  ['fell', -1],
  ['drop', -2],
  ['drops', -2],
  ['dropped', -2],
  ['slip', -1],
  ['slips', -1],
  ['slipped', -1],
  ['slide', -2],
  ['slides', -2],
  ['slid', -2],
  ['plunge', -3],
  ['plunges', -3],
  ['plunged', -3],
  ['slump', -2],
  ['slumps', -2],
  ['crash', -3],
  ['crashes', -3],
  ['selloff', -3],
  ['loss', -2],
  ['losses', -2],
  ['weak', -1],
  ['weakness', -1],
  ['bearish', -2],
  ['downgrade', -2],
  ['downgrades', -2],
  ['downgraded', -2],
  ['underperform', -2],
  ['miss', -1],
  ['misses', -1],
  ['disappoints', -2],
  ['disappointing', -2],
  ['recession', -2],
  ['crisis', -3],
  ['default', -3],
  ['defaults', -3],
  ['bankruptcy', -3],
  ['bankrupt', -3],
  ['fraud', -3],
  ['layoffs', -2],
  ['layoff', -2],
  ['lawsuit', -1],
  ['probe', -1],
  ['uncertainty', -1],
  ['warning', -2],
  ['warns', -1],
  ['risk', -1],
  ['risks', -1],
  ['fear', -1],
  ['fears', -1],
  ['concern', -1],
  ['concerns', -1],
  ['tumbles', -3],
  ['tumble', -3],
]
const PHRASES = [...LEXICON].sort(
  (a, b) => b[0].split(' ').length - a[0].split(' ').length,
)
const PHRASE_INDEX = new Map<string, [string, number][]>()
for (const phrase of PHRASES) {
  const first = phrase[0].split(' ')[0]
  PHRASE_INDEX.set(first, [...(PHRASE_INDEX.get(first) ?? []), phrase])
}
const NEGATORS = new Set([
  'not',
  'no',
  'never',
  'without',
  'fails',
  'failed',
  'fail',
])

export function scoreHeadline(title: string): Sentiment {
  const tokens =
    title
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[’']/g, '')
      .match(/[a-z]+/g) ?? []
  const matches: Sentiment['matches'] = []
  for (let i = 0; i < tokens.length; i++) {
    const found = PHRASE_INDEX.get(tokens[i])?.find(
      ([term]) =>
        tokens.slice(i, i + term.split(' ').length).join(' ') === term,
    )
    if (!found) continue
    const [term, baseWeight] = found
    let negations = 0
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
      if (['but', 'however', 'despite', 'as', 'while'].includes(tokens[j]))
        break
      if (
        NEGATORS.has(tokens[j]) &&
        !(tokens[j] === 'not' && tokens[j + 1] === 'only')
      )
        negations++
    }
    if (baseWeight !== 0)
      matches.push({
        term,
        weight: negations % 2 ? -baseWeight : baseWeight,
        negated: negations % 2 === 1,
      })
    i += term.split(' ').length - 1
  }
  if (!matches.length) return { score: null, tone: 'unscored', matches }
  const positive = matches.some((m) => m.weight > 0)
  const negative = matches.some((m) => m.weight < 0)
  const sum = matches.reduce((n, m) => n + m.weight, 0)
  const magnitude = matches.reduce((n, m) => n + Math.abs(m.weight), 0)
  return {
    score: Math.round((100 * sum) / (magnitude + 3)),
    tone: positive && negative ? 'mixed' : positive ? 'positive' : 'negative',
    matches,
  }
}

const TOPIC_RULES: [string, RegExp][] = [
  [
    'Technology',
    /\b(ai|artificial intelligence|chip|chips|semiconductor|software|cloud|nvidia|microsoft|apple|alphabet|google|amazon|meta|oracle|palantir)\b/i,
  ],
  [
    'Financials',
    /\b(bank|banks|banking|lender|lenders|credit|insurance|insurer|jpmorgan|goldman|visa|mastercard|fintech|payments)\b/i,
  ],
  [
    'Healthcare',
    /\b(drug|drugs|fda|pharma|biotech|vaccine|clinical|healthcare|health care|pfizer|lilly|hospital)\b/i,
  ],
  [
    'Energy',
    /\b(oil|gas|energy|crude|opec|petroleum|exxon|chevron|solar|wind power|renewable)\b/i,
  ],
  [
    'Consumer',
    /\b(retail|consumer|shopping|walmart|costco|target|restaurant|tesla|autos|automaker|cars|luxury)\b/i,
  ],
  [
    'Industrials',
    /\b(manufacturing|factory|factories|boeing|airline|airlines|aerospace|defense|shipping|logistics|freight|caterpillar)\b/i,
  ],
  [
    'Real estate',
    /\b(housing|home sales|real estate|reit|reits|mortgage|property|properties|homebuilder)\b/i,
  ],
  [
    'Materials',
    /\b(gold|silver|copper|steel|aluminum|mining|miner|miners|metals|lithium|chemicals)\b/i,
  ],
  [
    'Macro & policy',
    /\b(fed|federal reserve|interest rate|inflation|cpi|jobs|employment|unemployment|gdp|central bank|tariff|tariffs|ecb|treasury|recession|economy)\b/i,
  ],
  [
    'Earnings',
    /\b(earnings|quarterly|guidance|revenue|eps|profit|profits|results)\b/i,
  ],
  [
    'Crypto',
    /\b(bitcoin|ethereum|crypto|cryptocurrency|blockchain|stablecoin|coinbase)\b/i,
  ],
  ['ETFs', /\b(etf|etfs|exchange traded|index fund|index funds)\b/i],
  [
    'Deals & IPOs',
    /\b(ipo|ipos|acquisition|acquire|acquires|merger|merges|takeover|buyout|deal)\b/i,
  ],
]
export const HEADLINE_TOPICS = TOPIC_RULES.map(([name]) => name)
export type AnalyzedHeadline = NewsItem &
  Sentiment & {
    topics: string[]
    tickers: string[]
    mentions: CompanyMention[]
    copies: NewsItem[]
  }
export function analyzeHeadlines(feeds: NewsFeed[]): AnalyzedHeadline[] {
  const groups = new Map<string, AnalyzedHeadline>()
  const seenUrls = new Map<string, string>()
  const items = feeds
    .flatMap((f) => f.items)
    .sort(
      (a, b) =>
        (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') ||
        a.sourceId.localeCompare(b.sourceId),
    )
  for (const item of items) {
    const titleKey = `${item.publishedAt?.slice(0, 10) ?? 'undated'}:${item.title
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()}`
    const key = seenUrls.get(item.url) ?? titleKey
    seenUrls.set(item.url, key)
    const previous = groups.get(key)
    if (previous) {
      if (
        !previous.copies.some(
          (copy) => copy.url === item.url && copy.sourceId === item.sourceId,
        )
      )
        previous.copies.push(item)
      for (const mention of headlineCompanyMentions(item.title)) {
        if (
          !previous.mentions.some(
            (existing) => existing.symbol === mention.symbol,
          )
        ) {
          previous.mentions.push(mention)
          previous.tickers.push(mention.symbol)
        }
      }
      continue
    }
    const mentions = headlineCompanyMentions(item.title)
    groups.set(key, {
      ...item,
      ...scoreHeadline(item.title),
      topics: TOPIC_RULES.filter(([, pattern]) => pattern.test(item.title)).map(
        ([name]) => name,
      ),
      tickers: mentions.map((mention) => mention.symbol),
      mentions,
      copies: [item],
    })
  }
  return [...groups.values()]
}
export function summarizeHeadlines(items: AnalyzedHeadline[]) {
  const scored = items.filter((item) => item.score !== null)
  return {
    total: items.length,
    scored: scored.length,
    score: scored.length
      ? scored.reduce((sum, item) => sum + item.score!, 0) / scored.length
      : null,
    positive: items.filter((item) => item.tone === 'positive').length,
    negative: items.filter((item) => item.tone === 'negative').length,
    mixed: items.filter((item) => item.tone === 'mixed').length,
    unscored: items.filter((item) => item.tone === 'unscored').length,
  }
}
export type NewsInterval = 'hour' | 'day'
export const NEWS_MEASURES = ['score', 'volume', 'coverage'] as const
export type NewsMeasure = (typeof NEWS_MEASURES)[number]
export const NEWS_MEASURE_LABELS: Record<NewsMeasure, string> = {
  score: 'Mean headline score',
  volume: 'Headline count',
  coverage: 'Scoring coverage',
}

export function headlineMeasure(
  sample: Pick<
    ReturnType<typeof summarizeHeadlines>,
    'total' | 'scored' | 'score'
  >,
  measure: NewsMeasure,
): number | null {
  if (measure === 'volume') return sample.total
  if (measure === 'coverage')
    return sample.total ? (100 * sample.scored) / sample.total : null
  return sample.score
}

function headlineBuckets(items: AnalyzedHeadline[], interval: NewsInterval) {
  const groups = new Map<string, AnalyzedHeadline[]>()
  for (const item of items) {
    if (!item.publishedAt) continue
    const time = Date.parse(item.publishedAt)
    if (!Number.isFinite(time)) continue
    const utc = new Date(time).toISOString()
    const date =
      interval === 'hour' ? `${utc.slice(0, 13)}:00:00.000Z` : utc.slice(0, 10)
    const group = groups.get(date)
    if (group) group.push(item)
    else groups.set(date, [item])
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b))
}

export function headlineTimeline(
  items: AnalyzedHeadline[],
  interval: NewsInterval = 'day',
) {
  return headlineBuckets(items, interval).map(([date, group]) => ({
    date,
    time: Date.parse(date),
    ...summarizeHeadlines(group),
  }))
}

export function headlineTopicTimeline(
  items: AnalyzedHeadline[],
  topics: string[],
  interval: NewsInterval = 'day',
) {
  return headlineGroupTimeline(
    items,
    topics.map((topic) => ({
      id: topic,
      matches: (item: AnalyzedHeadline) => item.topics.includes(topic),
    })),
    interval,
  ).map(({ groups, ...row }) => ({ ...row, topics: groups }))
}

export function headlineGroupTimeline(
  items: AnalyzedHeadline[],
  groups: { id: string; matches: (item: AnalyzedHeadline) => boolean }[],
  interval: NewsInterval = 'day',
) {
  return headlineBuckets(items, interval).map(([date, group]) => ({
    date,
    time: Date.parse(date),
    groups: Object.fromEntries(
      groups.map(({ id, matches }) => [
        id,
        summarizeHeadlines(group.filter(matches)),
      ]),
    ),
  }))
}
