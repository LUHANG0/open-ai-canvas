import { lazy, Suspense, type ComponentProps, type ReactNode, type RefObject } from "react";

import type { CanvasEmotionWorkspace as CanvasEmotionWorkspaceComponent } from "@/components/canvas/canvas-emotion-workspace";
import type { CanvasNodeAnglePanel as CanvasNodeAnglePanelComponent } from "@/components/canvas/canvas-node-angle-dialog";
import { CanvasConnectionCreateMenu, CanvasNodePanelOverlay, type PendingConnectionCreate } from "@/components/canvas/canvas-workspace-overlays";
import type { CanvasNodeData, ViewportTransform } from "@/types/canvas";
import { canRenderCanvasInlineNodePanel, resolveCanvasNodeOverlayDrag, type CanvasOverlayDragPreview } from "./canvas-node-overlay-state";

const CanvasEmotionWorkspace = lazy(() => import("@/components/canvas/canvas-emotion-workspace").then((module) => ({ default: module.CanvasEmotionWorkspace })));
const CanvasNodeAnglePanel = lazy(() => import("@/components/canvas/canvas-node-angle-dialog").then((module) => ({ default: module.CanvasNodeAnglePanel })));

type AngleParams = Parameters<ComponentProps<typeof CanvasNodeAnglePanelComponent>["onConfirm"]>[0];
type EmotionPayload = Parameters<ComponentProps<typeof CanvasEmotionWorkspaceComponent>["onConfirm"]>[0];
type ConnectionNodeType = Parameters<ComponentProps<typeof CanvasConnectionCreateMenu>["onCreate"]>[0];

type CanvasProjectNodeOverlaysProps = {
    angleNode: CanvasNodeData | null;
    emotionNode: CanvasNodeData | null;
    dialogNode: CanvasNodeData | null;
    viewport: ViewportTransform;
    viewportSize: { width: number; height: number };
    containerRef: RefObject<HTMLDivElement | null>;
    dragPreview: CanvasOverlayDragPreview;
    isNodeDragging: boolean;
    selectionActive: boolean;
    renderNodePanel: (node: CanvasNodeData) => ReactNode;
    onCloseAngle: () => void;
    onGenerateAngle: (node: CanvasNodeData, params: AngleParams) => unknown;
    onCloseEmotion: () => void;
    onGenerateEmotion: (node: CanvasNodeData, payload: EmotionPayload) => unknown;
    pendingConnectionCreate: PendingConnectionCreate | null;
    canCreateDrawingFromConnection: boolean;
    getConnectionCreateDisabledReason: (type: ConnectionNodeType, pending: PendingConnectionCreate) => string;
    onCreateConnectedNode: (type: ConnectionNodeType, pending: PendingConnectionCreate) => unknown;
    onCloseConnectionCreate: () => void;
};

export function CanvasProjectNodeOverlays({
    angleNode,
    emotionNode,
    dialogNode,
    viewport,
    viewportSize,
    containerRef,
    dragPreview,
    isNodeDragging,
    selectionActive,
    renderNodePanel,
    onCloseAngle,
    onGenerateAngle,
    onCloseEmotion,
    onGenerateEmotion,
    pendingConnectionCreate,
    canCreateDrawingFromConnection,
    getConnectionCreateDisabledReason,
    onCreateConnectedNode,
    onCloseConnectionCreate,
}: CanvasProjectNodeOverlaysProps) {
    const angleDrag = angleNode ? resolveCanvasNodeOverlayDrag(angleNode.id, dragPreview, isNodeDragging) : null;
    const emotionDrag = emotionNode ? resolveCanvasNodeOverlayDrag(emotionNode.id, dragPreview, isNodeDragging) : null;
    const dialogDrag = dialogNode ? resolveCanvasNodeOverlayDrag(dialogNode.id, dragPreview, isNodeDragging) : null;
    return (
        <>
            {angleNode?.metadata?.content ? (
                <CanvasNodePanelOverlay node={angleNode} viewport={viewport} containerRef={containerRef} panelWidth={580} panelHeight={350} dragOffset={angleDrag?.dragOffset} isDragging={angleDrag?.isDragging}>
                    <Suspense fallback={<CanvasSpecialNodeOverlayLoading label="正在加载多角度编辑器…" onClose={onCloseAngle} minHeight={350} />}>
                        <CanvasNodeAnglePanel dataUrl={angleNode.metadata.content} onClose={onCloseAngle} onConfirm={(params) => void onGenerateAngle(angleNode, params)} />
                    </Suspense>
                </CanvasNodePanelOverlay>
            ) : null}

            {emotionNode?.metadata?.content ? (
                <Suspense
                    fallback={
                        <CanvasNodePanelOverlay node={emotionNode} viewport={viewport} containerRef={containerRef} panelWidth={580} panelHeight={303} dragOffset={emotionDrag?.dragOffset} isDragging={emotionDrag?.isDragging}>
                            <CanvasSpecialNodeOverlayLoading label="正在加载表情工作区…" onClose={onCloseEmotion} minHeight={303} />
                        </CanvasNodePanelOverlay>
                    }
                >
                    <CanvasEmotionWorkspace
                        node={emotionNode}
                        viewport={viewport}
                        containerRef={containerRef}
                        dragOffset={emotionDrag?.dragOffset}
                        isDragging={emotionDrag?.isDragging}
                        onClose={onCloseEmotion}
                        onConfirm={(payload) => void onGenerateEmotion(emotionNode, payload)}
                    />
                </Suspense>
            ) : null}

            {canRenderCanvasInlineNodePanel(dialogNode, selectionActive) && dialogNode ? (
                <CanvasNodePanelOverlay node={dialogNode} viewport={viewport} containerRef={containerRef} dragOffset={dialogDrag?.dragOffset} isDragging={dialogDrag?.isDragging}>
                    {renderNodePanel(dialogNode)}
                </CanvasNodePanelOverlay>
            ) : null}

            {pendingConnectionCreate ? (
                <CanvasConnectionCreateMenu
                    pending={pendingConnectionCreate}
                    viewport={viewport}
                    viewportSize={viewportSize}
                    containerRef={containerRef}
                    canCreateDrawing={canCreateDrawingFromConnection}
                    getDisabledReason={(type) => getConnectionCreateDisabledReason(type, pendingConnectionCreate)}
                    onCreate={(type) => void onCreateConnectedNode(type, pendingConnectionCreate)}
                    onClose={onCloseConnectionCreate}
                />
            ) : null}
        </>
    );
}

function CanvasSpecialNodeOverlayLoading({ label, onClose, minHeight }: { label: string; onClose: () => void; minHeight: number }) {
    return (
        <div data-canvas-no-zoom className="flex w-full items-start justify-between gap-3 rounded-[var(--r-2xl)] border bg-background/95 px-4 py-3 text-sm text-foreground shadow-xl backdrop-blur-xl" style={{ minHeight }} role="status" aria-live="polite">
            <span className="pt-1 font-medium">{label}</span>
            <button type="button" className="shrink-0 rounded-md px-2 py-1 text-xs text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground" onClick={onClose}>
                关闭
            </button>
        </div>
    );
}
