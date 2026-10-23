import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, ShadowRoot: dom.ShadowRoot, Element: dom.Element, Node: dom.Node, ResizeObserver: dom.ResizeObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App } = await import("antd");
const { createMemoryRouter, RouterProvider, useLocation } = await import("react-router");
const { AuthScene } = await import("@/pages/auth/auth-scene");
const { VerificationFields } = await import("@/components/auth/verification-fields");
const { RunningHubSettingsPane } = await import("@/pages/settings/runninghub-settings-pane");
const { useAppearanceStore } = await import("@/stores/use-appearance-store");
const { useConfigStore } = await import("@/stores/use-config-store");
const { emptyVerification } = await import("@/services/api/verification");

function RouteProbe({ label }: { label: string }) {
    const location = useLocation();
    return <p data-search={location.search}>{label}</p>;
}

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("auth tabs ignore current-item navigation and preserve route search, panel associations and keyboard focus on real changes", async () => {
    const appearance = useAppearanceStore.getState().appearance;
    useAppearanceStore.setState({ appearance: { ...appearance, authVideoUrl: "", authVideoPosterUrl: "" } });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const router = createMemoryRouter([{ element: <AuthScene />, children: [{ path: "/login", element: <RouteProbe label="登录表单" /> }, { path: "/register", element: <RouteProbe label="注册表单" /> }] }], { initialEntries: ["/login?next=%2Fsettings"] });
    const navigationKeys = [router.state.location.key];
    const unsubscribe = router.subscribe(({ location }) => {
        if (navigationKeys.at(-1) !== location.key) navigationKeys.push(location.key);
    });
    try {
        await act(async () => root.render(<RouterProvider router={router} />));
        const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        expect(tabs.length).toBe(2);
        const key = async (index: number, value: string) => act(async () => { tabs[index].dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); });
        await act(async () => tabs[0].click());
        await key(0, "Home");
        expect(document.activeElement).toBe(tabs[0]);
        expect(navigationKeys).toHaveLength(1);
        await key(0, "ArrowRight");
        expect(navigationKeys).toHaveLength(2);
        expect(document.activeElement).toBe(tabs[1]);
        expect(tabs[1].getAttribute("aria-selected")).toBe("true");
        expect([...tabs].filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
        const panel = document.getElementById(tabs[1].getAttribute("aria-controls")!)!;
        expect(panel.getAttribute("aria-labelledby")).toBe(tabs[1].id);
        expect(panel.textContent).toBe("注册表单");
        expect(panel.querySelector("[data-search]")?.getAttribute("data-search")).toBe("?next=%2Fsettings");
        expect(host.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);
        await act(async () => tabs[1].click());
        await key(1, "End");
        expect(document.activeElement).toBe(tabs[1]);
        expect(navigationKeys).toHaveLength(2);
        await key(1, "Home"); expect(document.activeElement).toBe(tabs[0]); expect(navigationKeys).toHaveLength(3);
        await key(0, "End"); expect(document.activeElement).toBe(tabs[1]); expect(navigationKeys).toHaveLength(4);
        await key(1, "ArrowRight"); expect(document.activeElement).toBe(tabs[0]); expect(navigationKeys).toHaveLength(5);
        await act(async () => tabs[1].click());
        expect(navigationKeys).toHaveLength(6);
        expect(router.state.location.pathname).toBe("/register");
        expect(router.state.location.search).toBe("?next=%2Fsettings");
    } finally {
        await act(async () => root.unmount()); host.remove();
        unsubscribe(); router.dispose();
        useAppearanceStore.setState({ appearance });
    }
});

test("verification code has a single associated input and its send command stays outside the field label", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<App><VerificationFields purpose="login" method="email" value={{ ...emptyVerification }} onChange={() => {}} /></App>));
        const code = host.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!;
        const label = host.querySelector<HTMLLabelElement>(`label[for="${code.id}"]`)!;
        expect(label.textContent).toBe("邮件验证码");
        expect(code.closest("label")).toBeNull();
        const send = host.querySelector<HTMLButtonElement>("button.auth-code-send")!;
        expect(send.closest("label")).toBeNull();
        expect(send.disabled).toBe(true);
        expect(send.type).toBe("button");
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("RunningHub workspace tabs switch panels using the keyboard without changing saved configuration", async () => {
    const config = useConfigStore.getState().config;
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<App><RunningHubSettingsPane /></App>));
        const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="RunningHub 工作区"] [role="tab"]');
        expect(tabs).toHaveLength(2);
        await act(async () => tabs[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })));
        expect(document.activeElement).toBe(tabs[1]);
        expect(tabs[1].getAttribute("aria-selected")).toBe("true");
        const testPanel = document.getElementById(tabs[1].getAttribute("aria-controls")!)!;
        expect(testPanel.hidden).toBe(false);
        expect(testPanel.getAttribute("aria-labelledby")).toBe(tabs[1].id);
        expect(host.querySelector<HTMLInputElement>('textarea[aria-label="工作流测试提示词"]')).not.toBeNull();
        await act(async () => tabs[1].dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true })));
        expect(document.activeElement).toBe(tabs[0]);
        expect(testPanel.hidden).toBe(true);
        expect(host.querySelector('[role="radiogroup"][aria-label="工作流类型"]')).not.toBeNull();
        expect(useConfigStore.getState().config).toBe(config);
    } finally { await act(async () => root.unmount()); host.remove(); }
});
