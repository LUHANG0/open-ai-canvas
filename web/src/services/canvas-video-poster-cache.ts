import localforage from "localforage";

import { getActiveUserScope } from "@/lib/user-scope";
import { cacheResourceObjectUrl } from "@/services/resource-blob-cache";

type CanvasVideoPosterRecord = {
    blob: Blob;
    width: number;
    height: number;
    sourceWidth: number;
    createdAt: number;
};

export type CanvasVideoPosterRequest = {
    cacheIdentity: string;
    storageKey?: string;
    sourceUrl?: string;
    maxWidth: number;
    quality: number;
    concurrency: number;
};

type PosterJob = {
    concurrency: number;
    run: () => Promise<string>;
    resolve: (value: string) => void;
};

const POSTER_VERSION = "v2";
const MAX_POSTER_ENTRIES = 240;
const posterStore = localforage.createInstance({ name: "infinite-canvas", storeName: "canvas_video_posters" });
const memoryRecords = new Map<string, CanvasVideoPosterRecord>();
const objectUrls = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();
const queue: PosterJob[] = [];
let activeJobs = 0;

export function canvasVideoPosterCacheKey(identity: string) {
    const scope = typeof window === "undefined" ? "server" : getActiveUserScope();
    return `${POSTER_VERSION}:${scope}:${stableHash(identity)}`;
}

export function loadCanvasVideoPoster(request: CanvasVideoPosterRequest) {
    if (typeof document === "undefined" || !request.cacheIdentity || (!request.storageKey && !request.sourceUrl)) return Promise.resolve("");
    const cacheKey = canvasVideoPosterCacheKey(request.cacheIdentity);
    const targetWidth = Math.max(240, Math.round(request.maxWidth));
    const requestKey = `${cacheKey}:${targetWidth}`;
    const pending = inFlight.get(requestKey);
    if (pending) return pending;

    const task = readOrCreatePoster(cacheKey, { ...request, maxWidth: targetWidth });
    inFlight.set(requestKey, task);
    void task.finally(() => inFlight.delete(requestKey));
    return task;
}

async function readOrCreatePoster(cacheKey: string, request: CanvasVideoPosterRequest) {
    const memory = memoryRecords.get(cacheKey);
    if (memory && posterMeetsRequest(memory, request.maxWidth)) return posterObjectUrl(cacheKey, memory);

    const cached = await posterStore.getItem<CanvasVideoPosterRecord>(cacheKey).catch(() => null);
    if (cached?.blob && posterMeetsRequest(cached, request.maxWidth)) {
        memoryRecords.set(cacheKey, cached);
        return posterObjectUrl(cacheKey, cached);
    }

    return enqueuePosterJob(Math.max(1, Math.min(2, request.concurrency)), async () => {
        let record: CanvasVideoPosterRecord | null = null;
        // 优先使用可流式读取的现有地址，浏览器通常只请求元数据和首帧附近的数据，避免为了封面下载完整视频。
        if (request.sourceUrl) record = await captureVideoPoster(request.sourceUrl, request.maxWidth, request.quality).catch(() => null);
        if (!record && request.storageKey) {
            const cachedResourceUrl = await cacheResourceObjectUrl(request.storageKey).catch(() => "");
            if (cachedResourceUrl && cachedResourceUrl !== request.sourceUrl) record = await captureVideoPoster(cachedResourceUrl, request.maxWidth, request.quality).catch(() => null);
        }
        if (!record) return "";
        memoryRecords.set(cacheKey, record);
        await posterStore.setItem(cacheKey, record).catch(() => undefined);
        void trimPosterStore().catch(() => undefined);
        return posterObjectUrl(cacheKey, record);
    });
}

function enqueuePosterJob(concurrency: number, run: () => Promise<string>) {
    return new Promise<string>((resolve) => {
        queue.push({ concurrency, run, resolve });
        runPosterQueue();
    });
}

function runPosterQueue() {
    const nextIndex = queue.findIndex((job) => activeJobs < job.concurrency);
    if (nextIndex < 0) return;
    const [job] = queue.splice(nextIndex, 1);
    activeJobs += 1;
    void job
        .run()
        .catch(() => "")
        .then(job.resolve)
        .finally(() => {
            activeJobs -= 1;
            runPosterQueue();
        });
    runPosterQueue();
}

async function captureVideoPoster(sourceUrl: string, maxWidth: number, quality: number): Promise<CanvasVideoPosterRecord> {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    if (/^https?:/i.test(sourceUrl)) video.crossOrigin = "anonymous";
    video.src = sourceUrl;

    try {
        await waitForVideo(video, ["loadedmetadata"], () => video.videoWidth > 0 && video.videoHeight > 0, true);
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const captureTime = await selectRepresentativeFrameTime(video, duration);
        await seekVideo(video, captureTime);

        const sourceWidth = Math.max(1, video.videoWidth);
        const sourceHeight = Math.max(1, video.videoHeight);
        const width = Math.min(sourceWidth, maxWidth);
        const height = Math.max(1, Math.round((width / sourceWidth) * sourceHeight));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("无法创建视频封面画布");
        context.drawImage(video, 0, 0, width, height);
        const blob = await canvasToBlob(canvas, Math.max(0.68, Math.min(0.92, quality)));
        return { blob, width, height, sourceWidth, createdAt: Date.now() };
    } finally {
        video.removeAttribute("src");
        video.load();
    }
}

async function selectRepresentativeFrameTime(video: HTMLVideoElement, duration: number) {
    const lastSafeTime = duration > 0.1 ? Math.max(0, duration - 0.08) : 0;
    const candidates = duration > 0.2 ? [Math.min(Math.max(duration * 0.18, 0.45), 1.2, lastSafeTime), Math.min(Math.max(duration * 0.45, 1.1), 2.8, lastSafeTime), Math.min(Math.max(duration * 0.75, 1.8), 5, lastSafeTime)] : [0];
    const uniqueCandidates = [...new Set(candidates.map((value) => Math.max(0, Math.round(value * 1000) / 1000)))];
    let best = { time: uniqueCandidates[0] || 0, score: -1 };
    for (const time of uniqueCandidates) {
        await seekVideo(video, time);
        const score = representativeFrameScore(video);
        if (score > best.score) best = { time, score };
        if (score >= 82) break;
    }
    if (best.score < 8) throw new Error("视频暂无可识别画面");
    return best.time;
}

async function seekVideo(video: HTMLVideoElement, time: number) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(video.currentTime - time) < 0.04) return;
    if (time <= 0.01) {
        await waitForVideo(video, ["loadeddata"], () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
        return;
    }
    video.currentTime = time;
    await waitForVideo(video, ["seeked", "loadeddata"], () => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(video.currentTime - time) < 0.35);
}

function representativeFrameScore(video: HTMLVideoElement) {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 30;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return 0;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    let sumSquared = 0;
    let visiblePixels = 0;
    const pixelCount = pixels.length / 4;
    for (let index = 0; index < pixels.length; index += 4) {
        const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
        sum += luminance;
        sumSquared += luminance * luminance;
        if (luminance >= 18) visiblePixels += 1;
    }
    const mean = sum / Math.max(1, pixelCount);
    const variance = Math.max(0, sumSquared / Math.max(1, pixelCount) - mean * mean);
    const deviation = Math.sqrt(variance);
    const visibleRatio = visiblePixels / Math.max(1, pixelCount);
    return mean * 0.5 + deviation * 1.15 + visibleRatio * 34;
}

function waitForVideo(video: HTMLVideoElement, events: string[], ready: () => boolean, load = false) {
    if (ready()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => finish(new Error("视频封面读取超时")), 15_000);
        const onReady = () => {
            if (ready()) finish();
        };
        const onError = () => finish(new Error("视频封面读取失败"));
        const finish = (error?: Error) => {
            window.clearTimeout(timeout);
            events.forEach((event) => video.removeEventListener(event, onReady));
            video.removeEventListener("error", onError);
            if (error) reject(error);
            else resolve();
        };
        events.forEach((event) => video.addEventListener(event, onReady));
        video.addEventListener("error", onError, { once: true });
        if (load) video.load();
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
    return new Promise<Blob>((resolve, reject) => {
        try {
            canvas.toBlob(
                (blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error("视频封面编码失败"));
                },
                "image/webp",
                quality,
            );
        } catch (error) {
            reject(error);
        }
    });
}

function posterMeetsRequest(record: CanvasVideoPosterRecord, maxWidth: number) {
    return record.width >= Math.min(maxWidth, record.sourceWidth);
}

function posterObjectUrl(cacheKey: string, record: CanvasVideoPosterRecord) {
    const objectKey = `${cacheKey}:${record.width}:${record.createdAt}`;
    const existing = objectUrls.get(objectKey);
    if (existing) return existing;
    const url = URL.createObjectURL(record.blob);
    objectUrls.set(objectKey, url);
    return url;
}

async function trimPosterStore() {
    const keys = await posterStore.keys();
    if (keys.length <= MAX_POSTER_ENTRIES) return;
    const records = await Promise.all(keys.map(async (key) => ({ key, record: await posterStore.getItem<CanvasVideoPosterRecord>(key) })));
    const removable = records.filter((item) => item.record).sort((a, b) => (a.record?.createdAt || 0) - (b.record?.createdAt || 0));
    await Promise.all(removable.slice(0, Math.max(0, keys.length - MAX_POSTER_ENTRIES)).map((item) => posterStore.removeItem(item.key)));
}

function stableHash(value: string) {
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < value.length; index += 1) {
        const code = value.charCodeAt(index);
        first = Math.imul(first ^ code, 0x01000193);
        second = Math.imul(second ^ code, 0x85ebca6b);
    }
    return `${value.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

if (typeof window !== "undefined") {
    window.addEventListener("pagehide", (event) => {
        if (event.persisted) return;
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls.clear();
        memoryRecords.clear();
    });
}
