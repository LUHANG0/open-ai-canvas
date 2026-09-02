import { expect, test } from "bun:test";

test("canvas node info modal is split from the toolbar and loaded only for an open target", async () => {
    const toolbarSource = await Bun.file(new URL("../src/components/canvas/canvas-node-toolbar.tsx", import.meta.url)).text();
    const modalSource = await Bun.file(new URL("../src/components/canvas/canvas-node-info-modal.tsx", import.meta.url)).text();
    const utilitySource = await Bun.file(new URL("../src/pages/canvas/canvas-project-utility-overlays.tsx", import.meta.url)).text();

    expect(toolbarSource).not.toContain("function CanvasNodeInfoModal");
    expect(toolbarSource).not.toContain('from "./canvas-node-info-modal"');
    expect(utilitySource).toContain('lazy(() => import("@/components/canvas/canvas-node-info-modal")');
    expect(utilitySource).toContain("info.open && info.node ? (");
    expect(utilitySource).toContain('label="正在加载节点信息…"');

    expect(modalSource).toContain("export function CanvasNodeInfoModal");
    expect(modalSource).toContain("onMetadataChange?.(node.id, { assetCategory: category })");
    expect(modalSource).toContain("onMetadataChange?.(node.id, { assetTags: tags })");
    expect(modalSource).toContain("Array.from(new Set(nextTags.map((item) => item.trim()).filter(Boolean)))");
    expect(modalSource).toContain("readOnly ? onUnauthorized?.() : removeAssetTag(tag)");
});
