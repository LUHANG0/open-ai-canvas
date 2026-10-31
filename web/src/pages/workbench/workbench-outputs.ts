import { playbackVariantUrl, resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import type { GenerationTask } from "@/services/api/task-center";
import type { WorkbenchKind } from "@/services/api/workbench";

const RESOURCE_FILE_URL = /\/resources\/([A-Za-z0-9_-]{1,80})\/file(?:[?#]|$)/;

export type WorkbenchOutput = {
    key: string;
    taskId: string;
    index: number;
    kind: "image" | "video";
    /** 原图或可播放副本。 */
    url: string;
    /** 宫格展示用：图片走缩略图档，视频为封面（没有封面时为空）。 */
    thumbUrl: string;
    posterUrl?: string;
    resourceId?: string;
    storageKey?: string;
    mimeType?: string;
    width?: number;
    height?: number;
};

type RawMedia = { url?: string; resourceId?: string; storageKey?: string; mimeType?: string; posterUrl?: string; width?: number; height?: number };

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function positive(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function resourceIdFromMediaUrl(url?: string) {
    return url ? RESOURCE_FILE_URL.exec(url)?.[1] || "" : "";
}

function mediaUrlValue(value: unknown) {
    const url = text(value) || (value && typeof value === "object" ? text((value as Record<string, unknown>).url) : "");
    return /^(https?:|data:image\/|data:video\/|blob:|\/)/i.test(url) ? url : "";
}

function rawMedia(value: unknown): RawMedia | null {
    if (typeof value === "string") {
        const url = mediaUrlValue(value);
        return url ? { url } : null;
    }
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const url = mediaUrlValue(record.url) || mediaUrlValue(record.dataUrl) || mediaUrlValue(record.resultUrl);
    const storageKey = text(record.storageKey);
    const resourceId = text(record.resourceId) || resourceIdFromStorageKey(storageKey) || resourceIdFromMediaUrl(url);
    if (!url && !resourceId) return null;
    const poster = ["posterUrl", "poster", "thumbnailUrl", "coverUrl", "cover"].map((key) => mediaUrlValue(record[key])).find(Boolean);
    const mimeType = text(record.mimeType) || text(record.type);
    return {
        ...(url ? { url } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(storageKey ? { storageKey } : {}),
        ...(/^(image|video)\//i.test(mimeType) ? { mimeType } : {}),
        ...(poster ? { posterUrl: poster } : {}),
        ...(positive(record.width) ? { width: positive(record.width) } : {}),
        ...(positive(record.height) ? { height: positive(record.height) } : {}),
    };
}

function resultMedia(resultJson: string | undefined, kind: WorkbenchKind) {
    if (!resultJson) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(resultJson);
    } catch {
        return [];
    }
    if (!parsed || typeof parsed !== "object") return [];
    const result = parsed as Record<string, unknown>;
    const collect = (value: unknown) => (Array.isArray(value) ? value : value ? [value] : []).map(rawMedia).filter((item): item is RawMedia => Boolean(item));
    const primary = kind === "video" ? [...collect(result.video), ...collect(result.videos)] : [...collect(result.images), ...collect(result.image)];
    if (primary.length) return primary;
    return collect(result.url || result.resultUrl || result.outputUrl);
}

function displayMedia(task: GenerationTask, kind: WorkbenchKind, media: RawMedia, index: number): WorkbenchOutput {
    const resourceId = media.resourceId || "";
    const shared = {
        key: `${task.id}:${index}`,
        taskId: task.id,
        index,
        kind,
        ...(resourceId ? { resourceId } : {}),
        ...(media.storageKey ? { storageKey: media.storageKey } : {}),
        ...(media.mimeType ? { mimeType: media.mimeType } : {}),
        ...(media.width ? { width: media.width } : {}),
        ...(media.height ? { height: media.height } : {}),
    };
    if (kind === "video") {
        const posterId = resourceIdFromMediaUrl(media.posterUrl);
        const posterUrl = posterId ? `${resourceFileUrl(posterId)}?variant=thumbnail` : media.posterUrl || "";
        // 视频走可播放副本（H.265 等转码结果），副本未就绪时后端回退原件。
        return { ...shared, url: resourceId ? playbackVariantUrl(resourceId) : media.url || "", thumbUrl: posterUrl, ...(posterUrl ? { posterUrl } : {}) };
    }
    return { ...shared, url: resourceId ? resourceFileUrl(resourceId) : media.url || "", thumbUrl: resourceId ? `${resourceFileUrl(resourceId)}?variant=thumbnail` : media.url || "" };
}

const DOWNLOAD_EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

/** 下载文件名：`场景名_日期_序号.扩展名`，扩展名优先取产物的 MIME，未知时图片用 png、视频用 mp4。 */
export function workbenchDownloadName(output: Pick<WorkbenchOutput, "kind" | "mimeType" | "url">, baseName: string, ordinal: number, now = new Date()) {
    const safe =
        baseName
            .replace(/[\x00-\x1f\\/:*?"<>|]/g, "_")
            .trim()
            .slice(0, 60) || (output.kind === "image" ? "创作图片" : "创作视频");
    const fromPath = /\.([a-z0-9]{3,4})(?:[?#]|$)/i.exec(output.url.split(/[?#]/, 1)[0])?.[1]?.toLowerCase();
    const extension = (output.mimeType && DOWNLOAD_EXTENSIONS[output.mimeType.toLowerCase()]) || (fromPath && Object.values(DOWNLOAD_EXTENSIONS).includes(fromPath) ? fromPath : "") || (output.kind === "image" ? "png" : "mp4");
    const pad = (value: number) => String(value).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `${safe}_${stamp}_${pad(ordinal)}.${extension}`;
}

/**
 * 任务的全部可展示产物。列表接口只带首个预览地址；详情（含 resultJson）到达后返回全部图片。
 */
export function workbenchTaskOutputs(task: GenerationTask, kind: WorkbenchKind, detail?: GenerationTask): WorkbenchOutput[] {
    if (task.status !== "succeeded") return [];
    const fromResult = resultMedia(detail?.resultJson || task.resultJson, kind);
    if (fromResult.length) return fromResult.map((media, index) => displayMedia(task, kind, media, index));
    const previewUrl = mediaUrlValue(detail?.previewUrl || task.previewUrl);
    if (!previewUrl) return [];
    const resourceId = resourceIdFromMediaUrl(previewUrl);
    return [displayMedia(task, kind, { url: previewUrl, ...(resourceId ? { resourceId } : {}), ...(task.previewPosterUrl ? { posterUrl: task.previewPosterUrl } : {}) }, 0)];
}
