/**
 * 短剧本机交付包 Chrome 验收。
 *
 * 启动临时 Vite 与隔离 Chrome profile，在浏览器内生成两个微型 WebM，
 * 将其拦截为 DEV 复现台的镜头资源，实际执行 FFmpeg 合成、ZIP 下载与解包校验。
 * 不连接后端、不需要账号、不触发任何模型。
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
        import { createServer } from 'vite';
        const server = await createServer({ cacheDir: ${JSON.stringify(join(tempRoot, "vite-cache"))}, server: { host: '127.0.0.1', port: ${port}, strictPort: true } });
        await server.listen();
    `], {
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
    const faults = { worker: "normal", intercepted: 0 };
    const requests = [];
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
        if (message.method === "Network.responseReceived") requests.push({ url: params.response.url, status: params.response.status, type: params.response.mimeType });
        if (message.method === "Network.loadingFailed" && params.errorText !== "net::ERR_ABORTED") record("network.failed", params.errorText);
        if (message.method === "Fetch.requestPaused") {
            let pathname = "";
            try { pathname = new URL(params.request.url).pathname; } catch { /* continue below */ }
            if (params.request.url.includes("worker_file") && faults.worker !== "normal") {
                faults.intercepted += 1;
                if (faults.worker === "fail") void send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 403, body: Buffer.from("Worker unavailable").toString("base64") });
                return;
            }
            if (["/api/public/site", "/api/public/branding"].includes(pathname)) {
                void send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ code: 0, data: { revision: 0, config: {}, assets: {} } })).toString("base64") });
                return;
            }
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
                    : pathname.startsWith("/api/")
                        ? (record("unexpected.api", pathname), send("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }))
                        : send("Fetch.continueRequest", { requestId: params.requestId });
            action.catch((error) => record("fetch.intercept", error.message));
        }
    });

    await Promise.all([
        send("Runtime.enable"),
        send("Page.enable"),
        send("Log.enable"),
        send("Network.enable"),
        send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }, { urlPattern: "*worker_file*", requestStage: "Request" }] }),
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
    return { send, evaluate, poll, click, problems, videos, metadataChecks, faults, requests, close: () => ws.close() };
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
    cdp.faults.worker = "fail";
    await cdp.click(localExportSelector);
    assert(await cdp.poll(`document.body.innerText.includes('视频工具加载超时') && !document.querySelector('[data-testid="project-delivery-local-cancel"]')`, 40_000), "Worker 403 在加载截止时间内退出并提示重试");
    assert(cdp.faults.intercepted === 1 && !readdirSync(downloadDir).length, "失败未产出伪造 ZIP");
    assert(cdp.problems.every((item) => item.kind === "log.error" && item.text.includes("403")), "故障阶段仅出现预期的 Worker 403", JSON.stringify(cdp.problems));
    cdp.problems.length = 0;
    cdp.faults.worker = "stall";
    await cdp.click(localExportSelector);
    assert(await cdp.poll(`document.body.innerText.includes('正在加载本地视频工具')`), "失败后重试进入新的加载");
    const stallDeadline = Date.now() + 5000;
    while (cdp.faults.intercepted < 2 && Date.now() < stallDeadline) await sleep(50);
    assert(cdp.faults.intercepted === 2, "取消用例已实际挂起 Worker 请求");
    await cdp.click('[data-testid="project-delivery-local-cancel"]');
    assert(await cdp.poll(`!document.querySelector('[data-testid="project-delivery-local-cancel"]') && !document.querySelector('[data-delivery-local-progress]')`, 5000), "取消挂起加载后按钮与进度恢复");
    assert(!readdirSync(downloadDir).length, "取消没有触发下载");
    cdp.faults.worker = "normal";
    assert(await cdp.click(localExportSelector), "交付按钮已通过真实指针事件触发");
    assert(await cdp.poll(`Boolean(document.querySelector('[data-delivery-local-progress]'))`, 10_000), "页面展示本地合成进度");

    const zipPath = await waitForDownload(downloadDir, 180_000);
    const entries = unzipSync(readFileSync(zipPath));
    const names = Object.keys(entries);
    const finalVideoName = names.find((name) => name.startsWith("成片/") && name.endsWith(".mp4"));
    const srtName = names.find((name) => name.startsWith("字幕/") && name.endsWith(".srt"));
    const expectedNames = ["成片/交付验收-第一集.mp4", "manifest.json", "交付说明.txt", "字幕/交付验收-第一集.srt", "分镜/shots.json", "分镜/shots.csv", "资产/assets.json"];
    assert(JSON.stringify([...names].sort()) === JSON.stringify(expectedNames.sort()), "ZIP 包含 7 个交付文件", names.join(", "));
    assert(Boolean(finalVideoName) && entries[finalVideoName].byteLength > 500, "FFmpeg 产出 MP4 文件", `${entries[finalVideoName]?.byteLength || 0} bytes`);
    const decoded = await cdp.evaluate(`(async () => {
        const bytes = Uint8Array.from(atob(${JSON.stringify(Buffer.from(entries[finalVideoName]).toString("base64"))}), c => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
        const video = document.createElement('video');
        video.muted = true;
        const wait = event => new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Video decode timeout: ' + event)), 10000);
            video.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
            video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Video decode failed')); }, { once: true });
        });
        try {
            const loaded = wait('loadeddata'); video.src = url; await loaded;
            const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 54;
            const context = canvas.getContext('2d');
            const colors = [];
            for (const position of [0.2, 0.8]) {
                const sought = wait('seeked'); video.currentTime = video.duration * position; await sought;
                context.drawImage(video, 0, 0); colors.push([...context.getImageData(80, 5, 1, 1).data]);
            }
            return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, colors };
        } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
    })()`);
    assert(decoded.width === 96 && decoded.height === 54 && decoded.duration >= 0.95 && decoded.duration <= 1.45, "浏览器实际解码 MP4 且时长约 1.2 秒", JSON.stringify(decoded));
    assert(decoded.colors[0][0] > decoded.colors[0][2] * 2 && decoded.colors[1][2] > decoded.colors[1][0] * 2, "成片前红后蓝，两个镜头均保留且顺序正确");
    const srt = srtName ? new TextDecoder().decode(entries[srtName]) : "";
    assert(srt.includes("00:00:00,000 --> 00:00:00,600") && srt.includes("00:00:00,600 --> 00:00:01,200"), "SRT 时码与两个镜头对齐");
    const manifest = JSON.parse(new TextDecoder().decode(entries["manifest.json"]));
    assert(manifest.summary?.shotCount === 2 && manifest.summary?.durationMs === 1200, "交付清单记录真实镜头数与时长");
    assert(new Set(cdp.metadataChecks).size === 2, "合成前已核对两个视频的容量");
    assert(cdp.problems.length === 0, "合成与下载期间无浏览器错误", JSON.stringify(cdp.problems));
    if (failures) throw new Error(`${failures} delivery E2E assertion(s) failed`);
    if (process.env.DELIVERY_E2E_EVIDENCE_DIR) {
        const evidenceDir = process.env.DELIVERY_E2E_EVIDENCE_DIR;
        mkdirSync(evidenceDir, { recursive: true });
        writeFileSync(join(evidenceDir, "delivery.zip"), readFileSync(zipPath));
        writeFileSync(join(evidenceDir, "checks.json"), JSON.stringify({ passes, decoded, files: names, workerFaultRequests: cdp.faults.intercepted, problems: cdp.problems }, null, 2));
        await cdp.poll(`!document.querySelector('.ant-message-notice')`, 10_000);
        const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
        writeFileSync(join(evidenceDir, "delivery.png"), Buffer.from(screenshot.data, "base64"));
    }
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
        console.error("\nResource requests:\n" + JSON.stringify(cdp.requests.filter(item => /ffmpeg|worker|wasm|api/.test(item.url)), null, 2));
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
