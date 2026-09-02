import { useCallback, type Dispatch, type MutableRefObject, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";

import { CanvasCharacterReferenceNodeContent } from "@/components/canvas/canvas-character-reference-node";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import type { NodeGenerationInput } from "@/components/canvas/canvas-node-generation";
import type { CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { CanvasScriptNodeContent } from "@/components/canvas/canvas-script-node";
import { CanvasStoryInputNodeContent, CanvasStylePlaceholderNodeContent } from "@/components/canvas/canvas-short-drama-entry";
import { CanvasDirectorNodePanel } from "@/components/canvas/director/canvas-director-node-panel";
import { getInputSummary } from "@/lib/canvas/canvas-project-domain";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { storyboardMinNodeHeight } from "@/lib/canvas/canvas-storyboard-layout";
import { deriveStoryboardPipelineProgress } from "@/lib/canvas/canvas-storyboard-progress";
import type { DirectorScene } from "@/types/director";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata, CanvasWorkspaceMode, StoryboardRow } from "@/types/canvas";
import { canvasNodeContentKind } from "./canvas-node-content-routing";

function visibleGenerationBatch(node: CanvasNodeData) {
    const batches = node.metadata?.generationBatches || [];
    for (let index = batches.length - 1; index >= 0; index -= 1) {
        if (batches[index].status === "queued" || batches[index].status === "running") return batches[index];
    }
    return batches.at(-1);
}

type UseCanvasNodeContentRendererOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    configInputsById: ReadonlyMap<string, NodeGenerationInput[]>;
    mentionReferencesByNodeId: ReadonlyMap<string, CanvasResourceReference[]>;
    directorScenes?: DirectorScene[];
    runningNodeId: string | null;
    viewportScale: number;
    workspaceMode: CanvasWorkspaceMode;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setScriptEditorNodeId: Dispatch<SetStateAction<string | null>>;
    setScriptScrollTopById: Dispatch<SetStateAction<Record<string, number>>>;
    setStylePickerOpen: Dispatch<SetStateAction<boolean>>;
    openStoryInput: (nodeId: string) => void;
    openDirectorWorkbench: (nodeId: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerateNode: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => unknown;
    onNodeResize: (nodeId: string, width: number, height: number) => void;
    onConnectStart: (event: ReactPointerEvent, nodeId: string, handleType: "source" | "target", handleId?: string) => void;
    addScriptRow: (nodeId: string) => void;
    removeScriptRow: (nodeId: string, rowId: string) => void;
    updateScriptRow: (nodeId: string, rowId: string, patch: Partial<StoryboardRow>) => void;
    createScriptImageNodes: (nodeId: string) => unknown;
    createScriptVideoNodes: (nodeId: string) => unknown;
    createScriptActionBoards: (nodeId: string) => unknown;
    generateScriptImages: (nodeId: string, rowIds: string[]) => unknown;
    generateScriptVideos: (nodeId: string, rowIds: string[]) => unknown;
    createAndGenerateScriptVideos: (nodeId: string, rowIds: string[]) => unknown;
    generateScriptRows: (nodeId: string, prompt: string) => unknown;
    mergeVideosByIds: (nodeIds: string[]) => unknown;
    retryFailedBatchItems: (nodeId: string, batchId: string, itemId?: string) => void;
    stopRemainingBatchItems: (nodeId: string, batchId: string) => void;
};

export function useCanvasNodeContentRenderer(options: UseCanvasNodeContentRendererOptions) {
    const {
        nodesRef,
        connectionsRef,
        configInputsById,
        mentionReferencesByNodeId,
        directorScenes,
        runningNodeId,
        viewportScale,
        workspaceMode,
        setDialogNodeId,
        setScriptEditorNodeId,
        setScriptScrollTopById,
        setStylePickerOpen,
        openStoryInput,
        openDirectorWorkbench,
        onConfigChange,
        onGenerateNode,
        onNodeResize,
        onConnectStart,
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
    } = options;

    return useCallback(
        (contentNode: CanvasNodeData) => {
            const kind = canvasNodeContentKind(contentNode);
            if (kind === "character") return <CanvasCharacterReferenceNodeContent node={contentNode} />;
            if (kind === "style-placeholder") return <CanvasStylePlaceholderNodeContent onChoose={() => setStylePickerOpen(true)} />;
            if (kind === "story-input") return <CanvasStoryInputNodeContent node={contentNode} onEdit={() => openStoryInput(contentNode.id)} />;
            if (kind === "script") {
                const pipeline = deriveStoryboardPipelineProgress(contentNode, nodesRef.current, connectionsRef.current);
                return (
                    <CanvasScriptNodeContent
                        node={contentNode}
                        nodes={nodesRef.current}
                        batch={visibleGenerationBatch(contentNode)}
                        pipeline={pipeline}
                        scale={viewportScale}
                        mentionReferences={mentionReferencesByNodeId.get(contentNode.id) || []}
                        onOpen={() => setScriptEditorNodeId(contentNode.id)}
                        onCreateImageNodes={() => createScriptImageNodes(contentNode.id)}
                        onCreateVideoNodes={() => createScriptVideoNodes(contentNode.id)}
                        onGenerateImages={(rowIds) => void generateScriptImages(contentNode.id, rowIds)}
                        onGenerateVideos={(rowIds) => (contentNode.metadata?.storyboardVideoInputMode === "keyframe" ? void generateScriptVideos(contentNode.id, rowIds) : void createAndGenerateScriptVideos(contentNode.id, rowIds))}
                        onVideoInputModeChange={(storyboardVideoInputMode) => onConfigChange(contentNode.id, { storyboardVideoInputMode })}
                        onMergeVideos={() => void mergeVideosByIds(pipeline.successfulVideoNodeIds)}
                        onCreateActionBoards={() => void createScriptActionBoards(contentNode.id)}
                        onRetryBatch={(batchId) => retryFailedBatchItems(contentNode.id, batchId)}
                        onRetryBatchItem={(batchId, itemId) => retryFailedBatchItems(contentNode.id, batchId, itemId)}
                        onStopBatch={(batchId) => stopRemainingBatchItems(contentNode.id, batchId)}
                        onAddRow={() => addScriptRow(contentNode.id)}
                        onRemoveRow={(rowId) => removeScriptRow(contentNode.id, rowId)}
                        onUpdateRow={(rowId, patch) => updateScriptRow(contentNode.id, rowId, patch)}
                        onPromptChange={(composerContent) => onConfigChange(contentNode.id, { composerContent })}
                        onGenerateScript={(prompt) => void generateScriptRows(contentNode.id, prompt)}
                        onModelChange={(model) => onConfigChange(contentNode.id, { model })}
                        onShotDurationChange={(storyboardShotDuration) => onConfigChange(contentNode.id, { storyboardShotDuration })}
                        onShotCountChange={(storyboardShotCount) => onConfigChange(contentNode.id, { storyboardShotCount })}
                        workspaceMode={workspaceMode}
                        onComposerHeightChange={(height) => {
                            if (contentNode.metadata?.storyboardComposerHeight === height) return;
                            onConfigChange(contentNode.id, { storyboardComposerHeight: height });
                            const minHeight = storyboardMinNodeHeight(height);
                            if (contentNode.height < minHeight) onNodeResize(contentNode.id, contentNode.width, minHeight);
                        }}
                        onConnectStart={(event, rowId, handleType) => onConnectStart(event, contentNode.id, handleType, rowId === "context" ? "storyboard:context" : `row:${rowId}`)}
                        onScrollTopChange={(scrollTop) => setScriptScrollTopById((current) => (current[contentNode.id] === scrollTop ? current : { ...current, [contentNode.id]: scrollTop }))}
                    />
                );
            }
            if (kind === "director") {
                return (
                    <CanvasDirectorNodePanel
                        node={contentNode}
                        scene={directorScenes?.find((scene) => scene.id === contentNode.metadata?.directorSceneId) || null}
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
                    onConfigChange={onConfigChange}
                    onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                    onGenerate={(nodeId) => {
                        const target = nodesRef.current.find((item) => item.id === nodeId);
                        void onGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                    }}
                    workspaceMode={workspaceMode}
                />
            );
        },
        [addScriptRow, configInputsById, connectionsRef, createAndGenerateScriptVideos, createScriptActionBoards, createScriptImageNodes, createScriptVideoNodes, directorScenes, generateScriptImages, generateScriptRows, generateScriptVideos, mentionReferencesByNodeId, mergeVideosByIds, nodesRef, onConfigChange, onConnectStart, onGenerateNode, onNodeResize, openDirectorWorkbench, openStoryInput, removeScriptRow, retryFailedBatchItems, runningNodeId, setDialogNodeId, setScriptEditorNodeId, setScriptScrollTopById, setStylePickerOpen, stopRemainingBatchItems, updateScriptRow, viewportScale, workspaceMode],
    );
}
