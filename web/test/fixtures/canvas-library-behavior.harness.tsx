import { mock } from "bun:test";
import { Window } from "happy-dom";
import assert from "node:assert/strict";

const dom = new Window({ url: "http://localhost/canvas?agent=1" });
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, Event: dom.Event, CustomEvent: dom.CustomEvent, MutationObserver: dom.MutationObserver, localStorage: dom.localStorage, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, value });
for (const key of ["HTMLAnchorElement", "SVGElement", "Document", "ResizeObserver"] as const) Object.defineProperty(globalThis, key, { configurable: true, value: dom[key] });
// React DOM must see browser globals; product modules must see the isolated services.
// Static imports would capture the host environment and real persistence before isolation.
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { create } = await import("zustand");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { MemoryRouter } = await import("react-router");
const { App } = await import("antd");
const title = "现代简约全屋设计｜历史草稿归档（勿作当前方案）";
const node = { id: "video", type: "video", title: "厨房镜头", position: { x: 0, y: 0 }, width: 200, height: 100, metadata: {} };
const rows = [{ id: "a", projectId: "p1", title, nodeCount: 5, previewNodes: [node], createdAt: "2026-11-01", updatedAt: "2026-11-04" }, { id: "b", projectId: undefined, title: "自由画布 3", nodeCount: 0, previewNodes: [], createdAt: "2026-11-01", updatedAt: "2026-11-04" }];
let gate: PromiseWithResolvers<void> | undefined;
let saves = 0;
let pendingTitle = "";
const canvasStore = create(() => ({ hydrated: true, projects: [], renameProject(_id: string, value: string) { pendingTitle = value; }, updateProject() {}, importProject() {} }));
const userStore = create(() => ({ user: { id: "isolated-a" }, hydrated: true }));
mock.module("@/stores/canvas/use-canvas-store", () => ({ useCanvasStore: canvasStore, flushCanvasStorePersistence: async () => {} }));
mock.module("@/stores/use-user-store", () => ({ useUserStore: userStore }));
mock.module("@/services/api/user-data", () => ({ listRemoteCanvasProjectsPage: async ({ query, projectId, sort }: { query: string; projectId: string; sort: string }) => {
    await gate?.promise;
    const projects = query ? [] : projectId === "independent" ? rows.filter(row => !row.projectId) : sort === "name" ? [...rows].reverse() : rows;
    return { projects: projects.map(project => ({ ...project })), total: projects.length, hasMore: false, page: 1 };
} }));
mock.module("@/services/api/projects", () => ({ listProjects: async () => ({ projects: [{ project: { id: "p1", name: "测试项目" } }] }) }));
mock.module("@/services/user-data-sync", () => ({ createCanvasProjectWithRemoteSync: async () => { throw Error("unexpected write"); }, hasRemoteUserDataSyncSession: () => false, loadCanvasProjectForEditing: async (id: string) => rows.find(row => row.id === id), saveRemoteUserDataNow: async (id: string) => { saves++; rows.find(row => row.id === id)!.title = pendingTitle; }, scheduleRemoteUserDataSync() {} }));
mock.module("@/lib/workspace-route-modules", () => ({ loadCanvasProjectPage: async () => {} }));
mock.module("@/components/canvas/canvas-history-drawer", () => ({ CanvasHistoryDrawer: () => null }));
mock.module("@/lib/canvas/canvas-export", () => ({ exportCanvasProjects: async () => { throw Error("unexpected export"); } }));
mock.module("@/services/project-asset-sync", () => ({ ensureCanvasNodeAsset: async () => { throw Error("unexpected upload"); } }));
mock.module("@/lib/canvas/canvas-drawing-storage", () => ({ saveCanvasDrawing: async () => { throw Error("unexpected drawing write"); } }));
const { default: CanvasPage } = await import("@/pages/canvas/index");
const { useCanvasUiStore } = await import("@/stores/canvas/use-canvas-ui-store");
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const host = document.createElement("div"); document.body.append(host);
const root = createRoot(host);
const button = (name: string) => [...host.querySelectorAll("button")].find(b => b.textContent?.replace(/\s/g, "").includes(name)) as HTMLButtonElement;
const wait = async (ms = 25) => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, ms); await act(async () => { await promise; }); };
const click = async (el: Element) => { assert.ok(el); await act(async () => (el as HTMLElement).click()); };
const input = async (el: Element, value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new dom.Event("input", { bubbles: true })); }); };
const key = async (el: Element, value: string) => { await act(async () => el.dispatchEvent(new dom.KeyboardEvent("keydown", { key: value, bubbles: true }))); };
const search = () => host.querySelector('input[aria-label="搜索画布"]')!;
const cards = () => host.querySelectorAll(".canvas-collection-card");
const menu = async (text: string) => { await wait(); await click([...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent?.includes(text))!); };
try {
    await act(async () => root.render(<App><QueryClientProvider client={client}><MemoryRouter initialEntries={["/canvas?agent=1"]}><CanvasPage /></MemoryRouter></QueryClientProvider></App>));
    await wait(); await wait();
    assert.equal(cards().length, 2);
    assert.ok(host.textContent?.includes("视频节点预览"));
    assert.ok(!host.textContent?.includes("视频画布"));
    assert.equal(host.querySelector("video"), null);
    assert.ok(!host.textContent?.includes("已加载全部"));
    await click(button("批量管理"));
    await click(host.querySelector("label.canvas-collection-select")!);
    assert.deepEqual(useCanvasUiStore.getState().selectedProjectIds, ["a"]);
    const link = host.querySelector("a.canvas-collection-open")!;
    await click(link);
    assert.deepEqual(useCanvasUiStore.getState().selectedProjectIds, []);
    await key(link, "Enter");
    assert.deepEqual(useCanvasUiStore.getState().selectedProjectIds, ["a"]);
    await key(link, " ");
    assert.deepEqual(useCanvasUiStore.getState().selectedProjectIds, []);
    await click(button("全选已加载"));
    const originalCard = cards()[0];
    gate = Promise.withResolvers<void>();
    await input(search(), "找不到");
    assert.equal(cards()[0], originalCard, "typing must not unmount successful cards");
    assert.equal(useCanvasUiStore.getState().selectedProjectIds.length, 0);
    assert.equal(button("删除").disabled, true);
    assert.equal(button("全选已加载").disabled, true);
    await wait(280);
    assert.equal(cards()[0], originalCard, "in-flight query keeps the same card");
    await click(link);
    assert.equal(useCanvasUiStore.getState().selectedProjectIds.length, 0);
    await act(async () => { gate!.resolve(); }); gate = undefined;
    await wait();
    assert.equal(cards().length, 0);
    assert.ok(host.textContent?.includes("0 个匹配结果"));
    await input(search(), "");
    assert.equal(host.querySelector(".workspace-state"), null, "waiting must not show an empty-library action");
    await wait(280); await wait();
    assert.equal(cards().length, 2);
    // A filter and sort change each retain old rows without allowing old-scope selection.
    gate = Promise.withResolvers<void>();
    await click(button("全部画布")); await menu("自由画布");
    assert.equal(cards().length, 2);
    assert.equal(button("全选已加载").disabled, true);
    await act(async () => { gate!.resolve(); }); gate = undefined; await wait();
    assert.equal(cards().length, 1);
    assert.ok(cards()[0].textContent?.includes("自由画布 3"));
    await click(button("重置")); await wait();
    await click(button("全选已加载"));
    gate = Promise.withResolvers<void>();
    await click(button("最近更新")); await menu("按名称");
    assert.equal(cards().length, 2);
    assert.equal(button("删除").disabled, true);
    assert.equal(useCanvasUiStore.getState().selectedProjectIds.length, 0);
    await act(async () => { gate!.resolve(); }); gate = undefined; await wait();
    await click(button("退出批量管理"));
    assert.equal(host.querySelector("input[type=checkbox]"), null);
    // Exercise the real dropdown, editor, persistence boundary and query refetch.
    await click(host.querySelector(".canvas-collection-more")!); await menu("重命名");
    let editor = host.querySelector('input[aria-label="画布名称"]')!;
    assert.equal(editor.closest("a"), null);
    await click(host.querySelector("a.canvas-collection-open")!);
    assert.ok(host.querySelector('input[aria-label="画布名称"]'), "editing blocks opening the card");
    await input(editor, "保存后的画布名称");
    await key(editor, "Enter");
    await act(async () => editor.dispatchEvent(new dom.FocusEvent("focusout", { bubbles: true })));
    await wait();
    assert.equal(saves, 1, "Enter and blur must commit once");
    assert.ok(host.textContent?.includes("保存后的画布名称"), "successful save refreshes the remote library cache");
    await click(host.querySelector(".canvas-collection-more")!); await menu("重命名");
    editor = host.querySelector('input[aria-label="画布名称"]')!;
    await input(editor, "不应保存"); await key(editor, "Escape");
    await act(async () => editor.dispatchEvent(new dom.FocusEvent("focusout", { bubbles: true })));
    assert.equal(saves, 1);
    assert.ok(!host.textContent?.includes("不应保存"));
    // Cross-account changes must not expose previous-account placeholder rows.
    gate = Promise.withResolvers<void>();
    await act(async () => userStore.setState({ user: { id: "isolated-b" } }));
    assert.equal(cards().length, 0);
    await act(async () => { gate!.resolve(); }); gate = undefined; await wait();
    assert.equal(cards().length, 2);
    console.log("PASS: retained search/filter/sort cards; disabled stale selection; account fence; label/body/Enter/Space selection; rename save-once/cache refresh/Escape; sampled cover");
} finally {
    gate?.resolve();
    // Synchronous unmount avoids waiting for an unrelated portal's async act queue.
    act(() => root.unmount());
    client.clear();
    await dom.happyDOM.close();
    console.log("CLEANUP: root unmounted, query cache cleared, DOM window closed");
}
// This isolated executable has no remaining work after awaited cleanup. UI modules
// may retain process-global scheduler handles outside Happy DOM; do not keep the
// test subprocess alive for them. Exceptions above bypass this successful exit.
process.exit(0);
