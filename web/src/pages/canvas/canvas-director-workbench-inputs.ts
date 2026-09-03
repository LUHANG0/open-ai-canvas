import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export function selectCanvasDirectorImageNodes(nodes: CanvasNodeData[]) {
    return nodes.filter((node) => node.type === CanvasNodeType.Image && Boolean(node.metadata?.content));
}
