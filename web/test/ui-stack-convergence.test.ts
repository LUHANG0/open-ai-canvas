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
});
