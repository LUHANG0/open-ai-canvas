import type { Dispatch, RefObject, SetStateAction } from "react";

import { CanvasNodeToolbar } from "@/components/canvas/canvas-node-toolbar";
import type { CanvasNodeData, CanvasWorkspaceMode, ViewportTransform } from "@/types/canvas";
import { canvasNodeInfoUsesTextEditor, nextCanvasNodeFontSize, resolveCanvasProjectToolbarNode } from "./canvas-node-toolbar-routing";

type NodeAction = (node: CanvasNodeData) => unknown;
type SetNodeId = Dispatch<SetStateAction<string | null>>;

type CanvasProjectNodeToolbarSetters = {
    info: SetNodeId;
    dialog: SetNodeId;
    annotation: SetNodeId;
    maskEdit: SetNodeId;
    emotion: SetNodeId;
    crop: SetNodeId;
    split: SetNodeId;
    upscale: SetNodeId;
    superResolve: SetNodeId;
    angle: SetNodeId;
    preview: SetNodeId;
    subtitle: SetNodeId;
    timeline: SetNodeId;
};

type CanvasProjectNodeToolbarActions = {
    editText: NodeAction;
    changeFontSize: (nodeId: string, fontSize: number) => unknown;
    generateImage: NodeAction;
    uploadNode: (nodeId: string) => unknown;
    downloadNode: NodeAction;
    saveAsset: NodeAction;
    openPortraitTexture: NodeAction;
    extractVideoFrames: NodeAction;
    extractAudioFromVideo: NodeAction;
    trimVideoSegments: NodeAction;
    reversePrompt: NodeAction;
    retryNode: NodeAction;
    toggleFreeResize: (nodeId: string) => unknown;
    toggleLocked: (nodeId: string) => unknown;
    deleteNodes: (nodeIds: Set<string>) => unknown;
};

type CanvasProjectNodeToolbarProps = {
    node: CanvasNodeData | null;
    blocked: boolean;
    workspaceMode: CanvasWorkspaceMode;
    viewport: ViewportTransform;
    containerRef: RefObject<HTMLDivElement | null>;
    onKeep: (nodeId: string) => void;
    onLeave: () => void;
    setters: CanvasProjectNodeToolbarSetters;
    actions: CanvasProjectNodeToolbarActions;
    extractingVideoFrames: boolean;
    extractingAudio: boolean;
    trimmingVideo: boolean;
};

export function CanvasProjectNodeToolbar({ node, blocked, workspaceMode, viewport, containerRef, onKeep, onLeave, setters, actions, extractingVideoFrames, extractingAudio, trimmingVideo }: CanvasProjectNodeToolbarProps) {
    const visibleNode = resolveCanvasProjectToolbarNode(node, blocked);
    return (
        <CanvasNodeToolbar
            node={visibleNode}
            workspaceMode={workspaceMode}
            viewport={viewport}
            containerRef={containerRef}
            onKeep={onKeep}
            onLeave={onLeave}
            onInfo={(target) => (canvasNodeInfoUsesTextEditor(target) ? actions.editText(target) : setters.info(target.id))}
            onEditText={(target) => void actions.editText(target)}
            onDecreaseFont={(target) => void actions.changeFontSize(target.id, nextCanvasNodeFontSize(target.metadata?.fontSize, -2))}
            onIncreaseFont={(target) => void actions.changeFontSize(target.id, nextCanvasNodeFontSize(target.metadata?.fontSize, 2))}
            onToggleDialog={(target) => setters.dialog((current) => (current === target.id ? null : target.id))}
            onGenerateImage={(target) => void actions.generateImage(target)}
            onUpload={(target) => void actions.uploadNode(target.id)}
            onDownload={(target) => void actions.downloadNode(target)}
            onSaveAsset={(target) => void actions.saveAsset(target)}
            onAnnotate={(target) => setters.annotation(target.id)}
            onMaskEdit={(target) => setters.maskEdit(target.id)}
            onEmotion={(target) => {
                setters.dialog(null);
                setters.emotion((current) => (current === target.id ? null : target.id));
            }}
            onPortraitTexture={(target) => void actions.openPortraitTexture(target)}
            onCrop={(target) => setters.crop(target.id)}
            onSplit={(target) => setters.split(target.id)}
            onUpscale={(target) => setters.upscale(target.id)}
            onSuperResolve={(target) => setters.superResolve(target.id)}
            onAngle={(target) => {
                setters.dialog(null);
                setters.angle((current) => (current === target.id ? null : target.id));
            }}
            onViewImage={(target) => setters.preview(target.id)}
            onExtractVideoFrames={(target) => void actions.extractVideoFrames(target)}
            onExtractAudioFromVideo={(target) => void actions.extractAudioFromVideo(target)}
            onTrimVideoSegments={(target) => void actions.trimVideoSegments(target)}
            onSubtitles={(target) => setters.subtitle(target.id)}
            onTimeline={(target) => setters.timeline(target.id)}
            extractingVideoFrames={extractingVideoFrames}
            extractingAudio={extractingAudio}
            trimmingVideo={trimmingVideo}
            onReversePrompt={(target) => void actions.reversePrompt(target)}
            onRetry={(target) => void actions.retryNode(target)}
            onToggleFreeResize={(target) => void actions.toggleFreeResize(target.id)}
            onToggleLocked={(target) => void actions.toggleLocked(target.id)}
            onDelete={(target) => void actions.deleteNodes(new Set([target.id]))}
        />
    );
}
