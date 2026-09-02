import type { Dispatch, SetStateAction } from "react";

import { CanvasScriptEditor } from "@/components/canvas/canvas-script-node";
import type { CanvasNodeData, StoryboardRow, StoryboardVideoInputMode } from "@/types/canvas";
import { canvasScriptUsesKeyframeVideos, updateCanvasScriptVisibleColumns } from "./canvas-script-editor-updates";

type CanvasProjectScriptEditorProps = {
    node: CanvasNodeData | null;
    nodes: CanvasNodeData[];
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    onClose: () => void;
    onUpdateRows: (nodeId: string, rows: StoryboardRow[]) => void;
    onGenerateImages: (nodeId: string, rowIds: string[]) => unknown;
    onGenerateKeyframeVideos: (nodeId: string, rowIds: string[]) => unknown;
    onCreateAndGenerateVideos: (nodeId: string, rowIds: string[]) => unknown;
    onVideoInputModeChange: (nodeId: string, mode: StoryboardVideoInputMode) => void;
};

export function CanvasProjectScriptEditor({
    node,
    nodes,
    setNodes,
    onClose,
    onUpdateRows,
    onGenerateImages,
    onGenerateKeyframeVideos,
    onCreateAndGenerateVideos,
    onVideoInputModeChange,
}: CanvasProjectScriptEditorProps) {
    return (
        <CanvasScriptEditor
            node={node}
            nodes={nodes}
            open={Boolean(node)}
            onClose={onClose}
            onUpdateRows={(rows) => node && onUpdateRows(node.id, rows)}
            onVisibleColumnsChange={(visibleColumns) => {
                if (!node || !visibleColumns.length) return;
                setNodes((current) => updateCanvasScriptVisibleColumns(current, node.id, visibleColumns));
            }}
            onGenerateImages={(rowIds) => node && void onGenerateImages(node.id, rowIds)}
            onGenerateVideos={(rowIds) => {
                if (!node) return;
                if (canvasScriptUsesKeyframeVideos(node)) void onGenerateKeyframeVideos(node.id, rowIds);
                else void onCreateAndGenerateVideos(node.id, rowIds);
            }}
            onVideoInputModeChange={(mode) => node && onVideoInputModeChange(node.id, mode)}
        />
    );
}
