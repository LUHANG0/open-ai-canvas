import type { ComponentProps, RefObject } from "react";

import { CanvasAssetTray } from "@/components/canvas/canvas-asset-tray";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasOverlayLayerContainer } from "@/components/canvas/canvas-overlay-layer";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import type { CanvasNodeData, ViewportTransform } from "@/types/canvas";
import { activeCanvasAssetTrayNodeId, canShowCanvasMiniMap } from "./canvas-bottom-dock-state";

type AssetImages = ComponentProps<typeof CanvasAssetTray>["assetImages"];
type CanvasImages = ComponentProps<typeof CanvasAssetTray>["canvasImages"];
type InsertAssetImage = ComponentProps<typeof CanvasAssetTray>["onInsertAssetImage"];

type CanvasProjectBottomDockProps = {
    focusMode: boolean;
    isMiniMapOpen: boolean;
    nodes: CanvasNodeData[];
    viewport: ViewportTransform;
    viewportSize: { width: number; height: number };
    containerRef: RefObject<HTMLDivElement | null>;
    selectedNodeIds: ReadonlySet<string>;
    assetImages: AssetImages;
    canvasImages: CanvasImages;
    projectLinked: boolean;
    onViewportPreviewChange: (viewport: ViewportTransform) => void;
    onViewportChange: (viewport: ViewportTransform) => void;
    onScaleChange: (scale: number) => void;
    onFitContent: () => void;
    onAutoArrange: () => void;
    onDismissContextMenu: () => void;
    onToggleMiniMap: () => void;
    onOpenShortcuts: () => void;
    onInsertAssetImage: InsertAssetImage;
    onFocusCanvasImage: (nodeId: string) => void;
};

export function CanvasProjectBottomDock({
    focusMode,
    isMiniMapOpen,
    nodes,
    viewport,
    viewportSize,
    containerRef,
    selectedNodeIds,
    assetImages,
    canvasImages,
    projectLinked,
    onViewportPreviewChange,
    onViewportChange,
    onScaleChange,
    onFitContent,
    onAutoArrange,
    onDismissContextMenu,
    onToggleMiniMap,
    onOpenShortcuts,
    onInsertAssetImage,
    onFocusCanvasImage,
}: CanvasProjectBottomDockProps) {
    return (
        <>
            {canShowCanvasMiniMap(isMiniMapOpen, focusMode) ? (
                <Minimap nodes={nodes} viewport={viewport} viewportSize={viewportSize} canvasContainerRef={containerRef} onViewportPreviewChange={onViewportPreviewChange} onViewportChange={onViewportChange} />
            ) : null}

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
                        onScaleChange={onScaleChange}
                        onFitContent={onFitContent}
                        onAutoArrange={() => {
                            onDismissContextMenu();
                            onAutoArrange();
                            window.requestAnimationFrame(onFitContent);
                        }}
                        isMiniMapOpen={isMiniMapOpen}
                        onToggleMiniMap={() => {
                            onDismissContextMenu();
                            onToggleMiniMap();
                        }}
                        onOpenShortcuts={() => {
                            onDismissContextMenu();
                            onOpenShortcuts();
                        }}
                    />
                    <CanvasAssetTray
                        assetImages={assetImages}
                        canvasImages={canvasImages}
                        showLibrary={!projectLinked}
                        activeNodeId={activeCanvasAssetTrayNodeId(selectedNodeIds)}
                        onInsertAssetImage={onInsertAssetImage}
                        onFocusCanvasImage={onFocusCanvasImage}
                    />
                </CanvasOverlayLayerContainer>
            ) : null}
        </>
    );
}
