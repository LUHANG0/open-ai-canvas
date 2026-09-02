import { describe, expect, test } from "bun:test";

import { focusCanvasVersionFromCompare, resolveCanvasProjectFolderInsertHandler } from "../src/pages/canvas/canvas-project-library-routing";

describe("画布版本与素材弹窗路由", () => {
    test("从版本对比定位节点时先关闭弹窗再聚焦", () => {
        const calls: string[] = [];
        focusCanvasVersionFromCompare("version-2", () => calls.push("close"), (nodeId) => calls.push(`focus:${nodeId}`));
        expect(calls).toEqual(["close", "focus:version-2"]);
    });

    test("只有画布作用域开放项目文件夹整体插入", () => {
        const insert = (_folderId: string) => undefined;
        expect(resolveCanvasProjectFolderInsertHandler("canvas", insert)).toBe(insert);
        expect(resolveCanvasProjectFolderInsertHandler("timeline", insert)).toBeUndefined();
    });
});
