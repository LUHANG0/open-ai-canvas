import { createZip } from "@/lib/zip";
import { getResource, getResourceBlob, resourceStorageKey } from "@/services/api/resources";
import type { ProjectDetail } from "@/services/api/projects";

import {
    formatProjectDeliveryBytes,
    inspectProjectDeliveryCapacity,
    projectDeliveryCapacityError,
    projectDeliverySourceBudget,
} from "./project-delivery-capacity";
import { buildProjectDeliveryTextFiles, planProjectDelivery } from "./project-delivery";

export type ProjectDeliveryExportProgress = {
    phase: "checking" | "reading" | "encoding" | "packing";
    progress: number;
    message: string;
};

type ProjectDeliveryExportDependencies = {
    loadResourceMetadata?: (resourceId: string) => Promise<{ size?: number; kind?: string; status?: string }>;
    loadResourceBlob?: (resourceId: string) => Promise<Blob | null>;
    mergeVideoBlobs?: (blobs: Blob[], onProgress?: (progress: { phase: "loading" | "reading" | "encoding"; progress: number }) => void) => Promise<Blob>;
    createArchive?: typeof createZip;
    now?: () => Date;
    deviceMemoryGB?: number;
    sourceBudgetBytes?: number;
};

function browserDeviceMemoryGB() {
    if (typeof navigator === "undefined") return undefined;
    return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
}

async function defaultMergeVideoBlobs(blobs: Blob[], onProgress?: Parameters<NonNullable<ProjectDeliveryExportDependencies["mergeVideoBlobs"]>>[1]) {
    const { mergeVideoBlobs } = await import("@/lib/canvas/canvas-video-merge");
    return mergeVideoBlobs(blobs, onProgress);
}

export async function createProjectDeliveryArchive(
    detail: ProjectDetail,
    unitId: string,
    onProgress?: (progress: ProjectDeliveryExportProgress) => void,
    dependencies: ProjectDeliveryExportDependencies = {},
) {
    const plan = planProjectDelivery(detail, unitId);
    if (plan.shots.length === 0) throw new Error("当前章节还没有分镜，无法生成交付包");
    if (plan.missingShots.length > 0) throw new Error(`还有 ${plan.missingShots.length} 个镜头缺少已通过的视频`);

    const loadResourceMetadata = dependencies.loadResourceMetadata || getResource;
    const loadResourceBlob = dependencies.loadResourceBlob || ((resourceId: string) => getResourceBlob(resourceStorageKey(resourceId)));
    const mergeVideoBlobs = dependencies.mergeVideoBlobs || defaultMergeVideoBlobs;
    const createArchive = dependencies.createArchive || createZip;
    const sourceBudgetBytes = dependencies.sourceBudgetBytes
        || projectDeliverySourceBudget(dependencies.deviceMemoryGB ?? browserDeviceMemoryGB());
    const resourceSizes: Array<number | undefined> = [];
    for (let index = 0; index < plan.shots.length; index += 1) {
        const item = plan.shots[index];
        const resourceId = item.video?.resourceId;
        if (!resourceId) throw new Error(`镜头“${item.shot.title}”缺少可下载的视频资源`);
        onProgress?.({ phase: "checking", progress: Math.round((index / plan.shots.length) * 15), message: `正在核对镜头容量 ${index + 1} / ${plan.shots.length}` });
        const resource = await loadResourceMetadata(resourceId);
        if (resource.status && resource.status !== "ready") throw new Error(`镜头“${item.shot.title}”的视频资源当前不可用`);
        if (resource.kind && resource.kind !== "video") throw new Error(`镜头“${item.shot.title}”关联的不是视频资源`);
        resourceSizes.push(resource.size);
    }
    const capacity = inspectProjectDeliveryCapacity(resourceSizes, sourceBudgetBytes);
    if (capacity.level === "blocked") throw new Error(projectDeliveryCapacityError(resourceSizes.reduce<number>((total, size) => total + (size || 0), 0), sourceBudgetBytes));
    const capacityMessage = capacity.sourceBytes === undefined
        ? "容量信息不完整，读取时将继续核对"
        : capacity.level === "warning"
            ? `镜头视频约 ${formatProjectDeliveryBytes(capacity.sourceBytes)}，已接近本机安全上限`
            : `镜头视频约 ${formatProjectDeliveryBytes(capacity.sourceBytes)}，容量检查通过`;
    onProgress?.({ phase: "checking", progress: 15, message: capacityMessage });

    const blobs: Blob[] = [];
    let actualSourceBytes = 0;
    for (let index = 0; index < plan.shots.length; index += 1) {
        const item = plan.shots[index];
        const resourceId = item.video?.resourceId;
        if (!resourceId) throw new Error(`镜头“${item.shot.title}”缺少可下载的视频资源`);
        onProgress?.({ phase: "reading", progress: 15 + Math.round((index / plan.shots.length) * 30), message: `正在读取镜头 ${index + 1} / ${plan.shots.length}` });
        const blob = await loadResourceBlob(resourceId);
        if (!blob) throw new Error(`无法读取镜头“${item.shot.title}”的视频，请检查资源后重试`);
        actualSourceBytes += blob.size;
        if (actualSourceBytes > sourceBudgetBytes) throw new Error(projectDeliveryCapacityError(actualSourceBytes, sourceBudgetBytes));
        blobs.push(blob);
    }

    onProgress?.({ phase: "encoding", progress: 45, message: "正在本机合成 MP4" });
    const finalVideo = await mergeVideoBlobs(blobs, (progress) => {
        const value = progress.phase === "loading"
            ? 45
            : progress.phase === "reading"
                ? 45 + Math.round(progress.progress * 0.1)
                : 55 + Math.round(progress.progress * 0.3);
        const message = progress.phase === "loading" ? "正在加载本地视频工具" : progress.phase === "reading" ? "正在准备镜头视频" : "正在本机合成 MP4";
        onProgress?.({ phase: "encoding", progress: value, message });
    });

    onProgress?.({ phase: "packing", progress: 90, message: "正在打包字幕、分镜与资产清单" });
    const exportedAt = (dependencies.now?.() || new Date()).toISOString();
    const textFiles = buildProjectDeliveryTextFiles(plan, exportedAt);
    const archive = await createArchive([
        { name: `成片/${plan.fileBaseName}.mp4`, data: finalVideo },
        ...textFiles,
    ]);
    onProgress?.({ phase: "packing", progress: 100, message: "交付包已就绪" });
    return { archive, fileName: `${plan.fileBaseName}-交付包.zip`, plan, capacity: inspectProjectDeliveryCapacity(blobs.map((blob) => blob.size), sourceBudgetBytes) };
}
