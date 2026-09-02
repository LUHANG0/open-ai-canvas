import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { stampCanvasNodeChanges } from "@/lib/canvas/canvas-node-timestamps";
import type { CanvasNodeData } from "@/types/canvas";

export function resolveCanvasNodeStateUpdate(current: CanvasNodeData[], value: SetStateAction<CanvasNodeData[]>, now?: string) {
    const next = typeof value === "function" ? value(current) : value;
    return stampCanvasNodeChanges(current, next, now);
}

export function useCanvasNodeState() {
    const nodesRef = useRef<CanvasNodeData[]>([]);
    const [nodes, setNodeState] = useState<CanvasNodeData[]>([]);
    const setNodes = useCallback<Dispatch<SetStateAction<CanvasNodeData[]>>>((value) => {
        if (typeof value === "function") {
            setNodeState((current) => {
                const next = resolveCanvasNodeStateUpdate(current, value);
                nodesRef.current = next;
                return next;
            });
            return;
        }
        const next = resolveCanvasNodeStateUpdate(nodesRef.current, value);
        nodesRef.current = next;
        setNodeState(next);
    }, []);

    return { nodes, nodesRef, setNodes };
}
