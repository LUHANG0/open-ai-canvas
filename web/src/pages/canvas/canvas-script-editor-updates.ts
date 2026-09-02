import type { CanvasNodeData, StoryboardColumn } from "@/types/canvas";

export function updateCanvasScriptVisibleColumns(nodes: CanvasNodeData[], nodeId: string, visibleColumns: StoryboardColumn[]) {
    if (!visibleColumns.length) return nodes;
    return nodes.map((node) =>
        node.id === nodeId
            ? {
                  ...node,
                  metadata: {
                      ...node.metadata,
                      storyboard: {
                          rows: node.metadata?.storyboard?.rows || [],
                          visibleColumns,
                          referenceNodeIds: node.metadata?.storyboard?.referenceNodeIds || [],
                      },
                  },
              }
            : node,
    );
}

export function canvasScriptUsesKeyframeVideos(node: CanvasNodeData) {
    return node.metadata?.storyboardVideoInputMode === "keyframe";
}
