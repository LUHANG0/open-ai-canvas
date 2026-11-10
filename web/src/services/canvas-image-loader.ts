import { getActiveUserScope } from "@/lib/user-scope";

const MAX_ACTIVE_IMAGE_PREPARATIONS = 4;
const IMAGE_PREPARATION_TIMEOUT_MS = 60_000;
const MAX_CACHED_IMAGES = 48;
const MAX_CACHED_PIXELS = 16_000_000;
const IMAGE_CACHE_TTL_MS = 60_000;
const METADATA_LIMIT = 256;

export type CanvasImagePriority = 0 | 1 | 2;
export type CanvasImageSource = {
    key: string; src: string; validUntil: number; scope: string; generation: number;
    resourceId?: string; requestedVariant: "original" | "thumbnail" | "playback"; actualVariant: "original" | "thumbnail" | "playback";
    originalWidth?: number; originalHeight?: number;
};
type PreparedImage = CanvasImageSource & { image: HTMLImageElement; pixels: number; expiresAt: number; refs: number };
type Presentation = CanvasImageSource;
type SharedPreparation = { controller: AbortController; promise: Promise<HTMLImageElement>; priorities: Map<symbol, CanvasImagePriority>; src: string; priority: CanvasImagePriority };
const preparations = new Map<string, SharedPreparation>();
const controllers = new Set<AbortController>();
const preparedImages = new Map<string, PreparedImage>();
const activeHandles = new Set<PreparedImage>();
const sources = new Map<string, CanvasImageSource>();
const presentations = new Map<string, Presentation>();
// Weak evidence belongs to the exact capability, not a URL re-registration.
let successfulSources = new WeakSet<CanvasImageSource>();
let preparationScope = "";
let generation = 0;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let nextExpiry = Infinity;
let disposing = false;

function ensureScope() {
    if (preparationScope !== getActiveUserScope()) {
        disposeCanvasImageSession();
        preparationScope = getActiveUserScope();
    }
}

/** Explicit account boundary: cancel physical work as well as rejecting late publication. */
export function disposeCanvasImageSession() {
    generation += 1;
    disposing = true;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    preparations.clear();
    preparedImages.clear();
    activeHandles.clear();
    sources.clear();
    presentations.clear();
    successfulSources = new WeakSet();
    clearTimeout(expiryTimer);
    expiryTimer = undefined;
    nextExpiry = Infinity;
    preparationScope = "";
    disposing = false;
}

/** Access is a capability, not the media identity. No revision guarantee is inferred. */
export function registerCanvasImageSource(src: string, resourceId?: string, actualVariant: CanvasImageSource["actualVariant"] = "original", validUntil = Number.POSITIVE_INFINITY, metadata: { requestedVariant?: CanvasImageSource["requestedVariant"]; originalWidth?: number; originalHeight?: number } = {}): CanvasImageSource {
    ensureScope();
    const previous = sources.get(src);
    if (previous && previous.resourceId === resourceId && previous.actualVariant === actualVariant && previous.requestedVariant === (metadata.requestedVariant || actualVariant) && previous.validUntil === validUntil && previous.originalWidth === metadata.originalWidth && previous.originalHeight === metadata.originalHeight) return previous;
    const value: CanvasImageSource = { key: JSON.stringify([preparationScope, resourceId || src, actualVariant]), src, resourceId, actualVariant, requestedVariant: metadata.requestedVariant || actualVariant, originalWidth: metadata.originalWidth, originalHeight: metadata.originalHeight, validUntil, scope: preparationScope, generation };
    sources.delete(src);
    sources.set(src, value);
    while (sources.size > METADATA_LIMIT) sources.delete(sources.keys().next().value!);
    scheduleExpiry(validUntil);
    return value;
}

export function canvasImageSourceFor(src: string) {
    ensureScope();
    return sources.get(src);
}

function collectExpired() {
    const now = Date.now();
    if (now < nextExpiry) return;
    // A synchronous read can collect before the pending timer gets its turn.
    clearTimeout(expiryTimer);
    expiryTimer = undefined;
    nextExpiry = Infinity;
    let next = Infinity;
    for (const [key, entry] of preparedImages) {
        if (entry.refs) continue;
        if (entry.expiresAt <= now) preparedImages.delete(key);
        else next = Math.min(next, entry.expiresAt);
    }
    for (const [key, entry] of presentations) {
        if (entry.validUntil <= now) presentations.delete(key);
        else next = Math.min(next, entry.validUntil);
    }
    for (const [key, entry] of sources) {
        if (entry.validUntil <= now) sources.delete(key);
        else next = Math.min(next, entry.validUntil);
    }
    scheduleExpiry(next);
}

/** Only new earlier deadlines replace a timer; removals may leave an early wakeup. */
function scheduleExpiry(deadline: number) {
    if (!Number.isFinite(deadline) || (expiryTimer !== undefined && deadline >= nextExpiry)) return;
    clearTimeout(expiryTimer);
    nextExpiry = deadline;
    expiryTimer = setTimeout(() => {
        expiryTimer = undefined;
        // Date.now can move backwards: preserve the absolute expiry check and re-arm.
        if (Date.now() < nextExpiry) scheduleExpiry(nextExpiry);
        else collectExpired();
    // Native timers use a signed 32-bit delay. Long-lived access descriptors or
    // a backwards wall clock must re-arm in bounded steps, never overflow to 1ms.
    }, Math.min(2_147_483_647, Math.max(1, deadline - Date.now())));
    // Module tests and SSR must not be kept alive by a warm cache.
    (expiryTimer as unknown as { unref?: () => void } | undefined)?.unref?.();
}

function trimWarmImages() {
    let count = 0, pixels = 0;
    for (const entry of preparedImages.values()) if (!entry.refs) { count += 1; pixels += entry.pixels; }
    for (const [key, entry] of preparedImages) {
        if (count <= MAX_CACHED_IMAGES && pixels <= MAX_CACHED_PIXELS) break;
        if (entry.refs) continue;
        count -= 1; pixels -= entry.pixels; preparedImages.delete(key);
    }
}

/** A synchronous snapshot only exposes images already prepared, never a cold descriptor. */
export function peekCanvasImage(src: string) {
    ensureScope();
    collectExpired();
    const source = canvasImageSourceFor(src);
    const entry = source ? preparedImages.get(source.key) : undefined;
    return source && source.validUntil > Date.now() && entry?.src === src && entry.validUntil > Date.now() ? entry.image : undefined;
}

export function retainCanvasImage(src: string) {
    ensureScope();
    const scopeGeneration = generation;
    const source = canvasImageSourceFor(src);
    const entry = source ? preparedImages.get(source.key) : undefined;
    if (!entry || entry.src !== src) return () => {};
    entry.refs += 1;
    activeHandles.add(entry);
    let released = false;
    return () => {
        if (released || generation !== scopeGeneration) return;
        released = true;
        entry.refs -= 1;
        if (!entry.refs) {
            activeHandles.delete(entry);
            entry.expiresAt = Math.min(Date.now() + IMAGE_CACHE_TTL_MS, entry.validUntil);
            if (!src.startsWith("blob:") && preparedImages.get(entry.key) === entry) {
                preparedImages.delete(entry.key);
                preparedImages.set(entry.key, entry);
            }
            trimWarmImages();
            if (preparedImages.get(entry.key) === entry) scheduleExpiry(entry.expiresAt);
        }
    };
}

/** Successful descriptors outlive warm pixels, bounded by capability, session and LRU. */
export function getImagePresentation(key: string, candidate = "") {
    ensureScope();
    collectExpired();
    const previous = presentations.get(key);
    if (previous && previous.validUntil > Date.now()) {
        presentations.delete(key);
        presentations.set(key, previous);
        return previous.src;
    }
    return candidate && peekCanvasImage(candidate) ? candidate : "";
}

export function rememberImagePresentation(key: string, src: string) {
    ensureScope();
    if (!key || !src || src.startsWith("blob:") || src.length > 4096) return;
    const source = canvasImageSourceFor(src);
    if (!source || source.validUntil <= Date.now() || !successfulSources.has(source)) return;
    presentations.delete(key);
    presentations.set(key, source);
    while (presentations.size > METADATA_LIMIT) presentations.delete(presentations.keys().next().value!);
    scheduleExpiry(source.validUntil);
}

export function forgetImagePresentation(src: string) {
    ensureScope();
    // A failed URL is invalid for every presentation consumer.
    for (const [presentationKey, entry] of presentations) {
        if (entry.src !== src) continue;
        successfulSources.delete(entry);
        presentations.delete(presentationKey);
    }
    const source = canvasImageSourceFor(src);
    if (source) successfulSources.delete(source);
    for (const [imageKey, entry] of preparedImages) if (entry.src === src) preparedImages.delete(imageKey);
    for (const entry of preparations.values()) if (entry.src === src) entry.controller.abort();
}

/** Same resource/actual variant shares one queue entry; node IDs are consumers only. */
export function prepareCanvasImage(source: CanvasImageSource, signal: AbortSignal, timeoutMs = IMAGE_PREPARATION_TIMEOUT_MS, priority: CanvasImagePriority = 0, estimatedPixels = source.originalWidth && source.originalHeight ? source.originalWidth * source.originalHeight : Infinity): Promise<HTMLImageElement> {
    if (signal.aborted) return Promise.reject(abortError());
    ensureScope();
    if (source.scope !== preparationScope || source.generation !== generation) return Promise.reject(abortError());
    if (source.validUntil <= Date.now()) return Promise.reject(new Error("图片访问地址已过期"));
    const src = source.src;
    collectExpired();
    const cached = preparedImages.get(source.key);
    if (cached?.src === src && cached.validUntil > Date.now()) {
        preparedImages.delete(source.key);
        preparedImages.set(source.key, cached);
        successfulSources.add(source);
        return Promise.resolve(cached.image);
    }
    const scopeGeneration = generation;
    const key = source.key;
    let pending = preparations.get(key);
    if (pending?.src !== src) pending = undefined;
    if (!pending) {
        const controller = new AbortController();
        controllers.add(controller);
        const entry: SharedPreparation = { controller, priorities: new Map(), src, priority, promise: enqueueCanvasImage(src, controller.signal, timeoutMs, priority, source.validUntil, estimatedPixels) };
        entry.promise = entry.promise.then((image) => {
            if (source.validUntil <= Date.now()) throw new Error("图片访问地址在准备期间过期");
            if (controller.signal.aborted || scopeGeneration !== generation || preparationScope !== getActiveUserScope()) throw abortError();
            const pixels = image.naturalWidth * image.naturalHeight;
            if (preparations.get(key) === entry && pixels > 0 && pixels <= MAX_CACHED_PIXELS && !src.startsWith("blob:")) {
                preparedImages.delete(key);
                const prepared = { ...source, image, pixels, refs: 0, expiresAt: Date.now() + IMAGE_CACHE_TTL_MS };
                preparedImages.set(key, prepared);
                trimWarmImages();
                if (preparedImages.get(key) === prepared) scheduleExpiry(prepared.expiresAt);
            }
            return image;
        }).finally(() => {
            controllers.delete(controller);
            if (preparations.get(key) === entry) preparations.delete(key);
        });
        pending = entry;
        preparations.set(key, entry);
    } else {
        const job = queue.find((entry) => entry.signal === pending!.controller.signal);
        if (job) {
            job.estimatedPixels = Math.min(job.estimatedPixels, estimatedPixels);
        }
    }
    const shared = pending;
    const consumer = Symbol();
    shared.priorities.set(consumer, priority);
    updatePreparationPriority(shared);
    const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>();
    let settled = false;
    const finish = (image?: HTMLImageElement, error?: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        shared.priorities.delete(consumer);
        updatePreparationPriority(shared);
        if (error === undefined) {
            if (signal.aborted || shared.controller.signal.aborted || scopeGeneration !== generation || source.scope !== getActiveUserScope()) error = abortError();
            else if (source.validUntil <= Date.now()) error = new Error("图片访问地址在准备期间过期");
            else successfulSources.add(source);
        }
        if (error !== undefined) reject(error); else resolve(image!);
    };
    const onAbort = () => {
        finish(undefined, abortError());
        queueMicrotask(() => {
            if (!shared.priorities.size) {
                if (preparations.get(key) === shared) preparations.delete(key);
                shared.controller.abort();
            }
        });
    };
    signal.addEventListener("abort", onAbort, { once: true });
    shared.promise.then((image) => finish(image), (error) => finish(undefined, error));
    return promise;
}

function updatePreparationPriority(shared: SharedPreparation) {
    let priority: CanvasImagePriority = 2;
    for (const value of shared.priorities.values()) if (value < priority) priority = value;
    shared.priority = priority;
    const job = queue.find((entry) => entry.signal === shared.controller.signal);
    if (job) job.priority = priority;
}

type ImagePreparationJob = {
    src: string; activityKey: string; signal: AbortSignal; priority: CanvasImagePriority; validUntil: number; estimatedPixels: number; queuedAt: number;
    resolve: (image: HTMLImageElement) => void; reject: (error: unknown) => void;
    started: boolean; settled: boolean; image?: HTMLImageElement;
    timeout?: ReturnType<typeof setTimeout>; timeoutMs: number; onAbort: () => void;
};
const queue: ImagePreparationJob[] = [];
let activePreparations = 0;
const activeSources = new Set<string>();
const activityListeners = new Map<string, Set<() => void>>();
const activityKey = (src: string) => JSON.stringify([getActiveUserScope(), src]);

export function subscribeCanvasImageActivity(src: string, listener: () => void) {
    const key = activityKey(src);
    let listeners = activityListeners.get(key);
    if (!listeners) activityListeners.set(key, listeners = new Set());
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (!listeners.size && activityListeners.get(key) === listeners) activityListeners.delete(key);
    };
}
export function isCanvasImageActive(src: string) { return Boolean(src && activeSources.has(activityKey(src))); }
function markImageActivity(job: ImagePreparationJob, active: boolean) {
    if (active) activeSources.add(job.activityKey); else activeSources.delete(job.activityKey);
    for (const listener of [...(activityListeners.get(job.activityKey) || [])]) listener();
}
function enqueueCanvasImage(src: string, signal: AbortSignal, timeoutMs: number, priority: CanvasImagePriority, validUntil: number, estimatedPixels: number): Promise<HTMLImageElement> {
    if (signal.aborted) return Promise.reject(abortError());
    const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>();
    const job: ImagePreparationJob = { src, activityKey: activityKey(src), signal, resolve, reject, priority, validUntil, estimatedPixels, queuedAt: Date.now(), started: false, settled: false, timeoutMs, onAbort: () => {} };
    job.onAbort = () => {
        if (job.settled) return;
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        job.image?.removeAttribute("src");
        settle(job, undefined, abortError());
    };
    signal.addEventListener("abort", job.onAbort, { once: true });
    queue.push(job);
    pump();
    return promise;
}
export function canvasImagePreparationStats() {
    let warmPixels = 0, warmImages = 0, activePixels = 0, activeImages = 0;
    for (const entry of preparedImages.values()) {
        if (!entry.refs) { warmPixels += entry.pixels; warmImages += 1; }
    }
    for (const entry of activeHandles) { activePixels += entry.pixels; activeImages += 1; }
    return { active: activePreparations, queued: queue.length, limit: MAX_ACTIVE_IMAGE_PREPARATIONS, warmPixels, warmImages, activePixels, activeImages, presentations: presentations.size, sources: sources.size };
}
function pump() {
    if (disposing) return;
    while (activePreparations < MAX_ACTIVE_IMAGE_PREPARATIONS && queue.length) {
        let index = 0;
        const now = Date.now();
        for (let i = 1; i < queue.length; i++) {
            const candidate = queue[i], current = queue[index];
            if (candidate.priority < current.priority) { index = i; continue; }
            if (candidate.priority !== current.priority) continue;
            // Small prepared surfaces must not wait behind an entire original-image batch.
            // After one second, FIFO wins within the same priority to prevent starvation.
            const currentAged = now - current.queuedAt >= 1000;
            const candidateAged = now - candidate.queuedAt >= 1000;
            if (currentAged ? candidateAged && candidate.queuedAt < current.queuedAt : candidateAged || candidate.estimatedPixels < current.estimatedPixels) index = i;
        }
        const job = queue.splice(index, 1)[0];
        if (job.settled || job.signal.aborted) { settle(job, undefined, abortError()); continue; }
        if (job.validUntil <= Date.now()) { settle(job, undefined, new Error("图片访问地址在排队期间过期")); continue; }
        job.started = true;
        activePreparations += 1;
        markImageActivity(job, true);
        job.timeout = setTimeout(() => { job.image?.removeAttribute("src"); settle(job, undefined, new Error("图片加载或解码超时")); }, job.timeoutMs);
        const image = new Image(); job.image = image; image.decoding = "async";
        image.onload = () => {
            if (job.settled || job.signal.aborted) return;
            image.onload = null;
            void image.decode().then(() => settle(job, image), (error) => settle(job, undefined, error));
        };
        image.onerror = () => settle(job, undefined, new Error("图片加载失败"));
        image.src = job.src;
        if (image.complete && image.naturalWidth > 0) image.onload?.call(image, new Event("load"));
    }
}
function settle(job: ImagePreparationJob, image?: HTMLImageElement, error?: unknown) {
    if (job.settled) return;
    job.settled = true;
    job.signal.removeEventListener("abort", job.onAbort);
    clearTimeout(job.timeout);
    if (job.image) { job.image.onload = null; job.image.onerror = null; }
    if (job.started) { activePreparations = Math.max(0, activePreparations - 1); markImageActivity(job, false); pump(); }
    if (error !== undefined) job.reject(error); else if (image) job.resolve(image); else job.reject(new Error("图片准备未完成"));
}
function abortError() { return new DOMException("图片准备已取消", "AbortError"); }
