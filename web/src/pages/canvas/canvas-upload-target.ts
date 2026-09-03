import type { CanvasNodeData } from "@/types/canvas";

export function requestCanvasNodeMediaReplacement(node: Pick<CanvasNodeData, "id">, handleUploadRequest: (nodeId: string) => void) {
    handleUploadRequest(node.id);
}
