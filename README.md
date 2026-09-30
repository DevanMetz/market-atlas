# Market Atlas

A public, responsive market-research workspace built with React, TypeScript, Recharts and Cloudflare Workers.

**Live website: [market-atlas.metzdevan.workers.dev](https://market-atlas.metzdevan.workers.dev)**

## Explore

- **Market overview:** five benchmark ETF quotes, cumulative/relative/drawdown charts, all 11 U.S. sector ETFs, and sector leaders.
- **Sector explorer:** absolute and benchmark-relative heatmaps, 1-week through 5-year return tables, and a 1-month/3-month relative momentum scatter plot.
- **Compare assets:** up to 12 stocks, sectors or global assets plus a benchmark; return, excess return, drawdown and hypothetical $10,000 growth; shareable view URLs.
- **Stock screener:** 54 selected U.S. large-cap stocks, sector/technical filters, sortable metrics, individual research and provider-backed symbol search beyond the catalog.
- **Trend lab:** 20/60/120/252-observation rolling returns, volatility, correlation and beta; monthly absolute/excess return calendars; descriptive seasonal averages; CSV exports.
- **Risk lab:** drawdown comparisons on shared dates, completed and ongoing recovery episodes, annualized returns, weak daily-return observations, episode filters and CSV exports with source metadata. Open a decline, recovery or ongoing rebound directly as a comparison of your selected assets over its observed dates. The focused asset is preserved in shared URLs.
- **News & sentiment:** a searchable directory of 132 publishers and institutions with 55 checked RSS/Atom feeds; searchable, deduplicated headlines; topic, publisher, time and sentiment filters; company/ticker mentions; sentiment and volume timelines; publisher comparisons; an inspectable headline-scoring sandbox; headline, sentiment and source-directory CSV exports. Feed selection and filters are shareable and can be saved as named views.
- **Correlations:** pairwise daily-return matrices for sectors, global assets and your comparison; click a pair to investigate.
- **Portfolio lab:** USD-only simulations with custom starting capital, buy and hold or monthly/quarterly/yearly rebalancing, final allocations, additive profit contributions, volatility, maximum drawdown and daily-return distributions. Search for assets beyond the catalog; export simulations and contributions.
- **Watchlist:** device-local saved tickers, plus CSV exports and documented calculations.
- **Research windows:** preset horizons or custom start/end dates, preserved in shareable URLs. Historical technical indicators stop at the selected end date; current quote cards remain current.
- **Saved views:** up to 20 named research views stored on this device. Links preserve chart modes, rolling measures and windows, calendar assets, absolute/excess basis, drawdown filters, correlation universes, stock filters and table sorting. Portfolio settings and watchlists remain separate device settings; neither is included in shared URLs.

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

`GET /api/news?sources=bbc,cnbc` retrieves up to six allowlisted publisher feeds. The UI loads selected sources sequentially in small batches; the Worker limits each batch to two concurrent upstream fetches. Feed responses are limited to 2 MB and 80 entries, with nine-second upstream timeouts. RSS/Atom is reduced to headline, original URL, publisher ID and publication time. No full articles, images or paywalled text are scraped. Redirects are rejected at runtime; feed addresses are reviewed in the catalog. Cache freshness is 15 minutes with a visibly marked fallback up to 24 hours. Feed failures are reported individually.

The directory includes journalism, investment commentary, sector publications, international business coverage, official releases and press-release services. A directory listing is not a statement of endorsement, editorial independence, syndication permission or guaranteed availability. Website-only listings are not aggregated. Some known feeds are disabled after unsuccessful checks; publishers with explicitly restrictive aggregation terms are linked directly. Publisher content and linked articles remain subject to their terms. Check endpoints sequentially with `node scripts/check-news-feeds.mjs /path/to/audit.json`.

Headline sentiment is an original, transparent **English lexicon heuristic**, not an AI forecast or a trained finance model. Phrase weights range from −3 to +3; longer phrases take precedence and nearby negation can reverse a cue. Score is `100 × sum(weights) / (sum(abs(weights)) + 3)`. Positive and negative cues together are labeled mixed. No recognized cues produce an unknown score, excluded from means. These scores describe word choice, not economic impact, truth, an asset-specific outlook or likely returns. The UI exposes matched words, scoring coverage and sample sizes, including an example of why rising oil and rising unemployment can receive the same language score.

News charts summarize the currently retrieved and filtered snapshot, **not a stored historical archive**. Missing publication times stay unknown; future-dated items beyond a 15-minute tolerance are treated as undated. UTC dates with no retrieved items are not filled with zeros. Exact URLs and normalized titles on the same UTC date are grouped, retaining each publisher link; different wording may still refer to the same event. Topic and ticker tagging use limited rules and can be incomplete. CSVs include provenance and retrieval timestamps.

- Source: Yahoo Finance public **unofficial** chart and search endpoints. There is no guaranteed service level. The endpoint can throttle, change or stop responding. This is a research feed, not an execution-quality real-time feed.
- Up to five years of daily history. Latest daily bars can be in progress. The UI shows the observation date, provider attribution, adjustment warnings and stale states. Latest quote and daily-close timestamps can differ.
- Successful histories are cached per symbol at the Cloudflare edge. Fresh for 15 minutes; stale fallback retained up to seven days if refresh fails. Results with errors or stale data are not response-cached. Batches use bounded concurrency; the API has per-IP rate limiting.
- Returns use adjusted closing prices where the whole series supports them. If adjustment is incomplete, the whole series uses closes and displays a warning; adjusted and unadjusted observations are not silently mixed within one series.
- Period starts use the preceding trading observation. Chart series intersect dates; pairwise risk measures intersect pair dates. Short histories are unavailable for longer requested periods. No missing prices are fabricated or forward-filled.
- Risk: sample daily-return standard deviation × √252; within-window peak-to-trough maximum drawdown; paired covariance/variance beta; Pearson correlation. RSI uses Wilder's 14-session smoothing. Moving averages and 252-session ranges use adjusted closes.
- ETF proxies differ from index levels. Cross-currency comparisons show local-currency returns, with no FX conversion. Unknown currency and missing volume remain unknown, not silently replaced with USD or zero.
- Portfolio rebalancing occurs after the first shared closing observation of each new calendar interval, with no use of future prices. Contributions accumulate each asset's investment profit, excluding allocation transfers, and divide by starting capital. Portfolios require known USD assets and exclude taxes, commissions, cash flows and execution costs; fractional positions are allowed.
- Rolling measures use only trailing shared observations, including warm-up history before the displayed dates. Monthly returns require the preceding month's close; current/truncated months are marked partial. Seasonal averages exclude partial months and describe a small historical sample, not a forecast. Calendars use the full available five-year history.
- Risk Lab resets each running peak at the selected window's first shared observation. Episodes end when adjusted close regains that peak; unfinished recoveries stay unknown. Calendar duration and observed trading intervals are shown separately. Annualized return requires at least 365 calendar days and uses 365.25 days per year. The 5th percentile uses linear interpolation; the weakest 5% average uses the lowest `ceil(0.05 × N)` daily returns. Both tail measures require at least 60 returns and are descriptive, not future loss limits.
- The screener catalog is curated, not all listed stocks. Sector mappings need periodic review. News headlines may discuss earnings or analyst estimates, but the application does not provide structured fundamentals, earnings estimates, options data, brokerage actions or intraday streaming.

### Data rights

The MIT license covers this project's code, **not third-party market data**. Data use remains subject to Yahoo and upstream exchange/provider terms. Public endpoint access is not a redistribution license. For commercial or contractual public distribution, obtain a suitably licensed market-data feed and adapt `worker/index.ts` while preserving the normalized `History` contract. No data subscription is purchased or represented as licensed by this project.

Provider context: [exchange delays](https://help.yahoo.com/kb/SLN2310.html), [Yahoo terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html), [sector ETF definitions](https://www.ssga.com/us/en/individual/capabilities/equities/sector-investing/select-sector-etfs).

## Privacy and security

No tracking SDKs, advertising, account database or user financial data are required. Watchlists, portfolio settings and named research views are stored in localStorage. The Worker validates symbols and batch sizes, only calls fixed provider hosts, enforces request methods, bounds upstream timeouts and concurrency, and adds standard response headers. Only the intended `dist/` assets are public; repository and environment files are excluded. Operational Cloudflare logs may include request metadata.

Research and education only. Not personalized investment advice. Historical results do not guarantee future performance.

## License

MIT. See [LICENSE](LICENSE).
