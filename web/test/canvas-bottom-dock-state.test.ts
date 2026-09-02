import { describe, expect, test } from "bun:test";

import { activeCanvasAssetTrayNodeId, canShowCanvasMiniMap } from "../src/pages/canvas/canvas-bottom-dock-state";

describe("画布底部 Dock 状态", () => {
    test("素材托盘只在唯一选择时标记活动节点", () => {
        expect(activeCanvasAssetTrayNodeId(new Set())).toBeNull();
        expect(activeCanvasAssetTrayNodeId(new Set(["image-1"]))).toBe("image-1");
        expect(activeCanvasAssetTrayNodeId(new Set(["image-1", "image-2"]))).toBeNull();
    });

    test("专注模式隐藏小地图", () => {
        expect(canShowCanvasMiniMap(true, false)).toBe(true);
        expect(canShowCanvasMiniMap(true, true)).toBe(false);
        expect(canShowCanvasMiniMap(false, false)).toBe(false);
    });
});
