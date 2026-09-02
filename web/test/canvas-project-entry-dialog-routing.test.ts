import { describe, expect, test } from "bun:test";

import { resolveCanvasDirectorTemplateSelection } from "../src/pages/canvas/canvas-project-entry-dialog-routing";

describe("画布入口弹窗路由", () => {
    test("导演模板选择保留用户发起位置", () => {
        expect(resolveCanvasDirectorTemplateSelection({ position: { x: 320, y: 180 } }, "dialogue")).toEqual({ templateId: "dialogue", position: { x: 320, y: 180 } });
    });

    test("顶部入口发起时允许没有指定落点", () => {
        expect(resolveCanvasDirectorTemplateSelection(null, "empty")).toEqual({ templateId: "empty", position: undefined });
    });
});
