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

### Headline search

Use ordinary words to require every term, double quotes for a contiguous phrase, uppercase `OR` for alternatives, and a leading minus or `NOT` to exclude. Parentheses group alternatives; exclusions and `AND` (including spaces) bind before `OR`. For example:

- `"profit warning"` finds that phrase.
- `(ticker:NVDA OR ticker:AAPL) earnings -title:layoffs` compares detected company mentions while excluding titles mentioning layoffs.
- `source:CNBC title:stocks` selects a publisher and searches the displayed title.
- `topic:Energy -title:oil` selects a topic while excluding a title term.

Search is case-insensitive. Text fields match fragments, and phrases cannot span different fields or publisher names. `source:` matches any publisher name or ID retained in a grouped headline; `title:` uses the displayed title; `topic:` uses the assigned keyword tags. `ticker:` requires an exact detected ticker, accepting a leading dollar sign and BRK.A/BRK.B share-class notation. Company detection remains incomplete. Queries search the retrieved snapshot, not full articles or an archive, and intersect the other news filters.

Queries support up to 400 characters, 80 terms/operators and 16 nested group or exclusion levels. Invalid syntax shows a correction message and hides results, charts and exports until corrected. The UI provides keyboard-accessible examples and a clear-search action. The exact query persists in shared links and saved views; headline CSVs include it, the research URL and the export timestamp. Sentiment exports follow the same filtered sample and include the research URL. Search documents are indexed when headlines change and queries compile once per edit; no regular expression or executable code is built from user input.

### Compare headline searches

In **Sentiment lab → Compare searches**, give two to four lines distinct names and their own headline queries. Compare companies, publishers, phrases or themes using the same search syntax. An empty query provides a baseline containing every headline remaining after the common filters. The publication window, main search, company focus, topic, publisher and tone filters above the chart apply to every line.

Each hourly or daily UTC point is the mean score of scored headline groups matching that line. Groups can overlap across searches, while duplicate publisher copies count once within each search. The editor shows dated matches and scored counts for each line; tooltips and the data table expose per-bucket sample size and coverage. No matched titles and matched titles with no scoring cue both have an unknown score, with different counts. The entire headline is scored; a company query does not turn it into company-specific sentiment. This remains a retrieved snapshot, not an archive or a return forecast.

Names, queries, chart mode and interval persist in shared links and saved views. Names can be up to 32 characters and queries up to 400 characters. Invalid queries, blank or duplicate names, and malformed shared settings show a correction message and prevent partial charts or exports. Search-trend CSVs include the line name and exact query, all observed buckets, tone counts, scoring coverage, the research URL and feed retrieval timestamps. Saved research URLs support up to 24,000 characters, with a visible error before an oversized view can be saved.

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

Research views load on demand. Reading headlines or browsing the source directory does not download the chart library or fetch price history; opening Sentiment Lab loads its chart separately. The small SVG benchmark sparklines do not depend on Recharts. Loading and error boundaries keep navigation available during a delayed or failed page download, and reloading retries with the current assets. Browser tests verify these requests, preserved URL filters and recovery flows against the production build, using Vite's build manifest. The feed API imports only the source catalog, avoiding initialization of the client sentiment and company-matching rules.

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

News charts summarize the currently retrieved and filtered snapshot, **not a stored historical archive**. Missing publication times stay unknown; future-dated items beyond a 15-minute tolerance are treated as undated. UTC hours or dates with no retrieved items are not filled with zeros. Exact URLs and normalized titles on the same UTC date are grouped, retaining each publisher link; different wording may still refer to the same event. Topic and ticker tagging use limited rules and can be incomplete. CSVs include provenance and retrieval timestamps.

The sentiment timeline supports hourly and daily UTC buckets. Auto selects hourly for the last 24 hours and daily for longer windows; the time axis preserves elapsed time and boundary buckets may be partial. Compare up to four topic averages on the same −100 to +100 scale, with distinct line patterns and per-bucket scored/total counts. Topics may overlap. Missing topic coverage and observed titles without a scoring cue both have an unknown average, but retain their different sample counts. All news filters apply to comparisons. An accessible data table shows the last 24 observed buckets; CSV exports include the complete filtered sample, interval, counts, coverage, tone breakdown, research URL, export time and feed retrieval times. Chart interval, comparison mode and selected topics persist in shared links and saved views.

Company focus filters headlines, sentiment charts and exports to any of up to 100 selected tickers. Add companies through the symbol picker or use a snapshot of the device's watchlist; shared links carry the actual tickers rather than depending on the recipient's watchlist. Name matching covers the curated stock catalog plus Boeing and Coinbase, with common name variants; explicit cashtags and supported exchange notation can identify other tickers. Bare known tickers require a following financial word such as "shares" or "earnings". Matches expose their evidence in headline details and CSVs. These are fallible entity-matching rules, not full-text company coverage, and the score still describes the entire headline rather than a specific company's prospects. Stock detail and watchlist pages link directly to matching headlines. Native links back to stock charts preserve the benchmark and research dates, and browser Back restores the news filters.

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
