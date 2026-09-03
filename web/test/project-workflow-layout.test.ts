import { expect, test } from "bun:test";

test("分镜制作以中央画面监看、右侧镜头检查器和底部时间线组织", async () => {
    const workbench = await Bun.file(new URL("../src/pages/projects/detail/workflow-production-workbench.tsx", import.meta.url)).text();
    const preview = await Bun.file(new URL("../src/pages/projects/detail/workflow-production-preview.tsx", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/pages/projects/detail/workflow.css", import.meta.url)).text();

    const previewPanel = workbench.indexOf("<WorkflowArtifactPreviewPanel");
    const shotInspector = workbench.indexOf('<section className="workflow-shot-editor">');
    expect(previewPanel).toBeGreaterThan(0);
    expect(shotInspector).toBeGreaterThan(previewPanel);

    expect(preview).toContain('aria-label="画面监看"');
    expect(preview).toContain('className="workflow-monitor-stage"');
    expect(workbench).toContain("workflow-editor-actions-meta");
    expect(workbench).toContain("workflow-editor-actions-primary");
    expect(css).toContain("grid-template-columns: 216px minmax(420px, 1fr) minmax(360px, 420px)");
    expect(css).toContain("object-fit: contain");
    expect(css).toContain("@media (max-width: 1120px)");
    expect(css).toMatch(/\.workflow-library-panel\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/\.workflow-preview-panel\s*\{\s*display:\s*none;/);
});
