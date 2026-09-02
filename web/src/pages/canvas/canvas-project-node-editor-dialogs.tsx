import { lazy, Suspense, type Dispatch, type SetStateAction } from "react";
import { App } from "antd";

import { WorkspaceState } from "@/components/layout/workspace-state";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { PortraitClearanceNodeState } from "@/lib/portrait-clearance/contracts";
import type { CanvasNodeData } from "@/types/canvas";
import { updateCanvasDrawingNode, updateCanvasTextEditorNode } from "./canvas-node-editor-updates";

const CanvasCharacterReferenceModal = lazy(() => import("@/components/canvas/canvas-character-reference-modal").then((module) => ({ default: module.CanvasCharacterReferenceModal })));
const CanvasTextEditorModal = lazy(() => import("@/components/canvas/canvas-text-editor-modal").then((module) => ({ default: module.CanvasTextEditorModal })));
const CanvasDrawingEditorModal = lazy(() => import("@/components/canvas/canvas-drawing-editor-modal").then((module) => ({ default: module.CanvasDrawingEditorModal })));
const PortraitClearanceModal = lazy(() => import("@/components/canvas/portrait-clearance/portrait-clearance-modal").then((module) => ({ default: module.PortraitClearanceModal })));

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
            {characterReferenceNode ? (
                <Suspense fallback={<CanvasNodeEditorLoading theme={theme} title="正在加载角色参考" description="正在准备角色参考编辑器。" />}>
                    <CanvasCharacterReferenceModal node={characterReferenceNode} open onClose={onCloseCharacterReference} />
                </Suspense>
            ) : null}
            {textEditorNode ? (
                <Suspense fallback={<CanvasNodeEditorLoading theme={theme} title="正在加载文本编辑器" description="正在准备文本内容。" />}>
                    <CanvasTextEditorModal
                        node={textEditorNode}
                        open
                        onClose={onCloseTextEditor}
                        onSave={(nodeId, title, content, richText) => setNodes((current) => updateCanvasTextEditorNode(current, nodeId, title, content, richText))}
                    />
                </Suspense>
            ) : null}
            {drawingNode ? (
                <Suspense fallback={<CanvasNodeEditorLoading theme={theme} title="正在加载绘图编辑器" description="正在准备绘图画布。" />}>
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
            {portraitClearanceNode ? (
                <Suspense fallback={<CanvasNodeEditorLoading theme={theme} title="正在加载肖像排查" description="正在准备人物肖像分析。" />}>
                    <PortraitClearanceModal
                        projectId={projectId}
                        node={portraitClearanceNode}
                        upstreamNodes={portraitClearanceInputs}
                        open
                        onClose={onClosePortraitClearance}
                        onUpdateState={onUpdatePortraitClearance}
                        onAddCandidate={onAddPortraitCandidate}
                    />
                </Suspense>
            ) : null}
        </>
    );
}

function CanvasNodeEditorLoading({ theme, title, description }: { theme: CanvasTheme; title: string; description: string }) {
    return (
        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center px-5" style={{ background: theme.canvas.background, color: theme.node.text }} role="status" aria-live="polite">
            <WorkspaceState icon="loading" title={title} description={description} />
        </div>
    );
}
