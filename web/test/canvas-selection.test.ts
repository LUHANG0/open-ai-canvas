import { describe, expect, test } from "bun:test";

import {
    applyCanvasSelectionStrategy,
    canvasSelectionHitsBounds,
    createCanvasSelectionBounds,
    createCanvasSelectionSpatialIndexCache,
    offsetSelectedNodeBounds,
    resolveCanvasPointerIntent,
    resolveCanvasSelectionHitMode,
    resolveCanvasSelectionPreviewDelta,
    resolveCanvasSelectionStrategy,
    selectedNodesWorldBounds,
} from "@/lib/canvas/canvas-selection";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

describe("canvas selection semantics", () => {
    test("maps modifiers to replace, add, toggle, and subtract strategies", () => {
        expect(resolveCanvasSelectionStrategy({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false })).toBe("replace");
        expect(resolveCanvasSelectionStrategy({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: true })).toBe("add");
        expect(resolveCanvasSelectionStrategy({ altKey: false, ctrlKey: true, metaKey: false, shiftKey: false })).toBe("toggle");
        expect(resolveCanvasSelectionStrategy({ altKey: false, ctrlKey: false, metaKey: true, shiftKey: false })).toBe("toggle");
        expect(resolveCanvasSelectionStrategy({ altKey: true, ctrlKey: true, metaKey: true, shiftKey: true })).toBe("subtract");
    });

    test("selects partially intersecting nodes in both drag directions like LibTV", () => {
        expect(resolveCanvasSelectionHitMode(0, 100)).toBe("intersect");
        expect(resolveCanvasSelectionHitMode(100, 0)).toBe("intersect");
        expect(createCanvasSelectionBounds(100, 80, 0, 20)).toEqual({ left: 0, top: 20, right: 100, bottom: 80 });
    });

    test("distinguishes fully contained nodes from partially intersecting nodes", () => {
        const selection = { left: 0, top: 0, right: 100, bottom: 100 };
        const contained = { left: 10, top: 10, right: 90, bottom: 90 };
        const partial = { left: 80, top: 80, right: 120, bottom: 120 };

        expect(canvasSelectionHitsBounds(selection, contained, "contain")).toBe(true);
        expect(canvasSelectionHitsBounds(selection, partial, "contain")).toBe(false);
        expect(canvasSelectionHitsBounds(selection, partial, "intersect")).toBe(true);
    });

    test("applies all four selection strategies against the gesture-start snapshot", () => {
        const initial = ["a", "b"];
        const hits = ["b", "c"];

        expect([...applyCanvasSelectionStrategy(initial, hits, "replace")]).toEqual(["b", "c"]);
        expect([...applyCanvasSelectionStrategy(initial, hits, "add")]).toEqual(["a", "b", "c"]);
        expect([...applyCanvasSelectionStrategy(initial, hits, "toggle")]).toEqual(["a", "c"]);
        expect([...applyCanvasSelectionStrategy(initial, hits, "subtract")]).toEqual(["a"]);
    });

    test("derives transient include/remove markers without cloning the full selection", () => {
        const initial = new Set(["a", "b"]);
        const hits = new Set(["b", "c"]);

        expect(resolveCanvasSelectionPreviewDelta(initial, hits, "replace")).toEqual({ includeNodeIds: new Set(["c"]), removeNodeIds: new Set(["a"]) });
        expect(resolveCanvasSelectionPreviewDelta(initial, hits, "add")).toEqual({ includeNodeIds: new Set(["c"]), removeNodeIds: new Set() });
        expect(resolveCanvasSelectionPreviewDelta(initial, hits, "toggle")).toEqual({ includeNodeIds: new Set(["c"]), removeNodeIds: new Set(["b"]) });
        expect(resolveCanvasSelectionPreviewDelta(initial, hits, "subtract")).toEqual({ includeNodeIds: new Set(), removeNodeIds: new Set(["b"]) });
    });

    test("routes default mouse selection without stealing trackpad or temporary hand gestures", () => {
        const pointer = { altKey: false, background: true, boxSelectEnabled: true, button: 0, ctrlKey: false, metaKey: false, pointerType: "mouse", shiftKey: false, spacePressed: false };
        expect(resolveCanvasPointerIntent(pointer)).toBe("select");
        expect(resolveCanvasPointerIntent({ ...pointer, spacePressed: true })).toBe("pan");
        expect(resolveCanvasPointerIntent({ ...pointer, button: 1 })).toBe("pan");
        expect(resolveCanvasPointerIntent({ ...pointer, pointerType: "touch" })).toBe("pan");
        expect(resolveCanvasPointerIntent({ ...pointer, background: false })).toBe("ignore");
        expect(resolveCanvasPointerIntent({ ...pointer, background: false, spacePressed: true })).toBe("pan");
        expect(resolveCanvasPointerIntent({ ...pointer, background: false, button: 1 })).toBe("pan");
        expect(resolveCanvasPointerIntent({ ...pointer, boxSelectEnabled: false })).toBe("pan");
        expect(resolveCanvasPointerIntent({ ...pointer, boxSelectEnabled: false, shiftKey: true })).toBe("select");
    });

    test("Mac secondary click never selects or pans while primary platform modifiers keep selection", () => {
        const pointer = { altKey: false, background: true, boxSelectEnabled: true, button: 0, ctrlKey: false, metaKey: false, pointerType: "mouse", shiftKey: false, spacePressed: false };
        for (const background of [true, false]) {
            for (const boxSelectEnabled of [true, false]) {
                const input = { ...pointer, background, boxSelectEnabled, ctrlKey: true };
                expect(resolveCanvasPointerIntent(input, "mac")).toBe("ignore");
                expect(resolveCanvasPointerIntent({ ...input, spacePressed: true }, "mac")).toBe("ignore");
                expect(resolveCanvasPointerIntent({ ...input, ctrlKey: false, button: 2 }, "mac")).toBe("ignore");
            }
        }
        expect(resolveCanvasPointerIntent({ ...pointer, boxSelectEnabled: false, metaKey: true }, "mac")).toBe("select");
        expect(resolveCanvasPointerIntent({ ...pointer, boxSelectEnabled: false, ctrlKey: true }, "other")).toBe("select");
        expect(resolveCanvasPointerIntent({ ...pointer, boxSelectEnabled: false, shiftKey: true }, "mac")).toBe("select");
    });

    test("reuses the selectable-node spatial index until the node array changes", () => {
        const nodes: CanvasNodeData[] = [
            node("batch-root", 0, 0, { isBatchRoot: true, imageBatchExpanded: false }),
            node("batch-child", 20, 20, { batchRootId: "batch-root" }),
            { ...node("frame", 300, 0), type: CanvasNodeType.Frame, metadata: { frame: { collapsed: true, expandedWidth: 160, expandedHeight: 90 } } },
            { ...node("frame-child", 320, 20), parentId: "frame" },
            node("visible", 600, 0),
        ];
        const cache = createCanvasSelectionSpatialIndexCache();
        const first = cache.get(nodes);

        expect(cache.get(nodes)).toBe(first);
        expect(first.query({ left: -10, top: -10, right: 1000, bottom: 300 }).map((item) => item.id)).toEqual(["batch-root", "frame", "visible"]);
        expect(cache.get([...nodes])).not.toBe(first);
    });

    test("offsets multi-select bounds with the live drag preview", () => {
        const bounds = selectedNodesWorldBounds([node("a", 100, 40), node("b", 300, 80)]);
        expect(bounds).toEqual({ left: 100, top: 40, width: 360, height: 130, count: 2 });
        expect(offsetSelectedNodeBounds(bounds!, { x: 40, y: -20 })).toEqual({ left: 140, top: 20, width: 360, height: 130, count: 2 });
        expect(selectedNodesWorldBounds([node("a", 100, 40), node("b", 300, 80)], { x: 40, y: -20, nodeIds: new Set(["a", "b"]) })).toEqual({ left: 140, top: 20, width: 360, height: 130, count: 2 });
    });
});

function node(id: string, x: number, y: number, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Image,
        title: id,
        position: { x, y },
        width: 160,
        height: 90,
        metadata,
    };
}
