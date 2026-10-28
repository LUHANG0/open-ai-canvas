import { suppressBeforeUnloadGuard } from "@/stores/use-sync-progress-store";
import { getActiveUserScope } from "@/lib/user-scope";

import {
    getResourceAccess,
    resolveResourceAccessURL,
    resourceIdFromStorageKey,
    type ResourceAccessVariant,
} from "@/services/api/resources";

export type BrowserMediaDownload = {
    fileName: string;
    storageKey?: string;
    url?: string;
    variant?: ResourceAccessVariant;
};

/**
 * Hand a media download directly to the browser.
 *
 * Remote resources use the OSS/CDN download access contract so the object
 * store sends the bytes and Content-Disposition header. This function must
 * not fetch the payload or materialize a Blob: doing so wastes browser memory
 * and can accidentally turn the platform into a media relay.
 */
export async function downloadBrowserMedia({ fileName, storageKey, url, variant = "original" }: BrowserMediaDownload) {
    const scope = getActiveUserScope();
    const href = await resolveBrowserMediaDownloadHref({ fileName, storageKey, url, variant });
    assertDownloadActive(scope);
    startBrowserDownload(href, fileName);
}

export async function resolveBrowserMediaDownloadHref({ fileName, storageKey, url, variant = "original" }: BrowserMediaDownload) {
    const scope = getActiveUserScope();
    const normalizedStorageKey = storageKey?.trim();
    const normalizedUrl = url?.trim();
    const href = normalizedStorageKey && resourceIdFromStorageKey(normalizedStorageKey)
        ? resolveResourceAccessURL((await getResourceAccess(normalizedStorageKey, "download", variant, fileName)).url)
        : normalizedUrl;
    assertDownloadActive(scope);
    if (!href) throw new Error("媒体资源不存在");
    if (!["http:", "https:", "blob:", "data:"].includes(new URL(href, document.baseURI).protocol)) throw new Error("媒体下载地址无效");
    return href;
}

export function startBrowserDownload(href: string, fileName: string) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = fileName;
    anchor.rel = "noopener noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    // 跨域地址不会遵守 download 属性，点击会被当成一次导航；放行 beforeunload
    // 守卫，避免画布同步中弹出「离开此网站」确认框，让下载直接开始。
    suppressBeforeUnloadGuard();
    try {
        anchor.click();
    } finally {
        anchor.remove();
    }
}

const DOWNLOAD_LOOKUP_CONCURRENCY = 3;
const DOWNLOAD_INTERVAL_MS = 400;

export type BrowserMediaBatchResult = { started: number; failed: number; cancelled: boolean };

/** Resolve a small window of signed URLs, then hand each file to the browser. Never buffer media bytes. */
export async function downloadBrowserMediaBatch(items: BrowserMediaDownload[], options: { signal?: AbortSignal } = {}): Promise<BrowserMediaBatchResult> {
    const scope = getActiveUserScope();
    const { signal } = options;
    const result: BrowserMediaBatchResult = { started: 0, failed: 0, cancelled: false };
    try {
        for (let offset = 0; offset < items.length; offset += DOWNLOAD_LOOKUP_CONCURRENCY) {
            assertDownloadActive(scope, signal);
            const chunk = items.slice(offset, offset + DOWNLOAD_LOOKUP_CONCURRENCY);
            const resolved = await withDownloadAbort(Promise.allSettled(chunk.map(resolveBrowserMediaDownloadHref)), signal);
            for (const [index, resolution] of resolved.entries()) {
                assertDownloadActive(scope, signal);
                if (resolution.status === "rejected") {
                    result.failed++;
                    continue;
                }
                if (result.started > 0) await waitForNextDownload(signal);
                assertDownloadActive(scope, signal);
                try {
                    startBrowserDownload(resolution.value, chunk[index].fileName);
                    result.started++;
                } catch {
                    result.failed++;
                }
            }
        }
    } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
        result.cancelled = true;
    }
    return result;
}

function assertDownloadActive(scope: string, signal?: AbortSignal) {
    if (signal?.aborted || getActiveUserScope() !== scope) throw new DOMException("下载已停止", "AbortError");
}

function withDownloadAbort<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return pending;
    return new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException("下载已停止", "AbortError"));
        if (signal.aborted) { abort(); return; }
        signal.addEventListener("abort", abort, { once: true });
        pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
}

function waitForNextDownload(signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException("下载已停止", "AbortError")); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, DOWNLOAD_INTERVAL_MS);
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener("abort", abort, { once: true });
    });
}
