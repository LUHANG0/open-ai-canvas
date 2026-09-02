import { describe, expect, test } from "bun:test";

describe("画布生成任务操作归属", () => {
    test("取消、详情和资源重载由生成生命周期模块统一提供", async () => {
        const generation = await Bun.file(new URL("../src/pages/canvas/use-canvas-generation.ts", import.meta.url)).text();
        const project = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();

        expect(generation).toContain("const cancelCanvasTask = useCallback(");
        expect(generation).toContain("const reloadCanvasNodeResource = useCallback(");
        expect(generation).toContain("const openCanvasNodeTaskDetails = useCallback(");
        expect(generation).toContain("cancelGenerationTask(task.id)");
        expect(generation).toContain('queryGenerationTask(taskId)');
        expect(project).toContain("cancelCanvasTask, finishGenerationRequest, openCanvasNodeTaskDetails, reloadCanvasNodeResource");
        expect(project).not.toContain("cancelGenerationTask(task.id)");
        expect(project).not.toContain("原生成任务尚未成功，无法重新加载资源");
    });
});
