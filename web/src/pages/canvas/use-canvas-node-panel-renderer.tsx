import { lazy, Suspense, useCallback, type ComponentProps, type Dispatch, type SetStateAction } from "react";

import type { CanvasConfigComposer as CanvasConfigComposerComponent } from "@/components/canvas/canvas-config-composer";
import type { CanvasNodePromptPanel as CanvasNodePromptPanelComponent } from "@/components/canvas/canvas-node-prompt-panel";
import type { CanvasNodeData, CanvasWorkspaceMode } from "@/types/canvas";
import { CanvasInlinePanelLoading } from "./canvas-inline-panel-loading";
import { canvasNodePanelKind } from "./canvas-node-panel-routing";

const CanvasConfigComposer = lazy(() => import("@/components/canvas/canvas-config-composer").then((module) => ({ default: module.CanvasConfigComposer })));
const CanvasNodePromptPanel = lazy(() => import("@/components/canvas/canvas-node-prompt-panel").then((module) => ({ default: module.CanvasNodePromptPanel })));

type CanvasConfigComposerProps = ComponentProps<typeof CanvasConfigComposerComponent>;
type CanvasNodePromptPanelProps = ComponentProps<typeof CanvasNodePromptPanelComponent>;

type UseCanvasNodePanelRendererOptions = {
    configInputsById: ReadonlyMap<string, CanvasConfigComposerProps["inputs"]>;
    skillMentionReferences: NonNullable<CanvasConfigComposerProps["skillReferences"]>;
    mentionReferencesByNodeId: ReadonlyMap<string, NonNullable<CanvasNodePromptPanelProps["mentionReferences"]>>;
    runningNodeId: string | null;
    workspaceMode: CanvasWorkspaceMode;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    onConfigChange: CanvasNodePromptPanelProps["onConfigChange"];
    onGenerate: CanvasNodePromptPanelProps["onGenerate"];
    onImageSettingsOpenChange: NonNullable<CanvasNodePromptPanelProps["onImageSettingsOpenChange"]>;
    onNodeMouseDown: NonNullable<CanvasNodePromptPanelProps["onNodeMouseDown"]>;
    onPromptChange: CanvasNodePromptPanelProps["onPromptChange"];
    onRemoveReference: NonNullable<CanvasNodePromptPanelProps["onRemoveReference"]>;
};

export function useCanvasNodePanelRenderer({
    configInputsById,
    skillMentionReferences,
    mentionReferencesByNodeId,
    runningNodeId,
    workspaceMode,
    setDialogNodeId,
    onConfigChange,
    onGenerate,
    onImageSettingsOpenChange,
    onNodeMouseDown,
    onPromptChange,
    onRemoveReference,
}: UseCanvasNodePanelRendererOptions) {
    return useCallback(
        (panelNode: CanvasNodeData) => {
            const kind = canvasNodePanelKind(panelNode);
            if (!kind) return null;
            if (kind === "config") {
                return (
                    <Suspense fallback={<CanvasInlinePanelLoading label="正在加载配置编排器…" minHeight={190} onClose={() => setDialogNodeId(null)} closeLabel="关闭节点设置" />}>
                        <CanvasConfigComposer
                            value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                            inputs={configInputsById.get(panelNode.id) || []}
                            skillReferences={skillMentionReferences}
                            generationMode={panelNode.metadata?.generationMode}
                            metadata={panelNode.metadata}
                            workspaceMode={workspaceMode}
                            onChange={(composerContent) => onConfigChange(panelNode.id, { composerContent })}
                            onMetadataChange={(patch) => onConfigChange(panelNode.id, patch)}
                            onClose={() => setDialogNodeId(null)}
                        />
                    </Suspense>
                );
            }
            return (
                <Suspense fallback={<CanvasInlinePanelLoading label="正在加载节点设置…" minHeight={190} onClose={() => setDialogNodeId(null)} closeLabel="关闭节点设置" />}>
                    <CanvasNodePromptPanel
                        node={panelNode}
                        isRunning={runningNodeId === panelNode.id}
                        mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || []}
                        onPromptChange={onPromptChange}
                        onConfigChange={onConfigChange}
                        onGenerate={onGenerate}
                        onRemoveReference={onRemoveReference}
                        onClose={() => setDialogNodeId(null)}
                        onNodeMouseDown={onNodeMouseDown}
                        workspaceMode={workspaceMode}
                        onImageSettingsOpenChange={onImageSettingsOpenChange}
                    />
                </Suspense>
            );
        },
        [configInputsById, mentionReferencesByNodeId, onConfigChange, onGenerate, onImageSettingsOpenChange, onNodeMouseDown, onPromptChange, onRemoveReference, runningNodeId, setDialogNodeId, skillMentionReferences, workspaceMode],
    );
}
