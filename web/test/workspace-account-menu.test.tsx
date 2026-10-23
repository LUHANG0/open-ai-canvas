import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

// rc-util 在 test 环境把不同浮层的 useId 固定为 test-id；本套需要真实的独立浮层身份。
const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "development";
const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement,
    Event: dom.Event, CustomEvent: dom.CustomEvent, KeyboardEvent: dom.KeyboardEvent, MouseEvent: dom.MouseEvent,
    Element: dom.Element, Node: dom.Node, SVGElement: dom.SVGElement, ShadowRoot: dom.ShadowRoot,
    ResizeObserver: dom.ResizeObserver, MutationObserver: dom.MutationObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    __APP_VERSION__: "test", __APP_CHANGELOG__: "", IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

// 只隔离日志按钮的网络刷新；账户、Popover、日志 Modal 与命令面板使用真实组件。
const appearanceBootstrap = await import("@/services/appearance-bootstrap");
const originalAppearanceBootstrap = { ...appearanceBootstrap };
mock.module("@/services/appearance-bootstrap", () => ({ ...originalAppearanceBootstrap, refreshPublicAppearance: async () => undefined }));
const { act, useEffect, useLayoutEffect, useRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, useLocation } = await import("react-router");
const { ConfigProvider } = await import("antd");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { WorkspaceAccountMenu } = await import("@/components/layout/workspace-account-menu");
const { WorkspaceCommandPalette } = await import("@/components/layout/workspace-command-palette");
await import("@/components/layout/app-changelog-dialog");
const { WORKSPACE_WALLET_OPEN_EVENT } = await import("@/lib/workspace-wallet");
const { useUserStore } = await import("@/stores/use-user-store");

afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    mock.module("@/services/appearance-bootstrap", () => originalAppearanceBootstrap);
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture({ deferWindowEscape = false } = {}) {
    const nativeAdd = window.addEventListener;
    const nativeRemove = window.removeEventListener;
    const wrappedListeners = new Map<EventListenerOrEventListenerObject, EventListener>();
    const nativeEscapeCallbacks: (() => void)[] = [];
    let nativeCheckpoints = 0;
    if (deferWindowEscape) {
        // 仅延后实际注册的 window 冒泡回调，显式模拟 root 与 window 回调间的微任务检查点。
        window.addEventListener = ((type, listener, options) => {
            if (type !== "keydown" || !listener) return nativeAdd.call(window, type, listener, options);
            const invoke = (event: Event) => typeof listener === "function" ? listener.call(window, event) : listener.handleEvent(event);
            const wrapped: EventListener = wrappedListeners.get(listener) ?? (event => {
                if ((event as KeyboardEvent).key === "Escape") nativeEscapeCallbacks.push(() => invoke(event));
                else invoke(event);
            });
            wrappedListeners.set(listener, wrapped);
            nativeAdd.call(window, type, wrapped, options);
        }) as typeof window.addEventListener;
        window.removeEventListener = ((type, listener, options) => {
            const wrapped = listener && wrappedListeners.get(listener);
            nativeRemove.call(window, type, wrapped ?? listener, options);
            if (listener) wrappedListeners.delete(listener);
        }) as typeof window.removeEventListener;
    }
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); const previous = useUserStore.getState();
    useUserStore.setState({ hydrated: true, user: { id: "unit-user", username: "unit", displayName: "Unit", role: "admin", status: "active", avatarMode: "default" }, features: { ...previous.features, creditsEnabled: true } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // 新鲜的单元测试缓存防止真实余额查询；钱包动作只由本测试的无业务目标接收。
    client.setQueryData(["wallet-balance", "unit-user"], { availableMicrocredits: 1_000_000, policy: null });
    let exposedTrigger: HTMLButtonElement | null = null;
    let walletOpens = 0;
    const walletFocusAtOpen: Element[] = [];
    function Harness() {
        const [open, setOpen] = useState(false);
        const [palette, setPalette] = useState(false);
        const [wallet, setWallet] = useState(false);
        const trigger = useRef<HTMLButtonElement>(null);
        const destination = useRef<HTMLInputElement>(null);
        const walletTarget = useRef<HTMLInputElement>(null);
        const location = useLocation();
        useLayoutEffect(() => { exposedTrigger = trigger.current; });
        useLayoutEffect(() => { if (location.pathname !== "/settings") destination.current?.focus(); }, [location.pathname]);
        useLayoutEffect(() => { if (wallet) walletTarget.current?.focus(); }, [wallet]);
        useEffect(() => {
            const openWallet = () => { walletOpens += 1; walletFocusAtOpen.push(document.activeElement!); setWallet(true); };
            const key = (event: KeyboardEvent) => {
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                    event.preventDefault(); setOpen(false); setPalette(true);
                }
            };
            window.addEventListener(WORKSPACE_WALLET_OPEN_EVENT, openWallet);
            window.addEventListener("keydown", key);
            return () => { window.removeEventListener(WORKSPACE_WALLET_OPEN_EVENT, openWallet); window.removeEventListener("keydown", key); };
        }, []);
        return <>
            <WorkspaceAccountMenu open={open} onOpenChange={setOpen} triggerRef={trigger} />
            <button type="button" data-outside>外部操作</button>
            <input ref={destination} data-destination aria-label="导航目标" />
            <output data-path>{location.pathname}</output>
            {wallet ? <input ref={walletTarget} data-wallet aria-label="钱包目标" /> : null}
            {palette ? <WorkspaceCommandPalette open onClose={() => setPalette(false)} returnFocusTarget={trigger.current} /> : null}
        </>;
    }
    await act(async () => root.render(<MemoryRouter initialEntries={["/settings"]}><QueryClientProvider client={client}><ConfigProvider theme={{ token: { motion: false } }}><Harness /></ConfigProvider></QueryClientProvider></MemoryRouter>));
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="账户菜单"]')!;
    Object.defineProperty(trigger, "getClientRects", { configurable: true, value: () => [{ width: 36, height: 36 }] });
    const open = async () => { trigger.focus(); await act(async () => trigger.click()); };
    const content = () => document.querySelector<HTMLDivElement>('[data-workspace-account-menu="topbar"]')!;
    const admin = () => content().querySelector<HTMLAnchorElement>('a[href="/admin"]')!;
    const key = async (target: HTMLElement, key: string, options: KeyboardEventInit = {}, atCheckpoint?: (event: KeyboardEvent) => void) => {
        const event = new window.KeyboardEvent("keydown", { key, keyCode: key === "Escape" ? 27 : 0, bubbles: true, cancelable: true, ...options });
        await act(async () => {
            target.dispatchEvent(event);
            if (deferWindowEscape && key === "Escape") {
                await Promise.resolve();
                nativeCheckpoints += 1;
                atCheckpoint?.(event);
                const callbacks = nativeEscapeCallbacks.splice(0);
                expect(callbacks.length).toBeGreaterThan(0);
                for (const callback of callbacks) callback();
            }
        });
        return event;
    };
    const dispose = async () => {
        await act(async () => root.unmount()); client.clear(); host.remove();
        window.addEventListener = nativeAdd;
        window.removeEventListener = nativeRemove;
        useUserStore.setState({ user: previous.user, hydrated: previous.hydrated, features: previous.features });
    };
    return { host, trigger, content, admin, open, key, dispose, walletOpens: () => walletOpens, walletFocusAtOpen: () => walletFocusAtOpen, exposedTrigger: () => exposedTrigger, nativeCheckpoints: () => nativeCheckpoints };
}

test("account wallet activation focuses the persistent trigger synchronously before its one open event", async () => {
    for (const activation of ["pointer", "Enter", " "]) {
        const f = await fixture();
        try {
            await f.open();
            const wallet = [...f.content().querySelectorAll("button")].find(button => button.textContent?.includes("充值 / 兑换"))!;
            await act(async () => wallet.focus());
            if (activation !== "pointer") await f.key(wallet, activation);
            // Happy DOM 不执行按键默认激活；真实原生按钮的激活 click 仍走组件原 onClick。
            await act(async () => wallet.click());
            expect(f.walletFocusAtOpen()).toEqual([f.trigger]); expect(f.walletOpens()).toBe(1);
            expect(f.trigger.getAttribute("aria-expanded")).toBe("false");
            expect(document.activeElement === f.host.querySelector("[data-wallet]")).toBe(true);
        } finally { await f.dispose(); }
    }
});

test("unavailable persistent account triggers do not prevent the one wallet open event", async () => {
    const cases: Array<(button: HTMLButtonElement) => void> = [
        button => { button.disabled = true; },
        button => button.setAttribute("inert", ""),
        button => button.setAttribute("hidden", ""),
        button => button.setAttribute("aria-hidden", "true"),
        button => { button.style.visibility = "hidden"; },
        button => Object.defineProperty(button, "getClientRects", { configurable: true, value: () => [] }),
        button => Object.defineProperty(button, "isConnected", { configurable: true, value: false }),
    ];
    for (const makeUnavailable of cases) {
        const f = await fixture();
        try {
            await f.open();
            const wallet = [...f.content().querySelectorAll("button")].find(button => button.textContent?.includes("充值 / 兑换"))!;
            await act(async () => wallet.focus()); makeUnavailable(f.trigger);
            await act(async () => wallet.click());
            expect(f.walletOpens()).toBe(1); expect(f.walletFocusAtOpen()[0] === f.trigger).toBe(false);
            expect(f.trigger.getAttribute("aria-expanded")).toBe("false");
            expect(document.activeElement === f.host.querySelector("[data-wallet]")).toBe(true);
        } finally { await f.dispose(); }
    }
});

test("account Escape survives a microtask checkpoint before the real native window close callback", async () => {
    const f = await fixture({ deferWindowEscape: true });
    try {
        await f.open(); f.admin().focus();
        await f.key(f.admin(), "Escape", {}, () => {
            expect(f.trigger.getAttribute("aria-expanded")).toBe("true");
            expect(document.activeElement).toBe(f.admin());
        });
        expect(f.nativeCheckpoints()).toBe(1);
        expect(f.trigger.getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(f.trigger);
    } finally { await f.dispose(); }
});

test("native window Escape after a checkpoint preserves IME, late preventDefault and the upper changelog", async () => {
    const f = await fixture({ deferWindowEscape: true });
    try {
        await f.open(); f.admin().focus();
        await f.key(f.admin(), "Escape", { keyCode: 229 });
        expect(f.trigger.getAttribute("aria-expanded")).toBe("true"); expect(document.activeElement).toBe(f.admin());
        await f.key(f.admin(), "Escape", {}, event => event.preventDefault());
        expect(f.trigger.getAttribute("aria-expanded")).toBe("true"); expect(document.activeElement).toBe(f.admin());
        const log = f.content().querySelector<HTMLButtonElement>('button[aria-label="查看更新日志"]')!;
        log.focus(); await act(async () => log.click());
        const close = document.querySelector<HTMLButtonElement>('[role="dialog"] .ant-modal-close')!;
        close.focus(); await f.key(close, "Escape");
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(log.getAttribute("aria-expanded")).toBe("false");
        expect(f.trigger.getAttribute("aria-expanded")).toBe("true"); expect(document.activeElement).not.toBe(f.trigger);
        expect(f.nativeCheckpoints()).toBe(3);
        await f.key(log, "Escape");
        expect(f.trigger.getAttribute("aria-expanded")).toBe("false"); expect(document.activeElement).toBe(f.trigger);
    } finally { await f.dispose(); }
});

test("Escape from the real account card closes its Popover and returns to the exposed trigger", async () => {
    const f = await fixture();
    try {
        await f.open(); expect(f.exposedTrigger()).toBe(f.trigger);
        f.admin().focus(); await f.key(f.admin(), "Escape");
        expect(f.trigger.getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(f.trigger);
        expect(f.host.querySelector("[data-path]")?.textContent).toBe("/settings");
        expect(f.walletOpens()).toBe(0);
    } finally { await f.dispose(); }
});

test("an outside pointer close and a navigation close do not reclaim destination focus", async () => {
    const f = await fixture();
    try {
        await f.open();
        const outside = f.host.querySelector<HTMLButtonElement>("[data-outside]")!;
        await act(async () => { outside.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true })); outside.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true })); outside.focus(); outside.click(); });
        expect(f.trigger.getAttribute("aria-expanded")).toBe("false"); expect(document.activeElement).toBe(outside);
        await f.open();
        await act(async () => f.admin().click());
        expect(f.host.querySelector("[data-path]")?.textContent).toBe("/admin");
        expect(document.activeElement).toBe(f.host.querySelector("[data-destination]"));
        expect(f.trigger.getAttribute("aria-expanded")).toBe("false"); expect(f.walletOpens()).toBe(0);
    } finally { await f.dispose(); }
});

test("wallet and Ctrl/Cmd+K handoffs keep the next surface focused", async () => {
    for (const modifier of ["ctrlKey", "metaKey"] as const) {
        const f = await fixture();
        try {
            await f.open(); f.admin().focus();
            await f.key(f.admin(), "k", { [modifier]: true });
            const input = f.host.querySelector<HTMLInputElement>('[role="combobox"]')!;
            expect(f.trigger.getAttribute("aria-expanded")).toBe("false"); expect(document.activeElement).toBe(input);
            await f.key(input, "Escape"); expect(document.activeElement).toBe(f.trigger);
            await f.open();
            const wallet = [...f.content().querySelectorAll("button")].find(button => button.textContent?.includes("充值 / 兑换"))!;
            await act(async () => wallet.click());
            expect(f.walletOpens()).toBe(1); expect(f.trigger.getAttribute("aria-expanded")).toBe("false");
            expect(document.activeElement).toBe(f.host.querySelector("[data-wallet]"));
        } finally { await f.dispose(); }
    }
});

test("Escape in the real changelog portal closes the top layer without closing or focusing the account trigger", async () => {
    const f = await fixture();
    try {
        await f.open();
        const log = f.content().querySelector<HTMLButtonElement>('button[aria-label="查看更新日志"]')!;
        log.focus(); await act(async () => log.click());
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
        expect(dialog).not.toBeNull();
        expect(f.trigger.getAttribute("aria-expanded")).toBe("true");
        const close = dialog.querySelector<HTMLButtonElement>(".ant-modal-close")!;
        close.focus(); await f.key(close, "Escape");
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(log.getAttribute("aria-expanded")).toBe("false");
        expect(f.trigger.getAttribute("aria-expanded")).toBe("true");
        expect(document.activeElement).not.toBe(f.trigger);
        await f.key(log, "Escape");
        expect(f.trigger.getAttribute("aria-expanded")).toBe("false"); expect(document.activeElement).toBe(f.trigger);
    } finally { await f.dispose(); }
});

test("IME and consumed Escape do not request account focus restoration", async () => {
    const f = await fixture();
    try {
        await f.open(); f.admin().focus();
        await f.key(f.admin(), "Escape", { isComposing: true });
        expect(f.trigger.getAttribute("aria-expanded")).toBe("true"); expect(document.activeElement).toBe(f.admin());
        await f.key(f.admin(), "Escape", { keyCode: 229 });
        expect(f.trigger.getAttribute("aria-expanded")).toBe("true"); expect(document.activeElement).toBe(f.admin());
        const prevent = (event: Event) => event.preventDefault();
        f.admin().addEventListener("keydown", prevent, { once: true });
        await f.key(f.admin(), "Escape");
        expect(f.trigger.getAttribute("aria-expanded")).toBe("true"); expect(document.activeElement).toBe(f.admin());
        const consume = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
        f.admin().addEventListener("keydown", consume, { once: true });
        await f.key(f.admin(), "Escape");
        expect(f.trigger.getAttribute("aria-expanded")).toBe("true"); expect(document.activeElement).toBe(f.admin());
        await f.key(f.admin(), "Escape");
        expect(document.activeElement).toBe(f.trigger);
    } finally { await f.dispose(); }
});

test("keyboard close does not focus an inert or hidden trigger", async () => {
    for (const attribute of ["inert", "hidden"] as const) {
        const f = await fixture();
        try {
            await f.open(); f.admin().focus(); f.trigger.setAttribute(attribute, "");
            await f.key(f.admin(), "Escape");
            expect(f.trigger.getAttribute("aria-expanded")).toBe("false"); expect(document.activeElement).not.toBe(f.trigger);
        } finally { await f.dispose(); }
    }
});
