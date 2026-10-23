import { CircleAlert, CloudCheck, CloudUpload, HardDriveDownload, LoaderCircle } from "lucide-react";
import { useSyncProgressStore } from "@/stores/use-sync-progress-store";
import "./canvas-sync-status.css";

export function CanvasSyncStatus({ projectId }: { projectId: string }) {
    const progress = useSyncProgressStore((state) => state.syncingProjects[projectId]);
    const localError = progress?.localPhase === "error";
    const cloudError = progress?.phase === "error" || Boolean(progress?.errorKind);
    const localPending = progress?.localPhase === "pending";
    const saving = !localError && !cloudError && !localPending && (progress?.phase === "saving" || progress?.phase === "uploading");
    const waiting = progress?.phase === "pending";
    const tone = localError || cloudError ? "error" : saving || waiting ? "pending" : !localPending && progress?.phase === "done" ? "done" : "idle";
    const label = localError ? `本地保存失败：${progress.localError || "请检查本地存储"}`
        : cloudError ? progress?.message || "画布同步失败，修改尚未确认"
        : localPending ? "正在保存到本地"
        : progress?.phase === "uploading" ? "正在上传画布媒体"
        : saving ? "正在同步画布"
        : waiting ? "等待同步到云端"
        : progress?.phase === "done" ? "已同步"
        : progress?.localPhase === "saved" ? "已保存到本地，尚未确认云端" : "尚未同步";
    const Icon = localError || cloudError ? CircleAlert : localPending ? HardDriveDownload : saving ? LoaderCircle : waiting ? CloudUpload : CloudCheck;
    return (
        <span className={`canvas-sync-status-trigger canvas-sync-status-trigger--${tone} inline-flex size-8 items-center justify-center rounded-full`} role="status" aria-label={label} title={label}>
            <Icon className={saving ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} />
        </span>
    );
}
