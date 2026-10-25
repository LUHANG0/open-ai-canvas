import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/create?baseUrl=https%3A%2F%2Ffixture.invalid&apiKey=ignored-fixture&conversation=keep#selected" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const updates: string[] = [];
const actions = { setRuntimeStatuses() {}, setPluginStates() {}, hydrated: false };
mock.module("../src/stores/use-config-store", () => ({ createModelChannel: (value: unknown) => value, useConfigStore: (select: (state: unknown) => unknown) => select({ config: { channels: [] }, updateConfig: (key: string) => updates.push(key) }) }));
mock.module("../src/stores/use-plugin-store", () => ({ usePluginStore: Object.assign((select: (state: unknown) => unknown) => select(actions), { getState: () => actions }) }));
mock.module("../src/stores/use-user-store", () => ({ useUserStore: (select: (state: unknown) => unknown) => select({ user: null }) }));
mock.module("../src/services/diagnostics/client-diagnostics", () => ({ initializeClientDiagnostics() {}, setDiagnosticUserScope() {} }));
mock.module("../src/lib/settings-navigation", () => ({ navigateToSettings: () => updates.push("settings") }));
mock.module("antd", () => ({ App: { useApp: () => ({ message: { warning: () => updates.push("warning"), success: () => updates.push("success") } }) } }));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ClientRootInit } = await import("../src/components/layout/client-root-init");
afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

test("the real config-import cleanup removes sensitive URL keys while preserving router state and business context", async () => {
    const state = { idx: 3, key: "fixture-key", usr: { authReturn: { next: "/settings?section=profile#security", flow: "fixture-flow" } } };
    dom.history.replaceState(state, "");
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<ClientRootInit><p>stable shell</p></ClientRootInit>));
        expect(dom.history.state).toEqual(state);
        expect(dom.location.pathname + dom.location.search + dom.location.hash).toBe("/create?conversation=keep#selected");
        expect(updates).toEqual(["channels", "baseUrl", "settings", "warning"]);
        expect(host.textContent).toBe("stable shell");
    } finally { await act(async () => root.unmount()); host.remove(); }
});
