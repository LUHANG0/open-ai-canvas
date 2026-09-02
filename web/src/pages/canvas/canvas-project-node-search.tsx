import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { CanvasNodeSearchModal } from "@/components/canvas/canvas-node-search-modal";
import type { CanvasNodeData } from "@/types/canvas";
import { resolveCanvasNodeSearchRevealTargets } from "./canvas-node-search-routing";

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
    return (
        <CanvasNodeSearchModal
            open={open}
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
    );
}
