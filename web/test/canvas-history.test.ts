import { afterAll, expect, jest, test } from "bun:test";
import { Window } from "happy-dom";
import type { CanvasHistorySnapshot } from "@/pages/canvas/use-canvas-history";
import type { Dispatch, SetStateAction } from "react";
import { CanvasNodeType } from "@/types/canvas";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// React DOM must initialize after the test browser globals; static imports run too early.
const { act, createElement, useMemo, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useCanvasHistory } = await import("@/pages/canvas/use-canvas-history");
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

function initialSnapshot(): CanvasHistorySnapshot {
    return {
        nodes: [{ id: "n", type: CanvasNodeType.Image, title: "image", position: { x: 0, y: 0 }, width: 240, height: 160, metadata: { content: "unchanged", status: "success" } }],
        connections: [{ id: "edge", fromNodeId: "n", toNodeId: "target" }],
        chatSessions: [],
        activeChatId: null,
        canvasAppearance: { mode: "dark" },
        backgroundMode: "dots",
        showImageInfo: false,
    };
}

// A save echo rehydrates objects and may change key order/omit undefined keys.
function echo(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(echo);
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value)
                .reverse()
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, echo(v)]),
        );
    return value;
}

async function fixture() {
    jest.useFakeTimers();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host),
        initial = initialSnapshot();
    let loaded = true;
    let snapshot!: CanvasHistorySnapshot;
    let change!: Dispatch<SetStateAction<CanvasHistorySnapshot>>;
    let history!: { undoCanvas: () => void; redoCanvas: () => void; resetHistory: (s: CanvasHistorySnapshot) => void; historyState: { canUndo: boolean; canRedo: boolean } };
    function Harness() {
        const [state, setState] = useState(initial);
        snapshot = state;
        change = setState;
        const setters = useMemo(() => {
            function field<K extends keyof CanvasHistorySnapshot>(key: K) {
                return (value: SetStateAction<CanvasHistorySnapshot[K]>) => setState((previous) => ({ ...previous, [key]: typeof value === "function" ? (value as (v: CanvasHistorySnapshot[K]) => CanvasHistorySnapshot[K])(previous[key]) : value }));
            }
            return {
                setNodes: field("nodes"),
                setConnections: field("connections"),
                setChatSessions: field("chatSessions"),
                setActiveChatId: field("activeChatId"),
                applyCanvasAppearance: field("canvasAppearance"),
                setBackgroundMode: field("backgroundMode"),
                setShowImageInfo: field("showImageInfo"),
            };
        }, []);
        history = useCanvasHistory({ ...state, ...setters, projectLoaded: loaded, setSelectedNodeIds: () => {}, setSelectedConnectionId: () => {}, setContextMenu: () => {} });
        return null;
    }
    const render = () => act(async () => root.render(createElement(Harness)));
    await render();
    await act(async () => history.resetHistory(initial));
    return {
        snapshot: () => snapshot,
        state: () => history.historyState,
        edit: async (update: SetStateAction<CanvasHistorySnapshot>) => act(async () => change(update)),
        echo: async () => act(async () => change((s) => echo(s) as CanvasHistorySnapshot)),
        commit: async () =>
            act(async () => {
                jest.advanceTimersByTime(220);
            }),
        undo: async () => act(async () => history.undoCanvas()),
        redo: async () => act(async () => history.redoCanvas()),
        reset: async (next: CanvasHistorySnapshot, nextLoaded = true) => {
            loaded = nextLoaded;
            await act(async () => {
                change(next);
                history.resetHistory(next);
                root.render(createElement(Harness));
            });
        },
        cleanup: async () => {
            await act(async () => root.unmount());
            jest.useRealTimers();
            host.remove();
        },
    };
}

for (const pending of [false, true])
    test(`one undo restores only deletion and preserves the prior drag (${pending ? "pending" : "saved echo"})`, async () => {
        const f = await fixture();
        try {
            await f.edit((s) => ({ ...s, nodes: s.nodes.map((n) => ({ ...n, position: { x: 60, y: 40 } })) }));
            await f.commit();
            await f.edit((s) => ({ ...s, connections: [] }));
            if (!pending) {
                await f.commit();
                await f.echo();
                await f.commit();
            }
            await f.undo();
            expect(f.snapshot().connections.map((c) => c.id)).toEqual(["edge"]);
            expect(f.snapshot().nodes[0].position).toEqual({ x: 60, y: 40 });
            await f.commit();
            expect(f.state().canRedo).toBe(true);
            await f.echo();
            await f.commit();
            await f.redo();
            expect(f.snapshot().connections).toEqual([]);
            expect(f.snapshot().nodes[0].position).toEqual({ x: 60, y: 40 });
        } finally {
            await f.cleanup();
        }
    });

test("equivalent rehydrated values, key order and missing undefined object fields create no undo step", async () => {
    const f = await fixture();
    try {
        await f.edit((s) => ({ ...s, nodes: s.nodes.map((n) => ({ ...n, metadata: { ...n.metadata, prompt: undefined } })) }));
        await f.commit();
        expect(f.state()).toEqual({ canUndo: false, canRedo: false });
        await f.echo();
        await f.commit();
        expect(f.state()).toEqual({ canUndo: false, canRedo: false });
    } finally {
        await f.cleanup();
    }
});

test("a real pending edit invalidates the redo branch before redo can apply it", async () => {
    const f = await fixture();
    try {
        await f.edit((s) => ({ ...s, connections: [] }));
        await f.commit();
        await f.undo();
        await f.commit();
        await f.edit((s) => ({ ...s, nodes: s.nodes.map((n) => ({ ...n, position: { x: 90, y: 0 } })) }));
        await f.redo();
        expect(f.snapshot().nodes[0].position.x).toBe(90);
        expect(f.snapshot().connections.map((c) => c.id)).toEqual(["edge"]);
        expect(f.state().canRedo).toBe(false);
        await f.undo();
        expect(f.snapshot().nodes[0].position.x).toBe(0);
    } finally {
        await f.cleanup();
    }
});

test("array order, nested metadata and appearance edits remain undoable", async () => {
    const f = await fixture();
    try {
        const original = f.snapshot();
        await f.edit((s) => ({
            ...s,
            nodes: [{ ...s.nodes[0], metadata: { ...s.nodes[0].metadata, prompt: "changed", batchChildIds: ["b", "a"] } }],
            connections: [...s.connections, { id: "second", fromNodeId: "target", toNodeId: "n" }],
            canvasAppearance: { mode: "light" },
        }));
        await f.commit();
        await f.edit((s) => ({ ...s, nodes: [{ ...s.nodes[0], metadata: { ...s.nodes[0].metadata, batchChildIds: ["a", "b"] } }], connections: [...s.connections].reverse() }));
        await f.commit();
        await f.undo();
        expect(f.snapshot().nodes[0].metadata?.batchChildIds).toEqual(["b", "a"]);
        expect(f.snapshot().connections.map((c) => c.id)).toEqual(["edge", "second"]);
        await f.commit();
        await f.undo();
        expect(f.snapshot()).toEqual(original);
    } finally {
        await f.cleanup();
    }
});

test("unchanged entity references do not traverse or serialize large content", async () => {
    const f = await fixture();
    try {
        const guarded = new Proxy(f.snapshot().nodes[0], {
            ownKeys() {
                throw Error("unchanged entity was traversed");
            },
        });
        await f.reset({ ...f.snapshot(), nodes: [guarded] });
        await f.edit((s) => ({ ...s, nodes: [...s.nodes], connections: [] }));
        await f.commit();
        await f.undo();
        expect(f.snapshot().nodes[0]).toBe(guarded);
        expect(f.snapshot().connections.map((c) => c.id)).toEqual(["edge"]);
    } finally {
        await f.cleanup();
    }
});

test("project reset and unloaded hydration discard pending edits and old redo", async () => {
    const f = await fixture();
    try {
        await f.edit((s) => ({ ...s, connections: [] }));
        await f.commit();
        await f.undo();
        await f.commit();
        expect(f.state().canRedo).toBe(true);
        await f.edit((s) => ({ ...s, nodes: s.nodes.map((n) => ({ ...n, title: "pending old-project edit" })) }));
        const next = { ...initialSnapshot(), nodes: [{ ...initialSnapshot().nodes[0], id: "new-project" }] };
        await f.reset(next, false);
        await f.echo();
        await f.commit();
        await f.reset(f.snapshot());
        await f.commit();
        expect(f.state()).toEqual({ canUndo: false, canRedo: false });
        await f.undo();
        expect(f.snapshot().nodes[0].id).toBe("new-project");
    } finally {
        await f.cleanup();
    }
});
