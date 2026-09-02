import { expect, test } from "bun:test";

import { getCanvasSelectionCapabilities } from "../src/lib/canvas/canvas-selection-capabilities";
import { canvasNodeIntersectsRenderBounds } from "../src/lib/canvas/canvas-render-culling";
import { summarizeCanvasContext } from "../src/lib/canvas/canvas-context-summary";
import { partitionCanvasUploadFiles } from "../src/lib/canvas/canvas-upload-batch";
import { normalizeToolbarPrefs } from "../src/lib/canvas/tool-registry";
import { applyCanvasHistoryPatch, buildCanvasHistoryCleanupOptions, createCanvasHistoryPatch, type CanvasHistorySnapshot } from "../src/pages/canvas/use-canvas-history";
import { requestCanvasNodeMediaReplacement } from "../src/pages/canvas/canvas-upload-target";
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

test("canvas header context follows the live selection and linked chapter titles", () => {
    const nodes = [
        node("shot-1", CanvasNodeType.Image),
        { ...node("shot-2", CanvasNodeType.Video), metadata: { chapterId: "chapter-1", shotIndex: 1 } },
    ];
    const context = summarizeCanvasContext(nodes, new Set(["shot-2"]), [{
        id: "chapter-1",
        projectId: "project-1",
        kind: "chapter",
        title: "第一章",
        sourceText: "",
        wordCount: 0,
        status: "draft",
        position: 0,
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
    }]);
    expect(context).toEqual({ nodeCount: 2, selectedCount: 1, chapterLabel: "第一章", shotLabel: "镜头 2" });
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

test("history ignores external media hydration and reference-only no-op arrays", async () => {
    const history = await Bun.file(new URL("../src/pages/canvas/use-canvas-history.ts", import.meta.url)).text();
    const lifecycle = await Bun.file(new URL("../src/pages/canvas/use-canvas-project-lifecycle.ts", import.meta.url)).text();
    expect(history).toContain("prepareExternalHistoryUpdate");
    expect(history).toContain("if (!createCanvasHistoryPatch(previous, next))");
    expect(lifecycle).toContain("prepareExternalHistoryUpdate();");
});

test("history cleanup keeps undo snapshots alongside the current cleanup target", () => {
    const lastHistory: CanvasHistorySnapshot = { nodes: [], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false };
    const history = { past: ["patch"], future: [] };
    const extra = { projectId: "canvas-1", nodes: [] };
    expect(buildCanvasHistoryCleanupOptions(extra, history, lastHistory)).toEqual({ extra, history, lastHistory });
});

test("media replacement reuses the upload target path with the selected node id", () => {
    const requested: string[] = [];
    requestCanvasNodeMediaReplacement({ id: "video-1" }, (nodeId) => requested.push(nodeId));
    expect(requested).toEqual(["video-1"]);
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

test("viewport culling follows dragged geometry and does not pin ordinary selected nodes", async () => {
    const offscreen = { ...node("offscreen", CanvasNodeType.Image, { content: "image" }), position: { x: 1_000, y: 40 } };
    const bounds = { left: 0, top: 0, right: 500, bottom: 500 };
    expect(canvasNodeIntersectsRenderBounds(offscreen, bounds)).toBe(false);
    expect(canvasNodeIntersectsRenderBounds(offscreen, bounds, { x: -700, y: 0 })).toBe(true);

    const renderModel = await Bun.file(new URL("../src/pages/canvas/use-canvas-render-model.ts", import.meta.url)).text();
    expect(renderModel).toContain("canvasNodeIntersectsRenderBounds(node, renderBounds, dragOffset)");
    expect(renderModel).not.toContain("selectedNodeIds.has(node.id) || canvasNodeIntersectsRenderBounds");
});

test("poster work is shared, abortable, and performance mode removes duplicate cover effects", async () => {
    const posterCache = await Bun.file(new URL("../src/services/canvas-video-poster-cache.ts", import.meta.url)).text();
    const content = await Bun.file(new URL("../src/components/canvas/canvas-node-content.tsx", import.meta.url)).text();
    expect(posterCache).toContain("consumers: Set<symbol>");
    expect(posterCache).toContain("task.controller.abort()");
    expect(posterCache).toContain('signal?.addEventListener("abort", onAbort, { once: true })');
    expect(content).toContain("!policy?.reduceEffects ? <img");
    expect(content).toContain('policy?.reduceEffects ? "object-cover" : "object-contain"');
});

test("canvas owns one assistant transition and disables dock magnification in dense controls", async () => {
    const assistant = await Bun.file(new URL("../src/components/canvas/canvas-assistant-panel.tsx", import.meta.url)).text();
    const assistantColumn = await Bun.file(new URL("../src/pages/canvas/canvas-assistant-panel-column.tsx", import.meta.url)).text();
    const projectAssistantColumn = await Bun.file(new URL("../src/pages/canvas/canvas-project-assistant-column.tsx", import.meta.url)).text();
    const project = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const workspaceShell = await Bun.file(new URL("../src/pages/canvas/use-canvas-workspace-shell.ts", import.meta.url)).text();
    const toolbar = await Bun.file(new URL("../src/components/canvas/canvas-toolbar.tsx", import.meta.url)).text();
    expect(assistant).not.toContain("<motion.aside");
    expect(assistantColumn).toContain("translate3d");
    expect(projectAssistantColumn).toContain('loadCanvasAssistantPanel = () => import("@/components/canvas/canvas-assistant-panel")');
    expect(project).toContain("preloadAssistant: loadCanvasAssistantPanel");
    expect(workspaceShell).toContain("void preloadAssistant();");
    expect(projectAssistantColumn).toContain("正在准备 Agent…");
    expect(toolbar).toContain("magnify={false}");
});

test("a true blank-canvas click collapses the assistant without changing node interactions", async () => {
    const project = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const nodeFocus = await Bun.file(new URL("../src/pages/canvas/use-canvas-node-focus.ts", import.meta.url)).text();
    const infiniteCanvas = await Bun.file(new URL("../src/components/canvas/infinite-canvas.tsx", import.meta.url)).text();
    expect(project).toContain("handleCanvasBlankClick, handleCanvasDeselect");
    expect(project).toContain("onCanvasDeselect: handleCanvasBlankClick");
    expect(nodeFocus).toContain("applyCanvasBlankClick(handleCanvasDeselect, closeAgent)");
    expect(infiniteCanvas).toContain('const isBackgroundClick = !target?.closest("[data-node-id],[data-connection-id]")');
    expect(infiniteCanvas).toContain('event.type === "pointerup" && !panState.current.hasMoved');
});

test("an open running task detail follows shared task updates and refreshes its logs", async () => {
    const generation = await Bun.file(new URL("../src/pages/canvas/use-canvas-generation.ts", import.meta.url)).text();
    expect(generation).toContain("const taskId = taskDetail?.id;");
    expect(generation).toContain("subscribeCanvasGenerationRecoveryTasks([taskId]");
    expect(generation).toContain("current?.id === taskId ? task : current");
    expect(generation).toContain("setTaskDetailLogs(logs)");
    expect(generation).toContain("unsubscribe();");
});

test("node toolbar commits immediate pointer actions before hover relocation can swallow the click", async () => {
    const toolbar = await Bun.file(new URL("../src/components/canvas/canvas-node-toolbar.tsx", import.meta.url)).text();
    expect(toolbar).toContain("onMouseDown={(event) =>");
    expect(toolbar).toContain("if (event.detail === 0 && !tool.disabled) tool.onClick()");
});

test("batch uploads report unsupported files and retain failed items without stealing focus", async () => {
    const image = new File(["image"], "frame.png", { type: "image/png" });
    const audio = new File(["audio"], "voice.mp3", { type: "audio/mpeg" });
    const unsupported = new File(["text"], "notes.txt", { type: "text/plain" });
    const partition = partitionCanvasUploadFiles([image, unsupported, audio]);
    expect(partition.supportedFiles.map((file) => file.name)).toEqual(["frame.png", "voice.mp3"]);
    expect(partition.rejectedFiles.map((file) => file.name)).toEqual(["notes.txt"]);

    const upload = await Bun.file(new URL("../src/pages/canvas/use-canvas-upload.ts", import.meta.url)).text();
    const modal = await Bun.file(new URL("../src/components/canvas/canvas-upload-modal.tsx", import.meta.url)).text();
    expect(upload).toContain("{ select: false }");
    expect(upload).toContain("failedFiles.push(file)");
    expect(modal).toContain("setFileList((current) => current.filter");
});

test("timeline output shares collision-safe placement and share copy failures keep the created link", async () => {
    const upload = await Bun.file(new URL("../src/pages/canvas/use-canvas-upload.ts", import.meta.url)).text();
    const share = await Bun.file(new URL("../src/components/canvas/canvas-share-modal.tsx", import.meta.url)).text();
    expect(upload).not.toContain("setNodes((current) => [...current, node])");
    expect(upload).toContain("} satisfies CanvasNodeData, center);");
    expect(share).toContain("分享链接已创建，但浏览器未能自动复制");
    expect(share.indexOf("setShare(result.share)")).toBeLessThan(share.indexOf("await copy(url, true)"));
});

test("reduced motion stops spotlight pointer calculations instead of only hiding the result", async () => {
    const spotlight = await Bun.file(new URL("../src/components/ui/aceternity/spotlight-surface.tsx", import.meta.url)).text();
    expect(spotlight).toContain("if (!enabled || reducedMotion) return");
    expect(spotlight).toContain("{enabled && !reducedMotion ? <motion.span");
});

test("project feedback states render through one owned layer", async () => {
    const project = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const feedback = await Bun.file(new URL("../src/pages/canvas/canvas-project-feedback.tsx", import.meta.url)).text();
    expect(project).toContain("<CanvasProjectFeedbackLayer");
    expect(project).not.toContain("<CanvasUploadStatusToast");
    expect(project).not.toContain("<CanvasMergeStatusToast");
    expect(project).not.toContain("<CanvasAgentChangeToast");
    expect(feedback).toContain("uploadStatus ? <CanvasUploadStatusToast");
    expect(feedback).toContain("mergeVideoProgress ? <CanvasMergeStatusToast");
    expect(feedback).toContain("agentChange ? <CanvasAgentChangeToast");
});

test("project entry dialogs share one transient state owner", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const dialogStateSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-project-dialog-state.ts", import.meta.url)).text();
    expect(projectSource).toContain("useCanvasProjectDialogState()");
    expect(projectSource).not.toContain("const [shareModalOpen, setShareModalOpen]");
    for (const stateName of ["shareModalOpen", "nodeSearchOpen", "stylePickerOpen", "directorTemplateRequest", "shortcutRequestNonce"]) expect(dialogStateSource).toContain(stateName);
});

test("node editors and inspectors share one panel target state owner", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const panelStateSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-node-panel-state.ts", import.meta.url)).text();
    expect(projectSource).toContain("useCanvasNodePanelState()");
    expect(projectSource).not.toContain("const [dialogNodeId, setDialogNodeId]");
    for (const stateName of ["dialogNodeId", "textEditorNodeId", "subtitleNodeId", "scriptEditorNodeId", "directorNodeId", "versionCompareRootId"]) expect(panelStateSource).toContain(stateName);
});

test("workspace chrome state is isolated from project content state", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const workspaceStateSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-workspace-ui-state.ts", import.meta.url)).text();
    expect(projectSource).toContain("useCanvasWorkspaceUiState()");
    expect(projectSource).not.toContain("const [contextMenu, setContextMenu]");
    for (const stateName of ["hoveredNodeId", "contextMenu", "isMiniMapOpen", "backgroundMode", "showImageInfo", "canvasTool"]) expect(workspaceStateSource).toContain(stateName);
});

test("project content state has a focused owner", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const stateSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-project-content-state.ts", import.meta.url)).text();

    expect(projectSource).toContain("useCanvasProjectContentState()");
    expect(projectSource).not.toContain("useState<CanvasConnection[]>");
    expect(projectSource).not.toContain("useState<CanvasAssistantSession[]>");
    expect(stateSource).toContain("const [connections, setConnections]");
    expect(stateSource).toContain("const [chatSessions, setChatSessions]");
    expect(stateSource).toContain("const [activeChatId, setActiveChatId]");
});

test("canvas selection state has a focused owner", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const stateSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-selection-state.ts", import.meta.url)).text();

    expect(projectSource).toContain("useCanvasSelectionState()");
    expect(projectSource).not.toContain("useState<Set<string>>");
    expect(projectSource).not.toContain("const [selectedConnectionId, setSelectedConnectionId]");
    expect(stateSource).toContain("const [selectedNodeIds, setSelectedNodeIds]");
    expect(stateSource).toContain("const [selectedConnectionId, setSelectedConnectionId]");
});

test("canvas viewport state has a focused owner", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const stateSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-viewport-state.ts", import.meta.url)).text();

    expect(projectSource).toContain("useCanvasViewportState()");
    expect(projectSource).not.toContain("useState<ViewportTransform>");
    expect(stateSource).toContain("const DEFAULT_CANVAS_VIEWPORT: ViewportTransform = { x: 0, y: 0, k: 1 }");
    expect(stateSource).toContain("const [viewport, setViewport]");
});
