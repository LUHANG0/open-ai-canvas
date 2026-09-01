import { describe, expect, test } from "bun:test";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("PC workspace entry discovery", () => {
    test("keeps the plugin entry discoverable in the desktop command palette without changing mobile output", async () => {
        const source = await read("../src/components/layout/workspace-command-palette.tsx");

        expect(source).toContain('import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport"');
        expect(source).toContain("isPcBrandViewport && (features.pluginCenterEnabled || user?.role === \"admin\")");
        expect(source).toContain('toolEntry("plugins", "/plugins")');
    });

    test("exposes the command palette and workspace switcher with dialog and menu semantics", async () => {
        const [palette, navigation] = await Promise.all([
            read("../src/components/layout/workspace-command-palette.tsx"),
            read("../src/components/layout/workspace-sidebar-nav.tsx"),
        ]);

        expect(palette).toContain('role="dialog"');
        expect(palette).toContain('aria-modal="true"');
        expect(palette).toContain('aria-label="搜索工作区页面"');
        expect(navigation).toContain('aria-haspopup="menu"');
        expect(navigation).toContain('role="menu"');
        expect(navigation).toContain('role="menuitem"');
    });
});
