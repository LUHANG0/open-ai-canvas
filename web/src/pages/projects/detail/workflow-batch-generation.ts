import type { ProjectDetail, ProjectShot, ShotRevision } from "@/services/api/projects";

import type { ShotEditorValues } from "./workflow-production-types";

export type WorkflowBatchGenerationCandidate = {
    shot: ProjectShot;
    revision: ShotRevision;
};

export type WorkflowBatchGenerationPlan = {
    candidates: WorkflowBatchGenerationCandidate[];
    readyCount: number;
    activeCount: number;
    unavailableCount: number;
};

export function planWorkflowBatchGeneration(
    detail: ProjectDetail,
    unitId: string,
    artifactType: string,
    locallySubmittingShotIds: ReadonlySet<string> = new Set(),
): WorkflowBatchGenerationPlan {
    const shots = detail.shots.filter((shot) => shot.unitId === unitId).slice().sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
    const readyShotIds = new Set(detail.shotArtifacts
        .filter((artifact) => artifact.type === artifactType && artifact.selected && artifact.status === "ready")
        .map((artifact) => artifact.shotId));
    const activeShotIds = new Set([
        ...detail.tasks
            .filter((task) => (task.status === "queued" || task.status === "running") && task.clientContext?.artifactType === artifactType)
            .flatMap((task) => task.clientContext?.shotId ? [task.clientContext.shotId] : []),
        ...detail.shotArtifacts
            .filter((artifact) => artifact.type === artifactType && (artifact.status === "pending" || artifact.status === "running"))
            .map((artifact) => artifact.shotId),
        ...locallySubmittingShotIds,
    ]);
    const revisionById = new Map(detail.shotRevisions.map((revision) => [revision.id, revision]));
    const latestRevisionByShotId = new Map<string, ShotRevision>();
    for (const revision of detail.shotRevisions) {
        const current = latestRevisionByShotId.get(revision.shotId);
        if (!current || revision.version > current.version) latestRevisionByShotId.set(revision.shotId, revision);
    }
    const candidates: WorkflowBatchGenerationCandidate[] = [];
    let unavailableCount = 0;
    for (const shot of shots) {
        if (readyShotIds.has(shot.id) || activeShotIds.has(shot.id)) continue;
        const revision = (shot.currentRevisionId ? revisionById.get(shot.currentRevisionId) : undefined) || latestRevisionByShotId.get(shot.id);
        if (!revision) {
            unavailableCount += 1;
            continue;
        }
        candidates.push({ shot, revision });
    }
    return {
        candidates,
        readyCount: shots.filter((shot) => readyShotIds.has(shot.id)).length,
        activeCount: shots.filter((shot) => activeShotIds.has(shot.id)).length,
        unavailableCount,
    };
}

export function savedShotEditorValues(shot: ProjectShot, revision: ShotRevision): ShotEditorValues {
    return {
        title: shot.title,
        plotDescription: revision.plotDescription || shot.description,
        action: revision.action || "",
        dialogue: revision.dialogue || "",
        shotSize: revision.shotSize || "",
        cameraAngle: revision.cameraAngle || "",
        cameraMovement: revision.cameraMovement || "",
        durationSeconds: Math.max(0.5, (revision.durationMs || shot.durationMs || 3000) / 1000),
        imagePrompt: revision.imagePrompt || "",
        videoPrompt: revision.videoPrompt || "",
        negativePrompt: revision.negativePrompt || "",
        continuityNotes: revision.continuityNotes || "",
    };
}

export async function settleWorkflowBatch<T, R>(items: readonly T[], worker: (item: T, index: number) => Promise<R>, concurrency = 3) {
    const results = new Array<PromiseSettledResult<R>>(items.length);
    let nextIndex = 0;
    const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1));
    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            try {
                results[index] = { status: "fulfilled", value: await worker(items[index], index) };
            } catch (reason) {
                results[index] = { status: "rejected", reason };
            }
        }
    }));
    return results;
}
