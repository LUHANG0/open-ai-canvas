import { expect, test } from "bun:test";

import { hasCanvasTextSelection, isCanvasKeyboardUiTarget } from "../src/pages/canvas/use-canvas-keyboard";

test("Canvas copy shortcut yields to a real browser text selection", () => {
    expect(hasCanvasTextSelection(null)).toBe(false);
    expect(hasCanvasTextSelection({ isCollapsed: true, rangeCount: 1, toString: () => "Agent 文本" })).toBe(false);
    expect(hasCanvasTextSelection({ isCollapsed: false, rangeCount: 0, toString: () => "Agent 文本" })).toBe(false);
    expect(hasCanvasTextSelection({ isCollapsed: false, rangeCount: 1, toString: () => "" })).toBe(false);
    expect(hasCanvasTextSelection({ isCollapsed: false, rangeCount: 1, toString: () => "Agent 文本" })).toBe(true);
});

test("Canvas shortcuts yield to canvas panels and overlays", () => {
    const target = (matches: boolean) => ({ closest: () => matches }) as unknown as Element;
    expect(isCanvasKeyboardUiTarget(null)).toBe(false);
    expect(isCanvasKeyboardUiTarget(target(false))).toBe(false);
    expect(isCanvasKeyboardUiTarget(target(true))).toBe(true);
});

test("Canvas keyboard keeps node copy as the fallback when no text is selected", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/use-canvas-keyboard.ts", import.meta.url)).text();
    expect(source).toContain("if (hasCanvasTextSelection(window.getSelection())) return;");
    expect(source).toContain("event.preventDefault();\n                copySelectedNodes();");
});

test("Escape collapses the visible Agent before changing canvas selection", async () => {
    const source = await Bun.file(new URL("../src/pages/canvas/use-canvas-keyboard.ts", import.meta.url)).text();
    const escapeBlock = source.slice(source.indexOf('if (event.key === "Escape")'), source.indexOf("// 沉浸专注"));
    expect(escapeBlock).toContain("if (assistantOpen)");
    expect(escapeBlock).toContain("closeAgent();");
    expect(escapeBlock).toContain("return;");
});
