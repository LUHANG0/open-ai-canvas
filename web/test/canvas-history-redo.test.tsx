import { afterAll, expect, jest, test } from "bun:test";
import { Window } from "happy-dom";
import type { Dispatch, SetStateAction } from "react";
import { createCanvasStateWriter } from "@/lib/canvas/canvas-editor-state";
import { stampCanvasNodeChanges } from "@/lib/canvas/canvas-node-timestamps";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { act, createElement, useMemo, useRef, useState } from "react";
import { useCanvasHistory } from "@/pages/canvas/use-canvas-history";
import type { CanvasHistorySnapshot } from "@/pages/canvas/use-canvas-history";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// React DOM must detect the installed browser globals at its module-loading boundary.
const { createRoot } = await import("react-dom/client");
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture() {
    jest.useFakeTimers();
    const initial: CanvasHistorySnapshot = {
        nodes: [{ id: "image", type: CanvasNodeType.Image, title: "Image", position: { x: 40, y: 60 }, width: 600, height: 400, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" }],
        connections: [], chatSessions: [], activeChatId: null, canvasAppearance: { mode: "dark" }, backgroundMode: "dots", showImageInfo: false,
    };
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    let editNodes!: Dispatch<SetStateAction<CanvasNodeData[]>>;
    let snapshot!: CanvasHistorySnapshot;
    let history!: { resetHistory: (snapshot: CanvasHistorySnapshot) => void; undoCanvas: () => void; redoCanvas: () => void; historyState: { canUndo: boolean; canRedo: boolean } };
    function Harness() {
        const [nodes, publishNodes] = useState(initial.nodes);
        const nodesRef = useRef(nodes);
        const [state, setState] = useState(initial);
        editNodes = useMemo(() => createCanvasStateWriter(nodesRef, publishNodes, stampCanvasNodeChanges), []);
        // Match the editor: ordinary edits stamp, history restores existing timestamps.
        const restoreNodes = useMemo(() => createCanvasStateWriter(nodesRef, publishNodes), []);
        const setters = useMemo(() => {
            function field<K extends keyof CanvasHistorySnapshot>(key: K) {
                return (value: SetStateAction<CanvasHistorySnapshot[K]>) => setState(previous => ({ ...previous, [key]: typeof value === "function" ? (value as (v: CanvasHistorySnapshot[K]) => CanvasHistorySnapshot[K])(previous[key]) : value }));
            }
            return { setConnections: field("connections"), setChatSessions: field("chatSessions"), setActiveChatId: field("activeChatId"), applyCanvasAppearance: field("canvasAppearance"), setBackgroundMode: field("backgroundMode"), setShowImageInfo: field("showImageInfo") };
        }, []);
        snapshot = { ...state, nodes };
        history = useCanvasHistory({ ...snapshot, ...setters, setNodes: restoreNodes, projectLoaded: true, setSelectedNodeIds: () => {}, setSelectedConnectionId: () => {}, setContextMenu: () => {} });
        return null;
    }
    await act(async () => root.render(createElement(Harness)));
    await act(async () => history.resetHistory(initial));
    return {
        initial, snapshot: () => snapshot, state: () => history.historyState,
        resize: async (width: number) => act(async () => editNodes(nodes => nodes.map(node => ({ ...node, width, height: width * 2 / 3, position: { x: 640 - width, y: 460 - width * 2 / 3 } })))),
        rename: async () => act(async () => editNodes(nodes => nodes.map(node => ({ ...node, title: "New edit" })))),
        wait: async (ms = 600) => act(async () => { jest.advanceTimersByTime(ms); }),
        undo: async () => act(async () => history.undoCanvas()),
        redo: async () => act(async () => history.redoCanvas()),
        cleanup: async () => { await act(async () => root.unmount()); host.remove(); jest.useRealTimers(); },
    };
}

for (const pending of [false, true]) test(`resize undo survives idle and redoes exact geometry/timestamps (${pending ? "pending" : "committed"})`, async () => {
    const f = await fixture();
    try {
        await f.wait(); await f.resize(720);
        const resized = f.snapshot().nodes;
        expect(resized[0].updatedAt).not.toBe(f.initial.nodes[0].updatedAt);
        if (!pending) await f.wait();
        await f.undo();
        await f.wait(100); expect(f.state().canRedo).toBe(true);
        await f.wait(500); expect(f.state()).toEqual({ canUndo: false, canRedo: true });
        expect(f.snapshot().nodes).toEqual(f.initial.nodes);
        await f.redo(); await f.wait();
        expect(f.snapshot().nodes).toEqual(resized);
        expect(f.state()).toEqual({ canUndo: true, canRedo: false });
    } finally { await f.cleanup(); }
});

for (const pending of [false, true]) test(`real new edit clears future without losing the new edit (${pending ? "pending" : "committed"})`, async () => {
    const f = await fixture();
    try {
        await f.resize(720); await f.wait(); await f.undo(); await f.wait();
        await f.rename();
        if (!pending) await f.wait();
        await f.redo(); await f.wait();
        expect(f.snapshot().nodes[0]).toMatchObject({ title: "New edit", width: 600, position: { x: 40, y: 60 } });
        expect(f.state().canRedo).toBe(false);
        await f.undo(); await f.wait();
        expect(f.snapshot().nodes).toEqual(f.initial.nodes);
    } finally { await f.cleanup(); }
});

test("multiple resize operations traverse both history stacks after idle", async () => {
    const f = await fixture();
    try {
        await f.resize(720); await f.wait(); const first = f.snapshot().nodes;
        await f.resize(840); await f.wait(); const second = f.snapshot().nodes;
        for (const expected of [first, f.initial.nodes]) {
            await f.undo(); await f.wait(); expect(f.snapshot().nodes).toEqual(expected);
        }
        expect(f.state()).toEqual({ canUndo: false, canRedo: true });
        for (const expected of [first, second]) {
            await f.redo(); await f.wait(); expect(f.snapshot().nodes).toEqual(expected);
        }
        expect(f.state()).toEqual({ canUndo: true, canRedo: false });
    } finally { await f.cleanup(); }
});
