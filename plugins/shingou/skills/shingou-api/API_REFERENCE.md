# Shingou API reference

> Snapshot as of 2026-08. Canonical live reference: [shingou.io/llms-full.txt](https://shingou.io/llms-full.txt)
> — prefer it if anything here looks stale.

Base URL `https://api.shingou.io/v1`. Auth on every `/v1` endpoint:
`Authorization: Bearer <key>` or `x-api-key: <key>`. All timestamps ISO 8601.
All requests from this skill must send `User-Agent: shingou-claude-skill/0.1.0`.

## GET /v1/sentiment

Latest market-impact signal for one or more symbols.

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `symbols` | string, comma-separated, 1–50 | yes | Uppercased server-side. |

Response: `{ "data": [ <signal>, ... ] }` — one entry per requested symbol.

| Field | Type | Meaning |
| --- | --- | --- |
| `symbol` | string | The requested asset, e.g. `BTC-USD`. |
| `timestamp` | ISO 8601 | As-of time of the signal. **Compare to now; disclose if ~24h old.** |
| `direction` | enum | `bullish` / `bearish` / `neutral`. Don't re-derive from score client-side. |
| `score` | number [-1,1] | Normalized market-impact. Plot it like any indicator. |
| `confidence` | number [0,1] | Blends news volume, cross-source agreement and relevance. |
| `news_volume` | integer | Distinct stories behind the signal. |
| `novelty_score` | number [0,1] | How fresh the underlying coverage is (dedup-aware). |
| `dominant_events` | enum[] | Up to 3 event types driving the signal. |
| `summary` | string | Plain-language reason for the score. |
| `top_sources` | object[] | Source references (below). Teaser + link only, never full text. |

`top_sources[]`: `title`, `source` (publisher domain), `url`, `published_at`,
`relevance` [0,1], `sentiment` [-1,1].

## GET /v1/history/sentiment

Point-in-time series for backtesting. Bucket start = as-of time; **no lookahead**.

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `symbol` | string | yes | Single symbol. |
| `from` | ISO 8601 | yes | Clamped to your plan's history window and to your plan's per-request span (see Plans). |
| `to` | ISO 8601 | yes | On delayed plans, capped at the freshness delay for non-live symbols. |
| `interval` | enum | no (default `1h`) | `1m` `5m` `15m` `1h` `4h` `1d`. |

Response envelope: `{ symbol, interval, from, to, points[] }` — **`from`/`to` echo the range
actually served after clamping**; check them instead of assuming you got what you asked for.

`points[]`: `bucket` (ISO 8601, as-of), `score` [-1,1], `confidence` [0,1], `direction`,
`news_volume`, `novelty_score` [0,1], `reconstructed` (boolean — `true` = rebuilt from archival
news by the backfill, `false` = live-collected; disclose reconstructed buckets in backtests).

## GET /v1/events

Recent classified market events for a symbol.

| Param | Type | Required | Notes |
| --- | --- | --- | --- |
| `symbol` | string | yes | Single symbol. |
| `limit` | integer 1–100 | no (default 20) | Max events returned. |

Response envelope: `{ symbol, events[] }`.

`events[]`: `id`, `symbol`, `event_type` (taxonomy below), `headline`, `summary`,
`impact` (`bullish`/`bearish`/`neutral`), `confidence` [0,1], `occurred_at`, `sources[]`
(same shape as `top_sources`).

## GET /health

Origin-level (`https://api.shingou.io/health`), no auth. `{ "status": "ok" }` when up.

## Event taxonomy (14 types)

`listing`, `delisting`, `hack_exploit`, `regulation`, `partnership`, `funding`,
`network_upgrade`, `tokenomics`, `whale_movement`, `product_launch`, `legal`, `macro`,
`market_structure`, `other`.

Kill-switch trio used by the reference integrations: `hack_exploit`, `regulation`, `delisting`.

## Plans

| Plan | Price | Requests/day | Burst/min | History window | Per request | Freshness |
| --- | --- | --- | --- | --- | --- | --- |
| free | $0 | 1,000 | 30 | 1 day | 90 days | Live on BTC-USD/ETH-USD/SOL-USD; everything else 24h-delayed |
| starter | $24/mo | 50,000 | 120 | 90 days | 90 days | Live, full universe |
| quant | $79/mo | 50,000 | 120 | 365 days | 365 days | Live, full universe |
| pro | $249/mo | 500,000 | 600 | 730 days | 730 days | Live, full universe |

`History window` is how far back the plan may reach. `Per request` is how much of it one call
may span, so page longer ranges. Free gives one day on purpose: enough for the endpoint to
return a real series, not enough to backtest on. **History is a clamp, not a promise of data** —
the corpus began 2026-04-06, and reaching past it returns an empty range, never an error.

Free tier is licensed for personal/evaluation/non-commercial use; paid tiers include commercial
use ([shingou.io/terms](https://shingou.io/terms)).

## Errors

One envelope everywhere: `{"error": {"code": "...", "message": "..."}}`.

| HTTP | code | When |
| --- | --- | --- |
| 400 | `invalid_request` | Missing or invalid query parameters. |
| 401 | `unauthorized` | Missing, unknown, or revoked API key. |
| 404 | `not_found` | Unknown route. |
| 429 | `rate_limited` | Per-minute burst limit exceeded. Slow down. |
| 429 | `plan_limit` | Daily request cap for the plan reached. |
| 500 | `internal` | Unexpected server error. |
