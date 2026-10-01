import { describe, expect, it } from 'vitest'
import type { NewsSource } from './newsSources'
import { changeNewsFeedSelection, findNewsSources } from './newsDirectory'

const sources: NewsSource[] = [
  {
    id: 'zeta',
    name: 'Zeta Markets',
    url: 'https://zeta.example',
    category: 'Markets',
    region: 'US',
    feed: 'https://zeta.example/rss',
    feedEnabled: true,
    note: 'Daily company news',
  },
  {
    id: 'sao',
    name: 'São Paulo Business',
    url: 'https://sao.example',
    category: 'Markets',
    region: 'Latin America',
    feed: 'https://sao.example/rss',
    feedEnabled: true,
    note: 'Brazilian company coverage',
  },
  {
    id: 'alpha',
    name: 'Alpha Journal',
    url: 'https://alpha.example',
    category: 'Technology',
    region: 'Global',
    note: 'Zeta markets commentary',
  },
  {
    id: 'beta',
    name: 'Beta [News]',
    url: 'https://beta.example',
    category: 'Technology',
    region: 'US',
    feed: 'https://beta.example/rss',
    feedEnabled: false,
  },
]
const ids = (items: NewsSource[]) => items.map((item) => item.id)

describe('news source directory', () => {
  it('requires every word across fields while ignoring accents, case and whitespace', () => {
    expect(
      ids(findNewsSources(sources, { query: '  SÃO   brazilian  LATIN  ' })),
    ).toEqual(['sao'])
    expect(findNewsSources(sources, { query: 'sao technology' })).toEqual([])
    expect(
      ids(findNewsSources(sources, { query: 'zeta.example company US' })),
    ).toEqual(['zeta'])
    expect(
      ids(findNewsSources(sources, { query: 'alpha commentary' })),
    ).toEqual(['alpha'])
  })

  it('matches short IDs and treats punctuation as literal search text', () => {
    expect(ids(findNewsSources(sources, { query: 'sao' }))).toEqual(['sao'])
    expect(ids(findNewsSources(sources, { query: '[news]' }))).toEqual(['beta'])
    expect(findNewsSources(sources, { query: '.*' })).toEqual([])
  })

  it('ranks publisher names ahead of notes and keeps catalog order without a query', () => {
    expect(
      ids(findNewsSources([sources[2], sources[0]], { query: 'zeta markets' })),
    ).toEqual(['zeta', 'alpha'])
    expect(ids(findNewsSources(sources, { query: '   ' }))).toEqual([
      'zeta',
      'sao',
      'alpha',
      'beta',
    ])
  })

  it('intersects search, category, region, availability and pending selection filters', () => {
    expect(
      ids(
        findNewsSources(sources, {
          query: 'company',
          category: 'Markets',
          region: 'US',
          availability: 'feed',
          selection: 'selected',
          selected: ['zeta', 'sao'],
        }),
      ),
    ).toEqual(['zeta'])
    expect(
      findNewsSources(sources, {
        region: 'US',
        availability: 'feed',
        selection: 'selected',
        selected: ['sao'],
      }),
    ).toEqual([])
  })

  it('limits selection filters to connected feeds even when disabled IDs are supplied', () => {
    expect(
      ids(
        findNewsSources(sources, {
          selection: 'selected',
          selected: ['zeta', 'alpha', 'beta'],
        }),
      ),
    ).toEqual(['zeta'])
    expect(
      ids(
        findNewsSources(sources, {
          selection: 'unselected',
          selected: ['zeta'],
        }),
      ),
    ).toEqual(['sao'])
    expect(ids(findNewsSources(sources, { availability: 'website' }))).toEqual([
      'alpha',
      'beta',
    ])
  })

  it('sorts publishers, regions and selected feeds independently of catalog order', () => {
    expect(ids(findNewsSources(sources, { sort: 'name' }))).toEqual([
      'alpha',
      'beta',
      'sao',
      'zeta',
    ])
    expect(ids(findNewsSources(sources, { sort: 'region' }))).toEqual([
      'alpha',
      'sao',
      'beta',
      'zeta',
    ])
    expect(
      ids(findNewsSources(sources, { sort: 'selected', selected: ['sao'] })),
    ).toEqual(['sao', 'zeta', 'alpha', 'beta'])
  })

  it('adds matching connected feeds while preserving unrelated selection and deduplicating', () => {
    const selected = ['other', 'zeta', 'zeta']
    expect(changeNewsFeedSelection(selected, sources, true)).toEqual([
      'other',
      'zeta',
      'sao',
    ])
    expect(selected).toEqual(['other', 'zeta', 'zeta'])
  })

  it('removes only matching connected feeds while preserving unrelated selection', () => {
    const selected = ['other', 'zeta', 'sao']
    expect(
      changeNewsFeedSelection(
        selected,
        [sources[0], sources[2], sources[3]],
        false,
      ),
    ).toEqual(['other', 'sao'])
    expect(selected).toEqual(['other', 'zeta', 'sao'])
    expect(changeNewsFeedSelection(selected, [], false)).toEqual(selected)
  })

  it('operates across more than one page of matched feeds', () => {
    const matching = Array.from({ length: 55 }, (_, i) => ({
      ...sources[0],
      id: `feed-${i}`,
    }))
    const added = changeNewsFeedSelection(['other'], matching, true)
    expect(added).toHaveLength(56)
    expect(added).toContain('feed-54')
    expect(changeNewsFeedSelection(added, matching, false)).toEqual(['other'])
  })
})
