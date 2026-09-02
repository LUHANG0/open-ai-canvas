import { describe, expect, test } from "bun:test";
import { clearCanvasWorkspace, type CanvasClearUiResetters } from "../src/pages/canvas/use-canvas-clear";

describe("清空画布工作区", () => {
    test("按原顺序清空内容、节点面板、选择与确认框", () => {
        const calls: string[] = [];
        const resetterNames = ["textEditor", "drawing", "info", "subtitle", "crop", "maskEdit", "annotation", "angle", "emotion", "preview", "running"] as const;
        const resetters = Object.fromEntries(
            resetterNames.map((name) => [name, (value: string | null) => {
                expect(value).toBeNull();
                calls.push(name);
            }]),
        ) as CanvasClearUiResetters;

        clearCanvasWorkspace({
            setNodes: (value) => {
                expect(value).toEqual([]);
                calls.push("nodes");
            },
            setConnections: (value) => {
                expect(value).toEqual([]);
                calls.push("connections");
            },
            resetters,
            deselectCanvas: () => calls.push("deselect"),
            setClearConfirmOpen: (value) => {
                expect(value).toBe(false);
                calls.push("confirm");
            },
            clearCanvasFiles: () => calls.push("files"),
        });

        expect(calls).toEqual(["nodes", "connections", ...resetterNames, "deselect", "confirm", "files"]);
    });
});
