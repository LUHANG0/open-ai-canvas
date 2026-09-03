import { lazy, Suspense, type Dispatch, type SetStateAction } from "react";

import type { CanvasNodeData, StoryboardRow, StoryboardVideoInputMode } from "@/types/canvas";
import { CanvasDialogLoadingOverlay } from "./canvas-dialog-loading-overlay";
import { canvasScriptUsesKeyframeVideos, updateCanvasScriptVisibleColumns } from "./canvas-script-editor-updates";

const CanvasScriptEditor = lazy(() => import("@/components/canvas/canvas-script-node").then((module) => ({ default: module.CanvasScriptEditor })));

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

export function CanvasProjectScriptEditor({ node, nodes, setNodes, onClose, onUpdateRows, onGenerateImages, onGenerateKeyframeVideos, onCreateAndGenerateVideos, onVideoInputModeChange }: CanvasProjectScriptEditorProps) {
    if (!node) return null;

    return (
        <Suspense fallback={<CanvasDialogLoadingOverlay label="正在加载分镜脚本编辑器…" onClose={onClose} />}>
            <CanvasScriptEditor
                node={node}
                nodes={nodes}
                open
                onClose={onClose}
                onUpdateRows={(rows) => onUpdateRows(node.id, rows)}
                onVisibleColumnsChange={(visibleColumns) => {
                    if (!visibleColumns.length) return;
                    setNodes((current) => updateCanvasScriptVisibleColumns(current, node.id, visibleColumns));
                }}
                onGenerateImages={(rowIds) => void onGenerateImages(node.id, rowIds)}
                onGenerateVideos={(rowIds) => {
                    if (canvasScriptUsesKeyframeVideos(node)) void onGenerateKeyframeVideos(node.id, rowIds);
                    else void onCreateAndGenerateVideos(node.id, rowIds);
                }}
                onVideoInputModeChange={(mode) => onVideoInputModeChange(node.id, mode)}
            />
        </Suspense>
    );
}
