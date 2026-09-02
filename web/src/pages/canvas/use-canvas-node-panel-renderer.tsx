import { useCallback, type ComponentProps, type Dispatch, type SetStateAction } from "react";

import { CanvasConfigComposer } from "@/components/canvas/canvas-config-composer";
import type { NodeGenerationInput } from "@/components/canvas/canvas-node-generation";
import { CanvasNodePromptPanel } from "@/components/canvas/canvas-node-prompt-panel";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import type { CanvasNodeData, CanvasWorkspaceMode } from "@/types/canvas";
import { canvasNodePanelKind } from "./canvas-node-panel-routing";

type UseCanvasNodePanelRendererOptions = {
    configInputsById: ReadonlyMap<string, NodeGenerationInput[]>;
    skillMentionReferences: CanvasResourceReference[];
    mentionReferencesByNodeId: ReadonlyMap<string, CanvasResourceReference[]>;
    runningNodeId: string | null;
    workspaceMode: CanvasWorkspaceMode;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    onConfigChange: ComponentProps<typeof CanvasNodePromptPanel>["onConfigChange"];
    onGenerate: ComponentProps<typeof CanvasNodePromptPanel>["onGenerate"];
    onImageSettingsOpenChange: NonNullable<ComponentProps<typeof CanvasNodePromptPanel>["onImageSettingsOpenChange"]>;
    onNodeMouseDown: NonNullable<ComponentProps<typeof CanvasNodePromptPanel>["onNodeMouseDown"]>;
    onPromptChange: ComponentProps<typeof CanvasNodePromptPanel>["onPromptChange"];
    onRemoveReference: NonNullable<ComponentProps<typeof CanvasNodePromptPanel>["onRemoveReference"]>;
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
                );
            }
            return (
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
            );
        },
        [configInputsById, mentionReferencesByNodeId, onConfigChange, onGenerate, onImageSettingsOpenChange, onNodeMouseDown, onPromptChange, onRemoveReference, runningNodeId, setDialogNodeId, skillMentionReferences, workspaceMode],
    );
}
