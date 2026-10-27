import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage, Event: dom.Event, CustomEvent: dom.CustomEvent, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
afterAll(() => { for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); dom.happyDOM.abort(); });
// DOM globals must initialize before React DOM and canvas UI modules load.
const { act, createRef } = await import("react"); const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const { CanvasNodeResultRecord } = await import("../src/components/canvas/canvas-node-result-record");
const { CanvasNode } = await import("../src/components/canvas/canvas-node");
const { CanvasNodeType } = await import("../src/types/canvas");
const { CanvasViewport } = await import("../src/components/canvas/canvas-viewport");
const { applyCanvasLiveViewport } = await import("../src/lib/canvas/canvas-live-viewport");
const resultStyles = document.createElement("style");
resultStyles.textContent = await Bun.file(`${import.meta.dir}/../src/components/canvas/canvas-node-result-record.css`).text();
document.head.append(resultStyles);
import type { CanvasNodeData } from "../src/types/canvas";
const resultRecord = { mediaKey: "resource:result", taskId: "task-a", startedAt: "2026-10-25T00:00:00Z", completedAt: "2026-10-25T00:02:38Z", billing: { actualAmountMicrocredits: 8_800_000, scope: "result" as const } };
function node(metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData { return { id: "fixture", type: CanvasNodeType.Video, title: "result", width: 320, height: 180, position: { x: 20, y: 40 }, metadata: { content: "/result", storageKey: "resource:result", status: "success", producedModel: "Seedance 2.0", naturalWidth: 1280, naturalHeight: 720, durationMs: 15000, resultRecord, ...metadata } }; }
const noop = () => {};

test("completed metadata stays one line with secondary facts in its tooltip and ignores the next selector", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<CanvasNodeResultRecord node={node()} enabled />));
        const row = host.querySelector('[role="group"]')!;
        expect(row.querySelector("details, summary, button, [tabindex]")).toBeNull();
        expect(row.querySelector(".generation-result-metadata-summary")?.textContent).toContain("720P");
        expect(row.querySelector(".generation-result-metadata-summary")?.textContent).not.toContain("15秒");
        expect(row.getAttribute("aria-label")).toContain("8.8积分");
        expect(row.querySelector(".generation-result-metadata")?.getAttribute("title")).toContain("15秒");
        expect(row.querySelector(".generation-result-metadata")?.getAttribute("title")).toContain("task-a");
        expect(row.querySelector("dl, br, .generation-result-metadata-detail-list")).toBeNull();
        const before = row.textContent;
        await act(async () => root.render(<CanvasNodeResultRecord node={node({ model: "new-selected-model", size: "9:16", seconds: "99", vquality: "4k" })} enabled />));
        expect(host.textContent).toBe(before);
        expect(host.textContent).not.toContain("new-selected-model");
        await act(async () => root.render(<CanvasNodeResultRecord node={node()} enabled={false} />));
        expect(host.textContent).toBe("");
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("metadata contains pointer and shortcut events while allowing canvas wheel zoom", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); let bubbled = 0;
    try {
        await act(async () => root.render(<div onMouseDown={() => bubbled++} onPointerDown={() => bubbled++} onWheel={() => bubbled++} onKeyDown={() => bubbled++} onClick={() => bubbled++}><CanvasNodeResultRecord node={node()} enabled /></div>));
        const row = host.querySelector<HTMLDivElement>(".canvas-node-result-record")!;
        expect(row.querySelector("a, button, summary, [tabindex]")).toBeNull();
        for (const type of ["mousedown", "pointerdown", "click"]) row.dispatchEvent(new dom.Event(type, { bubbles: true }));
        for (const key of ["ArrowRight", "Delete", "Backspace", "Tab", "Enter", " "]) {
            const event = new dom.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
            row.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(false);
        }
        expect(bubbled).toBe(0);
        row.dispatchEvent(new dom.Event("wheel", { bubbles: true }));
        expect(bubbled).toBe(1);
        expect(row.hasAttribute("data-canvas-no-zoom")).toBe(false); expect(row.hasAttribute("data-canvas-wheel-scroll")).toBe(false);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("the real CanvasNode puts the sole record outside media geometry and honors info preference, LOD and read-only mode", () => {
    const value = node({ locked: true, manualSize: true, freeResize: true }); const before = JSON.stringify(value);
    function render(showImageInfo: boolean, readOnly = false, renderLOD: "full" | "preview" = "full") {
        const html = renderToStaticMarkup(<CanvasNode data={value} scale={1} isSelected={false} isRelated={false} isFocusRelated={false} isConnectionTarget={false} showImageInfo={showImageInfo} readOnly={readOnly} renderLOD={renderLOD} renderNodeContent={() => <div data-fixture-media />} onMouseDown={noop} onHoverStart={noop} onHoverEnd={noop} onConnectStart={noop} onResize={noop} onContentChange={noop} onContextMenu={noop} />);
        const host = document.createElement("div"); host.innerHTML = html; return host;
    }
    const host = render(true); const shell = host.querySelector(".canvas-node-shell")!; const row = host.querySelector(".canvas-node-result-record")!;
    expect(shell.contains(row)).toBe(false); expect(host.querySelectorAll(".generation-result-metadata").length).toBe(1);
    const outer = host.querySelector<HTMLElement>("[data-node-id]")!;
    expect(outer.style.width).toBe("320px"); expect(outer.style.height).toBe("180px"); expect(outer.style.transform).toBe("translate(20px, 40px)");
    expect(shell.textContent).not.toContain("Seedance 2.0");
    expect(render(false).querySelector(".canvas-node-result-record")).toBeNull();
    expect(render(true, false, "preview").querySelector(".canvas-node-result-record")).toBeNull();
    expect(render(true, true).querySelector(".canvas-node-result-record")).not.toBeNull();
    expect(JSON.stringify(value)).toBe(before);
});

test("result info follows committed and live 85% zoom without a React commit or fallback badges", () => {
    const value = node();
    const before = JSON.stringify(value);
    for (const committedScale of [0.849, 0.85, 1]) {
        const host = document.createElement("div");
        host.innerHTML = renderToStaticMarkup(<CanvasViewport containerRef={createRef<HTMLDivElement>()} viewport={{ x: 0, y: 0, k: committedScale }} onViewportChange={noop}>
            <CanvasNode data={value} scale={committedScale} isSelected={false} isRelated={false} isFocusRelated={false} isConnectionTarget={false} showImageInfo readOnly renderLOD="full" renderNodeContent={() => <div data-fixture-media />} onMouseDown={noop} onHoverStart={noop} onHoverEnd={noop} onConnectStart={noop} onResize={noop} onContentChange={noop} onContextMenu={noop} />
        </CanvasViewport>);
        document.body.append(host);
        try {
            const viewport = host.querySelector<HTMLDivElement>("[data-canvas-viewport]")!;
            const row = host.querySelector<HTMLElement>(".canvas-node-result-record")!;
            const shell = host.querySelector<HTMLElement>(".canvas-node-shell")!;
            const outer = host.querySelector<HTMLElement>("[data-node-id]")!;
            const geometry = outer.style.cssText;
            expect(getComputedStyle(row).display).toBe(committedScale >= 0.85 ? "flex" : "none");
            viewport.dataset.canvasViewportInteracting = "true";
            for (const scale of [0.84, 0.85, 1.2, 0.849]) {
                applyCanvasLiveViewport(viewport, { x: 10, y: -20, k: scale }, false);
                expect(getComputedStyle(row).display).toBe(scale >= 0.85 ? "flex" : "none");
                expect(row.querySelector("a, button, summary, [tabindex]")).toBeNull();
                expect(shell.textContent).not.toContain("Seedance 2.0");
                expect(outer.style.cssText).toBe(geometry);
            }
            expect(JSON.stringify(value)).toBe(before);
        } finally { host.remove(); }
    }
});
