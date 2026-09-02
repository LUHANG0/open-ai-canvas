import { useState } from "react";

export function useCanvasSelectionState() {
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

    return {
        selectedConnectionId,
        selectedNodeIds,
        setSelectedConnectionId,
        setSelectedNodeIds,
    };
}
