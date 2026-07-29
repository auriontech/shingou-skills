# Shingou skills

[![smithery badge](https://smithery.ai/badge/adol/shingou)](https://smithery.ai/servers/adol/shingou)
[![Glama score](https://glama.ai/mcp/servers/auriontech/shingou-skills/badges/score.svg)](https://glama.ai/mcp/servers/auriontech/shingou-skills)

Plug the [Shingou](https://shingou.io) news-sentiment API into Claude or any AI agent —
a skill that teaches the agent to use the API correctly (auth, symbols, quotas, and honest
framing of an hourly signal), plus MCP tools for direct access. Works instantly with a
**free API key** ([shingou.io/dashboard](https://shingou.io/dashboard), no card) — the paid
key is what removes the 24h delay outside the live majors.

| Path | What it is |
| --- | --- |
| [`plugins/shingou/skills/shingou-api/`](plugins/shingou/skills/shingou-api/) | The skill: SKILL.md + full API reference + worked flows |
| MCP endpoint | `https://api.shingou.io/mcp` — the same API as callable tools |
| [`src/stdio-proxy.ts`](src/stdio-proxy.ts) | Packaged stdio server, for hosts that launch a local process instead of connecting to a remote one |

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
`get_symbols`) over Streamable HTTP. **The Claude Code plugin configures this
automatically** — with `SHINGOU_API_KEY` exported, the `shingou` MCP server is ready after
`/plugin install`. To connect without the plugin:

```bash
claude mcp add --transport http shingou https://api.shingou.io/mcp \
  --header "x-api-key: sk_live_..."
```

Requests made through MCP are attributed server-side — no User-Agent handling needed.
claude.ai remote connectors (OAuth) are planned.

### Packaged server (stdio)

Streamable HTTP is the way in, and every client above uses it. Two places cannot: hosts that
only launch a local process, and directories that index a server by building it and speaking
MCP to its stdin. [`src/stdio-proxy.ts`](src/stdio-proxy.ts) bridges both to the same remote
endpoint. No dependencies, one HTTP POST per JSON-RPC message.

```bash
docker build -t shingou-mcp-stdio .
docker run -i --rm -e SHINGOU_API_KEY=sk_live_... shingou-mcp-stdio
```

Node 24+ runs the TypeScript entrypoint directly, with no build step:

```bash
SHINGOU_API_KEY=sk_live_... node src/stdio-proxy.ts
```

`SHINGOU_MCP_URL` overrides the endpoint. **The key is optional**: `initialize`, `tools/list`
and `get_symbols` all answer without one, so a client can discover the tools before the user
has a key. The data tools need it.

Two layers of checks, split by what a failure would mean:

```bash
node --test test/proxy.test.ts   # hermetic: stub upstream, no network, no key
scripts/smoke.sh                 # live: builds the image, talks to the real endpoint
```

The first is what CI runs, verbatim and with no package manager, because it fails only when
the bridge regresses.
`scripts/smoke.sh` runs on a daily schedule instead — it can go red because the API moved
or a deploy is mid-flight, and that should not block a pull request.

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
