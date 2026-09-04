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

test("node edits skip unchanged connection and session collections and remain undoable", () => {
    const first = node("first", CanvasNodeType.Image);
    const untouched = new Proxy([], { get() { throw new Error("unchanged history collection was traversed"); } });
    const before: CanvasHistorySnapshot = { nodes: [first], connections: untouched, chatSessions: untouched, activeChatId: null, backgroundMode: "lines", showImageInfo: false };
    const after = { ...before, nodes: [{ ...first, width: 500 }] };
    const patch = createCanvasHistoryPatch(before, after);
    expect(patch?.connections).toBeUndefined();
    expect(patch?.chatSessions).toBeUndefined();
    expect(applyCanvasHistoryPatch(after, patch!, "before").nodes).toEqual(before.nodes);
    expect(applyCanvasHistoryPatch(before, patch!, "after").nodes).toEqual(after.nodes);
});

test("history still detects reordered references and ignores copied no-op arrays", () => {
    const first = node("first", CanvasNodeType.Image);
    const second = node("second", CanvasNodeType.Text);
    const before: CanvasHistorySnapshot = { nodes: [first, second], connections: [], chatSessions: [], activeChatId: null, backgroundMode: "lines", showImageInfo: false };
    expect(createCanvasHistoryPatch(before, { ...before, nodes: [...before.nodes] })).toBeNull();
    const after = { ...before, nodes: [second, first] };
    const patch = createCanvasHistoryPatch(before, after);
    expect(applyCanvasHistoryPatch(after, patch!, "before").nodes).toEqual(before.nodes);
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

test("canvas client mount fallback has one owned gate", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const gateSource = await Bun.file(new URL("../src/pages/canvas/canvas-client-mount-gate.tsx", import.meta.url)).text();
    expect(projectSource).toContain("<CanvasClientMountGate>");
    expect(projectSource).not.toContain("const [mounted, setMounted]");
    expect(gateSource).toContain("useEffect(() =>");
    expect(gateSource).toContain("<CanvasRefreshShell />");
});

test("short drama guide visibility and toggle stay inside the short drama controller", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const controllerSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-short-drama.ts", import.meta.url)).text();
    expect(projectSource).toContain("guide: shortDramaGuide");
    expect(projectSource).toContain("guideEnabled: shortDramaEnabled && !currentProject?.projectId");
    expect(projectSource).not.toContain("setShortDramaGuideCollapsed");
    expect(controllerSource).toContain("guideEnabled && progress.active");
    expect(controllerSource).toContain("onToggle: toggleGuide");
});

test("canvas project environment owns external store subscriptions", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const environmentSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-project-environment.ts", import.meta.url)).text();
    expect(projectSource).toContain("useCanvasProjectEnvironment()");
    expect(projectSource).not.toContain("useCanvasAgentStore((state)");
    expect(projectSource).not.toContain("useAssetStore((state)");
    expect(environmentSource).toContain("useEffectiveConfig()");
    expect(environmentSource).toContain("state.features.shortDramaEnabled");
    expect(environmentSource).toContain("canvasThemes[useThemeStore");
});

test("canvas project route owns route params and local agent entry parsing", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const routeSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-project-route.ts", import.meta.url)).text();
    expect(projectSource).toContain("useCanvasProjectRoute()");
    expect(projectSource).not.toContain("useParams<");
    expect(projectSource).not.toContain("resolveCanvasLocalAgentEntry(searchParams)");
    expect(routeSource).toContain("useSearchParams()");
    expect(routeSource).toContain("resolveCanvasLocalAgentEntry(searchParams)");
    expect(routeSource).toContain('params.id || ""');
});

test("heavy canvas media dialogs load only when their tool opens", async () => {
    const dialogsSource = await Bun.file(new URL("../src/pages/canvas/canvas-project-media-dialogs.tsx", import.meta.url)).text();
    expect(dialogsSource).toContain('lazy(() => import("@/components/canvas/canvas-node-crop-dialog")');
    expect(dialogsSource).toContain('lazy(() => import("@/components/canvas/canvas-node-annotation-dialog")');
    expect(dialogsSource).toContain('lazy(() => import("@/components/canvas/canvas-node-mask-edit-dialog")');
    expect(dialogsSource).toContain('lazy(() => import("@/components/canvas/canvas-node-split-dialog")');
    expect(dialogsSource).toContain('lazy(() => import("@/components/canvas/canvas-node-upscale-dialog")');
    expect(dialogsSource).toContain('<Suspense fallback={<CanvasDialogLoadingOverlay label="正在加载图片工具…" />}>');
});

test("canvas node editors load only after an editor target is selected", async () => {
    const editorsSource = await Bun.file(new URL("../src/pages/canvas/canvas-project-node-editor-dialogs.tsx", import.meta.url)).text();
    expect(editorsSource).toContain('lazy(() => import("@/components/canvas/canvas-character-reference-modal")');
    expect(editorsSource).toContain('lazy(() => import("@/components/canvas/canvas-text-editor-modal")');
    expect(editorsSource).toContain('lazy(() => import("@/components/canvas/portrait-clearance/portrait-clearance-modal")');
    expect(editorsSource).toContain("characterReferenceNode ? (");
    expect(editorsSource).toContain("textEditorNode ? (");
    expect(editorsSource).toContain("portraitClearanceNode ? (");
    expect(editorsSource).toContain("<CanvasWorkspaceLoadingOverlay");
});

test("canvas timeline tools load only after their dialog target is selected", async () => {
    const timelineSource = await Bun.file(new URL("../src/pages/canvas/canvas-project-timeline-dialogs.tsx", import.meta.url)).text();
    expect(timelineSource).toContain('lazy(() => import("@/components/canvas/canvas-subtitle-dialog")');
    expect(timelineSource).toContain('lazy(() => import("@/components/canvas/canvas-timeline-dialog")');
    expect(timelineSource).toContain('lazy(() => import("@/components/canvas/canvas-video-frame-dialog")');
    expect(timelineSource).toContain('lazy(() => import("@/components/canvas/canvas-video-segment-dialog")');
    expect(timelineSource).toContain("<Suspense fallback={<CanvasWorkspaceLoadingOverlay");
});

test("canvas asset and version dialogs load only when opened", async () => {
    const librarySource = await Bun.file(new URL("../src/pages/canvas/canvas-project-library-dialogs.tsx", import.meta.url)).text();
    expect(librarySource).toContain('lazy(() => import("@/components/canvas/asset-picker-modal")');
    expect(librarySource).toContain('lazy(() => import("@/components/canvas/canvas-project-asset-modal")');
    expect(librarySource).toContain('lazy(() => import("@/components/canvas/canvas-version-compare-modal")');
    expect(librarySource).toContain("if (!open) return null");
    expect(librarySource).toContain("assetPickerOpen ? (");
    expect(librarySource).toContain("projectAssetOpen ? (");
});

test("canvas upload and compatibility agent load only when needed", async () => {
    const utilitySource = await Bun.file(new URL("../src/pages/canvas/canvas-project-utility-overlays.tsx", import.meta.url)).text();
    expect(utilitySource).toContain('lazy(() => import("@/components/canvas/canvas-upload-modal")');
    expect(utilitySource).toContain('lazy(() => import("@/components/canvas/canvas-local-agent-panel")');
    expect(utilitySource).toContain("upload.open ? (");
    expect(utilitySource).toContain("if (!shouldMountCanvasHeadlessAgent(compactAgent, assistantMounted)) return null");
    expect(utilitySource).toContain("<Suspense fallback={null}><CanvasLocalAgentPanel");
});

test("canvas entry dialogs load only after their entry opens", async () => {
    const entrySource = await Bun.file(new URL("../src/pages/canvas/canvas-project-entry-dialogs.tsx", import.meta.url)).text();
    expect(entrySource).toContain('lazy(() => import("@/components/canvas/canvas-share-modal")');
    expect(entrySource).toContain('lazy(() => import("@/components/canvas/canvas-style-picker-modal")');
    expect(entrySource).toContain('lazy(() => import("@/components/canvas/director/canvas-director-template-modal")');
    expect(entrySource).toContain('lazy(() => import("./components/libtv-import-dialog")');
    expect(entrySource).toContain('lazy(() => import("./components/tapnow-import-dialog")');
    expect(entrySource).toContain("shareOpen ? <Suspense");
    expect(entrySource).toContain("directorTemplateRequest ? (");
});

test("canvas task detail loads only when a task is opened", async () => {
    const statusSource = await Bun.file(new URL("../src/pages/canvas/canvas-project-status-dialogs.tsx", import.meta.url)).text();
    const taskSource = await Bun.file(new URL("../src/pages/canvas/canvas-project-task-detail-dialog.tsx", import.meta.url)).text();
    expect(statusSource).toContain('lazy(() => import("./canvas-project-task-detail-dialog")');
    expect(statusSource).toContain("task ? <Suspense");
    expect(statusSource).not.toContain("function taskParameterRows");
    expect(taskSource).toContain("function taskParameterRows");
    expect(taskSource).toContain("useEffectiveConfig()");
    expect(taskSource).toContain("onCancel(task)");
});

test("assistant layout separates the main toolbar from the left dock and low zoom keeps video play reachable", async () => {
    const css = await Bun.file(new URL("../src/pages/canvas/canvas-editor-pc.css", import.meta.url)).text();
    const content = await Bun.file(new URL("../src/components/canvas/canvas-node-content.tsx", import.meta.url)).text();
    expect(css).toContain('[data-assistant-open="true"] .pc-canvas-toolbar');
    expect(css).toContain('bottom: calc(var(--canvas-inset-y) + var(--space-12))');
    expect(css).toContain('left: var(--canvas-inset-x)');
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
    const infiniteCanvas = await Bun.file(new URL("../src/components/canvas/infinite-canvas.tsx", import.meta.url)).text();
    expect(project).toContain("applyCanvasBlankClick(deselectCanvas, closeAgent)");
    expect(project).toContain("onCanvasDeselect: handleCanvasBlankClick");
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
    for (const stateName of ["shareModalOpen", "nodeSearchOpen", "stylePickerOpen", "directorTemplateRequest", "shortcutsOpen"]) expect(dialogStateSource).toContain(stateName);
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

    expect(projectSource).toContain("useCanvasSelectionState(nodes)");
    expect(projectSource).not.toContain("useState<Set<string>>");
    expect(projectSource).not.toContain("const [selectedConnectionId, setSelectedConnectionId]");
    expect(projectSource).not.toContain("selectBatchConnectionSourceNodeIds");
    expect(stateSource).toContain("const [selectedNodeIds, setSelectedNodeIds]");
    expect(stateSource).toContain("const [selectedConnectionId, setSelectedConnectionId]");
    expect(stateSource).toContain("selectBatchConnectionSourceNodeIds(nodes, selectedNodeIds)");
});

test("canvas viewport state has a focused owner", async () => {
    const projectSource = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
    const stateSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-viewport-state.ts", import.meta.url)).text();

    expect(projectSource).toContain("useCanvasViewportState()");
    expect(projectSource).not.toContain("useState<ViewportTransform>");
    expect(stateSource).toContain("const DEFAULT_CANVAS_VIEWPORT: ViewportTransform = { x: 0, y: 0, k: 1 }");
    expect(stateSource).toContain("const [viewport, setViewport]");
});
