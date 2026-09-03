import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const webDir = new URL("..", import.meta.url);
const distDir = new URL("../dist/", import.meta.url);
const manifestPath = new URL(".vite/manifest.json", distDir);
const webPath = fileURLToPath(webDir);
const distPath = fileURLToPath(distDir);

if (!existsSync(manifestPath)) {
    console.error("构建体积检查失败：缺少 dist/.vite/manifest.json，请先执行生产构建。");
    process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const sizeCache = new Map();

function assetSize(file) {
    if (!sizeCache.has(file)) {
        const body = readFileSync(new URL(file, distDir));
        sizeCache.set(file, { raw: body.byteLength, gzip: gzipSync(body, { level: 9 }).byteLength });
    }
    return sizeCache.get(file);
}

function dependencyClosure(entryKey) {
    const files = new Set();
    const css = new Set();
    const visited = new Set();

    function visit(key) {
        if (visited.has(key)) return;
        visited.add(key);
        const item = manifest[key];
        if (!item) throw new Error(`manifest 缺少依赖项：${key}`);
        if (item.file) files.add(item.file);
        for (const file of item.css || []) css.add(file);
        for (const dependency of item.imports || []) visit(dependency);
    }

    visit(entryKey);
    return { files, css };
}

function sumSizes(files) {
    let raw = 0;
    let gzip = 0;
    for (const file of files) {
        const size = assetSize(file);
        raw += size.raw;
        gzip += size.gzip;
    }
    return { raw, gzip };
}

function subtract(files, baseline) {
    return new Set([...files].filter((file) => !baseline.has(file)));
}

function listFiles(directory) {
    const result = [];
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) result.push(...listFiles(path));
        else result.push(relative(distPath, path));
    }
    return result;
}

function largestAsset(extension) {
    const candidates = listFiles(fileURLToPath(new URL("assets/", distDir))).filter((file) => extname(file) === extension);
    return candidates.reduce((largest, file) => {
        const size = assetSize(file);
        return !largest || size.gzip > largest.gzip ? { file, ...size } : largest;
    }, null);
}

function largestFirstPartyEntry() {
    return Object.entries(manifest).reduce((largest, [key, item]) => {
        if (!key.startsWith("src/") || !item.file?.endsWith(".js") || (!item.isEntry && !item.isDynamicEntry)) return largest;
        const size = assetSize(item.file);
        return !largest || size.gzip > largest.gzip ? { file: `${key} → ${item.file}`, ...size } : largest;
    }, null);
}

function formatBytes(bytes) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
}

const startup = dependencyClosure("src/application.tsx");
const canvas = dependencyClosure("src/pages/canvas/project.tsx");
const create = dependencyClosure("src/pages/create/index.tsx");
const firstPartyEntry = largestFirstPartyEntry();
const largestJavaScript = largestAsset(".js");
const largestCSS = largestAsset(".css");

// 2026-09-03 基线只保留约 2%–5% 波动空间；超限应通过拆分/按需加载解决，不应直接放宽。
const checks = [
    { name: "启动壳 JS（含静态依赖）", value: sumSizes(startup.files).gzip, limit: 625_000 },
    { name: "启动壳 CSS", value: sumSizes(startup.css).gzip, limit: 128_000 },
    { name: "画布首次进入新增 JS", value: sumSizes(subtract(canvas.files, startup.files)).gzip, limit: 880_000 },
    { name: "创作页首次进入新增 JS", value: sumSizes(subtract(create.files, startup.files)).gzip, limit: 425_000 },
    { name: `最大业务入口（${firstPartyEntry.file}）`, value: firstPartyEntry.gzip, limit: 192_000 },
    { name: `最大 JS 单文件（${largestJavaScript.file}）`, value: largestJavaScript.gzip, limit: 780_000 },
    { name: `最大 CSS 单文件（${largestCSS.file}）`, value: largestCSS.gzip, limit: 126_000 },
];

let failed = false;
console.log("前端构建体积预算（gzip）");
for (const check of checks) {
    const passed = check.value <= check.limit;
    failed ||= !passed;
    console.log(`${passed ? "PASS" : "FAIL"}  ${check.name}: ${formatBytes(check.value)} / ${formatBytes(check.limit)}`);
}

if (failed) {
    console.error("构建体积超过预算。请优先拆分入口或改为按需加载；如确需调整预算，请同时记录原因和新基线。");
    process.exit(1);
}

console.log(`体积预算通过，构建目录：${relative(webPath, distPath)}`);
