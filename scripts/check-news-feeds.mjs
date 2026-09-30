import { readFile, writeFile } from 'node:fs/promises'

// Deliberately sequential. This checks public RSS endpoints, not article pages.
const catalog = JSON.parse(
  await readFile(
    new URL('../src/lib/news-sources.json', import.meta.url),
    'utf8',
  ),
)
const results = []
for (const source of catalog.filter((s) => s.feed)) {
  try {
    const response = await fetch(source.feed, {
      redirect: 'manual',
      signal: AbortSignal.timeout(7000),
      headers: {
        'User-Agent':
          'MarketAtlas/1.5 (+https://github.com/DevanMetz/market-atlas)',
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    })
    const content = await response.text()
    const rss =
      response.ok &&
      /<(?:rss|feed|rdf:RDF)\b/i.test(content) &&
      /<(?:item|entry)\b/i.test(content)
    const result = {
      id: source.id,
      status: response.status,
      rss,
      location: response.headers.get('location'),
      bytes: content.length,
      checkedAt: new Date().toISOString(),
    }
    results.push(result)
    console.log(source.id, response.status, rss ? 'feed' : 'unavailable')
  } catch (error) {
    results.push({
      id: source.id,
      rss: false,
      error: error.message,
      checkedAt: new Date().toISOString(),
    })
    console.log(source.id, 'unavailable')
  }
}
await writeFile(
  process.argv[2] ?? 'news-feed-audit.json',
  JSON.stringify(results, null, 2) + '\n',
)
console.log(
  `${results.filter((r) => r.rss).length}/${results.length} feeds responded with entries.`,
)
