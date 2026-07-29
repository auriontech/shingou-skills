#!/usr/bin/env bash
# Reproduces the check a packaged-server directory runs against this image: launch
# it, speak MCP to its stdin, confirm it introspects and serves a tool.
#
# Runs with no API key on purpose. `initialize`, `tools/list` and `list_symbols`
# answer unauthenticated upstream, which is exactly what lets a directory verify
# the server without being handed a credential. Export SHINGOU_API_KEY to also
# exercise a data tool.
#
#   docker build -t shingou-mcp-stdio .
#   scripts/smoke.sh
set -euo pipefail

IMAGE="${IMAGE:-shingou-mcp-stdio}"
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

fail() {
  echo "FAIL: $1" >&2
  echo "--- frames received ---" >&2
  cat "$OUT" >&2
  exit 1
}

run() {
  docker run -i --rm \
    -e SHINGOU_MCP_URL="${SHINGOU_MCP_URL:-}" \
    -e SHINGOU_API_KEY="${SHINGOU_API_KEY:-}" \
    "$IMAGE"
}

{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_symbols","arguments":{}}}'
} | run >"$OUT"

# Three requests and one notification went in. A notification must produce no
# frame, so four lines out would mean we answered something nobody asked.
frames="$(grep -c . "$OUT" || true)"
[ "$frames" -eq 3 ] || fail "expected 3 frames (the notification must be silent), got $frames"

# Every frame must be one complete JSON value on one line. Broken framing is the
# failure that actually kills stdio servers in the wild.
while IFS= read -r line; do
  [ -n "$line" ] || continue
  printf '%s' "$line" | jq -e . >/dev/null 2>&1 || fail "frame is not single-line JSON: $line"
done <"$OUT"

# Responses are not awaited in order, so select by id rather than by position.
jq -es 'map(select(.id == 1)) | .[0].result.serverInfo.name == "shingou"' "$OUT" >/dev/null ||
  fail "initialize did not identify the shingou server"

tools="$(jq -rs 'map(select(.id == 2)) | .[0].result.tools | length' "$OUT")"
[ "$tools" -eq 4 ] || fail "expected 4 tools from tools/list, got $tools"

jq -es 'map(select(.id == 3)) | .[0].result.content[0].text | contains("BTC-USD")' "$OUT" >/dev/null ||
  fail "list_symbols did not return symbols without a key"

echo "ok: introspection and list_symbols pass with no credential ($tools tools)"

if [ -n "${SHINGOU_API_KEY:-}" ]; then
  echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_sentiment","arguments":{"symbols":["BTC-USD"]}}}' |
    run >"$OUT"

  jq -es 'map(select(.id == 4)) | .[0].result.isError != true' "$OUT" >/dev/null ||
    fail "get_sentiment returned an error with a key set"
  jq -es 'map(select(.id == 4)) | .[0].result.content[0].text | contains("score")' "$OUT" >/dev/null ||
    fail "get_sentiment returned no score"

  echo "ok: get_sentiment returns a signal with a key"
else
  echo "skip: no SHINGOU_API_KEY set, data tools not exercised"
fi
