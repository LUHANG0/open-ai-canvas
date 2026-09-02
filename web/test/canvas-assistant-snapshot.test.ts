import { describe, expect, test } from "bun:test";
import { createCanvasAssistantSnapshotView } from "../src/pages/canvas/use-canvas-agent-operations";
import type { CanvasAgentSnapshot } from "../src/lib/canvas/canvas-agent-ops";

describe("画布 Agent 实时快照视图", () => {
    test("节点数据保持稳定，视口、版本与哈希读取最新引用", () => {
        const original = {
            projectId: "canvas-1",
            title: "画布",
            nodes: [{ id: "node-1" }],
            connections: [],
            selectedNodeIds: ["node-1"],
            viewport: { x: 0, y: 0, k: 1 },
            revision: 1,
            stateHash: "hash-1",
        } as CanvasAgentSnapshot;
        const viewportRef = { current: original.viewport };
        const liveSnapshotRef = { current: original };
        const view = createCanvasAssistantSnapshotView(original, ["node-1"], viewportRef, liveSnapshotRef);

        viewportRef.current = { x: 240, y: 120, k: 0.65 };
        liveSnapshotRef.current = { ...original, revision: 2, stateHash: "hash-2" };

        expect(view.nodes).toBe(original.nodes);
        expect(view.connections).toBe(original.connections);
        expect(view.viewport).toEqual({ x: 240, y: 120, k: 0.65 });
        expect(view.revision).toBe(2);
        expect(view.stateHash).toBe("hash-2");
    });
});
