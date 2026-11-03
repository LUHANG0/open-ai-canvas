import { afterAll, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import type { ComponentProps } from "react";
import type { CanvasNodeData } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    Element: dom.Element,
    Node: dom.Node,
    Event: dom.Event,
    CustomEvent: dom.CustomEvent,
    MutationObserver: dom.MutationObserver,
    localStorage: dom.localStorage,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// React DOM must load after browser globals; the content observer must attach
// before the real world layer imports its node component (module-boundary test).
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const content = await import("@/components/canvas/canvas-node-content");
const actualContent = content.CanvasNodeContent;
const rendered: string[] = [];
// Observe real content execution without replacing its media or editing behavior.
const observation = spyOn(content, "CanvasNodeContent").mockImplementation((props) => {
    rendered.push(props.node.id);
    return actualContent(props);
});
const { CanvasProjectWorldLayers } = await import("@/pages/canvas/canvas-project-world-layers");
const { CanvasNodeType } = await import("@/types/canvas");
const { canvasNodeUsesProjectContent } = await import("@/lib/canvas/canvas-node-content-routing");
const noop = () => {};
const node = (type: CanvasNodeData["type"], metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({ id: "node", type, title: "Original title", position: { x: 0, y: 0 }, width: 240, height: 160, metadata });
function options(data: CanvasNodeData[]): ComponentProps<typeof CanvasProjectWorldLayers> {
    return {
        projectId: "project-a",
        viewportScale: 1,
        connectionLayerBounds: { left: 0, top: 0, width: 800, height: 600 },
        displayConnections: [],
        selectedConnectionId: null,
        relatedConnectionIds: new Set(),
        scriptScrollTopById: {},
        connectionTargetNodeId: null,
        isConnecting: false,
        connectionApproach: null,
        nodeById: new Map(data.map((n) => [n.id, n])),
        visibleNodes: data,
        nodeRenderLODById: new Map(data.map((n) => [n.id, "full"])),
        nodeStackOrder: [],
        frameChildrenById: new Map(),
        linkedFolderPreviewNodesById: new Map(),
        dragPreview: null,
        selectedNodeIds: new Set(),
        frameDropTargetId: null,
        relatedNodeIds: new Set(),
        activeNodeId: null,
        selectionBox: null,
        batchChildCountById: new Map(),
        collapsingBatchIds: new Set(),
        openingBatchIds: new Set(),
        batchMotionById: new Map(),
        showImageInfo: false,
        resourceReferenceByNodeId: new Map(),
        mentionReferencesByNodeId: new Map(),
        selectedNodeBounds: null,
        batchSourceNodeIds: [],
        batchConnectionPreview: null,
        isNodeDragging: false,
        selectionBoundsElementRef: { current: null },
        renderCanvasNodeContent: () => null,
        onConnectionSelect: noop,
        onConnectionContextMenu: noop,
        onNodeMouseDown: noop,
        onNodeHoverStart: noop,
        onNodeHoverEnd: noop,
        onConnectStart: noop,
        onNodeResize: noop,
        onToggleFrame: noop,
        onFolderStyleChange: noop,
        onFolderThemeChange: noop,
        onNodeTitleChange: noop,
        onNodeContextMenu: noop,
        onNodeContentChange: noop,
        onToggleBatch: noop,
        onSetBatchPrimary: noop,
        onRetry: noop,
        onReloadResource: noop,
        onOpenTaskDetails: noop,
        onViewImage: noop,
        onReplaceMedia: noop,
        onOpenTextEditor: noop,
        onOpenPrevis: noop,
        onOpenDrawing: noop,
        onStartBatchConnection: noop,
    };
}
async function fixture(props: ComponentProps<typeof CanvasProjectWorldLayers>) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = async (next: typeof props) => {
        await act(async () => root.render(<CanvasProjectWorldLayers {...next} />));
    };
    await render(props);
    return {
        host,
        render,
        cleanup: async () => {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}
afterAll(async () => {
    observation.mockRestore();
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("ordinary media content does not execute again for unrelated project renderer or previs actions", async () => {
    const data = [CanvasNodeType.Image, CanvasNodeType.Video, CanvasNodeType.Audio].map((type, i) => ({ ...node(type), id: `media-${i}` }));
    const props = options(data);
    const f = await fixture(props);
    try {
        rendered.length = 0;
        await f.render({
            ...props,
            renderCanvasNodeContent: () => {
                throw Error("ordinary media used project content");
            },
            onOpenPrevis: () => {
                throw Error("ordinary media used previs action");
            },
        });
        expect(rendered).toEqual([]);
        expect(f.host.querySelector('[data-node-id="media-0"] .canvas-node-shell')).not.toBeNull();
    } finally {
        await f.cleanup();
    }
});

test("image conversion to previs and back changes the real body route and uses the latest project action", async () => {
    const calls: string[] = [];
    const image = node(CanvasNodeType.Image);
    const props = options([image]);
    const f = await fixture(props);
    try {
        const previs = { ...image, metadata: { previsSceneId: "scene-a" } };
        const custom = { ...options([previs]), renderCanvasNodeContent: () => <section aria-label="Previs controls" />, onOpenPrevis: () => calls.push("project-a") };
        await f.render(custom);
        expect(f.host.querySelector('[aria-label="Previs controls"]')).not.toBeNull();
        const config = { ...image, type: CanvasNodeType.Config };
        await f.render({ ...options([config]), renderCanvasNodeContent: () => <section aria-label="Config controls" /> });
        expect(f.host.querySelector('[aria-label="Config controls"]')).not.toBeNull();
        await f.render(custom);
        await f.render({ ...custom, projectId: "project-b", onOpenPrevis: () => calls.push("project-b") });
        await act(async () => {
            f.host.querySelector(".canvas-node-shell")!.dispatchEvent(new dom.MouseEvent("dblclick", { bubbles: true }) as unknown as Event);
        });
        expect(calls).toEqual(["project-b"]);
        await f.render({ ...options([image]), renderCanvasNodeContent: () => <section aria-label="Stale custom content" /> });
        expect(f.host.querySelector('[aria-label="Previs controls"]')).toBeNull();
        expect(f.host.querySelector('[aria-label="Stale custom content"]')).toBeNull();
    } finally {
        await f.cleanup();
    }
});

test("title editing survives project action changes, commits trimmed text and rejects edits when locked", async () => {
    const data = node(CanvasNodeType.Image);
    const titles: string[] = [];
    const props = { ...options([data]), onNodeTitleChange: (_id: string, title: string) => titles.push(title) };
    const f = await fixture(props);
    try {
        await act(async () => {
            (f.host.querySelector('[aria-label="编辑节点名称：Original title"]') as HTMLButtonElement).click();
        });
        const input = f.host.querySelector<HTMLInputElement>('[aria-label="节点名称"]')!;
        await f.render({ ...props, renderCanvasNodeContent: () => null, onOpenPrevis: () => {} });
        expect(f.host.querySelector('[aria-label="节点名称"]')).toBe(input);
        await act(async () => {
            const set = Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!;
            set.call(input, "  New title  ");
            input.dispatchEvent(new dom.Event("input", { bubbles: true }) as unknown as Event);
        });
        expect(titles.at(-1)).toBe("  New title  ");
        await act(async () => {
            input.dispatchEvent(new dom.FocusEvent("focusout", { bubbles: true }) as unknown as Event);
        });
        expect(titles.at(-1)).toBe("New title");
        const locked = { ...data, metadata: { locked: true } };
        await f.render({ ...options([locked]), onNodeTitleChange: props.onNodeTitleChange });
        expect(f.host.querySelector('[aria-label="编辑节点名称：Original title"]')).toBeNull();
    } finally {
        await f.cleanup();
    }
});

test("project content routing preserves metadata precedence and story editing boundaries", () => {
    for (const type of [CanvasNodeType.Config, CanvasNodeType.Script, CanvasNodeType.BatchTable]) expect(canvasNodeUsesProjectContent(node(type))).toBe(true);
    expect(canvasNodeUsesProjectContent(node(CanvasNodeType.Image, { workflowKind: "character" }))).toBe(false);
    expect(canvasNodeUsesProjectContent(node(CanvasNodeType.Image, { workflowKind: "character", characterAssetId: "character" }))).toBe(true);
    expect(canvasNodeUsesProjectContent(node(CanvasNodeType.Text, { workflowKind: "story_input" }))).toBe(true);
    expect(canvasNodeUsesProjectContent(node(CanvasNodeType.Text, { workflowKind: "story_input" }), true)).toBe(false);
    expect(canvasNodeUsesProjectContent(node(CanvasNodeType.Text, { workflowKind: "styleboard" }))).toBe(true);
    expect(canvasNodeUsesProjectContent(node(CanvasNodeType.Text, { workflowKind: "styleboard", content: "Chosen style" }))).toBe(false);
    expect(canvasNodeUsesProjectContent(node(CanvasNodeType.Video, { previsSceneId: "scene" }))).toBe(true);
    expect(canvasNodeUsesProjectContent(node(CanvasNodeType.Config, { fileUpload: "uploading" }))).toBe(false);
    expect(canvasNodeUsesProjectContent(node(CanvasNodeType.Video, { previsSceneId: "scene", fileUpload: "error" }))).toBe(false);
});

test("image reference presentation changes do not render content, but reference presence still invalidates", async () => {
    const image = node(CanvasNodeType.Image);
    const reference: CanvasResourceReference = { id: "ref", nodeId: image.id, kind: "image", label: "图片1", title: "Reference title", active: false };
    const props = { ...options([image]), resourceReferenceByNodeId: new Map([[image.id, reference]]) };
    const f = await fixture(props);
    try {
        rendered.length = 0;
        await f.render({ ...props, resourceReferenceByNodeId: new Map([[image.id, { ...reference, label: "图片9", title: "Different title", active: true, previewUrl: "/different" }]]) });
        expect(rendered).toEqual([]);
        expect(f.host.querySelector('[title="Different title"]')).toBeNull();
        await f.render({ ...props, resourceReferenceByNodeId: new Map() });
        expect(rendered).toEqual([image.id]);
        rendered.length = 0;
        await f.render(props);
        expect(rendered).toEqual([image.id]);
    } finally {
        await f.cleanup();
    }
});

test("non-image badges update each consumed field and disappear across presence or type changes", async () => {
    const image = node(CanvasNodeType.Image);
    const text = { ...image, type: CanvasNodeType.Text, metadata: { content: "Body text" } };
    const reference: CanvasResourceReference = { id: "ref", nodeId: image.id, kind: "text", label: "文本1", title: "First reference title", active: false };
    const initial = { ...options([image]), resourceReferenceByNodeId: new Map([[image.id, reference]]) };
    const f = await fixture(initial);
    try {
        const props = options([text]);
        const renderReference = (r?: CanvasResourceReference) => f.render({ ...props, resourceReferenceByNodeId: r ? new Map([[text.id, r]]) : new Map() });
        await renderReference(reference);
        let badge = f.host.querySelector<HTMLElement>('[title="First reference title"]')!;
        expect(badge.textContent).toBe("文本1");
        expect(badge.style.opacity).toBe("0.75");
        const relabeled = { ...reference, label: "文本2" };
        await renderReference(relabeled);
        expect(f.host.querySelector('[title="First reference title"]')!.textContent).toBe("文本2");
        const retitled = { ...relabeled, title: "Latest reference title" };
        await renderReference(retitled);
        expect(f.host.querySelector('[title="First reference title"]')).toBeNull();
        badge = f.host.querySelector<HTMLElement>('[title="Latest reference title"]')!;
        expect(badge.textContent).toBe("文本2");
        await renderReference({ ...retitled, active: true });
        expect(f.host.querySelector<HTMLElement>('[title="Latest reference title"]')!.style.opacity).toBe("1");
        await renderReference();
        expect(f.host.querySelector('[title="Latest reference title"]')).toBeNull();
        await renderReference(reference);
        expect(f.host.querySelector('[title="First reference title"]')).not.toBeNull();
        await f.render(initial);
        expect(f.host.querySelector('[title="First reference title"]')).toBeNull();
    } finally {
        await f.cleanup();
    }
});
