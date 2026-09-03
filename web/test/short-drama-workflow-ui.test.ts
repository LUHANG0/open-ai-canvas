import { describe, expect, test } from "bun:test";

describe("短剧制作工作台 PC 信息架构", () => {
    test("制作状态、中央监看、镜头检查器与时间线保持独立滚动边界", async () => {
        const workbench = await Bun.file(new URL("../src/pages/projects/detail/workflow-production-workbench.tsx", import.meta.url)).text();
        const preview = await Bun.file(new URL("../src/pages/projects/detail/workflow-production-preview.tsx", import.meta.url)).text();
        const navigation = await Bun.file(new URL("../src/pages/projects/detail/workflow-production-navigation.tsx", import.meta.url)).text();
        const css = await Bun.file(new URL("../src/pages/projects/detail/workflow.css", import.meta.url)).text();

        expect(workbench).toContain('className="workflow-production-statusbar"');
        expect(workbench).toContain('className="workflow-shot-kicker">镜头检查器');
        expect(workbench).toContain("workflow-generation-summary");
        expect(preview).toContain("workflow-preview-task-state");
        expect(preview).toContain("workflow-monitor-stage-label");
        expect(navigation).toContain("workflow-shot-timeline-summary");
        expect(css).toContain("grid-template-rows: 44px minmax(0, 1fr) clamp(158px, 18vh, 184px)");
        expect(css).toContain("scrollbar-gutter: stable");
        expect(css).toContain("overflow-x: auto");
    });

    test("交付页区分质量门禁、推荐后台交付与本机备用路径", async () => {
        const delivery = await Bun.file(new URL("../src/pages/projects/detail/workflow-stage-views.tsx", import.meta.url)).text();
        const css = await Bun.file(new URL("../src/pages/projects/detail/workflow.css", import.meta.url)).text();

        expect(delivery).toContain("workflow-delivery-readiness");
        expect(delivery).toContain("质量门禁已通过");
        expect(delivery).toContain("workflow-delivery-actions-primary");
        expect(delivery).toContain("workflow-delivery-actions-fallback");
        expect(delivery).toContain("workflow-delivery-job-status");
        expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.workflow-delivery-readiness\s*\{[\s\S]*display: grid;/);
    });
});
