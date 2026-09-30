import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Synthetic headlines exist only in this browser test fixture; never in production.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/news?*', (route) => {
    const ids = new URL(route.request().url()).searchParams
      .get('sources')!
      .split(',')
    const publishedAt = new Date(Date.now() - 3600000).toISOString()
    const titles = [
      'Nvidia shares rally as earnings beat estimates',
      'Banks plunge after profit warning',
      'Stocks rise while oil prices fall',
      'Board schedules annual meeting',
      'Apple posts earnings growth',
      'Market snapshot without publication time',
    ]
    return route.fulfill({
      json: {
        feeds: ids.map((sourceId) => ({
          sourceId,
          fetchedAt: new Date().toISOString(),
          items: titles.map((title, i) => ({
            title,
            url: `https://example.org/${sourceId}/news-${i}`,
            sourceId,
            publishedAt: i === 5 ? null : publishedAt,
          })),
        })),
        errors: [],
      },
    })
  })
})

test('news searches ticker aliases and topics, groups copies and preserves filters', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?view=news&feeds=bbc,cnbc')
  await expect(
    page.getByRole('heading', { name: 'News & sentiment.', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.headline-card')).toHaveCount(5)
  await page.screenshot({ path: 'test-results/news-desktop.png' })
  await expect(page.locator('.headline-explanation').first()).toContainText(
    '2 grouped copies',
  )
  await page.getByLabel('Search news headlines').fill('NVDA')
  await expect(page.locator('.headline-card')).toHaveCount(1)
  await expect(page.locator('.headline-card')).toContainText('Nvidia')
  await page.reload()
  await expect(page.getByLabel('Search news headlines')).toHaveValue('NVDA')
  await expect(page.locator('.headline-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await page.getByLabel('Headline sentiment filter').selectOption('negative')
  await expect(page.locator('.headline-card')).toHaveCount(1)
  await expect(page.locator('.headline-card')).toContainText('Banks plunge')
  await page.getByLabel('Headline sentiment filter').selectOption('all')
  await page.getByLabel('News publication window').selectOption('all')
  await expect(page.locator('.headline-card')).toHaveCount(6)
  expect(errors).toEqual([])
})

test('sentiment charts, transparent sandbox and exports follow the sample', async ({
  page,
}) => {
  await page.goto('/?view=news&newsTab=sentiment&feeds=bbc,cnbc')
  await expect(
    page.getByRole('region', {
      name: 'Daily headline volume and mean sentiment score',
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.locator('.news-publisher-table tbody tr')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/news-sentiment.png' })
  await page
    .getByLabel('Headline sentiment sandbox')
    .fill('Stocks do not rally')
  await expect(page.locator('.headline-lab .news-tone')).toContainText(
    'negative',
  )
  await expect(page.locator('.headline-lab')).toContainText('negated')
  const download = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Export sentiment', exact: true })
    .click()
  expect((await download).suggestedFilename()).toBe(
    'market-atlas-news-sentiment.csv',
  )
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  expect(
    accessibility.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([])
})

test('the large directory searches, separates links from feeds and applies source sets', async ({
  page,
}) => {
  await page.goto('/?view=news&newsTab=sources&feeds=bbc,cnbc')
  await expect(page.locator('.source-card')).toHaveCount(24)
  await page.screenshot({ path: 'test-results/news-directory.png' })
  await page.getByLabel('Search news sources').fill('Guardian')
  await expect(page.locator('.source-card')).toHaveCount(1)
  await expect(page.locator('.source-card')).toContainText('Website link')
  await expect(page.locator('.source-card input[type=checkbox]')).toHaveCount(0)
  await page.getByLabel('Search news sources').fill('')
  await page.getByLabel('Source category').selectOption('Technology')
  await page.getByLabel('Source feed availability').selectOption('feed')
  await expect(page.locator('.source-card').first()).toContainText('Technology')
  await page.getByRole('button', { name: 'Technology', exact: true }).click()
  await page.getByRole('button', { name: /^Apply \d+ sources$/ }).click()
  await expect(
    page.getByRole('button', { name: 'Headlines', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/feeds=techcrunch/)
  await expect(page.locator('.headline-card')).toHaveCount(5)
})

test('failed news feeds remain visible without fabricated headlines', async ({
  page,
}) => {
  await page.unroute('**/api/news?*')
  await page.route('**/api/news?*', (route) =>
    route.fulfill({
      json: {
        feeds: [],
        errors: [
          { sourceId: 'bbc', message: 'Publisher feed unavailable in test.' },
        ],
      },
    }),
  )
  await page.goto('/?view=news&feeds=bbc')
  await expect(page.locator('.news-feed-status summary')).toContainText(
    '1 unavailable',
  )
  await expect(page.locator('.headline-card')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'No matching headlines', exact: true }),
  ).toBeVisible()
  await page.locator('.news-feed-status summary').click()
  await expect(page.locator('.feed-status-grid')).toContainText(
    'Publisher feed unavailable in test.',
  )
})

test('news and source directory fit a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?view=news&feeds=bbc')
  await expect(page.locator('.headline-card')).toHaveCount(5)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'test-results/news-mobile.png' })
  await page
    .getByRole('button', { name: 'Source directory', exact: true })
    .click()
  await expect(page.locator('.source-card')).toHaveCount(24)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: 'Sentiment lab', exact: true }).click()
  await expect(page.locator('.news-sentiment-chart')).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
})
