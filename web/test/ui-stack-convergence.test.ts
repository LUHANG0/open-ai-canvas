import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("UI stack convergence", () => {
    test("keeps one canonical workspace state family in the neutral UI layer", async () => {
        const [stateSource, dataDisplaySource, barrelSource, legacyExists] = await Promise.all([
            read("../src/components/ui/pc/workspace-state.tsx"),
            read("../src/components/ui/pc/data-display.tsx"),
            read("../src/components/ui/pc/index.ts"),
            Bun.file(new URL("../src/components/layout/workspace-state.tsx", import.meta.url)).exists(),
        ]);

        expect(stateSource).toContain("export function WorkspaceState");
        expect(stateSource).toContain("export function WorkspaceLoadingState");
        expect(stateSource).toContain("export function WorkspaceErrorState");
        expect(barrelSource).toContain('from "./workspace-state"');
        expect(dataDisplaySource).not.toContain("export function EmptyState");
        expect(legacyExists).toBeFalse();
    });

    test("does not reintroduce the removed layout import path", async () => {
        const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
        const glob = new Bun.Glob("**/*.{ts,tsx}");
        const offenders: string[] = [];

        for await (const path of glob.scan({ cwd: sourceRoot, absolute: true, onlyFiles: true })) {
            const source = await Bun.file(path).text();
            if (source.includes("@/components/layout/workspace-state")) offenders.push(path.slice(sourceRoot.length + 1));
        }

        expect(offenders).toEqual([]);
    });

    test("keeps user page scaffolds in the neutral UI layer and the legacy path admin-only", async () => {
        const [pageSource, compatibilitySource] = await Promise.all([read("../src/components/ui/pc/page.tsx"), read("../src/components/layout/workspace-page.tsx")]);

        expect(pageSource).toContain("export function WorkspacePage");
        expect(pageSource).toContain("export function PageHeader");
        expect(pageSource).toContain("export function ListToolbar");
        expect(pageSource).toContain("export function TableSurface");
        expect(pageSource).toContain("export function CollectionGrid");
        expect(pageSource).toContain("export function PaginationBar");
        expect(compatibilitySource).toContain("Admin compatibility boundary");
        expect(compatibilitySource).not.toContain("export function");

        const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
        const glob = new Bun.Glob("**/*.{ts,tsx}");
        const nonAdminImports: string[] = [];

        for await (const path of glob.scan({ cwd: sourceRoot, absolute: true, onlyFiles: true })) {
            const source = await Bun.file(path).text();
            const relativePath = path.slice(sourceRoot.length);
            if (source.includes("@/components/layout/workspace-page") && !relativePath.startsWith("pages/admin/")) nonAdminImports.push(relativePath);
        }

        expect(nonAdminImports).toEqual([]);
    });

    test("does not publish unused generic upload or media component families", async () => {
        const [barrelSource, cssSource, uploadExists, mediaExists] = await Promise.all([
            read("../src/components/ui/pc/index.ts"),
            read("../src/components/ui/pc/pc-ui.css"),
            Bun.file(new URL("../src/components/ui/pc/upload.tsx", import.meta.url)).exists(),
            Bun.file(new URL("../src/components/ui/pc/media.tsx", import.meta.url)).exists(),
        ]);

        expect(uploadExists).toBeFalse();
        expect(mediaExists).toBeFalse();
        expect(barrelSource).not.toContain('from "./upload"');
        expect(barrelSource).not.toContain('from "./media"');
        expect(cssSource).not.toContain(".pc-upload-");
        expect(cssSource).not.toContain(".pc-file-dropzone");
        expect(cssSource).not.toContain(".pc-media-thumbnail");
        expect(cssSource).not.toContain(".pc-media-fallback");
    });
});
