import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { getNodeSpec } from "@/constant/canvas";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { getGenerationCount } from "@/lib/canvas/canvas-project-generation";
import { useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";

const NODE_STATUS_SUCCESS = "success" as const;

export function buildTextToImagePlan(requestedNode: CanvasNodeData, sourceNode: CanvasNodeData, config: AiConfig, connectionId = nanoid()) {
    const prompt = (requestedNode.metadata?.content || requestedNode.metadata?.prompt || "").trim();
    if (!prompt) return null;
    const nodeSize = getNodeSpec(CanvasNodeType.Image);
    const imageNode = createCanvasNode(
        CanvasNodeType.Image,
        {
            x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
            y: sourceNode.position.y + sourceNode.height / 2,
        },
        {
            prompt: "@文本1",
            composerContent: "@文本1",
            model: config.imageModel || config.model,
            size: config.size,
            quality: config.quality,
            transparentBackground: config.transparentBackground,
            count: getGenerationCount(config.canvasImageCount || config.count),
        },
    );
    imageNode.title = "图片生成";
    return {
        prompt,
        imageNode,
        connection: { id: connectionId, fromNodeId: sourceNode.id, toNodeId: imageNode.id } satisfies CanvasConnection,
    };
}

type UseCanvasTextToImageOptions = {
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    connectionsRef: MutableRefObject<CanvasConnection[]>;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
};

export function useCanvasTextToImage({ nodesRef, connectionsRef, setNodes, setConnections, setSelectedNodeIds, setSelectedConnectionId, setDialogNodeId }: UseCanvasTextToImageOptions) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();

    return useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning("文本节点为空，无法生图");
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const plan = buildTextToImagePlan(node, sourceNode, effectiveConfig);
            if (!plan) return;
            const nextNodes = nodesRef.current
                .map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: plan.prompt, richText: undefined, prompt: plan.prompt, status: NODE_STATUS_SUCCESS } } : item))
                .concat(plan.imageNode);
            const nextConnections = [...connectionsRef.current, plan.connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([plan.imageNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(plan.imageNode.id);
        },
        [connectionsRef, effectiveConfig, message, nodesRef, setConnections, setDialogNodeId, setNodes, setSelectedConnectionId, setSelectedNodeIds],
    );
}
