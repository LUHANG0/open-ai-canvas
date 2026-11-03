import { expect, test } from "bun:test";
import { buildCanvasConnectionIndex, selectCanvasConnections } from "@/lib/canvas/canvas-connection-index";
import { canvasConnectionPath, canvasConnectionIndexBounds } from "@/lib/canvas/canvas-connection-geometry";
import { retainCanvasConnectionLayoutNodes } from "@/lib/canvas/canvas-layout-snapshot";
import { batchCellHandle } from "@/lib/canvas/canvas-batch-references";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const from: CanvasNodeData = { id: "right", type: CanvasNodeType.Image, title: "source", position: { x: 10000, y: 0 }, width: 240, height: 160 };
const to: CanvasNodeData = { ...from, id: "left", position: { x: 0, y: 0 } };
const edge = { id: "reverse", fromNodeId: from.id, toNodeId: to.id };

test("a reverse curve remains visible beyond both endpoint boxes", () => {
    const index = buildCanvasConnectionIndex([from, to], [edge]);
    expect(index.index.query({ left: 10800, top: 70, right: 11000, bottom: 90 }).map((item) => item.connection.id)).toEqual([edge.id]);
    expect(index.index.query({ left: -800, top: 70, right: -600, bottom: 90 }).map((item) => item.connection.id)).toEqual([edge.id]);
    expect(index.index.query({ left: 12000, top: 70, right: 12100, bottom: 90 })).toEqual([]);
});

test("resolved geometry survives semantic renders but changes with the actual anchors", () => {
    const initial = canvasConnectionPath(edge, from, to);
    expect(canvasConnectionPath(edge, { ...from, title: "renamed", metadata: { status: "success" } }, to)).toBe(initial);
    expect(canvasConnectionPath(edge, { ...from, position: { x: 10001, y: 0 } }, to)).not.toBe(initial);
    const resized = canvasConnectionPath(edge, { ...from, width: 300 }, to);
    expect(resized.startX).toBe(10300);
    expect(resized).not.toBe(initial);
    expect(canvasConnectionPath({ ...edge }, from, to)).not.toBe(initial);
});

const table: CanvasNodeData = {
    ...to,
    type: CanvasNodeType.BatchTable,
    width: 1280,
    height: 560,
    metadata: {
        batchTable: {
            operation: "creative",
            referenceColumns: [
                { id: "a", label: "A" },
                { id: "b", label: "B" },
            ],
            rows: [{ id: "row", prompt: "", inputNodeIds: [] }],
        },
    },
};

test("scroll-independent index covers cell anchors throughout both scroll axes", () => {
    const connection = { ...edge, toHandleId: batchCellHandle("row", "b") };
    const bounds = canvasConnectionIndexBounds(connection, from, table)!;
    let previous = canvasConnectionPath(connection, from, table);
    for (const top of [0, 100, 10000])
        for (const left of [0, 50, 10000]) {
            const geometry = canvasConnectionPath(connection, from, table, 0, 0, undefined, { top, left });
            expect(geometry.bounds.left).toBeGreaterThanOrEqual(bounds.left - 1e-8);
            expect(geometry.bounds.right).toBeLessThanOrEqual(bounds.right + 1e-8);
            expect(geometry.bounds.top).toBeGreaterThanOrEqual(bounds.top - 1e-8);
            expect(geometry.bounds.bottom).toBeLessThanOrEqual(bounds.bottom + 1e-8);
            expect(canvasConnectionPath(connection, from, table, 0, 0, undefined, { top, left })).toBe(geometry);
            if (top === 0 && left === 50) expect(geometry).not.toBe(previous);
            previous = geometry;
        }
});

test("composer changes invalidate the connection snapshot without changing node boxes", () => {
    const script: CanvasNodeData = { ...to, type: CanvasNodeType.Script, height: 500, position: { x: 1000, y: 0 }, metadata: { storyboardComposerHeight: 180 } };
    const nodes = [from, script],
        updated = [from, { ...script, metadata: { storyboardComposerHeight: 104 } }];
    const snapshot = retainCanvasConnectionLayoutNodes(nodes, updated);
    expect(snapshot).toBe(updated);
    const connection = { ...edge, toHandleId: "storyboard:context" };
    expect(
        buildCanvasConnectionIndex(snapshot, [connection])
            .index.query({ left: 990, right: 1001, top: 425, bottom: 448 })
            .map((x) => x.connection.id),
    ).toEqual([edge.id]);
    expect(retainCanvasConnectionLayoutNodes(updated, [from, { ...updated[1], title: "text", metadata: { ...updated[1].metadata, status: "loading" } }])).toBe(updated);
});

test("batch cell validity and reference column order invalidate only the port snapshot", () => {
    const connection = { ...edge, toHandleId: batchCellHandle("row", "b") };
    const data = table.metadata!.batchTable!;
    const missing = { ...table, metadata: { batchTable: { ...data, rows: [] } } };
    expect(buildCanvasConnectionIndex([from, missing], [connection]).entriesById.has(edge.id)).toBe(false);
    const valid = retainCanvasConnectionLayoutNodes([from, missing], [from, table]);
    expect(buildCanvasConnectionIndex(valid, [connection]).entriesById.has(edge.id)).toBe(true);
    const removed = retainCanvasConnectionLayoutNodes(valid, [from, missing]);
    expect(buildCanvasConnectionIndex(removed, [connection]).entriesById.has(edge.id)).toBe(false);
    const reordered = { ...table, metadata: { batchTable: { ...data, referenceColumns: [...data.referenceColumns!].reverse() } } };
    expect(retainCanvasConnectionLayoutNodes(valid, [from, reordered])).not.toBe(valid);
    const reference = { ...edge, toHandleId: "batch-reference:b" };
    const oldY = canvasConnectionPath(reference, from, table).endY;
    expect(canvasConnectionPath(reference, from, reordered).endY).not.toBe(oldY);
    const withoutColumn = { ...table, metadata: { batchTable: { ...data, referenceColumns: [data.referenceColumns![0]] } } };
    expect(retainCanvasConnectionLayoutNodes(valid, [from, withoutColumn])).not.toBe(valid);
    expect(canvasConnectionPath(connection, from, withoutColumn).pathD).toBe("");
    const semantic = { ...table, metadata: { batchTable: { ...data, rows: data.rows.map((row) => ({ ...row, prompt: "edited task" })) } } };
    expect(retainCanvasConnectionLayoutNodes(valid, [from, semantic])).toBe(valid);
});

test("viewport-crossing curves exceed the overscan budget and selected or dragged edges stay mounted", () => {
    const edges = Array.from({ length: 5001 }, (_, i) => ({ ...edge, id: `edge-${i}` }));
    const far = { ...to, id: "far", position: { x: 50000, y: 0 } };
    const protectedEdge = { id: "protected", fromNodeId: far.id, toNodeId: to.id };
    const index = buildCanvasConnectionIndex([from, to, far], [...edges, protectedEdge]);
    const view = { left: 10800, top: 70, right: 11000, bottom: 90 };
    const selected = selectCanvasConnections(index, view, view, 1, protectedEdge.id);
    expect(selected.filter((x) => x.connection.id.startsWith("edge-")).length).toBe(5001);
    expect(selected.some((x) => x.connection.id === protectedEdge.id)).toBe(true);
    const away = { left: -10000, top: -10000, right: -9900, bottom: -9900 };
    expect(selectCanvasConnections(index, away, away, 1, protectedEdge.id).map((x) => x.connection.id)).toEqual([protectedEdge.id]);
    expect(selectCanvasConnections(index, away, away, 1, null, new Set([far.id])).map((x) => x.connection.id)).toEqual([protectedEdge.id]);
});
