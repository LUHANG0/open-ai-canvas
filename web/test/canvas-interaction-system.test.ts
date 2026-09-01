import { describe, expect, test } from "bun:test";

import { findAvailableNodePosition, layoutCompactNodeGroup } from "../src/lib/canvas/canvas-node-placement";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import { fitNodeSize } from "../src/lib/canvas/canvas-node-size";
import { canvasBackgroundModes, normalizeCanvasBackgroundMode } from "../src/lib/canvas-theme";

describe("画布媒体尺寸", () => {
    test("极端竖图保留比例且不突破最大边界", () => {
        const result = fitNodeSize(1080, 3840, 720, 520);
        expect(result.width).toBeCloseTo(146.25, 2);
        expect(result.height).toBeCloseTo(520, 2);
        expect(result.width / result.height).toBeCloseTo(1080 / 3840, 5);
    });

    test("极端横图保留比例且不突破最大边界", () => {
        const result = fitNodeSize(4096, 1024, 720, 520);
        expect(result.width).toBeCloseTo(720, 2);
        expect(result.height).toBeCloseTo(180, 2);
        expect(result.width / result.height).toBeCloseTo(4, 5);
    });

    test("小素材会放大到可读预览尺寸", () => {
        const result = fitNodeSize(100, 100);
        expect(result).toEqual({ width: 420, height: 420 });
    });
});

describe("画布插入避让", () => {
    const size = { width: 340, height: 240 };
    const center = { x: 500, y: 400 };

    test("目标位置空闲时保持用户意图", () => {
        expect(findAvailableNodePosition([], size, center)).toEqual({ x: 330, y: 280 });
    });

    test("目标位置被占用时优先放到相邻空位", () => {
        const occupied = [{ position: { x: 330, y: 280 }, ...size }];
        expect(findAvailableNodePosition(occupied, size, center)).toEqual({ x: 706, y: 280 });
    });

    test("连续插入不会与已落位节点重叠", () => {
        const first = { position: { x: 330, y: 280 }, ...size };
        const secondPosition = findAvailableNodePosition([first], size, center);
        const thirdPosition = findAvailableNodePosition([first, { position: secondPosition, ...size }], size, center);
        expect(thirdPosition).not.toEqual(first.position);
        expect(thirdPosition).not.toEqual(secondPosition);
    });
});

describe("批量素材紧凑布局", () => {
    const createNode = (id: string, width: number, height: number): CanvasNodeData => ({
        id,
        type: CanvasNodeType.Image,
        title: id,
        position: { x: 0, y: 0 },
        width,
        height,
        metadata: {},
    });

    test("按实际尺寸保留固定 24px 间距", () => {
        const placed = layoutCompactNodeGroup([
            createNode("wide", 720, 405),
            createNode("small", 340, 240),
            createNode("portrait", 292, 520),
        ], [], { x: 1000, y: 600 });
        expect(placed[1].position.x - (placed[0].position.x + placed[0].width)).toBe(24);
        expect(placed[2].position.x - (placed[1].position.x + placed[1].width)).toBe(24);
    });

    test("已有节点只平移整个批次，不改变批次内部间距", () => {
        const nodes = [createNode("a", 400, 240), createNode("b", 400, 240)];
        const free = layoutCompactNodeGroup(nodes, [], { x: 500, y: 400 });
        const shifted = layoutCompactNodeGroup(nodes, [{ position: { x: 76, y: 280 }, width: 848, height: 240 }], { x: 500, y: 400 });
        expect(free[1].position.x - free[0].position.x).toBe(424);
        expect(shifted[1].position.x - shifted[0].position.x).toBe(424);
        expect(shifted[0].position).not.toEqual(free[0].position);
    });
});

describe("画布外观兼容", () => {
    test("提供六种有效底纹", () => {
        expect(canvasBackgroundModes).toEqual(["dots", "lines", "fine-grid", "paper", "blueprint", "blank"]);
    });

    test("旧 pure-color 值与未知值有稳定回退", () => {
        expect(normalizeCanvasBackgroundMode("solid")).toBe("blank");
        expect(normalizeCanvasBackgroundMode("legacy-grid")).toBe("dots");
    });
});
