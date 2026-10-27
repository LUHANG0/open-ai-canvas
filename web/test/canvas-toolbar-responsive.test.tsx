import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { ComponentProps, ReactNode } from "react";

const dom = new Window({ url: "http://localhost/", width: 390, height: 844 });
Object.defineProperty(dom.Element.prototype, "animate", { configurable: true, value: undefined });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, localStorage: dom.localStorage, getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// Load React DOM and the components after installing the DOM: this deliberately
// exercises their browser module-initialization boundary rather than SSR mode.
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasToolbar } = await import("@/components/canvas/canvas-toolbar");
const { CanvasZoomControls } = await import("@/components/canvas/canvas-zoom-controls");
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture(element: ReactNode) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(element); });
    const click = async (scope: ParentNode, label: string) => {
        const button = scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
        if (!button) throw new Error(`Missing button: ${label}`);
        await act(async () => { button.click(); });
    };
    return { host, click, cleanup: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}

function toolbarProps(calls: string[]): ComponentProps<typeof CanvasToolbar> {
    const record = (name: string) => () => { calls.push(name); };
    return {
        selectedCount: 2, workspaceMode: "professional", canvasTool: "box-select", onToolChange: (tool) => calls.push(tool), isProjectLinked: false, canUndo: true, canRedo: true,
        appearance: { mode: "light" }, backgroundMode: "dots", showImageInfo: true,
        onAddImage: record("image"), onAddVideo: record("video"), onAddAudio: record("audio"), onAddText: record("text"), onChooseStyle: record("style"), onAddScript: record("script"), onAddFrame: record("frame"), onAddFolder: record("folder"), onAddDrawing: record("drawing"), onAddExtensionNode: record("extension"), onAddWorkflow: record("workflow"), onOpenPrevis: record("previs"), onUndo: record("undo"), onRedo: record("redo"), onUpload: record("upload"), onDelete: record("delete"), onClear: record("clear"), onDeselect: record("deselect"), onAppearanceChange: record("appearance"), onSaveAppearanceDefault: record("save-appearance"), onBackgroundModeChange: record("background"), onShowImageInfoChange: record("info"), onOpenWorkspace: record("workspace"), onOpenMyAssets: record("assets"), onOpenProjectCharacters: record("characters"),
    };
}

test("compact toolbar retains selection, creation, history and navigation actions", async () => {
    const calls: string[] = [];
    const f = await fixture(<CanvasToolbar {...toolbarProps(calls)} />);
    try {
        const primary = f.host.querySelector(".canvas-compact-toolbar")!;
        await f.click(primary, "抓手工具");
        expect(calls).toEqual(["move"]);
        await f.click(primary, "添加节点");
        const upload = Array.from(f.host.querySelectorAll<HTMLButtonElement>(".canvas-toolbar-popover button")).find((button) => button.textContent?.includes("上传文件"));
        expect(upload).toBeDefined();
        await act(async () => { upload!.click(); });
        expect(calls).toContain("upload");
        expect(f.host.querySelector(".canvas-toolbar-popover")).toBeNull();
        for (const [label, action] of [["撤销", "undo"], ["重做", "redo"], ["删除 2 个节点", "delete"], ["清空画布", "clear"], ["工作区", "workspace"], ["素材库", "assets"]]) {
            await f.click(primary, "更多画布工具");
            await f.click(f.host.querySelector('[role="region"][aria-label="更多画布工具"]')!, label!);
            expect(calls).toContain(action!);
            expect(f.host.querySelector('[role="region"][aria-label="更多画布工具"]')).toBeNull();
        }
    } finally { await f.cleanup(); }
});

test("compact history respects disabled undo and redo and Escape closes More", async () => {
    const calls: string[] = [];
    const f = await fixture(<CanvasToolbar {...toolbarProps(calls)} canUndo={false} canRedo={false} />);
    try {
        await f.click(f.host.querySelector(".canvas-compact-toolbar")!, "更多画布工具");
        const panel = f.host.querySelector('[role="region"][aria-label="更多画布工具"]')!;
        expect(panel.querySelector<HTMLButtonElement>('[aria-label="撤销"]')!.disabled).toBe(true);
        expect(panel.querySelector<HTMLButtonElement>('[aria-label="重做"]')!.disabled).toBe(true);
        await act(async () => { document.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event); });
        expect(f.host.querySelector('[role="region"][aria-label="更多画布工具"]')).toBeNull();
        expect(calls).toEqual([]);
    } finally { await f.cleanup(); }
});

test("View retains zoom, fit, minimap, arrangement, connection and shortcuts commands", async () => {
    const calls: Array<string | number> = [];
    const f = await fixture(<CanvasZoomControls scale={1} onScaleChange={(scale) => calls.push(scale)} onFitContent={() => calls.push("fit")} onAutoArrange={() => calls.push("arrange")} onHideNodeConnectionsChange={(hidden) => calls.push(String(hidden))} isMiniMapOpen={false} onToggleMiniMap={() => calls.push("minimap")} onOpenShortcuts={() => calls.push("shortcuts")} />);
    try {
        const open = () => f.click(f.host.querySelector(".canvas-view-trigger")!, "画布视图");
        const panel = () => f.host.querySelector('[role="region"][aria-label="画布视图控制"]')!;
        await open();
        await f.click(panel(), "放大画布");
        await f.click(panel(), "缩小画布");
        expect(calls).toEqual([1.1, 1]);
        for (const [label, action] of [["适应画布", "fit"], ["打开小地图", "minimap"], ["自动整理节点", "arrange"], ["设置隐藏节点连线", "true"], ["操作与快捷键", "shortcuts"]]) {
            if (!panel()) await open();
            await f.click(panel(), label!);
            expect(calls).toContain(action!);
        }
        await open();
        await f.click(panel(), "精确缩放");
        expect(panel()).toBeNull();
        expect(f.host.querySelector('[aria-label="精确缩放画布"]')).not.toBeNull();
        const preset = Array.from(f.host.querySelectorAll<HTMLButtonElement>(".canvas-zoom-precision button")).find((button) => button.textContent === "50%");
        await act(async () => { preset!.click(); });
        expect(calls).toContain(0.5);
    } finally { await f.cleanup(); }
});

test.each([1280, 390])("zoom panel reopens with the live scale at viewport width %i", async (width) => {
    dom.happyDOM.setWindowSize({ width, height: 844 });
    const viewport = document.createElement("div");
    document.body.append(viewport);
    const calls: number[] = [];
    const f = await fixture(<CanvasZoomControls scale={0.46} containerRef={{ current: viewport }} onScaleChange={(scale) => calls.push(scale)} onFitContent={() => {}} isMiniMapOpen={false} onToggleMiniMap={() => {}} onOpenShortcuts={() => {}} />);
    const open = async () => {
        if (width <= 767) {
            await f.click(f.host.querySelector(".canvas-view-trigger")!, "画布视图");
            await f.click(f.host.querySelector(".canvas-compact-menu")!, "精确缩放");
        } else {
            await f.click(f.host.querySelector(".canvas-desktop-toolbar")!, "精确缩放");
        }
    };
    const expectScale = (percent: number) => {
        expect(f.host.querySelector<HTMLInputElement>('[aria-label="精确缩放画布"]')!.value).toBe(String(percent));
        expect(f.host.querySelector(".canvas-zoom-precision .tabular-nums")!.textContent?.trim()).toBe(`${percent}%`);
        expect(f.host.querySelector('[aria-label="精确缩放"]')!.textContent?.trim()).toBe(`${percent}%`);
    };
    const close = async () => {
        await act(async () => { document.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event); });
        // Wait for the real exit animation; reopening before removal would not test remounting.
        await act(async () => { await Bun.sleep(250); });
        expect(f.host.querySelector(".canvas-zoom-precision")).toBeNull();
    };
    try {
        await open();
        const preset = Array.from(f.host.querySelectorAll<HTMLButtonElement>(".canvas-zoom-precision button")).find((button) => button.textContent === "100%")!;
        await act(async () => { preset.click(); });
        expect(calls).toEqual([1]);
        expectScale(100);
        await close();
        await open();
        expectScale(100);
        await close();
        await act(async () => { viewport.dispatchEvent(new dom.CustomEvent("canvas:viewport-preview", { detail: { x: 0, y: 0, k: 0.73 } }) as unknown as Event); });
        await open();
        expectScale(73);
        await close();
        if (width <= 767) {
            // The mobile menu also unmounts; its commands must use the latest preview scale.
            for (let attempt = 0; attempt < 2; attempt++) {
                await f.click(f.host.querySelector(".canvas-view-trigger")!, "画布视图");
                await f.click(f.host.querySelector(".canvas-compact-menu")!, "放大画布");
                await act(async () => { document.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event); });
                expect(f.host.querySelector(".canvas-compact-menu")).toBeNull();
            }
            expect(calls[1]).toBeCloseTo(0.83);
            expect(calls[2]).toBeCloseTo(0.93);
            await open();
            expectScale(93);
        }
    } finally {
        await f.cleanup();
        viewport.remove();
        dom.happyDOM.setWindowSize({ width: 390, height: 844 });
    }
});
