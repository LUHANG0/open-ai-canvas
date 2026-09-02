import { useCallback, useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { imageMetadata } from "@/lib/canvas/canvas-generation-task-sync";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { createDefaultPortraitClearanceState, PORTRAIT_CLEARANCE_NODE_TYPE, type PortraitClearanceNodeState } from "@/lib/portrait-clearance/contracts";
import { reconcilePortraitClearanceInputBindings } from "@/lib/portrait-clearance/input-bindings";
import { uploadImage } from "@/services/image-storage";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";
import { usePortraitClearanceCoordinator } from "./use-portrait-clearance-coordinator";

export function synchronizePortraitClearanceInputBindings(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    let changed = false;
    const next = nodes.map((node) => {
        if (node.type !== PORTRAIT_CLEARANCE_NODE_TYPE) return node;
        const state = node.metadata?.portraitClearance || createDefaultPortraitClearanceState();
        const inputBindings = reconcilePortraitClearanceInputBindings(node.metadata?.portraitClearance?.mode || state.mode, node.id, connections, nodes, state.inputBindings);
        if (JSON.stringify(inputBindings) === JSON.stringify(state.inputBindings) && node.metadata?.portraitClearance) return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, portraitClearance: { ...state, inputBindings } } };
    });
    return changed ? next : nodes;
}

export function portraitClearanceInputsFor(nodeId: string | null, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    if (!nodeId) return [];
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return connections
        .filter((connection) => connection.toNodeId === nodeId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((connection) => nodeById.get(connection.fromNodeId))
        .filter((node): node is CanvasNodeData => Boolean(node));
}

type UseCanvasPortraitClearanceOptions = {
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    portraitClearanceNodeId: string | null;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    updateNodeMetadata: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
};

export function useCanvasPortraitClearance({ nodes, connections, nodesRef, portraitClearanceNodeId, setNodes, setConnections, setSelectedNodeIds, updateNodeMetadata }: UseCanvasPortraitClearanceOptions) {
    const { message } = App.useApp();
    const handlePortraitClearanceStateUpdate = useCallback(
        (nodeId: string, state: PortraitClearanceNodeState) => updateNodeMetadata(nodeId, { portraitClearance: state }),
        [updateNodeMetadata],
    );

    usePortraitClearanceCoordinator({ nodes, onUpdateState: handlePortraitClearanceStateUpdate });

    useEffect(() => {
        setNodes((current) => synchronizePortraitClearanceInputBindings(current, connections));
    }, [connections, setNodes]);

    const portraitClearanceNode = useMemo(() => (portraitClearanceNodeId ? nodes.find((node) => node.id === portraitClearanceNodeId) || null : null), [nodes, portraitClearanceNodeId]);
    const portraitClearanceInputs = useMemo(() => portraitClearanceInputsFor(portraitClearanceNode?.id || null, nodes, connections), [connections, nodes, portraitClearanceNode?.id]);

    const addPortraitCandidateToCanvas = useCallback(
        async (candidate: { id: string; title: string; imageArtifactId: string }, dataUrl: string) => {
            const target = portraitClearanceNodeId ? nodesRef.current.find((node) => node.id === portraitClearanceNodeId) : undefined;
            if (!target) return;
            try {
                const image = await uploadImage(dataUrl);
                const created = createCanvasNode(CanvasNodeType.Image, { x: target.position.x + target.width + 260, y: target.position.y + target.height / 2 }, imageMetadata(image));
                created.title = candidate.title.slice(0, 80) || "肖像排查候选";
                const connection = { id: nanoid(), fromNodeId: created.id, toNodeId: target.id };
                setNodes((current) => [...current, created]);
                setConnections((current) => [...current, connection]);
                setSelectedNodeIds(new Set([created.id]));
                message.success("候选图片已添加到画布并连接到排查节点");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "候选图片添加失败");
            }
        },
        [message, nodesRef, portraitClearanceNodeId, setConnections, setNodes, setSelectedNodeIds],
    );

    return { addPortraitCandidateToCanvas, handlePortraitClearanceStateUpdate, portraitClearanceInputs, portraitClearanceNode };
}
