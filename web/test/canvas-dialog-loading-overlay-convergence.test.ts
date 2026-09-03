import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("canvas dialog loading overlay convergence", () => {
    test("preserves the shared dialog surface and optional close escape", async () => {
        const source = await read("../src/pages/canvas/canvas-dialog-loading-overlay.tsx");

        expect(source).toContain('bg-black/20 px-5 backdrop-blur-sm');
        expect(source).toContain('role="status"');
        expect(source).toContain('aria-live="polite"');
        expect(source).toContain("{onClose ? (");
        expect(source).toContain("onClick={onClose}");
        expect(source).toContain("关闭");
    });

    test("removes page-local copies from every canvas lazy dialog owner", async () => {
        const canvasRoot = fileURLToPath(new URL("../src/pages/canvas/", import.meta.url));
        const owners = [
            "canvas-project-script-editor.tsx",
            "canvas-project-entry-dialogs.tsx",
            "canvas-project-node-search.tsx",
            "canvas-project-utility-overlays.tsx",
            "canvas-project-library-dialogs.tsx",
            "canvas-project-media-dialogs.tsx",
            "canvas-project-status-dialogs.tsx",
        ];

        for (const owner of owners) {
            const source = await Bun.file(`${canvasRoot}/${owner}`).text();
            expect(source).toContain('from "./canvas-dialog-loading-overlay"');
            expect(source).toContain("<CanvasDialogLoadingOverlay");
            expect(source).not.toContain('className="fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-black/20');
        }
    });
});
