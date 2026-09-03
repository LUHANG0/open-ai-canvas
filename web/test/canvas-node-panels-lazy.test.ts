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
        expect(rendererSource).toContain('fallback={<CanvasInlinePanelLoading label="正在加载配置编排器…" minHeight={190} onClose={() => setDialogNodeId(null)} closeLabel="关闭节点设置" />}');
        expect(rendererSource).toContain('fallback={<CanvasInlinePanelLoading label="正在加载节点设置…" minHeight={190} onClose={() => setDialogNodeId(null)} closeLabel="关闭节点设置" />}');
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
        const [rendererSource, loadingSource] = await Promise.all([
            source("../src/pages/canvas/use-canvas-node-panel-renderer.tsx"),
            source("../src/pages/canvas/canvas-inline-panel-loading.tsx"),
        ]);

        expect(rendererSource).toContain("minHeight={190}");
        expect(loadingSource).toContain('className="flex w-full');
        expect(loadingSource).not.toContain("fixed inset-0");
        expect(loadingSource).toContain('role="status"');
        expect(loadingSource).toContain('aria-live="polite"');
        expect(loadingSource).toContain("aria-label={closeLabel}");
    });
});
