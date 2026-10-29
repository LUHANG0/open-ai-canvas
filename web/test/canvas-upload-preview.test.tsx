import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { registerUploadPreview, uploadedResourcePreviewUrl, uploadPreviewUrl } from "@/services/canvas-upload-preview";
import { CanvasFileUploadContent } from "@/components/canvas/canvas-file-upload-content";
import { createImageUploadPlaceholder, uploadPreviewBlur } from "@/lib/canvas/canvas-file-upload";
import { canvasThemes } from "@/lib/canvas-theme";
import { setActiveUserScope } from "@/lib/user-scope";

test("upload previews stay in page memory, match the exact resource, isolate accounts and revoke safely", () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const dom = new Window({ url: "http://localhost/" });
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    const live = new Set<string>(); let seq = 0;
    Object.defineProperty(globalThis, "window", { configurable: true, value: dom });
    URL.createObjectURL = () => { const url = `blob:preview-${++seq}`; live.add(url); return url; };
    URL.revokeObjectURL = (url) => { live.delete(url); };
    const handles: ReturnType<typeof registerUploadPreview>[] = [];
    try {
        setActiveUserScope("a");
        const file = new File(["image"], "image.png", { type: "image/png" });
        const node = createImageUploadPlaceholder("node", file, { x: 0, y: 0 }, { width: 600, height: 400 });
        const preview = registerUploadPreview(node.id, file); handles.push(preview);
        expect(uploadPreviewUrl(node.id)).toBe("blob:preview-1");
        expect(JSON.stringify(node)).not.toContain("blob:");
        for (const mode of ["light", "dark"] as const) {
            const html = renderToStaticMarkup(<CanvasFileUploadContent node={{ ...node, metadata: { ...node.metadata, fileUploadProgress: 50 } }} theme={canvasThemes[mode]} reduceMotion />);
            expect(html).toContain('src="blob:preview-1"');
            expect(html).toContain("blur(13px)");
            expect(html).toContain('aria-valuenow="50"');
            expect(html).toContain('data-static="true"');
        }
        preview.bind("resource:first");
        expect(uploadPreviewUrl(node.id, "resource:first")).toBe("blob:preview-1");
        expect(uploadPreviewUrl(node.id, "resource:previous")).toBe("");
        expect(uploadedResourcePreviewUrl("resource:first")).toBe("blob:preview-1");
        setActiveUserScope("b");
        expect(uploadPreviewUrl(node.id)).toBe("");
        expect(uploadedResourcePreviewUrl("resource:first")).toBe("");
        setActiveUserScope("a");
        const next = registerUploadPreview(node.id, file); handles.push(next);
        expect(live.size).toBe(1);
        preview.release();
        expect(uploadPreviewUrl(node.id)).toBe("blob:preview-2");
        next.release();
        expect(live.size).toBe(0);
        expect(uploadPreviewUrl(node.id)).toBe("");
        expect(uploadPreviewBlur(0)).toBe(24);
        expect(uploadPreviewBlur(100)).toBe(2);
        expect(uploadPreviewBlur(NaN)).toBe(24);
    } finally {
        handles.forEach(handle => handle.release());
        URL.createObjectURL = create; URL.revokeObjectURL = revoke;
        if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
        dom.happyDOM.abort();
    }
});
