import { describe, expect, test } from "bun:test";

describe("画布主视口层级", () => {
    test("图形层、节点动作、节点图与世界层由同一视口组件装配", async () => {
        const source = await Bun.file(new URL("../src/pages/canvas/canvas-project-viewport.tsx", import.meta.url)).text();
        const canvasIndex = source.indexOf("<InfiniteCanvas");
        const graphicsIndex = source.indexOf("<CanvasLeaferGraphicsLayer");
        const actionIndex = source.indexOf("<CanvasNodeActionContext.Provider");
        const graphIndex = source.indexOf("<CanvasNodeGraphContext.Provider");
        const worldIndex = source.indexOf("<CanvasProjectWorldLayers");
        expect(canvasIndex).toBeGreaterThan(-1);
        expect(graphicsIndex).toBeGreaterThan(canvasIndex);
        expect(actionIndex).toBeGreaterThan(canvasIndex);
        expect(graphIndex).toBeGreaterThan(actionIndex);
        expect(worldIndex).toBeGreaterThan(graphIndex);
    });
});
