import { describe, expect, test } from "bun:test";
import { attemptCanvasPaste, classifyCanvasContextMenuTarget } from "../src/pages/canvas/use-canvas-context-interactions";

describe("画布右键与粘贴交互", () => {
    test("右键目标区分节点连线、浮层和真实画布空白", () => {
        expect(classifyCanvasContextMenuTarget({ closest: (selector) => (selector.includes("data-node-id") ? {} : null) })).toBe("content");
        expect(classifyCanvasContextMenuTarget({ closest: (selector) => (selector.includes("data-canvas-no-zoom") ? {} : null) })).toBe("overlay");
        expect(classifyCanvasContextMenuTarget({ closest: () => null })).toBe("canvas");
        expect(classifyCanvasContextMenuTarget(null)).toBe("canvas");
    });

    test("画布内部复制内容拥有粘贴优先级时不读取系统剪贴板", async () => {
        let systemReads = 0;
        const result = await attemptCanvasPaste({
            position: { x: 10, y: 20 },
            shouldPreferCopiedNodes: () => true,
            pasteCopiedNodes: () => true,
            pasteSystemClipboard: async () => {
                systemReads += 1;
                return true;
            },
        });
        expect(result).toBe("handled");
        expect(systemReads).toBe(0);
    });

    test("系统剪贴板不可读时回退画布副本，并区分完全不可用", async () => {
        let copiedAvailable = true;
        const options = {
            position: { x: 10, y: 20 },
            shouldPreferCopiedNodes: () => false,
            pasteCopiedNodes: () => copiedAvailable,
            pasteSystemClipboard: async () => {
                throw new Error("permission denied");
            },
        };
        expect(await attemptCanvasPaste(options)).toBe("handled");
        copiedAvailable = false;
        expect(await attemptCanvasPaste(options)).toBe("unreadable");
    });
});
