import { createZip } from "@/lib/zip";
import { getResourceBlob, resourceStorageKey } from "@/services/api/resources";
import type { ProjectDetail } from "@/services/api/projects";

import { buildProjectDeliveryTextFiles, planProjectDelivery } from "./project-delivery";

export type ProjectDeliveryExportProgress = {
    phase: "reading" | "encoding" | "packing";
    progress: number;
    message: string;
};

type ProjectDeliveryExportDependencies = {
    loadResourceBlob?: (resourceId: string) => Promise<Blob | null>;
    mergeVideoBlobs?: (blobs: Blob[], onProgress?: (progress: { phase: "loading" | "reading" | "encoding"; progress: number }) => void) => Promise<Blob>;
    createArchive?: typeof createZip;
    now?: () => Date;
};

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

    const loadResourceBlob = dependencies.loadResourceBlob || ((resourceId: string) => getResourceBlob(resourceStorageKey(resourceId)));
    const mergeVideoBlobs = dependencies.mergeVideoBlobs || defaultMergeVideoBlobs;
    const createArchive = dependencies.createArchive || createZip;
    const blobs: Blob[] = [];
    for (let index = 0; index < plan.shots.length; index += 1) {
        const item = plan.shots[index];
        const resourceId = item.video?.resourceId;
        if (!resourceId) throw new Error(`镜头“${item.shot.title}”缺少可下载的视频资源`);
        onProgress?.({ phase: "reading", progress: Math.round((index / plan.shots.length) * 40), message: `正在读取镜头 ${index + 1} / ${plan.shots.length}` });
        const blob = await loadResourceBlob(resourceId);
        if (!blob) throw new Error(`无法读取镜头“${item.shot.title}”的视频，请检查资源后重试`);
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
    return { archive, fileName: `${plan.fileBaseName}-交付包.zip`, plan };
}
