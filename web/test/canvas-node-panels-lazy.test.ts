import { describe, expect, test } from "bun:test";

async function source(path: string) {
    return Bun.file(new URL(path, import.meta.url)).text();
}

describe("canvas node settings panels lazy loading", () => {
    test("defers both panel implementations and keeps their props type-only", async () => {
        const rendererSource = await source("../src/pages/canvas/use-canvas-node-panel-renderer.tsx");

        expect(rendererSource).toContain('lazy(() => import("@/components/canvas/canvas-config-composer")');
        expect(rendererSource).toContain('lazy(() => import("@/components/canvas/canvas-node-prompt-panel")');
        expect(rendererSource).not.toContain('import { CanvasConfigComposer } from "@/components/canvas/canvas-config-composer"');
        expect(rendererSource).not.toContain('import { CanvasNodePromptPanel } from "@/components/canvas/canvas-node-prompt-panel"');
        expect(rendererSource).toContain('import type { CanvasConfigComposer as CanvasConfigComposerComponent }');
        expect(rendererSource).toContain('import type { CanvasNodePromptPanel as CanvasNodePromptPanelComponent }');
        expect(rendererSource).toContain("type CanvasConfigComposerProps = ComponentProps<typeof CanvasConfigComposerComponent>");
        expect(rendererSource).toContain("type CanvasNodePromptPanelProps = ComponentProps<typeof CanvasNodePromptPanelComponent>");
    });

    test("preserves config and prompt routing with all callbacks", async () => {
        const rendererSource = await source("../src/pages/canvas/use-canvas-node-panel-renderer.tsx");

        expect(rendererSource).toContain('if (kind === "config")');
        expect(rendererSource).toContain('fallback={<CanvasNodePanelLoading label="正在加载配置编排器…" onClose={() => setDialogNodeId(null)} />}');
        expect(rendererSource).toContain('fallback={<CanvasNodePanelLoading label="正在加载节点设置…" onClose={() => setDialogNodeId(null)} />}');
        for (const callback of [
            "onChange={(composerContent) => onConfigChange(panelNode.id, { composerContent })}",
            "onMetadataChange={(patch) => onConfigChange(panelNode.id, patch)}",
            "onPromptChange={onPromptChange}",
            "onConfigChange={onConfigChange}",
            "onGenerate={onGenerate}",
            "onRemoveReference={onRemoveReference}",
            "onNodeMouseDown={onNodeMouseDown}",
            "onImageSettingsOpenChange={onImageSettingsOpenChange}",
            "onClose={() => setDialogNodeId(null)}",
        ]) expect(rendererSource).toContain(callback);
    });

    test("keeps the closable fallback inside the existing overlay content flow", async () => {
        const rendererSource = await source("../src/pages/canvas/use-canvas-node-panel-renderer.tsx");

        expect(rendererSource).toContain('className="flex min-h-[190px] w-full');
        expect(rendererSource).not.toContain("fixed inset-0");
        expect(rendererSource).toContain('role="status" aria-live="polite"');
        expect(rendererSource).toContain('aria-label="关闭节点设置"');
    });
});
