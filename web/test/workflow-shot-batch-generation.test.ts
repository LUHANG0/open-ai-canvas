import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "antd";

import { WorkflowBatchPrevizButton, WorkflowBatchVideoButton } from "../src/pages/projects/detail/workflow-batch-video-button";
import { buildWorkflowArtifactPrompt, workflowArtifactSpecification } from "../src/pages/projects/detail/workflow-generation-prompt";
import {
    planWorkflowBatchGeneration,
    savedShotEditorValues,
    settleWorkflowBatch,
} from "../src/pages/projects/detail/workflow-batch-generation";
import type { ProjectDetail, ProjectShot, ShotRevision } from "../src/services/api/projects";
import { defaultConfig } from "../src/stores/use-config-store";

const timestamp = "2026-09-03T00:00:00.000Z";

function shot(id: string, position: number, currentRevisionId?: string): ProjectShot {
    return { id, projectId: "project-1", unitId: "unit-1", currentRevisionId, title: id, description: `${id} description`, position, durationMs: 3000, status: "ready", createdAt: timestamp, updatedAt: timestamp };
}

function revision(shotId: string, version = 1): ShotRevision {
    return { id: `${shotId}-revision-${version}`, shotId, version, plotDescription: `${shotId} plot`, action: "向前跑", dialogue: "快走", shotSize: "中景", cameraAngle: "平视", cameraMovement: "跟拍", durationMs: 2500, imagePrompt: "image", videoPrompt: "video", negativePrompt: "blur", continuityNotes: "右手持伞", actionBeatsJson: "[]", createdAt: timestamp };
}

function detailFixture(): ProjectDetail {
    const shots = [
        shot("ready", 1, "ready-revision-1"),
        shot("running", 2, "running-revision-1"),
        shot("artifact-running", 3, "artifact-running-revision-1"),
        shot("missing", 4, "missing-revision-1"),
        shot("no-revision", 5),
    ];
    return {
        project: { id: "project-1", name: "batch", type: "short_drama" },
        units: [], canvases: [], canvasUnitLinks: [], assets: [], assetFolders: [], workflows: [], shots,
        shotRevisions: shots.slice(0, 4).map((item) => revision(item.id)),
        shotArtifacts: [
            { id: "ready-artifact", projectId: "project-1", unitId: "unit-1", shotId: "ready", revisionId: "ready-revision-1", type: "video", version: 1, status: "ready", selected: true, metadataJson: "{}", createdAt: timestamp, updatedAt: timestamp },
            { id: "active-artifact", projectId: "project-1", unitId: "unit-1", shotId: "artifact-running", revisionId: "artifact-running-revision-1", type: "video", version: 1, status: "running", selected: true, metadataJson: "{}", createdAt: timestamp, updatedAt: timestamp },
        ],
        shotReferences: [], assetCandidates: [],
        tasks: [{ id: "task-1", type: "canvas_video", status: "queued", prompt: "video", attempts: 0, createdAt: timestamp, updatedAt: timestamp, clientContext: { shotId: "running", artifactType: "video" } }],
    } as ProjectDetail;
}

describe("短剧镜头批量生成", () => {
    test("只计划缺少已选中产物且没有运行任务的已保存镜头", () => {
        const plan = planWorkflowBatchGeneration(detailFixture(), "unit-1", "video");
        expect(plan.candidates.map((item) => item.shot.id)).toEqual(["missing"]);
        expect(plan).toMatchObject({ readyCount: 1, activeCount: 2, unavailableCount: 1 });

        const locallySubmitting = planWorkflowBatchGeneration(detailFixture(), "unit-1", "video", new Set(["missing"]));
        expect(locallySubmitting.candidates).toHaveLength(0);
        expect(locallySubmitting.activeCount).toBe(3);
    });

    test("批量生成只使用服务端已保存版本投影", () => {
        const item = detailFixture().shots.find((candidate) => candidate.id === "missing")!;
        const values = savedShotEditorValues(item, revision("missing"));
        expect(values).toMatchObject({ title: "missing", plotDescription: "missing plot", videoPrompt: "video", durationSeconds: 2.5 });
    });

    test("视频阶段显示本批次实际可提交数量", () => {
        const markup = renderToStaticMarkup(React.createElement(App, null, React.createElement(WorkflowBatchVideoButton, {
            detail: detailFixture(),
            projectId: "project-1",
            unitId: "unit-1",
            editorDirty: false,
            routedModel: "MiniMax-H3",
            aspectRatio: "16:9",
            resolution: "768P",
            imageQuality: "auto",
            effectiveConfig: defaultConfig,
            generationConfig: { ...defaultConfig, model: "MiniMax-H3", videoModel: "MiniMax-H3" },
            availableSkills: [],
            selectedSkillIds: [],
            submittingShotIds: new Set<string>(),
            onSubmittingChange: () => undefined,
            onRefresh: async () => undefined,
        })));
        expect(markup).toContain("批量生成缺失视频（1）");
        expect(markup).toContain("只提交缺少已选中视频且当前没有运行任务的 1 个镜头");
    });

    test("动作预演使用固定 3×4 契约并显示可批量提交数量", () => {
        const prompt = buildWorkflowArtifactPrompt("previz", { plotDescription: "林夏推门进入楼道", action: "抬手、推门、回头" });
        expect(prompt).toContain("12 宫格");
        expect(prompt).toContain("严格 3 列 4 行");
        expect(prompt).toContain("从左到右、从上到下");
        expect(workflowArtifactSpecification("previz", "720", "2k")).toEqual({ quality: "2k", actionBoardRows: 4, actionBoardColumns: 3, actionBoardFrameCount: 12 });

        const markup = renderToStaticMarkup(React.createElement(App, null, React.createElement(WorkflowBatchPrevizButton, {
            detail: detailFixture(),
            projectId: "project-1",
            unitId: "unit-1",
            editorDirty: false,
            routedModel: "gpt-image-1",
            aspectRatio: "16:9",
            resolution: "720",
            imageQuality: "2k",
            effectiveConfig: defaultConfig,
            generationConfig: { ...defaultConfig, model: "gpt-image-1", imageModel: "gpt-image-1" },
            availableSkills: [],
            selectedSkillIds: [],
            submittingShotIds: new Set<string>(),
            onSubmittingChange: () => undefined,
            onRefresh: async () => undefined,
        })));
        expect(markup).toContain("批量生成 12 宫格预演（4）");
        expect(markup).toContain("只提交缺少已选中预演且当前没有运行任务的 4 个镜头");
    });

    test("并发提交有上限、保持结果顺序并隔离单项失败", async () => {
        let active = 0;
        let maxActive = 0;
        const results = await settleWorkflowBatch([1, 2, 3, 4, 5], async (item) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 5));
            active -= 1;
            if (item === 3) throw new Error("item failed");
            return item * 10;
        }, 2);
        expect(maxActive).toBe(2);
        expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled", "rejected", "fulfilled", "fulfilled"]);
        expect(results[4]).toEqual({ status: "fulfilled", value: 50 });
    });
});
