import { describe, expect, test } from "bun:test";

import { bringCanvasNodeToFront, sortCanvasNodesByStackOrder, sortCanvasNodesForRendering } from "../src/lib/canvas/canvas-node-stack-order";
import { buildCanvasSpatialIndex, canvasNodeBounds } from "../src/lib/canvas/canvas-spatial-index";
import { selectCanvasVisibleNodes } from "../src/lib/canvas/canvas-node-visibility";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const node = (id: string, type = CanvasNodeType.Image, x = 0): CanvasNodeData => ({ id, type, title: id, position: { x, y: 0 }, width: 1, height: 1 });
const ranks = (nodes: CanvasNodeData[]) => new Map(nodes.map((item, index) => [item.id, index]));
const ids = (nodes: CanvasNodeData[]) => nodes.map((item) => item.id);

describe("canvas node stack order", () => {
    test("moves the interacted node to the paint-order end", () => {
        expect(bringCanvasNodeToFront(["a", "b"], "a")).toEqual(["b", "a"]);
        expect(bringCanvasNodeToFront(["a", "b"], "c")).toEqual(["a", "b", "c"]);
        const alreadyFront = ["a", "b"];
        expect(bringCanvasNodeToFront(alreadyFront, "b")).toBe(alreadyFront);
    });

    test("keeps untouched nodes stable while the latest node remains on top after deselection", () => {
        const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
        expect(sortCanvasNodesByStackOrder(nodes, ["b", "a"])).toEqual([{ id: "c" }, { id: "b" }, { id: "a" }]);
    });

    test("viewport grouping cannot change frame-first document order", () => {
        const nodes = [node("a"), node("frame-a", CanvasNodeType.Frame), node("b"), node("frame-b", CanvasNodeType.Frame), node("c")];
        const documentOrder = ranks(nodes);
        for (const visible of [nodes, [...nodes].reverse(), [nodes[4], nodes[3], nodes[0], nodes[1], nodes[2]]]) {
            expect(ids(sortCanvasNodesForRendering(visible, documentOrder, []))).toEqual(["frame-a", "frame-b", "a", "b", "c"]);
            expect(ids(sortCanvasNodesForRendering(visible, documentOrder, ["b", "frame-a", "a"]))).toEqual(["frame-a", "frame-b", "c", "b", "a"]);
        }
    });

    test("current document creation, deletion and reordering override stale viewport membership", () => {
        const a = node("a");
        const b = node("b");
        const removed = node("removed");
        const added = node("added");
        const hidden = node("hidden");
        expect(ids(sortCanvasNodesForRendering([b, removed, a, added], ranks([added, a, hidden, b]), ["removed", "a"]))).toEqual(["added", "b", "a"]);
        expect(ids(sortCanvasNodesForRendering([b, a, added], ranks([b, hidden, added, a]), []))).toEqual(["b", "added", "a"]);
        expect(sortCanvasNodesForRendering([], ranks([a, b]), ["a"])).toEqual([]);
    });

    test("playback keeps mounted regular-node order while new members use document order", () => {
        const nodes = [node("new-a"), node("a"), node("frame", CanvasNodeType.Frame), node("new-b"), node("b")];
        const documentOrder = ranks(nodes);
        const mountedOrder = ["b", "deleted", "a"];
        expect(ids(sortCanvasNodesForRendering([...nodes].reverse(), documentOrder, mountedOrder))).toEqual(["frame", "new-a", "new-b", "b", "a"]);
        expect(ids(sortCanvasNodesForRendering(nodes, documentOrder, mountedOrder))).toEqual(["frame", "new-a", "new-b", "b", "a"]);
        expect(ids(sortCanvasNodesForRendering(nodes, documentOrder, ["b"]))).toEqual(["frame", "new-a", "a", "new-b", "b"]);
    });

    test("selected members keep document identity order across capped retention and reverse zoom", () => {
        const nodes = Array.from({ length: 1000 }, (_, index) => node(String(index), CanvasNodeType.Image, index));
        const nodeById = new Map(nodes.map((item) => [item.id, item]));
        const documentOrder = ranks(nodes);
        const index = buildCanvasSpatialIndex(nodes.map((item) => ({ id: item.id, value: item.id, bounds: canvasNodeBounds(item) })));
        const retain = { left: -1, right: 1001, top: -1, bottom: 2 };
        let retainedIds = new Set(ids(nodes));
        for (const [left, right] of [[0, 600], [200, 500], [400, 800], [200, 500], [0, 1001]]) {
            const visible = selectCanvasVisibleNodes({ index, nodeById, view: { ...retain, left, right }, enter: retain, retain, retainedIds, hiddenIds: new Set(), forcedIds: new Set(), budget: 280 });
            const ordered = sortCanvasNodesForRendering(visible, documentOrder, []);
            const selectedIds = new Set(ids(visible));
            const expected = nodes.filter((item) => selectedIds.has(item.id));
            expect(ids(ordered)).toEqual(ids(expected));
            ordered.forEach((item, i) => expect(item).toBe(expected[i]));
            retainedIds = new Set(ids(ordered));
        }
    });
});
