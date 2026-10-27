import { describe, expect, test } from "bun:test";
import { CANVAS_SHORTCUTS, filterCanvasShortcuts, getCanvasShortcuts } from "../src/lib/canvas/canvas-shortcuts";

describe("canvas operation help", () => {
    test("formats actual keyboard commands for each platform", () => {
        for (const [platform, modifier, alt] of [["mac", "⌘", "⌥"], ["other", "Ctrl", "Alt"]] as const) {
            const catalog = getCanvasShortcuts({ platform });
            expect(catalog.find((item) => item.id === "search")?.keys).toEqual([[modifier, "F"]]);
            expect(catalog.find((item) => item.id === "focus")?.keys).toEqual([["Shift", modifier, "F"]]);
            expect(catalog.find((item) => item.id === "batch-connect")?.keys).toEqual([[alt, "L"]]);
            expect(catalog.find((item) => item.id === "pan")?.keys).toContainEqual(["Space", "左键拖动"]);
        }
        expect(getCanvasShortcuts({ platform: "mac" }).find((item) => item.id === "delete")?.keys).toContainEqual(["Delete"]);
        expect(getCanvasShortcuts({ platform: "mac" }).find((item) => item.id === "context-menu")?.keys).toContainEqual(["Control", "左键"]);
        expect(getCanvasShortcuts({ platform: "other" }).find((item) => item.id === "context-menu")?.keys).not.toContainEqual(["Control", "左键"]);
    });

    test("preferences change blank drag and wheel guidance without changing invariant gestures", () => {
        const defaults = getCanvasShortcuts({ platform: "other" });
        const pan = getCanvasShortcuts({ platform: "other", preferences: { blankDrag: "pan", mouseWheel: "pan" } });
        expect(defaults.find((item) => item.id === "box-select")?.keys[0]).toEqual(["空白处左键拖动"]);
        expect(pan.find((item) => item.id === "box-select")?.keys[0]).toEqual(["区域选择工具"]);
        expect(defaults.find((item) => item.id === "zoom-wheel")?.keys).toContainEqual(["鼠标滚轮", "缩放"]);
        expect(pan.find((item) => item.id === "zoom-wheel")?.keys).toContainEqual(["鼠标滚轮", "平移"]);
        expect(pan.find((item) => item.id === "zoom-wheel")?.keys).toContainEqual(["Ctrl", "滚轮"]);
        expect(pan.find((item) => item.id === "zoom-wheel")?.keys).toContainEqual(["触控板捏合"]);
    });

    test("searches current categorized instructions and modifier aliases", () => {
        expect(filterCanvasShortcuts("粘贴").map((item) => item.id)).toContain("paste");
        expect(filterCanvasShortcuts("Alt L", "all", { platform: "mac" }).map((item) => item.id)).toContain("batch-connect");
        expect(filterCanvasShortcuts("平移", "navigation", { preferences: { blankDrag: "pan", mouseWheel: "pan" } }).map((item) => item.id)).toContain("zoom-wheel");
        expect(filterCanvasShortcuts("", "common").every((item) => item.category === "common")).toBe(true);
        expect(filterCanvasShortcuts("", "all")).toHaveLength(CANVAS_SHORTCUTS.length);
        expect(new Set(CANVAS_SHORTCUTS.map((item) => item.id)).size).toBe(CANVAS_SHORTCUTS.length);
    });
});
