import { formatSrtTimestamp } from "@/lib/timeline/timeline-to-ffmpeg";
import type { ProjectAsset, ProjectDetail, ProjectShot, ShotArtifact, ShotRevision } from "@/services/api/projects";

export type ProjectDeliveryShot = {
    index: number;
    shot: ProjectShot;
    revision?: ShotRevision;
    video?: ShotArtifact;
    startMs: number;
    endMs: number;
};

export type ProjectDeliveryPlan = {
    projectId: string;
    projectName: string;
    unitId: string;
    unitTitle: string;
    fileBaseName: string;
    shots: ProjectDeliveryShot[];
    missingShots: ProjectShot[];
    staleArtifactCount: number;
    totalDurationMs: number;
    assets: ProjectAsset[];
    references: ProjectDetail["shotReferences"];
    ready: boolean;
};

export type ProjectDeliveryTextFile = { name: string; data: string };

export function safeDeliveryFileName(value: string) {
    const safe = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/[.\s]+$/g, "").trim();
    return safe || "未命名";
}

function currentShotRevision(detail: ProjectDetail, shot: ProjectShot) {
    return detail.shotRevisions.find((item) => item.id === shot.currentRevisionId)
        || detail.shotRevisions.filter((item) => item.shotId === shot.id).slice().sort((left, right) => right.version - left.version)[0];
}

function selectedReadyVideo(detail: ProjectDetail, shotId: string) {
    return detail.shotArtifacts
        .filter((item) => item.shotId === shotId && item.type === "video" && item.selected && item.status === "ready" && Boolean(item.resourceId))
        .slice()
        .sort((left, right) => right.version - left.version)[0];
}

export function planProjectDelivery(detail: ProjectDetail, unitId: string): ProjectDeliveryPlan {
    const unit = detail.units.find((item) => item.id === unitId);
    if (!unit) throw new Error("找不到要交付的章节");
    const orderedShots = detail.shots.filter((item) => item.unitId === unitId).slice().sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
    let cursorMs = 0;
    const shots = orderedShots.map((shot, index) => {
        const revision = currentShotRevision(detail, shot);
        const durationMs = Math.max(0, revision?.durationMs || shot.durationMs || 0);
        const item: ProjectDeliveryShot = {
            index: index + 1,
            shot,
            revision,
            video: selectedReadyVideo(detail, shot.id),
            startMs: cursorMs,
            endMs: cursorMs + durationMs,
        };
        cursorMs += durationMs;
        return item;
    });
    const shotIds = new Set(orderedShots.map((item) => item.id));
    const references = detail.shotReferences.filter((item) => shotIds.has(item.shotId));
    const assetsById = new Map<string, ProjectAsset>();
    for (const reference of references) {
        const assetId = reference.asset?.id || reference.referencedVersion?.assetId;
        const asset = reference.asset || detail.assets.find((item) => item.id === assetId);
        if (asset) assetsById.set(asset.id, asset);
    }
    const staleArtifactCount = detail.shotArtifacts.filter((item) => item.status === "stale" && (item.unitId === unitId || shotIds.has(item.shotId))).length;
    const missingShots = shots.filter((item) => !item.video).map((item) => item.shot);
    const projectName = detail.project.name || "短剧项目";
    const unitTitle = unit.title || "章节";
    return {
        projectId: detail.project.id,
        projectName,
        unitId,
        unitTitle,
        fileBaseName: `${safeDeliveryFileName(projectName)}-${safeDeliveryFileName(unitTitle)}`,
        shots,
        missingShots,
        staleArtifactCount,
        totalDurationMs: cursorMs,
        assets: Array.from(assetsById.values()).sort((left, right) => left.position - right.position || left.title.localeCompare(right.title)),
        references,
        // 过期产物是可追溯的历史记录；只要每个镜头已有新的选中视频，就不应阻断交付。
        ready: shots.length > 0 && missingShots.length === 0,
    };
}

export function buildProjectDeliverySrt(plan: ProjectDeliveryPlan) {
    return plan.shots
        .filter((item) => item.revision?.dialogue.trim())
        .map((item, index) => [
            String(index + 1),
            `${formatSrtTimestamp(item.startMs)} --> ${formatSrtTimestamp(item.endMs)}`,
            item.revision?.dialogue.trim() || "",
        ].join("\n"))
        .join("\n\n");
}

function csvCell(value: unknown) {
    const text = value == null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildProjectDeliveryCsv(plan: ProjectDeliveryPlan) {
    const headers = ["序号", "镜头名称", "开始时间(ms)", "结束时间(ms)", "时长(ms)", "剧情描述", "动作", "台词", "景别", "机位", "运镜", "图片提示词", "视频提示词", "负向提示词", "接戏备注", "视频资源ID"];
    const rows = plan.shots.map((item) => {
        const revision = item.revision;
        return [
            item.index,
            item.shot.title,
            item.startMs,
            item.endMs,
            item.endMs - item.startMs,
            revision?.plotDescription || item.shot.description,
            revision?.action,
            revision?.dialogue,
            revision?.shotSize,
            revision?.cameraAngle,
            revision?.cameraMovement,
            revision?.imagePrompt,
            revision?.videoPrompt,
            revision?.negativePrompt,
            revision?.continuityNotes,
            item.video?.resourceId,
        ].map(csvCell).join(",");
    });
    return `\uFEFF${[headers.map(csvCell).join(","), ...rows].join("\r\n")}`;
}

function exportedShot(plan: ProjectDeliveryPlan, item: ProjectDeliveryShot) {
    const references = plan.references.filter((reference) => reference.shotId === item.shot.id);
    return {
        index: item.index,
        id: item.shot.id,
        title: item.shot.title,
        description: item.shot.description,
        startMs: item.startMs,
        endMs: item.endMs,
        durationMs: item.endMs - item.startMs,
        revision: item.revision ? {
            id: item.revision.id,
            version: item.revision.version,
            plotDescription: item.revision.plotDescription,
            action: item.revision.action,
            dialogue: item.revision.dialogue,
            shotSize: item.revision.shotSize,
            cameraAngle: item.revision.cameraAngle,
            cameraMovement: item.revision.cameraMovement,
            imagePrompt: item.revision.imagePrompt,
            videoPrompt: item.revision.videoPrompt,
            negativePrompt: item.revision.negativePrompt,
            continuityNotes: item.revision.continuityNotes,
            actionBeatsJson: item.revision.actionBeatsJson,
        } : null,
        video: item.video ? {
            artifactId: item.video.id,
            version: item.video.version,
            revisionId: item.video.revisionId,
            resourceId: item.video.resourceId,
            createdAt: item.video.createdAt,
        } : null,
        assetReferences: references.map((reference) => ({
            id: reference.id,
            assetVersionId: reference.assetVersionId,
            role: reference.role,
            status: reference.status,
            asset: reference.asset ? {
                id: reference.asset.id,
                title: reference.asset.title,
                category: reference.asset.category,
                mediaType: reference.asset.mediaType,
            } : undefined,
        })),
    };
}

export function buildProjectDeliveryTextFiles(plan: ProjectDeliveryPlan, exportedAt = new Date().toISOString()): ProjectDeliveryTextFile[] {
    const finalVideoPath = `成片/${plan.fileBaseName}.mp4`;
    const srtPath = `字幕/${plan.fileBaseName}.srt`;
    const manifest = {
        app: "影策",
        format: "short-drama-delivery",
        version: 1,
        exportedAt,
        project: { id: plan.projectId, name: plan.projectName },
        unit: { id: plan.unitId, title: plan.unitTitle },
        summary: { shotCount: plan.shots.length, durationMs: plan.totalDurationMs, assetCount: plan.assets.length },
        files: { finalVideo: finalVideoPath, subtitles: srtPath, shotsJson: "分镜/shots.json", shotsCsv: "分镜/shots.csv", assets: "资产/assets.json" },
    };
    const shots = {
        version: 1,
        exportedAt,
        projectId: plan.projectId,
        unitId: plan.unitId,
        durationMs: plan.totalDurationMs,
        shots: plan.shots.map((item) => exportedShot(plan, item)),
    };
    const assets = {
        version: 1,
        exportedAt,
        projectId: plan.projectId,
        unitId: plan.unitId,
        assets: plan.assets.map((asset) => ({
            id: asset.id,
            title: asset.title,
            mediaType: asset.mediaType,
            category: asset.category,
            status: asset.status,
            primaryVersionId: asset.primaryVersionId,
            versionCount: asset.versionCount,
            usages: asset.usages,
            folderId: asset.folderId,
            updatedAt: asset.updatedAt,
        })),
        references: plan.references.map((reference) => ({ id: reference.id, shotId: reference.shotId, assetVersionId: reference.assetVersionId, role: reference.role, status: reference.status })),
    };
    const readme = [
        `${plan.projectName} / ${plan.unitTitle} 交付包`,
        "",
        `导出时间：${exportedAt}`,
        `镜头数：${plan.shots.length}`,
        `成片时长：${Math.round(plan.totalDurationMs / 100) / 10} 秒`,
        "",
        "内容说明：",
        `- ${finalVideoPath}：按分镜顺序合成的 MP4 成片`,
        `- ${srtPath}：按镜头时长生成的台词字幕`,
        "- 分镜/shots.json 与 分镜/shots.csv：分镜、生成参数与资源对应关系",
        "- 资产/assets.json：当前章节镜头引用的资产版本清单",
        "",
        "注：交付包在浏览器本机生成，不会为打包额外上传素材。",
    ].join("\n");
    return [
        { name: "manifest.json", data: JSON.stringify(manifest, null, 2) },
        { name: "交付说明.txt", data: readme },
        { name: srtPath, data: buildProjectDeliverySrt(plan) },
        { name: "分镜/shots.json", data: JSON.stringify(shots, null, 2) },
        { name: "分镜/shots.csv", data: buildProjectDeliveryCsv(plan) },
        { name: "资产/assets.json", data: JSON.stringify(assets, null, 2) },
    ];
}
