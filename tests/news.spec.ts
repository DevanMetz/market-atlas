import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFile } from 'node:fs/promises'

// Synthetic headlines exist only in this browser test fixture; never in production.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/search?*', (route) =>
    route.fulfill({ json: { matches: [] } }),
  )
  await page.route('**/api/news?*', (route) => {
    const ids = new URL(route.request().url()).searchParams
      .get('sources')!
      .split(',')
    const fixtureHour = Math.floor(Date.now() / 3600000) * 3600000
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
            publishedAt:
              i === 5
                ? null
                : new Date(
                    fixtureHour - ((i % 3) + 1) * 3600000 + 600000,
                  ).toISOString(),
          })),
        })),
        errors: [],
      },
    })
  })
})

test('company focus combines selected tickers, preserves a watchlist snapshot and explains matches', async ({
  page,
}) => {
  await page.goto('/?view=news&feeds=bbc,cnbc')
  await expect(page.locator('.headline-card')).toHaveCount(5)
  await page.locator('.news-company-focus summary').click()
  const picker = page.getByRole('combobox', {
    name: 'Add a company or ticker to news…',
  })
  await picker.fill('Apple')
  await picker.press('Enter')
  await expect(page.locator('.headline-card')).toHaveCount(1)
  await expect(page.locator('.headline-card')).toContainText('Apple')
  await picker.fill('Nvidia')
  await picker.press('Enter')
  await expect(page.locator('.headline-card')).toHaveCount(2)
  await page
    .getByRole('button', { name: 'Remove AAPL from news focus', exact: true })
    .click()
  await expect(page.locator('.headline-card')).toHaveCount(1)
  await page.locator('.headline-explanation summary').click()
  await expect(page.locator('.headline-explanation')).toContainText(
    'NVDA via “Nvidia” (company name)',
  )
  await page
    .getByRole('button', { name: 'Use my watchlist', exact: true })
    .click()
  await expect(page.locator('.headline-card')).toHaveCount(2)
  await expect(page).toHaveURL(/newsCompanies=AAPL%2CMSFT%2CNVDA%2CSPY/)
  await page.evaluate(() =>
    localStorage.setItem('market-atlas-watchlist', JSON.stringify(['IBM'])),
  )
  await page.reload()
  await expect(page.locator('.headline-card')).toHaveCount(2)
  await expect(
    page.getByRole('button', {
      name: 'Remove AAPL from news focus',
      exact: true,
    }),
  ).toBeVisible()
  await page
    .locator('.news-company-focus')
    .screenshot({ path: 'test-results/news-companies-desktop.png' })
  const downloadEvent = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Export headlines', exact: true })
    .click()
  const csv = await readFile((await (await downloadEvent).path())!, 'utf8')
  expect(csv).toContain('Ticker match evidence')
  expect(csv).toContain('NVDA: Nvidia (company name)')
  expect(csv.trim().split(/\r?\n/)).toHaveLength(3)
  await page.getByRole('button', { name: 'Sentiment lab', exact: true }).click()
  await expect(page.locator('.news-chart-controls')).toContainText(
    '2 dated headlines',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390)
  await page
    .locator('.news-company-focus')
    .screenshot({ path: 'test-results/news-companies-mobile.png' })
  await page.locator('.news-advanced summary').click()
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click()
  await expect(page.locator('.news-chart-controls')).toContainText(
    '5 dated headlines',
  )
  await expect(page.locator('.news-company-focus summary')).toContainText(
    'All headlines',
  )
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
  await page.locator('.news-advanced summary').click()
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
  await expect(
    page.locator('.news-sentiment-chart .recharts-bar-rectangle').first(),
  ).toBeVisible()
  await page.mouse.move(0, 0)
  await page
    .locator('.news-timeline-panel')
    .screenshot({ path: 'test-results/news-volume-timeline.png' })
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

test('advanced searches share their exact query and filter headline and sentiment exports', async ({
  page,
}) => {
  await page.goto('/?view=news&feeds=bbc,cnbc')
  const input = page.getByLabel('Search news headlines')
  await expect(page.locator('.headline-card')).toHaveCount(5)
  await input.fill('"profit warning"')
  await expect(page.locator('.headline-card')).toHaveCount(1)
  await expect(page.locator('.headline-card')).toContainText('Banks plunge')
  await input.fill('ticker:NVDA OR ticker:AAPL')
  await expect(page.locator('.headline-card')).toHaveCount(2)
  await input.fill(
    '(ticker:NVDA OR ticker:AAPL) earnings -title:growth source:CNBC',
  )
  await expect(page.locator('.headline-card')).toHaveCount(1)
  await expect(page.locator('.headline-card')).toContainText('Nvidia')
  // CNBC is retained in the grouped publishers even though BBC supplies the displayed copy.
  await expect(page.locator('.headline-meta')).toContainText('BBC')
  const query = await input.inputValue()
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(query)
  await page.reload()
  await expect(input).toHaveValue(query)
  await expect(page.locator('.headline-card')).toHaveCount(1)
  const downloadEvent = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Export headlines', exact: true })
    .click()
  const csv = await readFile((await (await downloadEvent).path())!, 'utf8')
  expect(csv).toContain('Search query')
  expect(csv).toContain(query)
  expect(csv).toContain('Research URL')
  expect(csv.trim().split(/\r?\n/)).toHaveLength(2)
  expect(csv).not.toContain('Apple posts')
  await page.getByRole('button', { name: 'Sentiment lab', exact: true }).click()
  await expect(page.locator('.news-chart-controls')).toContainText(
    '1 dated headlines',
  )
  const sentimentDownload = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Export sentiment', exact: true })
    .click()
  const sentimentCsv = await readFile(
    (await (await sentimentDownload).path())!,
    'utf8',
  )
  expect(sentimentCsv).toContain('q=%28ticker%3ANVDA')
  expect(sentimentCsv.trim().split(/\r?\n/)).toHaveLength(2)
})

test('invalid searches explain corrections and never display an unfiltered chart or export', async ({
  page,
}) => {
  await page.goto('/?view=news&feeds=bbc,cnbc')
  const input = page.getByLabel('Search news headlines')
  await input.fill('earnings OR')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toContainText('after the operator')
  await expect(page.locator('.headline-card')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Export headlines', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Sentiment lab', exact: true }).click()
  await expect(page.locator('.news-timeline-panel')).toHaveCount(0)
  await expect(page.locator('.news-stats')).toHaveCount(0)
  await input.fill('earnings OR "profit warning"')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.news-chart-controls')).toContainText(
    '3 dated headlines',
  )
  await input.fill('source:')
  await page.locator('.news-query-help details summary').click()
  await page.screenshot({ path: 'test-results/news-search-validation.png' })
  await page
    .getByRole('button', { name: 'Clear headline search', exact: true })
    .click()
  await expect(input).toBeFocused()
  await expect(page.locator('.news-chart-controls')).toContainText(
    '5 dated headlines',
  )
  await page.goto('/?view=news&feeds=bbc&q=' + 'a'.repeat(401))
  await expect(page.getByRole('alert')).toContainText('400 characters')
  await expect(page.locator('.headline-card')).toHaveCount(0)
})

test('search examples are keyboard accessible and fit mobile screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?view=news&feeds=bbc,cnbc')
  await page.locator('.news-query-help details summary').click()
  const example = page.getByRole('button', {
    name: 'Try search: Company comparison',
    exact: true,
  })
  await example.focus()
  await page.keyboard.press('Enter')
  const input = page.getByLabel('Search news headlines')
  await expect(input).toHaveValue('(ticker:NVDA OR ticker:AAPL) earnings')
  await expect(input).toBeFocused()
  await expect(page.locator('.headline-card')).toHaveCount(2)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390)
  await page
    .locator('.news-filters')
    .screenshot({ path: 'test-results/news-search-mobile.png' })
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

test('hourly topic comparisons preserve their settings and export coverage with provenance', async ({
  page,
}) => {
  await page.goto('/?view=news&newsTab=sentiment&feeds=bbc,cnbc&days=1')
  await expect(
    page.getByRole('region', {
      name: 'Hourly headline volume and mean sentiment score',
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.locator('.news-chart-controls')).toContainText(
    '5 dated headlines · 3 observed hours',
  )
  await page
    .getByRole('button', { name: 'Compare topics', exact: true })
    .click()
  await expect(
    page.getByRole('checkbox', { name: 'Healthcare', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('checkbox', { name: 'Macro & policy', exact: true })
    .uncheck()
  await page.getByRole('checkbox', { name: 'Energy', exact: true }).uncheck()
  await page.getByRole('checkbox', { name: 'Earnings', exact: true }).check()
  await page.getByLabel('News chart interval').selectOption('hour')
  await page.reload()
  await expect(
    page.getByRole('region', {
      name: 'Hourly headline sentiment by topic',
      exact: true,
    }),
  ).toBeVisible()
  await expect(page.getByLabel('News chart interval')).toHaveValue('hour')
  await expect(
    page.getByRole('checkbox', { name: 'Earnings', exact: true }),
  ).toBeChecked()
  await expect(
    page.getByRole('checkbox', { name: 'Energy', exact: true }),
  ).not.toBeChecked()
  await page.locator('.news-chart-data summary').click()
  await expect(page.locator('.news-chart-data tbody tr')).toHaveCount(9)
  await expect(page.locator('.news-chart-data tbody')).toContainText('—')
  const downloadEvent = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Export topic trends', exact: true })
    .click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe(
    'market-atlas-news-topic-trends.csv',
  )
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv).toContain('"Scoring coverage (%)"')
  expect(csv).toContain('"Feed retrieval times (UTC)"')
  expect(csv).toContain('newsInterval=hour')
  expect(csv).toContain('bbc: ')
  expect(csv.trim().split(/\r?\n/)).toHaveLength(10)
  await page.locator('.news-chart-data summary').click()
  await page
    .locator('.news-timeline-panel')
    .screenshot({ path: 'test-results/news-topic-comparison.png' })
  await page.getByLabel('News chart interval').selectOption('day')
  await expect(
    page.getByRole('region', {
      name: 'Daily headline sentiment by topic',
      exact: true,
    }),
  ).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390)
  await page
    .locator('.news-timeline-panel')
    .screenshot({ path: 'test-results/news-topic-mobile.png' })
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  expect(
    accessibility.violations.filter(
      (violation) =>
        violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([])
  await page.goto(
    '/?view=news&newsTab=sentiment&feeds=bbc&newsChart=topics&newsTopics=Healthcare',
  )
  await expect(
    page.locator('.news-timeline-panel').getByRole('status'),
  ).toContainText('No scored headlines for the selected topics.')
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
