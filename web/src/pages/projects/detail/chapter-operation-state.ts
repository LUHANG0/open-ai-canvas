import type { ProjectDetail } from "@/services/api/projects";
import type { GenerationTask } from "@/services/api/task-center";

export type ChapterOperationKind = "characters" | "storyboard";
export type ChapterOperation = { startedAt: number; taskId?: string };

export function chapterOperationKey(unitId: string, kind: ChapterOperationKind) {
    return `${unitId}:${kind}`;
}

export function chapterOperationFromTask(task: GenerationTask): ChapterOperation {
    const startedAt = Date.parse(task.startedAt || task.createdAt);
    return { startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(), taskId: task.id };
}

export function chapterTaskResultAlreadyApplied(task: GenerationTask, chapterId: string, kind: ChapterOperationKind, detail: ProjectDetail) {
    const completedAt = Date.parse(task.completedAt || task.updatedAt);
    if (!Number.isFinite(completedAt)) return false;
    const updatedAt = kind === "characters"
        ? detail.assetCandidates.filter((candidate) => candidate.unitId === chapterId && candidate.category === "character").map((candidate) => Date.parse(candidate.updatedAt))
        : detail.shots.filter((shot) => shot.unitId === chapterId).map((shot) => Date.parse(shot.updatedAt));
    return updatedAt.some((timestamp) => Number.isFinite(timestamp) && timestamp >= completedAt);
}

export function formatOperationElapsed(startedAt: number, now: number) {
    const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1_000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}分钟${seconds}秒`;
}

export function readStoredScroll(key: string) {
    const value = Number(sessionStorage.getItem(key) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
}
