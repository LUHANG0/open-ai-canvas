import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
const dom = new Window({ url: "http://localhost/", width: 390, height: 640 });
Object.defineProperty(dom.Element.prototype, "animate", { configurable: true, value: undefined });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, ResizeObserver: dom.ResizeObserver, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, localStorage: dom.localStorage, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// These imports intentionally follow DOM installation: React DOM and AntD choose browser behavior at module initialization.
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasShortcutsModal } = await import("@/pages/canvas/canvas-shortcuts-modal");
const { useUserStore } = await import("@/stores/use-user-store");
const { canvasInputPreferencesStore } = await import("@/stores/canvas/use-canvas-input-preferences");
const { CanvasTopBar } = await import("@/pages/canvas/canvas-project-top-bar");
const { MemoryRouter } = await import("react-router");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("operation modal changes preferences, updates help, and opening preserves active tool", async () => {
    useUserStore.setState({ hydrated: true, user: null });
    canvasInputPreferencesStore.getState().resetPreferences();
    canvasInputPreferencesStore.getState().setCanvasTool("move");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => { root.render(<CanvasShortcutsModal open onClose={() => {}} />); });
        expect(canvasInputPreferencesStore.getState().canvasTool).toBe("move");
        const changeSelect = async (label: string, value: string) => {
            const select = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
            expect(select).not.toBeNull();
            await act(async () => { select.value = value; select.dispatchEvent(new dom.Event("change", { bubbles: true }) as unknown as Event); });
        };
        await changeSelect("空白处左键拖动", "pan");
        await changeSelect("鼠标滚轮", "pan");
        expect(canvasInputPreferencesStore.getState().preferences).toMatchObject({ blankDrag: "pan", mouseWheel: "pan" });
        expect(document.querySelector(".canvas-shortcuts-list")?.textContent).toContain("滚轮平移");
        const remember = document.querySelector<HTMLInputElement>(".canvas-input-remember input")!;
        await act(async () => { remember.click(); });
        expect(canvasInputPreferencesStore.getState().preferences.rememberTool).toBe(true);
        const reset = Array.from(document.querySelectorAll<HTMLButtonElement>(".canvas-input-settings button")).find((button) => button.textContent === "恢复默认")!;
        await act(async () => { reset.click(); });
        expect(canvasInputPreferencesStore.getState().preferences).toEqual({ blankDrag: "box-select", mouseWheel: "zoom", rememberTool: false });
        expect(canvasInputPreferencesStore.getState().lastTool).toBeNull();
        expect(document.querySelector(".canvas-shortcuts-list")?.textContent).toContain("滚轮缩放");
        await act(async () => { root.render(<CanvasShortcutsModal open={false} onClose={() => {}} />); });
        await act(async () => { canvasInputPreferencesStore.getState().setCanvasTool("move"); });
        await act(async () => { root.render(<CanvasShortcutsModal open onClose={() => {}} />); });
        expect(canvasInputPreferencesStore.getState().canvasTool).toBe("move");
    } finally {
        await act(async () => { root.unmount(); });
        host.remove();
    }
});

test("topbar menu opens unified help at desktop and mobile widths", async () => {
    useUserStore.setState({ hydrated: true, user: null });
    const noop = () => {};
    for (const width of [1440, 390]) {
        dom.happyDOM.setWindowSize({ width, height: 800 });
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        try {
            await act(async () => { root.render(<QueryClientProvider client={queryClient}><MemoryRouter><CanvasTopBar title="测试画布" titleDraft="测试画布" isTitleEditing={false} onTitleDraftChange={noop} onStartTitleEditing={noop} onFinishTitleEditing={noop} onCancelTitleEditing={noop} canUndo={false} canRedo={false} onCreateProject={noop} onDeleteProject={noop} onSave={noop} onImportImage={noop} onImportLibTV={noop} onImportTapNow={noop} onUndo={noop} onRedo={noop} onShare={noop} shortcutRequestNonce={0} onOpenSearch={noop} onEnterFocusMode={noop} /></MemoryRouter></QueryClientProvider>); });
            await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="打开画布菜单"]')!.click(); const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, 60); await promise; });
            const help = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent?.includes("操作与快捷键"));
            expect(help).toBeDefined();
            await act(async () => { help!.click(); });
            expect(document.querySelector('section[aria-label="画布操作偏好"]')).not.toBeNull();
        } finally {
            await act(async () => { root.unmount(); });
            queryClient.clear();
            host.remove();
        }
    }
});
