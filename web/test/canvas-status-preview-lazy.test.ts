import { describe, expect, test } from "bun:test";

async function source(path: string) {
    return Bun.file(new URL(path, import.meta.url)).text();
}

describe("canvas status media preview lazy loading", () => {
    test("loads the preview assembly only after a preview node opens", async () => {
        const statusSource = await source("../src/pages/canvas/canvas-project-status-dialogs.tsx");

        expect(statusSource).toContain('lazy(() => import("./canvas-project-media-preview")');
        expect(statusSource).toContain("previewNode?.metadata?.content ? (");
        expect(statusSource).toContain('<Suspense fallback={<CanvasStatusDialogLoading label="正在加载媒体预览…" />}>');
        expect(statusSource).toContain("<CanvasProjectMediaPreview node={previewNode} onClose={onClosePreview} />");
        expect(statusSource).not.toContain('from "@/components/video-player"');
        expect(statusSource).not.toContain("<Image");
    });

    test("keeps image and video preview behavior in the deferred module", async () => {
        const previewSource = await source("../src/pages/canvas/canvas-project-media-preview.tsx");

        expect(previewSource).toContain('import { VideoPlayer } from "@/components/video-player"');
        expect(previewSource).toContain("node.type === CanvasNodeType.Video");
        expect(previewSource).toContain("node.type === CanvasNodeType.Image");
        expect(previewSource).toContain('title="视频预览"');
        expect(previewSource).toContain("minScale: 0.5");
        expect(previewSource).toContain("maxScale: 12");
        expect(previewSource).toContain("onOpenChange: (open) => !open && onClose()");
    });
});
