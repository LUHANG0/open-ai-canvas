import { afterAll, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, ShadowRoot: dom.ShadowRoot, Element: dom.Element, Node: dom.Node, ResizeObserver: dom.ResizeObserver, MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App, ConfigProvider } = await import("antd");
const { WorkspaceWalletModal } = await import("../src/components/layout/workspace-wallet-modal");
const { http } = await import("../src/services/api/request");

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, value] of originals) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key);
});

test("existing order confirmation displays its currency without creating or charging an order", async () => {
    const post = spyOn(http, "post").mockImplementation(async () => { throw new Error("payment writes are forbidden in this test"); });
    const get = spyOn(http, "get");
    try {
        for (const [currency, expected] of [["USD", "$1.01"], ["CNY", "¥1.01"], ["EUR", "EUR 1.01"]]) {
            const host = document.createElement("div"); document.body.append(host);
            const root = createRoot(host);
            get.mockImplementation(async (url) => {
                if (url === "/wallet") return { account: { availableMicrocredits: 0, reservedMicrocredits: 0 }, entries: [], total: 0, page: 1, pageSize: 20, policy: {} } as never;
                if (url === "/payments/products") return { products: [] } as never;
                if (url === "/payments/providers") return { providers: [] } as never;
                if (url === "/payments/orders/currency-fixture") return { order: { id: "currency-fixture", productName: "币种显示验收", amountFen: 101, currency, creditsMicrocredits: 1000000, status: "closed", checkout: { mode: "" } } } as never;
                throw new Error(`Unexpected request: ${url}`);
            });
            try {
                await act(async () => root.render(<ConfigProvider theme={{ token: { motion: false } }}><App><WorkspaceWalletModal open pendingPaymentOrderId="currency-fixture" onClose={() => {}} /></App></ConfigProvider>));
                expect(document.querySelector(".workspace-wallet-payment strong")?.textContent).toBe(expected);
                expect(post).not.toHaveBeenCalled();
            } finally { await act(async () => root.unmount()); host.remove(); }
        }
    } finally { get.mockRestore(); post.mockRestore(); }
});
