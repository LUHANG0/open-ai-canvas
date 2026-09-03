import { describe, expect, test } from "bun:test";

async function source(path: string) {
    return Bun.file(new URL(path, import.meta.url)).text();
}

describe("canvas custom node content renderer lazy loading", () => {
    test("defers every custom node body until its actual kind renders", async () => {
        const rendererSource = await source("../src/pages/canvas/use-canvas-node-content-renderer.tsx");

        for (const modulePath of [
            "@/components/canvas/canvas-character-reference-node",
            "@/components/canvas/canvas-config-node-panel",
            "@/components/canvas/canvas-script-node",
            "@/components/canvas/canvas-short-drama-entry",
            "@/components/canvas/director/canvas-director-node-panel",
        ]) {
            expect(rendererSource).toContain(`lazy(() => import("${modulePath}")`);
            expect(rendererSource).not.toContain(`from "${modulePath}";`);
        }
        expect(rendererSource.match(/const Canvas\w+(?:Content|Panel) = lazy\(/g)).toHaveLength(6);
        expect(rendererSource).toContain('if (kind === "character")');
        expect(rendererSource).toContain('if (kind === "style-placeholder")');
        expect(rendererSource).toContain('if (kind === "story-input")');
        expect(rendererSource).toContain('if (kind === "script")');
        expect(rendererSource).toContain('if (kind === "director")');
    });

    test("keeps the fallback inside a node and unable to intercept input", async () => {
        const rendererSource = await source("../src/pages/canvas/use-canvas-node-content-renderer.tsx");

        expect(rendererSource.match(/fallback=\{<CanvasNodeContentLoading \/>\}/g)).toHaveLength(6);
        expect(rendererSource).toContain('className="pointer-events-none flex size-full min-h-20');
        expect(rendererSource).not.toContain("fixed inset-0");
        expect(rendererSource).toContain('role="status" aria-live="polite"');
        expect(rendererSource).toContain("正在加载节点内容…");
    });

    test("retains script pipeline, batch, connection, scroll, and generation callbacks", async () => {
        const rendererSource = await source("../src/pages/canvas/use-canvas-node-content-renderer.tsx");

        for (const route of [
            "deriveStoryboardPipelineProgress(contentNode, nodesRef.current, connectionsRef.current)",
            "batch={visibleGenerationBatch(contentNode)}",
            "onCreateImageNodes={() => createScriptImageNodes(contentNode.id)}",
            "onCreateVideoNodes={() => createScriptVideoNodes(contentNode.id)}",
            "generateScriptImages(contentNode.id, rowIds)",
            "generateScriptVideos(contentNode.id, rowIds)",
            "createAndGenerateScriptVideos(contentNode.id, rowIds)",
            "mergeVideosByIds(pipeline.successfulVideoNodeIds)",
            "createScriptActionBoards(contentNode.id)",
            "retryFailedBatchItems(contentNode.id, batchId, itemId)",
            "stopRemainingBatchItems(contentNode.id, batchId)",
            'rowId === "context" ? "storyboard:context" : `row:${rowId}`',
            "setScriptScrollTopById((current)",
            "generateScriptRows(contentNode.id, prompt)",
            "storyboardMinNodeHeight(height)",
        ]) expect(rendererSource).toContain(route);
    });

    test("retains character, short-drama, director, and config behavior", async () => {
        const rendererSource = await source("../src/pages/canvas/use-canvas-node-content-renderer.tsx");

        for (const route of [
            "<CanvasCharacterReferenceNodeContent node={contentNode}",
            "<CanvasStylePlaceholderNodeContent onChoose={() => setStylePickerOpen(true)}",
            "<CanvasStoryInputNodeContent node={contentNode} onEdit={() => openStoryInput(contentNode.id)}",
            "directorScenes?.find((scene) => scene.id === contentNode.metadata?.directorSceneId) || null",
            "readNodeContent={(nodeId) => (nodeId ? nodesRef.current.find((item) => item.id === nodeId)?.metadata?.content : undefined)}",
            "onOpen={() => openDirectorWorkbench(contentNode.id)}",
            "inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}",
            "onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}",
            'target?.metadata?.generationMode || "image"',
        ]) expect(rendererSource).toContain(route);
    });
});
