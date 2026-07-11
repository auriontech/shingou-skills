# Shingou skills

Plug the [Shingou](https://shingou.io) news-sentiment API into Claude or any AI agent —
a skill that teaches the agent to use the API correctly (auth, symbols, quotas, and honest
framing of an hourly signal), plus MCP tools for direct access. Works instantly with a
**free API key** ([shingou.io/dashboard](https://shingou.io/dashboard), no card) — the paid
key is what removes the 24h delay outside the live majors.

| Path | What it is |
| --- | --- |
| [`plugins/shingou/skills/shingou-api/`](plugins/shingou/skills/shingou-api/) | The skill: SKILL.md + full API reference + worked flows |
| MCP endpoint | `https://api.shingou.io/mcp` — the same API as callable tools |

## Install

### Claude Code (plugin)

```
/plugin marketplace add auriontech/shingou-skills
/plugin install shingou@shingou-skills
```

Then export your key so the agent can use it:

```bash
export SHINGOU_API_KEY=sk_live_...
```

### claude.ai (skill upload)

Zip the skill folder (folder at the zip root) and upload it under
Settings → Capabilities → Skills:

```bash
cd plugins/shingou/skills && zip -r shingou-api.zip shingou-api
```

There are no environment variables on claude.ai — the skill will ask you for the API key
in-conversation.

### Any other agent

Point your agent at
[`plugins/shingou/skills/shingou-api/SKILL.md`](plugins/shingou/skills/shingou-api/SKILL.md)
(plain markdown, no Claude-specific machinery), or at the live LLM-oriented reference:
[shingou.io/llms-full.txt](https://shingou.io/llms-full.txt).

## MCP

Connect the Shingou API as tools (`get_sentiment`, `get_sentiment_history`, `get_events`,
`list_symbols`) over Streamable HTTP:

```bash
claude mcp add --transport http shingou https://api.shingou.io/mcp \
  --header "x-api-key: sk_live_..."
```

Requests made through MCP are attributed server-side — no User-Agent handling needed.
claude.ai remote connectors (OAuth) are planned; for Claude Desktop use an
HTTP-to-stdio shim such as [`mcp-remote`](https://www.npmjs.com/package/mcp-remote).

## Quota math (free tier)

1,000 requests/day, 30/min burst. The signal changes **once per hour per asset**, and one
`/v1/sentiment` call batches up to 50 symbols — so even polling the full universe every hour
costs 24 requests a day. There is no reason to poll faster.

## What the signal is (and is not)

One signal per asset per hour: `score ∈ [-1, 1]`, `confidence ∈ [0, 1]`, a `direction` call,
dominant `event` types, and the source articles behind it. Measured performance — including
the negative results — is published at [shingou.io/research](https://shingou.io/research).
The honest uses are **filter**, **sizing**, and **kill-switch** — never an entry generator
on its own. The skill instructs agents to disclose signal age (free-tier delays) and
`reconstructed` history buckets rather than hide them.

## License

MIT — see [LICENSE](LICENSE). The skill and MCP tools are free distribution; the subscription
is the data. API usage is governed by the [Shingou terms](https://shingou.io/terms)
(commercial use included on paid plans; free tier is for personal/evaluation use).

*Not investment advice. This is an integration layer for a signal, not trading
recommendations; backtest before risking anything.*
