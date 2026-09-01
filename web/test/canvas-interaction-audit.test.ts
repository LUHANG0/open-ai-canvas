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

test("assistant layout reserves the left dock and low zoom keeps video play reachable", async () => {
    const css = await Bun.file(new URL("../src/pages/canvas/canvas-editor-pc.css", import.meta.url)).text();
    const content = await Bun.file(new URL("../src/components/canvas/canvas-node-content.tsx", import.meta.url)).text();
    expect(css).toContain('[data-assistant-open="true"] .pc-canvas-toolbar');
    expect(css).toContain('left: calc(var(--canvas-inset-x) + 320px)');
    expect(content).toContain('var(--canvas-live-inverse-scale, 1) * 0.55');
});

test("unfinished super resolution is disabled and media settings share one shell", async () => {
    const imageTools = await Bun.file(new URL("../src/components/canvas/canvas-image-toolbar-tools.tsx", import.meta.url)).text();
    const audioSettings = await Bun.file(new URL("../src/components/canvas/canvas-audio-settings-popover.tsx", import.meta.url)).text();
    const popover = await Bun.file(new URL("../src/components/canvas/use-canvas-settings-popover.ts", import.meta.url)).text();
    expect(imageTools).toContain('label: "超分（暂未开放）"');
    expect(imageTools).toContain('disabledReason: "AI 超分暂未开放"');
    expect(audioSettings).toContain('<CanvasGenerationSettingsShell title="音频设置"');
    expect(popover).toContain('window.addEventListener("keydown", closeOnEscape, true)');
});

test("audio load button carries the original play intent", async () => {
    const content = await Bun.file(new URL("../src/components/canvas/canvas-node-content.tsx", import.meta.url)).text();
    expect(content).toContain('label={loading ? "正在加载音频" : "播放音频"}');
    expect(content).toContain("audio.play().catch(() => undefined)");
    expect(content).not.toContain("加载音频（保持暂停）");
});
