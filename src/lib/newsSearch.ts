import type { AnalyzedHeadline } from './news'
import { normalizeNewsSymbol } from './newsCompanies'
import { NEWS_SOURCE_MAP } from './newsSources'

export const NEWS_QUERY_LIMIT = 400
const FIELDS = ['title', 'source', 'ticker', 'topic'] as const
type Field = (typeof FIELDS)[number] | 'any'
type SearchDocument = Record<Field, string[]>
type Matcher = (document: SearchDocument) => boolean
type Token =
  | { kind: 'term'; field: Field; value: string }
  | { kind: 'AND' | 'OR' | 'NOT' | '(' | ')' }

const normalizeText = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

// Keep fields separate so a phrase cannot accidentally span a title and publisher.
export function headlineSearchDocument(item: AnalyzedHeadline): SearchDocument {
  const title = [normalizeText(item.title)]
  const source = [
    ...new Set(
      item.copies.flatMap((copy) => [
        copy.sourceId,
        NEWS_SOURCE_MAP.get(copy.sourceId)?.name ?? copy.sourceId,
      ]),
    ),
  ].map(normalizeText)
  const ticker = item.tickers.map(normalizeNewsSymbol)
  const topic = item.topics.map(normalizeText)
  return {
    title,
    source,
    ticker,
    topic,
    any: [
      ...title,
      ...source,
      ...topic,
      ...ticker.flatMap((symbol) => [
        symbol.toLowerCase(),
        `$${symbol.toLowerCase()}`,
      ]),
    ],
  }
}

function tokenize(query: string): Token[] {
  const input = query.replace(/[“”]/g, '"')
  const tokens: Token[] = []
  let cursor = 0
  while (cursor < input.length) {
    if (/\s/.test(input[cursor])) {
      cursor++
      continue
    }
    if (tokens.length >= 80)
      throw new SyntaxError('Use at most 80 search terms and operators.')
    const character = input[cursor]
    if (character === '(' || character === ')' || character === '-') {
      tokens.push({ kind: character === '-' ? 'NOT' : character })
      cursor++
      continue
    }
    let field: Field = 'any'
    const prefix = /^([a-z]+):/i.exec(input.slice(cursor))
    if (prefix) {
      const name = prefix[1].toLowerCase()
      if (!FIELDS.includes(name as (typeof FIELDS)[number]))
        throw new SyntaxError(
          `Unknown field “${prefix[1]}”. Use title:, source:, ticker: or topic:.`,
        )
      field = name as Field
      cursor += prefix[0].length
      while (cursor < input.length && /\s/.test(input[cursor])) cursor++
    }
    let value = ''
    const quoted = input[cursor] === '"'
    if (quoted) {
      cursor++
      let closed = false
      while (cursor < input.length) {
        const next = input[cursor++]
        if (next === '"') {
          closed = true
          break
        }
        if (next === '\\' && ['"', '\\'].includes(input[cursor]))
          value += input[cursor++]
        else value += next
      }
      if (!closed)
        throw new SyntaxError(
          'Close the quoted phrase with a double quote (\").',
        )
      if (cursor < input.length && !/[\s()]/.test(input[cursor]))
        throw new SyntaxError('Add a space after the quoted phrase.')
    } else {
      while (cursor < input.length && !/[\s()"]/.test(input[cursor]))
        value += input[cursor++]
    }
    if (!value.trim())
      throw new SyntaxError(
        field === 'any'
          ? 'Add a word or phrase inside the quotes.'
          : `Add a word or quoted phrase after ${field}:.`,
      )
    if (
      !quoted &&
      field === 'any' &&
      (value === 'AND' || value === 'OR' || value === 'NOT')
    )
      tokens.push({ kind: value })
    else tokens.push({ kind: 'term', field, value })
  }
  return tokens
}

/** Compile once per query. User input is matched literally, never evaluated as a regex. */
export function compileHeadlineSearch(query: string): {
  matches: Matcher
  error: string | null
} {
  try {
    if (query.length > NEWS_QUERY_LIMIT)
      throw new SyntaxError(
        `Keep the search within ${NEWS_QUERY_LIMIT} characters.`,
      )
    const tokens = tokenize(query)
    if (!tokens.length) return { matches: () => true, error: null }
    let cursor = 0
    const unary = (depth: number): Matcher => {
      if (depth > 16)
        throw new SyntaxError(
          'Use at most 16 levels of grouped or excluded terms.',
        )
      const token = tokens[cursor++]
      if (!token)
        throw new SyntaxError(
          'Add a word, quoted phrase or group after the operator.',
        )
      if (token.kind === 'NOT') {
        const match = unary(depth + 1)
        return (document) => !match(document)
      }
      if (token.kind === '(') {
        const match = either(depth + 1)
        if (tokens[cursor]?.kind !== ')')
          throw new SyntaxError('Close the group with a closing parenthesis ).')
        cursor++
        return match
      }
      if (token.kind !== 'term')
        throw new SyntaxError('Expected a word, quoted phrase or group here.')
      if (token.field === 'ticker') {
        const symbol = normalizeNewsSymbol(token.value.replace(/^\$/, ''))
        return (document) => document.ticker.includes(symbol)
      }
      const text = normalizeText(token.value)
      return (document) =>
        document[token.field].some((value) => value.includes(text))
    }
    const all = (depth: number): Matcher => {
      const terms = [unary(depth)]
      while (
        cursor < tokens.length &&
        !['OR', ')'].includes(tokens[cursor].kind)
      ) {
        if (tokens[cursor].kind === 'AND') cursor++
        terms.push(unary(depth))
      }
      return (document) => terms.every((match) => match(document))
    }
    const either = (depth: number): Matcher => {
      const groups = [all(depth)]
      while (tokens[cursor]?.kind === 'OR') {
        cursor++
        groups.push(all(depth))
      }
      return (document) => groups.some((match) => match(document))
    }
    const matches = either(0)
    if (cursor !== tokens.length)
      throw new SyntaxError('Remove the extra closing parenthesis ).')
    return { matches, error: null }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    // Invalid queries must never silently expand the sample used by charts or exports.
    return { matches: () => false, error: error.message }
  }
}
