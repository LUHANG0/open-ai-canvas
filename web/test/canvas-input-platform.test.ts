import { expect, test } from "bun:test";

import { formatCanvasShortcutKey, getCanvasInputPlatform, isCanvasSecondaryClick } from "../src/lib/canvas/canvas-input-platform";

test("secondary click includes right button everywhere and Control-left only on Mac", () => {
    for (const platform of ["mac", "other"] as const) {
        expect(isCanvasSecondaryClick({ button: 2 }, platform)).toBe(true);
        expect(isCanvasSecondaryClick({ button: 0 }, platform)).toBe(false);
        expect(isCanvasSecondaryClick({ button: 1, ctrlKey: true }, platform)).toBe(false);
    }
    expect(isCanvasSecondaryClick({ button: 0, ctrlKey: true }, "mac")).toBe(true);
    expect(isCanvasSecondaryClick({ button: 0, ctrlKey: true }, "other")).toBe(false);
});

test("shortcut labels use the current platform while ordinary keys remain unchanged", () => {
    for (const key of ["Ctrl", "Cmd", "Mod", "Ctrl/Cmd"]) {
        expect(formatCanvasShortcutKey(key, "mac")).toBe("⌘");
        expect(formatCanvasShortcutKey(key, "other")).toBe("Ctrl");
    }
    expect(formatCanvasShortcutKey("Alt", "mac")).toBe("⌥");
    expect(formatCanvasShortcutKey("Shift", "mac")).toBe("⇧");
    expect(formatCanvasShortcutKey("Delete", "mac")).toBe("⌫");
    expect(formatCanvasShortcutKey("Enter", "mac")).toBe("↵");
    expect(formatCanvasShortcutKey("Shift", "other")).toBe("Shift");
    expect(formatCanvasShortcutKey("Alt", "other")).toBe("Alt");
    expect(formatCanvasShortcutKey("Backspace", "other")).toBe("Backspace");
    expect(formatCanvasShortcutKey("Delete", "other")).toBe("Delete");
    expect(formatCanvasShortcutKey("Escape", "other")).toBe("Esc");
    expect(formatCanvasShortcutKey("V", "mac")).toBe("V");
    expect(formatCanvasShortcutKey("滚轮", "other")).toBe("滚轮");
});

test("platform detection is SSR-safe and prefers browser platform metadata", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
        Reflect.deleteProperty(globalThis, "navigator");
        expect(getCanvasInputPlatform()).toBe("other");
        Object.defineProperty(globalThis, "navigator", { configurable: true, value: { platform: "MacIntel", userAgent: "test" } });
        expect(getCanvasInputPlatform()).toBe("mac");
        expect(isCanvasSecondaryClick({ button: 0, ctrlKey: true })).toBe(true);
        Object.defineProperty(globalThis, "navigator", { configurable: true, value: { platform: "Win32", userAgent: "test" } });
        expect(getCanvasInputPlatform()).toBe("other");
        Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgentData: { platform: "macOS" }, platform: "Linux" } });
        expect(getCanvasInputPlatform()).toBe("mac");
        Object.defineProperty(globalThis, "navigator", { configurable: true, value: { platform: "", userAgent: "Mozilla Macintosh" } });
        expect(getCanvasInputPlatform()).toBe("mac");
    } finally {
        if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
        else Reflect.deleteProperty(globalThis, "navigator");
    }
});
