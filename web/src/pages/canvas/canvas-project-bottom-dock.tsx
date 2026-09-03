import { lazy, Suspense, type ComponentProps } from "react";

import { CanvasAssetTray } from "@/components/canvas/canvas-asset-tray";
import { CanvasOverlayLayerContainer } from "@/components/canvas/canvas-overlay-layer";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import { activeCanvasAssetTrayNodeId, canShowCanvasMiniMap } from "./canvas-bottom-dock-state";

const Minimap = lazy(() => import("@/components/canvas/canvas-mini-map").then((module) => ({ default: module.Minimap })));

type AssetImages = ComponentProps<typeof CanvasAssetTray>["assetImages"];
type CanvasImages = ComponentProps<typeof CanvasAssetTray>["canvasImages"];
type InsertAssetImage = ComponentProps<typeof CanvasAssetTray>["onInsertAssetImage"];
type MinimapProps = ComponentProps<typeof import("@/components/canvas/canvas-mini-map").Minimap>;

type CanvasProjectBottomDockProps = {
    focusMode: boolean;
    isMiniMapOpen: boolean;
    nodes: MinimapProps["nodes"];
    viewport: MinimapProps["viewport"];
    viewportSize: MinimapProps["viewportSize"];
    containerRef: NonNullable<MinimapProps["canvasContainerRef"]>;
    selectedNodeIds: ReadonlySet<string>;
    assetImages: AssetImages;
    canvasImages: CanvasImages;
    projectLinked: boolean;
    onViewportPreviewChange: NonNullable<MinimapProps["onViewportPreviewChange"]>;
    onViewportChange: MinimapProps["onViewportChange"];
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
                <Suspense
                    fallback={
                        <span className="sr-only" role="status" aria-live="polite">
                            正在加载画布小地图…
                        </span>
                    }
                >
                    <Minimap nodes={nodes} viewport={viewport} viewportSize={viewportSize} canvasContainerRef={containerRef} onViewportPreviewChange={onViewportPreviewChange} onViewportChange={onViewportChange} />
                </Suspense>
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
