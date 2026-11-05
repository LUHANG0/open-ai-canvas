import { describe, expect, test } from "bun:test";
import { selectCanvasVisibleNodes } from "@/lib/canvas/canvas-node-visibility";
import { buildCanvasSpatialIndex, canvasNodeBounds, type CanvasSpatialBounds } from "@/lib/canvas/canvas-spatial-index";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const image = (id: string, x: number, y = 0): CanvasNodeData => ({ id, type: CanvasNodeType.Image, title: id, position: { x, y }, width: 1, height: 1 });
const bounds = (left: number, right: number): CanvasSpatialBounds => ({ left, right, top: -1, bottom: 2 });
const ids = (nodes: CanvasNodeData[]) => nodes.map((node) => node.id);
function select(nodes: CanvasNodeData[], view: CanvasSpatialBounds, retain: CanvasSpatialBounds, retainedIds = new Set<string>(), options: { enter?: CanvasSpatialBounds; hiddenIds?: Set<string>; forcedIds?: Set<string>; budget?: number } = {}) {
    return selectCanvasVisibleNodes({
        index: buildCanvasSpatialIndex(nodes.map((node) => ({ id: node.id, value: node.id, bounds: canvasNodeBounds(node) }))),
        nodeById: new Map(nodes.map((node) => [node.id, node])),
        view, retain, enter: options.enter ?? retain, retainedIds,
        hiddenIds: options.hiddenIds ?? new Set(), forcedIds: options.forcedIds ?? new Set(), budget: options.budget ?? 280,
    });
}

describe("canvas mounted-node retention", () => {
    test("1000 in-view nodes stay complete while local zoom caps retention at 720", () => {
        const nodes = Array.from({ length: 1000 }, (_, i) => image(String(i), i));
        let mounted = new Set<string>();
        for (const right of [1001, 600, 500, 400, 500, 600, 1001, 400, 1001]) {
            const result = select(nodes, bounds(-1, right), bounds(-1, 1001), mounted);
            expect(ids(result)).toEqual(ids(nodes.slice(0, right === 1001 ? 1000 : 720)));
            mounted = new Set(ids(result));
        }
        const local = select(nodes, bounds(-1, 100), bounds(-1, 200), mounted);
        expect(ids(local)).toEqual(ids(nodes.slice(0, 200)));
        expect(ids(select(nodes, bounds(-1, 1001), bounds(-1, 1001), new Set(ids(local))))).toEqual(ids(nodes));
    });

    test("500 mounted nodes keep their identities through zoom while inside retain", () => {
        const nodes = Array.from({ length: 500 }, (_, i) => image(String(i), i));
        let mounted = new Set(ids(select(nodes, bounds(-1, 501), bounds(-1, 501))));
        for (const right of [400, 200, 100, 200, 400, 501, 100]) {
            const result = select(nodes, bounds(-1, right), bounds(-1, 501), mounted, { enter: bounds(-1, right) });
            expect(ids(result)).toEqual(ids(nodes));
            result.forEach((node, i) => expect(node).toBe(nodes[i]));
            mounted = new Set(ids(result));
        }
    });

    test("mounted nodes win over earlier new candidates without reordering overscan", () => {
        const nodes = [image("new-a", 20), image("old-a", 30), image("new-b", 40), image("old-b", 50), image("visible", 0)];
        const mounted = new Set(["old-a", "old-b"]);
        expect(ids(select(nodes, bounds(-1, 10), bounds(-1, 100), mounted, { budget: 3 }))).toEqual(["visible", "old-a", "old-b"]);
        expect(ids(select(nodes, bounds(-1, 10), bounds(-1, 100), mounted, { budget: 4 }))).toEqual(["visible", "new-a", "old-a", "old-b"]);
    });

    test("released high-water slots cannot be refilled by new preloads", () => {
        const old = Array.from({ length: 1000 }, (_, i) => image(`old-${i}`, i));
        const fresh = Array.from({ length: 1000 }, (_, i) => image(`new-${i}`, 2000 + i));
        const nodes = [...old, ...fresh];
        const result = select(nodes, bounds(-1, 100), bounds(-1, 3001), new Set(ids(old)), { hiddenIds: new Set(ids(old.slice(200))) });
        expect(ids(result)).toEqual([...ids(old.slice(0, 200)), ...ids(fresh.slice(0, 80))]);
    });

    test("continuous cross-region pans release history and keep normal preload bounds", () => {
        const nodes = Array.from({ length: 5000 }, (_, i) => image(String(i), i));
        let mounted = new Set(ids(nodes.slice(0, 1000)));
        for (let left = 1200; left <= 4200; left += 300) {
            const result = select(nodes, bounds(left, left + 100), bounds(left - 100, left + 500), mounted);
            const expected = [...nodes.slice(left, left + 100), ...nodes.slice(left - 100, left), ...nodes.slice(left + 100, left + 180)];
            expect(ids(result)).toEqual(ids(expected));
            mounted = new Set(ids(result));
        }
    });

    test("hidden, removed and moved nodes are released; forced nodes remain semantic", () => {
        const nodes = [image("hidden", 0), image("collapsed-child", 20), image("moved", 1000), image("kept", 40), image("forced", 2000), image("hidden-forced", 3000)];
        const result = select(nodes, bounds(-1, 10), bounds(-1, 100), new Set(["hidden", "collapsed-child", "removed", "moved", "kept"]), {
            hiddenIds: new Set(["hidden", "collapsed-child", "hidden-forced"]), forcedIds: new Set(["forced", "hidden-forced", "missing"]), budget: 1,
        });
        expect(ids(result)).toEqual(["forced", "kept"]);
    });

    test("retain and enter intersections exclude touching edges on both axes", () => {
        const nodes = [image("retain-left-touch", -11), image("retain-right-touch", 20), image("retain-top-touch", 5, -2), image("retain-bottom-touch", 5, 2), image("retained", 15), image("enter-touch", 10), image("entered", 9.5), image("view-touch", 5)];
        const result = select(nodes, bounds(0, 5), bounds(-10, 20), new Set(ids(nodes.slice(0, 5))), { enter: bounds(0, 10), budget: 20 });
        expect(ids(result)).toEqual(["retained", "entered", "view-touch"]);
    });

    test("low-density preload budget and enter eligibility still apply", () => {
        const nodes = [image("visible", 0), image("new", 20), image("retain-only-new", 80)];
        expect(ids(select(nodes, bounds(-1, 10), bounds(-1, 100), new Set(), { enter: bounds(-1, 50), budget: 2 }))).toEqual(["visible", "new"]);
        expect(ids(select(nodes, bounds(-1, 10), bounds(-1, 100), new Set(), { budget: 1 }))).toEqual(["visible"]);
        expect(ids(select([nodes[0]], bounds(-1, 10), bounds(-1, 100), new Set(), { budget: 0 }))).toEqual(["visible"]);
    });

    test("new visible and forced nodes exceed budget without truncation, retained nodes remain capped", () => {
        const nodes = Array.from({ length: 1000 }, (_, i) => image(String(i), i));
        const forced = image("forced", 2000);
        const result = select([...nodes, forced], bounds(-1, 600), bounds(-1, 1001), new Set(ids(nodes.slice(500))), { forcedIds: new Set(["forced"]), budget: 280 });
        expect(ids(result)).toEqual([...ids(nodes.slice(0, 600)), "forced"]);
        expect(ids(select([...nodes, forced], bounds(-1, 1001), bounds(-1, 1001), new Set(), { forcedIds: new Set(["forced"]), budget: 0 }))).toEqual([...ids(nodes), "forced"]);
    });
});
