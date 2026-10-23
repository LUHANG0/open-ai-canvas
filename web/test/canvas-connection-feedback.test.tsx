import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Event: dom.Event, localStorage: dom.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ConnectionPath, canvasConnectionPath } = await import("@/components/canvas/canvas-connections");
const { useCanvasThemeStore } = await import("@/stores/canvas/use-canvas-theme-store");
const originalTheme = { theme: useCanvasThemeStore.getState().theme, active: useCanvasThemeStore.getState().active };
const { CanvasNodeType } = await import("@/types/canvas");
const from = { id: "from", title: "Source", type: CanvasNodeType.Text, position: { x: 0, y: 0 }, width: 200, height: 100 };
const to = { ...from, id: "to", position: { x: 500, y: 200 } };
const connection = { id: "feedback-edge", fromNodeId: from.id, toNodeId: to.id };

afterAll(async () => {
    useCanvasThemeStore.setState(originalTheme);
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture(theme: "light" | "dark", active = false) {
    useCanvasThemeStore.setState({ theme, active: true });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    let selected = 0;
    const render = async (nextActive = active, hideVisual = false) => act(async () => { root.render(<svg><ConnectionPath connection={connection} from={from} to={to} active={nextActive} hideVisual={hideVisual} visualMode="hover-only" onSelect={() => { selected++; }} /></svg>); });
    await render();
    const hit = () => host.querySelector<SVGPathElement>('[data-connection-id="feedback-edge"]')!;
    const mouse = async (type: string) => act(async () => { hit().dispatchEvent(new dom.MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget: document.body }) as unknown as Event); });
    const cleanup = async () => { await act(async () => root.unmount()); host.remove(); };
    return { host, hit, mouse, render, cleanup, selected: () => selected };
}

test("real light hover and selection emphasize the visible curve without changing its hit path", async () => {
    const f = await fixture("light");
    try {
        const originalPath = canvasConnectionPath(connection, from, to).pathD;
        expect(f.host.querySelector('[data-connection-beam]')).toBeNull();
        expect(f.hit().getAttribute("stroke-width")).toBe("16");
        await f.mouse("mouseover");
        expect(f.host.querySelectorAll('.canvas-connection-comet')).toHaveLength(8);
        expect(f.host.querySelector('path[stroke="#737373"]')?.getAttribute("stroke-width")).toBe("1.4");
        expect(f.host.querySelector('.canvas-connection-comet:last-child')?.getAttribute("stroke-width")).toBe("2.65");
        await f.render(true);
        await f.mouse("mouseout");
        expect(f.host.querySelector('[data-connection-beam]')).not.toBeNull();
        expect(f.host.querySelector('path[stroke="#737373"]')).not.toBeNull();
        await f.render(true, true);
        expect(f.host.querySelectorAll("path")).toHaveLength(1);
        expect(f.hit().getAttribute("d")).toBe(originalPath);
        expect(f.hit().getAttribute("vector-effect")).toBe("non-scaling-stroke");
        await f.mouse("click");
        expect(f.selected()).toBe(1);
    } finally { await f.cleanup(); }
});

test("theme switching updates the selected beam and dark retains its original overlay behavior", async () => {
    const f = await fixture("dark", true);
    try {
        const d = f.hit().getAttribute("d");
        expect(f.host.querySelectorAll("path")).toHaveLength(9);
        expect(f.host.querySelector('.canvas-connection-comet:last-child')?.getAttribute("stroke-width")).toBe("2.1");
        await act(async () => { useCanvasThemeStore.setState({ theme: "light" }); });
        expect(f.host.querySelector('path[stroke="#737373"]')).not.toBeNull();
        expect(f.host.querySelector('.canvas-connection-comet:last-child')?.getAttribute("stroke-opacity")).toBe("0.94");
        await act(async () => { useCanvasThemeStore.setState({ theme: "dark" }); });
        expect(f.host.querySelectorAll("path")).toHaveLength(9);
        expect(f.host.querySelector('.canvas-connection-comet:last-child')?.getAttribute("stroke-width")).toBe("2.1");
        expect(f.hit().getAttribute("d")).toBe(d);
    } finally { await f.cleanup(); }
});
