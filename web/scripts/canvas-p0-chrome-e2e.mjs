/**
 * 画布 P0 真实 Chrome 验收。
 *
 * 使用临时 Vite 端口与 Chrome profile 驱动 DEV-only 固定夹具，不依赖用户账号，
 * 不触发生成接口。所有等待有硬超时，浏览器异常、console error 和网络失败均失败。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createServer } from "node:net";

const FIXTURE_ID = "canvas-p0-fixture";
const LARGE_FIXTURE_ID = "canvas-large-fixture";
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
const performanceSamples = [];
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
        if (clean && !ALLOWED_NOISE.includes(clean) && !problems.some(item => item.kind === kind && item.text === clean)) problems.push({ kind, text: clean });
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
    const hover = async (selector) => {
        const deadline = Date.now() + 5000;
        let box = null;
        while (!box && Date.now() < deadline) {
            box = await readBox(selector);
            if (!box) await sleep(100);
        }
        if (!box) return false;
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y, buttons: 0 });
        return true;
    };
    const movePointer = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    const drag = async (selector, dx, dy) => {
        const box = await readBox(selector);
        if (!box) return false;
        const start = { x: box.x, y: box.y };
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

    return { send, evaluate, poll, click, hover, movePointer, drag, shortcut, navigate, problems, close: () => ws.close() };
}

async function shellScenario(cdp, url) {
    console.log("\n=== A. shell and deterministic fixture ===");
    await cdp.navigate(url);
    await cdp.poll(`(() => {
        const image = document.querySelector('[data-node-id="canvas-p0-image-reference"] img');
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    })()`, "fixture image decoded");
    const state = await cdp.evaluate(`(() => {
        const workspace = document.querySelector('.pc-canvas-workspace');
        const image = document.querySelector('[data-node-id="canvas-p0-image-reference"] img');
        return {
            path: location.pathname,
            nodes: document.querySelectorAll('[data-node-id]').length,
            connections: document.querySelectorAll('[data-connection-id]').length,
            topbar: !!document.querySelector('.pc-canvas-topbar'),
            canvasListHref: document.querySelector('a[aria-label="返回画布列表"]')?.getAttribute('href') || '',
            saveStatus: document.querySelector('.pc-canvas-save-status')?.getAttribute('aria-label') || '',
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
    assert(Boolean(state.saveStatus), "A6 save status is exposed in the project toolbar", state.saveStatus);
    assert(state.canvasListHref === "/canvas", "A7 top bar provides a direct canvas-list entry", state.canvasListHref);
    assert(cdp.problems.length === 0, "A8 no browser/network problems", JSON.stringify(cdp.problems));
}

async function adjacentGestureScenario(cdp) {
    const ids = ["canvas-p0-text-story", "canvas-p0-text-shot"];
    const positions = () => cdp.evaluate(`(${JSON.stringify(ids)}).map(id => document.querySelector('[data-node-id="' + id + '"]').style.transform)`);
    const before = await positions();
    for (const id of ids) await cdp.drag(`[data-node-id="${id}"] [data-canvas-node-drag-handle]`, 28, 14);
    await sleep(350);
    const moved = await positions();
    assert(moved.every((value, index) => value !== before[index]), "A9 adjacent independent gestures move both nodes");
    await cdp.shortcut("z");
    await sleep(250);
    const undone = await positions();
    assert(undone[0] === moved[0] && undone[1] === before[1], "A10 undo adjacent gesture preserves preceding gesture", JSON.stringify({ before, moved, undone }));
    await cdp.shortcut("z");
    await sleep(250);
    const restored = await positions();
    assert(JSON.stringify(restored) === JSON.stringify(before), "A11 second undo restores first gesture", JSON.stringify({ before, restored }));
}

async function interactionScenario(cdp) {
    console.log("\n=== B. drag, history, copy, search and viewport controls ===");
    const activate = (selector) => cdp.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement)) return false;
        element.click();
        return true;
    })()`);
    const nodeSelector = '[data-node-id="canvas-p0-text-story"] .canvas-node-shell';
    const wrapperSelector = '[data-node-id="canvas-p0-text-story"]';
    const headerMaterial = await cdp.evaluate(`(() => {
        const title = document.querySelector('[data-node-id="canvas-p0-image-reference"] .canvas-node-title-chip');
        const dimension = document.querySelector('[data-node-id="canvas-p0-image-reference"] .canvas-node-dimension-chip');
        const titleBackground = title instanceof HTMLElement ? getComputedStyle(title).backgroundColor : '';
        const dimensionBackground = dimension instanceof HTMLElement ? getComputedStyle(dimension).backgroundColor : '';
        const transparent = (value) => !value || value === 'transparent' || /rgba?\\([^)]*,\\s*0(?:\\.0+)?\\s*\\)$/.test(value);
        return { titleBackground, dimensionBackground, titleOpaque: !transparent(titleBackground), dimensionOpaque: !transparent(dimensionBackground) };
    })()`);
    assert(headerMaterial.titleOpaque && headerMaterial.dimensionOpaque, "B0a node title and dimension use persistent readable surfaces", JSON.stringify(headerMaterial));

    assert(await activate('[aria-label="编辑节点名称：主视觉参考"]') && await cdp.poll(`!!document.querySelector('input[aria-label="节点名称"]')`, "node title editor"), "B0b node title enters edit mode");
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 720, y: 150, buttons: 0 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 720, y: 150, button: "left", buttons: 1, clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 720, y: 150, button: "left", buttons: 0, clickCount: 1 });
    assert(await cdp.poll(`!document.querySelector('input[aria-label="节点名称"]')`, "outside click commits node title"), "B0c clicking blank canvas completes node rename");

    const shellScale = (selector) => cdp.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement)) return 0;
        const transform = getComputedStyle(element).transform;
        return transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
    })()`);
    assert(await cdp.hover('[data-node-id="canvas-p0-image-reference"] .canvas-node-shell'), "B0d media node can receive hover");
    await sleep(240);
    const hoverScale = await shellScale('[data-node-id="canvas-p0-image-reference"] .canvas-node-shell');
    assert(hoverScale === 1, "B0e node hover preserves media and hit-test geometry", `scale=${hoverScale}`);
    const blankHoverPoint = await cdp.evaluate(`(() => {
        const nodes = [...document.querySelectorAll('.node-element')];
        const candidates = [[4, 4], [innerWidth - 4, 4], [4, innerHeight - 4], [innerWidth - 4, innerHeight - 4], [innerWidth / 2, 4]];
        return candidates.find(([x, y]) => !nodes.some((node) => node instanceof HTMLElement && node.contains(document.elementFromPoint(x, y)))) || [innerWidth - 4, innerHeight - 4];
    })()`);
    await cdp.movePointer(blankHoverPoint[0], blankHoverPoint[1]);
    await sleep(240);
    const hoverMotion = await cdp.evaluate(`(() => {
        const element = document.querySelector('[data-node-id="canvas-p0-image-reference"] .canvas-node-shell');
        if (!(element instanceof HTMLElement)) return null;
        const style = getComputedStyle(element);
        return { transitionProperty: style.transitionProperty, transformOrigin: style.transformOrigin };
    })()`);
    assert(hoverMotion?.transitionProperty?.includes("transform") && Boolean(hoverMotion.transformOrigin), "B0f node hover feedback uses a bounded transform transition", JSON.stringify(hoverMotion));

    assert(await cdp.hover('[aria-label="添加节点"]') && await cdp.poll(`!!document.querySelector('.canvas-create-menu-dock')`, "hover add-node menu"), "B0g add-node menu opens from Dock hover");
    await cdp.movePointer(24, 420);
    await sleep(340);
    assert(await cdp.evaluate(`!!document.querySelector('.canvas-create-menu-dock')`), "B0h add-node menu keeps a safe traversal window after leaving the Dock");
    assert(await cdp.poll(`!document.querySelector('.canvas-create-menu-dock')`, "hover add-node menu closes"), "B0i leaving Dock and menu closes after a safe delay");

    await cdp.evaluate(`(() => {
        const canvas = document.querySelector('.pc-canvas-infinite');
        if (!(canvas instanceof HTMLElement)) return false;
        return canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 720, clientY: 160, button: 2, buttons: 2 }));
    })()`);
    assert(await cdp.poll(`document.querySelector('[data-canvas-context-menu]')?.textContent?.includes('画布命令')`, "canvas context menu"), "B0j blank canvas context menu opens");
    assert(await cdp.hover('[data-canvas-context-menu] [aria-label="添加节点"]') && await cdp.poll(`!!document.querySelector('.canvas-create-menu-context')`, "context add-node hover"), "B0k context add-node entry opens on hover");
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.poll(`!document.querySelector('.canvas-create-menu-context')`, "context add-node closes");
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });

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

    const blankClickPoint = await cdp.evaluate(`(() => {
        const canvas = document.querySelector('.pc-canvas-infinite');
        if (!(canvas instanceof HTMLElement)) return null;
        const rect = canvas.getBoundingClientRect();
        for (let y = rect.top + 48; y < rect.bottom - 48; y += 56) {
            for (let x = rect.left + 48; x < rect.right - 48; x += 56) {
                const hit = document.elementFromPoint(x, y);
                if (!hit?.closest('.pc-canvas-infinite')) continue;
                if (hit.closest('[data-node-id],[data-connection-id],[data-canvas-no-zoom]')) continue;
                return [x, y];
            }
        }
        return null;
    })()`);
    assert(Array.isArray(blankClickPoint), "B2a fixture exposes a genuine blank-canvas point", JSON.stringify(blankClickPoint));
    if (Array.isArray(blankClickPoint)) {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: blankClickPoint[0], y: blankClickPoint[1], buttons: 0 });
        await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: blankClickPoint[0], y: blankClickPoint[1], button: "left", buttons: 1, clickCount: 1 });
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: blankClickPoint[0], y: blankClickPoint[1], button: "left", buttons: 0, clickCount: 1 });
    }
    assert(
        await cdp.poll(
            `(() => {
        const state = document.querySelector(${JSON.stringify(nodeSelector)})?.getAttribute('data-node-state');
        return state !== 'selected' && state !== 'focus' && !document.querySelector('[aria-label="节点快捷工具"]');
    })()`,
            "blank click clears node tools",
        ),
        "B2b clicking blank canvas fully dismisses the selected-node toolbar",
    );

    // 历史记录以 180ms 合并连续状态；等事务落盘后再验证撤销/重做。
    await sleep(350);
    await cdp.shortcut("z");
    assert(await cdp.poll(`document.querySelector(${JSON.stringify(wrapperSelector)})?.style.transform === ${JSON.stringify(initialTransform)}`, "undo transform"), "B3 Ctrl+Z restores the original position");
    await sleep(150);
    await cdp.shortcut("y");
    assert(await cdp.poll(`document.querySelector(${JSON.stringify(wrapperSelector)})?.style.transform === ${JSON.stringify(movedTransform)}`, "redo transform"), "B4 Ctrl+Y restores the moved position");
    assert(await cdp.poll(`document.querySelector('.pc-canvas-save-status')?.getAttribute('aria-label')?.startsWith('已保存到本机')`, "local save settled"), "B5 node edits settle into a durable local save");

    await cdp.shortcut("f");
    assert(await cdp.poll(`!!document.querySelector('input[aria-label="搜索画布节点"]')`, "search modal"), "B6 Ctrl+F opens node search");
    await cdp.click('input[aria-label="搜索画布节点"]');
    await cdp.shortcut("a");
    await cdp.send("Input.insertText", { text: "主视觉参考" });
    assert(
        await cdp.poll(`[...document.querySelectorAll('[role="option"]')].some((element) => element.getClientRects().length > 0 && (element.textContent || '').includes('主视觉参考'))`, "matching search result"),
        "B7 search returns the reference image",
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
        "B8 Enter focuses the matching image node",
    );

    // 搜索定位会平滑移动视口；等待动画结束后再验证显式缩放，避免二者互相覆盖。
    await sleep(1000);
    await cdp.evaluate(`(() => { document.querySelector('#canvas-main')?.focus(); return document.activeElement?.id === 'canvas-main'; })()`);
    const scaleBefore = await cdp.evaluate(`Number(getComputedStyle(document.querySelector('.pc-canvas-infinite')).getPropertyValue('--canvas-committed-scale'))`);
    await cdp.shortcut("=");
    const scaleIncreased = await cdp.poll(`Number(getComputedStyle(document.querySelector('.pc-canvas-infinite')).getPropertyValue('--canvas-committed-scale')) > ${scaleBefore}`, "scale increased");
    assert(scaleIncreased, "B9 Ctrl+= increases committed scale", `before=${scaleBefore}`);

    const pressQuestionMark = async () => {
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "?", code: "Slash", windowsVirtualKeyCode: 191, modifiers: 8 });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "?", code: "Slash", windowsVirtualKeyCode: 191, modifiers: 8 });
    };
    const pressEscape = async () => {
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    };
    await pressQuestionMark();
    assert(await cdp.poll(`!!document.querySelector('input[aria-label="搜索画布快捷键"]')`, "shortcuts modal opens"), "B9a ? opens shortcuts in normal mode");
    await pressEscape();
    assert(await cdp.poll(`!document.querySelector('input[aria-label="搜索画布快捷键"]')`, "shortcuts modal closes"), "B9b shortcuts modal closes before focus mode");
    await cdp.evaluate(`(() => { document.querySelector('#canvas-main')?.focus(); })()`);
    await cdp.shortcut("f", { shift: true });
    assert(await cdp.poll(`!!document.querySelector('[aria-label="专注模式工具栏"]') && !document.querySelector('.pc-canvas-topbar')`, "focus mode active"), "B9c focus mode hides the top bar");
    await pressQuestionMark();
    assert(await cdp.poll(`!!document.querySelector('input[aria-label="搜索画布快捷键"]')`, "focus shortcuts modal opens"), "B9d ? opens shortcuts while the top bar is unmounted");
    await pressEscape();
    assert(await cdp.poll(`!document.querySelector('input[aria-label="搜索画布快捷键"]')`, "focus shortcuts modal closes"), "B9e focus shortcuts modal closes");
    await cdp.evaluate(`(() => { document.querySelector('#canvas-main')?.focus(); })()`);
    await cdp.shortcut("f", { shift: true });
    assert(await cdp.poll(`!!document.querySelector('.pc-canvas-topbar') && !document.querySelector('[aria-label="专注模式工具栏"]') && !document.querySelector('input[aria-label="搜索画布快捷键"]')`, "normal mode restored"), "B9f leaving focus mode does not replay a historical shortcuts request");

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
    assert(await cdp.poll(`!!document.querySelector('.pc-canvas-mini-map[aria-label="画布小地图"]')`, "minimap opens"), "B10 minimap opens from the dock");

    // 搜索已经明确选中图片节点；用真实键盘事件覆盖跨组件复制/粘贴链路。
    await cdp.click('[data-node-id="canvas-p0-image-reference"] .canvas-node-shell');
    await cdp.shortcut("c");
    await sleep(200);
    await cdp.shortcut("v");
    assert(await cdp.poll(`document.querySelectorAll('[data-node-id]').length === 5`, "copied node appears"), "B11 Ctrl+C/Ctrl+V duplicates the selected node");
    assert(await activate('[aria-label="画布外观"]') && await cdp.poll(`!!document.querySelector('[aria-label="画布底纹：点阵"]')`, "appearance panel"), "B12 appearance panel opens");
    assert(await activate('[aria-label="画布底纹：点阵"]'), "B13 dot background can be selected");
    const dotGrid = await cdp.evaluate(`(() => {
        const layer = document.querySelector('[data-canvas-grid-layer]');
        if (!(layer instanceof HTMLElement)) return null;
        const style = getComputedStyle(layer);
        return { backgroundImage: style.backgroundImage, opacity: Number(style.opacity) };
    })()`);
    assert(Boolean(dotGrid?.backgroundImage?.includes("radial-gradient")) && dotGrid.opacity >= 0.6, "B14 dot background is visibly rendered", JSON.stringify(dotGrid));
    assert(await activate('[aria-label="画布外观"]') && await cdp.poll(`!document.querySelector('[aria-label="画布底纹：点阵"]')`, "appearance panel closes"), "B15 appearance panel closes");
    assert(await activate('[aria-label="更多画布操作"]') && await cdp.poll(`!!document.querySelector('[aria-label="自定义工具栏"]')`, "more panel"), "B16 more panel opens");
    assert(await activate('[aria-label="自定义工具栏"]') && await cdp.poll(`!!document.querySelector('.canvas-toolbar-settings-modal')`, "toolbar settings"), "B17 toolbar settings opens");
    const settingsLayout = await cdp.evaluate(`(() => {
        const cards = [...document.querySelectorAll('.canvas-toolbar-settings-card')];
        const rects = cards.map((card) => card.getBoundingClientRect());
        return {
            count: cards.length,
            columns: new Set(rects.map((rect) => Math.round(rect.left))).size,
            rows: new Set(rects.map((rect) => Math.round(rect.top))).size,
            maxHeight: Math.max(0, ...rects.map((rect) => rect.height)),
        };
    })()`);
    assert(settingsLayout.count === 9 && settingsLayout.columns === 2 && settingsLayout.rows === 5 && settingsLayout.maxHeight <= 64, "B18 toolbar settings uses compact two-column rows", JSON.stringify(settingsLayout));
    assert(await activate('[aria-label="关闭工具栏设置"]') && await cdp.poll(`!document.querySelector('.canvas-toolbar-settings-modal')`, "toolbar settings closes"), "B19 toolbar settings closes");
    const agentClosedBaseline = await cdp.evaluate(`(() => {
        const viewport = document.querySelector('.pc-canvas-workspace__viewport');
        if (!(viewport instanceof HTMLElement)) return null;
        const rect = viewport.getBoundingClientRect();
        return {
            viewportWidth: rect.width,
            mountedNodes: document.querySelectorAll('[data-node-id]').length,
            mountedVideos: document.querySelectorAll('.pc-canvas-workspace__viewport video').length,
            localMounted: Boolean(document.querySelector('[data-canvas-agent-mode="local"]')),
        };
    })()`);
    assert(Boolean(agentClosedBaseline) && !agentClosedBaseline.localMounted, "B20 website Agent does not pre-mount the local runtime", JSON.stringify(agentClosedBaseline));
    assert(
        await activate('.pc-canvas-agent-button')
            && await cdp.poll(`document.querySelector('.pc-canvas-assistant-column')?.getAttribute('data-state') === 'open' && !!document.querySelector('.pc-canvas-assistant-panel:not([aria-hidden="true"])')`, "Agent panel opens"),
        "B21 Agent panel opens from the project bar",
    );
    const agentOpenLayout = await cdp.evaluate(`(() => {
        const viewport = document.querySelector('.pc-canvas-workspace__viewport');
        if (!(viewport instanceof HTMLElement)) return null;
        const rect = viewport.getBoundingClientRect();
        const panel = document.querySelector('.pc-canvas-assistant-column')?.getBoundingClientRect();
        const panelColumn = document.querySelector('.pc-canvas-assistant-column');
        const dock = document.querySelector('[aria-label="画布创作工具"] > .canvas-floating-dock')?.getBoundingClientRect();
        const trigger = document.querySelector('.pc-canvas-agent-button');
        const triggerRect = trigger instanceof HTMLElement ? trigger.getBoundingClientRect() : null;
        const triggerHit = triggerRect ? document.elementFromPoint(triggerRect.left + triggerRect.width / 2, triggerRect.top + triggerRect.height / 2) : null;
        return {
            viewportWidth: rect.width,
            mountedNodes: document.querySelectorAll('[data-node-id]').length,
            mountedVideos: document.querySelectorAll('.pc-canvas-workspace__viewport video').length,
            localMounted: Boolean(document.querySelector('[data-canvas-agent-mode="local"]')),
            columnBackgroundTransparent: panelColumn instanceof HTMLElement && ['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(panelColumn).backgroundColor),
            dockPanelOverlap: panel && dock ? Math.max(0, Math.min(panel.right, dock.right) - Math.max(panel.left, dock.left)) : 0,
            topbarTriggerReachable: trigger instanceof HTMLElement && triggerHit instanceof Node && (trigger === triggerHit || trigger.contains(triggerHit)),
        };
    })()`);
    assert(
        Boolean(agentOpenLayout)
            && Math.abs(agentOpenLayout.viewportWidth - agentClosedBaseline.viewportWidth) < 1
            && agentOpenLayout.mountedNodes === agentClosedBaseline.mountedNodes
            && agentOpenLayout.mountedVideos === agentClosedBaseline.mountedVideos
            && agentOpenLayout.columnBackgroundTransparent
            && agentOpenLayout.dockPanelOverlap < 1
            && agentOpenLayout.topbarTriggerReachable,
        "B22 Agent overlays without resizing, reculling or covering primary canvas controls",
        JSON.stringify({ closed: agentClosedBaseline, open: agentOpenLayout }),
    );
    assert(!agentOpenLayout.localMounted, "B23 website mode keeps the local Agent runtime lazy", JSON.stringify(agentOpenLayout));
    await cdp.evaluate(`document.querySelector('.pc-canvas-assistant-panel')?.setAttribute('data-e2e-panel-instance', 'stable')`);
    assert(await activate('[aria-label="Agent 运行位置"] button:nth-of-type(2)') && await cdp.poll(`(() => { const layer = document.querySelector('[data-canvas-agent-mode="local"]'); return !!layer && !layer.textContent?.includes('正在准备本机 Agent'); })()`, "local Agent mounts", 20000), "B24 local Agent loads only after explicit mode selection");
    assert(await activate('[aria-label="Agent 运行位置"] button:nth-of-type(1)'), "B25 Agent can switch back to website mode");
    const preservedLocalAgent = await cdp.evaluate(`(() => {
        const panel = document.querySelector('.pc-canvas-assistant-panel');
        const localLayer = document.querySelector('[data-canvas-agent-mode="local"]');
        return {
            stablePanel: panel?.getAttribute('data-e2e-panel-instance') === 'stable',
            localStillMounted: Boolean(localLayer),
            localHidden: localLayer instanceof HTMLElement && getComputedStyle(localLayer).display === 'none',
        };
    })()`);
    assert(preservedLocalAgent.stablePanel && preservedLocalAgent.localStillMounted && preservedLocalAgent.localHidden, "B26 Agent mode switch preserves the panel and local session tree", JSON.stringify(preservedLocalAgent));
    assert(await activate('[aria-label="Agent 运行位置"] button:nth-of-type(2)') && await cdp.poll(`document.querySelector('[aria-label="Agent 运行位置"] button:nth-of-type(2)')?.getAttribute('aria-pressed') === 'true'`, "local Agent returns"), "B27 returning to local Agent is immediate");
    assert(!(await cdp.evaluate(`document.querySelector('.pc-canvas-assistant-panel')?.textContent?.includes('正在准备本机 Agent') || false`)), "B28 returning to local Agent does not rebuild the runtime");
    assert(
        await activate('[aria-label="收起 Agent"]')
            && await cdp.poll(`(() => {
                const column = document.querySelector('.pc-canvas-assistant-column');
                const active = document.activeElement;
                return column?.getAttribute('data-state') === 'closed'
                    && column?.hasAttribute('inert')
                    && document.querySelector('.pc-canvas-assistant-panel')?.getAttribute('aria-hidden') === 'true'
                    && active instanceof HTMLElement
                    && active.matches('.pc-canvas-agent-button, [aria-label="智能体"]');
            })()`, "Agent panel closes"),
        "B29 Agent panel closes inertly, restores focus and preserves its session tree",
    );
    assert(
        await activate('.pc-canvas-agent-button')
            && await cdp.poll(`document.querySelector('.pc-canvas-assistant-column')?.getAttribute('data-state') === 'open' && document.querySelector('.pc-canvas-assistant-panel')?.getAttribute('data-e2e-panel-instance') === 'stable'`, "Agent panel reopens"),
        "B30 reopening Agent reuses the mounted panel instance",
    );
    const reopenedLocalAgent = await cdp.evaluate(`(() => {
        const layer = document.querySelector('[data-canvas-agent-mode="local"]');
        return {
            exists: Boolean(layer),
            visible: layer instanceof HTMLElement && getComputedStyle(layer).display !== 'none',
        };
    })()`);
    assert(reopenedLocalAgent.exists && reopenedLocalAgent.visible, "B31 reopening Agent preserves the selected local mode and runtime", JSON.stringify(reopenedLocalAgent));
    assert(await activate('[aria-label="收起 Agent"]') && await cdp.poll(`document.querySelector('.pc-canvas-assistant-column')?.getAttribute('data-state') === 'closed'`, "Agent panel closes after reopen"), "B32 Agent can be left safely collapsed");
    assert(cdp.problems.length === 0, "B33 no browser/network problems", JSON.stringify(cdp.problems));
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
    const activate = (selector) => cdp.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!(element instanceof HTMLElement)) return false;
        element.click();
        return true;
    })()`);
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
    assert(await activate('.pc-canvas-agent-button') && await cdp.poll(`document.querySelector('.pc-canvas-assistant-column')?.getAttribute('data-state') === 'open' && !!document.querySelector('.pc-canvas-assistant-panel:not([aria-hidden="true"])')`, "compact Agent opens"), "D4 compact PC can open Agent");
    // Dock 与模式切换使用 200–300ms 的位置过渡，等待其进入最终可交互位置再测遮挡。
    await sleep(380);
    const compactOverlay = await cdp.evaluate(`(() => {
        const panel = document.querySelector('.pc-canvas-assistant-column')?.getBoundingClientRect();
        const dock = document.querySelector('[aria-label="画布创作工具"] > .canvas-floating-dock')?.getBoundingClientRect();
        const modeSwitch = document.querySelector('.pc-canvas-workspace__mode-switch')?.getBoundingClientRect();
        return {
            panel: panel ? { left: panel.left, right: panel.right, width: panel.width } : null,
            dock: dock ? { left: dock.left, right: dock.right, width: dock.width } : null,
            dockOverlap: panel && dock ? Math.max(0, Math.min(panel.right, dock.right) - Math.max(panel.left, dock.left)) : null,
            modeSwitchOverlap: panel && modeSwitch ? Math.max(0, Math.min(panel.right, modeSwitch.right) - Math.max(panel.left, modeSwitch.left)) : 0,
        };
    })()`);
    assert(compactOverlay.panel && compactOverlay.dock && compactOverlay.dockOverlap < 1 && compactOverlay.modeSwitchOverlap < 1, "D5 compact toolbar and mode switch remain outside the Agent drawer", JSON.stringify(compactOverlay));
    assert(await activate('[aria-label="收起 Agent"]') && await cdp.poll(`document.querySelector('.pc-canvas-assistant-column')?.getAttribute('data-state') === 'closed'`, "compact Agent closes"), "D6 compact Agent can close");
    assert(cdp.problems.length === 0, "D7 no browser/network problems at compact viewport", JSON.stringify(cdp.problems));
}

async function largeWorkspaceScenario(cdp, url) {
    console.log("\n=== E. large workspace culling and responsiveness ===");
    if (!(await cdp.poll(`document.querySelector('.pc-canvas-save-status')?.getAttribute('aria-label')?.startsWith('已保存到本机')`, "current fixture save settled"))) {
        throw new Error("Current fixture did not finish its local save before route transition");
    }
    const startedAt = Date.now();
    await cdp.navigate(url);
    const mountMs = Date.now() - startedAt;
    const state = await cdp.evaluate(`(() => ({
        title: document.querySelector('.canvas-topbar-title-row button')?.textContent?.trim() || '',
        renderedNodes: document.querySelectorAll('[data-node-id]').length,
        renderedConnections: document.querySelectorAll('[data-connection-id]').length,
        saveStatus: document.querySelector('.pc-canvas-save-status')?.getAttribute('aria-label') || '',
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }))()`);
    assert(state.title === "大型画布性能验收夹具", "E1 large fixture route mounted", JSON.stringify(state));
    assert(state.renderedNodes >= 4 && state.renderedNodes < 80, "E2 viewport culling limits mounted node DOM", `rendered=${state.renderedNodes} of 324`);
    assert(state.renderedConnections < 120, "E3 viewport culling limits mounted connection DOM", `rendered=${state.renderedConnections} of 612`);
    assert(mountMs < 10000, "E4 large workspace becomes interactive within budget", `${mountMs}ms`);
    assert(Boolean(state.saveStatus) && state.overflow <= 1, "E5 large workspace keeps save feedback and layout integrity", JSON.stringify(state));
    assert(cdp.problems.length === 0, "E6 no browser/network problems on large workspace", JSON.stringify(cdp.problems));
}

async function canvasPerformanceScenario(cdp, url) {
    console.log("\n=== F. large canvas drag, resize and frame timings ===");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    // E can finish while the newly loaded fixture is still saving. Wait before
    // navigating again so beforeunload does not contaminate gesture diagnostics.
    const hasCurrentCanvas = await cdp.evaluate(`Boolean(document.querySelector('.pc-canvas-save-status'))`);
    if (hasCurrentCanvas && !(await cdp.poll(`document.querySelector('.pc-canvas-save-status')?.getAttribute('aria-label')?.startsWith('已保存到本机')`, "pre-performance fixture save settled"))) {
        throw new Error("Current fixture did not finish its local save before performance sampling");
    }
    await cdp.navigate(url);
    await cdp.send("Performance.enable");
    // Observe the real store after loading the isolated fixture; no account or generation request is needed.
    await cdp.evaluate(`(async () => {
        const { useCanvasStore } = await import('/src/stores/canvas/use-canvas-store.ts');
        window.__canvasPerfStore = useCanvasStore;
    })()`);
    const views = process.env.CANVAS_PERF_VIEW === "overview" ? [true] : [false, true];
    for (const overview of views) {
        if (overview) {
            const fitted = await cdp.click('[aria-label="适应画布"]');
            if (!fitted) throw new Error("Fit canvas control was not available");
        }
        await sleep(1600);
        const target = await cdp.evaluate(`(() => {
            const candidates = [...document.querySelectorAll('[data-node-id]')].map(element => {
                const shell = element.querySelector('.canvas-node-shell');
                const rect = shell?.getBoundingClientRect();
                if (!rect || rect.width < 12 || rect.height < 12) return null;
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                if (x < 200 || x > innerWidth - 200 || y < 180 || y > innerHeight - 220) return null;
                const hit = document.elementFromPoint(x, y);
                if (!hit || !element.contains(hit)) return null;
                return { id: element.dataset.nodeId, x, y, distance: Math.hypot(x-innerWidth/2,y-innerHeight/2) };
            }).filter(Boolean).sort((a,b) => a.distance-b.distance);
            return candidates[0];
        })()`);
        if (!target) throw new Error("No unobscured fixture node available for drag");
        for (let trial = 1; trial <= 3; trial += 1) {
            const sample = await measureCanvasGesture(cdp, target.id, "drag", overview, trial);
            performanceSamples.push(sample);
            console.log(`      PERF ${JSON.stringify(sample)}`);
            assert(sample.changed && sample.persisted, `F drag ${overview ? "overview" : "detail"} ${trial} commits final position`, JSON.stringify({ changed: sample.changed, persisted: sample.persisted }));
        }
        const resize = await measureCanvasGesture(cdp, target.id, "resize", overview, 1);
        performanceSamples.push(resize);
        console.log(`      PERF ${JSON.stringify(resize)}`);
        assert(resize.changed && resize.persisted, `F resize ${overview ? "overview" : "detail"} commits final size`, JSON.stringify({ changed: resize.changed, persisted: resize.persisted }));
        await cdp.shortcut("z");
        const restored = await cdp.poll(`(() => {
            const node = window.__canvasPerfStore.getState().projects.find(p => p.id === ${JSON.stringify(LARGE_FIXTURE_ID)})?.nodes.find(n => n.id === ${JSON.stringify(target.id)});
            return node?.width === ${resize.before.width} && node?.height === ${resize.before.height};
        })()`, "resize undo restored original size");
        assert(restored, `F resize ${overview ? "overview" : "detail"} undo restores original size`);
        if (!overview && await cdp.evaluate(`Boolean(document.querySelector('[data-canvas-resize-handle]'))`)) await cancelResizeScenario(cdp, target.id);
    }
    assert(cdp.problems.length === 0, "F no browser errors during performance gestures", JSON.stringify(cdp.problems));
}

async function cancelResizeScenario(cdp, nodeId) {
    const selector = `[data-node-id="${nodeId}"]`;
    // A small header drag selects the node without opening its inline editor.
    await cdp.movePointer(100, 60);
    const selected = await cdp.drag(`${selector} [data-canvas-node-drag-handle]`, 8, 4);
    if (!selected) throw new Error("Cannot select cancellation target through its drag handle");
    for (const key of ["Escape", "undo"]) {
        await cdp.hover(selector);
        await sleep(200);
        const setup = await cdp.evaluate(`(() => {
            const node = document.querySelector(${JSON.stringify(selector)});
            const handle = node?.querySelector('[data-canvas-resize-handle="bottom-right"]');
            const rect = handle?.getBoundingClientRect();
            return rect ? { x: rect.left+rect.width/2, y: rect.top+rect.height/2, width: parseFloat(node.style.width), height: parseFloat(node.style.height), transform: node.style.transform,
                selected: [...document.querySelectorAll('[data-node-id]')].filter(n => n.className.includes('z-[var(--z-node-active)]')).map(n => n.dataset.nodeId) } : null;
        })()`);
        if (!setup) throw new Error("Resize cancellation handle missing");
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: setup.x, y: setup.y, buttons: 0 });
        await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: setup.x, y: setup.y, button: "left", buttons: 1, clickCount: 1 });
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: setup.x+32, y: setup.y+20, button: "left", buttons: 1 });
        const previewed = await cdp.poll(`Boolean(document.querySelector('[data-canvas-resize-active="true"]')) && parseFloat(document.querySelector(${JSON.stringify(selector)}).style.width) !== ${setup.width}`, "cancel gesture has visible preview");
        assert(previewed, `F ${key} cancellation starts from a visible resize preview`);
        if (key === "undo") await cdp.shortcut("z");
        else {
            await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
            await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        }
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: setup.x+32, y: setup.y+20, button: "left", buttons: 0, clickCount: 1 });
        const cancelled = await cdp.poll(`(() => {
            const element = document.querySelector(${JSON.stringify(selector)});
            const node = window.__canvasPerfStore.getState().projects.find(p => p.id === ${JSON.stringify(LARGE_FIXTURE_ID)})?.nodes.find(n => n.id === ${JSON.stringify(nodeId)});
            const selected = [...document.querySelectorAll('[data-node-id]')].filter(n => n.className.includes('z-[var(--z-node-active)]')).map(n => n.dataset.nodeId);
            return !document.querySelector('[data-canvas-resize-active="true"]') && parseFloat(element?.style.width) === ${setup.width}
                && element?.style.transform === ${JSON.stringify(setup.transform)} && node?.width === ${setup.width} && node?.height === ${setup.height} && JSON.stringify(selected) === ${JSON.stringify(JSON.stringify(setup.selected))};
        })()`, "cancel preserves stored dimensions and selection");
        assert(cancelled, `F ${key} cancels resize without changing dimensions or selection`);
    }
}

async function measureCanvasGesture(cdp, nodeId, kind, overview, trial) {
    const selector = `[data-node-id="${nodeId}"]`;
    if (kind === "resize" && !(await cdp.click(selector))) throw new Error(`Cannot select resize target ${nodeId}`);
    await cdp.hover(selector);
    await sleep(160);
    const setup = await cdp.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        const shell = element?.querySelector('.canvas-node-shell');
        const handle = element?.querySelector('[data-canvas-resize-handle="bottom-right"]')
            || [...(element?.querySelectorAll('.cursor-nwse-resize') || [])].find(item => item.className.includes('-right-'));
        const rect = (${JSON.stringify(kind)} === 'resize' ? handle : shell)?.getBoundingClientRect();
        const project = window.__canvasPerfStore.getState().projects.find(p => p.id === ${JSON.stringify(LARGE_FIXTURE_ID)});
        const node = project?.nodes.find(n => n.id === ${JSON.stringify(nodeId)});
        if (!rect || !node) return null;
        const x = rect.left + rect.width/2;
        const y = rect.top + rect.height/2;
        const hit = document.elementFromPoint(x,y);
        return { x, y, hitNodeId: hit?.closest('[data-node-id]')?.getAttribute('data-node-id'), handleHit: Boolean(handle && (hit === handle || handle.contains(hit))),
            hitClass: hit?.getAttribute('class'), incrementalResize: Boolean(handle?.hasAttribute('data-canvas-resize-handle')),
            before: { x: node.position.x, y: node.position.y, width: node.width, height: node.height },
            mounted: document.querySelectorAll('[data-node-id]').length,
            connections: document.querySelectorAll('[data-connection-id]').length };
    })()`);
    if (!setup) throw new Error(`Cannot locate ${kind} target ${nodeId}`);
    if (setup.hitNodeId !== nodeId) throw new Error(`Gesture target is occluded: ${JSON.stringify(setup)}`);
    const readMetrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(item => [item.name, item.value]));
    const beforeMetrics = await readMetrics();
    await cdp.evaluate(`(() => {
        const state = { frames: [], longTasks: [], updates: 0, stopped: false, last: performance.now(), started: performance.now() };
        state.observer = new PerformanceObserver(list => state.longTasks.push(...list.getEntries().map(entry => entry.duration)));
        state.observer.observe({ type: 'longtask', buffered: false });
        state.unsubscribe = window.__canvasPerfStore.subscribe((next, previous) => { if (next.projects !== previous.projects) state.updates++; });
        const frame = now => { if (state.stopped) return; state.frames.push(now-state.last); state.last=now; state.raf=requestAnimationFrame(frame); };
        state.raf=requestAnimationFrame(frame);
        window.__canvasPerfSample = state;
    })()`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: setup.x, y: setup.y, buttons: 0 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: setup.x, y: setup.y, button: "left", buttons: 1, clickCount: 1 });
    if (kind === "resize" && setup.incrementalResize) {
        const active = await cdp.evaluate(`Boolean(document.querySelector('[data-canvas-resize-active="true"]'))`);
        if (!active) throw new Error(`Resize did not acquire the pointer: ${JSON.stringify(setup)}`);
    }
    const dx = kind === "resize" ? (overview ? 12 : 50) : 55;
    const dy = kind === "resize" ? (overview ? 8 : 30) : 35;
    for (let step = 1; step <= 60; step += 1) {
        const fraction = step / 60;
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: setup.x + dx*fraction, y: setup.y + dy*fraction, button: "left", buttons: 1 });
        await sleep(12);
    }
    const updatesDuringGesture = await cdp.evaluate("window.__canvasPerfSample.updates");
    const previewChanged = kind !== "resize" || await cdp.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        return element && (parseFloat(element.style.width) !== ${setup.before.width} || parseFloat(element.style.height) !== ${setup.before.height});
    })()`);
    if (kind === "resize") assert(previewChanged, `F resize ${overview ? "overview" : "detail"} visibly previews before release`);
    if (kind === "resize" && setup.incrementalResize) assert(updatesDuringGesture === 0, `F resize ${overview ? "overview" : "detail"} keeps project state unchanged during preview`, `updates=${updatesDuringGesture}`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: setup.x + dx, y: setup.y + dy, button: "left", buttons: 0, clickCount: 1 });
    // Include deferred history and local persistence work in the sample.
    await sleep(900);
    const sample = await cdp.evaluate(`(() => {
        const state = window.__canvasPerfSample;
        state.stopped=true;
        cancelAnimationFrame(state.raf);
        state.longTasks.push(...state.observer.takeRecords().map(entry => entry.duration));
        state.observer.disconnect();
        state.unsubscribe();
        const sorted = state.frames.slice(1).sort((a,b) => a-b);
        const quantile = q => sorted[Math.min(sorted.length-1, Math.floor(sorted.length*q))] || 0;
        const node = window.__canvasPerfStore.getState().projects.find(p => p.id === ${JSON.stringify(LARGE_FIXTURE_ID)})?.nodes.find(n => n.id === ${JSON.stringify(nodeId)});
        return { elapsedMs: performance.now()-state.started, frames: sorted.length, frameP50: quantile(.5), frameP95: quantile(.95), frameMax: quantile(1),
            longTasks: state.longTasks.length, longTaskMs: state.longTasks.reduce((a,b) => a+b,0), storeUpdates: state.updates,
            after: node ? { x: node.position.x, y: node.position.y, width: node.width, height: node.height } : null };
    })()`);
    const afterMetrics = await readMetrics();
    const changed = Boolean(sample.after && (kind === "resize" ? sample.after.width !== setup.before.width || sample.after.height !== setup.before.height : sample.after.x !== setup.before.x || sample.after.y !== setup.before.y));
    const persisted = await cdp.poll(`document.querySelector('.pc-canvas-save-status')?.getAttribute('aria-label')?.startsWith('已保存到本机')`, "gesture persistence settled");
    return {
        kind, view: overview ? "overview" : "detail", trial, nodeId, mountedNodes: setup.mounted, mountedConnections: setup.connections,
        before: setup.before, ...sample, changed, persisted, previewChanged, updatesDuringGesture,
        scriptMs: (afterMetrics.ScriptDuration-beforeMetrics.ScriptDuration)*1000,
        layoutMs: (afterMetrics.LayoutDuration-beforeMetrics.LayoutDuration)*1000,
        taskMs: (afterMetrics.TaskDuration-beforeMetrics.TaskDuration)*1000,
    };
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
    const largeUrl = `${baseUrl}/dev/canvas-repro/${LARGE_FIXTURE_ID}`;
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
        if (!process.env.CANVAS_PERF_ONLY) {
            await shellScenario(cdp, url);
            await adjacentGestureScenario(cdp);
            const movedTransform = await interactionScenario(cdp);
            await persistenceScenario(cdp, url, movedTransform);
            await compactViewportScenario(cdp);
            await largeWorkspaceScenario(cdp, largeUrl);
        }
        await canvasPerformanceScenario(cdp, largeUrl);
    } catch (error) {
        fail("runner threw", String(error?.stack || error));
        if (cdp && process.env.CANVAS_PERF_REPORT) {
            const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" }).catch(() => null);
            if (screenshot) {
                mkdirSync(dirname(process.env.CANVAS_PERF_REPORT), { recursive: true });
                writeFileSync(process.env.CANVAS_PERF_REPORT.replace(/\.json$/, "-failure.png"), Buffer.from(screenshot.data, "base64"));
            }
        }
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
    if (process.env.CANVAS_PERF_REPORT) {
        mkdirSync(dirname(process.env.CANVAS_PERF_REPORT), { recursive: true });
        writeFileSync(process.env.CANVAS_PERF_REPORT, JSON.stringify({ environment: "Chrome headless / SwiftShader / Vite DEV / 1366x900 / DPR 1", results, samples: performanceSamples }, null, 2));
    }
    console.log(`\nCanvas P0 E2E: ${passed} passed, ${failures} failed, ${results.length} total`);
    for (const item of results.filter((entry) => !entry.ok)) console.log(`  FAILED: ${item.name} — ${item.detail}`);
    if (failures) process.exit(1);
}

main().catch((error) => {
    console.error(error?.stack || error);
    process.exit(1);
});
