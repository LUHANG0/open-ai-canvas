import { getActiveUserScope } from "@/lib/user-scope";

type UploadPreview = { url: string; scope: string; storageKey?: string };
const previews = new Map<string, UploadPreview>();

/** Transient upload bytes never become canvas metadata or cross-device references. */
export function registerUploadPreview(nodeId: string, file: Blob) {
    const previous = previews.get(nodeId);
    if (previous) URL.revokeObjectURL(previous.url);
    const entry: UploadPreview = { url: URL.createObjectURL(file), scope: getActiveUserScope() };
    previews.set(nodeId, entry);
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
