import { describe, expect, test } from "bun:test";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("library create card convergence", () => {
    test("shares one create-card structure while pages retain their own actions", async () => {
        const [component, assets, skills] = await Promise.all([read("../src/components/ui/pc/library-create-card.tsx"), read("../src/pages/assets/index.tsx"), read("../src/pages/skills/index.tsx")]);

        expect(component).toContain('className={cn("library-create-card"');
        expect(component).toContain('className="library-create-cover"');
        expect(component).toContain('className="library-create-title"');
        expect(component).toContain('className="library-create-meta"');
        expect(assets).toContain('<LibraryCreateCard label="新增素材"');
        expect(assets).toContain("onClick={openCreate}");
        expect(skills).toContain('<LibraryCreateCard label="安装技能"');
        expect(skills).toContain("onClick={() => setInstallOpen(true)}");
        expect(assets).not.toContain('<button type="button" className="library-create-card"');
        expect(skills).not.toContain('<button type="button" className="library-create-card"');
    });
});
