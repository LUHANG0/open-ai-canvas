import { describe, expect, test } from "bun:test";

import { resolveCanvasLinkedProjectId } from "../src/pages/canvas/use-canvas-linked-project-query";

describe("画布关联项目查询", () => {
    test("只在短剧功能开启时查询已关联项目", () => {
        expect(resolveCanvasLinkedProjectId(true, "project-1")).toBe("project-1");
        expect(resolveCanvasLinkedProjectId(false, "project-1")).toBe("");
    });

    test("未关联项目时保持查询禁用所需的空标识", () => {
        expect(resolveCanvasLinkedProjectId(true, undefined)).toBe("");
        expect(resolveCanvasLinkedProjectId(true, "")).toBe("");
    });
});
