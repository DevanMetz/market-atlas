import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { History } from '../src/lib/types'

// Deterministic synthetic observations for UI regression tests only.
// This file is never imported by the application or deployed Worker.
function fixture(symbol:string):History{
  const points=[];let price=100;const seed=[...symbol].reduce((n,c)=>n+c.charCodeAt(0),0)
  for(let date=new Date('2021-09-01T12:00:00Z'),i=0;date<=new Date('2026-09-28T12:00:00Z');date.setUTCDate(date.getUTCDate()+1),i++){
    if([0,6].includes(date.getUTCDay()))continue
    price*=1+.0002+(seed%10)/10000+Math.sin(i*.43+seed)*.006
    points.push({date:date.toISOString().slice(0,10),close:price,adjusted:price,volume:1000000+i})
  }
  return {symbol,name:`${symbol} · test fixture`,currency:'USD',exchange:'Test exchange',points,price,fetchedAt:'2026-09-29T12:00:00Z',marketTime:'2026-09-28T20:00:00Z',source:'Synthetic test fixture',adjusted:true}
}
test.beforeEach(async({page})=>{
  await page.route('**/api/history?*',async route=>{
    const symbols=new URL(route.request().url()).searchParams.get('symbols')!.split(',')
    await route.fulfill({json:{data:symbols.map(fixture),errors:[]}})
  })
  await page.route('**/api/search?*',route=>route.fulfill({json:{matches:[]}}))
})

test('overview renders all sectors and charts with no console errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading',{name:'Market overview.'})).toBeVisible()
  await expect(page.locator('.sector-heatmap .heat-tile')).toHaveCount(11)
  await expect(page.locator('.chart-wrap .recharts-line')).toHaveCount(4)
  await expect(page.locator('tbody tr')).toHaveCount(11)
  await expect(page.locator('.data-warning')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('comparison presets, periods, chart modes and benchmarks are functional',async({page})=>{
  await page.goto('/?view=compare&period=YTD&symbols=XLK&benchmark=SPY')
  await page.getByRole('button',{name:'All sectors',exact:true}).click()
  await expect(page.locator('.symbol-chip')).toHaveCount(12)
  await page.getByRole('button',{name:'3M',exact:true}).click()
  await page.getByRole('button',{name:'Relative',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Performance vs SPY'})).toBeVisible()
  await page.getByLabel('Benchmark',{exact:true}).selectOption('QQQ')
  await expect(page.getByRole('heading',{name:'Performance vs QQQ'})).toBeVisible()
  await expect(page).toHaveURL(/period=3M&benchmark=QQQ/)
  await expect(page.locator('.chart-wrap .recharts-line')).toHaveCount(12)
})

test('company-name search opens a stock and filters the research catalog',async({page})=>{
  await page.goto('/')
  const input=page.getByLabel('Search any stock or ETF…')
  await input.fill('Apple');await input.press('Enter')
  await expect(page.locator('.stock-detail')).toContainText('AAPL')
  await page.getByLabel('Filter stock list').fill('NVDA')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody tr')).toContainText('NVDA')
})

test('watchlist persists on this device',async({page})=>{
  await page.goto('/?view=watchlist')
  const search=page.getByLabel('Add stock or ETF to watchlist…')
  await search.fill('XOM');await search.press('Enter')
  await expect(page.locator('tbody')).toContainText('XOM')
  await page.reload()
  await expect(page.locator('tbody')).toContainText('XOM')
  await page.getByRole('button',{name:'Remove XOM from watchlist',exact:true}).click()
  await expect(page.locator('tbody')).not.toContainText('XOM')
})

test('portfolio refuses invalid allocation and recalculates valid weights',async({page})=>{
  await page.goto('/?view=portfolio')
  await expect(page.locator('.portfolio-value>strong')).not.toHaveText('—')
  await page.getByLabel('SPY allocation percent').fill('70')
  await expect(page.getByText('Set allocations to 100% to calculate the portfolio.')).toBeVisible()
  await expect(page.locator('.portfolio-value>strong')).toHaveText('—')
  await page.getByLabel('AGG allocation percent').fill('30')
  await expect(page.locator('.portfolio-value>strong')).not.toHaveText('—')
  await expect(page.getByText('Set allocations to 100% to calculate the portfolio.')).toHaveCount(0)
})

test('mobile navigation and horizontal layout remain usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/')
  await expect(page.getByRole('button',{name:'Share view',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Open navigation',exact:true}).click()
  await page.getByRole('button',{name:'Sector explorer',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Sector explorer.'})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})

test('upstream errors are visible and do not become fabricated values',async({page})=>{
  await page.unroute('**/api/history?*')
  await page.route('**/api/history?*',route=>route.fulfill({json:{data:[],errors:new URL(route.request().url()).searchParams.get('symbols')!.split(',').map(symbol=>({symbol,message:'Provider unavailable in failure test'}))}}))
  await page.goto('/')
  await expect(page.locator('.data-warning')).toContainText('Data unavailable')
  await expect(page.getByRole('button',{name:'Retry unavailable data'})).toBeVisible()
  await expect(page.locator('.benchmark-values strong').first()).toHaveText('—')
})

test('CSV export includes provenance and numeric metrics',async({page})=>{
  await page.goto('/')
  await expect(page.locator('tbody tr')).toHaveCount(11)
  const downloadPromise=page.waitForEvent('download')
  await page.getByRole('button',{name:'Export CSV',exact:true}).click()
  const download=await downloadPromise
  expect(download.suggestedFilename()).toBe('market-atlas-overview-YTD.csv')
})

test('main controls have accessible names and semantic structure',async({page})=>{
  await page.goto('/')
  await expect(page.locator('tbody tr')).toHaveCount(11)
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).disableRules(['color-contrast']).analyze()
  expect(result.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([])
})
