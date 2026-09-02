import { describe, expect, test } from "bun:test";

import { parseProjectEditorDraft, projectEditorDraftKey } from "../src/services/project-editor-draft";

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
});
