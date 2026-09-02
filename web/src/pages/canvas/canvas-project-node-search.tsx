import { lazy, Suspense, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { CanvasNodeData } from "@/types/canvas";
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
        <Suspense fallback={<CanvasSecondaryEditorLoading label="正在加载节点搜索…" onClose={onClose} />}>
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

function CanvasSecondaryEditorLoading({ label, onClose }: { label: string; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-black/20 px-5 backdrop-blur-sm" role="status" aria-live="polite">
            <div className="flex items-center gap-3 rounded-xl border bg-background px-5 py-3 text-sm font-medium text-foreground shadow-xl">
                <span>{label}</span>
                <button type="button" className="rounded-md px-2 py-1 text-xs text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground" onClick={onClose}>
                    关闭
                </button>
            </div>
        </div>
    );
}
