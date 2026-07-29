/**
 * Hermetic tests for the stdio bridge.
 *
 * These run against a stub upstream, not the live API: the behaviour worth
 * protecting is the *framing* contract between stdin, HTTP and stdout, and that
 * contract is invisible in a test that needs the network to answer. The live
 * endpoint is covered separately by `scripts/smoke.sh`, on a schedule, where a
 * failure means the API moved rather than the bridge broke.
 *
 *   node --test test/proxy.test.ts
 */

import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";

type Received = { headers: NodeJS.Dict<string | string[]>; body: string };

/**
 * Stands in for `api.shingou.io/mcp`, reproducing the three behaviours the bridge
 * actually depends on: a 202 with a `null` body for notifications, **indented**
 * JSON for replies (so the one-line guarantee is tested rather than assumed), and
 * a 500 for a method named `boom`.
 */
function startStub(): Promise<{ url: string; received: Received[]; close: () => Promise<void> }> {
  const received: Received[] = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      const message = JSON.parse(body) as { id?: unknown; method?: string };

      if (message.id === undefined) {
        res.writeHead(202, { "content-type": "application/json" }).end("null");
        return;
      }
      if (message.method === "boom") {
        res.writeHead(500, { "content-type": "text/plain" }).end("upstream exploded");
        return;
      }
      // Deliberately pretty-printed: a naive pass-through would emit this across
      // several lines and desynchronise the client.
      const reply = { jsonrpc: "2.0", id: message.id, result: { ok: true, method: message.method } };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(reply, null, 2));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/mcp`,
        received,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

/** Feed frames to a fresh bridge process, then read back what it wrote. */
function run(
  frames: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ lines: string[]; stderr: string; code: number | null }> {
  const child = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "src/stdio-proxy.ts"],
    { env: { ...process.env, SHINGOU_API_KEY: "", ...env }, stdio: ["pipe", "pipe", "pipe"] },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });

  for (const frame of frames) child.stdin.write(`${frame}\n`);
  child.stdin.end();

  return new Promise((resolve) => {
    child.on("close", (code) => {
      resolve({ lines: stdout.split("\n").filter((line) => line !== ""), stderr, code });
    });
  });
}

const request = (id: number, method: string) => JSON.stringify({ jsonrpc: "2.0", id, method });
const notification = (method: string) => JSON.stringify({ jsonrpc: "2.0", method });

test("a notification produces no frame, and a request still answers", async () => {
  const stub = await startStub();
  try {
    const { lines, code } = await run([request(1, "initialize"), notification("notifications/initialized")], {
      SHINGOU_MCP_URL: stub.url,
    });
    assert.equal(lines.length, 1, "the 202/null answer to a notification must not be forwarded");
    assert.equal(JSON.parse(lines[0]!).id, 1);
    assert.equal(code, 0);
    assert.equal(stub.received.length, 2, "both frames should still reach upstream");
  } finally {
    await stub.close();
  }
});

test("a pretty-printed upstream reply is re-serialized onto exactly one line", async () => {
  const stub = await startStub();
  try {
    const { lines } = await run([request(7, "tools/list")], { SHINGOU_MCP_URL: stub.url });
    assert.equal(lines.length, 1, "indented upstream JSON must not become multiple frames");
    assert.equal(JSON.parse(lines[0]!).result.ok, true);
  } finally {
    await stub.close();
  }
});

test("malformed input answers -32700 and the pump survives it", async () => {
  const stub = await startStub();
  try {
    const { lines } = await run(["not json at all", request(2, "tools/list")], {
      SHINGOU_MCP_URL: stub.url,
    });
    assert.equal(lines.length, 2, "the frame after a bad one must still be served");
    const parseError = lines.map((l) => JSON.parse(l)).find((m) => m.error);
    assert.equal(parseError.error.code, -32700);
    assert.equal(parseError.id, null, "an unparseable frame has no id to answer on");
    assert.equal(stub.received.length, 1, "junk must not be forwarded upstream");
  } finally {
    await stub.close();
  }
});

test("an upstream failure answers -32603 on the request's id", async () => {
  const stub = await startStub();
  try {
    const { lines, stderr } = await run([request(9, "boom")], { SHINGOU_MCP_URL: stub.url });
    assert.equal(lines.length, 1);
    const message = JSON.parse(lines[0]!);
    assert.equal(message.error.code, -32603);
    assert.equal(message.id, 9, "the client is waiting on this id and must not hang");
    assert.match(stderr, /500/, "the detail belongs on stderr");
  } finally {
    await stub.close();
  }
});

test("an upstream failure on a notification stays silent", async () => {
  const stub = await startStub();
  try {
    const { lines } = await run([notification("boom")], { SHINGOU_MCP_URL: stub.url });
    assert.equal(lines.length, 0, "there is no id to answer on, so inventing one would be our own protocol error");
  } finally {
    await stub.close();
  }
});

test("x-api-key is sent only when SHINGOU_API_KEY is non-empty", async () => {
  const stub = await startStub();
  try {
    await run([request(1, "tools/list")], { SHINGOU_MCP_URL: stub.url });
    assert.equal(stub.received[0]!.headers["x-api-key"], undefined, "no key set, so no header");

    await run([request(2, "tools/list")], { SHINGOU_MCP_URL: stub.url, SHINGOU_API_KEY: "sk_test_123" });
    assert.equal(stub.received[1]!.headers["x-api-key"], "sk_test_123");
  } finally {
    await stub.close();
  }
});
