import { lazy, Suspense, type Dispatch, type SetStateAction } from "react";
import { App } from "antd";

import { CanvasCharacterReferenceModal } from "@/components/canvas/canvas-character-reference-modal";
import { CanvasTextEditorModal } from "@/components/canvas/canvas-text-editor-modal";
import { PortraitClearanceModal } from "@/components/canvas/portrait-clearance/portrait-clearance-modal";
import { WorkspaceState } from "@/components/layout/workspace-state";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { PortraitClearanceNodeState } from "@/lib/portrait-clearance/contracts";
import type { CanvasNodeData } from "@/types/canvas";
import { updateCanvasDrawingNode, updateCanvasTextEditorNode } from "./canvas-node-editor-updates";

const CanvasDrawingEditorModal = lazy(() => import("@/components/canvas/canvas-drawing-editor-modal").then((module) => ({ default: module.CanvasDrawingEditorModal })));

type CanvasProjectNodeEditorDialogsProps = {
    projectId: string;
    theme: CanvasTheme;
    characterReferenceNode: CanvasNodeData | null;
    textEditorNode: CanvasNodeData | null;
    drawingNode: CanvasNodeData | null;
    portraitClearanceNode: CanvasNodeData | null;
    portraitClearanceInputs: CanvasNodeData[];
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    onCloseCharacterReference: () => void;
    onCloseTextEditor: () => void;
    onCloseDrawing: () => void;
    onClosePortraitClearance: () => void;
    onUpdatePortraitClearance: (nodeId: string, state: PortraitClearanceNodeState) => void;
    onAddPortraitCandidate: (candidate: { id: string; title: string; imageArtifactId: string }, dataUrl: string) => void | Promise<void>;
};

export function CanvasProjectNodeEditorDialogs({
    projectId,
    theme,
    characterReferenceNode,
    textEditorNode,
    drawingNode,
    portraitClearanceNode,
    portraitClearanceInputs,
    setNodes,
    onCloseCharacterReference,
    onCloseTextEditor,
    onCloseDrawing,
    onClosePortraitClearance,
    onUpdatePortraitClearance,
    onAddPortraitCandidate,
}: CanvasProjectNodeEditorDialogsProps) {
    const { message } = App.useApp();
    return (
        <>
            <CanvasCharacterReferenceModal node={characterReferenceNode} open={Boolean(characterReferenceNode)} onClose={onCloseCharacterReference} />
            <CanvasTextEditorModal
                node={textEditorNode}
                open={Boolean(textEditorNode)}
                onClose={onCloseTextEditor}
                onSave={(nodeId, title, content, richText) => setNodes((current) => updateCanvasTextEditorNode(current, nodeId, title, content, richText))}
            />
            {drawingNode ? (
                <Suspense
                    fallback={
                        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center px-5" style={{ background: theme.canvas.background, color: theme.node.text }}>
                            <WorkspaceState icon="loading" title="正在加载绘图编辑器" description="正在准备绘图画布。" />
                        </div>
                    }
                >
                    <CanvasDrawingEditorModal
                        node={drawingNode}
                        projectId={projectId}
                        open={Boolean(drawingNode)}
                        onClose={onCloseDrawing}
                        onSaved={(nodeId, summary) => {
                            setNodes((current) => updateCanvasDrawingNode(current, nodeId, summary));
                            message.success("绘图已保存");
                        }}
                    />
                </Suspense>
            ) : null}
            <PortraitClearanceModal
                projectId={projectId}
                node={portraitClearanceNode}
                upstreamNodes={portraitClearanceInputs}
                open={Boolean(portraitClearanceNode)}
                onClose={onClosePortraitClearance}
                onUpdateState={onUpdatePortraitClearance}
                onAddCandidate={onAddPortraitCandidate}
            />
        </>
    );
}
