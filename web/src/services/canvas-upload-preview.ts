import { getActiveUserScope } from "@/lib/user-scope";

type UploadPreview = { url: string; scope: string; storageKey?: string; thumb: string };
const previews = new Map<string, UploadPreview>();

/** Transient upload bytes never become canvas metadata or cross-device references. */
export function registerUploadPreview(nodeId: string, file: Blob) {
    const previous = previews.get(nodeId);
    if (previous) URL.revokeObjectURL(previous.url);
    const entry: UploadPreview = { url: URL.createObjectURL(file), scope: getActiveUserScope(), thumb: "" };
    previews.set(nodeId, entry);
    if (file.type.startsWith("image/")) {
        void createImageThumb(file).then((thumb) => {
            if (previews.get(nodeId) !== entry || entry.scope !== getActiveUserScope()) return;
            entry.thumb = thumb || UPLOAD_THUMB_FAILED;
            notify();
        });
    }
    return {
        bind(storageKey: string) { entry.storageKey = storageKey; },
        release() {
            // A late cleanup must not revoke a newer upload for the same node.
            if (previews.get(nodeId) !== entry) return;
            previews.delete(nodeId);
            URL.revokeObjectURL(entry.url);
        },
    };
}

export function uploadPreviewUrl(nodeId: string, storageKey?: string) {
    const entry = previews.get(nodeId);
    return entry?.scope === getActiveUserScope() && (storageKey === undefined || entry.storageKey === storageKey) ? entry.url : "";
}

export function uploadedResourcePreviewUrl(storageKey?: string) {
    if (!storageKey) return "";
    for (const entry of previews.values()) {
        if (entry.storageKey === storageKey && entry.scope === getActiveUserScope()) return entry.url;
    }
    return "";
}

export const UPLOAD_THUMB_FAILED = "failed";
const THUMB_LONG_EDGE = 28;
const listeners = new Set<() => void>();
function notify() { listeners.forEach((listener) => listener()); }
/** 视频首帧可用后由预览组件补交磨砂底图。 */
export function setUploadPreviewThumb(nodeId: string, source: CanvasImageSource, width: number, height: number) {
    const preview = previews.get(nodeId);
    if (!preview || preview.scope !== getActiveUserScope() || preview.thumb) return;
    preview.thumb = drawThumb(source, width, height) || UPLOAD_THUMB_FAILED;
    notify();
}

export function uploadPreviewThumb(nodeId: string) {
    const preview = previews.get(nodeId);
    return preview?.scope === getActiveUserScope() ? preview.thumb : "";
}
export function subscribeUploadPreviews(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
export function releaseUploadPreview(nodeId: string) {
    const preview = previews.get(nodeId);
    if (!preview) return;
    previews.delete(nodeId);
    URL.revokeObjectURL(preview.url);
}
async function createImageThumb(file: Blob) {
    if (typeof createImageBitmap !== "function") return "";
    let bitmap: ImageBitmap | undefined;
    try {
        // 带缩放参数时浏览器可在解码阶段直接降采样；不支持该参数时退回全尺寸解码。
        bitmap = await createImageBitmap(file, { resizeWidth: THUMB_LONG_EDGE * 2, resizeQuality: "low" }).catch(() => createImageBitmap(file));
        return drawThumb(bitmap, bitmap.width, bitmap.height);
    } catch {
        return "";
    } finally {
        bitmap?.close();
    }
}

function drawThumb(source: CanvasImageSource, width: number, height: number) {
    if (!width || !height || typeof document === "undefined") return "";
    const scale = THUMB_LONG_EDGE / Math.max(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return "";
    try {
        // 在极小画布上模糊几乎没有成本，放大后得到柔和的磨砂效果。
        context.filter = "blur(1px) saturate(0.85)";
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.7);
    } catch {
        return "";
    }
}
