import { describe, expect, test } from "bun:test";

import { firstCanvasProjectChapter, resolveCanvasEmptyStateKind } from "../src/pages/canvas/canvas-empty-state-routing";
import { openCanvasCinematicAssistant } from "../src/pages/canvas/use-canvas-assistant-visibility";

describe("画布空状态分流", () => {
    test("根据节点、短剧开关和项目关联选择起点", () => {
        expect(resolveCanvasEmptyStateKind(1, false, null)).toBeNull();
        expect(resolveCanvasEmptyStateKind(0, false, null)).toBe("freeform");
        expect(resolveCanvasEmptyStateKind(0, true, null)).toBe("short-drama");
        expect(resolveCanvasEmptyStateKind(0, true, "project-1")).toBe("linked-project");
    });

    test("项目空状态按 position 选择首章且不修改原数组", () => {
        const chapters = [
            { id: "chapter-2", title: "第二章", position: 2 },
            { id: "chapter-1", title: "第一章", position: 1 },
        ];
        expect(firstCanvasProjectChapter(chapters)?.id).toBe("chapter-1");
        expect(chapters.map((chapter) => chapter.id)).toEqual(["chapter-2", "chapter-1"]);
        expect(firstCanvasProjectChapter()).toBeNull();
    });

    test("短剧空状态标记电影创作入口并以在线模式展开 Agent", () => {
        const calls: string[] = [];
        openCanvasCinematicAssistant(
            (active) => calls.push(`cinematic:${active}`),
            (mode) => calls.push(`open:${mode}`),
        );
        expect(calls).toEqual(["cinematic:true", "open:online"]);
    });
});
