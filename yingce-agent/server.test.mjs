import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const token = "isolated-agent-connection-test-token";

async function until(check) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(10);
  }
  assert.fail("Agent connection state did not settle within 4s");
}

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "yingce-agent-connections-"));
  const runtime = join(directory, "runtime.mjs");
  const starts = join(directory, "starts.jsonl");
  await writeFile(starts, "");
  await writeFile(runtime, `
import { appendFileSync, existsSync } from "node:fs";
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { id, gate } = JSON.parse(raw);
appendFileSync(${JSON.stringify(starts)}, JSON.stringify(id) + "\\n");
console.log(JSON.stringify({ event: "started", id, pid: process.pid }));
while (!existsSync(gate)) await new Promise(resolve => setTimeout(resolve, 10));
console.log(JSON.stringify({ event: "settled", id }));
`);
  const server = spawn(process.execPath, [new URL("server.mjs", import.meta.url).pathname], {
    env: { ...process.env, PORT: "0", YINGCE_AGENT_TOKEN: token, YINGCE_AGENT_RUNTIME: runtime, MAX_CONCURRENT_SESSIONS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  server.stderr.on("data", chunk => { errors += chunk; });
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.destroy();
    // Release all fixture children even when an assertion failed before cancellation.
    await writeFile(join(directory, "release"), "");
    await delay(50);
    server.kill();
    await once(server, "exit");
    await rm(directory, { recursive: true, force: true });
    assert.equal(errors, "");
  });
  const lines = createInterface({ input: server.stdout });
  const [line] = await once(lines, "line");
  assert.match(line, /^YINGCE_AGENT_READY \d+$/);
  const endpoint = `http://127.0.0.1:${line.split(" ")[1]}`;
  const health = async () => (await fetch(`${endpoint}/healthz`)).json();
  const run = id => {
    let resolve;
    const done = new Promise(r => { resolve = r; });
    const events = [];
    const client = request(`${endpoint}/v1/runs`, { method: "POST", headers: { authorization: `Bearer ${token}` } }, response => {
      let raw = "";
      response.on("data", chunk => {
        raw += chunk;
        let end;
        while ((end = raw.indexOf("\n")) >= 0) {
          events.push(JSON.parse(raw.slice(0, end)));
          raw = raw.slice(end + 1);
        }
      });
      response.on("end", () => resolve({ status: response.statusCode, events, raw }));
      response.on("error", () => resolve({ cancelled: true }));
    });
    client.on("error", () => resolve({ cancelled: true }));
    clients.push(client);
    client.end(JSON.stringify({ id, gate: join(directory, "release") }));
    return { client, events, done };
  };
  return { run, health, endpoint, release: () => writeFile(join(directory, "release"), ""), started: async () => (await readFile(starts, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse) };
}

test("completed request bodies wait for a slot and run exactly once", { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const first = f.run("first");
  await until(() => first.events.length === 1);
  const second = f.run("second");
  await until(async () => (await f.health()).queued === 1);
  assert.deepEqual(await f.started(), ["first"]);
  await f.release();
  assert.equal((await first.done).status, 200);
  assert.equal((await second.done).status, 200);
  assert.deepEqual(await f.started(), ["first", "second"]);
  await until(async () => (await f.health()).active === 0);
});

test("a disconnected queued client never starts a runtime", { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const first = f.run("first");
  await until(() => first.events.length === 1);
  const cancelled = f.run("cancelled");
  await until(async () => (await f.health()).queued === 1);
  cancelled.client.destroy();
  await until(async () => (await f.health()).queued === 0);
  const next = f.run("next");
  await until(async () => (await f.health()).queued === 1);
  await f.release();
  await Promise.all([first.done, next.done]);
  assert.deepEqual(await f.started(), ["first", "next"]);
});

test("disconnecting an active response terminates its runtime and admits the next client", { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const first = f.run("first");
  await until(() => first.events.length === 1);
  const pid = first.events[0].pid;
  const next = f.run("next");
  await until(async () => (await f.health()).queued === 1);
  first.client.destroy();
  await until(() => next.events.length === 1);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  await f.release();
  assert.equal((await next.done).status, 200);
  await until(async () => (await f.health()).active === 0);
});

test("changing the limit admits queued runs and shrinking waits for existing runs", { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const first = f.run("first");
  await until(() => first.events.length === 1);
  const second = f.run("second");
  await until(async () => (await f.health()).queued === 1);
  const setLimit = maxSessions => fetch(`${f.endpoint}/v1/limit`, { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ maxSessions }) });
  assert.equal((await setLimit(2)).status, 200);
  await until(() => second.events.length === 1);
  assert.equal((await setLimit(1)).status, 200);
  const third = f.run("third");
  await until(async () => (await f.health()).queued === 1);
  assert.equal((await f.health()).active, 2);
  await f.release();
  for (const result of await Promise.all([first.done, second.done, third.done])) assert.equal(result.status, 200);
  assert.deepEqual(await f.started(), ["first", "second", "third"]);
  await until(async () => (await f.health()).active === 0);
});
