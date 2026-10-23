import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ContextMenuState, ViewportTransform } from "@/types/canvas";

const dom = new Window({ url: "http://localhost/canvas/fixture-only" });
class FixtureSocket {
    static instances: FixtureSocket[] = [];
    readyState = 1;
    bufferedAmount = 0;
    closes = 0;
    sent: string[] = [];
    onmessage?: (event: { data: string }) => void;
    onclose?: (event: { code: number }) => void;
    constructor(readonly url: string) { FixtureSocket.instances.push(this); }
    send(value: string) { this.sent.push(value); }
    receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
    close() { this.closes++; this.readyState = 3; this.onclose?.({ code: 1000 }); }
}
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement,
    ShadowRoot: dom.ShadowRoot, Element: dom.Element, Node: dom.Node,
    localStorage: dom.localStorage, sessionStorage: dom.sessionStorage,
    ResizeObserver: dom.ResizeObserver, MutationObserver: dom.MutationObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom), WebSocket: FixtureSocket,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

let cached: CanvasProject;
const patches: Array<Partial<CanvasProject>> = [];
let statusReads = 0;
let leaseTicks = 0;
let flushes = 0;
let remoteSaves = 0;
const unexpected: string[] = [];
const forbidden = (name: string) => () => { unexpected.push(name); throw new Error(`Unexpected fixture operation: ${name}`); };
// Preserve each boundary module's complete function export surface without importing its I/O graph.
// These stubs never implement production algorithms; any unexercised boundary call fails explicitly.
async function blockedFunctions(relativePath: string) {
    const source = await Bun.file(new URL(relativePath, import.meta.url)).text();
    return Object.fromEntries([...source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map((match) => [match[1], forbidden(match[1])]));
}
const syncBoundary = await blockedFunctions("../src/services/user-data-sync.ts");
const userDataBoundary = await blockedFunctions("../src/services/api/user-data.ts");
const skillsBoundary = await blockedFunctions("../src/services/api/skills.ts");
const assetBoundary = await blockedFunctions("../src/stores/use-asset-store.ts");
const user = { hydrated: true, user: { id: "fixture-user" }, features: { customChannelsEnabled: true }, drawingEngine: { tldrawLicenseKey: "" } };
mock.module("@/stores/use-user-store", () => ({ useUserStore: Object.assign((select: (state: typeof user) => unknown) => select(user), { getState: () => user }) }));
const theme = { theme: "light", setTheme: () => {} };
mock.module("@/stores/canvas/use-canvas-theme-store", () => ({ useActiveTheme: () => "light", useCanvasThemeStore: { getState: () => theme } }));
const updateProject = (_id: string, patch: Partial<CanvasProject>) => { patches.push(patch); cached = { ...cached, ...patch }; };
const store = { hydrated: true, get projects() { return [cached]; }, openProject: () => cached, updateProject, renameProject: () => {} };
// Full persistence-module contracts keep unrelated generation imports linkable; unexpected paths fail closed.
mock.module("@/stores/canvas/use-canvas-store", () => ({
    CANVAS_STORE_KEY: "fixture-only:canvas",
    useCanvasStore: Object.assign((select: (state: typeof store) => unknown) => select(store), { getState: () => store }),
    flushCanvasStorePersistence: async () => { flushes++; },
    withCanvasStorePersistenceLock: forbidden("canvas lock"), canvasStoreStorageRevision: forbidden("storage revision"),
    recordCanvasStorageDocument: forbidden("record durable document"), commitPendingCanvasStorePersistenceLocked: forbidden("commit durable document"),
    pendingCanvasStorePersistence: forbidden("pending durable write"), rebasePendingCanvasStorePersistenceAfterGenerationCommitLocked: forbidden("generation rebase"),
    withCanvasStorePersistenceSuppressed: forbidden("suppress persistence"), registerCanvasGenerationPersistenceAttempt: forbidden("generation persistence"),
    reconcileCanvasGenerationFailure: forbidden("generation failure"),
}));
const assets = { assets: [], hydrated: true };
mock.module("@/stores/use-asset-store", () => ({
    ...assetBoundary,
    ASSET_STORE_KEY: "fixture-only:assets",
    useAssetStore: Object.assign((select: (state: typeof assets) => unknown) => select(assets), { getState: () => assets }),
    getGenerationAssetDefaults: forbidden("generation asset defaults"), withAssetStorePersistenceSuppressed: forbidden("asset persistence"),
}));
mock.module("@/services/user-data-sync", () => ({
    ...syncBoundary, numberValue: forbidden("numberValue"),
    loadCanvasProjectForEditing: async () => cached,
    subscribeAgentCanvasRefresh: () => () => {},
    saveRemoteUserDataNow: async () => { remoteSaves++; },
    prepareCanvasForCloudAction: forbidden("prepare cloud action"),
    createCanvasProjectWithRemoteSync: forbidden("create real project"),
    deleteCanvasProjectsWithRemoteSync: forbidden("delete real project"),
    refreshCanvasAfterAgent: forbidden("refresh newer remote revision"),
}));
mock.module("@/services/api/skills", () => ({ ...skillsBoundary, listAddedSkills: async () => ({ skills: [] }) }));
mock.module("@/services/api/user-data", () => ({ ...userDataBoundary, getCanvasSyncStatus: async () => { statusReads++; return { revision: 1, agent: null }; } }));
mock.module("@/services/canvas-edit-leases", () => ({ canvasEditLeases: { tick: async () => { leaseTicks++; }, statusToken: () => Symbol.for("fixture-status"), status: () => {} } }));

const { act, useCallback, useRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App } = await import("antd");
const { MemoryRouter } = await import("react-router");
const { canvasAppearanceForTheme } = await import("@/lib/canvas/canvas-appearance");
const { CanvasNodeType } = await import("@/types/canvas");
const { useCanvasNodeOperations } = await import("@/pages/canvas/use-canvas-node-operations");
const { useCanvasProjectLifecycle } = await import("@/pages/canvas/use-canvas-project-lifecycle");
const { CanvasFreeformEmptyState } = await import("@/components/canvas/canvas-short-drama-entry");

afterAll(async () => {
    await dom.happyDOM.abort(); mock.restore();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

const noOp = () => {};
async function fixture() {
    patches.length = 0; FixtureSocket.instances.length = 0;
    statusReads = 0; leaseTicks = 0; flushes = 0; remoteSaves = 0; unexpected.length = 0;
    cached = { id: "fixture-only", title: "Isolated canvas", revision: 1, nodes: [], connections: [], chatSessions: [], activeChatId: null, viewport: { x: 0, y: 0, k: 1 }, appearance: canvasAppearanceForTheme("light"), backgroundMode: "dots", showImageInfo: false, createdAt: "2026-01-01", updatedAt: "2026-01-01", previsScenes: [] };
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const deleted: Array<{ ids: string[]; next: CanvasNodeData[]; removed: CanvasNodeData[] }> = [];
    let renders = 0;
    let latest: ReturnType<typeof snapshot>;
    function snapshot(nodes: CanvasNodeData[], connections: CanvasConnection[], selected: Set<string>, selectedConnection: string | null, dialog: string | null, loaded: boolean, ops: ReturnType<typeof useCanvasNodeOperations>, lifecycle: ReturnType<typeof useCanvasProjectLifecycle>, link: () => void) {
        return { nodes, connections, selected, selectedConnection, dialog, loaded, ops, lifecycle, link };
    }
    function Harness() {
        renders++;
        const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
        const [connections, setConnections] = useState<CanvasConnection[]>([]);
        const [selected, setSelected] = useState(new Set<string>());
        const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
        const [, setContextMenu] = useState<ContextMenuState | null>(null);
        const [dialog, setDialog] = useState<string | null>(null);
        const [loaded, setLoaded] = useState(false);
        const [chats, setChats] = useState<CanvasAssistantSession[]>([]);
        const [activeChat, setActiveChat] = useState<string | null>(null);
        const [appearance, setAppearance] = useState(cached.appearance!);
        const [background, setBackground] = useState<"dots" | "lines" | "blank">("dots");
        const [info, setInfo] = useState(false);
        const [viewport, setViewport] = useState<ViewportTransform>(cached.viewport);
        const nodesRef = useRef(nodes); nodesRef.current = nodes;
        const connectionsRef = useRef(connections); connectionsRef.current = connections;
        const selectedRef = useRef(selected); selectedRef.current = selected;
        const chatsRef = useRef(chats); chatsRef.current = chats;
        const chatRef = useRef(activeChat); chatRef.current = activeChat;
        const viewportRef = useRef(viewport); viewportRef.current = viewport;
        const paused = useRef(false);
        const onDeleted = useCallback((ids: Set<string>, next: CanvasNodeData[], removed: CanvasNodeData[]) => { deleted.push({ ids: [...ids], next, removed }); }, []);
        const center = useCallback(() => ({ x: 100, y: 100 }), []);
        const lifecycle = useCanvasProjectLifecycle({ projectId: "fixture-only", projectLoaded: loaded, nodes, connections, chatSessions: chats, activeChatId: activeChat, canvasAppearance: appearance, backgroundMode: background, showImageInfo: info, viewport, nodesRef, connectionsRef, chatSessionsRef: chatsRef, activeChatIdRef: chatRef, viewportRef, historyPausedRef: paused, setNodes, setConnections, setChatSessions: setChats, setActiveChatId: setActiveChat, setCanvasAppearance: setAppearance, setBackgroundMode: setBackground, setShowImageInfo: setInfo, setViewport, setProjectLoaded: setLoaded, resetHistory: noOp, cleanupAssetImages: noOp, cleanupCanvasFiles: noOp });
        const ops = useCanvasNodeOperations({ projectId: "fixture-only", defaultDrawingEngine: "excalidraw", nodesRef, connectionsRef, selectedNodeIdsRef: selectedRef, getCanvasCenter: center, setNodes, setConnections, setSelectedNodeIds: setSelected, setSelectedConnectionId: setSelectedConnection, setContextMenu, setDialogNodeId: setDialog, setToolbarNodeId: () => {}, onNodesDeleted: onDeleted });
        const link = () => { const connection = { id: "fixture-connection", fromNodeId: nodesRef.current[0].id, toNodeId: nodesRef.current[1].id }; connectionsRef.current = [connection]; setConnections([connection]); setSelectedConnection(connection.id); };
        latest = snapshot(nodes, connections, selected, selectedConnection, dialog, loaded, ops, lifecycle, link);
        return nodes.length ? <p data-count={nodes.length}>Nodes present</p> : <CanvasFreeformEmptyState commands={[]} />;
    }
    await act(async () => root.render(<MemoryRouter><App><Harness /></App></MemoryRouter>));
    expect(latest!.loaded).toBe(true);
    expect(FixtureSocket.instances).toHaveLength(1);
    const socket = FixtureSocket.instances[0];
    await act(async () => { socket.receive({ type: "welcome", selfId: "fixture-self", peers: [] }); });
    const cleanup = async () => { await act(async () => root.unmount()); host.remove(); };
    return { host, get current() { return latest!; }, deleted, socket, renders: () => renders, cleanup };
}

test("actual createNode then deleteNodes(all) clears nodes, incident edges and selection, persists empty arrays and renders the actual empty state", async () => {
    const f = await fixture();
    try {
        await act(async () => { f.current.ops.createNode(CanvasNodeType.Text); f.current.ops.createNode(CanvasNodeType.Image); });
        expect(f.current.nodes).toHaveLength(2);
        expect(f.current.selected.size).toBe(1);
        expect(f.current.dialog).toBe(f.current.nodes[1].id);
        await act(async () => f.current.link());
        expect(f.current.connections).toHaveLength(1);
        const ids = f.current.nodes.map((node) => node.id);
        await act(async () => f.current.ops.deleteNodes(new Set(ids)));
        expect(f.current.nodes).toEqual([]); expect(f.current.connections).toEqual([]);
        expect(f.current.selected.size).toBe(0); expect(f.current.selectedConnection).toBeNull();
        expect(f.deleted).toHaveLength(1);
        expect(new Set(f.deleted[0].ids)).toEqual(new Set(ids));
        expect(f.deleted[0].next).toEqual([]); expect(f.deleted[0].removed).toHaveLength(2);
        const emptyPatch = patches.findLast((patch) => patch.nodes !== undefined);
        expect(emptyPatch?.nodes).toEqual([]); expect(emptyPatch?.connections).toEqual([]);
        expect(cached.nodes).toEqual([]); expect(cached.connections).toEqual([]);
        expect(f.host.textContent).toContain("自由空白画布");
        expect(f.socket.closes).toBe(0); expect(FixtureSocket.instances).toHaveLength(1);
        expect(unexpected).toEqual([]);
    } finally { await f.cleanup(); }
});

test("node count returning to zero does not close or recreate the actual realtime/polling subscription, and invalidate still wakes sync", async () => {
    const f = await fixture();
    try {
        for (let i = 0; i < 3; i++) {
            await act(async () => f.current.ops.createNode(CanvasNodeType.Image));
            await act(async () => f.current.ops.deleteNodes(new Set(f.current.nodes.map((node) => node.id))));
        }
        const reads = statusReads;
        await act(async () => { f.socket.receive({ type: "invalidate" }); });
        expect(statusReads).toBeGreaterThan(reads);
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2150)); });
        expect(leaseTicks).toBeGreaterThanOrEqual(2);
        expect(FixtureSocket.instances).toHaveLength(1); expect(f.socket.closes).toBe(0);
        expect(f.current.loaded).toBe(true); expect(f.current.nodes).toEqual([]);
        expect(f.renders()).toBeLessThan(25);
        expect(cached.nodes).toEqual([]); expect(unexpected).toEqual([]);
    } finally { await f.cleanup(); }
    expect(f.socket.closes).toBe(1);
});

test("the actual lifecycle save path flushes the empty-node state after a full delete without resurrecting previous nodes", async () => {
    const f = await fixture();
    try {
        await act(async () => f.current.ops.createNode(CanvasNodeType.Text));
        await act(async () => f.current.ops.deleteNodes(new Set(f.current.nodes.map((node) => node.id))));
        let saved = false;
        await act(async () => { saved = await f.current.lifecycle.saveCanvasProject({ requireRemote: false }); });
        expect(saved).toBe(true); expect(flushes).toBe(1); expect(remoteSaves).toBe(1);
        expect(cached.nodes).toEqual([]); expect(cached.connections).toEqual([]);
        expect(f.current.nodes).toEqual([]); expect(f.socket.closes).toBe(0);
        expect(unexpected).toEqual([]);
    } finally { await f.cleanup(); }
});
