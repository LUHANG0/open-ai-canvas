import { describe, expect, test } from "bun:test";

describe("短剧创作全链路回归门禁", () => {
    test("AI 章节先生成并校验，再创建项目和导入章节", async () => {
        const source = await Bun.file(new URL("../src/pages/projects/index.tsx", import.meta.url)).text();
        const generateIndex = source.indexOf("const answer = await requestImageQuestion");
        const createIndex = source.indexOf("const project = await createUniqueProjectName");
        const importIndex = source.indexOf("await importProjectUnits");
        expect(generateIndex).toBeGreaterThan(0);
        expect(createIndex).toBeGreaterThan(generateIndex);
        expect(importIndex).toBeGreaterThan(createIndex);
        expect(source).toContain("项目已创建，但章节导入失败");
        expect(source).toContain("/chapters?import=1");
    });

    test("章节与镜头编辑都持久化草稿并保护路由离开", async () => {
        const chapters = await Bun.file(new URL("../src/pages/projects/detail/chapters.tsx", import.meta.url)).text();
        const workflow = await Bun.file(new URL("../src/pages/projects/detail/workflow-production-workbench.tsx", import.meta.url)).text();
        for (const source of [chapters, workflow]) {
            expect(source).toContain("useBlocker(");
            expect(source).toContain("beforeunload");
            expect(source).toContain("loadProjectEditorDraft");
            expect(source).toContain("saveProjectEditorDraft");
        }
    });

    test("失败的制作阶段可重新打开，任务失败原因可见", async () => {
        const source = await Bun.file(new URL("../src/pages/projects/detail/workflow-production-workbench.tsx", import.meta.url)).text();
        expect(source).toContain('updateWorkflowStep(projectId, productionStep.id, { status: "ready" })');
        expect(source).toContain("generationErrorMessage(shotTask.error)");
        expect(source).toContain("上次生成失败");
    });

    test("章节画布关联失败仍打开已创建的画布", async () => {
        const source = await Bun.file(new URL("../src/pages/projects/detail.tsx", import.meta.url)).text();
        const failureStart = source.indexOf("画布已创建，但章节关联失败");
        expect(failureStart).toBeGreaterThan(0);
        expect(source.slice(failureStart, failureStart + 360)).toContain("navigate(`/canvas/${id}`)");
    });
});
