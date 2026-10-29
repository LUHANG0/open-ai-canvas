import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { CreationMessage } from "../src/pages/create/creation-types";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
afterAll(() => {
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    dom.happyDOM.abort();
});
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MediaResult } = await import("../src/pages/create/creation-workspace-messages");
const noop = () => {};

test("recovering the rest of a media batch leaves already delivered images visible", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const item: CreationMessage = { id: "partial", role: "assistant", content: "", createdAt: "2026-10-29T00:00:00Z", mode: "image", status: "pending", taskIds: ["a", "b"], resultUrls: ["https://fixture.invalid/completed.png"] };
    try {
        await act(async () => root.render(<MediaResult item={item} onRetryFailure={noop} onCreateVariant={noop} onContinueCanvas={noop} openingCanvas={false} />));
        expect(host.textContent).toContain("其余任务正在生成");
        expect(host.querySelector("img")?.getAttribute("src")).toBe("https://fixture.invalid/completed.png");
        await act(async () => root.render(<MediaResult item={{ ...item, status: "error", errorKind: "sync" }} onRetryFailure={noop} onCreateVariant={noop} onContinueCanvas={noop} openingCanvas={false} />));
        expect(host.textContent).toContain("重新获取结果");
        expect(host.querySelector("img")?.getAttribute("src")).toBe("https://fixture.invalid/completed.png");
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
