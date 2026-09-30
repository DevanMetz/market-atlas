import { expect, test } from '@playwright/test'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

let newsModulePath: string
let timelineModulePath: string
test.beforeAll(async () => {
  const manifest = JSON.parse(
    await readFile('dist/.vite/manifest.json', 'utf8'),
  )
  newsModulePath = `/${manifest['src/views/News.tsx'].file}`
  timelineModulePath = `/${manifest['src/components/NewsTimeline.tsx'].file}`
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/history?*', (route) =>
    route.fulfill({ json: { data: [], errors: [] } }),
  )
  await page.route('**/api/news?*', (route) => {
    const ids = new URL(route.request().url()).searchParams
      .get('sources')!
      .split(',')
    return route.fulfill({
      json: {
        feeds: ids.map((sourceId) => ({
          sourceId,
          fetchedAt: new Date().toISOString(),
          items: [
            {
              sourceId,
              title: 'Nvidia shares rally',
              url: `https://example.org/${sourceId}/story`,
              publishedAt: new Date(Date.now() - 3600000).toISOString(),
            },
          ],
        })),
        errors: [],
      },
    })
  })
})

test('market pages defer the newsroom until it is opened', async ({ page }) => {
  const requested = new Set<string>()
  page.on('request', (request) =>
    requested.add(new URL(request.url()).pathname),
  )
  await page.goto('/?view=overview')
  await expect(page.locator('.sector-heatmap .heat-tile')).toHaveCount(11)
  expect(requested.has(newsModulePath)).toBe(false)
  expect(requested.has('/api/news')).toBe(false)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^News & sentiment/ })
    .click()
  await expect(page.locator('.headline-card')).toHaveCount(1)
  expect(requested.has(newsModulePath)).toBe(true)
})

test('headline reading defers charts and market history until they are needed', async ({
  page,
}) => {
  const scripts = new Set<string>()
  const requests = new Set<string>()
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    requests.add(path)
    if (request.resourceType() === 'script' && path.startsWith('/assets/'))
      scripts.add(path)
  })
  await page.goto('/?view=news&feeds=bbc')
  await expect(page.locator('.headline-card')).toHaveCount(1)
  expect(requests.has('/api/history')).toBe(false)
  expect(requests.has(timelineModulePath)).toBe(false)
  expect([...scripts].some((path) => path.includes('/charts-'))).toBe(false)
  const files = await Promise.all(
    [...scripts]
      .sort()
      .map(async (path) => ({
        path,
        bytes: (await stat(join('dist', path.slice(1)))).size,
      })),
  )
  await mkdir('test-results', { recursive: true })
  await writeFile(
    'test-results/news-load-metrics.json',
    JSON.stringify(
      {
        page: 'News headlines',
        files,
        totalJavaScriptBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        note: 'Built JavaScript file sizes requested by a fresh headline view. Uncompressed bytes; not a loading-time benchmark.',
      },
      null,
      2,
    ),
  )
  await page.getByRole('button', { name: 'Sentiment lab', exact: true }).click()
  await expect(
    page.getByRole('region', {
      name: 'Daily headline volume and mean sentiment score',
      exact: true,
    }),
  ).toBeVisible()
  expect(requests.has(timelineModulePath)).toBe(true)
  expect([...scripts].some((path) => path.includes('/charts-'))).toBe(true)
})

test('a delayed newsroom keeps shared filters while showing loading feedback', async ({
  page,
}) => {
  let releaseModule!: () => void
  const gate = new Promise<void>((resolve) => {
    releaseModule = resolve
  })
  await page.route(`**${newsModulePath}`, async (route) => {
    await gate
    await route.continue()
  })
  try {
    await page.goto(
      '/?view=news&feeds=bbc&q=Nvidia&newsCompanies=NVDA&days=1',
      { waitUntil: 'domcontentloaded' },
    )
    await expect(
      page.getByRole('status', {
        name: 'Loading News & sentiment',
        exact: true,
      }),
    ).toBeVisible()
    await expect(page).toHaveURL(/newsCompanies=NVDA/)
  } finally {
    releaseModule()
  }
  await expect(page.locator('.headline-card')).toHaveCount(1)
  await expect(page.getByLabel('Search news headlines')).toHaveValue('Nvidia')
  await expect(page.getByLabel('News publication window')).toHaveValue('1')
  await expect(
    page.getByRole('button', {
      name: 'Remove NVDA from news focus',
      exact: true,
    }),
  ).toBeVisible()
})

test('a failed page download offers recovery without removing navigation', async ({
  page,
}) => {
  await page.route(`**${newsModulePath}`, (route) => route.abort('failed'))
  await page.goto('/?view=news&feeds=bbc&newsCompanies=NVDA')
  await expect(page.getByRole('alert')).toContainText(
    'News & sentiment could not load.',
  )
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }),
  ).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^Market overview/ })
    .click()
  await expect(page.locator('.sector-heatmap .heat-tile')).toHaveCount(11)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.goto('/?view=news&feeds=bbc&newsCompanies=NVDA')
  await expect(
    page.getByRole('button', { name: 'Reload page', exact: true }),
  ).toBeVisible()
  await page.unroute(`**${newsModulePath}`)
  await page.getByRole('button', { name: 'Reload page', exact: true }).click()
  await expect(page.locator('.headline-card')).toHaveCount(1)
  await expect(
    page.getByRole('button', {
      name: 'Remove NVDA from news focus',
      exact: true,
    }),
  ).toBeVisible()
})

test('a chart download failure leaves the headline workspace usable', async ({
  page,
}) => {
  await page.route(`**${timelineModulePath}`, (route) => route.abort('failed'))
  await page.goto('/?view=news&feeds=bbc&newsTab=sentiment')
  await expect(page.getByRole('alert')).toContainText(
    'Sentiment chart could not load.',
  )
  await page.getByRole('button', { name: 'Headlines', exact: true }).click()
  await expect(page.locator('.headline-card')).toHaveCount(1)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
