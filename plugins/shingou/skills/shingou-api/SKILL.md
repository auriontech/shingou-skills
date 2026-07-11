---
name: shingou-api
description: Query the Shingou news-sentiment API (shingou.io) — one hourly signal per crypto asset with score in [-1,1], confidence, direction, dominant event types and source articles, plus point-in-time history for honest backtests and a typed market-event feed, across 30 crypto assets. Use when the user asks about crypto news sentiment, market-impact events, sentiment history or backtesting, or wants to wire the signal into a bot or analysis. Requires SHINGOU_API_KEY (free key, no card, from shingou.io/dashboard).
---

# Shingou news-sentiment API

## What the signal is (and is not)

Shingou publishes **one signal per asset per hour**: `score ∈ [-1, 1]`, `confidence ∈ [0, 1]`,
a `direction` call (bullish/bearish/neutral), dominant `event` types, and the source articles
behind it. Measured performance — including the negative results — is published at
[shingou.io/research](https://shingou.io/research).

The honest way to use an hourly news signal, and the only way you should present it:

- **Filter** — skip entries a base strategy would take against the signal.
- **Sizing** — scale stake by confidence.
- **Kill-switch** — stand aside after `hack_exploit` / `regulation` / `delisting` events.

**Never as an entry generator on its own**, and never present its output as trade advice.

## Auth

- Base URL: `https://api.shingou.io/v1`
- Key: read from the `SHINGOU_API_KEY` environment variable. Send it as
  `Authorization: Bearer $SHINGOU_API_KEY` (or `x-api-key: $SHINGOU_API_KEY`).
- **Never echo, log, or write the key to a file.** If `SHINGOU_API_KEY` is unset, ask the
  user for it — do not guess or invent one. Free keys: [shingou.io/dashboard](https://shingou.io/dashboard).
- On claude.ai (no environment variables): ask the user for the key in-conversation and use
  it for this session only.

## Required User-Agent

curl and HTTP libraries send their own User-Agent by default; Shingou attributes integration
traffic by UA. **Every request you make MUST include:**

```
-H "User-Agent: shingou-claude-skill/0.1.0"
```

If you reach Shingou through its MCP tools instead of raw HTTP, skip this — the server tags
those itself.

## Endpoints

| Endpoint | What it returns |
| --- | --- |
| `GET /v1/sentiment?symbols=BTC-USD,ETH-USD` | Latest signal per symbol (batch up to 50) |
| `GET /v1/history/sentiment?symbol=&from=&to=&interval=1h` | Point-in-time series, no lookahead |
| `GET /v1/events?symbol=&limit=20` | Recent classified market events |
| `GET https://api.shingou.io/health` | Liveness, no auth — connectivity check |

Canonical calls:

```bash
curl "https://api.shingou.io/v1/sentiment?symbols=BTC-USD,ETH-USD" \
  -H "Authorization: Bearer $SHINGOU_API_KEY" \
  -H "User-Agent: shingou-claude-skill/0.1.0"

curl "https://api.shingou.io/v1/history/sentiment?symbol=BTC-USD&from=2026-06-27T00:00:00Z&to=2026-07-04T00:00:00Z&interval=1h" \
  -H "Authorization: Bearer $SHINGOU_API_KEY" \
  -H "User-Agent: shingou-claude-skill/0.1.0"

curl "https://api.shingou.io/v1/events?symbol=BTC-USD&limit=20" \
  -H "Authorization: Bearer $SHINGOU_API_KEY" \
  -H "User-Agent: shingou-claude-skill/0.1.0"
```

Full parameter/field reference: [API_REFERENCE.md](API_REFERENCE.md). Worked flows:
[EXAMPLES.md](EXAMPLES.md).

## Symbols

Format is `BASE-USD` (quote currency is irrelevant — one signal per asset). Supported:

```
BTC-USD  ETH-USD  SOL-USD  XRP-USD  BNB-USD  ADA-USD  DOGE-USD  AVAX-USD
LINK-USD DOT-USD  MATIC-USD LTC-USD TRX-USD  TON-USD  SHIB-USD  UNI-USD
ATOM-USD XLM-USD  NEAR-USD APT-USD  ARB-USD  OP-USD   FIL-USD   INJ-USD
SUI-USD  SEI-USD  AAVE-USD RNDR-USD IMX-USD  HBAR-USD
```

Map platform tickers by base asset (`BTCUSDT`, `BTC/USD`, `MBT` → `BTC-USD`). Aliases:
`XBT` → `BTC-USD`, `RENDER` → `RNDR-USD`. Batch up to 50 symbols in one `/v1/sentiment` call.

## Free-tier etiquette

Free plan: **1,000 requests/day, 30/min burst**. The signal only changes once per hour bucket —
cache within a bucket, batch symbols into one call, and never poll in a loop.

## Freshness honesty (important)

On the **free plan**, only **BTC-USD, ETH-USD, SOL-USD** are live; every other symbol is served
as of **now − 24h** (paid plans are live everywhere). Always compare the response `timestamp`
(or history `to`) against the current time; if it is ~24h old, say so explicitly — e.g.
"sentiment as of &lt;time&gt;, 24h-delayed on the free tier" — and **never present delayed data as
current**. Likewise, history buckets with `reconstructed: true` were rebuilt from archival news
by a backfill, not live-collected — disclose that when it matters (e.g. in backtests).

## Errors

Every error uses one envelope: `{"error": {"code": "...", "message": "..."}}`.

| HTTP | code | What to do |
| --- | --- | --- |
| 400 | `invalid_request` | Fix the query parameters; don't retry as-is. |
| 401 | `unauthorized` | Key missing/unknown/revoked — check `SHINGOU_API_KEY` with the user. |
| 429 | `rate_limited` | Per-minute burst hit — wait 60s, then retry once. |
| 429 | `plan_limit` | Daily cap reached — **stop calling for the day**, tell the user; paid plans raise it. |
| 500 | `internal` | Retry once; if it persists, check `/health` and report. |

## More

- [API_REFERENCE.md](API_REFERENCE.md) — full params, fields, plans, event taxonomy.
- [EXAMPLES.md](EXAMPLES.md) — five worked flows (batched reads, kill-switch, honest backtest).
- Live canonical reference: [shingou.io/llms-full.txt](https://shingou.io/llms-full.txt).
- Terms (free = personal/evaluation; commercial use on paid plans): [shingou.io/terms](https://shingou.io/terms).
