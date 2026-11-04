import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

function chromePath() {
    if (process.env.CANVAS_TEST_CHROME) return process.env.CANVAS_TEST_CHROME;
    const installed = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
    const cache = join(homedir(), "Library/Caches/ms-playwright");
    if (existsSync(cache))
        for (const directory of readdirSync(cache)
            .filter((name) => name.startsWith("chromium-"))
            .sort()
            .reverse()) {
            for (const arch of ["arm64", "x64"]) installed.push(join(cache, directory, `chrome-mac-${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`));
        }
    return installed.find(existsSync);
}
const chrome = chromePath();

test.skipIf(!chrome)(
    "native compound stroke geometry and real React interaction (requires Chrome or CANVAS_TEST_CHROME)",
    async () => {
        const build = await Bun.build({
            entrypoints: [resolve(import.meta.dir, "fixtures/canvas-connection-stroke-hit.harness.tsx")],
            target: "browser",
            define: { "process.env.NODE_ENV": '"production"' },
            plugins: [
                {
                    name: "canvas-source-alias",
                    setup(build) {
                        build.onResolve({ filter: /^@\// }, (args) => ({ path: Bun.resolveSync("./src/" + args.path.slice(2), resolve(import.meta.dir, "..")) }));
                    },
                },
            ],
        });
        if (!build.success) throw new AggregateError(build.logs, "Native hit harness build failed");
        const script = await build.outputs[0].text();
        const server = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch: (request) =>
                new URL(request.url).pathname === "/test.js"
                    ? new Response(script, { headers: { "content-type": "text/javascript" } })
                    : new Response('<!doctype html><script type="module" src="/test.js"></script>', { headers: { "content-type": "text/html" } }),
        });
        const profile = mkdtempSync(join(tmpdir(), "canvas-stroke-hit-"));
        const process = Bun.spawn([chrome!, "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdout: "ignore", stderr: "pipe" });
        try {
            const reader = process.stderr.getReader();
            const decoder = new TextDecoder();
            let stderr = "",
                endpoint = "";
            const deadline = Date.now() + 15000;
            while (!endpoint && Date.now() < deadline) {
                const next = await reader.read();
                if (next.done) throw Error("Chrome exited before exposing DevTools: " + stderr);
                stderr += decoder.decode(next.value);
                const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
                if (match) endpoint = new URL(match[1]).origin.replace("ws:", "http:");
            }
            void reader.cancel();
            if (!endpoint) throw Error("Chrome DevTools startup deadline exceeded");
            for (const fallback of [false, true]) {
                const url = `http://127.0.0.1:${server.port}/${fallback ? "?fallback=1" : ""}`;
                const target: unknown = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
                if (!target || typeof target !== "object" || !("webSocketDebuggerUrl" in target) || typeof target.webSocketDebuggerUrl !== "string") throw Error("Chrome did not return a page endpoint");
                const socket = new WebSocket(target.webSocketDebuggerUrl);
                const opened = Promise.withResolvers<void>();
                socket.addEventListener("open", () => opened.resolve(), { once: true });
                socket.addEventListener("error", () => opened.reject(Error("Chrome page connection failed")), { once: true });
                await opened.promise;
                let nextId = 0;
                const pending = new Map<number, ReturnType<typeof Promise.withResolvers<any>>>();
                const completed = Promise.withResolvers<{ result?: { fallback: boolean; checks: string[] }; failure?: string }>();
                socket.addEventListener("message", (event) => {
                    const message = JSON.parse(String(event.data));
                    if (message.method === "Runtime.bindingCalled" && message.params.name === "nativeStrokeResult") completed.resolve(JSON.parse(message.params.payload));
                    if (!message.id) return;
                    const request = pending.get(message.id);
                    pending.delete(message.id);
                    if (message.error) request?.reject(Error(message.error.message));
                    else request?.resolve(message.result);
                });
                const send = (method: string, params: object) => {
                    const request = Promise.withResolvers<any>(),
                        id = ++nextId;
                    pending.set(id, request);
                    socket.send(JSON.stringify({ id, method, params }));
                    return request.promise;
                };
                try {
                    await send("Runtime.enable", {});
                    await send("Page.enable", {});
                    await send("Runtime.addBinding", { name: "nativeStrokeResult" });
                    await send("Page.navigate", { url });
                    const result = await completed.promise;
                    expect(result.failure, result.failure).toBeUndefined();
                    expect(result.result?.fallback).toBe(fallback);
                    expect(result.result?.checks).toContain("committed zoom preserves sixteen-pixel hit width");
                    console.info(`Native stroke ${fallback ? "fallback" : "compound"}: ${result.result?.checks.join("; ")}`);
                } finally {
                    socket.close();
                }
            }
        } finally {
            process.kill();
            await process.exited;
            server.stop(true);
            rmSync(profile, { recursive: true, force: true });
        }
    },
    45000,
);
