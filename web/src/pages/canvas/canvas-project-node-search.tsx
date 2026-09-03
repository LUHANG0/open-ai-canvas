import { lazy, Suspense, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { CanvasNodeData } from "@/types/canvas";
import { CanvasDialogLoadingOverlay } from "./canvas-dialog-loading-overlay";
import { resolveCanvasNodeSearchRevealTargets } from "./canvas-node-search-routing";

const CanvasNodeSearchModal = lazy(() => import("@/components/canvas/canvas-node-search-modal").then((module) => ({ default: module.CanvasNodeSearchModal })));

type CanvasProjectNodeSearchProps = {
    open: boolean;
    nodes: CanvasNodeData[];
    nodeById: ReadonlyMap<string, CanvasNodeData>;
    selectedNodeIdsRef: MutableRefObject<Set<string>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    onClose: () => void;
    onToggleFrame: (nodeId: string) => void;
    onToggleBatch: (nodeId: string) => void;
    onFocusNode: (nodeId: string) => void;
};

export function CanvasProjectNodeSearch({ open, nodes, nodeById, selectedNodeIdsRef, setSelectedNodeIds, setSelectedConnectionId, onClose, onToggleFrame, onToggleBatch, onFocusNode }: CanvasProjectNodeSearchProps) {
    if (!open) return null;

    return (
        <Suspense fallback={<CanvasDialogLoadingOverlay label="正在加载节点搜索…" onClose={onClose} />}>
            <CanvasNodeSearchModal
                open
                nodes={nodes}
                onClose={onClose}
                onFocus={(nodeId) => {
                    const revealTargets = resolveCanvasNodeSearchRevealTargets(nodeById, nodeId);
                    if (revealTargets.collapsedFrameId) onToggleFrame(revealTargets.collapsedFrameId);
                    if (revealTargets.collapsedBatchRootId) onToggleBatch(revealTargets.collapsedBatchRootId);
                    const selection = new Set([nodeId]);
                    selectedNodeIdsRef.current = selection;
                    setSelectedNodeIds(selection);
                    setSelectedConnectionId(null);
                    onFocusNode(nodeId);
                }}
            />
        </Suspense>
    );
}
