# Worked flows

Every request below also carries `-H "User-Agent: shingou-claude-skill/0.1.0"` (omitted here
for brevity — see SKILL.md, it is required).

## 1 · "What's the sentiment on BTC and SOL right now?"

One batched call, never one call per symbol:

```bash
curl "https://api.shingou.io/v1/sentiment?symbols=BTC-USD,SOL-USD" \
  -H "Authorization: Bearer $SHINGOU_API_KEY"
```

Read it in this order: `direction` + `score` (the headline), `confidence` (how much to trust
it), `summary` (the why), `top_sources` (cite these — title + link — when the user wants
receipts). Both symbols are free-tier live, so `timestamp` should be within the last hour;
still check it and mention the as-of time.

## 2 · Kill-switch check before a trade

```bash
curl "https://api.shingou.io/v1/events?symbol=SOL-USD&limit=20" \
  -H "Authorization: Bearer $SHINGOU_API_KEY"
```

Scan `events[]` for `event_type` in {`hack_exploit`, `regulation`, `delisting`} with
`occurred_at` inside the last 24h. Any hit → the reference integrations stand aside; report
the event headline and its source link, not just "risk detected".

## 3 · Honest backtest join

```bash
curl "https://api.shingou.io/v1/history/sentiment?symbol=ETH-USD&from=2026-06-04T00:00:00Z&to=2026-07-04T00:00:00Z&interval=1h" \
  -H "Authorization: Bearer $SHINGOU_API_KEY"
```

- `bucket` is the **as-of** time: when joining to candles, use the signal for decisions strictly
  *after* the bucket time — that is the no-lookahead contract.
- Check the echoed `from`/`to`: the server clamps to your plan window (7d free / 90d starter /
  730d pro) and to 90 days per request. If you got less than you asked for, say so.
- Split results by `reconstructed`: `true` buckets are archival reconstruction, a research
  artifact — report metrics on live-collected buckets separately, or at minimum disclose the mix.
- Frame any result as the signal **filtering or sizing a base strategy, not generating entries**.

## 4 · Delayed-symbol disclosure (free tier)

`DOGE-USD` is not in the free live set, so on a free key:

```bash
curl "https://api.shingou.io/v1/sentiment?symbols=DOGE-USD" \
  -H "Authorization: Bearer $SHINGOU_API_KEY"
```

The `timestamp` will be ~24h old. The required framing: "DOGE-USD sentiment as of
&lt;timestamp&gt; (24h-delayed on the free tier — paid plans are live): …". Never present it as
the current state of the market.

## 5 · Python client pattern

```python
import os
import time
import requests

BASE = os.environ.get("SHINGOU_API_BASE", "https://api.shingou.io/v1")
HEADERS = {
    "Authorization": f"Bearer {os.environ['SHINGOU_API_KEY']}",
    "User-Agent": "shingou-claude-skill/0.1.0",
}

def get(path: str, params: dict) -> dict:
    r = requests.get(f"{BASE}{path}", params=params, headers=HEADERS, timeout=10)
    if r.status_code == 429:
        code = r.json().get("error", {}).get("code")
        if code == "plan_limit":
            raise RuntimeError("Daily plan cap reached — stop for today.")
        time.sleep(60)  # rate_limited: one retry after the burst window
        r = requests.get(f"{BASE}{path}", params=params, headers=HEADERS, timeout=10)
    r.raise_for_status()
    return r.json()

signals = get("/sentiment", {"symbols": "BTC-USD,ETH-USD"})["data"]
```

Cache results per hour bucket — the signal does not change between buckets, so re-fetching
faster than hourly only burns quota.
