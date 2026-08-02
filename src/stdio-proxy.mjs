#!/usr/bin/env node
/**
 * Stdio bridge to the Shingou remote MCP server.
 *
 * Shingou's MCP server is remote (`https://api.shingou.io/mcp`, Streamable HTTP)
 * and stateless. Clients that speak Streamable HTTP should connect to it
 * directly — see the README. This bridge is for the two places that cannot: hosts
 * that only launch a local process, and directories that index a *packaged*
 * server by building it and speaking MCP to its stdin.
 *
 * Because the endpoint holds no session there is nothing to track and no stream
 * to keep open, so this is a message pump: one HTTP POST per JSON-RPC message.
 *
 * stdout carries protocol frames and nothing else. Diagnostics go to stderr,
 * because one stray byte on stdout desynchronises the client for good.
 *
 * Plain JavaScript on purpose. Node refuses to strip types for files under
 * node_modules, so a TypeScript entrypoint cannot run from an installed
 * package on any Node version. Seven annotations were not worth a build step.
 */

const ENDPOINT = process.env.SHINGOU_MCP_URL || "https://api.shingou.io/mcp";
const API_KEY = process.env.SHINGOU_API_KEY ?? "";
// Must equal `package.json`'s version — it goes out on every request and is how
// usage attribution reads which build is talking. Hand-maintained because
// deriving it would cost either an import attribute (Node 22+, and `engines`
// says >=18) or startup file I/O, for a User-Agent string. The parity test in
// `test/proxy.test.ts` is what makes the duplication safe; 0.3.2 shipped to npm
// still announcing 0.3.1, which is the drift that bought the test.
const VERSION = "0.3.2";

const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "user-agent": `shingou-mcp-stdio/${VERSION}`,
};
// `initialize`, `tools/list` and `get_symbols` all answer without a key, which
// is what lets a directory verify this server without being handed a credential.
// Only send the header when there is something in it.
if (API_KEY) headers["x-api-key"] = API_KEY;

/**
 * One value out, always on exactly one line: re-serialized so pretty-printing
 * upstream can never break the line framing this protocol depends on.
 */
function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function forward(frame) {
  /** @type {string | number | null | undefined} */
  let id;
  try {
    const parsed = JSON.parse(frame);
    if (parsed !== null && typeof parsed === "object" && "id" in parsed) {
      id = parsed.id;
    }
  } catch {
    // A client that sent junk gets an answer it can parse, rather than silence.
    emit({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }

  try {
    const response = await fetch(ENDPOINT, { method: "POST", headers, body: frame });
    const body = (await response.text()).trim();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);

    // Notifications carry no id, and the server answers them 202 with a `null`
    // body. Forwarding that would look like a response to a request nobody made.
    if (body === "" || body === "null") return;

    // Stateless JSON is what the endpoint returns today. Streamable HTTP permits
    // SSE, so unwrap it here instead of shipping `data:` prefixes to the client.
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      for (const line of body.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) emit(JSON.parse(trimmed.slice(5).trim()));
      }
      return;
    }

    emit(JSON.parse(body));
  } catch (error) {
    process.stderr.write(`[shingou-mcp-stdio] ${String(error)}\n`);
    // Only a request can be answered. A notification has no id to answer on, and
    // inventing one would be a protocol error of our own making.
    if (id !== undefined && id !== null) {
      emit({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: "Shingou request failed", data: String(error) },
      });
    }
  }
}

let buffer = "";

function drain(final) {
  let newline = buffer.indexOf("\n");
  while (newline !== -1) {
    const frame = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    // Deliberately not awaited: clients pipeline requests, and JSON-RPC ids make
    // response ordering irrelevant. Awaiting here would turn a batch of tool
    // calls into a queue.
    if (frame) void forward(frame);
    newline = buffer.indexOf("\n");
  }
  if (final) {
    const rest = buffer.trim();
    buffer = "";
    if (rest) void forward(rest);
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  drain(false);
});
// A client that closes stdin without a trailing newline still sent a frame. No
// explicit exit: the process ends once stdin is done and every request in flight
// has been answered.
process.stdin.on("end", () => drain(true));
process.stdin.on("error", (error) => {
  process.stderr.write(`[shingou-mcp-stdio] stdin: ${error.message}\n`);
});
