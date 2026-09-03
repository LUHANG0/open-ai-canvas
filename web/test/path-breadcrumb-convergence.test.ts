import { describe, expect, test } from "bun:test";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("path breadcrumb convergence", () => {
    test("shares one accessible folder path across project assets and Eagle", async () => {
        const [component, projectAssets, eagle] = await Promise.all([read("../src/components/ui/pc/path-breadcrumb.tsx"), read("../src/pages/projects/detail/assets.tsx"), read("../src/pages/plugins/eagle.tsx")]);

        expect(component).toContain("<nav aria-label={ariaLabel}");
        expect(component).toContain('type="button"');
        expect(component).toContain('aria-hidden="true"');
        expect(component).toContain("onItemClick(item.key)");
        expect(projectAssets).toContain("<PathBreadcrumb");
        expect(projectAssets).toContain('ariaLabel="素材目录路径"');
        expect(eagle).toContain("<PathBreadcrumb");
        expect(eagle).toContain('ariaLabel="Eagle 文件夹路径"');
        expect(projectAssets).not.toContain('className="truncate rounded px-1.5 py-1 font-medium text-foreground hover:bg-surface-hover"');
        expect(eagle).not.toContain('className="truncate rounded px-1.5 py-1 font-medium text-foreground hover:bg-surface-hover"');
    });
});
