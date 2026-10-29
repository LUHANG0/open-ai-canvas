import { expect, spyOn, test } from "bun:test";
import * as generation from "@/lib/canvas/canvas-project-generation";
import { createCanvasStateWriter } from "@/lib/canvas/canvas-editor-state";
import { listMediaVersions } from "@/lib/canvas/canvas-media-versions";
import { executeAudioGeneration, executeVideoGeneration } from "@/pages/canvas/canvas-media-generation-executors";
import type { CanvasGenerationExecution } from "@/pages/canvas/canvas-generation-executor-types";
import { defaultConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

for (const type of [CanvasNodeType.Video, CanvasNodeType.Audio]) {
    for (const content of ["/old-media", undefined]) {
        test(`${type} regeneration snapshots old media before submission (${content ? "URL" : "resource only"})`, async () => {
            const source: CanvasNodeData = { id: "source", type, title: "original", position: { x: 20, y: 30 }, width: 320, height: 180, metadata: { storageKey: "resource:old", content, taskId: "old-task", status: "success", producedModel: "old-model", prompt: "old prompt", resultRecord: { mediaKey: "resource:old", taskId: "old-task", model: "old-model" } } };
            const nodes = { current: [source] };
            const connections = { current: [{ id: "link", fromNodeId: "input", toNodeId: source.id }] };
            const noop = () => {};
            let finished = 0;
            const request = spyOn(generation, "runCanvasGenerationTaskToConsumer").mockImplementation(async (options) => {
                expect(options.nodeId).toBe(source.id);
                const pending = nodes.current[0];
                expect(nodes.current).toHaveLength(1);
                expect(pending.metadata?.status).toBe("loading");
                expect(pending.metadata?.storageKey).toBe("resource:old");
                expect(pending.metadata?.prompt).toBe("next prompt");
                const old = listMediaVersions(pending)[0];
                expect(old.media.storageKey).toBe("resource:old");
                expect(old.generation?.prompt).toBe("old prompt");
                expect(old.generation?.resultRecord?.taskId).toBe("old-task");
                throw new Error("isolated submission failure");
            });
            try {
                const context = { nodeId: source.id, sourceNode: source, canvasNodes: nodes.current, canvasConnections: connections.current,
                    prompt: "next prompt", effectivePrompt: "next prompt", generationConfig: defaultConfig,
                    generationContext: { prompt: "next prompt", referenceImages: [], referenceVideos: [], referenceAudios: [], resolvedCharacterVersions: [], resolvedCharacterVoices: [] },
                    controller: new AbortController(), projectId: "isolated", editingTextNode: false, styleMetadata: {}, skillMetadata: {},
                    setNodes: createCanvasStateWriter(nodes, noop), setConnections: createCanvasStateWriter(connections, noop),
                    setSelectedNodeIds: noop, setSelectedConnectionId: noop, setDialogNodeId: noop,
                    startGenerationRequest: () => new AbortController(), finishGenerationRequest: () => { finished++; },
                    registerPendingNodeIds: noop, showError: noop, bindGenerationTask: noop, applyGenerationTaskResult: async () => {},
                } as CanvasGenerationExecution;
                await expect((type === CanvasNodeType.Video ? executeVideoGeneration : executeAudioGeneration)(context)).rejects.toThrow("isolated submission failure");
                expect(request).toHaveBeenCalledTimes(1);
                expect(finished).toBe(1);
                expect(connections.current).toEqual([{ id: "link", fromNodeId: "input", toNodeId: source.id }]);
                expect(listMediaVersions(nodes.current[0])).toHaveLength(1);
            } finally { request.mockRestore(); }
        });
    }
}
