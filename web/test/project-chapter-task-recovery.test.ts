import { describe, expect, test } from "bun:test";

import { chapterTaskIdentity } from "@/pages/projects/detail/project-chapter-ai";
import { chapterOperationFromTask, chapterOperationKey, chapterTaskResultAlreadyApplied, formatOperationElapsed } from "@/pages/projects/detail/chapter-operation-state";
import type { ProjectDetail } from "@/services/api/projects";
import type { GenerationTask } from "@/services/api/task-center";

describe("章节生成任务刷新恢复", () => {
    test("优先从任务列表的安全客户端上下文识别章节与操作", () => {
        expect(chapterTaskIdentity(task({
            clientContext: {
                domainProjectId: "project-1",
                chapterId: "chapter-1",
                chapterOperation: "characters",
            },
        }))).toEqual({ chapterId: "chapter-1", kind: "characters" });
        expect(chapterTaskIdentity(task({
            clientContext: {
                domainProjectId: "project-1",
                chapterId: "chapter-2",
                chapterOperation: "assets",
            },
        }))).toEqual({ chapterId: "chapter-2", kind: "assets" });
    });

    test("任务详情可从脱敏输入 metadata 恢复分镜操作", () => {
        expect(chapterTaskIdentity(task({
            inputJson: JSON.stringify({
                metadata: {
                    domainProjectId: "project-1",
                    chapterId: "chapter-2",
                    source: "short-drama-chapter-storyboard",
                },
            }),
        }))).toEqual({ chapterId: "chapter-2", kind: "storyboard" });
    });

    test("无关、缺少章节或损坏的任务输入不会关联章节按钮", () => {
        expect(chapterTaskIdentity(task({ inputJson: "{" }))).toBeNull();
        expect(chapterTaskIdentity(task({ inputJson: JSON.stringify({ metadata: { chapterId: "chapter-1", operation: "chapter_asset_breakdown" } }) }))).toEqual({ chapterId: "chapter-1", kind: "assets" });
        expect(chapterTaskIdentity(task({ inputJson: JSON.stringify({ metadata: { operation: "chapter_character_breakdown" } }) }))).toBeNull();
        expect(chapterTaskIdentity(task({ inputJson: JSON.stringify({ metadata: { chapterId: "chapter-1", operation: "other" } }) }))).toBeNull();
    });

    test("刷新恢复状态按章节与操作隔离，并识别已落库结果", () => {
        const completed = task({
            status: "succeeded",
            startedAt: "2026-08-29T00:00:01.000Z",
            completedAt: "2026-08-29T00:00:05.000Z",
        });
        const detail = {
            assetCandidates: [{ unitId: "chapter-1", category: "character", updatedAt: "2026-08-29T00:00:06.000Z" }],
            shots: [{ unitId: "chapter-2", updatedAt: "2026-08-29T00:00:04.000Z" }],
        } as ProjectDetail;

        expect(chapterOperationKey("chapter-1", "characters")).toBe("chapter-1:characters");
        expect(chapterOperationFromTask(completed)).toEqual({ startedAt: Date.parse("2026-08-29T00:00:01.000Z"), taskId: "task-1" });
        expect(formatOperationElapsed(0, 65_000)).toBe("1分钟05秒");
        expect(chapterTaskResultAlreadyApplied(completed, "chapter-1", "characters", detail)).toBeTrue();
        expect(chapterTaskResultAlreadyApplied(completed, "chapter-1", "assets", detail)).toBeTrue();
        expect(chapterTaskResultAlreadyApplied(completed, "chapter-2", "storyboard", detail)).toBeFalse();
    });
});

function task(overrides: Partial<GenerationTask>): GenerationTask {
    return {
        id: "task-1",
        type: "text",
        status: "running",
        prompt: "",
        attempts: 1,
        createdAt: "2026-08-29T00:00:00.000Z",
        updatedAt: "2026-08-29T00:00:00.000Z",
        ...overrides,
    };
}
