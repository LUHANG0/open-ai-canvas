import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { canvasMainToolbarRightInset } from "../src/pages/canvas/canvas-main-toolbar-state";

const root = resolve(import.meta.dir, "..");
const css = readFileSync(resolve(root, "src/pages/canvas/canvas-editor-pc.css"), "utf8");
const toolbarSource = readFileSync(resolve(root, "src/components/canvas/canvas-toolbar.tsx"), "utf8");

describe("Agent 打开时的画布主工具栏布局", () => {
    test("1024 和 1440 宽度下改为上下错层，不再同时预留左侧 320px", () => {
        const oldAvailableAt1024 = 1024 - 224 - (12 + 320) - canvasMainToolbarRightInset(true, 440);
        const nextAvailableAt1024 = 1024 - 224 - 12 - canvasMainToolbarRightInset(true, 440);
        const oldAvailableAt1440 = 1440 - 244 - (16 + 320) - canvasMainToolbarRightInset(true, 520);
        const nextAvailableAt1440 = 1440 - 244 - 16 - canvasMainToolbarRightInset(true, 520);

        expect(oldAvailableAt1024).toBe(12);
        expect(nextAvailableAt1024).toBe(332);
        expect(oldAvailableAt1440).toBe(324);
        expect(nextAvailableAt1440).toBe(644);
        expect(css).toContain('bottom: calc(var(--canvas-inset-y) + var(--space-12));');
        expect(css).toContain("left: var(--canvas-inset-x);");
        expect(css).not.toContain("left: calc(var(--canvas-inset-x) + 320px);");
    });

    test("极端窄宽时仅 Dock 局部滚动，不越过 Agent 边界", () => {
        expect(css).toContain('.pc-canvas-workspace[data-assistant-open="true"] .pc-canvas-toolbar > .canvas-floating-dock');
        expect(css).toContain("max-width: 100%;");
        expect(css).toContain("overflow-x: auto;");
        expect(css).toContain("overscroll-behavior-inline: contain;");
        expect(css).toContain("scrollbar-width: none;");
        expect(toolbarSource).toContain('className="canvas-floating-dock pointer-events-auto min-w-0 max-w-full"');
    });
});
