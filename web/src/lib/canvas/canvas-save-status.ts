import type { RemoteUserDataSyncStatus } from "@/services/user-data-sync";

export type CanvasLocalSaveStatus = {
    phase: "saved" | "saving" | "failed";
    lastSavedAt: number | null;
    error: string | null;
};

export type CanvasSaveStatus = {
    local: CanvasLocalSaveStatus;
    remote: RemoteUserDataSyncStatus;
};

export type CanvasSaveStatusPresentation = {
    label: string;
    detail: string;
    busy: boolean;
    retryable: boolean;
    tone: "neutral" | "success" | "warning" | "danger";
};

export function canvasSaveStatusPresentation(status: CanvasSaveStatus): CanvasSaveStatusPresentation {
    if (status.local.phase === "failed") {
        return {
            label: "保存失败",
            detail: status.local.error || "本地保存失败，请重试",
            busy: false,
            retryable: true,
            tone: "danger",
        };
    }
    if (status.local.phase === "saving") {
        return {
            label: "保存中",
            detail: "正在保存到此设备",
            busy: true,
            retryable: false,
            tone: "neutral",
        };
    }

    if (status.remote.phase === "hydrating") {
        return {
            label: "连接云端",
            detail: "本地已保存，正在建立云端同步",
            busy: true,
            retryable: false,
            tone: "neutral",
        };
    }
    if (status.remote.phase === "syncing" || (status.remote.pending && status.remote.phase !== "failed")) {
        return {
            label: "同步中",
            detail: "本地已保存，正在同步到云端",
            busy: true,
            retryable: false,
            tone: "neutral",
        };
    }
    if (status.remote.phase === "failed") {
        const retryable = status.remote.failureKind === "sync";
        return {
            label: retryable ? "同步失败" : "云端不可用",
            detail: status.remote.error || (retryable ? "本地已保存，可重试云端同步" : "本地已保存，云端连接失败"),
            busy: false,
            retryable,
            tone: "warning",
        };
    }
    if (status.remote.phase === "inactive") {
        return {
            label: "已保存到本机",
            detail: lastSavedDetail(status.local.lastSavedAt, "内容已安全保存到此设备"),
            busy: false,
            retryable: false,
            tone: "success",
        };
    }
    return {
        label: "已保存",
        detail: lastSavedDetail(status.remote.lastSyncedAt || status.local.lastSavedAt, "本地和云端内容均已保存"),
        busy: false,
        retryable: false,
        tone: "success",
    };
}

export function shouldBlockCanvasUnload(status: CanvasSaveStatus) {
    return status.local.phase !== "saved";
}

function lastSavedDetail(timestamp: number | null, fallback: string) {
    if (!timestamp) return fallback;
    return `最近保存于 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(timestamp)}`;
}
