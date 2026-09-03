import { describe, expect, test } from "bun:test";

async function source(path: string) {
    return Bun.file(new URL(path, import.meta.url)).text();
}

describe("canvas shortcuts modal lazy loading", () => {
    test("keeps the shortcuts owner mounted outside the focus-sensitive top bar", async () => {
        const [dialogSource, projectSource, topBarSource] = await Promise.all([
            source("../src/pages/canvas/canvas-project-shortcuts-dialog.tsx"),
            source("../src/pages/canvas/project.tsx"),
            source("../src/pages/canvas/canvas-project-top-bar.tsx"),
        ]);

        expect(dialogSource).toContain('lazy(() => import("./canvas-shortcuts-modal")');
        expect(dialogSource).not.toContain('import { CanvasShortcutsModal } from "./canvas-shortcuts-modal"');
        expect(dialogSource).toContain("if (!open) return null");
        expect(dialogSource).toContain("<Suspense");
        expect(dialogSource).toContain('className="sr-only"');
        expect(dialogSource).toContain('role="status"');
        expect(dialogSource).toContain('aria-live="polite"');
        expect(dialogSource).toContain("正在加载画布快捷键…");
        expect(dialogSource).toContain("<CanvasShortcutsModal open onClose={onClose} />");
        expect(projectSource).toContain("<CanvasProjectShortcutsDialog open={shortcutsOpen}");
        expect(projectSource).toContain("onOpenShortcuts: () => setShortcutsOpen(true)");
        expect(projectSource).toContain("onOpenShortcuts={() => setShortcutsOpen(true)}");
        expect(topBarSource).not.toContain("CanvasShortcutsModal");
        expect(topBarSource).not.toContain("shortcutRequestNonce");
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
