import { lazy, Suspense, type Dispatch, type SetStateAction } from "react";

import type { CanvasNodeData, StoryboardRow, StoryboardVideoInputMode } from "@/types/canvas";
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
        <Suspense fallback={<CanvasSecondaryEditorLoading label="正在加载分镜脚本编辑器…" onClose={onClose} />}>
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

function CanvasSecondaryEditorLoading({ label, onClose }: { label: string; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-black/20 px-5 backdrop-blur-sm" role="status" aria-live="polite">
            <div className="flex items-center gap-3 rounded-xl border bg-background px-5 py-3 text-sm font-medium text-foreground shadow-xl">
                <span>{label}</span>
                <button type="button" className="rounded-md px-2 py-1 text-xs text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground" onClick={onClose}>
                    关闭
                </button>
            </div>
        </div>
    );
}
