import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
afterAll(() => { for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); dom.happyDOM.abort(); });
const { act } = await import("react"); const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const { CanvasNodeResultRecord } = await import("../src/components/canvas/canvas-node-result-record");
const { CanvasNode } = await import("../src/components/canvas/canvas-node");
const { CanvasNodeType } = await import("../src/types/canvas");
import type { CanvasNodeData } from "../src/types/canvas";
const resultRecord = { mediaKey: "resource:result", taskId: "task-a", startedAt: "2026-10-25T00:00:00Z", completedAt: "2026-10-25T00:02:38Z", billing: { actualAmountMicrocredits: 8_800_000, scope: "result" as const } };
function node(metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData { return { id: "fixture", type: CanvasNodeType.Video, title: "result", width: 320, height: 180, position: { x: 20, y: 40 }, metadata: { content: "/result", storageKey: "resource:result", status: "success", producedModel: "Seedance 2.0", naturalWidth: 1280, naturalHeight: 720, durationMs: 15000, resultRecord, ...metadata } }; }
const noop = () => {};

test("the actual record component shows one line of immutable result facts, without an added detail action", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<CanvasNodeResultRecord node={node()} enabled />));
        const row = host.querySelector('[role="group"]')!;
        expect(row.textContent).toBe("Seedance 2.0 · 720P · 16:9 · 15秒 · 耗时 2分38秒 · 8.8积分");
        expect(row.getAttribute("aria-label")).toBe(`生成记录：${row.textContent}`);
        expect(row.querySelector(".canvas-node-result-record-model")?.getAttribute("title")).toBe("Seedance 2.0");
        expect(row.querySelector("button, a, dialog")).toBeNull();
        await act(async () => root.render(<CanvasNodeResultRecord node={node({ model: "new-selected-model", size: "9:16", seconds: "99", vquality: "4k" })} enabled />));
        expect(host.textContent).toBe(row.textContent);
        expect(host.textContent).not.toContain("new-selected-model");
        await act(async () => root.render(<CanvasNodeResultRecord node={node({ producedModel: undefined })} enabled />));
        expect(host.textContent?.startsWith("720P")).toBe(true);
        expect(host.querySelector(".canvas-node-result-record-model")).toBeNull();
        await act(async () => root.render(<CanvasNodeResultRecord node={node()} enabled={false} />)); expect(host.textContent).toBe("");
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("the focusable narrow row scrolls with keyboard while containing canvas pointer, key and wheel events", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); let bubbled = 0;
    try {
        await act(async () => root.render(<div onMouseDown={() => bubbled++} onPointerDown={() => bubbled++} onWheel={() => bubbled++} onKeyDown={() => bubbled++} onClick={() => bubbled++}><CanvasNodeResultRecord node={node()} enabled /></div>));
        const row = host.querySelector<HTMLDivElement>(".canvas-node-result-record")!;
        Object.defineProperty(row, "clientWidth", { configurable: true, value: 160 }); Object.defineProperty(row, "scrollWidth", { configurable: true, value: 380 });
        row.focus(); expect(document.activeElement).toBe(row);
        for (const type of ["mousedown", "pointerdown", "click", "wheel"]) row.dispatchEvent(new dom.Event(type, { bubbles: true }));
        const key = (value: string) => { const event = new dom.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }); row.dispatchEvent(event); return event; };
        expect(key("ArrowRight").defaultPrevented).toBe(true); expect(row.scrollLeft).toBe(80);
        key("End"); expect(row.scrollLeft).toBe(380); key("Home"); expect(row.scrollLeft).toBe(0);
        expect(key("Tab").defaultPrevented).toBe(false); expect(bubbled).toBe(0);
        expect(row.hasAttribute("data-canvas-no-zoom")).toBe(true); expect(row.hasAttribute("data-canvas-wheel-scroll")).toBe(true);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("the real CanvasNode puts the sole record outside media geometry and honors info preference, LOD and read-only mode", () => {
    const value = node({ locked: true, manualSize: true, freeResize: true }); const before = JSON.stringify(value);
    function render(showImageInfo: boolean, readOnly = false, renderLOD: "full" | "preview" = "full") {
        const html = renderToStaticMarkup(<CanvasNode data={value} scale={1} isSelected={false} isRelated={false} isFocusRelated={false} isConnectionTarget={false} showImageInfo={showImageInfo} readOnly={readOnly} renderLOD={renderLOD} renderNodeContent={() => <div data-fixture-media />} onMouseDown={noop} onHoverStart={noop} onHoverEnd={noop} onConnectStart={noop} onResize={noop} onContentChange={noop} onContextMenu={noop} />);
        const host = document.createElement("div"); host.innerHTML = html; return host;
    }
    const host = render(true); const shell = host.querySelector(".canvas-node-shell")!; const row = host.querySelector(".canvas-node-result-record")!;
    expect(shell.contains(row)).toBe(false); expect(host.querySelectorAll(".canvas-node-result-record-model").length).toBe(1);
    const outer = host.querySelector<HTMLElement>("[data-node-id]")!;
    expect(outer.style.width).toBe("320px"); expect(outer.style.height).toBe("180px"); expect(outer.style.transform).toBe("translate(20px, 40px)");
    expect(shell.textContent).not.toContain("Seedance 2.0");
    expect(render(false).querySelector(".canvas-node-result-record")).toBeNull();
    expect(render(true, false, "preview").querySelector(".canvas-node-result-record")).toBeNull();
    expect(render(true, true).querySelector(".canvas-node-result-record")).not.toBeNull();
    expect(JSON.stringify(value)).toBe(before);
});

