/**
 * 短剧本机交付包 Chrome 验收。
 *
 * 启动临时 Vite 与隔离 Chrome profile，在浏览器内生成两个微型 WebM，
 * 将其拦截为 DEV 复现台的镜头资源，实际执行 FFmpeg 合成、ZIP 下载与解包校验。
 * 不连接后端、不需要账号、不触发任何模型。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { unzipSync } from "fflate";

const CHROME_CANDIDATES = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const passes = [];
let failures = 0;

async function stopChild(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await Promise.race([exited, sleep(3_000)]);
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGKILL");
    await Promise.race([exited, sleep(1_000)]);
}

function assert(condition, name, detail = "") {
    if (condition) {
        passes.push(name);
        console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
        return true;
    }
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    return false;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            server.close(() => resolve(address.port));
        });
    });
}

async function waitForURL(url, timeout = 60_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return;
        } catch {
            // 服务尚未就绪。
        }
        await sleep(150);
    }
    throw new Error(`Timed out waiting for ${url}`);
}

function launchVite(port) {
    const child = spawn("bunx", ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout.on("data", (chunk) => { log += chunk; });
    child.stderr.on("data", (chunk) => { log += chunk; });
    return { child, log: () => log };
}

async function launchChrome(port, profileDir, downloadDir) {
    const executable = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
    if (!executable) throw new Error(`No Chrome binary found. Tried:\n${CHROME_CANDIDATES.join("\n")}`);
    const child = spawn(executable, [
        "--headless=new",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--autoplay-policy=no-user-gesture-required",
        "--window-size=1440,1000",
        "about:blank",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (chunk) => { log += chunk; });
    child.stderr.on("data", (chunk) => { log += chunk; });
    await waitForURL(`http://127.0.0.1:${port}/json/version`);
    return { child, log: () => log, downloadDir };
}

async function connectCDP(port) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const target = targets.find((item) => item.type === "page");
    if (!target) throw new Error("Chrome did not expose a page target");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("CDP websocket timeout")), 20_000);
        ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
        ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP websocket error")); }, { once: true });
    });

    let nextId = 0;
    const pending = new Map();
    const problems = [];
    const videos = new Map();
    const metadataChecks = [];
    const send = (method, params = {}) => {
        const id = ++nextId;
        return new Promise((resolve, reject) => {
            const waiter = { resolve, reject, timer: undefined };
            pending.set(id, waiter);
            ws.send(JSON.stringify({ id, method, params }));
            waiter.timer = setTimeout(() => {
                if (!pending.has(id)) return;
                pending.delete(id);
                reject(new Error(`CDP timeout: ${method}`));
            }, 120_000);
        });
    };
    const record = (kind, value) => {
        const text = String(value || "").trim();
        if (text) problems.push({ kind, text });
    };
    ws.addEventListener("message", (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.id && pending.has(message.id)) {
            const waiter = pending.get(message.id);
            pending.delete(message.id);
            clearTimeout(waiter.timer);
            if (message.error) waiter.reject(new Error(`CDP error: ${JSON.stringify(message.error)}`));
            else waiter.resolve(message.result);
            return;
        }
        const params = message.params || {};
        if (message.method === "Runtime.exceptionThrown") record("exception", params.exceptionDetails?.exception?.description || params.exceptionDetails?.text);
        if (message.method === "Log.entryAdded" && params.entry?.level === "error") record("log.error", params.entry.text);
        if (message.method === "Runtime.consoleAPICalled" && params.type === "error") record("console.error", (params.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" "));
        if (message.method === "Network.loadingFailed" && params.errorText !== "net::ERR_ABORTED") record("network.failed", params.errorText);
        if (message.method === "Fetch.requestPaused") {
            let pathname = "";
            try { pathname = new URL(params.request.url).pathname; } catch { /* continue below */ }
            const fileResourceId = pathname.match(/\/api\/resources\/(delivery-resource-[12])\/file$/)?.[1];
            const metadataResourceId = pathname.match(/\/api\/resources\/(delivery-resource-[12])$/)?.[1];
            const videoBody = fileResourceId ? videos.get(fileResourceId) : undefined;
            const metadataVideoBody = metadataResourceId ? videos.get(metadataResourceId) : undefined;
            if (metadataResourceId && metadataVideoBody) metadataChecks.push(metadataResourceId);
            const metadataBody = metadataResourceId && metadataVideoBody
                ? Buffer.from(JSON.stringify({
                    code: 0,
                    msg: "ok",
                    data: { resource: { id: metadataResourceId, kind: "video", status: "ready", size: Buffer.from(metadataVideoBody, "base64").byteLength } },
                })).toString("base64")
                : undefined;
            const action = videoBody
                ? send("Fetch.fulfillRequest", {
                    requestId: params.requestId,
                    responseCode: 200,
                    responseHeaders: [{ name: "Content-Type", value: "video/webm" }, { name: "Cache-Control", value: "no-store" }],
                    body: videoBody,
                })
                : metadataBody
                    ? send("Fetch.fulfillRequest", {
                        requestId: params.requestId,
                        responseCode: 200,
                        responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Cache-Control", value: "no-store" }],
                        body: metadataBody,
                    })
                    : send("Fetch.continueRequest", { requestId: params.requestId });
            action.catch((error) => record("fetch.intercept", error.message));
        }
    });

    await Promise.all([
        send("Runtime.enable"),
        send("Page.enable"),
        send("Log.enable"),
        send("Network.enable"),
        send("Fetch.enable", { patterns: [{ urlPattern: "*/api/resources/*", requestStage: "Request" }] }),
    ]);
    const evaluate = async (expression) => {
        const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    };
    const poll = async (expression, timeout = 30_000) => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const value = await evaluate(expression);
            if (value) return value;
            await sleep(150);
        }
        return null;
    };
    const click = async (selector) => {
        const box = await poll(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!(element instanceof HTMLElement)) return null; const rect = element.getBoundingClientRect(); return rect.width && rect.height ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null; })()`);
        if (!box) return false;
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", buttons: 1, clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", buttons: 0, clickCount: 1 });
        return true;
    };
    return { send, evaluate, poll, click, problems, videos, metadataChecks, close: () => ws.close() };
}

async function generateVideo(cdp, color, direction) {
    return cdp.evaluate(`(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 96; canvas.height = 54;
        const context = canvas.getContext('2d');
        const stream = canvas.captureStream(12);
        const mimeType = ['video/webm;codecs=vp8', 'video/webm'].find((item) => MediaRecorder.isTypeSupported(item));
        if (!mimeType) throw new Error('MediaRecorder WebM is unavailable');
        const chunks = [];
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 180000 });
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
        recorder.start(80);
        for (let frame = 0; frame < 12; frame += 1) {
            context.fillStyle = ${JSON.stringify(color)};
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = '#ffffff';
            const x = ${direction > 0 ? "frame * 6" : "66 - frame * 6"};
            context.fillRect(x, 20, 28, 14);
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        recorder.stop();
        await stopped;
        stream.getTracks().forEach((track) => track.stop());
        const bytes = new Uint8Array(await new Blob(chunks, { type: mimeType }).arrayBuffer());
        let binary = '';
        for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        return btoa(binary);
    })()`);
}

async function waitForDownload(directory, timeout = 120_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const names = readdirSync(directory);
        const zip = names.find((name) => name.endsWith(".zip"));
        if (zip && !names.some((name) => name.endsWith(".crdownload"))) return join(directory, zip);
        await sleep(200);
    }
    throw new Error("Delivery ZIP download timed out");
}

const tempRoot = mkdtempSync(join(tmpdir(), "open-ai-canvas-delivery-e2e-"));
const profileDir = join(tempRoot, "chrome-profile");
const downloadDir = join(tempRoot, "downloads");
mkdirSync(downloadDir, { recursive: true });
let vite;
let chrome;
let cdp;

try {
    const [vitePort, chromePort] = await Promise.all([freePort(), freePort()]);
    vite = launchVite(vitePort);
    await waitForURL(`http://127.0.0.1:${vitePort}/dev/project-delivery-repro`);
    chrome = await launchChrome(chromePort, profileDir, downloadDir);
    cdp = await connectCDP(chromePort);
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir, eventsEnabled: true });

    cdp.videos.set("delivery-resource-1", await generateVideo(cdp, "#c63b3b", 1));
    cdp.videos.set("delivery-resource-2", await generateVideo(cdp, "#2457c5", -1));
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${vitePort}/dev/project-delivery-repro` });
    assert(await cdp.poll(`Boolean(document.querySelector('[data-delivery-repro]'))`, 30_000), "DEV 交付复现台已加载");
    const localExportSelector = '[data-testid="project-delivery-local-export"]';
    const gate = await cdp.evaluate(`(() => { const button = document.querySelector(${JSON.stringify(localExportSelector)}); return { enabled: button instanceof HTMLButtonElement && !button.disabled, text: document.body.innerText }; })()`);
    assert(gate.enabled, "2 / 2 镜头时交付按钮可用");
    assert(gate.text.includes("2 / 2") && gate.text.includes("历史过期产物") && gate.text.includes("1"), "旧过期产物只提示不阻断");
    assert(await cdp.click(localExportSelector), "交付按钮已通过真实指针事件触发");
    assert(await cdp.poll(`Boolean(document.querySelector('[data-delivery-local-progress]'))`, 10_000), "页面展示本地合成进度");

    const zipPath = await waitForDownload(downloadDir, 180_000);
    const entries = unzipSync(readFileSync(zipPath));
    const names = Object.keys(entries);
    const finalVideoName = names.find((name) => name.startsWith("成片/") && name.endsWith(".mp4"));
    const srtName = names.find((name) => name.startsWith("字幕/") && name.endsWith(".srt"));
    assert(names.length === 7, "ZIP 包含 7 个交付文件", names.join(", "));
    assert(Boolean(finalVideoName) && entries[finalVideoName].byteLength > 500, "FFmpeg 产出可读 MP4", `${entries[finalVideoName]?.byteLength || 0} bytes`);
    const srt = srtName ? new TextDecoder().decode(entries[srtName]) : "";
    assert(srt.includes("00:00:00,000 --> 00:00:00,600") && srt.includes("00:00:00,600 --> 00:00:01,200"), "SRT 时码与两个镜头对齐");
    const manifest = JSON.parse(new TextDecoder().decode(entries["manifest.json"]));
    assert(manifest.summary?.shotCount === 2 && manifest.summary?.durationMs === 1200, "交付清单记录真实镜头数与时长");
    assert(new Set(cdp.metadataChecks).size === 2, "合成前已核对两个视频的容量");
    assert(cdp.problems.length === 0, "合成与下载期间无浏览器错误", JSON.stringify(cdp.problems));
    if (failures) throw new Error(`${failures} delivery E2E assertion(s) failed`);
    console.log(`\n交付 Chrome E2E 通过：${passes.length}/${passes.length}`);
} catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    if (cdp) {
        try {
            const pageState = await cdp.evaluate(`({ text: document.body.innerText, buttons: [...document.querySelectorAll('button')].map((item) => ({ text: item.innerText, disabled: item.disabled })), progress: [...document.querySelectorAll('[role="progressbar"]')].map((item) => item.getAttribute('aria-valuenow')) })`);
            console.error("\nPage state:\n" + JSON.stringify(pageState, null, 2));
        } catch (diagnosticError) {
            console.error("\nPage diagnostics failed:\n" + String(diagnosticError));
        }
        console.error("\nBrowser problems:\n" + JSON.stringify(cdp.problems, null, 2));
    }
    try { console.error("\nDownloads:\n" + JSON.stringify(readdirSync(downloadDir))); } catch { /* ignore */ }
    if (vite) console.error("\nVite log:\n" + vite.log().slice(-5000));
    if (chrome) console.error("\nChrome log:\n" + chrome.log().slice(-5000));
    process.exitCode = 1;
} finally {
    cdp?.close();
    await Promise.all([stopChild(vite?.child), stopChild(chrome?.child)]);
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
