import { afterAll, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react"); const { createRoot } = await import("react-dom/client");
const { LoadingContent } = await import("../src/components/canvas/canvas-node-status-content");
const { canvasThemes } = await import("../src/lib/canvas-theme");
const { CanvasNodeType } = await import("../src/types/canvas");
import type { CanvasNodeData } from "../src/types/canvas";
function node(metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData { return { id: "fixture", type: CanvasNodeType.Video, title: "video", width: 720, height: 180, position: { x: 0, y: 0 }, metadata: { taskId: "fixture-private-task-id", status: "loading", taskStatus: "running", taskStage: "作品创作中", taskCreatedAt: new Date(Date.now() - 120000).toISOString(), ...metadata } }; }

test("real loading content shows one state, live elapsed separately, and an accessible detail command without a visible task ID", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); let opens = 0; let bubbled = 0;
    const value = node();
    await act(async () => root.render(<div onClick={() => bubbled++} onKeyDown={() => bubbled++}><LoadingContent node={value} theme={canvasThemes.light} onOpenTaskDetails={(actual) => { expect(actual).toBe(value); opens++; }} /></div>));
    expect(host.querySelector('[role="status"]')?.textContent).toBe("生成中");
    expect(host.querySelector('[role="status"]')?.closest('[aria-busy="true"]')).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).not.toContain("已耗时");
    expect(host.textContent).toContain("已耗时"); expect(host.textContent).not.toContain("fixture-private-task-id");
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="查看任务详情"]')!;
    const key = new dom.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }); button.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false); expect(bubbled).toBe(0);
    await act(async () => button.click()); expect(opens).toBe(1); expect(bubbled).toBe(0);
    expect(button.hasAttribute("data-canvas-no-zoom")).toBe(true);
    await act(async () => root.unmount()); host.remove();
});

test("real content exposes only genuine progress and honors the per-node reduced-motion switch", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<LoadingContent node={node({ taskStage: "generating", taskProgress: 43 })} theme={canvasThemes.dark} disableMediaEffects />));
    const progress = host.querySelector('[role="progressbar"]')!;
    expect(progress.getAttribute("aria-valuenow")).toBe("43"); expect(progress.querySelector("span")?.style.transform).toBe("scaleX(0.43)");
    expect(host.querySelector(".canvas-generation-status")?.getAttribute("data-reduced-motion")).toBe("true");
    await act(async () => root.render(<LoadingContent node={node({ taskStage: "submission_unknown", taskProgress: 43 })} theme={canvasThemes.dark} />));
    expect(host.querySelector('[role="progressbar"]')).toBeNull(); expect(host.textContent).toContain("为避免重复扣费，未自动重试");
    expect(host.querySelector(".canvas-generation-status")?.getAttribute("data-active")).toBe("false");
    await act(async () => root.unmount()); host.remove();
});

test("terminal loading observations do not start or retain a ticker subscription", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const interval = spyOn(globalThis, "setInterval"); const clear = spyOn(globalThis, "clearInterval");
    try {
        await act(async () => root.render(<LoadingContent node={node({ taskStatus: "succeeded", taskCompletedAt: new Date().toISOString() })} theme={canvasThemes.light} />));
        expect(interval.mock.calls.filter((call) => call[1] === 1000).length).toBe(0);
        await act(async () => root.render(<LoadingContent node={node()} theme={canvasThemes.light} />));
        expect(interval.mock.calls.filter((call) => call[1] === 1000).length).toBe(1);
        const clearedBefore = clear.mock.calls.length;
        await act(async () => root.render(<LoadingContent node={node({ taskStatus: "failed" })} theme={canvasThemes.light} />));
        expect(clear.mock.calls.length).toBeGreaterThan(clearedBefore);
        expect(host.textContent).not.toContain("已耗时");
    } finally { await act(async () => root.unmount()); interval.mockRestore(); clear.mockRestore(); host.remove(); }
});

afterAll(() => { for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); dom.happyDOM.abort(); });
