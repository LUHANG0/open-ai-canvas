import { describe, expect, test } from "bun:test";

async function source(path: string) {
    return Bun.file(new URL(path, import.meta.url)).text();
}

describe("canvas shortcuts modal lazy loading", () => {
    test("loads and mounts the shortcuts modal only while it is open", async () => {
        const topBarSource = await source("../src/pages/canvas/canvas-project-top-bar.tsx");

        expect(topBarSource).toContain('lazy(() => import("./canvas-shortcuts-modal")');
        expect(topBarSource).not.toContain('import { CanvasShortcutsModal } from "./canvas-shortcuts-modal"');
        expect(topBarSource).toContain("if (shortcutRequestNonce > 0) setShortcutsOpen(true)");
        expect(topBarSource).toContain("shortcutsOpen ? (");
        expect(topBarSource).toContain("<Suspense");
        expect(topBarSource).toContain('className="sr-only"');
        expect(topBarSource).toContain('role="status"');
        expect(topBarSource).toContain('aria-live="polite"');
        expect(topBarSource).toContain("正在加载画布快捷键…");
        expect(topBarSource).toContain("<CanvasShortcutsModal open onClose={() => setShortcutsOpen(false)} />");
    });

    test("keeps the deferred dialog keyboard and accessibility semantics", async () => {
        const modalSource = await source("../src/pages/canvas/canvas-shortcuts-modal.tsx");

        expect(modalSource).toContain("onCancel={onClose}");
        expect(modalSource).toContain("keyboard");
        expect(modalSource).toContain('aria-label="搜索画布快捷键"');
        expect(modalSource).toContain('aria-label="快捷键分类"');
        expect(modalSource).toContain('aria-live="polite"');
    });
});
