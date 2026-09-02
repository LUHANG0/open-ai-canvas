import { describe, expect, test } from "bun:test";

describe("短剧创作全链路回归门禁", () => {
    test("AI 章节先生成并校验，再创建项目和导入章节", async () => {
        const source = await Bun.file(new URL("../src/pages/projects/index.tsx", import.meta.url)).text();
        const generateIndex = source.indexOf("const answer = await requestImageQuestion");
        const createIndex = source.indexOf("project = await createProject({");
        const importIndex = source.indexOf("await importProjectUnits");
        expect(generateIndex).toBeGreaterThan(0);
        expect(createIndex).toBeGreaterThan(generateIndex);
        expect(importIndex).toBeGreaterThan(createIndex);
        expect(source).toContain("项目已创建，但章节导入失败");
        expect(source).toContain("/chapters?import=1");
    });

    test("项目入口将卡片展示和 AI 故事投影与页面编排分离", async () => {
        const source = await Bun.file(new URL("../src/pages/projects/index.tsx", import.meta.url)).text();
        const storyProjection = await Bun.file(new URL("../src/pages/projects/project-story-generation.ts", import.meta.url)).text();
        expect(source).toContain('from "./project-list-card"');
        expect(source).toContain('from "./project-story-generation"');
        expect(source).not.toContain("function ProjectRow(");
        expect(source).not.toContain("function parseGeneratedStory(");
        expect(storyProjection).not.toContain("@/services/api/projects");
        expect(storyProjection).not.toContain("createProject(");
    });

    test("项目创建表单的画幅与内容来源分别更新各自状态", async () => {
        const source = await Bun.file(new URL("../src/pages/projects/index.tsx", import.meta.url)).text();
        const aspectRatioBlock = source.slice(source.indexOf('name="aspectRatio"'), source.indexOf('name="sourceType"'));
        const sourceTypeBlock = source.slice(source.indexOf('name="sourceType"'), source.indexOf("</div>", source.indexOf('name="sourceType"')));
        expect(aspectRatioBlock).not.toContain("setCreateSource");
        expect(sourceTypeBlock).toContain("setCreateSource");
    });

    test("章节与镜头编辑都持久化草稿并保护路由离开", async () => {
        const chapters = await Bun.file(new URL("../src/pages/projects/detail/chapters.tsx", import.meta.url)).text();
        const workflowDraft = await Bun.file(new URL("../src/pages/projects/detail/use-workflow-shot-draft.ts", import.meta.url)).text();
        for (const source of [chapters, workflowDraft]) {
            expect(source).toContain("useBlocker(");
            expect(source).toContain("beforeunload");
            expect(source).toContain("loadProjectEditorDraft");
            expect(source).toContain("saveProjectEditorDraft");
        }
        expect(workflowDraft).toContain("serverSnapshotKey");
        expect(workflowDraft).toContain("selectedShot?.id, serverSnapshotKey]");
    });

    test("失败的制作阶段可重新打开，任务失败原因可见", async () => {
        const workbench = await Bun.file(new URL("../src/pages/projects/detail/workflow-production-workbench.tsx", import.meta.url)).text();
        const preview = await Bun.file(new URL("../src/pages/projects/detail/workflow-production-preview.tsx", import.meta.url)).text();
        expect(workbench).toContain('updateWorkflowStep(projectId, productionStep.id, { status: "ready" })');
        expect(preview).toContain("generationErrorMessage(shotTask.error)");
        expect(preview).toContain("上次生成失败");
    });

    test("制作工作台按资产、规格、预览、导航和草稿边界拆分", async () => {
        const source = await Bun.file(new URL("../src/pages/projects/detail/workflow-production-workbench.tsx", import.meta.url)).text();
        for (const moduleName of [
            "workflow-production-assets",
            "workflow-production-settings",
            "workflow-production-preview",
            "workflow-production-navigation",
            "use-workflow-shot-draft",
        ]) {
            expect(source).toContain(`from "./${moduleName}"`);
        }
        expect(source).not.toContain("function AssetLibrary(");
        expect(source).not.toContain("function ArtifactHistory(");
        expect(source).not.toContain("useBlocker(");
    });

    test("章节页将编辑器、导入、生成对话框和任务状态投影分离", async () => {
        const source = await Bun.file(new URL("../src/pages/projects/detail/chapters.tsx", import.meta.url)).text();
        for (const moduleName of [
            "chapter-editor-toolbar",
            "chapter-import-dialogs",
            "chapter-generation-dialogs",
            "chapter-operation-state",
        ]) {
            expect(source).toContain(`from "./${moduleName}"`);
        }
        expect(source).not.toContain("function EditorToolbar(");
        expect(source).not.toContain("function ImportNovelModal(");
        expect(source).not.toContain("function chapterTaskResultAlreadyApplied(");
    });

    test("章节画布关联失败仍打开已创建的画布", async () => {
        const source = await Bun.file(new URL("../src/pages/projects/detail.tsx", import.meta.url)).text();
        const failureStart = source.indexOf("画布已创建，但章节关联失败");
        expect(failureStart).toBeGreaterThan(0);
        expect(source.slice(failureStart, failureStart + 360)).toContain("navigate(`/canvas/${id}`)");
    });
});
