import { describe, expect, it } from 'vitest'
import { STOCKS } from './catalog'
import {
  companyNewsHref,
  headlineCompanyMentions,
  parseNewsCompanies,
  stockResearchHref,
} from './newsCompanies'

describe('company mentions in headlines', () => {
  it('recognizes every curated company name without treating bare common ticker words as symbols', () => {
    for (const stock of STOCKS) {
      expect(
        headlineCompanyMentions(`${stock.name} shares gain`).map(
          (mention) => mention.symbol,
        ),
        stock.name,
      ).toContain(stock.symbol)
    }
    expect(headlineCompanyMentions('So it is a good day to go home')).toEqual(
      [],
    )
    expect(headlineCompanyMentions('A look at CAT and DE')).toEqual([])
  })
  it('preserves inspectable company-name, cashtag and exchange evidence', () => {
    expect(
      headlineCompanyMentions('Google and $IBM rally as NYSE: BRK.B rises'),
    ).toEqual([
      { symbol: 'IBM', text: '$IBM', kind: 'cashtag' },
      { symbol: 'BRK-B', text: 'NYSE: BRK.B', kind: 'exchange ticker' },
      { symbol: 'GOOGL', text: 'Google', kind: 'company name' },
    ])
    expect(headlineCompanyMentions('Nvidia and $NVDA report results')).toEqual([
      { symbol: 'NVDA', text: '$NVDA', kind: 'cashtag' },
    ])
    expect(
      headlineCompanyMentions('Boeing and Coinbase host a conference').map(
        (mention) => mention.symbol,
      ),
    ).toEqual(['BA', 'COIN'])
    expect(headlineCompanyMentions('AAPL shares gain')).toEqual([
      { symbol: 'AAPL', text: 'AAPL', kind: 'ticker context' },
    ])
    expect(headlineCompanyMentions('SO stock reports earnings')[0].symbol).toBe(
      'SO',
    )
  })
  it('handles name punctuation and avoids common Visa and RTX false matches', () => {
    expect(
      headlineCompanyMentions("McDonald's and Coca Cola shares rise").map(
        (mention) => mention.symbol,
      ),
    ).toEqual(['MCD', 'KO'])
    expect(headlineCompanyMentions('Visa immigration rules change')).toEqual([])
    expect(
      headlineCompanyMentions('New student visa rules hit stocks'),
    ).toEqual([])
    expect(
      headlineCompanyMentions('Visa expands card payments')[0].symbol,
    ).toBe('V')
    expect(
      headlineCompanyMentions('Nvidia unveils GeForce RTX 5090').map(
        (mention) => mention.symbol,
      ),
    ).toEqual(['NVDA'])
    expect(headlineCompanyMentions('RTX shares rally')[0].symbol).toBe('RTX')
    expect(headlineCompanyMentions('US$500 million worth of cards')).toEqual([])
  })
})

describe('company news research links', () => {
  it('normalizes a bounded explicit ticker selection and rejects malformed lists', () => {
    expect(parseNewsCompanies('aapl,BRK.B,BRK-B,AAPL')).toEqual([
      'AAPL',
      'BRK-B',
    ])
    expect(parseNewsCompanies('')).toEqual([])
    for (const value of [
      'AAPL,',
      'https://example.com',
      'AAPL,<script>',
      'A'.repeat(21),
      Array(101).fill('AAPL').join(','),
    ])
      expect(parseNewsCompanies(value)).toBeNull()
  })
  it('carries research dates and benchmark through news and back to stock charts', () => {
    const original =
      '?view=stocks&stock=AAPL&period=1Y&benchmark=QQQ&start=2026-01-01&end=2026-06-01&symbols=MSFT,AAPL&sector=Technology'
    const news = new URLSearchParams(
      companyNewsHref(['AAPL', 'MSFT'], original),
    )
    expect(news.get('view')).toBe('news')
    expect(news.get('newsCompanies')).toBe('AAPL,MSFT')
    expect(news.get('sector')).toBeNull()
    const stock = new URLSearchParams(
      stockResearchHref('BRK.B', news.toString()),
    )
    expect(stock.get('view')).toBe('stocks')
    expect(stock.get('stock')).toBe('BRK-B')
    expect(stock.get('benchmark')).toBe('QQQ')
    expect(stock.get('start')).toBe('2026-01-01')
    expect(stock.get('end')).toBe('2026-06-01')
    expect(stock.get('newsCompanies')).toBeNull()
  })
})
