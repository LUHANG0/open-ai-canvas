import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { AGENT_PANEL_LAYOUT_KEY, type AgentPanelGesture } from "@/lib/canvas/agent-panel-layout";

const dom = new Window({ url: "http://localhost/", width: 1280, height: 800 });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Event: dom.Event, localStorage: dom.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useAgentPanelLayout } = await import("@/components/canvas/use-agent-panel-layout");
const corners = ["northwest", "northeast", "southwest", "southeast"] as const;
const initial = { left: 200, top: 100, width: 500, height: 600 };

afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture(compact = false) {
    dom.innerWidth = compact ? 390 : 1280;
    dom.innerHeight = 800;
    dom.localStorage.setItem(AGENT_PANEL_LAYOUT_KEY, JSON.stringify(initial));
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    function Harness() {
        const layout = useAgentPanelLayout();
        return <aside style={layout.style} {...layout.pointerHandlers}>
            <header data-agent-drag-handle>Drag header<button type="button">Header action</button></header>
            {corners.map(corner => <button key={corner} type="button" data-agent-resize={corner} onKeyDown={layout.onResizeKeyDown}>{corner}</button>)}
            <button type="button" onClick={layout.reset}>Reset</button>
        </aside>;
    }
    await act(async () => { root.render(<Harness />); });
    const panel = host.querySelector("aside")!;
    const captured = new Set<number>();
    // HappyDOM does not route native captured pointers; model capture ownership.
    // The real browser drag separately verifies capture outside each handle.
    panel.setPointerCapture = id => { captured.add(id); };
    panel.hasPointerCapture = id => captured.has(id);
    panel.releasePointerCapture = id => { captured.delete(id); };
    const pointer = async (type: string, target: HTMLElement = panel, x = 300, y = 200) => {
        await act(async () => { target.dispatchEvent(new dom.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, isPrimary: true, button: 0, clientX: x, clientY: y }) as unknown as Event); });
    };
    const handle = (kind: AgentPanelGesture) => host.querySelector<HTMLButtonElement>(`[data-agent-resize="${kind}"]`)!;
    const geometry = () => ({ left: parseFloat(panel.style.left), top: parseFloat(panel.style.top), width: parseFloat(panel.style.width), height: parseFloat(panel.style.height) });
    const cleanup = async () => { await act(async () => { root.unmount(); }); host.remove(); };
    return { host, panel, captured, pointer, handle, geometry, cleanup };
}

for (const corner of corners) {
    test(`${corner}: real layout hook captures a drag and releases it on pointerup`, async () => {
        const f = await fixture();
        try {
            await f.pointer("pointerdown", f.handle(corner));
            expect(f.captured.has(7)).toBe(true);
            await f.pointer("pointermove", f.panel, corner.includes("west") ? 240 : 360, corner.includes("north") ? 160 : 240);
            expect(f.geometry().width).toBe(560);
            expect(f.geometry().height).toBe(640);
            await f.pointer("pointerup");
            expect(f.captured.has(7)).toBe(false);
            const stopped = f.geometry();
            await f.pointer("pointermove", f.panel, 500, 500);
            expect(f.geometry()).toEqual(stopped);
        } finally { await f.cleanup(); }
    });
    test(`${corner}: keyboard arrows and Shift arrows resize around the correct anchor`, async () => {
        const f = await fixture();
        try {
            const key = async (value: string, shiftKey = false) => act(async () => { f.handle(corner).dispatchEvent(new dom.KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true }) as unknown as Event); });
            await key(corner.includes("west") ? "ArrowLeft" : "ArrowRight");
            await key(corner.includes("north") ? "ArrowUp" : "ArrowDown", true);
            expect(f.geometry().width).toBe(510);
            expect(f.geometry().height).toBe(640);
            expect(corner.includes("west") ? f.geometry().left + f.geometry().width : f.geometry().left).toBe(corner.includes("west") ? 700 : 200);
            expect(corner.includes("north") ? f.geometry().top + f.geometry().height : f.geometry().top).toBe(corner.includes("north") ? 700 : 100);
        } finally { await f.cleanup(); }
    });
}

test("pointercancel and lost capture stop resizing without a stuck gesture", async () => {
    const f = await fixture();
    try {
        for (const end of ["pointercancel", "lostpointercapture"]) {
            await f.pointer("pointerdown", f.handle("southeast"));
            await f.pointer("pointermove", f.panel, 330, 230);
            if (end === "lostpointercapture") f.captured.delete(7);
            await f.pointer(end);
            const stopped = f.geometry();
            await f.pointer("pointermove", f.panel, 800, 700);
            expect(f.geometry()).toEqual(stopped);
            expect(f.captured.size).toBe(0);
        }
    } finally { await f.cleanup(); }
});

test("dragging header moves the window, its action button does not", async () => {
    const f = await fixture();
    try {
        await f.pointer("pointerdown", f.host.querySelector("header button")!);
        await f.pointer("pointermove", f.panel, 350, 250);
        expect(f.geometry()).toEqual(initial);
        await f.pointer("pointerdown", f.host.querySelector("header")!);
        await f.pointer("pointermove", f.panel, 350, 250);
        await f.pointer("pointerup");
        expect(f.geometry()).toEqual({ ...initial, left: 250, top: 150 });
    } finally { await f.cleanup(); }
});

test("compact mode keeps full width and preserves the desktop preference", async () => {
    const f = await fixture(true);
    try {
        await f.pointer("pointerdown", f.handle("southeast"));
        await f.pointer("pointermove", f.panel, 350, 250);
        expect(f.panel.style.width).toBe("100%");
        expect(f.captured.size).toBe(0);
        expect(JSON.parse(dom.localStorage.getItem(AGENT_PANEL_LAYOUT_KEY)!)).toEqual(initial);
    } finally { await f.cleanup(); }
});
