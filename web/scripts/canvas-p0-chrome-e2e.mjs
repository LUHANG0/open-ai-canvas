/**
 * 画布 P0 真实 Chrome 验收。
 *
 * 使用临时 Vite 端口与 Chrome profile 驱动 DEV-only 固定夹具，不依赖用户账号，
 * 不触发生成接口。所有等待有硬超时，浏览器异常、console error 和网络失败均失败。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const FIXTURE_ID = "canvas-p0-fixture";
const CHROME_CANDIDATES = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);
const ALLOWED_NOISE = ["Warning: [antd: InputNumber] `addonAfter` is deprecated. Please use `Space.Compact` instead.", "Warning: [antd: InputNumber] `addonBefore` is deprecated. Please use `Space.Compact` instead."];
const SKILLS_BODY = Buffer.from(JSON.stringify({ code: 0, data: { skills: [] }, msg: "ok" })).toString("base64");
const TASKS_BODY = Buffer.from(JSON.stringify({ code: 0, data: [], msg: "ok" })).toString("base64");
const RUNTIME_INFO_BODY = Buffer.from(
    JSON.stringify({
        runtime: "framefield-local-runtime",
        apiVersion: 2,
        protocolVersion: "framefield-runtime-session-v1",
        runtimeInstanceId: "canvas-p0-isolated-runtime",
        originTrusted: false,
    }),
).toString("base64");

const results = [];
let failures = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pass(name, detail = "") {
    results.push({ ok: true, name, detail });
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
    results.push({ ok: false, name, detail });
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(condition, name, detail = "") {
    if (condition) pass(name, detail);
    else fail(name, detail);
    return Boolean(condition);
}

function resolveChrome() {
    const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
    if (!chrome) throw new Error(`No Chrome binary found. Tried:\n  ${CHROME_CANDIDATES.join("\n  ")}`);
    return chrome;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

async function launchVite(port) {
    const child = spawn("bunx", ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (chunk) => {
        log += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
        log += chunk.toString();
    });
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Vite exited early (${child.exitCode}):\n${log}`);
        try {
            const response = await fetch(`http://127.0.0.1:${port}/dev/canvas-repro/${FIXTURE_ID}`);
            if (response.ok) return child;
        } catch {
            // Vite is not ready yet.
        }
        await sleep(400);
    }
    throw new Error(`Vite did not become ready within 120s:\n${log}`);
}

async function launchChrome(chromePath, cdpPort, profileDir) {
    const args = ["--headless=new", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check", "--window-size=1440,1000", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "about:blank"];
    if (process.platform === "linux" || process.env.CI) args.splice(-1, 0, "--no-sandbox", "--disable-dev-shm-usage");
    const child = spawn(chromePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (chunk) => {
        log += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
        log += chunk.toString();
    });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Chrome exited early (${child.exitCode}):\n${log}`);
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
            if (response.ok) return child;
        } catch {
            // CDP is not ready yet.
        }
        await sleep(300);
    }
    throw new Error(`Chrome CDP did not become ready within 60s:\n${log}`);
}

async function connectCdp(cdpPort) {
    const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    const target = targets.find((item) => item.type === "page");
    if (!target) throw new Error("No CDP page target found");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("CDP websocket open timeout")), 20000);
        ws.addEventListener(
            "open",
            () => {
                clearTimeout(timer);
                resolve();
            },
            { once: true },
        );
        ws.addEventListener(
            "error",
            (event) => {
                clearTimeout(timer);
                reject(new Error(String(event?.message || event)));
            },
            { once: true },
        );
    });

    let nextId = 0;
    const pending = new Map();
    const problems = [];
    const record = (kind, value) => {
        const clean = String(value ?? "").trim();
        if (clean && !ALLOWED_NOISE.includes(clean)) problems.push({ kind, text: clean });
    };
    const send = (method, params = {}) => {
        const id = ++nextId;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
            setTimeout(() => {
                if (!pending.has(id)) return;
                pending.delete(id);
                reject(new Error(`CDP timeout: ${method}`));
            }, 30000);
        });
    };

    ws.addEventListener("message", (event) => {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return;
        }
        if (message.id && pending.has(message.id)) {
            const waiter = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) waiter.reject(new Error(`CDP error: ${JSON.stringify(message.error)}`));
            else waiter.resolve(message.result);
            return;
        }
        const params = message.params;
        if (message.method === "Runtime.exceptionThrown") record("exception", params?.exceptionDetails?.exception?.description || params?.exceptionDetails?.text);
        if (message.method === "Log.entryAdded" && params?.entry?.level === "error") record("log.error", params.entry.text);
        if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(params?.type)) {
            record(`console.${params.type}`, (params.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" "));
        }
        if (message.method === "Network.loadingFailed") record("network.failed", `${params?.type || "?"} ${params?.errorText || "?"}`);
        if (message.method === "Network.responseReceived" && Number(params?.response?.status) >= 400) record("network.status", `${params.response.status} ${params.response.url}`);
        if (message.method === "Fetch.requestPaused") {
            let requestUrl;
            try {
                requestUrl = new URL(params.request.url);
            } catch {
                /* invalid URL is continued */
            }
            let body = "";
            if (requestUrl?.pathname === "/api/skills/added") body = SKILLS_BODY;
            else if (requestUrl?.pathname === "/api/tasks") body = TASKS_BODY;
            else if (requestUrl?.origin === "http://127.0.0.1:17371") body = RUNTIME_INFO_BODY;
            const action = body
                ? send("Fetch.fulfillRequest", {
                      requestId: params.requestId,
                      responseCode: 200,
                      responseHeaders: [
                          { name: "Content-Type", value: "application/json; charset=utf-8" },
                          { name: "Access-Control-Allow-Origin", value: params.request.headers?.Origin || "*" },
                          { name: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
                          { name: "Access-Control-Allow-Headers", value: "Content-Type, X-Framefield-Runtime-Session, X-Framefield-Runtime-Timestamp, X-Framefield-Runtime-Nonce, X-Framefield-Runtime-Proof" },
                      ],
                      body,
                  })
                : send("Fetch.continueRequest", { requestId: params.requestId });
            action.catch((error) => record("fetch.intercept", error.message));
        }
    });

    await Promise.all([send("Runtime.enable"), send("Page.enable"), send("Log.enable"), send("Network.enable"), send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] })]);

    const evaluate = async (expression) => {
        const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const poll = async (expression, label, timeout = 20000, interval = 200) => {
        const deadline = Date.now() + timeout;
        let last;
        while (Date.now() < deadline) {
            last = await evaluate(expression);
            if (last) return true;
            await sleep(interval);
        }
        console.log(`      poll timeout: ${label}; last=${JSON.stringify(last)}`);
        return false;
    };
    const readBox = (selector) =>
        evaluate(`(() => {
        for (const element of document.querySelectorAll(${JSON.stringify(selector)})) {
            if (!(element instanceof HTMLElement)) continue;
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none' || Number(style.opacity) <= 0) continue;
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const hit = document.elementFromPoint(x, y);
            if (!hit || (hit !== element && !element.contains(hit))) continue;
            return { x, y, width: rect.width, height: rect.height };
        }
        return null;
    })()`);
    const click = async (selector) => {
        const deadline = Date.now() + 5000;
        let box = null;
        while (!box && Date.now() < deadline) {
            box = await readBox(selector);
            if (!box) await sleep(100);
        }
        if (!box) return false;
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, buttons: 0 });
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", buttons: 1, clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", buttons: 0, clickCount: 1 });
        return true;
    };
    const drag = async (selector, dx, dy) => {
        const box = await readBox(selector);
        if (!box) return false;
        // 普通节点正文可选择文字并会阻止 mousedown；顶部 40px 是稳定的拖拽热区。
        const start = { x: box.x, y: box.y - box.height / 2 + Math.min(20, box.height / 4) };
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...start, buttons: 0 });
        await send("Input.dispatchMouseEvent", { type: "mousePressed", ...start, button: "left", buttons: 1, clickCount: 1 });
        for (let step = 1; step <= 5; step += 1) {
            await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: start.x + (dx * step) / 5, y: start.y + (dy * step) / 5, button: "left", buttons: 1 });
            await sleep(35);
        }
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: start.x + dx, y: start.y + dy, button: "left", buttons: 0, clickCount: 1 });
        return true;
    };
    const shortcut = async (key, { shift = false } = {}) => {
        const upper = key.toUpperCase();
        const code = key === "=" ? "Equal" : `Key${upper}`;
        const virtualKeyCode = key === "=" ? 187 : upper.charCodeAt(0);
        const modifiers = 2 | (shift ? 8 : 0);
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: shift ? upper : key, code, windowsVirtualKeyCode: virtualKeyCode, modifiers });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: shift ? upper : key, code, windowsVirtualKeyCode: virtualKeyCode, modifiers });
    };
    const navigate = async (url) => {
        problems.length = 0;
        await send("Page.navigate", { url });
        const mounted = await poll(`document.querySelectorAll('[data-node-id]').length >= 4 && !!document.querySelector('.pc-canvas-workspace')`, "fixture mounted", 60000);
        if (!mounted) throw new Error("Canvas repro fixture did not mount within 60s");
    };

    return { send, evaluate, poll, click, drag, shortcut, navigate, problems, close: () => ws.close() };
}

async function shellScenario(cdp, url) {
    console.log("\n=== A. shell and deterministic fixture ===");
    await cdp.navigate(url);
    const state = await cdp.evaluate(`(() => {
        const workspace = document.querySelector('.pc-canvas-workspace');
        const image = document.querySelector('[data-node-id="canvas-p0-image-reference"] img');
        return {
            path: location.pathname,
            nodes: document.querySelectorAll('[data-node-id]').length,
            connections: document.querySelectorAll('[data-connection-id]').length,
            topbar: !!document.querySelector('.pc-canvas-topbar'),
            dock: !!document.querySelector('[aria-label="画布创作工具"]'),
            workspaceHeight: workspace?.getBoundingClientRect().height || 0,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            imageReady: image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        };
    })()`);
    assert(state.path.endsWith(`/${FIXTURE_ID}`), "A1 fixture route remains active", state.path);
    assert(state.nodes === 4 && state.connections === 2, "A2 deterministic nodes and connections rendered", JSON.stringify(state));
    assert(state.topbar && state.dock && state.workspaceHeight >= 900, "A3 PC canvas shell fills the viewport", JSON.stringify(state));
    assert(state.horizontalOverflow <= 1, "A4 no document-level horizontal overflow", `overflow=${state.horizontalOverflow}`);
    assert(state.imageReady, "A5 same-origin fixture image decoded");
    assert(cdp.problems.length === 0, "A6 no browser/network problems", JSON.stringify(cdp.problems));
}

async function interactionScenario(cdp) {
    console.log("\n=== B. drag, history, copy, search and viewport controls ===");
    const nodeSelector = '[data-node-id="canvas-p0-text-story"] .canvas-node-shell';
    const wrapperSelector = '[data-node-id="canvas-p0-text-story"]';
    const initialTransform = await cdp.evaluate(`document.querySelector(${JSON.stringify(wrapperSelector)})?.style.transform || ''`);
    if (!(await cdp.drag(nodeSelector, 90, 54))) throw new Error("Story node was not draggable");
    const moved = await cdp.poll(`document.querySelector(${JSON.stringify(wrapperSelector)})?.style.transform !== ${JSON.stringify(initialTransform)}`, "node moved");
    const movedTransform = await cdp.evaluate(`document.querySelector(${JSON.stringify(wrapperSelector)})?.style.transform || ''`);
    assert(moved, "B1 real mouse drag changes node position", `${initialTransform} -> ${movedTransform}`);
    assert(
        await cdp.poll(
            `(() => {
        const state = document.querySelector(${JSON.stringify(nodeSelector)})?.getAttribute('data-node-state');
        return (state === 'selected' || state === 'focus') && !!document.querySelector('[aria-label="节点快捷工具"]');
    })()`,
            "node interaction state",
        ),
        "B2 dragged node exposes its focus/selection tools",
    );

    // 历史记录以 180ms 合并连续状态；等事务落盘后再验证撤销/重做。
    await sleep(350);
    await cdp.shortcut("z");
    assert(await cdp.poll(`document.querySelector(${JSON.stringify(wrapperSelector)})?.style.transform === ${JSON.stringify(initialTransform)}`, "undo transform"), "B3 Ctrl+Z restores the original position");
    await sleep(150);
    await cdp.shortcut("y");
    assert(await cdp.poll(`document.querySelector(${JSON.stringify(wrapperSelector)})?.style.transform === ${JSON.stringify(movedTransform)}`, "redo transform"), "B4 Ctrl+Y restores the moved position");

    await cdp.shortcut("f");
    assert(await cdp.poll(`!!document.querySelector('input[aria-label="搜索画布节点"]')`, "search modal"), "B5 Ctrl+F opens node search");
    await cdp.click('input[aria-label="搜索画布节点"]');
    await cdp.shortcut("a");
    await cdp.send("Input.insertText", { text: "主视觉参考" });
    assert(
        await cdp.poll(`[...document.querySelectorAll('[role="option"]')].some((element) => element.getClientRects().length > 0 && (element.textContent || '').includes('主视觉参考'))`, "matching search result"),
        "B6 search returns the reference image",
    );
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    assert(
        await cdp.poll(
            `(() => {
        const state = document.querySelector('[data-node-id="canvas-p0-image-reference"] .canvas-node-shell')?.getAttribute('data-node-state');
        return state === 'selected' || state === 'focus';
    })()`,
            "image focused",
        ),
        "B7 Enter focuses the matching image node",
    );

    // 搜索定位会平滑移动视口；等待动画结束后再验证显式缩放，避免二者互相覆盖。
    await sleep(1000);
    await cdp.evaluate(`(() => { document.querySelector('#canvas-main')?.focus(); return document.activeElement?.id === 'canvas-main'; })()`);
    const scaleBefore = await cdp.evaluate(`Number(getComputedStyle(document.querySelector('.pc-canvas-infinite')).getPropertyValue('--canvas-committed-scale'))`);
    await cdp.shortcut("=");
    const scaleIncreased = await cdp.poll(`Number(getComputedStyle(document.querySelector('.pc-canvas-infinite')).getPropertyValue('--canvas-committed-scale')) > ${scaleBefore}`, "scale increased");
    assert(scaleIncreased, "B8 Ctrl+= increases committed scale", `before=${scaleBefore}`);
    if (!(await cdp.click('[aria-label="打开小地图"]'))) {
        const diagnostic = await cdp.evaluate(`(() => {
            const button = document.querySelector('[aria-label="打开小地图"]');
            if (!(button instanceof HTMLElement)) return { button: null };
            const rect = button.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return { button: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, hit: hit instanceof HTMLElement ? { tag: hit.tagName, className: hit.className, ariaLabel: hit.getAttribute('aria-label') } : null };
        })()`);
        throw new Error(`Minimap control was not clickable: ${JSON.stringify(diagnostic)}`);
    }
    assert(await cdp.poll(`!!document.querySelector('.pc-canvas-mini-map[aria-label="画布小地图"]')`, "minimap opens"), "B9 minimap opens from the dock");

    // 搜索已经明确选中图片节点；用真实键盘事件覆盖跨组件复制/粘贴链路。
    await cdp.shortcut("c");
    await sleep(200);
    await cdp.shortcut("v");
    assert(await cdp.poll(`document.querySelectorAll('[data-node-id]').length === 5`, "copied node appears"), "B10 Ctrl+C/Ctrl+V duplicates the selected node");
    assert(cdp.problems.length === 0, "B11 no browser/network problems", JSON.stringify(cdp.problems));
    return movedTransform;
}

async function persistenceScenario(cdp, url, movedTransform) {
    console.log("\n=== C. local persistence across reload ===");
    await sleep(1600);
    cdp.problems.length = 0;
    await cdp.send("Page.reload", { ignoreCache: false });
    const restored = await cdp.poll(`document.querySelectorAll('[data-node-id]').length === 5 && document.querySelector('[data-node-id="canvas-p0-text-story"]')?.style.transform === ${JSON.stringify(movedTransform)}`, "persisted canvas restored", 60000);
    assert(restored, "C1 moved position and pasted node survive reload");
    assert((await cdp.evaluate("location.href")) === url, "C2 reload stays on isolated fixture route");
    assert(cdp.problems.length === 0, "C3 no browser/network problems after reload", JSON.stringify(cdp.problems));
}

async function compactViewportScenario(cdp) {
    console.log("\n=== D. 1024x768 PC viewport ===");
    cdp.problems.length = 0;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await cdp.poll(`document.querySelectorAll('[data-node-id]').length === 5 && !!document.querySelector('.pc-canvas-workspace')`, "compact layout settled", 20000);
    const layout = await cdp.evaluate(`(() => {
        const visible = (selector) => {
            const element = document.querySelector(selector);
            if (!(element instanceof HTMLElement)) return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
        };
        return {
            width: innerWidth,
            height: innerHeight,
            nodes: document.querySelectorAll('[data-node-id]').length,
            topbar: visible('.pc-canvas-topbar'),
            dock: visible('[aria-label="画布创作工具"]'),
            zoom: visible('.pc-canvas-zoom'),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
    })()`);
    assert(layout.width === 1024 && layout.height === 768, "D1 compact PC viewport applied", JSON.stringify(layout));
    assert(layout.nodes === 5 && layout.topbar && layout.dock && layout.zoom, "D2 canvas content and primary controls remain available", JSON.stringify(layout));
    assert(layout.overflow <= 1, "D3 no horizontal overflow at 1024x768", `overflow=${layout.overflow}`);
    assert(cdp.problems.length === 0, "D4 no browser/network problems at compact viewport", JSON.stringify(cdp.problems));
}

async function stopExact(child, name) {
    if (!child) return;
    const stopped = () => child.exitCode !== null || child.signalCode !== null;
    if (stopped()) return;
    try {
        child.kill("SIGTERM");
    } catch {
        /* already stopped */
    }
    const deadline = Date.now() + 8000;
    while (!stopped() && Date.now() < deadline) await sleep(150);
    if (!stopped()) {
        try {
            child.kill("SIGKILL");
        } catch {
            /* already stopped */
        }
        const hardDeadline = Date.now() + 4000;
        while (!stopped() && Date.now() < hardDeadline) await sleep(150);
    }
    if (!stopped()) throw new Error(`Failed to stop ${name} pid=${child.pid}`);
    console.log(`      stopped ${name} (pid=${child.pid}, signal=${child.signalCode})`);
}

async function main() {
    const chromePath = resolveChrome();
    const vitePort = await freePort();
    const cdpPort = await freePort();
    const baseUrl = `http://127.0.0.1:${vitePort}`;
    const url = `${baseUrl}/dev/canvas-repro/${FIXTURE_ID}`;
    const profileDir = mkdtempSync(join(tmpdir(), "canvas-p0-e2e-"));
    let vite;
    let chrome;
    let cdp;
    try {
        console.log(`Chrome binary: ${chromePath}`);
        vite = await launchVite(vitePort);
        chrome = await launchChrome(chromePath, cdpPort, profileDir);
        console.log(`Temporary Vite pid=${vite.pid}; Chrome pid=${chrome.pid}; profile=${profileDir}`);
        cdp = await connectCdp(cdpPort);
        await shellScenario(cdp, url);
        const movedTransform = await interactionScenario(cdp);
        await persistenceScenario(cdp, url, movedTransform);
        await compactViewportScenario(cdp);
    } catch (error) {
        fail("runner threw", String(error?.stack || error));
    } finally {
        try {
            cdp?.close();
        } catch {
            /* already closed */
        }
        try {
            await stopExact(chrome, "chrome");
        } catch (error) {
            fail("cleanup chrome", String(error));
        }
        try {
            await stopExact(vite, "vite");
        } catch (error) {
            fail("cleanup vite", String(error));
        }
        try {
            rmSync(profileDir, { recursive: true, force: true });
        } catch (error) {
            fail("cleanup profile", String(error));
        }
    }
    const passed = results.filter((item) => item.ok).length;
    console.log(`\nCanvas P0 E2E: ${passed} passed, ${failures} failed, ${results.length} total`);
    for (const item of results.filter((entry) => !entry.ok)) console.log(`  FAILED: ${item.name} — ${item.detail}`);
    if (failures) process.exit(1);
}

main().catch((error) => {
    console.error(error?.stack || error);
    process.exit(1);
});
