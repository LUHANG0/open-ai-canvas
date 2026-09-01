import { expect, test } from "bun:test";

import { getCanvasSelectionCapabilities } from "../src/lib/canvas/canvas-selection-capabilities";
import { normalizeToolbarPrefs } from "../src/lib/canvas/tool-registry";
import { applyCanvasHistoryPatch, createCanvasHistoryPatch, type CanvasHistorySnapshot } from "../src/pages/canvas/use-canvas-history";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function node(id: string, type: CanvasNodeType, options?: { locked?: boolean; content?: string }): CanvasNodeData {
    return {
        id,
        type,
        title: id,
        position: { x: 0, y: 0 },
        width: 100,
        height: 100,
        metadata: { locked: options?.locked, content: options?.content },
    } as CanvasNodeData;
}

test("selection toolbar counts only nodes that the action can actually use", () => {
    const nodes = [
        node("ready-image", CanvasNodeType.Image, { content: "image" }),
        node("locked-image", CanvasNodeType.Image, { content: "image", locked: true }),
        node("empty-image", CanvasNodeType.Image),
        node("video", CanvasNodeType.Video, { content: "video" }),
        node("frame", CanvasNodeType.Frame),
    ];
    const capabilities = getCanvasSelectionCapabilities(nodes, new Set(nodes.map((item) => item.id)));
    expect(capabilities.selectedCount).toBe(5);
    expect(capabilities.layoutEligibleCount).toBe(3);
    expect(capabilities.storyboardEligibleCount).toBe(1);
    expect(capabilities.referenceGroupEligibleCount).toBe(2);
    expect(capabilities.batchConnectEligibleCount).toBe(4);
});

test("legacy toolbar preferences cannot hide the recovery command", () => {
    const normalized = normalizeToolbarPrefs("main", { order: ["tool-settings", "tool-move"], hidden: ["tool-settings", "tool-move"] });
    expect(normalized.hidden).toEqual(["tool-move"]);
});

test("history patches restore deleted node content and exact ordering", () => {
    const first = node("first", CanvasNodeType.Drawing);
    const second = node("second", CanvasNodeType.Image, { content: "image" });
    const before: CanvasHistorySnapshot = { nodes: [first, second], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false };
    const after: CanvasHistorySnapshot = { ...before, nodes: [second] };
    const patch = createCanvasHistoryPatch(before, after);
    expect(patch).not.toBeNull();
    expect(applyCanvasHistoryPatch(after, patch!, "before").nodes).toEqual([first, second]);
    expect(applyCanvasHistoryPatch(before, patch!, "after").nodes).toEqual([second]);
});

test("undoable drawing deletion retains local drawing documents", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const lifecycleSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-project-lifecycle.ts", import.meta.url)).text();
    expect(projectSource).not.toContain("removeCanvasDrawing(projectId");
    expect(lifecycleSource).toContain("removeCanvasProjectDrawings(projectId)");
});
