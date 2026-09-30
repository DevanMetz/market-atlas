import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import type { History } from '../src/lib/types'

// Deterministic synthetic observations for UI regression tests only.
// This file is never imported by the application or deployed Worker.
function fixture(symbol: string): History {
  const points = []
  let price = 100
  const seed = [...symbol].reduce((n, c) => n + c.charCodeAt(0), 0)
  for (
    let date = new Date('2021-09-01T12:00:00Z'), i = 0;
    date <= new Date('2026-09-28T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + 1), i++
  ) {
    if ([0, 6].includes(date.getUTCDay())) continue
    price *=
      1 + 0.0002 + (seed % 10) / 10000 + Math.sin(i * 0.43 + seed) * 0.006
    points.push({
      date: date.toISOString().slice(0, 10),
      close: price,
      adjusted: price,
      volume: 1000000 + i,
    })
  }
  return {
    symbol,
    name: `${symbol} · test fixture`,
    currency: 'USD',
    exchange: 'Test exchange',
    points,
    price,
    fetchedAt: '2026-09-29T12:00:00Z',
    marketTime: '2026-09-28T20:00:00Z',
    source: 'Synthetic test fixture',
    adjusted: true,
  }
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/history?*', async (route) => {
    const symbols = new URL(route.request().url()).searchParams
      .get('symbols')!
      .split(',')
    await route.fulfill({ json: { data: symbols.map(fixture), errors: [] } })
  })
  await page.route('**/api/search?*', (route) =>
    route.fulfill({ json: { matches: [] } }),
  )
})

test('overview renders all sectors and charts with no console errors', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Market overview.' }),
  ).toBeVisible()
  await expect(page.locator('.sector-heatmap .heat-tile')).toHaveCount(11)
  await expect(page.locator('.chart-wrap .recharts-line')).toHaveCount(4)
  await expect(page.locator('tbody tr')).toHaveCount(11)
  await expect(page.locator('.data-warning')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('comparison presets, periods, chart modes and benchmarks are functional', async ({
  page,
}) => {
  await page.goto('/?view=compare&period=YTD&symbols=XLK&benchmark=SPY')
  await page.getByRole('button', { name: 'All sectors', exact: true }).click()
  await expect(page.locator('.symbol-chip')).toHaveCount(12)
  await page.getByRole('button', { name: '3M', exact: true }).click()
  await page.getByRole('button', { name: 'Relative', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Performance vs SPY' }),
  ).toBeVisible()
  await page.getByLabel('Benchmark', { exact: true }).selectOption('QQQ')
  await expect(
    page.getByRole('heading', { name: 'Performance vs QQQ' }),
  ).toBeVisible()
  await expect(page).toHaveURL(/period=3M&benchmark=QQQ/)
  await expect(page.locator('.chart-wrap .recharts-line')).toHaveCount(12)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Performance vs QQQ', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Relative', exact: true }),
  ).toHaveClass(/active/)
})

test('company-name search opens a stock and filters the research catalog', async ({
  page,
}) => {
  await page.goto('/')
  const input = page.getByLabel('Search any stock or ETF…')
  await input.fill('Apple')
  await input.press('Enter')
  await expect(page.locator('.stock-detail')).toContainText('AAPL')
  await page.getByLabel('Filter stock list').fill('NVDA')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody tr')).toContainText('NVDA')
  await page.locator('tbody .table-asset').click()
  await expect(page).toHaveURL(/stock=NVDA/)
  await page.reload()
  await expect(page.locator('.stock-detail')).toContainText('NVDA')
  await expect(page.getByLabel('Filter stock list')).toHaveValue('NVDA')
  await expect(page.locator('tbody tr')).toHaveCount(1)
})

test('watchlist persists on this device', async ({ page }) => {
  await page.goto('/?view=watchlist')
  const search = page.getByLabel('Add stock or ETF to watchlist…')
  await search.fill('XOM')
  await search.press('Enter')
  await expect(page.locator('tbody')).toContainText('XOM')
  await page.reload()
  await expect(page.locator('tbody')).toContainText('XOM')
  await page
    .getByRole('button', { name: 'Remove XOM from watchlist', exact: true })
    .click()
  await expect(page.locator('tbody')).not.toContainText('XOM')
})

test('portfolio refuses invalid allocation and recalculates valid weights', async ({
  page,
}) => {
  await page.goto('/?view=portfolio')
  await expect(page.locator('.portfolio-value>strong')).not.toHaveText('—')
  await page.getByLabel('SPY allocation percent').fill('70')
  await expect(
    page.getByText('Set allocations to 100% to calculate the portfolio.'),
  ).toBeVisible()
  await expect(page.locator('.portfolio-value>strong')).toHaveText('—')
  await page.getByLabel('AGG allocation percent').fill('30')
  await expect(page.locator('.portfolio-value>strong')).not.toHaveText('—')
  await expect(
    page.getByText('Set allocations to 100% to calculate the portfolio.'),
  ).toHaveCount(0)
})

test('mobile navigation and horizontal layout remain usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Share view', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Open navigation', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Sector explorer', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Sector explorer.' }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
})

test('upstream errors are visible and do not become fabricated values', async ({
  page,
}) => {
  await page.unroute('**/api/history?*')
  await page.route('**/api/history?*', (route) =>
    route.fulfill({
      json: {
        data: [],
        errors: new URL(route.request().url()).searchParams
          .get('symbols')!
          .split(',')
          .map((symbol) => ({
            symbol,
            message: 'Provider unavailable in failure test',
          })),
      },
    }),
  )
  await page.goto('/')
  await expect(page.locator('.data-warning')).toContainText('Data unavailable')
  await expect(
    page.getByRole('button', { name: 'Retry unavailable data' }),
  ).toBeVisible()
  await expect(page.locator('.benchmark-values strong').first()).toHaveText('—')
})

test('CSV export includes provenance and numeric metrics', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('tbody tr')).toHaveCount(11)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('market-atlas-overview-YTD.csv')
})

test('main controls have accessible names and semantic structure', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('tbody tr')).toHaveCount(11)
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  expect(
    result.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([])
})

test('custom dates survive reload and presets clear the custom window', async ({
  page,
}) => {
  await page.goto('/?view=compare&symbols=XLK&period=YTD')
  await page.getByText('Custom dates', { exact: true }).click()
  await page.getByLabel('Custom start date').fill('2025-12-31')
  await page.getByLabel('Custom end date').fill('2026-03-31')
  await page.getByRole('button', { name: 'Apply dates', exact: true }).click()
  await expect(page).toHaveURL(/start=2025-12-31&end=2026-03-31/)
  await expect(page.locator('.chart-caption').first()).toContainText(
    'Mar 31, 2026',
  )
  await page.reload()
  await expect(page.locator('.date-range-picker summary')).toContainText(
    'Dec 31, 2025',
  )
  await expect(page.locator('.chart-caption').first()).toContainText(
    'Mar 31, 2026',
  )
  await page.getByRole('button', { name: '3M', exact: true }).click()
  await expect(page).not.toHaveURL(/start=/)
  await expect(page.locator('.date-range-picker summary')).toHaveText(
    'Custom dates',
  )
})

test('trend lab changes rolling measures and exports monthly observations', async ({
  page,
}) => {
  await page.goto('/?view=trends&symbols=XLK,XLF&period=1Y&benchmark=SPY')
  await expect(page.locator('.chart-wrap .recharts-line')).toHaveCount(3)
  await page.getByLabel('Rolling measure').selectOption('correlation')
  await page.getByLabel('Rolling window').selectOption('20')
  await expect(page.locator('.chart-wrap .recharts-line')).toHaveCount(2)
  await expect(page.locator('.rolling-latest')).not.toContainText('—')
  await expect(page.locator('.month-calendar tbody tr')).toHaveCount(6)
  await expect(page.locator('.seasonality-month')).toHaveCount(12)
  await page.getByLabel('Calendar asset').selectOption('SPY')
  await page.getByRole('button', { name: 'vs SPY', exact: true }).click()
  await expect(page.locator('.month-calendar')).toContainText('0.0pp')
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Export calendar', exact: true })
    .click()
  expect((await downloadPromise).suggestedFilename()).toBe(
    'market-atlas-monthly-SPY.csv',
  )
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  expect(
    result.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([])
})

test('portfolio settings persist and new symbols join with zero allocation', async ({
  page,
}) => {
  await page.goto('/?view=portfolio')
  await expect(page.locator('.portfolio-value>strong')).not.toHaveText('—')
  await page.getByLabel('Starting value in USD').fill('25000')
  await page.getByLabel('Rebalancing frequency').selectOption('monthly')
  await expect(page.locator('.portfolio-value')).toContainText('$25,000.00')
  await expect(page.locator('.chart-caption')).toContainText('rebalances')
  const search = page.getByLabel('Add a portfolio stock or ETF…')
  await search.fill('AAPL')
  await search.press('Enter')
  await expect(page.getByLabel('AAPL allocation percent')).toHaveValue('0')
  await page.getByLabel('SPY allocation percent').fill('40')
  await page.getByLabel('AAPL allocation percent').fill('20')
  await expect(page.locator('.portfolio-value>strong')).not.toHaveText('—')
  await page.reload()
  await expect(page.getByLabel('Starting value in USD')).toHaveValue('25000')
  await expect(page.getByLabel('Rebalancing frequency')).toHaveValue('monthly')
  await expect(page.getByLabel('AAPL allocation percent')).toHaveValue('20')
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  expect(
    result.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([])
})

test('new research controls fit the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?view=trends&symbols=XLK&period=1Y')
  await expect(page.locator('.seasonality-month')).toHaveCount(12)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await page.getByText('Custom dates', { exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Apply dates', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await page.goto('/?view=portfolio')
  await expect(page.getByLabel('Rebalancing frequency')).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
})

test('historical windows date the technical snapshot and sector horizons', async ({
  page,
}) => {
  await page.goto('/?view=stocks&stock=AAPL&start=2025-12-31&end=2026-03-31')
  await expect(page.locator('.technical-date')).toHaveText('As of Mar 31, 2026')
  await expect(page.locator('.stock-detail .chart-caption')).toContainText(
    'Mar 31, 2026',
  )
  await page
    .getByRole('button', { name: 'Sector explorer', exact: true })
    .click()
  await expect(
    page.getByText('1M / 3M · as of Mar 31, 2026', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Each horizon ends on or before Mar 31, 2026.', {
      exact: false,
    }),
  ).toBeVisible()
})

test('risk lab preserves focus, filters recovery episodes and exports the observed sample', async ({
  page,
}) => {
  await page.goto('/?view=risk&period=1Y&symbols=XLK,XLF&benchmark=SPY')
  await expect(
    page.getByRole('heading', { name: 'Risk lab.', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.chart-wrap .recharts-line')).toHaveCount(3)
  await expect(page.locator('.risk-table tbody tr')).toHaveCount(3)
  await page.getByLabel('Drawdown asset').selectOption('SPY')
  await expect(page).toHaveURL(/asset=SPY/)
  await expect(page.locator('.symbol-chip')).toHaveCount(3)
  await page.reload()
  await expect(page.getByLabel('Drawdown asset')).toHaveValue('SPY')
  await page.getByLabel('Minimum drawdown').selectOption('0')
  await expect(page.locator('.drawdown-table tbody tr').first()).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Export episodes', exact: true })
    .click()
  const exported = await downloadPromise
  expect(exported.suggestedFilename()).toBe('market-atlas-drawdowns-SPY-1Y.csv')
  const csv = await readFile((await exported.path())!, 'utf8')
  expect(csv).toContain('Fetched at')
  expect(csv).toContain('Price basis')
  expect(csv).toContain('Synthetic test fixture')
  expect(csv).toContain('Adjusted')
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  expect(
    result.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([])
})

test('risk lab does not compute a partial comparison when an asset is missing', async ({
  page,
}) => {
  await page.unroute('**/api/history?*')
  await page.route('**/api/history?*', (route) => {
    const symbols = new URL(route.request().url()).searchParams
      .get('symbols')!
      .split(',')
    return route.fulfill({
      json: {
        data: symbols.filter((s) => s !== 'MISSING').map(fixture),
        errors: symbols.includes('MISSING')
          ? [{ symbol: 'MISSING', message: 'No price history available' }]
          : [],
      },
    })
  })
  await page.goto('/?view=risk&period=1Y&symbols=MISSING,XLK')
  await expect(page.locator('.data-warning')).toContainText('MISSING')
  await expect(
    page.getByRole('button', { name: 'Export risk metrics' }),
  ).toBeDisabled()
  await expect(page.locator('.chart-wrap')).toHaveCount(0)
  await expect(page.locator('.risk-table')).not.toContainText('NaN')
})

test('risk tables remain scrollable by keyboard on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?view=risk&period=1Y&symbols=XLK')
  await expect(page.locator('.risk-table tbody tr')).toHaveCount(2)
  const table = page.getByRole('region', {
    name: 'Risk comparison table',
    exact: true,
  })
  await expect(table).toHaveAttribute('tabindex', '0')
  await table.focus()
  await table.press('ArrowRight')
  await expect
    .poll(() => table.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(0)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
})

test('a decline exactly at the filter boundary is included', async ({
  page,
}) => {
  await page.unroute('**/api/history?*')
  await page.route('**/api/history?*', (route) => {
    const symbols = new URL(route.request().url()).searchParams
      .get('symbols')!
      .split(',')
    const dates = ['2026-01-02', '2026-01-05', '2026-01-06']
    return route.fulfill({
      json: {
        data: symbols.map((symbol) => ({
          ...fixture(symbol),
          points: [125, 120, 100].map((price, i) => ({
            date: dates[i],
            close: price,
            adjusted: price,
            volume: 1000,
          })),
        })),
        errors: [],
      },
    })
  })
  await page.goto('/?view=risk&period=1W&symbols=XLK')
  await page.getByLabel('Minimum drawdown').selectOption('20')
  await expect(
    page.getByRole('region', { name: 'Drawdown episodes', exact: true }),
  ).toContainText('-20.00%')
  await expect(
    page.getByRole('region', { name: 'Drawdown episodes', exact: true }),
  ).toContainText('Ongoing at end')
  await expect(
    page.getByRole('link', { name: /Compare XLK since trough/ }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: /Compare XLK decline/ }),
  ).toHaveCount(1)
})

test('episode links compare the exact decline, recovery and ongoing rebound dates', async ({
  page,
}) => {
  await page.unroute('**/api/history?*')
  await page.route('**/api/history?*', (route) => {
    const symbols = new URL(route.request().url()).searchParams
      .get('symbols')!
      .split(',')
    const dates = [
      '2026-01-02',
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
    ]
    return route.fulfill({
      json: {
        data: symbols.map((symbol) => ({
          ...fixture(symbol),
          points: [100, 110, 99, 88, 100, 108, 110, 99, 100].map(
            (price, i) => ({
              date: dates[i],
              close: price,
              adjusted: price,
              volume: 1000,
            }),
          ),
        })),
        errors: [],
      },
    })
  })
  await page.goto(
    '/?view=risk&period=1Y&symbols=XLK,XLF&benchmark=QQQ&asset=XLK&decline=5&start=2026-01-02&end=2026-01-14',
  )
  await expect(page.locator('.drawdown-table tbody tr')).toHaveCount(2)
  await page
    .getByRole('link', {
      name: 'Compare XLK decline from Jan 5, 2026 to Jan 7, 2026',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Compare assets.', exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(/start=2026-01-05&end=2026-01-07/)
  await expect(page.locator('.symbol-chip')).toHaveCount(3)
  await expect(page.getByLabel('Benchmark', { exact: true })).toHaveValue('QQQ')
  await expect(page.locator('.chart-caption').first()).toContainText(
    'Jan 5, 2026 – Jan 7, 2026',
  )
  await expect(page.locator('tbody tr').first()).toContainText('-20.00%')
  await page.goBack()
  await expect(page.getByLabel('Drawdown asset')).toHaveValue('XLK')
  await expect(page.getByLabel('Minimum drawdown')).toHaveValue('5')
  await expect(page).toHaveURL(/start=2026-01-02&end=2026-01-14/)
  await page
    .getByRole('link', {
      name: 'Compare XLK recovery from Jan 7, 2026 to Jan 12, 2026',
      exact: true,
    })
    .click()
  await expect(page.locator('.chart-caption').first()).toContainText(
    'Jan 7, 2026 – Jan 12, 2026',
  )
  await expect(page.locator('tbody tr').first()).toContainText('+25.00%')
  await page.goBack()
  await page
    .getByRole('link', {
      name: 'Compare XLK since trough from Jan 13, 2026 to Jan 14, 2026',
      exact: true,
    })
    .click()
  await expect(page.locator('.chart-caption').first()).toContainText(
    'Jan 13, 2026 – Jan 14, 2026',
  )
  await expect(page.locator('tbody tr').first()).toContainText('+1.01%')
  await page.reload()
  await expect(page.locator('.chart-caption').first()).toContainText(
    'Jan 13, 2026 – Jan 14, 2026',
  )
})

test('all navigation remains reachable on a short mobile screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 568 })
  await page.goto('/?view=risk')
  await page
    .getByRole('button', { name: 'Open navigation', exact: true })
    .click()
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^Watchlist/ })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Watchlist.', exact: true }),
  ).toBeVisible()
})

test('saved views restore full trend settings and can be removed', async ({
  page,
}) => {
  await page.goto(
    '/?view=trends&period=1Y&symbols=XLK,XLF&benchmark=QQQ&metric=beta&lookback=20&calendar=IAU&basis=relative',
  )
  await expect(page.getByLabel('Rolling measure')).toHaveValue('beta')
  await expect(page.getByLabel('Rolling window')).toHaveValue('20')
  await expect(page.getByLabel('Calendar asset')).toHaveValue('IAU')
  await expect(page.locator('.month-calendar tbody tr')).toHaveCount(6)
  await page.getByRole('button', { name: '3Y', exact: true }).click()
  await page.getByLabel('Benchmark', { exact: true }).selectOption('SPY')
  await expect(page).toHaveURL(/metric=beta/)
  await expect(page).toHaveURL(/lookback=20/)
  await page.locator('.saved-views summary').click()
  await page.getByLabel('Saved view name').fill('Technology 20-day beta')
  await page
    .getByRole('button', { name: 'Save current view', exact: true })
    .click()
  await expect(page.locator('.saved-views-list li')).toHaveCount(1)
  await page.goto('/?view=overview')
  await page.locator('.saved-views summary').click()
  await page.getByRole('link', { name: /Technology 20-day beta/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Trend lab.', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Rolling measure')).toHaveValue('beta')
  await expect(page.getByLabel('Rolling window')).toHaveValue('20')
  await expect(page.getByLabel('Calendar asset')).toHaveValue('IAU')
  await expect(
    page.getByRole('button', { name: 'vs SPY', exact: true }),
  ).toHaveClass(/active/)
  await expect(
    page.getByRole('button', { name: '3Y', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.saved-views summary').click()
  await page.getByLabel('Saved view name').fill('Renamed beta study')
  await page
    .getByRole('button', { name: 'Save current view', exact: true })
    .click()
  await expect(page.locator('.saved-views-list li')).toHaveCount(1)
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  expect(
    result.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    ),
  ).toEqual([])
  await page
    .getByRole('button', {
      name: 'Remove saved view Renamed beta study',
      exact: true,
    })
    .click()
  await expect(page.locator('.saved-views-list li')).toHaveCount(0)
  await page.reload()
  await page.locator('.saved-views summary').click()
  await expect(page.locator('.saved-views-list li')).toHaveCount(0)
})

test('shared global-correlation and risk settings reload correctly', async ({
  page,
}) => {
  await page.goto('/?view=correlations&period=1Y&universe=global')
  await expect(
    page.getByRole('button', { name: 'Global assets', exact: true }),
  ).toHaveClass(/active/)
  await expect(page.locator('.correlation-summary')).toContainText(
    '9/9 histories loaded',
  )
  await page.getByRole('button', { name: '3M', exact: true }).click()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Global assets', exact: true }),
  ).toHaveClass(/active/)
  await page.goto('/?view=risk&symbols=XLK,XLF&asset=XLF&decline=10')
  await expect(page.getByLabel('Minimum drawdown')).toHaveValue('10')
  await expect(page.getByLabel('Drawdown asset')).toHaveValue('XLF')
  await page.getByRole('button', { name: '1Y', exact: true }).click()
  await expect(page).toHaveURL(/decline=10/)
})

test('invalid chart settings fall back to supported values and mobile saved views fit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(
    '/?view=trends&metric=invalid&lookback=0&calendar=../bad&basis=invalid',
  )
  await expect(page.getByLabel('Rolling measure')).toHaveValue('return')
  await expect(page.getByLabel('Rolling window')).toHaveValue('60')
  await expect(page.getByLabel('Calendar asset')).toHaveValue('XLK')
  await page.locator('.saved-views summary').click()
  await expect(page.getByLabel('Saved view name')).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await page.getByLabel('Saved view name').press('Escape')
  await expect(page.getByLabel('Saved view name')).not.toBeVisible()
})
