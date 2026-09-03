import { expect, test } from "bun:test";

test("uncommon canvas node bodies load by actual node type without delaying common media paths", async () => {
    const source = await Bun.file(new URL("../src/components/canvas/canvas-node-content.tsx", import.meta.url)).text();

    const modules = [
        "markdown-node",
        "svg-node",
        "html-node",
        "panorama-node",
        "compare-node",
        "chart-node",
        "color-grade-node",
        "portrait-clearance-node",
    ];
    for (const moduleName of modules) {
        expect(source).toContain(`lazy(() => import("./nodes/${moduleName}")`);
        expect(source).not.toContain(`from "./nodes/${moduleName}"`);
    }

    expect(source).toContain("const DeferredRenderer = deferredNodeContentRenderers[props.node.type]");
    expect(source).toContain("<Suspense fallback={<DeferredNodeContentFallback theme={props.theme} />}>");
    expect(source).toContain('className="pointer-events-none h-full w-full overflow-hidden"');
    expect(source).not.toContain('className="fixed inset-0');
    expect(source).toContain('import { VideoPlayer } from "@/components/video-player"');
    expect(source).toContain("[CanvasNodeType.Text]: TextContent");
    expect(source).toContain("[CanvasNodeType.Image]: ImageNodeContent");
    expect(source).toContain("[CanvasNodeType.Audio]: AudioNodeContent");
    expect(source).toContain("[CanvasNodeType.Drawing]: DrawingContent");
});
