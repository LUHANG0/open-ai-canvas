import type { CanvasDrawingSnapshot } from "@/lib/canvas/canvas-drawing-storage";
import type { CanvasNodeData } from "@/types/canvas";

export type CanvasDrawingSaveSummary = Pick<CanvasDrawingSnapshot, "engine" | "revision" | "updatedAt" | "shapeCount" | "pageCount">;

export function updateCanvasTextEditorNode(nodes: CanvasNodeData[], nodeId: string, title: string, content: string, richText: Record<string, unknown>) {
    return nodes.map((node) => (node.id === nodeId ? { ...node, title, metadata: { ...node.metadata, content, richText } } : node));
}

export function updateCanvasDrawingNode(nodes: CanvasNodeData[], nodeId: string, summary: CanvasDrawingSaveSummary) {
    return nodes.map((node) =>
        node.id === nodeId
            ? {
                  ...node,
                  metadata: {
                      ...node.metadata,
                      drawingEngine: summary.engine,
                      drawingRevision: summary.revision,
                      drawingUpdatedAt: summary.updatedAt,
                      drawingShapeCount: summary.shapeCount,
                      drawingPageCount: summary.pageCount,
                  },
              }
            : node,
    );
}
