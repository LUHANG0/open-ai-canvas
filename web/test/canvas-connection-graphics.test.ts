import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Group, Path } from "@leafer-ui/draw";

import { canvasConnectionPath } from "../src/components/canvas/canvas-connections";
import { CanvasConnectionGraphics } from "../src/lib/canvas/canvas-connection-graphics";
import { canvasThemes, type CanvasTheme } from "../src/lib/canvas-theme";
import { CanvasNodeType, type CanvasDisplayConnection, type CanvasNodeData, type StoryboardRow } from "../src/types/canvas";

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function node(id: string, x = 0, y = 0): CanvasNodeData {
    return { id, type: CanvasNodeType.Text, title: id, position: { x, y }, width: 120, height: 80 };
}

function edge(id: string, from = node(`${id}-from`), to = node(`${id}-to`, 400)): CanvasDisplayConnection {
    return { connection: { id, fromNodeId: from.id, toNodeId: to.id }, from, to };
}

function fixture(displayConnections: CanvasDisplayConnection[]) {
    const group = new Group();
    const created: Path[] = [];
    const calculated: string[] = [];
    const graphics = new CanvasConnectionGraphics(group, (attributes) => {
        const graphic = new Path({ ...attributes, strokeScaleFixed: true, strokeCap: "round", hittable: false });
        created.push(graphic);
        return graphic;
    }, ({ connection, from, to }, fromScrollTop, toScrollTop) => {
        calculated.push(connection.id);
        return canvasConnectionPath(connection, from, to, fromScrollTop, toScrollTop).pathD;
    });
    const options = { displayConnections, selectedConnectionId: null as string | null, relatedConnectionIds: new Set<string>(), scriptScrollTopById: {} as Record<string, number>, theme: canvasThemes.dark as CanvasTheme };
    const sync = (next: Partial<typeof options> = {}) => graphics.sync({ ...options, ...next });
    sync();
    calculated.length = 0;
    cleanups.push(() => { graphics.destroy(); group.destroy(); });
    return { group, graphics, created, calculated, sync };
}

describe("CanvasConnectionGraphics", () => {
    test("dragging one endpoint keeps the other 499 paths untouched", () => {
        const edges = Array.from({ length: 500 }, (_, index) => edge(`edge-${index}`));
        const { group, created, calculated, sync } = fixture(edges);
        const unchanged = created[499];
        const unchangedSet = spyOn(unchanged, "set");
        const add = spyOn(group, "add");
        const moving = edges[0];
        const moved = { ...moving, from: { ...moving.from, position: { x: 32, y: 18 } } };

        sync({ displayConnections: [moved, ...edges.slice(1)] });

        expect(created).toHaveLength(500);
        expect(calculated).toEqual(["edge-0"]);
        expect(group.children[0]).toBe(created[0]);
        expect(group.children[499]).toBe(unchanged);
        expect(unchangedSet).not.toHaveBeenCalled();
        expect(add).not.toHaveBeenCalled();
        expect(created[0].path).toBe(canvasConnectionPath(moved.connection, moved.from, moved.to).pathD);
    });

    test("new wrappers, titles and irrelevant metadata do not recalculate or mutate paths", () => {
        const original = edge("edge");
        const { created, calculated, sync } = fixture([original]);
        const set = spyOn(created[0], "set");
        sync({
            displayConnections: [{
                ...original,
                connection: { ...original.connection },
                from: { ...original.from, title: "renamed", metadata: { prompt: "new prompt" } },
                to: { ...original.to, position: { ...original.to.position } },
            }],
            scriptScrollTopById: { [original.from.id]: 64 },
        });
        expect(calculated).toEqual([]);
        expect(created).toHaveLength(1);
        expect(set).not.toHaveBeenCalled();
    });

    test("moving shared endpoints and resizing updates only attached edges", () => {
        const shared = node("shared");
        const original = [edge("a", shared), edge("b", shared), edge("c")];
        const { created, calculated, sync } = fixture(original);
        const resized = { ...shared, width: 260, height: 180, position: { x: 45, y: 60 } };
        const next = original.map((item) => item.from.id === shared.id ? { ...item, from: resized } : item);
        sync({ displayConnections: next });
        expect(calculated).toEqual(["a", "b"]);
        expect(created).toHaveLength(3);
        next.slice(0, 2).forEach((item, index) => expect(created[index].path).toBe(canvasConnectionPath(item.connection, item.from, item.to).pathD));

        calculated.length = 0;
        const targetChanged = { ...next[0], to: { ...next[0].to, position: { x: 600, y: 35 }, height: 140 } };
        sync({ displayConnections: [targetChanged, ...next.slice(1)] });
        expect(calculated).toEqual(["a"]);
        expect(created[0].path).toBe(canvasConnectionPath(targetChanged.connection, targetChanged.from, targetChanged.to).pathD);
    });

    test("reconnecting an existing ID preserves its Path and updates the endpoints", () => {
        const original = edge("edge");
        const { group, created, calculated, sync } = fixture([original]);
        const reconnected = edge("edge", node("new-from", 60, 40), node("new-to", 650, 120));
        sync({ displayConnections: [reconnected] });
        expect(created).toHaveLength(1);
        expect(group.children[0]).toBe(created[0]);
        expect(calculated).toEqual(["edge"]);
        expect(created[0].path).toBe(canvasConnectionPath(reconnected.connection, reconnected.from, reconnected.to).pathD);
    });

    test("selection, related-node hover and theme changes update only appearance", () => {
        const { created, calculated, sync } = fixture([edge("a"), edge("b")]);
        sync({ selectedConnectionId: "a", relatedConnectionIds: new Set(["b"]) });
        created.forEach((graphic) => {
            expect(graphic.stroke).toBe(canvasThemes.dark.accent.primary);
            expect(graphic.strokeWidth).toBe(1.6);
            expect(graphic.opacity).toBe(0.52);
        });
        sync({ theme: canvasThemes.light, relatedConnectionIds: new Set(["b"]) });
        expect(created[0].stroke).toBe(canvasThemes.light.node.muted);
        expect(created[0].strokeWidth).toBe(1);
        expect(created[0].opacity).toBe(0.24);
        expect(created[1].stroke).toBe(canvasThemes.light.accent.primary);
        expect(calculated).toEqual([]);
        expect(created).toHaveLength(2);
    });

    test("storyboard scroll, row order, handles and composer height invalidate geometry", () => {
        const rows = [{ id: "row-a" }, { id: "row-b" }] as StoryboardRow[];
        const script: CanvasNodeData = { ...node("script"), type: CanvasNodeType.Script, height: 560, metadata: { storyboard: { rows } } };
        let current = edge("edge", script, { ...script, id: "target", position: { x: 800, y: 0 } });
        current.connection = { ...current.connection, fromHandleId: "row:row-b", toHandleId: "row:row-b" };
        const { created, calculated, sync } = fixture([current]);
        const scroll = { script: 20, target: 35 };
        const verify = () => {
            sync({ displayConnections: [current], scriptScrollTopById: scroll });
            expect(calculated.splice(0)).toEqual(["edge"]);
            expect(created).toHaveLength(1);
            expect(created[0].path).toBe(canvasConnectionPath(current.connection, current.from, current.to, scroll.script, scroll.target).pathD);
        };
        verify();
        current = { ...current, from: { ...current.from, metadata: { storyboard: { rows: [...rows].reverse() } } } };
        verify();
        current = { ...current, connection: { ...current.connection, fromHandleId: "storyboard:context", toHandleId: "row:row-a" } };
        verify();
        current = { ...current, from: { ...current.from, metadata: { ...current.from.metadata, storyboardComposerHeight: 180 } } };
        verify();
    });

    test("visibility changes, insertion, reorder and cleanup preserve scene lifecycle", () => {
        const a = edge("a"), b = edge("b"), c = edge("c");
        const { group, graphics, created, calculated, sync } = fixture([a, b]);
        const [aPath, bPath] = created;
        sync({ displayConnections: [b, c, a] });
        const cPath = created[2];
        expect(group.children).toEqual([bPath, cPath, aPath]);
        expect(calculated.splice(0)).toEqual(["c"]);
        expect(aPath.destroyed).toBeFalsy();
        expect(bPath.destroyed).toBeFalsy();

        sync({ displayConnections: [a, c] });
        expect(group.children).toEqual([aPath, cPath]);
        expect(bPath.destroyed).toBe(true);
        expect(bPath.parent).toBeNull();
        expect(calculated).toEqual([]);

        sync({ displayConnections: [a, b, c] });
        expect(created).toHaveLength(4);
        expect(group.children).toEqual([aPath, created[3], cPath]);
        graphics.destroy();
        expect(group.children).toHaveLength(0);
        expect(created.every((graphic) => graphic.destroyed)).toBe(true);
        sync({ displayConnections: [a] });
        expect(group.children).toHaveLength(1);
        expect(group.children[0]).not.toBe(aPath);
    });
});
