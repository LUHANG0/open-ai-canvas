import { describe, expect, test } from "bun:test";
import { resetCanvasHistoryUi, type CanvasHistoryUiResetters } from "../src/pages/canvas/use-canvas-history-ui-cleanup";

describe("画布历史恢复后的临时界面清理", () => {
    test("关闭悬浮工具栏和全部节点临时面板", () => {
        const calls: string[] = [];
        const names = [
            "dialog",
            "textEditor",
            "characterReference",
            "drawing",
            "info",
            "subtitle",
            "timeline",
            "superResolve",
            "preview",
            "scriptEditor",
            "portraitClearance",
            "director",
            "versionCompare",
            "frameDialog",
            "segmentDialog",
            "crop",
            "maskEdit",
            "annotation",
            "split",
            "upscale",
            "angle",
            "emotion",
        ] as const;
        const resetters = Object.fromEntries(
            names.map((name) => [name, (value: string | null) => {
                expect(value).toBeNull();
                calls.push(name);
            }]),
        ) as CanvasHistoryUiResetters;

        resetCanvasHistoryUi(() => calls.push("hoverToolbar"), resetters);

        expect(calls).toEqual(["hoverToolbar", ...names]);
    });

    test("项目入口只装配清理 hook，不再直接维护恢复回调", async () => {
        const source = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
        expect(source).toContain("useCanvasHistoryUiCleanup({");
        expect(source).not.toContain("historyRestoreUiRef.current = () => {");
    });
});
