import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("asset library command colors", () => {
    test("keeps the legacy white header override off the unified library pages", () => {
        const css = readFileSync(resolve(import.meta.dir, "../src/styles/globals.css"), "utf8");
        const page = readFileSync(resolve(import.meta.dir, "../src/pages/assets/index.tsx"), "utf8");

        expect(css).toContain("html:not(.dark) .library-page:not(.assets-library-page):not(.task-library-page):not(.pc-projects-page) .app-page-header .ant-btn");
        expect(css).toContain("html:not(.dark) .canvas-library-page:not(.assets-library-page):not(.task-library-page):not(.pc-canvas-library-page) .app-page-header .ant-btn");
        expect(css).not.toContain("html:not(.dark) .library-page .app-page-header .ant-btn");
        expect(page).toContain('className="assets-primary-action" type="primary"');
    });

    test("preserves the shared danger color for batch deletion", () => {
        const css = readFileSync(resolve(import.meta.dir, "../src/styles/globals.css"), "utf8");
        const pageCss = readFileSync(resolve(import.meta.dir, "../src/pages/assets/assets-pc.css"), "utf8");
        const page = readFileSync(resolve(import.meta.dir, "../src/pages/assets/index.tsx"), "utf8");

        expect(page).toContain('size="small" danger icon={<Trash2');
        expect(page).toContain("okButtonProps={{ danger: true }}");
        expect(css).not.toContain(".assets-batch-actions .ant-btn");
        expect(pageCss).not.toContain(".assets-batch-actions .ant-btn");
    });
});
