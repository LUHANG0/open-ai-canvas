import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { uploadMediaFile } from "@/services/file-storage";
import { readLocalRuntimeBootstrapState } from "@/services/local-runtime-bootstrap";
import { createCanvasGenerationLiveProjectAdapter, registerCanvasGenerationLiveProject } from "@/services/canvas-generation-consumer";
import { getActiveUserScope } from "@/lib/user-scope";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { summarizeCanvasContext } from "@/lib/canvas/canvas-context-summary";
import { shouldAutoConnectCanvasRuntime } from "@/lib/canvas/local-runtime-connection";
import { useAssetStore } from "@/stores/use-asset-store";
import { flushCanvasStorePersistence } from "@/stores/canvas/use-canvas-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { App } from "antd";
import { CanvasConfigComposer } from "@/components/canvas/canvas-config-composer";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import { AssistantPanelColumn } from "./canvas-assistant-panel-column";
import { CanvasActiveTaskPanel } from "@/components/canvas/canvas-active-task-panel";
import { CanvasAssetTray } from "@/components/canvas/canvas-asset-tray";
import { CanvasProjectSidebar } from "@/components/canvas/canvas-project-sidebar";
import { CanvasProjectAssetModal } from "@/components/canvas/canvas-project-asset-modal";
import { CanvasCharacterReferenceNodeContent } from "@/components/canvas/canvas-character-reference-node";
import { CanvasCharacterReferenceModal } from "@/components/canvas/canvas-character-reference-modal";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { resolveProjectCanvasStyle } from "@/components/canvas/canvas-style-picker-modal";
import { createStyleProfileSnapshot, resolveStyleProfile, serializeStyleProfile } from "@/lib/canvas/style-profile";
import { CanvasNodeToolbar, CanvasNodeInfoModal } from "@/components/canvas/canvas-node-toolbar";
import { CanvasSubtitleDialog } from "@/components/canvas/canvas-subtitle-dialog";
import { CanvasVideoFrameDialog } from "@/components/canvas/canvas-video-frame-dialog";
import { CanvasVideoSegmentDialog } from "@/components/canvas/canvas-video-segment-dialog";
import { CanvasTimelineDialog } from "@/components/canvas/canvas-timeline-dialog";
import { syncNodeSubtitlesToTimeline } from "@/lib/timeline/timeline-build";
import { CanvasNodeAnglePanel } from "@/components/canvas/canvas-node-angle-dialog";
import { CanvasTextEditorModal } from "@/components/canvas/canvas-text-editor-modal";
import { CanvasNodeSearchModal } from "@/components/canvas/canvas-node-search-modal";
import { CanvasStylePickerModal } from "@/components/canvas/canvas-style-picker-modal";
import { CanvasDirectorTemplateModal } from "@/components/canvas/director/canvas-director-template-modal";
import { CanvasFileDropOverlay } from "@/components/canvas/canvas-file-drop-overlay";
import { CanvasUploadModal } from "@/components/canvas/canvas-upload-modal";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { AssetPickerModal } from "@/components/canvas/asset-picker-modal";
import { getProject } from "@/services/api/projects";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import { CanvasShareModal } from "@/components/canvas/canvas-share-modal";
import { CanvasScriptEditor, CanvasScriptNodeContent } from "@/components/canvas/canvas-script-node";
import { STORYBOARD_HEADER_HEIGHT, STORYBOARD_ROW_HEIGHT, storyboardMinNodeHeight, storyboardTableHeight } from "@/lib/canvas/canvas-storyboard-layout";
import { CanvasDirectorNodePanel } from "@/components/canvas/director/canvas-director-node-panel";
import { CanvasVersionCompareModal } from "@/components/canvas/canvas-version-compare-modal";
import { CanvasLocalAgentPanel } from "@/components/canvas/canvas-local-agent-panel";
import { useFocusMode } from "@/hooks/use-focus-mode";
import { useCanvasAgentStore } from "@/stores/canvas/use-canvas-agent-store";
import { getContextResourceNodesFromIndex, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasConnectionCreateMenu, CanvasNodePanelOverlay } from "@/components/canvas/canvas-workspace-overlays";
import { CanvasOverlayLayerContainer, CanvasOverlayLayerProvider } from "@/components/canvas/canvas-overlay-layer";
import { CanvasLeaferGraphicsLayer } from "@/components/canvas/canvas-leafer-graphics-layer";
import { CanvasFreeformEmptyState, CanvasLinkedProjectEmptyState, CanvasShortDramaEmptyState, CanvasShortDramaGuide, CanvasStoryInputNodeContent, CanvasStylePlaceholderNodeContent } from "@/components/canvas/canvas-short-drama-entry";
import { createCanvasNode, getInputSummary, isHiddenBatchChild } from "@/lib/canvas/canvas-project-domain";
import { stampCanvasNodeChanges } from "@/lib/canvas/canvas-node-timestamps";
import { batchSourceRestriction } from "@/lib/canvas/canvas-batch-connection";
import { deriveStoryboardPipelineProgress } from "@/lib/canvas/canvas-storyboard-progress";
import { CanvasAgentChangeToast, CanvasMergeStatusToast, CanvasUploadStatusToast } from "./canvas-project-feedback";
import { backendProviderConfig } from "@/lib/canvas/canvas-project-generation";
import { CanvasTopBar, CanvasWorkspaceModeSwitch } from "./canvas-project-top-bar";
import { LibTVImportDialog } from "./components/libtv-import-dialog";
import { TapNowImportDialog } from "./components/tapnow-import-dialog";
import { CanvasFocusModeBar } from "@/components/canvas/canvas-focus-mode-bar";
import { CanvasProjectContextMenu } from "./canvas-project-context-menu";
import { CanvasProjectMediaDialogs } from "./canvas-project-media-dialogs";
import { CanvasProjectSelectionToolbar } from "./canvas-project-selection-toolbar";
import { CanvasProjectStatusDialogs } from "./canvas-project-status-dialogs";
import { CanvasProjectWorldLayers } from "./canvas-project-world-layers";
import { CanvasNodeActionContext } from "@/components/canvas/canvas-node-action-context";
import { PortraitClearanceModal } from "@/components/canvas/portrait-clearance/portrait-clearance-modal";
import { CanvasNodeGraphContext, type CanvasNodeGraphContextValue } from "@/components/canvas/canvas-node-graph-context";
import { CanvasRefreshShell } from "./canvas-refresh-shell";
import type { CanvasImageEmotionPayload } from "@/components/canvas/canvas-node-emotion-panel";
import { CanvasEmotionWorkspace } from "@/components/canvas/canvas-emotion-workspace";
import { useCanvasConnectionController } from "./use-canvas-connection-controller";
import { useCanvasContextInteractions } from "./use-canvas-context-interactions";
import { useCanvasAgentOperations } from "./use-canvas-agent-operations";
import { useCanvasAssistantVisibility } from "./use-canvas-assistant-visibility";
import { useCanvasActiveTasks } from "./use-canvas-active-tasks";
import { useCanvasAssetHandoff } from "./use-canvas-asset-handoff";
import { useCanvasAssetInsertion } from "./use-canvas-asset-insertion";
import { useCanvasStyleWorkflow } from "./use-canvas-style-workflow";
import { useCanvasDirector } from "./use-canvas-director";
import { useCanvasGeneration } from "./use-canvas-generation";
import { useCanvasGenerationBatches } from "./use-canvas-generation-batches";
import { useCanvasGenerationExecutor, type CanvasNodeGenerationOptions } from "./use-canvas-generation-executor";
import { useCanvasGenerationRetry } from "./use-canvas-generation-retry";
import { useCanvasHistory } from "./use-canvas-history";
import { useCanvasKeyboard } from "./use-canvas-keyboard";
import { useCanvasMediaTools } from "./use-canvas-media-tools";
import { useCanvasNodeEditor } from "./use-canvas-node-editor";
import { useCanvasNodeActionBindings } from "./use-canvas-node-action-bindings";
import { useCanvasNodeFocus } from "./use-canvas-node-focus";
import { useCanvasNodeHoverToolbar } from "./use-canvas-node-hover-toolbar";
import { useCanvasNodeOperations } from "./use-canvas-node-operations";
import { useCanvasNodeReferences } from "./use-canvas-node-references";
import { useCanvasNodeRetry } from "./use-canvas-node-retry";
import { useCanvasNodeSharing } from "./use-canvas-node-sharing";
import { useCanvasTextToImage } from "./use-canvas-text-to-image";
import { useCanvasLinkedProjectAssetSync, useCanvasLinkedProjectFolderInteractions } from "./use-canvas-linked-project-assets";
import { useCanvasTitleEditing, useCanvasWorkspacePreferences } from "./use-canvas-workspace-shell";
import { useCanvasProjectImport } from "./use-canvas-project-import";
import { useCanvasProjectLifecycle } from "./use-canvas-project-lifecycle";
import { useCanvasRenderModel } from "./use-canvas-render-model";
import { useCanvasSelectionController } from "./use-canvas-selection-controller";
import { useCanvasShortDrama } from "./use-canvas-short-drama";
import { useCanvasStoryboard } from "./use-canvas-storyboard";
import { useCanvasUpload } from "./use-canvas-upload";
import { useCanvasViewportController } from "./use-canvas-viewport-controller";
import { useCanvasPortraitClearance } from "./use-canvas-portrait-clearance";
import "./canvas-editor-pc.css";
import {
    CanvasNodeType,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasNodeData,
    type StoryboardColumn,
    type StoryboardShotCount,
    type StoryboardShotDuration,
    type CanvasWorkflowKind,
    type CanvasToolMode,
    type ContextMenuState,
    type Position,
    type ViewportTransform,
} from "@/types/canvas";
import type { ReferenceImage } from "@/types/image";

const loadCanvasAssistantPanel = () => import("@/components/canvas/canvas-assistant-panel").then((module) => ({ default: module.CanvasAssistantPanel }));
const CanvasAssistantPanel = lazy(loadCanvasAssistantPanel);
const CanvasDirectorWorkbench = lazy(() => import("@/components/canvas/director/canvas-director-workbench").then((module) => ({ default: module.CanvasDirectorWorkbench })));
const CanvasDrawingEditorModal = lazy(() => import("@/components/canvas/canvas-drawing-editor-modal").then((module) => ({ default: module.CanvasDrawingEditorModal })));

const NODE_STATUS_SUCCESS = "success" as const;
const EMPTY_RESOURCE_REFERENCES: CanvasResourceReference[] = [];

function visibleGenerationBatch(node: CanvasNodeData) {
    const batches = node.metadata?.generationBatches || [];
    for (let index = batches.length - 1; index >= 0; index -= 1) {
        if (batches[index].status === "queued" || batches[index].status === "running") return batches[index];
    }
    return batches.at(-1);
}

export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <InfiniteCanvasPage />;
}

function InfiniteCanvasPage() {
    const { message } = App.useApp();
    const params = useParams<{ id: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const projectId = params.id || "";
    const canvasStorageScope = getActiveUserScope();
    const localAgentConnected = useCanvasAgentStore((state) => state.connected);
    const localAgentActivity = useCanvasAgentStore((state) => state.activity);
    const localAgentEnabled = useCanvasAgentStore((state) => state.enabled);
    const containerRef = useRef<HTMLDivElement>(null);
    const didInitialCenterRef = useRef(false);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const assets = useAssetStore((state) => state.assets);
    const assetsHydrated = useAssetStore((state) => state.hydrated);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const defaultDrawingEngine = useUserStore((state) => state.drawingEngine.defaultEngine);
    const shortDramaEnabled = useUserStore((state) => state.features.shortDramaEnabled);
    const directorOnboardingScope = useUserStore((state) => state.user?.id?.trim() || "");
    const nodesRef = useRef<CanvasNodeData[]>([]);
    const [nodes, setNodesState] = useState<CanvasNodeData[]>([]);
    const setNodes = useCallback<Dispatch<SetStateAction<CanvasNodeData[]>>>((value) => {
        if (typeof value === "function") {
            setNodesState((current) => {
                const next = stampCanvasNodeChanges(current, value(current));
                nodesRef.current = next;
                return next;
            });
            return;
        }
        const next = stampCanvasNodeChanges(nodesRef.current, value);
        nodesRef.current = next;
        setNodesState(next);
    }, []);
    const [connections, setConnections] = useState<CanvasConnection[]>([]);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [canvasTool, setCanvasTool] = useState<CanvasToolMode>("move");
    const [projectLoaded, setProjectLoaded] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [tapNowImportOpen, setTapNowImportOpen] = useState(false);
    const [nodeSearchOpen, setNodeSearchOpen] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [textEditorNodeId, setTextEditorNodeId] = useState<string | null>(null);
    const [characterReferenceNodeId, setCharacterReferenceNodeId] = useState<string | null>(null);
    const [drawingNodeId, setDrawingNodeId] = useState<string | null>(null);
    const [stylePickerOpen, setStylePickerOpen] = useState(false);
    // 新建导演台镜头必须先选模板：null 表示未在选择中，undefined position 表示用画布中心。
    const [directorTemplateRequest, setDirectorTemplateRequest] = useState<{ position?: Position } | null>(null);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [subtitleNodeId, setSubtitleNodeId] = useState<string | null>(null);
    const [timelineNodeId, setTimelineNodeId] = useState<string | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [scriptEditorNodeId, setScriptEditorNodeId] = useState<string | null>(null);
    const [portraitClearanceNodeId, setPortraitClearanceNodeId] = useState<string | null>(null);
    const [scriptScrollTopById, setScriptScrollTopById] = useState<Record<string, number>>({});
    const [directorNodeId, setDirectorNodeId] = useState<string | null>(null);
    const [versionCompareRootId, setVersionCompareRootId] = useState<string | null>(null);
    const [libTVImportOpen, setLibTVImportOpen] = useState(false);
    const codexAutoConnect = shouldAutoConnectCanvasRuntime(searchParams);
    const codexCompactAgent = codexAutoConnect && readLocalRuntimeBootstrapState().legacyDeepLinkRejected;
    const [shortcutRequestNonce, setShortcutRequestNonce] = useState(0);
    const [cinematicAgentEntry, setCinematicAgentEntry] = useState(false);
    const { assistantWidth, focusDockRevealed, mediaPerformanceMode, setAssistantWidth, setFocusDockRevealed, setMediaPerformanceMode, setWorkspaceMode, workspaceMode } = useCanvasWorkspacePreferences({
        preloadAssistant: loadCanvasAssistantPanel,
    });
    const { agentMode, assistantClosing, assistantMounted, assistantOpen, closeAgent, openAgent, setAgentMode } = useCanvasAssistantVisibility();
    const { tasks: activeTasks } = useCanvasActiveTasks(projectId, projectLoaded);
    const { focusMode, enterFocusMode, exitFocusMode, toggleFocusMode } = useFocusMode();

    useEffect(() => {
        didInitialCenterRef.current = false;
    }, [projectId]);

    const connectionsRef = useRef(connections);
    const chatSessionsRef = useRef(chatSessions);
    const activeChatIdRef = useRef(activeChatId);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, options?: CanvasNodeGenerationOptions) => Promise<void>) | null>(null);
    const historyRestoreUiRef = useRef<() => void>(() => undefined);

    useEffect(() => {
        if (!projectId) return;
        return registerCanvasGenerationLiveProject({
            scope: canvasStorageScope,
            projectId,
            adapter: createCanvasGenerationLiveProjectAdapter({ nodesRef, connectionsRef, chatSessionsRef, activeChatIdRef, setNodes, setConnections, setChatSessions, setActiveChatId }),
        });
    }, [canvasStorageScope, projectId]);

    const { getHistoryCleanupContext, historyPausedRef, historyState, prepareExternalHistoryUpdate, redoCanvas, resetHistory, undoCanvas } = useCanvasHistory({
        projectLoaded,
        nodes,
        connections,
        chatSessions,
        activeChatId,
        backgroundMode,
        showImageInfo,
        setNodes,
        setConnections,
        setChatSessions,
        setActiveChatId,
        setBackgroundMode,
        setShowImageInfo,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        onApplySnapshot: () => historyRestoreUiRef.current(),
    });

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, ...getHistoryCleanupContext() });
        },
        [cleanupAssetImages, getHistoryCleanupContext],
    );

    const { addedSkills, clearCanvasFiles, createAndOpenProject, currentProject, deleteCurrentProject, renameCurrentProject, saveCanvasProject, saveStatus, updateProject } = useCanvasProjectLifecycle({
        projectId,
        projectLoaded,
        nodes,
        connections,
        chatSessions,
        activeChatId,
        backgroundMode,
        showImageInfo,
        viewport,
        nodesRef,
        connectionsRef,
        viewportRef,
        historyPausedRef,
        prepareExternalHistoryUpdate,
        setNodes,
        setConnections,
        setChatSessions,
        setActiveChatId,
        setBackgroundMode,
        setShowImageInfo,
        setViewport,
        setProjectLoaded,
        resetHistory,
        cleanupAssetImages,
        cleanupCanvasFiles,
    });
    const { cancelTitleEditing, finishTitleEditing, setTitleDraft, startTitleEditing, titleDraft, titleEditing } = useCanvasTitleEditing({ currentTitle: currentProject?.title, renameCurrentProject });

    const { applyLibTVImport, applyTapNowImport } = useCanvasProjectImport({ nodesRef, connectionsRef, setNodes, setConnections, saveCanvasProject });
    const linkedProjectId = shortDramaEnabled ? currentProject?.projectId || "" : "";
    const linkedProjectQuery = useQuery({ queryKey: ["project", linkedProjectId], queryFn: () => getProject(linkedProjectId), enabled: Boolean(linkedProjectId) });
    const refetchLinkedProject = linkedProjectQuery.refetch;
    const { archiveNodesToLinkedFolder } = useCanvasLinkedProjectAssetSync({
        canvasId: projectId,
        linkedProjectId,
        projectLoaded,
        projectAssets: linkedProjectQuery.data?.assets,
        projectFolders: linkedProjectQuery.data?.assetFolders,
        setNodes,
        refetchLinkedProject,
    });
    const canvasContext = useMemo(() => summarizeCanvasContext(nodes, selectedNodeIds, linkedProjectQuery.data?.units), [linkedProjectQuery.data?.units, nodes, selectedNodeIds]);
    const { applyGenerationTaskResult, bindGenerationTask, cancelCanvasTask, finishGenerationRequest, openCanvasNodeTaskDetails, reloadCanvasNodeResource, runningNodeId, setRunningNodeId, setTaskDetail, startGenerationRequest, taskDetail, taskDetailLoading, taskDetailLogs } = useCanvasGeneration({
        projectId,
        domainProjectId: linkedProjectId,
        projectLoaded,
        nodes,
        nodesRef,
        setNodes,
    });

    useEffect(() => {
        if (!projectLoaded || !codexAutoConnect) return;
        if (codexCompactAgent) {
            setAgentMode("local");
            return;
        }
        openAgent("local");
    }, [codexAutoConnect, codexCompactAgent, openAgent, projectLoaded, setAgentMode]);

    // 沉浸专注进入时收起智能体与小地图、重置 Dock 唤出态；仅响应「进入」瞬间，避免关闭专注内主动唤出的面板。
    const prevFocusModeRef = useRef(focusMode);
    useEffect(() => {
        const enteredFocus = focusMode && !prevFocusModeRef.current;
        prevFocusModeRef.current = focusMode;
        if (!enteredFocus) return;
        closeAgent();
        setIsMiniMapOpen(false);
        setFocusDockRevealed(false);
    }, [closeAgent, focusMode]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        chatSessionsRef.current = chatSessions;
        activeChatIdRef.current = activeChatId;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
    }, [activeChatId, chatSessions, nodes, connections, selectedNodeIds, viewport]);

    useEffect(() => {
        if (!projectLoaded) return;
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize((current) => (current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height }));
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                const current = viewportRef.current;
                if (current.x === 0 && current.y === 0 && current.k === 1) {
                    const centered = { x: rect.width / 2, y: rect.height / 2, k: 1 };
                    viewportRef.current = centered;
                    setViewport(centered);
                }
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [projectLoaded]);

    const {
        fitCanvasContent,
        fitCanvasSelection,
        focusCanvasImageNode,
        focusCanvasNode,
        getCanvasCenter,
        handleCanvasDoubleClick,
        handleViewportChange,
        handleViewportPreviewChange,
        previewViewport,
        screenToCanvas,
        setZoomScale,
        zoomCanvasIn,
        zoomCanvasOut,
        zoomToActualSize,
    } = useCanvasViewportController({
        containerRef,
        size,
        viewportRef,
        nodesRef,
        selectedNodeIdsRef,
        setViewport,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        setToolbarNodeId,
    });

    useEffect(() => {
        const project = linkedProjectQuery.data?.project;
        const preset = resolveProjectCanvasStyle(project?.stylePresetId, project?.styleProfileJson);
        if (!projectLoaded || !preset) return;
        const profile = resolveStyleProfile(project?.stylePresetId, project?.styleProfileJson, preset.profile || createStyleProfileSnapshot(preset));
        if (!profile) return;
        const current = nodesRef.current.find((node) => node.type === CanvasNodeType.Text && node.metadata?.workflowKind === "styleboard");
        const nextMetadata = {
            content: profile.prompt,
            prompt: profile.prompt,
            status: NODE_STATUS_SUCCESS,
            workflowKind: "styleboard" as const,
            workflowTitle: "项目画风",
            workflowDescription: profile.description,
            stylePresetId: profile.presetId,
            styleProfileJson: serializeStyleProfile(profile),
            fontSize: 14,
            locked: true,
        };
        if (current) {
            if (current.metadata?.stylePresetId === profile.presetId && current.metadata?.content === profile.prompt && current.metadata?.styleProfileJson === nextMetadata.styleProfileJson && current.metadata?.locked) return;
            setNodes((nodes) => nodes.map((node) => (node.id === current.id ? { ...node, title: `项目画风 · ${profile.title}`, metadata: { ...node.metadata, ...nextMetadata } } : node)));
            return;
        }
        const node = createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), nextMetadata);
        node.title = `项目画风 · ${profile.title}`;
        node.width = 420;
        node.height = 240;
        setNodes((nodes) => [...nodes, node]);
    }, [getCanvasCenter, linkedProjectQuery.data?.project, projectLoaded, setNodes]);

    const {
        assetPickerOpen,
        closeUploadModal,
        closeAssetPicker,
        createVideoNodeFromBlob,
        createImageAssetNode,
        fileDropActive,
        handleAssetsInsert,
        handleDrop,
        handleFileDragEnter,
        handleFileDragLeave,
        handleFileDragOver,
        handleImageInputChange,
        handleProjectAssetsInsert,
        handleProjectChapterInsert,
        handleUploadFiles,
        handleUploadRequest,
        imageInputRef,
        openAssetsAtPosition,
        pasteAssistantImage,
        pasteSystemClipboard,
        startUploadStatus,
        uploadModalOpen,
        uploadTimelineMedia,
        uploadStatus,
    } = useCanvasUpload({
        canvasId: projectId,
        domainProjectId: linkedProjectId,
        nodesRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        screenToCanvas,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
    });
    const replaceCanvasNodeMedia = useCallback((node: CanvasNodeData) => handleUploadRequest(node.id), [handleUploadRequest]);

    useCanvasAssetHandoff({ assets, assetsHydrated, handleProjectAssetsInsert, nodesRef, projectId, projectLoaded, searchParams, setSearchParams, updateProject });

    const {
        assetInsertScope,
        closeProjectAssets,
        handleLibraryAssetsInsert,
        handleTimelineProjectAssetsInsert,
        openCanvasAssetLibrary,
        openProjectAssets,
        openTimelineAssetLibrary,
        projectAssetInitialCategory,
        projectAssetInitialFolderId,
        projectAssetInsertPosition,
        projectAssetOpen,
        projectAssetScope,
        timelineAddNodeRef,
        timelineMediaAddRef,
    } = useCanvasAssetInsertion({ linkedProjectId, handleAssetsInsert, handleProjectAssetsInsert, openAssetsAtPosition, refetchLinkedProject });

    const {
        angleNodeId,
        emotionNodeId,
        annotationNodeId,
        createImageReversePromptNodes,
        openPortraitTextureEditor,
        cropImageNode,
        cropNodeId,
        closeFrameDialog,
        closeSegmentDialog,
        extractAudioFromVideo,
        extractVideoFrames,
        extractingVideoFramesNodeId,
        frameDialogNodeId,
        generateAngleNode,
        generateEmotionNode,
        handleSegmentConfirm,
        maskEditImageNode,
        maskEditNodeId,
        mergeSelectedVideos,
        mergeVideosByIds,
        mergeVideoProgress,
        saveAnnotatedImageNode,
        segmentDialogMode,
        segmentDialogNodeId,
        segmentRunningMode,
        setFrameDialogNodeId,
        setSegmentDialogNodeId,
        setAngleNodeId,
        setEmotionNodeId,
        setAnnotationNodeId,
        setCropNodeId,
        setMaskEditNodeId,
        setSplitNodeId,
        setUpscaleNodeId,
        splitImageNode,
        splitNodeId,
        openVideoFrameExtractor,
        openVideoSegmentExtractor,
        upscaleImageNode,
        upscaleNodeId,
    } = useCanvasMediaTools({
        projectId,
        domainProjectId: linkedProjectId,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setContextMenu,
        setHoveredNodeId,
        setToolbarNodeId,
        setRunningNodeId,
        startUploadStatus,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
    });

    const handleNodesDeleted = useCallback(
        (removedIds: Set<string>, nextNodes: CanvasNodeData[], _removedNodes: CanvasNodeData[]) => {
            const clearDeletedId = (current: string | null) => (current && removedIds.has(current) ? null : current);
            setHoveredNodeId(clearDeletedId);
            setToolbarNodeId(clearDeletedId);
            setDialogNodeId(clearDeletedId);
            setTextEditorNodeId(clearDeletedId);
            setCharacterReferenceNodeId(clearDeletedId);
            setDrawingNodeId(clearDeletedId);
            setInfoNodeId(clearDeletedId);
            setSubtitleNodeId(clearDeletedId);
            setFrameDialogNodeId(clearDeletedId);
            setSegmentDialogNodeId(clearDeletedId);
            setCropNodeId(clearDeletedId);
            setMaskEditNodeId(clearDeletedId);
            setAnnotationNodeId(clearDeletedId);
            setSplitNodeId(clearDeletedId);
            setUpscaleNodeId(clearDeletedId);
            setAngleNodeId(clearDeletedId);
            setEmotionNodeId(clearDeletedId);
            setSuperResolveNodeId(clearDeletedId);
            setPreviewNodeId(clearDeletedId);
            setRunningNodeId(clearDeletedId);
            setScriptEditorNodeId(clearDeletedId);
            setPortraitClearanceNodeId(clearDeletedId);
            setDirectorNodeId(clearDeletedId);
            setVersionCompareRootId(clearDeletedId);
            setScriptScrollTopById((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !removedIds.has(id))));
            setContextMenu((current) => (current?.type === "node" && removedIds.has(current.nodeId) ? null : current));
            // 绘图文档随项目保留：节点删除可撤销，恢复后仍能读取原内容。
            cleanupCanvasFiles({ projectId, nodes: nextNodes, chatSessions });
        },
        [chatSessions, cleanupCanvasFiles, message, projectId, setAngleNodeId, setAnnotationNodeId, setCropNodeId, setEmotionNodeId, setFrameDialogNodeId, setMaskEditNodeId, setSegmentDialogNodeId, setSplitNodeId, setUpscaleNodeId, setRunningNodeId],
    );

    const {
        alignSelectedNodes,
        autoArrangeCanvasNodes,
        arrangeSelectedNodes,
        copyNodesToClipboard,
        copySelectedNodes,
        createFolder,
        createNode,
        createReferenceGroup,
        createStoryboardGroup,
        deleteConnection,
        deleteNodes,
        duplicateNode,
        hasCopiedNodes,
        pasteCopiedNodes,
        restoreCopiedNodesFromText,
        releaseCopiedNodesPastePriority,
        setPrimaryVersion,
        shouldPreferCopiedNodes,
        toggleNodeLocked,
    } = useCanvasNodeOperations({
        projectId,
        defaultDrawingEngine,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        onNodesDeleted: handleNodesDeleted,
    });

    const {
        cancelPendingConnectionCreate,
        closeConnectionCreateMenu,
        connectionTargetAnchorRatio,
        connectionTargetNodeId,
        connectingParams,
        createConnectedNode,
        getConnectionCreateDisabledReason,
        handleConnectStart,
        handleBatchConnectionTargetClick,
        batchConnectionPreview,
        beginBatchConnectionMode,
        startBatchConnection,
        mouseWorld,
        pendingConnectionCreate,
        setConnecting,
    } = useCanvasConnectionController({
        projectId,
        config: effectiveConfig,
        defaultDrawingEngine,
        nodesRef,
        connectionsRef,
        viewportRef,
        scriptScrollTopById,
        screenToCanvas,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        setDrawingNodeId,
    });

    const batchSourceNodeIds = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id) && !batchSourceRestriction(node)).map((node) => node.id), [nodes, selectedNodeIds]);
    const { handleCanvasDeselect, handleCanvasSelectionStart, handleNodeInteractionStart, handleSelectedNodeClick, openDrawingNode, openPortraitClearance, openTextNodeEditor, selectVideoForPlayback } = useCanvasNodeFocus({
        nodesRef,
        selectedNodeIdsRef,
        dialogNodeId,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setHoveredNodeId,
        setToolbarNodeId,
        setDialogNodeId,
        setTextEditorNodeId,
        setCharacterReferenceNodeId,
        setDrawingNodeId,
        setPortraitClearanceNodeId,
    });

    const { alignmentGuides, cancelSelectionBox, deselectCanvas, dragPreview, frameDropTargetId, handleCanvasMouseDown, handleNodeMouseDown, isNodeDragging, nodeDraggingRef, selectionBoundsElementRef, selectionBox } = useCanvasSelectionController({
        containerRef,
        nodesRef,
        viewportRef,
        selectedNodeIdsRef,
        historyPausedRef,
        screenToCanvas,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        cancelPendingConnectionCreate,
        onCanvasSelectionStart: handleCanvasSelectionStart,
        onNodeInteractionStart: handleNodeInteractionStart,
        onNodeClick: handleSelectedNodeClick,
        onBatchConnectionTarget: handleBatchConnectionTargetClick,
        onLinkedFolderDrop: archiveNodesToLinkedFolder,
        onDeselect: handleCanvasDeselect,
        onSelectionBoxEnd: () => setCanvasTool((tool) => (tool === "box-select" ? "move" : tool)),
    });

    const handleCanvasBlankClick = useCallback(() => {
        deselectCanvas();
        closeAgent();
    }, [closeAgent, deselectCanvas]);

    const { handleCanvasNodeHoverEnd, handleCanvasNodeHoverStart, handleNodeImageSettingsOpenChange, hideNodeToolbar, keepNodeToolbar, nodeImageSettingsOpen, resetNodeHoverToolbar } = useCanvasNodeHoverToolbar({
        dialogNodeId,
        nodeDraggingRef,
        setHoveredNodeId,
        setToolbarNodeId,
    });

    useEffect(() => {
        historyRestoreUiRef.current = () => {
            resetNodeHoverToolbar();
            setDialogNodeId(null);
            setTextEditorNodeId(null);
            setCharacterReferenceNodeId(null);
            setDrawingNodeId(null);
            setInfoNodeId(null);
            setSubtitleNodeId(null);
            setTimelineNodeId(null);
            setSuperResolveNodeId(null);
            setPreviewNodeId(null);
            setScriptEditorNodeId(null);
            setPortraitClearanceNodeId(null);
            setDirectorNodeId(null);
            setVersionCompareRootId(null);
            setFrameDialogNodeId(null);
            setSegmentDialogNodeId(null);
            setCropNodeId(null);
            setMaskEditNodeId(null);
            setAnnotationNodeId(null);
            setSplitNodeId(null);
            setUpscaleNodeId(null);
            setAngleNodeId(null);
            setEmotionNodeId(null);
        };
        return () => {
            historyRestoreUiRef.current = () => undefined;
        };
    }, [resetNodeHoverToolbar, setAngleNodeId, setAnnotationNodeId, setCropNodeId, setEmotionNodeId, setFrameDialogNodeId, setMaskEditNodeId, setSegmentDialogNodeId, setSplitNodeId, setUpscaleNodeId]);

    const {
        collapsingBatchIds,
        downloadNodeImage,
        handleConfigNodeChange,
        handleFolderStyleChange,
        handleFolderThemeChange,
        handleFontSizeChange,
        handleNodeContentChange,
        handleNodePromptChange,
        handleNodeResize,
        handleNodeTitleChange,
        openingBatchIds,
        saveNodeAsset,
        setBatchPrimary,
        toggleBatchExpanded,
        toggleFrameCollapsed,
        toggleNodeFreeResize,
    } = useCanvasNodeEditor({
        canvasId: projectId,
        canvasTitle: currentProject?.title || "未命名画布",
        domainProjectId: linkedProjectId,
        nodesRef,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setToolbarNodeId,
        setHoveredNodeId,
    });
    const { confirmUploadNodeImageToArkPrivateAsset, copyNodeContentToClipboard, copyNodeMediaUrlToClipboard } = useCanvasNodeSharing({
        onMetadataChange: handleConfigNodeChange,
        releaseCopiedNodesPastePriority,
    });

    const { addPortraitCandidateToCanvas, handlePortraitClearanceStateUpdate, portraitClearanceInputs, portraitClearanceNode } = useCanvasPortraitClearance({
        nodes,
        connections,
        nodesRef,
        portraitClearanceNodeId,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        updateNodeMetadata: handleConfigNodeChange,
    });

    const { handleFrameToggle, handleProjectFolderInsert, linkedFolderPreviewNodesById } = useCanvasLinkedProjectFolderInteractions({
        assets,
        linkedProjectId,
        projectAssets: linkedProjectQuery.data?.assets,
        projectFolders: linkedProjectQuery.data?.assetFolders,
        projectAssetInsertPosition,
        nodesRef,
        createFolder,
        openProjectAssets,
        toggleFrameCollapsed,
    });

    const {
        activeDirectorScene,
        activeNodeId,
        activeScriptNode,
        activeStylePresetId,
        angleNode,
        emotionNode,
        annotationNode,
        batchChildCountById,
        batchMotionById,
        canvasImageNodes,
        configInputsById,
        connectionLayerBounds,
        contextMenuNode,
        cropNode,
        displayConnections,
        frameChildrenById,
        imageAssets,
        infoNode,
        maskEditNode,
        mediaRenderPolicy,
        mentionReferencesByNodeId,
        nodeById,
        previewNode,
        reduceMediaEffects,
        relatedHighlight,
        resourceReferenceByNodeId,
        resourceGraphIndex,
        selectedNodeBounds,
        selectedVideoNodes,
        selectionCapabilities,
        skillMentionReferences,
        splitNode,
        superResolveNode,
        toolbarNode,
        upscaleNode,
        versionCompareNodes,
        visibleNodes,
    } = useCanvasRenderModel({
        nodes,
        connections,
        assets,
        viewport,
        viewportSize: size,
        mediaPerformanceMode,
        selectedNodeIds,
        hoveredNodeId,
        dragPreview,
        collapsingBatchIds,
        addedSkills,
        directorScenes: currentProject?.directorScenes,
        infoNodeId,
        cropNodeId,
        maskEditNodeId,
        annotationNodeId,
        splitNodeId,
        upscaleNodeId,
        superResolveNodeId,
        angleNodeId,
        emotionNodeId,
        previewNodeId,
        contextMenu,
        versionCompareRootId,
        directorNodeId,
        scriptEditorNodeId,
        dialogNodeId,
    });
    const { handleRemoveNodeReference } = useCanvasNodeReferences({
        nodesRef,
        connectionsRef,
        mentionReferencesByNodeId,
        setNodes,
        setConnections,
        setSelectedConnectionId,
    });
    // 扩展节点只关心语义数据。使用共享图索引后，每个节点取上游不再重复扫描整张画布，
    // 且纯位置变化不会刷新 Context，避免所有可见节点绕过 memo 重渲染。
    const nodeGraphContext = useMemo<CanvasNodeGraphContextValue>(() => ({ getUpstreamNodes: (nodeId: string) => getContextResourceNodesFromIndex(nodeId, resourceGraphIndex) }), [resourceGraphIndex]);
    const dialogNode = dialogNodeId ? nodeById.get(dialogNodeId) || null : null;
    const subtitleNode = subtitleNodeId ? nodeById.get(subtitleNodeId) || null : null;
    const timelineNode = timelineNodeId ? nodeById.get(timelineNodeId) || null : null;
    const frameNode = frameDialogNodeId ? nodeById.get(frameDialogNodeId) || null : null;
    const segmentNode = segmentDialogNodeId ? nodeById.get(segmentDialogNodeId) || null : null;
    const textEditorNode = textEditorNodeId ? nodeById.get(textEditorNodeId) || null : null;
    const characterReferenceNode = characterReferenceNodeId ? nodeById.get(characterReferenceNodeId) || null : null;
    const drawingNode = drawingNodeId ? nodeById.get(drawingNodeId) || null : null;
    const pendingConnectionSourceNode = pendingConnectionCreate?.connection.handleType === "source" ? nodeById.get(pendingConnectionCreate.connection.nodeId) : null;
    const canCreateDrawingFromConnection = !pendingConnectionCreate?.batchSourceNodeIds?.length && pendingConnectionSourceNode?.type === CanvasNodeType.Image && Boolean(pendingConnectionSourceNode.metadata?.content);

    const { agentSnapshot, agentUndoCount, applyAgentOps, canUndoAgentOps, dismissLastAgentChange, lastAgentChange, undoAgentOps, viewLastAgentChange } = useCanvasAgentOperations({
        projectId,
        domainProjectId: currentProject?.projectId,
        projectTitle: currentProject?.title || "未命名画布",
        nodes,
        connections,
        selectedNodeIds,
        viewport,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        viewportRef,
        generateNodeRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setViewport,
        setContextMenu,
        focusSelection: fitCanvasSelection,
    });
    // viewport 在拖动/缩放时高频更新，但不应让整个 Agent 树跟随重渲染。
    // 仅在节点、连线或选区变化时更换快照对象；viewport 通过 getter 在工具真正读取时取最新值。
    const liveAgentSnapshotRef = useRef(agentSnapshot);
    liveAgentSnapshotRef.current = agentSnapshot;
    const assistantSelectedNodeIds = useMemo(() => Array.from(selectedNodeIds), [selectedNodeIds]);
    const assistantSnapshot = useMemo(
        () => ({
            projectId: agentSnapshot.projectId,
            domainProjectId: agentSnapshot.domainProjectId,
            title: agentSnapshot.title,
            nodes: agentSnapshot.nodes,
            connections: agentSnapshot.connections,
            selectedNodeIds: assistantSelectedNodeIds,
            get viewport() {
                return viewportRef.current;
            },
            get revision() {
                return liveAgentSnapshotRef.current.revision;
            },
            get stateHash() {
                return liveAgentSnapshotRef.current.stateHash;
            },
        }),
        [agentSnapshot.connections, agentSnapshot.domainProjectId, agentSnapshot.nodes, agentSnapshot.projectId, agentSnapshot.title, assistantSelectedNodeIds],
    );

    const { selectCanvasStyle, styleApplying } = useCanvasStyleWorkflow({
        domainProjectId: currentProject?.projectId,
        nodesRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setStylePickerOpen,
    });

    const { applyDirectorOutput, createDirectorShot, openDirectorWorkbench, saveDirectorScene } = useCanvasDirector({
        projectId,
        directorNodeId,
        directorScenes: currentProject?.directorScenes || [],
        nodesRef,
        connectionsRef,
        getCanvasCenter,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDirectorNodeId,
        updateProject,
    });

    const {
        activateStep: activateShortDramaStep,
        createPipeline: createShortDramaPipeline,
        guideCollapsed: shortDramaGuideCollapsed,
        openStoryInput,
        progress: shortDramaProgress,
        setGuideCollapsed: setShortDramaGuideCollapsed,
        skipGuide: skipShortDramaGuide,
    } = useCanvasShortDrama({
        nodes,
        connections,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setStylePickerOpen,
        fitCanvasSelection,
        focusCanvasNode,
        openTextEditor: openTextNodeEditor,
    });

    const shortDramaGuide = shortDramaEnabled && !currentProject?.projectId && shortDramaProgress.active ? { progress: shortDramaProgress, collapsed: shortDramaGuideCollapsed, onToggle: () => setShortDramaGuideCollapsed((value) => !value) } : undefined;

    const clearCanvas = useCallback(() => {
        // 清空操作仍可撤销，因此绘图文档在项目永久删除前继续保留。
        setNodes([]);
        setConnections([]);
        setTextEditorNodeId(null);
        setDrawingNodeId(null);
        setInfoNodeId(null);
        setSubtitleNodeId(null);
        setCropNodeId(null);
        setMaskEditNodeId(null);
        setAnnotationNodeId(null);
        setAngleNodeId(null);
        setEmotionNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        clearCanvasFiles();
    }, [clearCanvasFiles, deselectCanvas, setEmotionNodeId]);

    useCanvasKeyboard({
        nodesRef,
        selectedNodeIdsRef,
        selectedConnectionId,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setShortcutRequestNonce,
        setInfoNodeId,
        setCropNodeId,
        setMaskEditNodeId,
        setAnnotationNodeId,
        saveCanvasProject,
        zoomToActualSize,
        fitCanvasContent,
        fitCanvasSelection,
        undoCanvas,
        redoCanvas,
        cancelSelectionBox,
        copySelectedNodes,
        pasteCopiedNodes,
        restoreCopiedNodesFromText,
        shouldPreferCopiedNodes,
        pasteSystemClipboard,
        deleteNodes,
        deleteConnection,
        deselectCanvas,
        zoomCanvasIn,
        zoomCanvasOut,
        focusMode,
        exitFocusMode,
        toggleFocusMode,
        assistantOpen,
        closeAgent,
        onOpenSearch: () => setNodeSearchOpen(true),
        beginBatchConnection: () => beginBatchConnectionMode(Array.from(selectedNodeIdsRef.current)),
    });

    const handleAssistantSessionsChange = useCallback((sessions: CanvasAssistantSession[], activeId: string | null) => {
        chatSessionsRef.current = sessions;
        activeChatIdRef.current = activeId;
        setChatSessions(sessions);
        setActiveChatId(activeId);
    }, []);
    const consumeCinematicAgentEntry = useCallback(() => setCinematicAgentEntry(false), []);

    const { handleCanvasContextMenu, handleConnectionContextMenu, handleConnectionSelect, handleNodeContextMenu, pasteAtPosition } = useCanvasContextInteractions({
        closeConnectionCreateMenu,
        pasteCopiedNodes,
        pasteSystemClipboard,
        screenToCanvas,
        setContextMenu,
        setDialogNodeId,
        setSelectedConnectionId,
        setSelectedNodeIds,
        setToolbarNodeId,
        shouldPreferCopiedNodes,
    });

    const handleGenerateNode = useCanvasGenerationExecutor({
        projectId,
        domainProjectId: currentProject?.projectId,
        addedSkills,
        assets,
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setRunningNodeId,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
        applyGenerationTaskResult,
    });
    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [handleGenerateNode]);

    const { enqueueGenerationBatch, retryFailedBatchItems, stopRemainingBatchItems } = useCanvasGenerationBatches({
        projectId,
        projectLoaded,
        nodes,
        nodesRef,
        setNodes,
        handleGenerateNode,
    });

    const { addScriptRow, createAndGenerateScriptVideos, createScriptActionBoards, createScriptImageNodes, createScriptVideoNodes, generateScriptImages, generateScriptRows, generateScriptVideos, removeScriptRow, replaceScriptRows, updateScriptRow } =
        useCanvasStoryboard({
            projectId,
            addedSkills,
            nodesRef,
            connectionsRef,
            setNodes,
            setConnections,
            setSelectedNodeIds,
            enqueueGenerationBatch,
        });

    const handleRetryNode = useCanvasGenerationRetry({
        projectId,
        domainProjectId: currentProject?.projectId,
        addedSkills,
        assets,
        nodesRef,
        connectionsRef,
        setNodes,
        setRunningNodeId,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
        applyGenerationTaskResult,
    });
    const generateImageFromTextNode = useCanvasTextToImage({ nodesRef, connectionsRef, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId });

    const renderCanvasNodePanel = useCallback(
        (panelNode: CanvasNodeData) => {
            if (panelNode.type === CanvasNodeType.Script || panelNode.type === CanvasNodeType.Drawing) return null;
            return panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || []}
                    skillReferences={skillMentionReferences}
                    generationMode={panelNode.metadata?.generationMode}
                    metadata={panelNode.metadata}
                    workspaceMode={workspaceMode}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onMetadataChange={(patch) => handleConfigNodeChange(panelNode.id, patch)}
                    onClose={() => setDialogNodeId(null)}
                />
            ) : (
                <CanvasNodePromptPanel
                    node={panelNode}
                    isRunning={runningNodeId === panelNode.id}
                    mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || EMPTY_RESOURCE_REFERENCES}
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleConfigNodeChange}
                    onGenerate={handleGenerateNode}
                    onRemoveReference={handleRemoveNodeReference}
                    onClose={() => setDialogNodeId(null)}
                    onNodeMouseDown={handleNodeMouseDown}
                    workspaceMode={workspaceMode}
                    onImageSettingsOpenChange={handleNodeImageSettingsOpenChange}
                />
            );
        },
        [configInputsById, handleConfigNodeChange, handleGenerateNode, handleNodeImageSettingsOpenChange, handleNodePromptChange, handleRemoveNodeReference, mentionReferencesByNodeId, runningNodeId, skillMentionReferences, workspaceMode],
    );

    const renderCanvasNodeContent = useCallback(
        (contentNode: CanvasNodeData) => {
            if (contentNode.metadata?.workflowKind === "character" && contentNode.metadata.characterAssetId) {
                return <CanvasCharacterReferenceNodeContent node={contentNode} />;
            }
            if (contentNode.metadata?.workflowKind === "styleboard" && !contentNode.metadata.content) {
                return <CanvasStylePlaceholderNodeContent onChoose={() => setStylePickerOpen(true)} />;
            }
            if (contentNode.metadata?.workflowKind === "story_input") {
                return <CanvasStoryInputNodeContent node={contentNode} onEdit={() => openStoryInput(contentNode.id)} />;
            }
            if (contentNode.type === CanvasNodeType.Script) {
                const pipeline = deriveStoryboardPipelineProgress(contentNode, nodesRef.current, connectionsRef.current);
                return (
                    <CanvasScriptNodeContent
                        node={contentNode}
                        nodes={nodesRef.current}
                        batch={visibleGenerationBatch(contentNode)}
                        pipeline={pipeline}
                        scale={viewport.k}
                        mentionReferences={mentionReferencesByNodeId.get(contentNode.id) || EMPTY_RESOURCE_REFERENCES}
                        onOpen={() => setScriptEditorNodeId(contentNode.id)}
                        onCreateImageNodes={() => createScriptImageNodes(contentNode.id)}
                        onCreateVideoNodes={() => createScriptVideoNodes(contentNode.id)}
                        onGenerateImages={(rowIds) => void generateScriptImages(contentNode.id, rowIds)}
                        onGenerateVideos={(rowIds) => (contentNode.metadata?.storyboardVideoInputMode === "keyframe" ? void generateScriptVideos(contentNode.id, rowIds) : void createAndGenerateScriptVideos(contentNode.id, rowIds))}
                        onVideoInputModeChange={(storyboardVideoInputMode) => handleConfigNodeChange(contentNode.id, { storyboardVideoInputMode })}
                        onMergeVideos={() => void mergeVideosByIds(pipeline.successfulVideoNodeIds)}
                        onCreateActionBoards={() => void createScriptActionBoards(contentNode.id)}
                        onRetryBatch={(batchId) => retryFailedBatchItems(contentNode.id, batchId)}
                        onRetryBatchItem={(batchId, itemId) => retryFailedBatchItems(contentNode.id, batchId, itemId)}
                        onStopBatch={(batchId) => stopRemainingBatchItems(contentNode.id, batchId)}
                        onAddRow={() => addScriptRow(contentNode.id)}
                        onRemoveRow={(rowId) => removeScriptRow(contentNode.id, rowId)}
                        onUpdateRow={(rowId, patch) => updateScriptRow(contentNode.id, rowId, patch)}
                        onPromptChange={(composerContent) => handleConfigNodeChange(contentNode.id, { composerContent })}
                        onGenerateScript={(prompt) => void generateScriptRows(contentNode.id, prompt)}
                        onModelChange={(model) => handleConfigNodeChange(contentNode.id, { model })}
                        onShotDurationChange={(duration: StoryboardShotDuration) => handleConfigNodeChange(contentNode.id, { storyboardShotDuration: duration })}
                        onShotCountChange={(count: StoryboardShotCount) => handleConfigNodeChange(contentNode.id, { storyboardShotCount: count })}
                        workspaceMode={workspaceMode}
                        onComposerHeightChange={(height) => {
                            if (contentNode.metadata?.storyboardComposerHeight === height) return;
                            handleConfigNodeChange(contentNode.id, { storyboardComposerHeight: height });
                            const minHeight = storyboardMinNodeHeight(height);
                            if (contentNode.height < minHeight) handleNodeResize(contentNode.id, contentNode.width, minHeight);
                        }}
                        onConnectStart={(event, rowId, handleType) => handleConnectStart(event, contentNode.id, handleType, rowId === "context" ? "storyboard:context" : `row:${rowId}`)}
                        onScrollTopChange={(scrollTop) => setScriptScrollTopById((current) => (current[contentNode.id] === scrollTop ? current : { ...current, [contentNode.id]: scrollTop }))}
                    />
                );
            }
            if (contentNode.metadata?.directorSceneId) {
                return (
                    <CanvasDirectorNodePanel
                        node={contentNode}
                        scene={currentProject?.directorScenes?.find((scene) => scene.id === contentNode.metadata?.directorSceneId) || null}
                        readNodeContent={(nodeId) => (nodeId ? nodesRef.current.find((item) => item.id === nodeId)?.metadata?.content : undefined)}
                        professional={workspaceMode === "professional"}
                        onOpen={() => openDirectorWorkbench(contentNode.id)}
                    />
                );
            }
            return (
                <CanvasConfigNodePanel
                    node={contentNode}
                    isRunning={runningNodeId === contentNode.id}
                    inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                    onConfigChange={handleConfigNodeChange}
                    onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                    onGenerate={(nodeId) => {
                        const target = nodesRef.current.find((item) => item.id === nodeId);
                        void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                    }}
                    workspaceMode={workspaceMode}
                />
            );
        },
        [
            addScriptRow,
            configInputsById,
            createAndGenerateScriptVideos,
            createScriptActionBoards,
            createScriptImageNodes,
            createScriptVideoNodes,
            currentProject?.directorScenes,
            generateScriptImages,
            generateScriptRows,
            generateScriptVideos,
            handleConfigNodeChange,
            handleConnectStart,
            handleGenerateNode,
            handleNodeResize,
            mentionReferencesByNodeId,
            mergeVideosByIds,
            openDirectorWorkbench,
            openStoryInput,
            removeScriptRow,
            retryFailedBatchItems,
            runningNodeId,
            stopRemainingBatchItems,
            updateScriptRow,
            viewport.k,
            workspaceMode,
        ],
    );

    const retryCanvasNode = useCanvasNodeRetry({ nodesRef, setNodes, generateScriptRows, retryGenerationNode: handleRetryNode });
    const { canvasNodeActions, editCanvasDirector, openCanvasNodeVersions, viewCanvasNodeImage } = useCanvasNodeActionBindings({
        setNodes,
        setVersionCompareRootId,
        setPreviewNodeId,
        openDirectorWorkbench,
        duplicateNode,
        deleteNodes,
        downloadNodeImage,
        openPortraitClearance,
        selectVideoForPlayback,
    });
    const locateProjectStyleNode = useCallback(() => {
        const styleNode = nodesRef.current.find((node) => node.type === CanvasNodeType.Text && node.metadata?.workflowKind === "styleboard");
        if (!styleNode) {
            message.info("项目画风节点正在同步，请稍后再试");
            return;
        }
        focusCanvasNode(styleNode.id);
    }, [focusCanvasNode, message, nodesRef]);
    const emptyCanvasState = nodes.length ? null : !shortDramaEnabled ? (
        <CanvasFreeformEmptyState onUpload={() => handleUploadRequest()} onAddText={() => createNode(CanvasNodeType.Text)} />
    ) : currentProject?.projectId ? (
        <CanvasLinkedProjectEmptyState
            projectName={linkedProjectQuery.data?.project.name || currentProject.title}
            hasChapter={Boolean(linkedProjectQuery.data?.units.length)}
            onAddFirstChapter={() => {
                const first = linkedProjectQuery.data?.units.slice().sort((left, right) => left.position - right.position)[0];
                if (first) void handleProjectChapterInsert({ id: first.id, projectId: currentProject.projectId!, title: first.title, position: first.position });
            }}
            onOpenAssets={() => openProjectAssets()}
            onAddText={() => createNode(CanvasNodeType.Text)}
        />
    ) : (
        <CanvasShortDramaEmptyState
            onCreatePipeline={createShortDramaPipeline}
            onOpenAgent={() => {
                setCinematicAgentEntry(true);
                setAgentMode("online");
                openAgent("online");
            }}
            onUpload={() => handleUploadRequest()}
            onAddText={() => createNode(CanvasNodeType.Text)}
            onAddScript={() => createNode(CanvasNodeType.Script)}
        />
    );
    if (!projectLoaded) return <CanvasRefreshShell />;

    return (
        <>
            <a
                href="#canvas-main"
                className="pc-canvas-skip-link sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[var(--z-toast)] focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
            >
                跳转到画布主内容
            </a>
            <main
                id="canvas-main"
                tabIndex={-1}
                className="pc-canvas-workspace flex h-full min-h-0 overflow-hidden outline-none"
                data-assistant-open={assistantOpen ? "true" : "false"}
                data-focus-mode={focusMode ? "true" : "false"}
                data-workspace-mode={workspaceMode}
                style={{ background: theme.canvas.background, color: theme.node.text }}
                aria-label="画布编辑工作台"
            >
                {!focusMode && shortDramaEnabled && currentProject?.projectId ? (
                    <CanvasProjectSidebar projectId={currentProject.projectId} detail={linkedProjectQuery.data} onAddChapter={handleProjectChapterInsert} onLocateStyle={locateProjectStyleNode} onOpenAssets={() => openProjectAssets()} />
                ) : null}
                <CanvasOverlayLayerProvider>
                    <section className="pc-canvas-workspace__stage relative min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden">
                        {!focusMode ? (
                            <CanvasTopBar
                                title={currentProject?.title || "未命名画布"}
                                titleDraft={titleDraft}
                                isTitleEditing={titleEditing}
                                onTitleDraftChange={setTitleDraft}
                                onStartTitleEditing={startTitleEditing}
                                onFinishTitleEditing={finishTitleEditing}
                                onCancelTitleEditing={cancelTitleEditing}
                                canUndo={historyState.canUndo}
                                canRedo={historyState.canRedo}
                                onCreateProject={createAndOpenProject}
                                onDeleteProject={deleteCurrentProject}
                                onImportImage={() => handleUploadRequest()}
                                onImportLibTV={() => setLibTVImportOpen(true)}
                                onImportTapNow={() => setTapNowImportOpen(true)}
                                onUndo={undoCanvas}
                                onRedo={redoCanvas}
                                onShare={() => setShareModalOpen(true)}
                                agentOpen={assistantOpen}
                                compactAgentStatus={codexCompactAgent ? { connected: localAgentConnected, enabled: localAgentEnabled, activity: localAgentActivity } : undefined}
                                onToggleAgent={() => (assistantOpen ? closeAgent() : openAgent())}
                                shortcutRequestNonce={shortcutRequestNonce}
                                mediaPerformanceMode={mediaPerformanceMode}
                                mediaRenderTier={mediaRenderPolicy.tier}
                                onMediaPerformanceModeChange={setMediaPerformanceMode}
                                onOpenSearch={() => setNodeSearchOpen(true)}
                                saveStatus={saveStatus}
                                onRetrySave={() => void saveCanvasProject()}
                                projectContext={
                                    shortDramaEnabled && currentProject?.projectId
                                        ? {
                                              ...canvasContext,
                                              projectId: currentProject.projectId,
                                              projectName: linkedProjectQuery.data?.project.name || currentProject.title,
                                          }
                                        : undefined
                                }
                                onEnterFocusMode={enterFocusMode}
                                shortDramaGuide={shortDramaGuide}
                            />
                        ) : null}

                        {!focusMode ? (
                            <div
                                data-canvas-no-zoom
                                className="pc-canvas-workspace__mode-switch pointer-events-none absolute bottom-[calc(var(--canvas-inset-y)+var(--space-16))] z-[var(--z-toolbar)] transition-[bottom] duration-300 lg:bottom-[var(--canvas-inset-y)]"
                                style={{ right: assistantOpen ? assistantWidth + 24 : "var(--canvas-inset-x)" }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onPointerDown={(event) => event.stopPropagation()}
                                onWheel={(event) => event.stopPropagation()}
                            >
                                <CanvasWorkspaceModeSwitch mode={workspaceMode} onChange={setWorkspaceMode} />
                            </div>
                        ) : null}

                        <CanvasNodeSearchModal
                            open={nodeSearchOpen}
                            nodes={nodes}
                            onClose={() => setNodeSearchOpen(false)}
                            onFocus={(nodeId) => {
                                const target = nodeById.get(nodeId);
                                const parent = target?.parentId ? nodeById.get(target.parentId) : null;
                                if (parent?.metadata?.frame?.collapsed) toggleFrameCollapsed(parent.id);
                                const batchRoot = target?.metadata?.batchRootId ? nodeById.get(target.metadata.batchRootId) : null;
                                if (batchRoot && !batchRoot.metadata?.imageBatchExpanded) toggleBatchExpanded(batchRoot.id);
                                const selection = new Set([nodeId]);
                                selectedNodeIdsRef.current = selection;
                                setSelectedNodeIds(selection);
                                setSelectedConnectionId(null);
                                focusCanvasNode(nodeId);
                            }}
                        />

                        {!focusMode && shortDramaGuide ? (
                            <CanvasShortDramaGuide progress={shortDramaGuide.progress} collapsed={shortDramaGuide.collapsed} onToggle={shortDramaGuide.onToggle} onSkip={skipShortDramaGuide} onStepClick={activateShortDramaStep} />
                        ) : null}

                        <CanvasShareModal projectId={projectId} open={shareModalOpen} onClose={() => setShareModalOpen(false)} beforeCreate={saveCanvasProject} />
                        <LibTVImportDialog open={libTVImportOpen} projectId={projectId} viewport={viewport} viewportSize={size} onClose={() => setLibTVImportOpen(false)} onApply={applyLibTVImport} />
                        <TapNowImportDialog open={tapNowImportOpen} projectId={projectId} viewport={viewport} viewportSize={size} onClose={() => setTapNowImportOpen(false)} onApply={applyTapNowImport} />

                        <CanvasStylePickerModal open={stylePickerOpen} value={activeStylePresetId} applying={styleApplying} onClose={() => setStylePickerOpen(false)} onSelect={selectCanvasStyle} />

                        <CanvasDirectorTemplateModal open={Boolean(directorTemplateRequest)} onClose={() => setDirectorTemplateRequest(null)} onSelect={(templateId) => createDirectorShot(templateId, directorTemplateRequest?.position)} />

                        <div className="pc-canvas-workspace__body relative flex min-h-0 min-w-0 flex-1">
                            <div className="pc-canvas-workspace__viewport relative min-w-0 flex-1 overflow-hidden">
                                <InfiniteCanvas
                                    containerRef={containerRef}
                                    viewport={viewport}
                                    backgroundMode={backgroundMode}
                                    graphicsLayer={
                                        <CanvasLeaferGraphicsLayer
                                            containerRef={containerRef}
                                            viewport={viewport}
                                            theme={theme}
                                            displayConnections={displayConnections}
                                            selectedConnectionId={selectedConnectionId}
                                            relatedConnectionIds={relatedHighlight.connectionIds}
                                            scriptScrollTopById={scriptScrollTopById}
                                            connectingParams={connectingParams}
                                            batchConnectionPreview={batchConnectionPreview}
                                            mouseWorld={mouseWorld}
                                            connectionTargetNodeId={connectionTargetNodeId}
                                            connectionTargetAnchorRatio={connectionTargetAnchorRatio}
                                            nodeById={nodeById}
                                            selectionBox={selectionBox}
                                            selectedNodeBounds={selectedNodeBounds}
                                            alignmentGuides={alignmentGuides}
                                        />
                                    }
                                    onViewportChange={handleViewportChange}
                                    onViewportPreviewChange={handleViewportPreviewChange}
                                    onCanvasMouseDown={handleCanvasMouseDown}
                                    boxSelectEnabled={canvasTool === "box-select"}
                                    onCanvasDoubleClick={handleCanvasDoubleClick}
                                    onCanvasDeselect={handleCanvasBlankClick}
                                    onContextMenu={handleCanvasContextMenu}
                                    onDrop={handleDrop}
                                    onFileDragEnter={handleFileDragEnter}
                                    onFileDragLeave={handleFileDragLeave}
                                    onFileDragOver={handleFileDragOver}
                                >
                                    <CanvasNodeActionContext.Provider value={canvasNodeActions}>
                                        <CanvasNodeGraphContext.Provider value={nodeGraphContext}>
                                            <CanvasProjectWorldLayers
                                                projectId={projectId}
                                                viewportScale={viewport.k}
                                                connectionLayerBounds={connectionLayerBounds}
                                                displayConnections={displayConnections}
                                                selectedConnectionId={selectedConnectionId}
                                                relatedConnectionIds={relatedHighlight.connectionIds}
                                                scriptScrollTopById={scriptScrollTopById}
                                                connectingParams={connectingParams}
                                                mouseWorld={mouseWorld}
                                                connectionTargetNodeId={connectionTargetNodeId}
                                                nodeById={nodeById}
                                                visibleNodes={visibleNodes}
                                                frameChildrenById={frameChildrenById}
                                                linkedFolderPreviewNodesById={linkedFolderPreviewNodesById}
                                                dragPreview={dragPreview}
                                                selectedNodeIds={selectedNodeIds}
                                                frameDropTargetId={frameDropTargetId}
                                                relatedNodeIds={relatedHighlight.nodeIds}
                                                activeNodeId={activeNodeId}
                                                selectionBox={selectionBox}
                                                batchChildCountById={batchChildCountById}
                                                collapsingBatchIds={collapsingBatchIds}
                                                openingBatchIds={openingBatchIds}
                                                batchMotionById={batchMotionById}
                                                showImageInfo={showImageInfo}
                                                reduceMediaEffects={reduceMediaEffects}
                                                mediaRenderPolicy={mediaRenderPolicy}
                                                resourceReferenceByNodeId={resourceReferenceByNodeId}
                                                mentionReferencesByNodeId={mentionReferencesByNodeId}
                                                mediaEffectsDisabledNodeId={emotionNodeId}
                                                selectedNodeBounds={selectedNodeBounds}
                                                batchSourceNodeIds={batchSourceNodeIds}
                                                batchConnectionPreview={batchConnectionPreview}
                                                isNodeDragging={isNodeDragging}
                                                selectionBoundsElementRef={selectionBoundsElementRef}
                                                renderCanvasNodeContent={renderCanvasNodeContent}
                                                onConnectionSelect={handleConnectionSelect}
                                                onConnectionContextMenu={handleConnectionContextMenu}
                                                onNodeMouseDown={handleNodeMouseDown}
                                                onNodeHoverStart={handleCanvasNodeHoverStart}
                                                onNodeHoverEnd={handleCanvasNodeHoverEnd}
                                                onConnectStart={handleConnectStart}
                                                onNodeResize={handleNodeResize}
                                                onToggleFrame={handleFrameToggle}
                                                onFolderStyleChange={handleFolderStyleChange}
                                                onFolderThemeChange={handleFolderThemeChange}
                                                onNodeTitleChange={handleNodeTitleChange}
                                                onNodeContextMenu={handleNodeContextMenu}
                                                onNodeContentChange={handleNodeContentChange}
                                                onToggleBatch={toggleBatchExpanded}
                                                onSetBatchPrimary={setBatchPrimary}
                                                onRetry={retryCanvasNode}
                                                onReloadResource={reloadCanvasNodeResource}
                                                onOpenTaskDetails={openCanvasNodeTaskDetails}
                                                onOpenVersions={openCanvasNodeVersions}
                                                onViewImage={viewCanvasNodeImage}
                                                onReplaceMedia={replaceCanvasNodeMedia}
                                                onOpenTextEditor={openTextNodeEditor}
                                                onOpenDirector={editCanvasDirector}
                                                onOpenDrawing={openDrawingNode}
                                                onStartBatchConnection={startBatchConnection}
                                            />
                                        </CanvasNodeGraphContext.Provider>
                                    </CanvasNodeActionContext.Provider>
                                </InfiniteCanvas>

                                <CanvasActiveTaskPanel
                                    tasks={activeTasks}
                                    onCancelTask={cancelCanvasTask}
                                    topInset={focusMode ? "var(--space-3)" : "var(--canvas-topbar-offset)"}
                                    rightInset={assistantOpen ? assistantWidth + 12 : "var(--space-3)"}
                                />

                                {focusMode ? (
                                    <CanvasFocusModeBar
                                        dockRevealed={focusDockRevealed}
                                        agentOpen={assistantOpen}
                                        rightInset={assistantOpen ? assistantWidth : 0}
                                        zoomPercent={viewport.k}
                                        onToggleDock={() => setFocusDockRevealed((value) => !value)}
                                        onToggleAgent={() => (assistantOpen ? closeAgent() : openAgent())}
                                        onExit={exitFocusMode}
                                        onZoomIn={zoomCanvasIn}
                                        onZoomOut={zoomCanvasOut}
                                        onFit={fitCanvasContent}
                                    />
                                ) : null}

                                <CanvasFileDropOverlay active={fileDropActive} theme={theme} />

                                {emptyCanvasState ? <div className="pc-canvas-empty-stage contents">{emptyCanvasState}</div> : null}

                                {!focusMode || focusDockRevealed ? (
                                    <CanvasToolbar
                                        selectedCount={selectedNodeIds.size}
                                        workspaceMode={workspaceMode}
                                        rightInset={assistantOpen ? assistantWidth + 16 : "var(--canvas-inset-x)"}
                                        canvasTool={canvasTool}
                                        onToolChange={setCanvasTool}
                                        isProjectLinked={Boolean(shortDramaEnabled && currentProject?.projectId)}
                                        canUndo={historyState.canUndo}
                                        canRedo={historyState.canRedo}
                                        backgroundMode={backgroundMode}
                                        showImageInfo={showImageInfo}
                                        onAddImage={() => createNode(CanvasNodeType.Image)}
                                        onAddVideo={() => createNode(CanvasNodeType.Video)}
                                        onAddAudio={() => createNode(CanvasNodeType.Audio)}
                                        onAddText={() => createNode(CanvasNodeType.Text)}
                                        onChooseStyle={() => setStylePickerOpen(true)}
                                        onAddScript={() => createNode(CanvasNodeType.Script)}
                                        onAddFrame={() => createNode(CanvasNodeType.Frame)}
                                        onAddFolder={createFolder}
                                        onAddDrawing={() => createNode(CanvasNodeType.Drawing)}
                                        onAddExtensionNode={(type) => createNode(type)}
                                        onAddWorkflow={() => createNode(CanvasNodeType.Config)}
                                        onOpenDirector={() => setDirectorTemplateRequest({})}
                                        onUndo={undoCanvas}
                                        onRedo={redoCanvas}
                                        onUpload={() => handleUploadRequest()}
                                        onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                                        onClear={() => setClearConfirmOpen(true)}
                                        onDeselect={deselectCanvas}
                                        onBackgroundModeChange={setBackgroundMode}
                                        onShowImageInfoChange={setShowImageInfo}
                                        onOpenMyAssets={() => {
                                            openCanvasAssetLibrary();
                                        }}
                                        onOpenProjectCharacters={() => openProjectAssets("character")}
                                    />
                                ) : null}
                            </div>

                            {assistantMounted ? (
                                <AssistantPanelColumn width={assistantWidth} closing={assistantClosing} topInset={focusMode ? "0px" : "var(--canvas-topbar-offset)"} onWidthChange={setAssistantWidth}>
                                    {() => (
                                        <Suspense fallback={<div data-canvas-no-zoom className="grid h-full min-h-0 place-items-center px-6 text-sm text-foreground/55">正在准备 Agent…</div>}>
                                            <CanvasAssistantPanel
                                                nodes={nodes}
                                                selectedNodeIds={selectedNodeIds}
                                                snapshot={assistantSnapshot}
                                                projectId={projectId}
                                                sessions={chatSessions}
                                                activeSessionId={activeChatId}
                                                onSelectNodeIds={setSelectedNodeIds}
                                                onSessionsChange={handleAssistantSessionsChange}
                                                onApplyOps={applyAgentOps}
                                                canUndoOps={canUndoAgentOps}
                                                undoOpsCount={agentUndoCount}
                                                onUndoOps={undoAgentOps}
                                                onPasteImage={pasteAssistantImage}
                                                agentMode={agentMode}
                                                onAgentModeChange={setAgentMode}
                                                autoConnectLocal={codexAutoConnect}
                                                closing={assistantClosing}
                                                onCollapse={closeAgent}
                                                cinematicEntry={cinematicAgentEntry}
                                                onCinematicEntryConsumed={consumeCinematicAgentEntry}
                                            />
                                        </Suspense>
                                    )}
                                </AssistantPanelColumn>
                            ) : null}
                        </div>

                        {angleNode?.metadata?.content ? (
                            <CanvasNodePanelOverlay
                                node={angleNode}
                                viewport={viewport}
                                containerRef={containerRef}
                                panelWidth={580}
                                panelHeight={350}
                                dragOffset={dragPreview?.nodeIds.has(angleNode.id) ? { x: dragPreview.x, y: dragPreview.y } : null}
                                isDragging={isNodeDragging && Boolean(dragPreview?.nodeIds.has(angleNode.id))}
                            >
                                <CanvasNodeAnglePanel
                                    dataUrl={angleNode.metadata.content}
                                    onClose={() => setAngleNodeId(null)}
                                    onConfirm={(params) => {
                                        void generateAngleNode(angleNode, params);
                                    }}
                                />
                            </CanvasNodePanelOverlay>
                        ) : null}

                        {emotionNode?.metadata?.content ? (
                            <CanvasEmotionWorkspace
                                node={emotionNode}
                                viewport={viewport}
                                containerRef={containerRef}
                                dragOffset={dragPreview?.nodeIds.has(emotionNode.id) ? { x: dragPreview.x, y: dragPreview.y } : null}
                                isDragging={isNodeDragging && Boolean(dragPreview?.nodeIds.has(emotionNode.id))}
                                onClose={() => setEmotionNodeId(null)}
                                onConfirm={(payload: CanvasImageEmotionPayload) => {
                                    void generateEmotionNode(emotionNode, payload);
                                }}
                            />
                        ) : null}

                        {dialogNode && dialogNode.type !== CanvasNodeType.Script && dialogNode.type !== CanvasNodeType.Drawing && !selectionBox ? (
                            <CanvasNodePanelOverlay
                                node={dialogNode}
                                viewport={viewport}
                                containerRef={containerRef}
                                dragOffset={dragPreview?.nodeIds.has(dialogNode.id) ? { x: dragPreview.x, y: dragPreview.y } : null}
                                isDragging={isNodeDragging && Boolean(dragPreview?.nodeIds.has(dialogNode.id))}
                            >
                                {renderCanvasNodePanel(dialogNode)}
                            </CanvasNodePanelOverlay>
                        ) : null}

                        {pendingConnectionCreate ? (
                            <CanvasConnectionCreateMenu
                                pending={pendingConnectionCreate}
                                viewport={viewport}
                                viewportSize={size}
                                containerRef={containerRef}
                                canCreateDrawing={canCreateDrawingFromConnection}
                                getDisabledReason={(type) => getConnectionCreateDisabledReason(type, pendingConnectionCreate)}
                                onCreate={(type) => void createConnectedNode(type, pendingConnectionCreate)}
                                onClose={cancelPendingConnectionCreate}
                            />
                        ) : null}

                        {selectedNodeBounds && !selectionBox && !isNodeDragging ? (
                            <CanvasProjectSelectionToolbar
                                anchorRef={selectionBoundsElementRef}
                                containerRef={containerRef}
                                count={selectedNodeBounds.count}
                                selectedVideoCount={selectedVideoNodes.length}
                                layoutEligibleCount={selectionCapabilities.layoutEligibleCount}
                                storyboardEligibleCount={selectionCapabilities.storyboardEligibleCount}
                                referenceGroupEligibleCount={selectionCapabilities.referenceGroupEligibleCount}
                                batchConnectEligibleCount={selectionCapabilities.batchConnectEligibleCount}
                                mergingVideos={Boolean(mergeVideoProgress)}
                                onAlign={alignSelectedNodes}
                                onArrange={arrangeSelectedNodes}
                                onCreateStoryboard={createStoryboardGroup}
                                onCreateReferenceGroup={createReferenceGroup}
                                onBatchConnect={() => beginBatchConnectionMode(Array.from(selectedNodeIds))}
                                onMergeVideos={() => void mergeSelectedVideos()}
                            />
                        ) : null}

                        {uploadStatus ? <CanvasUploadStatusToast status={uploadStatus} theme={theme} /> : null}
                        {mergeVideoProgress ? <CanvasMergeStatusToast progress={mergeVideoProgress} theme={theme} /> : null}
                        {lastAgentChange ? (
                            <CanvasAgentChangeToast
                                change={lastAgentChange}
                                theme={theme}
                                onView={viewLastAgentChange}
                                onUndo={() => {
                                    undoAgentOps();
                                }}
                                onClose={dismissLastAgentChange}
                            />
                        ) : null}

                        <CanvasNodeToolbar
                            node={isNodeDragging || nodeImageSettingsOpen || emotionNodeId ? null : toolbarNode}
                            workspaceMode={workspaceMode}
                            viewport={viewport}
                            containerRef={containerRef}
                            onKeep={keepNodeToolbar}
                            onLeave={hideNodeToolbar}
                            onInfo={(node) => (node.metadata?.workflowKind === "character" && node.metadata.characterAssetId ? openTextNodeEditor(node) : setInfoNodeId(node.id))}
                            onEditText={openTextNodeEditor}
                            onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                            onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                            onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                            onGenerateImage={generateImageFromTextNode}
                            onUpload={(node) => handleUploadRequest(node.id)}
                            onDownload={downloadNodeImage}
                            onSaveAsset={(node) => void saveNodeAsset(node)}
                            onAnnotate={(node) => setAnnotationNodeId(node.id)}
                            onMaskEdit={(node) => setMaskEditNodeId(node.id)}
                            onEmotion={(node) => {
                                setDialogNodeId(null);
                                setEmotionNodeId((current) => (current === node.id ? null : node.id));
                            }}
                            onPortraitTexture={openPortraitTextureEditor}
                            onCrop={(node) => setCropNodeId(node.id)}
                            onSplit={(node) => setSplitNodeId(node.id)}
                            onUpscale={(node) => setUpscaleNodeId(node.id)}
                            onSuperResolve={(node) => setSuperResolveNodeId(node.id)}
                            onAngle={(node) => {
                                setDialogNodeId(null);
                                setAngleNodeId((current) => (current === node.id ? null : node.id));
                            }}
                            onViewImage={(node) => setPreviewNodeId(node.id)}
                            onExtractVideoFrames={openVideoFrameExtractor}
                            onExtractAudioFromVideo={(node) => void extractAudioFromVideo(node)}
                            onTrimVideoSegments={openVideoSegmentExtractor}
                            onSubtitles={(node) => setSubtitleNodeId(node.id)}
                            onTimeline={(node) => setTimelineNodeId(node.id)}
                            extractingVideoFrames={toolbarNode?.id === extractingVideoFramesNodeId}
                            extractingAudio={segmentRunningMode === "audio"}
                            trimmingVideo={segmentRunningMode === "video"}
                            onReversePrompt={createImageReversePromptNodes}
                            onRetry={retryCanvasNode}
                            onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                            onToggleLocked={(node) => toggleNodeLocked(node.id)}
                            onDelete={(node) => deleteNodes(new Set([node.id]))}
                        />

                        {isMiniMapOpen && !focusMode ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} canvasContainerRef={containerRef} onViewportPreviewChange={previewViewport} onViewportChange={handleViewportChange} /> : null}

                        {!focusMode ? (
                            <CanvasOverlayLayerContainer
                                overlayId="asset-tray"
                                fallbackZIndex="var(--z-panel)"
                                className="pc-canvas-workspace__bottom-dock absolute bottom-[calc(var(--canvas-inset-y)+var(--space-16))] left-[var(--canvas-inset-x)] flex items-end gap-2 lg:bottom-[var(--canvas-inset-y)]"
                                onMouseDown={(event) => event.stopPropagation()}
                                onPointerDown={(event) => event.stopPropagation()}
                                onWheel={(event) => event.stopPropagation()}
                            >
                                <CanvasZoomControls
                                    scale={viewport.k}
                                    containerRef={containerRef}
                                    onScaleChange={setZoomScale}
                                    onFitContent={fitCanvasContent}
                                    onAutoArrange={() => {
                                        setContextMenu(null);
                                        autoArrangeCanvasNodes();
                                        window.requestAnimationFrame(() => fitCanvasContent());
                                    }}
                                    isMiniMapOpen={isMiniMapOpen}
                                    onToggleMiniMap={() => { setContextMenu(null); setIsMiniMapOpen((value) => !value); }}
                                    onOpenShortcuts={() => { setContextMenu(null); setShortcutRequestNonce((value) => value + 1); }}
                                />
                                <CanvasAssetTray
                                    assetImages={imageAssets}
                                    canvasImages={canvasImageNodes}
                                    showLibrary={!currentProject?.projectId}
                                    activeNodeId={selectedNodeIds.size === 1 ? Array.from(selectedNodeIds)[0] : null}
                                    onInsertAssetImage={(asset) => void createImageAssetNode(asset)}
                                    onFocusCanvasImage={focusCanvasImageNode}
                                />
                            </CanvasOverlayLayerContainer>
                        ) : null}

                        <CanvasProjectContextMenu
                            menu={contextMenu}
                            node={contextMenuNode}
                            workspaceMode={workspaceMode}
                            isProjectLinked={Boolean(currentProject?.projectId)}
                            canUndo={historyState.canUndo}
                            canRedo={historyState.canRedo}
                            canPaste={hasCopiedNodes || Boolean(navigator.clipboard)}
                            screenToCanvas={screenToCanvas}
                            onClose={() => setContextMenu(null)}
                            onAddNode={(type, position) => createNode(type, position)}
                            onAddFolder={createFolder}
                            onChooseStyle={() => setStylePickerOpen(true)}
                            onOpenDirector={(position) => setDirectorTemplateRequest({ position })}
                            onUpload={(nodeId, position) => handleUploadRequest(nodeId, position)}
                            onOpenAssets={openCanvasAssetLibrary}
                            onOpenProjectCharacters={(position) => openProjectAssets("character", position)}
                            onUndo={undoCanvas}
                            onRedo={redoCanvas}
                            onPaste={pasteAtPosition}
                            onCopyNode={(nodeId) => copyNodesToClipboard(new Set([nodeId]))}
                            onDuplicate={duplicateNode}
                            onDeleteNode={(nodeId) => deleteNodes(new Set([nodeId]))}
                            onDeleteConnection={deleteConnection}
                            onSaveAsset={(node) => {
                                void saveNodeAsset(node);
                            }}
                            onViewMedia={(node) => setPreviewNodeId(node.id)}
                            onEditText={openTextNodeEditor}
                            onOpenDrawing={openDrawingNode}
                            onGenerateImage={generateImageFromTextNode}
                            onCopyContent={(node) => {
                                void copyNodeContentToClipboard(node);
                            }}
                            onCopyMediaUrl={(node) => {
                                void copyNodeMediaUrlToClipboard(node);
                            }}
                            onUploadToArkPrivateAsset={confirmUploadNodeImageToArkPrivateAsset}
                            onSetAssetCategory={(nodeId, assetCategory) => handleConfigNodeChange(nodeId, { assetCategory })}
                            onToggleFrame={(node) => handleFrameToggle(node.id)}
                        />

                        <CanvasUploadModal open={uploadModalOpen} onClose={closeUploadModal} onUpload={handleUploadFiles} />

                        <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />

                        <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} onMetadataChange={handleConfigNodeChange} />

                        {subtitleNode ? (
                            <CanvasSubtitleDialog
                                node={subtitleNode}
                                open={Boolean(subtitleNode)}
                                projectId={projectId}
                                config={effectiveConfig}
                                onClose={() => setSubtitleNodeId(null)}
                                onSave={(nodeId, patch) => {
                                    handleConfigNodeChange(nodeId, patch);
                                    const currentTimeline = currentProject?.timeline;
                                    if (currentTimeline) {
                                        const next = syncNodeSubtitlesToTimeline(currentTimeline, nodeId, patch.subtitleEntries || []);
                                        if (next !== currentTimeline) updateProject(projectId, { timeline: next });
                                    }
                                }}
                            />
                        ) : null}

                        {frameNode ? <CanvasVideoFrameDialog node={frameNode} open={Boolean(frameNode)} onClose={closeFrameDialog} onConfirm={(params) => void extractVideoFrames(frameNode, params)} /> : null}

                        {segmentNode && segmentDialogMode ? (
                            <CanvasVideoSegmentDialog
                                node={segmentNode}
                                nodes={nodes}
                                connections={connections}
                                open={Boolean(segmentNode && segmentDialogMode)}
                                mode={segmentDialogMode}
                                config={effectiveConfig}
                                timeline={currentProject?.timeline || null}
                                onClose={closeSegmentDialog}
                                onConfirm={(params) => void handleSegmentConfirm(segmentNode, params)}
                            />
                        ) : null}

                        {timelineNode ? (
                            <CanvasTimelineDialog
                                node={timelineNode}
                                open={Boolean(timelineNode)}
                                nodes={nodes}
                                timeline={currentProject?.timeline || null}
                                onClose={() => setTimelineNodeId(null)}
                                onOpenSubtitleDialog={(subNodeId) => {
                                    setTimelineNodeId(null);
                                    setSubtitleNodeId(subNodeId);
                                }}
                                onSave={(next) => updateProject(projectId, { timeline: next })}
                                onSaveSubtitles={(subNodeId, entries) =>
                                    handleConfigNodeChange(subNodeId, {
                                        subtitleEntries: entries,
                                        ...(entries.length ? {} : { subtitleHighlights: [] }),
                                        subtitleUpdatedAt: new Date().toISOString(),
                                    })
                                }
                                onOpenAssetLibrary={openTimelineAssetLibrary}
                                onOpenProjectAssets={() => openProjectAssets("all", undefined, "timeline")}
                                onUploadLocalFiles={uploadTimelineMedia}
                                addNodeToTimelineRef={timelineAddNodeRef}
                                addMediaToTimelineRef={timelineMediaAddRef}
                                onCreateAssembledNode={createVideoNodeFromBlob}
                            />
                        ) : null}

                        <CanvasCharacterReferenceModal node={characterReferenceNode} open={Boolean(characterReferenceNode)} onClose={() => setCharacterReferenceNodeId(null)} />

                        <CanvasTextEditorModal
                            node={textEditorNode}
                            open={Boolean(textEditorNode)}
                            onClose={() => setTextEditorNodeId(null)}
                            onSave={(nodeId, title, content, richText) => {
                                setNodes((current) => current.map((node) => (node.id === nodeId ? { ...node, title, metadata: { ...node.metadata, content, richText } } : node)));
                            }}
                        />

                        {drawingNode ? (
                            <Suspense
                                fallback={
                                    <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center px-5" style={{ background: theme.canvas.background, color: theme.node.text }}>
                                        <WorkspaceState icon="loading" title="正在加载绘图编辑器" description="正在准备绘图画布。" />
                                    </div>
                                }
                            >
                                <CanvasDrawingEditorModal
                                    node={drawingNode}
                                    projectId={projectId}
                                    open={Boolean(drawingNode)}
                                    onClose={() => setDrawingNodeId(null)}
                                    onSaved={(nodeId, summary) => {
                                        setNodes((current) =>
                                            current.map((node) =>
                                                node.id === nodeId
                                                    ? {
                                                          ...node,
                                                          metadata: {
                                                              ...node.metadata,
                                                              drawingEngine: summary.engine,
                                                              drawingRevision: summary.revision,
                                                              drawingUpdatedAt: summary.updatedAt,
                                                              drawingShapeCount: summary.shapeCount,
                                                              drawingPageCount: summary.pageCount,
                                                          },
                                                      }
                                                    : node,
                                            ),
                                        );
                                        message.success("绘图已保存");
                                    }}
                                />
                            </Suspense>
                        ) : null}

                        <PortraitClearanceModal
                            projectId={projectId}
                            node={portraitClearanceNode}
                            upstreamNodes={portraitClearanceInputs}
                            open={Boolean(portraitClearanceNode)}
                            onClose={() => setPortraitClearanceNodeId(null)}
                            onUpdateState={handlePortraitClearanceStateUpdate}
                            onAddCandidate={addPortraitCandidateToCanvas}
                        />

                        <CanvasScriptEditor
                            node={activeScriptNode}
                            nodes={nodes}
                            open={Boolean(activeScriptNode)}
                            onClose={() => setScriptEditorNodeId(null)}
                            onUpdateRows={(rows) => activeScriptNode && replaceScriptRows(activeScriptNode.id, rows)}
                            onVisibleColumnsChange={(visibleColumns: StoryboardColumn[]) => {
                                if (!activeScriptNode || !visibleColumns.length) return;
                                setNodes((prev) =>
                                    prev.map((node) =>
                                        node.id === activeScriptNode.id
                                            ? { ...node, metadata: { ...node.metadata, storyboard: { rows: node.metadata?.storyboard?.rows || [], visibleColumns, referenceNodeIds: node.metadata?.storyboard?.referenceNodeIds || [] } } }
                                            : node,
                                    ),
                                );
                            }}
                            onGenerateImages={(rowIds) => activeScriptNode && void generateScriptImages(activeScriptNode.id, rowIds)}
                            onGenerateVideos={(rowIds) => {
                                if (!activeScriptNode) return;
                                if (activeScriptNode.metadata?.storyboardVideoInputMode === "keyframe") void generateScriptVideos(activeScriptNode.id, rowIds);
                                else void createAndGenerateScriptVideos(activeScriptNode.id, rowIds);
                            }}
                            onVideoInputModeChange={(storyboardVideoInputMode) => activeScriptNode && handleConfigNodeChange(activeScriptNode.id, { storyboardVideoInputMode })}
                        />

                        {directorNodeId && activeDirectorScene ? (
                            <Suspense
                                fallback={
                                    <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center px-5" style={{ background: theme.canvas.background, color: theme.node.text }}>
                                        <WorkspaceState icon="loading" title="正在加载 3D 导演台" description="准备场景、镜头与空间控制。" />
                                    </div>
                                }
                            >
                                <CanvasDirectorWorkbench
                                    open
                                    scene={activeDirectorScene}
                                    imageNodes={nodes.filter((node) => node.type === CanvasNodeType.Image && Boolean(node.metadata?.content))}
                                    onClose={() => setDirectorNodeId(null)}
                                    onChange={saveDirectorScene}
                                    onApply={applyDirectorOutput}
                                    onDeleteImageNode={(nodeId) => deleteNodes(new Set([nodeId]))}
                                    onFlush={() => flushCanvasStorePersistence()}
                                    onboardingScope={directorOnboardingScope}
                                />
                            </Suspense>
                        ) : null}

                        <CanvasVersionCompareModal
                            open={Boolean(versionCompareRootId)}
                            versions={versionCompareNodes}
                            onClose={() => setVersionCompareRootId(null)}
                            onSetPrimary={setPrimaryVersion}
                            onFocus={(nodeId) => {
                                setVersionCompareRootId(null);
                                focusCanvasNode(nodeId);
                            }}
                        />

                        <CanvasProjectMediaDialogs
                            cropNode={cropNode}
                            annotationNode={annotationNode}
                            maskEditNode={maskEditNode}
                            splitNode={splitNode}
                            upscaleNode={upscaleNode}
                            onCloseCrop={() => setCropNodeId(null)}
                            onCloseAnnotation={() => setAnnotationNodeId(null)}
                            onCloseMaskEdit={() => setMaskEditNodeId(null)}
                            onCloseSplit={() => setSplitNodeId(null)}
                            onCloseUpscale={() => setUpscaleNodeId(null)}
                            onCrop={(node, crop) => void cropImageNode(node, crop)}
                            onAnnotate={(node, dataUrl) => void saveAnnotatedImageNode(node, dataUrl)}
                            onMaskEdit={(node, payload) => void maskEditImageNode(node, payload)}
                            onSplit={(node, params) => void splitImageNode(node, params)}
                            onUpscale={(node, params) => void upscaleImageNode(node, params)}
                        />

                        <CanvasProjectStatusDialogs
                            theme={theme}
                            task={taskDetail}
                            taskLogs={taskDetailLogs}
                            taskLoading={taskDetailLoading}
                            onCloseTask={() => setTaskDetail(null)}
                            onCancelTask={cancelCanvasTask}
                            superResolveNode={superResolveNode}
                            onCloseSuperResolve={() => setSuperResolveNodeId(null)}
                            previewNode={previewNode}
                            onClosePreview={() => setPreviewNodeId(null)}
                            clearConfirmOpen={clearConfirmOpen}
                            onCancelClear={() => setClearConfirmOpen(false)}
                            onConfirmClear={clearCanvas}
                        />

                        <AssetPickerModal open={assetPickerOpen} multiple={assetInsertScope === "canvas"} onInsert={handleLibraryAssetsInsert} onClose={closeAssetPicker} />
                        <CanvasProjectAssetModal
                            open={projectAssetOpen}
                            detail={linkedProjectQuery.data}
                            initialCategory={projectAssetInitialCategory}
                            initialFolderId={projectAssetInitialFolderId}
                            onClose={closeProjectAssets}
                            onInsert={handleTimelineProjectAssetsInsert}
                            onInsertFolder={projectAssetScope === "canvas" ? handleProjectFolderInsert : undefined}
                        />
                        {codexCompactAgent && !assistantMounted ? (
                            <CanvasLocalAgentPanel headless snapshot={assistantSnapshot} canUndoOps={canUndoAgentOps} undoOpsCount={agentUndoCount} onApplyOps={applyAgentOps} onUndoOps={undoAgentOps} autoConnect={codexAutoConnect} />
                        ) : null}
                    </section>
                </CanvasOverlayLayerProvider>
            </main>
        </>
    );
}
