import type { ComponentProps } from "react";

import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { CanvasLeaferGraphicsLayer } from "@/components/canvas/canvas-leafer-graphics-layer";
import { CanvasNodeActionContext } from "@/components/canvas/canvas-node-action-context";
import { CanvasNodeGraphContext } from "@/components/canvas/canvas-node-graph-context";
import { CanvasProjectWorldLayers } from "./canvas-project-world-layers";

type InfiniteCanvasViewportProps = Omit<ComponentProps<typeof InfiniteCanvas>, "children" | "graphicsLayer">;
type CanvasGraphicsLayerProps = ComponentProps<typeof CanvasLeaferGraphicsLayer>;
type CanvasWorldLayerProps = ComponentProps<typeof CanvasProjectWorldLayers>;

type CanvasProjectViewportProps = {
    canvas: InfiniteCanvasViewportProps;
    graphics: CanvasGraphicsLayerProps;
    nodeActions: ComponentProps<typeof CanvasNodeActionContext.Provider>["value"];
    nodeGraph: ComponentProps<typeof CanvasNodeGraphContext.Provider>["value"];
    world: CanvasWorldLayerProps;
};

export function CanvasProjectViewport({ canvas, graphics, nodeActions, nodeGraph, world }: CanvasProjectViewportProps) {
    return (
        <InfiniteCanvas {...canvas} graphicsLayer={<CanvasLeaferGraphicsLayer {...graphics} />}>
            <CanvasNodeActionContext.Provider value={nodeActions}>
                <CanvasNodeGraphContext.Provider value={nodeGraph}>
                    <CanvasProjectWorldLayers {...world} />
                </CanvasNodeGraphContext.Provider>
            </CanvasNodeActionContext.Provider>
        </InfiniteCanvas>
    );
}
