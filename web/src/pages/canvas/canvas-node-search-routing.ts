import type { CanvasNodeData } from "@/types/canvas";

export type CanvasNodeSearchRevealTargets = {
    collapsedFrameId?: string;
    collapsedBatchRootId?: string;
};

export function resolveCanvasNodeSearchRevealTargets(nodeById: ReadonlyMap<string, CanvasNodeData>, nodeId: string): CanvasNodeSearchRevealTargets {
    const target = nodeById.get(nodeId);
    const parent = target?.parentId ? nodeById.get(target.parentId) : null;
    const batchRoot = target?.metadata?.batchRootId ? nodeById.get(target.metadata.batchRootId) : null;
    return {
        collapsedFrameId: parent?.metadata?.frame?.collapsed ? parent.id : undefined,
        collapsedBatchRootId: batchRoot && !batchRoot.metadata?.imageBatchExpanded ? batchRoot.id : undefined,
    };
}
