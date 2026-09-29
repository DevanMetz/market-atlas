# Market Atlas

A public, responsive market-research workspace built with React, TypeScript, Recharts and Cloudflare Workers.

## Explore

- **Market overview:** five benchmark ETF quotes, cumulative/relative/drawdown charts, all 11 U.S. sector ETFs, and sector leaders.
- **Sector explorer:** absolute and benchmark-relative heatmaps, 1-week through 5-year return tables, and a 1-month/3-month relative momentum scatter plot.
- **Compare assets:** up to 12 stocks, sectors or global assets plus a benchmark; return, excess return, drawdown and hypothetical $10,000 growth; shareable view URLs.
- **Stock screener:** 54 selected U.S. large-cap stocks, sector/technical filters, sortable metrics, individual research and provider-backed symbol search beyond the catalog.
- **Correlations:** pairwise daily-return matrices for sectors, global assets and your comparison; click a pair to investigate.
- **Portfolio lab:** USD-only, fixed initial weight, buy-and-hold simulations, volatility, maximum drawdown, return contributions and daily-return distributions.
- **Watchlist:** device-local saved tickers, plus CSV exports and documented calculations.

## Develop

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run build
npm run dev:api
```

In a second terminal, run `npm run dev` and open `http://127.0.0.1:5173`. Vite proxies `/api` to the local Worker at `http://127.0.0.1:8795`. The Worker requires outbound HTTPS access for market data. `npm run preview` serves the production build through Wrangler.

```sh
npm test
npm run build
npx playwright test
```

The browser suite uses a locally installed Chrome by default. Set `PLAYWRIGHT_CHANNEL` if another Playwright browser channel is needed. Start `npm run preview` before running it. Browser tests use deterministic, clearly identified test-only fixtures for reproducibility; production has no mock market data. Live endpoint validation is a separate deployment check.

## Deploy to Cloudflare

```sh
npx wrangler login
npm run deploy
```

`wrangler.jsonc` deploys one Worker and its Vite-built static assets. The public `workers.dev` URL is printed by Wrangler. No database, paid market API key, brokerage integration or application authentication is required for this default research configuration. Watchlists and portfolio allocations stay in the visitor's browser.

An included GitHub Actions workflow runs build and calculation/browser checks on pull requests and pushes. A separate manual deploy workflow requires the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; no credentials are included in this repository. The token needs permission to deploy Workers in the target account.

## Data contract and limits

`GET /api/history?symbols=SPY,XLK` returns normalized daily price observations for up to 12 validated tickers. `GET /api/search?q=apple` resolves supported symbols. `GET /api/health` reports service health (not upstream market-data availability).

- Source: Yahoo Finance public **unofficial** chart and search endpoints. There is no guaranteed service level. The endpoint can throttle, change or stop responding. This is a research feed, not an execution-quality real-time feed.
- Up to five years of daily history. Latest daily bars can be in progress. The UI shows the observation date, provider attribution, adjustment warnings and stale states. Latest quote and daily-close timestamps can differ.
- Successful histories are cached per symbol at the Cloudflare edge. Fresh for 15 minutes; stale fallback retained up to seven days if refresh fails. Results with errors or stale data are not response-cached. Batches use bounded concurrency; the API has per-IP rate limiting.
- Returns use adjusted closing prices where the whole series supports them. If adjustment is incomplete, the whole series uses closes and displays a warning; adjusted and unadjusted observations are not silently mixed within one series.
- Period starts use the preceding trading observation. Chart series intersect dates; pairwise risk measures intersect pair dates. Short histories are unavailable for longer requested periods. No missing prices are fabricated or forward-filled.
- Risk: sample daily-return standard deviation × √252; within-window peak-to-trough maximum drawdown; paired covariance/variance beta; Pearson correlation. RSI uses Wilder's 14-session smoothing. Moving averages and 252-session ranges use adjusted closes.
- ETF proxies differ from index levels. Cross-currency comparisons show local-currency returns, with no FX conversion. Portfolios require USD assets and exclude taxes, commissions, rebalancing and cash flows.
- The screener catalog is curated, not all listed stocks. Sector mappings need periodic review. No fundamentals, earnings, analyst estimates, news, options, brokerage actions or intraday streaming are claimed.

### Data rights

The MIT license covers this project's code, **not third-party market data**. Data use remains subject to Yahoo and upstream exchange/provider terms. Public endpoint access is not a redistribution license. For commercial or contractual public distribution, obtain a suitably licensed market-data feed and adapt `worker/index.ts` while preserving the normalized `History` contract. No data subscription is purchased or represented as licensed by this project.

Provider context: [exchange delays](https://help.yahoo.com/kb/SLN2310.html), [Yahoo terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html), [sector ETF definitions](https://www.ssga.com/us/en/individual/capabilities/equities/sector-investing/select-sector-etfs).

## Privacy and security

No tracking SDKs, advertising, account database or user financial data are required. Watchlists and allocations are stored in localStorage. The Worker validates symbols and batch sizes, only calls fixed provider hosts, enforces request methods, bounds upstream timeouts and concurrency, and adds standard response headers. Only the intended `dist/` assets are public; repository and environment files are excluded. Operational Cloudflare logs may include request metadata.

Research and education only. Not personalized investment advice. Historical results do not guarantee future performance.

## License

MIT. See [LICENSE](LICENSE).
