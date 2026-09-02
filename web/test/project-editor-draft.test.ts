import { describe, expect, test } from "bun:test";

import { parseProjectEditorDraft, projectEditorDraftKey } from "../src/services/project-editor-draft";
import { revisionInput, shotEditorValuesEqual, type ShotEditorValues } from "../src/pages/projects/detail/workflow-production-types";

describe("项目编辑草稿", () => {
    test("按编辑对象隔离章节和镜头草稿", () => {
        expect(projectEditorDraftKey("chapter", "project-1", "chapter-1")).toBe("project-editor-draft-v1:chapter:project-1:chapter-1");
        expect(projectEditorDraftKey("shot", "project-1", "shot-1")).not.toBe(projectEditorDraftKey("chapter", "project-1", "shot-1"));
    });

    test("只恢复身份匹配且结构有效的草稿", () => {
        const raw = JSON.stringify({
            version: 1,
            kind: "chapter",
            projectId: "project-1",
            entityId: "chapter-1",
            sourceUpdatedAt: "2026-09-03T00:00:00.000Z",
            savedAt: "2026-09-03T00:01:00.000Z",
            payload: { title: "本地标题", html: "<p>本地正文</p>" },
        });
        expect(parseProjectEditorDraft(raw, { kind: "chapter", projectId: "project-1", entityId: "chapter-1" })?.payload).toEqual({ title: "本地标题", html: "<p>本地正文</p>" });
        expect(parseProjectEditorDraft(raw, { kind: "chapter", projectId: "project-1", entityId: "chapter-2" })).toBeNull();
        expect(parseProjectEditorDraft("not-json", { kind: "chapter", projectId: "project-1", entityId: "chapter-1" })).toBeNull();
    });

    test("镜头草稿快照比较和版本输入投影保持字段语义", () => {
        const values: ShotEditorValues = {
            title: "开场镜头",
            plotDescription: "角色走进画面",
            action: "停下回头",
            dialogue: "你来了。",
            shotSize: "中景",
            cameraAngle: "平视",
            cameraMovement: "跟拍",
            durationSeconds: 3.5,
            imagePrompt: "夜景",
            videoPrompt: "缓慢跟拍",
            negativePrompt: "抖动",
            continuityNotes: "人物位于画面左侧",
        };

        expect(shotEditorValuesEqual(values, { ...values })).toBeTrue();
        expect(shotEditorValuesEqual(values, { ...values, dialogue: "另一句台词" })).toBeFalse();
        expect(revisionInput(values)).toEqual({
            plotDescription: values.plotDescription,
            action: values.action,
            dialogue: values.dialogue,
            shotSize: values.shotSize,
            cameraAngle: values.cameraAngle,
            cameraMovement: values.cameraMovement,
            durationMs: 3500,
            imagePrompt: values.imagePrompt,
            videoPrompt: values.videoPrompt,
            negativePrompt: values.negativePrompt,
            continuityNotes: values.continuityNotes,
        });
    });
});
