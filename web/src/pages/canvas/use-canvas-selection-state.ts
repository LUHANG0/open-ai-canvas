import { useMemo, useState } from "react";

import { selectBatchConnectionSourceNodeIds } from "@/lib/canvas/canvas-batch-connection";
import type { CanvasNodeData } from "@/types/canvas";

export function useCanvasSelectionState(nodes: CanvasNodeData[]) {
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const batchSourceNodeIds = useMemo(() => selectBatchConnectionSourceNodeIds(nodes, selectedNodeIds), [nodes, selectedNodeIds]);

    return {
        batchSourceNodeIds,
        selectedConnectionId,
        selectedNodeIds,
        setSelectedConnectionId,
        setSelectedNodeIds,
    };
}
