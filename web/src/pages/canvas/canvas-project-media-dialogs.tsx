import { lazy, Suspense } from "react";

import type { CanvasImageCropRect } from "@/components/canvas/canvas-node-crop-dialog";
import type { CanvasImageMaskEditPayload } from "@/components/canvas/canvas-node-mask-edit-dialog";
import type { CanvasImageSplitParams } from "@/components/canvas/canvas-node-split-dialog";
import type { CanvasImageUpscaleParams } from "@/components/canvas/canvas-node-upscale-dialog";
import type { CanvasNodeData } from "@/types/canvas";
import { CanvasDialogLoadingOverlay } from "./canvas-dialog-loading-overlay";

const CanvasNodeAnnotationDialog = lazy(() => import("@/components/canvas/canvas-node-annotation-dialog").then((module) => ({ default: module.CanvasNodeAnnotationDialog })));
const CanvasNodeCropDialog = lazy(() => import("@/components/canvas/canvas-node-crop-dialog").then((module) => ({ default: module.CanvasNodeCropDialog })));
const CanvasNodeMaskEditDialog = lazy(() => import("@/components/canvas/canvas-node-mask-edit-dialog").then((module) => ({ default: module.CanvasNodeMaskEditDialog })));
const CanvasNodeSplitDialog = lazy(() => import("@/components/canvas/canvas-node-split-dialog").then((module) => ({ default: module.CanvasNodeSplitDialog })));
const CanvasNodeUpscaleDialog = lazy(() => import("@/components/canvas/canvas-node-upscale-dialog").then((module) => ({ default: module.CanvasNodeUpscaleDialog })));

type CanvasProjectMediaDialogsProps = {
    cropNode: CanvasNodeData | null;
    annotationNode: CanvasNodeData | null;
    maskEditNode: CanvasNodeData | null;
    splitNode: CanvasNodeData | null;
    upscaleNode: CanvasNodeData | null;
    onCloseCrop: () => void;
    onCloseAnnotation: () => void;
    onCloseMaskEdit: () => void;
    onCloseSplit: () => void;
    onCloseUpscale: () => void;
    onCrop: (node: CanvasNodeData, crop: CanvasImageCropRect) => void;
    onAnnotate: (node: CanvasNodeData, dataUrl: string) => void;
    onMaskEdit: (node: CanvasNodeData, payload: CanvasImageMaskEditPayload) => void;
    onSplit: (node: CanvasNodeData, params: CanvasImageSplitParams) => void;
    onUpscale: (node: CanvasNodeData, params: CanvasImageUpscaleParams) => void;
};

export function CanvasProjectMediaDialogs({
    cropNode,
    annotationNode,
    maskEditNode,
    splitNode,
    upscaleNode,
    onCloseCrop,
    onCloseAnnotation,
    onCloseMaskEdit,
    onCloseSplit,
    onCloseUpscale,
    onCrop,
    onAnnotate,
    onMaskEdit,
    onSplit,
    onUpscale,
}: CanvasProjectMediaDialogsProps) {
    return (
        <>
            {cropNode?.metadata?.content ? <Suspense fallback={<CanvasDialogLoadingOverlay label="正在加载图片工具…" />}><CanvasNodeCropDialog dataUrl={cropNode.metadata.content} open onClose={onCloseCrop} onConfirm={(crop) => onCrop(cropNode, crop)} /></Suspense> : null}
            {annotationNode?.metadata?.content ? <Suspense fallback={<CanvasDialogLoadingOverlay label="正在加载图片工具…" />}><CanvasNodeAnnotationDialog image={{ url: annotationNode.metadata.content, storageKey: annotationNode.metadata.storageKey }} open onClose={onCloseAnnotation} onConfirm={(dataUrl) => onAnnotate(annotationNode, dataUrl)} /></Suspense> : null}
            {maskEditNode?.metadata?.content ? <Suspense fallback={<CanvasDialogLoadingOverlay label="正在加载图片工具…" />}><CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} open onClose={onCloseMaskEdit} onConfirm={(payload) => onMaskEdit(maskEditNode, payload)} /></Suspense> : null}
            {splitNode?.metadata?.content ? <Suspense fallback={<CanvasDialogLoadingOverlay label="正在加载图片工具…" />}><CanvasNodeSplitDialog dataUrl={splitNode.metadata.content} open onClose={onCloseSplit} onConfirm={(params) => onSplit(splitNode, params)} /></Suspense> : null}
            {upscaleNode?.metadata?.content ? <Suspense fallback={<CanvasDialogLoadingOverlay label="正在加载图片工具…" />}><CanvasNodeUpscaleDialog dataUrl={upscaleNode.metadata.content} open onClose={onCloseUpscale} onConfirm={(params) => onUpscale(upscaleNode, params)} /></Suspense> : null}
        </>
    );
}
