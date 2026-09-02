import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { normalizeCanvasNodeMentionTokens, type CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

export function canvasReferenceConnectionIdsToRemove(targetNodeId: string, referenceNodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const configNodeId = connections.find((connection) => {
        if (connection.fromNodeId !== targetNodeId) return false;
        return nodes.find((node) => node.id === connection.toNodeId)?.type === CanvasNodeType.Config;
    })?.toNodeId;
    return new Set(
        connections
            .filter((connection) => connection.fromNodeId === referenceNodeId && (connection.toNodeId === targetNodeId || connection.toNodeId === configNodeId))
            .map((connection) => connection.id),
    );
}

type UseCanvasNodeReferencesOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    mentionReferencesByNodeId: ReadonlyMap<string, CanvasResourceReference[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
};

export function useCanvasNodeReferences({ nodesRef, connectionsRef, mentionReferencesByNodeId, setNodes, setConnections, setSelectedConnectionId }: UseCanvasNodeReferencesOptions) {
    const handleRemoveNodeReference = useCallback(
        (targetNodeId: string, reference: CanvasResourceReference) => {
            const referenceNodeId = reference.nodeId;
            if (!referenceNodeId) return;
            // 生成节点可能通过配置节点接收参考，只移除参考来源边，保留目标到配置节点的主链。
            const removedConnectionIds = canvasReferenceConnectionIdsToRemove(targetNodeId, referenceNodeId, nodesRef.current, connectionsRef.current);
            if (!removedConnectionIds.size) return;
            connectionsRef.current = connectionsRef.current.filter((connection) => !removedConnectionIds.has(connection.id));
            setConnections(connectionsRef.current);
            setSelectedConnectionId((current) => (current && removedConnectionIds.has(current) ? null : current));
        },
        [connectionsRef, nodesRef, setConnections, setSelectedConnectionId],
    );

    useEffect(() => {
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                const references = mentionReferencesByNodeId.get(node.id);
                const savedPrompt = node.metadata?.composerContent ?? node.metadata?.prompt;
                if (!references?.length || !savedPrompt?.includes("@[node:")) return node;
                const normalizedPrompt = normalizeCanvasNodeMentionTokens(savedPrompt, references);
                if (normalizedPrompt === savedPrompt) return node;
                changed = true;
                return {
                    ...node,
                    metadata: node.metadata?.composerContent !== undefined ? { ...node.metadata, composerContent: normalizedPrompt } : { ...node.metadata, prompt: normalizedPrompt },
                };
            });
            return changed ? next : current;
        });
    }, [mentionReferencesByNodeId, setNodes]);

    return { handleRemoveNodeReference };
}
