import { describe, expect, test } from "bun:test";

import { readZip } from "../src/lib/zip";
import {
    PROJECT_DELIVERY_FALLBACK_SOURCE_BUDGET,
    PROJECT_DELIVERY_MAX_SOURCE_BUDGET,
    PROJECT_DELIVERY_MIN_SOURCE_BUDGET,
    inspectProjectDeliveryCapacity,
    projectDeliverySourceBudget,
} from "../src/pages/projects/detail/project-delivery-capacity";
import { createProjectDeliveryArchive } from "../src/pages/projects/detail/project-delivery-export";
import { buildProjectDeliveryCsv, buildProjectDeliverySrt, planProjectDelivery, safeDeliveryFileName } from "../src/pages/projects/detail/project-delivery";
import type { ProjectDetail } from "../src/services/api/projects";

function deliveryFixture(): ProjectDetail {
    return {
        project: { id: "project-1", name: "雨夜/追凶", type: "short_drama" },
        units: [{ id: "unit-1", projectId: "project-1", kind: "chapter", title: "第一集", sourceText: "", wordCount: 0, status: "ready", position: 0, createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z" }],
        shots: [
            { id: "shot-2", projectId: "project-1", unitId: "unit-1", currentRevisionId: "revision-2", title: "SC.02", description: "街口", position: 2, durationMs: 3000, status: "ready", createdAt: "2026-09-03T00:00:02.000Z", updatedAt: "2026-09-03T00:00:02.000Z" },
            { id: "shot-1", projectId: "project-1", unitId: "unit-1", currentRevisionId: "revision-1", title: "SC.01", description: "开场", position: 1, durationMs: 3000, status: "ready", createdAt: "2026-09-03T00:00:01.000Z", updatedAt: "2026-09-03T00:00:01.000Z" },
        ],
        shotRevisions: [
            { id: "revision-1", shotId: "shot-1", version: 1, plotDescription: "雨夜,\"街口\"", action: "回头", dialogue: "别回头", shotSize: "中景", cameraAngle: "平视", cameraMovement: "推近", durationMs: 1000, imagePrompt: "image 1", videoPrompt: "video 1", negativePrompt: "blur", continuityNotes: "右手持伞", actionBeatsJson: "[]", createdAt: "2026-09-03T00:00:01.000Z" },
            { id: "revision-2", shotId: "shot-2", version: 2, plotDescription: "车灯掠过", action: "跑", dialogue: "等等", shotSize: "全景", cameraAngle: "俯视", cameraMovement: "跟拍", durationMs: 2500, imagePrompt: "image 2", videoPrompt: "video 2", negativePrompt: "", continuityNotes: "", actionBeatsJson: "[]", createdAt: "2026-09-03T00:00:02.000Z" },
        ],
        shotArtifacts: [
            { id: "artifact-1", projectId: "project-1", unitId: "unit-1", shotId: "shot-1", revisionId: "revision-1", type: "video", version: 1, resourceId: "resource-1", status: "ready", selected: true, metadataJson: "{}", createdAt: "2026-09-03T00:00:01.000Z", updatedAt: "2026-09-03T00:00:01.000Z" },
            { id: "artifact-2", projectId: "project-1", unitId: "unit-1", shotId: "shot-2", revisionId: "revision-2", type: "video", version: 1, resourceId: "resource-2", status: "ready", selected: true, metadataJson: "{}", createdAt: "2026-09-03T00:00:02.000Z", updatedAt: "2026-09-03T00:00:02.000Z" },
        ],
        assets: [{ id: "asset-1", title: "主角", mediaType: "image", category: "character", status: "ready", primaryVersionId: "asset-version-1", versionCount: 1, usages: ["character"], position: 0, updatedAt: "2026-09-03T00:00:00.000Z" }],
        shotReferences: [{ id: "reference-1", shotId: "shot-1", assetVersionId: "asset-version-1", role: "reference", status: "ready", createdAt: "2026-09-03T00:00:00.000Z", asset: { id: "asset-1", title: "主角", mediaType: "image", category: "character", status: "ready", primaryVersionId: "asset-version-1", versionCount: 1, usages: ["character"], position: 0, updatedAt: "2026-09-03T00:00:00.000Z" } }],
        canvases: [],
        canvasUnitLinks: [],
        assetFolders: [],
        workflows: [],
        assetCandidates: [],
        tasks: [],
    } as ProjectDetail;
}

describe("短剧交付包", () => {
    test("后台交付使用独立项目任务接口并保留本机兜底", async () => {
        const apiSource = await Bun.file(new URL("../src/services/api/projects.ts", import.meta.url)).text();
        const viewSource = await Bun.file(new URL("../src/pages/projects/detail/workflow-stage-views.tsx", import.meta.url)).text();
        expect(apiSource).toContain("/delivery-jobs");
        expect(apiSource).toContain("/delivery-jobs/latest");
        expect(apiSource).not.toContain("createProjectDeliveryJob(projectId: string, unitId: string, model");
        expect(viewSource).toContain("后台生成交付包");
        expect(viewSource).toContain("本机直接生成");
        expect(viewSource).toContain('data-testid="project-delivery-local-export"');
        expect(viewSource).toContain("关闭页面也会继续");
        expect(viewSource).toContain("有效期至");
        expect(viewSource).toContain("Date.parse(job.expiresAt");
    });

    test("本机交付复现台禁用后台查询并使用稳定按钮标识", async () => {
        const labSource = await Bun.file(new URL("../src/pages/dev/project-delivery-repro-lab.tsx", import.meta.url)).text();
        const e2eSource = await Bun.file(new URL("../scripts/project-delivery-chrome-e2e.mjs", import.meta.url)).text();
        expect(labSource).toContain("enableServerDelivery={false}");
        expect(e2eSource).toContain("project-delivery-local-export");
        expect(e2eSource).toContain("data-delivery-local-progress");
        expect(e2eSource).not.toContain("在本机生成交付包");
    });

    test("按设备内存给出保守容量预算，并区分安全、预警和阻断", () => {
        expect(projectDeliverySourceBudget()).toBe(PROJECT_DELIVERY_FALLBACK_SOURCE_BUDGET);
        expect(projectDeliverySourceBudget(1)).toBe(PROJECT_DELIVERY_MIN_SOURCE_BUDGET);
        expect(projectDeliverySourceBudget(8)).toBe(PROJECT_DELIVERY_MAX_SOURCE_BUDGET);

        expect(inspectProjectDeliveryCapacity([10, 20], 100).level).toBe("safe");
        expect(inspectProjectDeliveryCapacity([35, 35], 100).level).toBe("warning");
        expect(inspectProjectDeliveryCapacity([60, 50], 100).level).toBe("blocked");
        expect(inspectProjectDeliveryCapacity([20, undefined], 100)).toMatchObject({ level: "unknown", unknownResourceCount: 1 });
    });

    test("按分镜顺序生成时间线，并只用当前可用视频执行门禁", () => {
        const detail = deliveryFixture();
        const plan = planProjectDelivery(detail, "unit-1");
        expect(plan.shots.map((item) => item.shot.id)).toEqual(["shot-1", "shot-2"]);
        expect(plan.shots.map((item) => [item.startMs, item.endMs])).toEqual([[0, 1000], [1000, 3500]]);
        expect(plan.totalDurationMs).toBe(3500);
        expect(plan.assets.map((item) => item.id)).toEqual(["asset-1"]);
        expect(plan.ready).toBe(true);

        detail.shotArtifacts.push({ ...detail.shotArtifacts[0], id: "artifact-old", status: "stale", selected: false, version: 0 });
        const withHistory = planProjectDelivery(detail, "unit-1");
        expect(withHistory.staleArtifactCount).toBe(1);
        expect(withHistory.ready).toBe(true);

        detail.shotArtifacts[1] = { ...detail.shotArtifacts[1], status: "stale", selected: false };
        const blocked = planProjectDelivery(detail, "unit-1");
        expect(blocked.missingShots.map((item) => item.id)).toEqual(["shot-2"]);
        expect(blocked.staleArtifactCount).toBe(2);
        expect(blocked.ready).toBe(false);
    });

    test("字幕时码与 CSV 字段可直接交付", () => {
        const plan = planProjectDelivery(deliveryFixture(), "unit-1");
        expect(buildProjectDeliverySrt(plan)).toBe("1\n00:00:00,000 --> 00:00:01,000\n别回头\n\n2\n00:00:01,000 --> 00:00:03,500\n等等");
        const csv = buildProjectDeliveryCsv(plan);
        expect(csv.startsWith("\uFEFF序号,镜头名称")).toBe(true);
        expect(csv).toContain('"雨夜,""街口"""');
        expect(csv).toContain("resource-2");
        expect(safeDeliveryFileName('雨夜/追凶:*?')).toBe("雨夜_追凶___");
    });

    test("只读取一次镜头视频并生成完整 ZIP", async () => {
        const loaded: string[] = [];
        let mergedCount = 0;
        const result = await createProjectDeliveryArchive(deliveryFixture(), "unit-1", undefined, {
            loadResourceMetadata: async () => ({ size: 10, kind: "video", status: "ready" }),
            loadResourceBlob: async (resourceId) => {
                loaded.push(resourceId);
                return new Blob([resourceId], { type: "video/webm" });
            },
            mergeVideoBlobs: async (blobs) => {
                mergedCount = blobs.length;
                return new Blob(["mp4-output"], { type: "video/mp4" });
            },
            now: () => new Date("2026-09-03T08:00:00.000Z"),
        });
        expect(loaded).toEqual(["resource-1", "resource-2"]);
        expect(mergedCount).toBe(2);
        expect(result.fileName).toBe("雨夜_追凶-第一集-交付包.zip");

        const files = await readZip(result.archive);
        expect(Array.from(files.keys()).sort()).toEqual([
            "manifest.json",
            "交付说明.txt",
            "分镜/shots.csv",
            "分镜/shots.json",
            "字幕/雨夜_追凶-第一集.srt",
            "成片/雨夜_追凶-第一集.mp4",
            "资产/assets.json",
        ].sort());
        expect(await files.get("成片/雨夜_追凶-第一集.mp4")?.text()).toBe("mp4-output");
        expect(await files.get("manifest.json")?.text()).toContain("2026-09-03T08:00:00.000Z");
    });

    test("元数据已超限时在下载和合成前阻断", async () => {
        let loaded = false;
        let merged = false;
        await expect(createProjectDeliveryArchive(deliveryFixture(), "unit-1", undefined, {
            sourceBudgetBytes: 10,
            loadResourceMetadata: async () => ({ size: 6, kind: "video", status: "ready" }),
            loadResourceBlob: async () => {
                loaded = true;
                return new Blob(["video"]);
            },
            mergeVideoBlobs: async () => {
                merged = true;
                return new Blob();
            },
        })).rejects.toThrow("超过当前浏览器本机打包的安全上限");
        expect(loaded).toBe(false);
        expect(merged).toBe(false);
    });

    test("容量元数据不准确时按实际下载体积二次阻断", async () => {
        let merged = false;
        await expect(createProjectDeliveryArchive(deliveryFixture(), "unit-1", undefined, {
            sourceBudgetBytes: 10,
            loadResourceMetadata: async () => ({ size: 1, kind: "video", status: "ready" }),
            loadResourceBlob: async () => new Blob([new Uint8Array(6)]),
            mergeVideoBlobs: async () => {
                merged = true;
                return new Blob();
            },
        })).rejects.toThrow("超过当前浏览器本机打包的安全上限");
        expect(merged).toBe(false);
    });
});
