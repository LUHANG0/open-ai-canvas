import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { uploadMediaFile } from "@/services/file-storage";
import { readLocalRuntimeBootstrapState } from "@/services/local-runtime-bootstrap";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { summarizeCanvasContext } from "@/lib/canvas/canvas-context-summary";
import { shouldAutoConnectCanvasRuntime } from "@/lib/canvas/local-runtime-connection";
import { useAssetStore } from "@/stores/use-asset-store";
import { flushCanvasStorePersistence } from "@/stores/canvas/use-canvas-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { App } from "antd";
import type { CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { getProject } from "@/services/api/projects";
import { useFocusMode } from "@/hooks/use-focus-mode";
import { useCanvasAgentStore } from "@/stores/canvas/use-canvas-agent-store";
import { getContextResourceNodesFromIndex } from "@/lib/canvas/canvas-resource-references";
import { CanvasOverlayLayerProvider } from "@/components/canvas/canvas-overlay-layer";
import { stampCanvasNodeChanges } from "@/lib/canvas/canvas-node-timestamps";
import { batchSourceRestriction } from "@/lib/canvas/canvas-batch-connection";
import { CanvasProjectFeedbackLayer } from "./canvas-project-feedback";
import { backendProviderConfig } from "@/lib/canvas/canvas-project-generation";
import { CanvasProjectHeader, CanvasProjectNavigationSidebar } from "./canvas-project-chrome";
import { CanvasProjectContextMenu } from "./canvas-project-context-menu";
import { CanvasProjectMediaDialogs } from "./canvas-project-media-dialogs";
import { CanvasProjectBottomDock } from "./canvas-project-bottom-dock";
import { CanvasProjectMainToolbar } from "./canvas-project-main-toolbar";
import { CanvasProjectDirectorWorkbench } from "./canvas-project-director-workbench";
import { CanvasProjectEntryDialogs } from "./canvas-project-entry-dialogs";
import { renderCanvasProjectEmptyState } from "./canvas-project-empty-state";
import { CanvasProjectAssetDialogs, CanvasProjectVersionCompareDialog } from "./canvas-project-library-dialogs";
import { CanvasProjectAssistantColumn, loadCanvasAssistantPanel } from "./canvas-project-assistant-column";
import { CanvasProjectNodeEditorDialogs } from "./canvas-project-node-editor-dialogs";
import { CanvasProjectNodeOverlays } from "./canvas-project-node-overlays";
import { CanvasProjectNodeToolbar } from "./canvas-project-node-toolbar";
import { CanvasProjectNodeSearch } from "./canvas-project-node-search";
import { CanvasProjectScriptEditor } from "./canvas-project-script-editor";
import { CanvasProjectTimelineDialogs } from "./canvas-project-timeline-dialogs";
import { CanvasProjectSelectionToolbarOverlay } from "./canvas-project-selection-toolbar";
import { CanvasProjectStatusDialogs } from "./canvas-project-status-dialogs";
import { CanvasProjectWorkspaceOverlays } from "./canvas-project-workspace-overlays";
import { CanvasProjectShortDramaGuide, CanvasProjectWorkspaceModeSwitch } from "./canvas-project-workspace-chrome";
import { CanvasProjectViewport } from "./canvas-project-viewport";
import { CanvasProjectHeadlessAgent, CanvasProjectUtilityDialogs } from "./canvas-project-utility-overlays";
import type { CanvasNodeGraphContextValue } from "@/components/canvas/canvas-node-graph-context";
import { CanvasRefreshShell } from "./canvas-refresh-shell";
import { useCanvasConnectionController } from "./use-canvas-connection-controller";
import { useCanvasContextInteractions } from "./use-canvas-context-interactions";
import { useCanvasAgentOperations, useCanvasAssistantSnapshot } from "./use-canvas-agent-operations";
import { useCanvasAssistantVisibility } from "./use-canvas-assistant-visibility";
import { useCanvasActiveTasks } from "./use-canvas-active-tasks";
import { useCanvasAssetHandoff } from "./use-canvas-asset-handoff";
import { useCanvasAssetInsertion } from "./use-canvas-asset-insertion";
import { useCanvasStyleWorkflow } from "./use-canvas-style-workflow";
import { useCanvasDirector } from "./use-canvas-director";
import { useCanvasDeletedNodeCleanup } from "./use-canvas-deleted-node-cleanup";
import { useCanvasGeneration } from "./use-canvas-generation";
import { useCanvasGenerationBatches } from "./use-canvas-generation-batches";
import { useCanvasGenerationExecutor, type CanvasNodeGenerationOptions } from "./use-canvas-generation-executor";
import { useCanvasGenerationRetry } from "./use-canvas-generation-retry";
import { useCanvasHistory } from "./use-canvas-history";
import { useCanvasHistoryUiCleanup } from "./use-canvas-history-ui-cleanup";
import { useCanvasKeyboard } from "./use-canvas-keyboard";
import { useCanvasMediaTools } from "./use-canvas-media-tools";
import { useCanvasNodeEditor } from "./use-canvas-node-editor";
import { useCanvasNodeActionBindings } from "./use-canvas-node-action-bindings";
import { useCanvasNodeFocus } from "./use-canvas-node-focus";
import { useCanvasNodeHoverToolbar } from "./use-canvas-node-hover-toolbar";
import { useCanvasNodeOperations } from "./use-canvas-node-operations";
import { useCanvasNodeContentRenderer } from "./use-canvas-node-content-renderer";
import { useCanvasNodePanelRenderer } from "./use-canvas-node-panel-renderer";
import { useCanvasNodeReferences } from "./use-canvas-node-references";
import { useCanvasNodeRetry } from "./use-canvas-node-retry";
import { useCanvasNodeSharing } from "./use-canvas-node-sharing";
import { useCanvasTextToImage } from "./use-canvas-text-to-image";
import { useCanvasLinkedProjectAssetSync, useCanvasLinkedProjectFolderInteractions } from "./use-canvas-linked-project-assets";
import { useCanvasLinkedProjectStyle } from "./use-canvas-linked-project-style";
import { useCanvasLiveProject } from "./use-canvas-live-project";
import { useCanvasTitleEditing, useCanvasWorkspacePreferences, useCanvasWorkspaceTransitions } from "./use-canvas-workspace-shell";
import { useCanvasProjectImport } from "./use-canvas-project-import";
import { useCanvasProjectLifecycle } from "./use-canvas-project-lifecycle";
import { useCanvasRenderModel } from "./use-canvas-render-model";
import { useCanvasSelectionController } from "./use-canvas-selection-controller";
import { useCanvasShortDrama } from "./use-canvas-short-drama";
import { useCanvasStoryboard } from "./use-canvas-storyboard";
import { useCanvasUpload } from "./use-canvas-upload";
import { useCanvasViewportController } from "./use-canvas-viewport-controller";
import { useCanvasViewportMeasurement } from "./use-canvas-viewport-measurement";
import { useCanvasPortraitClearance } from "./use-canvas-portrait-clearance";
import "./canvas-editor-pc.css";
import {
    CanvasNodeType,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasNodeData,
    type CanvasWorkflowKind,
    type CanvasToolMode,
    type ContextMenuState,
    type Position,
    type ViewportTransform,
} from "@/types/canvas";
import type { ReferenceImage } from "@/types/image";

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
    const localAgentConnected = useCanvasAgentStore((state) => state.connected);
    const localAgentActivity = useCanvasAgentStore((state) => state.activity);
    const localAgentEnabled = useCanvasAgentStore((state) => state.enabled);
    const containerRef = useRef<HTMLDivElement>(null);
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

    const { connectionsRef, selectedNodeIdsRef, viewportRef, handleAssistantSessionsChange } = useCanvasLiveProject({
        projectId,
        nodesRef,
        nodes,
        connections,
        chatSessions,
        activeChatId,
        selectedNodeIds,
        viewport,
        setNodes,
        setConnections,
        setChatSessions,
        setActiveChatId,
    });
    const size = useCanvasViewportMeasurement({ projectId, projectLoaded, containerRef, viewportRef, setViewport });
    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, options?: CanvasNodeGenerationOptions) => Promise<void>) | null>(null);
    const historyRestoreUiRef = useRef<() => void>(() => undefined);

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

    useCanvasWorkspaceTransitions({
        projectLoaded,
        autoConnect: codexAutoConnect,
        compactAgent: codexCompactAgent,
        focusMode,
        openAgent,
        closeAgent,
        setAgentMode,
        setIsMiniMapOpen,
        setFocusDockRevealed,
    });

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

    useCanvasLinkedProjectStyle({ projectLoaded, project: linkedProjectQuery.data?.project, nodesRef, getCanvasCenter, setNodes });

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

    const handleNodesDeleted = useCanvasDeletedNodeCleanup({
        projectId,
        chatSessions,
        cleanupCanvasFiles,
        setHoveredNodeId,
        setToolbarNodeId,
        setDialogNodeId,
        setTextEditorNodeId,
        setCharacterReferenceNodeId,
        setDrawingNodeId,
        setInfoNodeId,
        setSubtitleNodeId,
        setFrameDialogNodeId,
        setSegmentDialogNodeId,
        setCropNodeId,
        setMaskEditNodeId,
        setAnnotationNodeId,
        setSplitNodeId,
        setUpscaleNodeId,
        setAngleNodeId,
        setEmotionNodeId,
        setSuperResolveNodeId,
        setPreviewNodeId,
        setRunningNodeId,
        setScriptEditorNodeId,
        setPortraitClearanceNodeId,
        setDirectorNodeId,
        setVersionCompareRootId,
        setScriptScrollTopById,
        setContextMenu,
    });

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

    useCanvasHistoryUiCleanup({
        historyRestoreUiRef,
        resetNodeHoverToolbar,
        resetters: {
            dialog: setDialogNodeId,
            textEditor: setTextEditorNodeId,
            characterReference: setCharacterReferenceNodeId,
            drawing: setDrawingNodeId,
            info: setInfoNodeId,
            subtitle: setSubtitleNodeId,
            timeline: setTimelineNodeId,
            superResolve: setSuperResolveNodeId,
            preview: setPreviewNodeId,
            scriptEditor: setScriptEditorNodeId,
            portraitClearance: setPortraitClearanceNodeId,
            director: setDirectorNodeId,
            versionCompare: setVersionCompareRootId,
            frameDialog: setFrameDialogNodeId,
            segmentDialog: setSegmentDialogNodeId,
            crop: setCropNodeId,
            maskEdit: setMaskEditNodeId,
            annotation: setAnnotationNodeId,
            split: setSplitNodeId,
            upscale: setUpscaleNodeId,
            angle: setAngleNodeId,
            emotion: setEmotionNodeId,
        },
    });

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
    // 高频视口变化通过 getter 读取，不迫使整个 Agent 树跟随重渲染。
    const assistantSnapshot = useCanvasAssistantSnapshot(agentSnapshot, selectedNodeIds, viewportRef);

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

    const renderCanvasNodePanel = useCanvasNodePanelRenderer({
        configInputsById,
        skillMentionReferences,
        mentionReferencesByNodeId,
        runningNodeId,
        workspaceMode,
        setDialogNodeId,
        onConfigChange: handleConfigNodeChange,
        onGenerate: handleGenerateNode,
        onImageSettingsOpenChange: handleNodeImageSettingsOpenChange,
        onNodeMouseDown: handleNodeMouseDown,
        onPromptChange: handleNodePromptChange,
        onRemoveReference: handleRemoveNodeReference,
    });

    const renderCanvasNodeContent = useCanvasNodeContentRenderer({
        nodesRef,
        connectionsRef,
        configInputsById,
        mentionReferencesByNodeId,
        directorScenes: currentProject?.directorScenes,
        runningNodeId,
        viewportScale: viewport.k,
        workspaceMode,
        setDialogNodeId,
        setScriptEditorNodeId,
        setScriptScrollTopById,
        setStylePickerOpen,
        openStoryInput,
        openDirectorWorkbench,
        onConfigChange: handleConfigNodeChange,
        onGenerateNode: handleGenerateNode,
        onNodeResize: handleNodeResize,
        onConnectStart: handleConnectStart,
        addScriptRow,
        removeScriptRow,
        updateScriptRow,
        createScriptImageNodes,
        createScriptVideoNodes,
        createScriptActionBoards,
        generateScriptImages,
        generateScriptVideos,
        createAndGenerateScriptVideos,
        generateScriptRows,
        mergeVideosByIds,
        retryFailedBatchItems,
        stopRemainingBatchItems,
    });

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
    const emptyCanvasState = renderCanvasProjectEmptyState({
        nodeCount: nodes.length,
        shortDramaEnabled,
        linkedProjectId: currentProject?.projectId,
        projectTitle: currentProject?.title || "未命名画布",
        linkedProjectName: linkedProjectQuery.data?.project.name,
        chapters: linkedProjectQuery.data?.units,
        onUpload: () => handleUploadRequest(),
        onAddText: () => createNode(CanvasNodeType.Text),
        onAddScript: () => createNode(CanvasNodeType.Script),
        onCreatePipeline: createShortDramaPipeline,
        onOpenAgent: () => {
            setCinematicAgentEntry(true);
            setAgentMode("online");
            openAgent("online");
        },
        onOpenAssets: openProjectAssets,
        onInsertProjectChapter: handleProjectChapterInsert,
    });
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
                <CanvasProjectNavigationSidebar
                    focusMode={focusMode}
                    shortDramaEnabled={shortDramaEnabled}
                    projectId={currentProject?.projectId || ""}
                    detail={linkedProjectQuery.data}
                    onAddChapter={handleProjectChapterInsert}
                    onLocateStyle={locateProjectStyleNode}
                    onOpenAssets={openProjectAssets}
                />
                <CanvasOverlayLayerProvider>
                    <section className="pc-canvas-workspace__stage relative min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden">
                        <CanvasProjectHeader
                            focusMode={focusMode}
                            shortDramaEnabled={shortDramaEnabled}
                            linkedProjectId={currentProject?.projectId}
                            linkedProjectName={linkedProjectQuery.data?.project.name || currentProject?.title || "未命名项目"}
                            context={canvasContext}
                            topBar={{
                                title: currentProject?.title || "未命名画布",
                                titleDraft,
                                isTitleEditing: titleEditing,
                                onTitleDraftChange: setTitleDraft,
                                onStartTitleEditing: startTitleEditing,
                                onFinishTitleEditing: finishTitleEditing,
                                onCancelTitleEditing: cancelTitleEditing,
                                canUndo: historyState.canUndo,
                                canRedo: historyState.canRedo,
                                onCreateProject: createAndOpenProject,
                                onDeleteProject: deleteCurrentProject,
                                onImportImage: () => handleUploadRequest(),
                                onImportLibTV: () => setLibTVImportOpen(true),
                                onImportTapNow: () => setTapNowImportOpen(true),
                                onUndo: undoCanvas,
                                onRedo: redoCanvas,
                                onShare: () => setShareModalOpen(true),
                                agentOpen: assistantOpen,
                                compactAgentStatus: codexCompactAgent ? { connected: localAgentConnected, enabled: localAgentEnabled, activity: localAgentActivity } : undefined,
                                onToggleAgent: () => (assistantOpen ? closeAgent() : openAgent()),
                                shortcutRequestNonce,
                                mediaPerformanceMode,
                                mediaRenderTier: mediaRenderPolicy.tier,
                                onMediaPerformanceModeChange: setMediaPerformanceMode,
                                onOpenSearch: () => setNodeSearchOpen(true),
                                saveStatus,
                                onRetrySave: () => void saveCanvasProject(),
                                onEnterFocusMode: enterFocusMode,
                                shortDramaGuide,
                            }}
                        />

                        <CanvasProjectWorkspaceModeSwitch
                            focusMode={focusMode}
                            assistantOpen={assistantOpen}
                            assistantWidth={assistantWidth}
                            workspaceMode={workspaceMode}
                            onWorkspaceModeChange={setWorkspaceMode}
                        />

                        <CanvasProjectNodeSearch
                            open={nodeSearchOpen}
                            nodes={nodes}
                            nodeById={nodeById}
                            selectedNodeIdsRef={selectedNodeIdsRef}
                            setSelectedNodeIds={setSelectedNodeIds}
                            setSelectedConnectionId={setSelectedConnectionId}
                            onClose={() => setNodeSearchOpen(false)}
                            onToggleFrame={toggleFrameCollapsed}
                            onToggleBatch={toggleBatchExpanded}
                            onFocusNode={focusCanvasNode}
                        />

                        <CanvasProjectShortDramaGuide
                            focusMode={focusMode}
                            guide={shortDramaGuide}
                            onSkip={skipShortDramaGuide}
                            onStepClick={activateShortDramaStep}
                        />

                        <CanvasProjectEntryDialogs
                            projectId={projectId}
                            viewport={viewport}
                            viewportSize={size}
                            shareOpen={shareModalOpen}
                            onCloseShare={() => setShareModalOpen(false)}
                            beforeCreateShare={saveCanvasProject}
                            libTVImportOpen={libTVImportOpen}
                            onCloseLibTVImport={() => setLibTVImportOpen(false)}
                            onApplyLibTVImport={applyLibTVImport}
                            tapNowImportOpen={tapNowImportOpen}
                            onCloseTapNowImport={() => setTapNowImportOpen(false)}
                            onApplyTapNowImport={applyTapNowImport}
                            stylePickerOpen={stylePickerOpen}
                            styleValue={activeStylePresetId}
                            styleApplying={styleApplying}
                            onCloseStylePicker={() => setStylePickerOpen(false)}
                            onSelectStyle={selectCanvasStyle}
                            directorTemplateRequest={directorTemplateRequest}
                            onCloseDirectorTemplate={() => setDirectorTemplateRequest(null)}
                            onCreateDirectorShot={createDirectorShot}
                        />

                        <div className="pc-canvas-workspace__body relative flex min-h-0 min-w-0 flex-1">
                            <div className="pc-canvas-workspace__viewport relative min-w-0 flex-1 overflow-hidden">
                                <CanvasProjectViewport
                                    canvas={{
                                        containerRef,
                                        viewport,
                                        backgroundMode,
                                        onViewportChange: handleViewportChange,
                                        onViewportPreviewChange: handleViewportPreviewChange,
                                        onCanvasMouseDown: handleCanvasMouseDown,
                                        boxSelectEnabled: canvasTool === "box-select",
                                        onCanvasDoubleClick: handleCanvasDoubleClick,
                                        onCanvasDeselect: handleCanvasBlankClick,
                                        onContextMenu: handleCanvasContextMenu,
                                        onDrop: handleDrop,
                                        onFileDragEnter: handleFileDragEnter,
                                        onFileDragLeave: handleFileDragLeave,
                                        onFileDragOver: handleFileDragOver,
                                    }}
                                    graphics={{
                                        containerRef,
                                        viewport,
                                        theme,
                                        displayConnections,
                                        selectedConnectionId,
                                        relatedConnectionIds: relatedHighlight.connectionIds,
                                        scriptScrollTopById,
                                        connectingParams,
                                        batchConnectionPreview,
                                        mouseWorld,
                                        connectionTargetNodeId,
                                        connectionTargetAnchorRatio,
                                        nodeById,
                                        selectionBox,
                                        selectedNodeBounds,
                                        alignmentGuides,
                                    }}
                                    nodeActions={canvasNodeActions}
                                    nodeGraph={nodeGraphContext}
                                    world={{
                                        projectId,
                                        viewportScale: viewport.k,
                                        connectionLayerBounds,
                                        displayConnections,
                                        selectedConnectionId,
                                        relatedConnectionIds: relatedHighlight.connectionIds,
                                        scriptScrollTopById,
                                        connectingParams,
                                        mouseWorld,
                                        connectionTargetNodeId,
                                        nodeById,
                                        visibleNodes,
                                        frameChildrenById,
                                        linkedFolderPreviewNodesById,
                                        dragPreview,
                                        selectedNodeIds,
                                        frameDropTargetId,
                                        relatedNodeIds: relatedHighlight.nodeIds,
                                        activeNodeId,
                                        selectionBox,
                                        batchChildCountById,
                                        collapsingBatchIds,
                                        openingBatchIds,
                                        batchMotionById,
                                        showImageInfo,
                                        reduceMediaEffects,
                                        mediaRenderPolicy,
                                        resourceReferenceByNodeId,
                                        mentionReferencesByNodeId,
                                        mediaEffectsDisabledNodeId: emotionNodeId,
                                        selectedNodeBounds,
                                        batchSourceNodeIds,
                                        batchConnectionPreview,
                                        isNodeDragging,
                                        selectionBoundsElementRef,
                                        renderCanvasNodeContent,
                                        onConnectionSelect: handleConnectionSelect,
                                        onConnectionContextMenu: handleConnectionContextMenu,
                                        onNodeMouseDown: handleNodeMouseDown,
                                        onNodeHoverStart: handleCanvasNodeHoverStart,
                                        onNodeHoverEnd: handleCanvasNodeHoverEnd,
                                        onConnectStart: handleConnectStart,
                                        onNodeResize: handleNodeResize,
                                        onToggleFrame: handleFrameToggle,
                                        onFolderStyleChange: handleFolderStyleChange,
                                        onFolderThemeChange: handleFolderThemeChange,
                                        onNodeTitleChange: handleNodeTitleChange,
                                        onNodeContextMenu: handleNodeContextMenu,
                                        onNodeContentChange: handleNodeContentChange,
                                        onToggleBatch: toggleBatchExpanded,
                                        onSetBatchPrimary: setBatchPrimary,
                                        onRetry: retryCanvasNode,
                                        onReloadResource: reloadCanvasNodeResource,
                                        onOpenTaskDetails: openCanvasNodeTaskDetails,
                                        onOpenVersions: openCanvasNodeVersions,
                                        onViewImage: viewCanvasNodeImage,
                                        onReplaceMedia: replaceCanvasNodeMedia,
                                        onOpenTextEditor: openTextNodeEditor,
                                        onOpenDirector: editCanvasDirector,
                                        onOpenDrawing: openDrawingNode,
                                        onStartBatchConnection: startBatchConnection,
                                    }}
                                />

                                <CanvasProjectWorkspaceOverlays
                                    activeTasks={activeTasks}
                                    onCancelTask={cancelCanvasTask}
                                    focusMode={focusMode}
                                    focusDockRevealed={focusDockRevealed}
                                    assistantOpen={assistantOpen}
                                    assistantWidth={assistantWidth}
                                    zoomScale={viewport.k}
                                    onToggleFocusDock={() => setFocusDockRevealed((value) => !value)}
                                    onOpenAgent={openAgent}
                                    onCloseAgent={closeAgent}
                                    onExitFocusMode={exitFocusMode}
                                    onZoomIn={zoomCanvasIn}
                                    onZoomOut={zoomCanvasOut}
                                    onFitContent={fitCanvasContent}
                                    fileDropActive={fileDropActive}
                                    theme={theme}
                                    emptyCanvasState={emptyCanvasState}
                                />

                                <CanvasProjectMainToolbar
                                    focusMode={focusMode}
                                    focusDockRevealed={focusDockRevealed}
                                    assistantOpen={assistantOpen}
                                    assistantWidth={assistantWidth}
                                    selectedNodeIds={selectedNodeIds}
                                    workspaceMode={workspaceMode}
                                    canvasTool={canvasTool}
                                    projectLinked={Boolean(shortDramaEnabled && currentProject?.projectId)}
                                    canUndo={historyState.canUndo}
                                    canRedo={historyState.canRedo}
                                    backgroundMode={backgroundMode}
                                    showImageInfo={showImageInfo}
                                    onToolChange={setCanvasTool}
                                    onCreateNode={createNode}
                                    onCreateFolder={createFolder}
                                    onChooseStyle={() => setStylePickerOpen(true)}
                                    onOpenDirector={() => setDirectorTemplateRequest({})}
                                    onUndo={undoCanvas}
                                    onRedo={redoCanvas}
                                    onUpload={() => handleUploadRequest()}
                                    onDeleteNodes={deleteNodes}
                                    onClear={() => setClearConfirmOpen(true)}
                                    onDeselect={deselectCanvas}
                                    onBackgroundModeChange={setBackgroundMode}
                                    onShowImageInfoChange={setShowImageInfo}
                                    onOpenMyAssets={openCanvasAssetLibrary}
                                    onOpenProjectCharacters={() => openProjectAssets("character")}
                                />
                            </div>

                            <CanvasProjectAssistantColumn
                                mounted={assistantMounted}
                                width={assistantWidth}
                                closing={assistantClosing}
                                focusMode={focusMode}
                                onWidthChange={setAssistantWidth}
                                panelProps={{
                                    nodes,
                                    selectedNodeIds,
                                    snapshot: assistantSnapshot,
                                    projectId,
                                    sessions: chatSessions,
                                    activeSessionId: activeChatId,
                                    onSelectNodeIds: setSelectedNodeIds,
                                    onSessionsChange: handleAssistantSessionsChange,
                                    onApplyOps: applyAgentOps,
                                    canUndoOps: canUndoAgentOps,
                                    undoOpsCount: agentUndoCount,
                                    onUndoOps: undoAgentOps,
                                    onPasteImage: pasteAssistantImage,
                                    agentMode,
                                    onAgentModeChange: setAgentMode,
                                    autoConnectLocal: codexAutoConnect,
                                    onCollapse: closeAgent,
                                    cinematicEntry: cinematicAgentEntry,
                                    onCinematicEntryConsumed: consumeCinematicAgentEntry,
                                }}
                            />
                        </div>

                        <CanvasProjectNodeOverlays
                            angleNode={angleNode}
                            emotionNode={emotionNode}
                            dialogNode={dialogNode}
                            viewport={viewport}
                            viewportSize={size}
                            containerRef={containerRef}
                            dragPreview={dragPreview}
                            isNodeDragging={isNodeDragging}
                            selectionActive={Boolean(selectionBox)}
                            renderNodePanel={renderCanvasNodePanel}
                            onCloseAngle={() => setAngleNodeId(null)}
                            onGenerateAngle={generateAngleNode}
                            onCloseEmotion={() => setEmotionNodeId(null)}
                            onGenerateEmotion={generateEmotionNode}
                            pendingConnectionCreate={pendingConnectionCreate}
                            canCreateDrawingFromConnection={canCreateDrawingFromConnection}
                            getConnectionCreateDisabledReason={getConnectionCreateDisabledReason}
                            onCreateConnectedNode={createConnectedNode}
                            onCloseConnectionCreate={cancelPendingConnectionCreate}
                        />

                        <CanvasProjectSelectionToolbarOverlay
                            anchorRef={selectionBoundsElementRef}
                            containerRef={containerRef}
                            selectionCount={selectedNodeBounds?.count ?? null}
                            selectionBoxActive={Boolean(selectionBox)}
                            nodeDragging={isNodeDragging}
                            selectedNodeIds={selectedNodeIds}
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
                            onBeginBatchConnection={beginBatchConnectionMode}
                            onMergeSelectedVideos={mergeSelectedVideos}
                        />

                        <CanvasProjectFeedbackLayer
                            uploadStatus={uploadStatus}
                            mergeVideoProgress={mergeVideoProgress}
                            agentChange={lastAgentChange}
                            theme={theme}
                            onViewAgentChange={viewLastAgentChange}
                            onUndoAgentChange={undoAgentOps}
                            onCloseAgentChange={dismissLastAgentChange}
                        />

                        <CanvasProjectNodeToolbar
                            node={toolbarNode}
                            blocked={Boolean(isNodeDragging || nodeImageSettingsOpen || emotionNodeId)}
                            workspaceMode={workspaceMode}
                            viewport={viewport}
                            containerRef={containerRef}
                            onKeep={keepNodeToolbar}
                            onLeave={hideNodeToolbar}
                            setters={{
                                info: setInfoNodeId,
                                dialog: setDialogNodeId,
                                annotation: setAnnotationNodeId,
                                maskEdit: setMaskEditNodeId,
                                emotion: setEmotionNodeId,
                                crop: setCropNodeId,
                                split: setSplitNodeId,
                                upscale: setUpscaleNodeId,
                                superResolve: setSuperResolveNodeId,
                                angle: setAngleNodeId,
                                preview: setPreviewNodeId,
                                subtitle: setSubtitleNodeId,
                                timeline: setTimelineNodeId,
                            }}
                            actions={{
                                editText: openTextNodeEditor,
                                changeFontSize: handleFontSizeChange,
                                generateImage: generateImageFromTextNode,
                                uploadNode: (nodeId) => handleUploadRequest(nodeId),
                                downloadNode: downloadNodeImage,
                                saveAsset: saveNodeAsset,
                                openPortraitTexture: openPortraitTextureEditor,
                                extractVideoFrames: openVideoFrameExtractor,
                                extractAudioFromVideo,
                                trimVideoSegments: openVideoSegmentExtractor,
                                reversePrompt: createImageReversePromptNodes,
                                retryNode: retryCanvasNode,
                                toggleFreeResize: toggleNodeFreeResize,
                                toggleLocked: toggleNodeLocked,
                                deleteNodes,
                            }}
                            extractingVideoFrames={toolbarNode?.id === extractingVideoFramesNodeId}
                            extractingAudio={segmentRunningMode === "audio"}
                            trimmingVideo={segmentRunningMode === "video"}
                        />

                        <CanvasProjectBottomDock
                            focusMode={focusMode}
                            isMiniMapOpen={isMiniMapOpen}
                            nodes={nodes}
                            viewport={viewport}
                            viewportSize={size}
                            containerRef={containerRef}
                            selectedNodeIds={selectedNodeIds}
                            assetImages={imageAssets}
                            canvasImages={canvasImageNodes}
                            projectLinked={Boolean(currentProject?.projectId)}
                            onViewportPreviewChange={previewViewport}
                            onViewportChange={handleViewportChange}
                            onScaleChange={setZoomScale}
                            onFitContent={fitCanvasContent}
                            onAutoArrange={autoArrangeCanvasNodes}
                            onDismissContextMenu={() => setContextMenu(null)}
                            onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)}
                            onOpenShortcuts={() => setShortcutRequestNonce((value) => value + 1)}
                            onInsertAssetImage={(asset) => void createImageAssetNode(asset)}
                            onFocusCanvasImage={focusCanvasImageNode}
                        />

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
                            onAddNode={createNode}
                            onAddFolder={createFolder}
                            onChooseStyle={() => setStylePickerOpen(true)}
                            onOpenDirector={(position) => setDirectorTemplateRequest({ position })}
                            onUpload={handleUploadRequest}
                            onOpenAssets={openCanvasAssetLibrary}
                            onOpenProjectCharacters={(position) => openProjectAssets("character", position)}
                            onUndo={undoCanvas}
                            onRedo={redoCanvas}
                            onPaste={pasteAtPosition}
                            onCopyNodes={copyNodesToClipboard}
                            onDuplicate={duplicateNode}
                            onDeleteNodes={deleteNodes}
                            onDeleteConnection={deleteConnection}
                            onSaveAsset={saveNodeAsset}
                            onPreviewNode={setPreviewNodeId}
                            onEditText={openTextNodeEditor}
                            onOpenDrawing={openDrawingNode}
                            onGenerateImage={generateImageFromTextNode}
                            onCopyContent={copyNodeContentToClipboard}
                            onCopyMediaUrl={copyNodeMediaUrlToClipboard}
                            onUploadToArkPrivateAsset={confirmUploadNodeImageToArkPrivateAsset}
                            onSetAssetCategory={(nodeId, assetCategory) => handleConfigNodeChange(nodeId, { assetCategory })}
                            onToggleFrame={handleFrameToggle}
                        />

                        <CanvasProjectUtilityDialogs
                            upload={{ open: uploadModalOpen, onClose: closeUploadModal, onUpload: handleUploadFiles }}
                            fileInputRef={imageInputRef}
                            onFileInputChange={handleImageInputChange}
                            info={{ node: infoNode, open: Boolean(infoNode), onClose: () => setInfoNodeId(null), onMetadataChange: handleConfigNodeChange }}
                        />

                        <CanvasProjectTimelineDialogs
                            projectId={projectId}
                            config={effectiveConfig}
                            nodes={nodes}
                            connections={connections}
                            timeline={currentProject?.timeline || null}
                            subtitleNode={subtitleNode}
                            frameNode={frameNode}
                            segmentNode={segmentNode}
                            segmentDialogMode={segmentDialogMode}
                            timelineNode={timelineNode}
                            onCloseSubtitle={() => setSubtitleNodeId(null)}
                            onUpdateNodeMetadata={handleConfigNodeChange}
                            onUpdateTimeline={(next) => updateProject(projectId, { timeline: next })}
                            onCloseFrame={closeFrameDialog}
                            onExtractVideoFrames={extractVideoFrames}
                            onCloseSegment={closeSegmentDialog}
                            onConfirmVideoSegment={handleSegmentConfirm}
                            onCloseTimeline={() => setTimelineNodeId(null)}
                            onOpenSubtitle={setSubtitleNodeId}
                            onOpenAssetLibrary={openTimelineAssetLibrary}
                            onOpenProjectAssets={() => openProjectAssets("all", undefined, "timeline")}
                            onUploadLocalFiles={uploadTimelineMedia}
                            addNodeToTimelineRef={timelineAddNodeRef}
                            addMediaToTimelineRef={timelineMediaAddRef}
                            onCreateAssembledNode={createVideoNodeFromBlob}
                        />

                        <CanvasProjectNodeEditorDialogs
                            projectId={projectId}
                            theme={theme}
                            characterReferenceNode={characterReferenceNode}
                            textEditorNode={textEditorNode}
                            drawingNode={drawingNode}
                            portraitClearanceNode={portraitClearanceNode}
                            portraitClearanceInputs={portraitClearanceInputs}
                            setNodes={setNodes}
                            onCloseCharacterReference={() => setCharacterReferenceNodeId(null)}
                            onCloseTextEditor={() => setTextEditorNodeId(null)}
                            onCloseDrawing={() => setDrawingNodeId(null)}
                            onClosePortraitClearance={() => setPortraitClearanceNodeId(null)}
                            onUpdatePortraitClearance={handlePortraitClearanceStateUpdate}
                            onAddPortraitCandidate={addPortraitCandidateToCanvas}
                        />

                        <CanvasProjectScriptEditor
                            node={activeScriptNode}
                            nodes={nodes}
                            setNodes={setNodes}
                            onClose={() => setScriptEditorNodeId(null)}
                            onUpdateRows={replaceScriptRows}
                            onGenerateImages={generateScriptImages}
                            onGenerateKeyframeVideos={generateScriptVideos}
                            onCreateAndGenerateVideos={createAndGenerateScriptVideos}
                            onVideoInputModeChange={(nodeId, storyboardVideoInputMode) => handleConfigNodeChange(nodeId, { storyboardVideoInputMode })}
                        />

                        <CanvasProjectDirectorWorkbench
                            open={Boolean(directorNodeId && activeDirectorScene)}
                            scene={activeDirectorScene}
                            nodes={nodes}
                            theme={theme}
                            onboardingScope={directorOnboardingScope}
                            onClose={() => setDirectorNodeId(null)}
                            onChange={saveDirectorScene}
                            onApply={applyDirectorOutput}
                            onDeleteImageNode={(nodeId) => deleteNodes(new Set([nodeId]))}
                            onFlush={() => flushCanvasStorePersistence()}
                        />

                        <CanvasProjectVersionCompareDialog
                            open={Boolean(versionCompareRootId)}
                            versions={versionCompareNodes}
                            onClose={() => setVersionCompareRootId(null)}
                            onSetPrimary={setPrimaryVersion}
                            onFocus={focusCanvasNode}
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

                        <CanvasProjectAssetDialogs
                            assetPickerOpen={assetPickerOpen}
                            assetInsertScope={assetInsertScope}
                            onInsertLibraryAssets={handleLibraryAssetsInsert}
                            onCloseAssetPicker={closeAssetPicker}
                            projectAssetOpen={projectAssetOpen}
                            projectDetail={linkedProjectQuery.data}
                            projectAssetInitialCategory={projectAssetInitialCategory}
                            projectAssetInitialFolderId={projectAssetInitialFolderId}
                            projectAssetScope={projectAssetScope}
                            onCloseProjectAssets={closeProjectAssets}
                            onInsertProjectAssets={handleTimelineProjectAssetsInsert}
                            onInsertProjectFolder={handleProjectFolderInsert}
                        />
                        <CanvasProjectHeadlessAgent
                            compactAgent={codexCompactAgent}
                            assistantMounted={assistantMounted}
                            panel={{ snapshot: assistantSnapshot, canUndoOps: canUndoAgentOps, undoOpsCount: agentUndoCount, onApplyOps: applyAgentOps, onUndoOps: undoAgentOps, autoConnect: codexAutoConnect }}
                        />
                    </section>
                </CanvasOverlayLayerProvider>
            </main>
        </>
    );
}
