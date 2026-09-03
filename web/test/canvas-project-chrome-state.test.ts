import { describe, expect, test } from "bun:test";

import { buildCanvasProjectTopBarContext, canShowCanvasProjectSidebar, canShowCanvasProjectTopBar } from "../src/pages/canvas/canvas-project-chrome-state";

describe("画布项目外壳", () => {
    test("专注模式隐藏顶栏和关联项目侧栏", () => {
        expect(canShowCanvasProjectTopBar(false)).toBe(true);
        expect(canShowCanvasProjectTopBar(true)).toBe(false);
        expect(canShowCanvasProjectSidebar(false, true, "project-1")).toBe(true);
        expect(canShowCanvasProjectSidebar(true, true, "project-1")).toBe(false);
        expect(canShowCanvasProjectSidebar(false, false, "project-1")).toBe(false);
        expect(canShowCanvasProjectSidebar(false, true, null)).toBe(false);
    });

    test("只有关联短剧项目时才在顶栏注入项目上下文", () => {
        const context = { nodeCount: 3 };
        expect(buildCanvasProjectTopBarContext(context, true, "project-1", "测试项目")).toEqual({ nodeCount: 3, projectId: "project-1", projectName: "测试项目" });
        expect(buildCanvasProjectTopBarContext(context, false, "project-1", "测试项目")).toBeUndefined();
        expect(buildCanvasProjectTopBarContext(context, true, null, "测试项目")).toBeUndefined();
    });
});
