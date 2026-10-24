import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    HTMLInputElement: dom.HTMLInputElement,
    Element: dom.Element,
    Node: dom.Node,
    SVGElement: dom.SVGElement,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

const { act, useRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, useLocation } = await import("react-router");
const { WorkspaceCommandPalette } = await import("@/components/layout/workspace-command-palette");
const { WORKSPACE_WALLET_OPEN_EVENT } = await import("@/lib/workspace-wallet");
const { useUserStore } = await import("@/stores/use-user-store");

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function paletteFixture(account?: "topbar" | "sidebar") {
    const host = document.createElement("div");
    document.body.append(host);
    const features = useUserStore.getState().features;
    useUserStore.setState({ features: { ...features, taskCenterEnabled: true, creditsEnabled: true } });
    let walletOpens = 0;
    const countWallet = () => { walletOpens += 1; };
    window.addEventListener(WORKSPACE_WALLET_OPEN_EVENT, countWallet);

    function Harness() {
        const [open, setOpen] = useState(false);
        const [accountOpen, setAccountOpen] = useState(Boolean(account));
        const triggerRef = useRef<HTMLButtonElement>(null);
        const location = useLocation();
        return <>
            <button ref={triggerRef} type="button" data-trigger onClick={() => { setAccountOpen(false); setOpen(true); }}>打开搜索</button>
            {account ? <div data-workspace-account-menu={account} hidden={!accountOpen}><button type="button" data-account-item>账户与设置</button></div> : null}
            <output data-location>{location.pathname}</output>
            {open ? <WorkspaceCommandPalette open onClose={() => setOpen(false)} returnFocusTarget={account ? triggerRef.current : undefined} /> : null}
        </>;
    }

    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter initialEntries={["/settings"]}><Harness /></MemoryRouter>));
    const trigger = host.querySelector<HTMLButtonElement>("[data-trigger]")!;
    trigger.focus();
    const accountItem = host.querySelector<HTMLButtonElement>("[data-account-item]");
    accountItem?.focus();
    await act(async () => trigger.click());
    const input = host.querySelector<HTMLInputElement>('[role="combobox"]')!;
    const close = host.querySelector<HTMLButtonElement>('button[aria-label="关闭搜索"]')!;
    // happy-dom 没有布局引擎；这些控件在桌面视口可见，提供可见矩形供焦点循环判断。
    for (const control of host.querySelectorAll<HTMLElement>("input, button")) {
        Object.defineProperty(control, "getClientRects", { configurable: true, value: () => [{ width: 24, height: 24 }] });
    }
    const key = async (target: HTMLElement, value: string, shiftKey = false) => {
        const event = new window.KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true });
        await act(async () => { target.dispatchEvent(event); });
        return event;
    };
    const dispose = async () => {
        await act(async () => root.unmount());
        window.removeEventListener(WORKSPACE_WALLET_OPEN_EVENT, countWallet);
        useUserStore.setState({ features });
        host.remove();
    };
    return { host, trigger, accountItem, input, close, key, dispose, walletOpens: () => walletOpens, path: () => host.querySelector("[data-location]")?.textContent };
}

test("关闭按钮上的 Enter 不执行高亮的钱包操作", async () => {
    const fixture = await paletteFixture();
    try {
        const wallet = Array.from(fixture.host.querySelectorAll('[role="option"]')).findIndex((option) => option.textContent === "积分中心");
        expect(wallet).toBeGreaterThan(0);
        for (let index = 0; index < wallet; index += 1) await fixture.key(fixture.input, "ArrowDown");
        expect(fixture.host.querySelector('[aria-selected="true"]')?.textContent).toBe("积分中心");
        fixture.close.focus();
        const event = await fixture.key(fixture.close, "Enter");
        expect(event.defaultPrevented).toBe(false);
        expect(fixture.walletOpens()).toBe(0);
        expect(fixture.path()).toBe("/settings");
        // DOM 测试没有浏览器的 Enter 默认点击，显式执行同一原生按钮的点击。
        await act(async () => fixture.close.click());
        expect(fixture.host.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(fixture.trigger);
    } finally {
        await fixture.dispose();
    }
});

test("Tab 与 Shift+Tab 在搜索与最后的关闭按钮之间循环", async () => {
    const fixture = await paletteFixture();
    try {
        expect(document.activeElement).toBe(fixture.input);
        fixture.close.focus();
        expect((await fixture.key(fixture.close, "Tab")).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(fixture.input);
        expect((await fixture.key(fixture.input, "Tab", true)).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(fixture.close);
        expect(fixture.walletOpens()).toBe(0);
    } finally {
        await fixture.dispose();
    }
});

test("Escape 关闭面板并回到原触发器", async () => {
    const fixture = await paletteFixture();
    try {
        expect(fixture.host.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
        await fixture.key(fixture.input, "Escape");
        expect(fixture.host.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).toBe(fixture.trigger);
        expect(fixture.walletOpens()).toBe(0);
    } finally {
        await fixture.dispose();
    }
});

test("输入框方向键选择安全路由，Enter 只激活当前条目", async () => {
    const fixture = await paletteFixture();
    try {
        await fixture.key(fixture.input, "ArrowDown");
        await fixture.key(fixture.input, "ArrowDown");
        await fixture.key(fixture.input, "ArrowDown");
        await fixture.key(fixture.input, "ArrowUp");
        const selected = fixture.host.querySelector('[role="option"][aria-selected="true"]')!;
        expect(selected.textContent).toBe("短剧项目");
        expect(fixture.input.getAttribute("aria-activedescendant")).toBe(selected.id);
        expect(document.activeElement).toBe(fixture.input);
        await fixture.key(fixture.input, "Enter");
        expect(fixture.path()).toBe("/projects");
        expect(fixture.host.querySelector('[role="dialog"]')).toBeNull();
        expect(document.activeElement).not.toBe(fixture.trigger);
        expect(fixture.walletOpens()).toBe(0);
    } finally {
        await fixture.dispose();
    }
});

for (const account of ["topbar", "sidebar"] as const) {
    test(`${account}账户内容隐藏后取消搜索回账户触发器，不聚焦隐藏项`, async () => {
        const fixture = await paletteFixture(account);
        try {
            expect(fixture.accountItem?.isConnected).toBe(true);
            expect(fixture.accountItem?.closest("[hidden]")).not.toBeNull();
            expect(document.activeElement).toBe(fixture.input);
            await fixture.key(fixture.input, "Escape");
            expect(document.activeElement).toBe(fixture.trigger);
            expect(document.activeElement).not.toBe(fixture.accountItem);
            expect(fixture.accountItem?.closest("[hidden]")).not.toBeNull();
            expect(fixture.walletOpens()).toBe(0);
        } finally {
            await fixture.dispose();
        }
    });
}

test("取消搜索不会把焦点送回已经隐藏或inert的原入口", async () => {
    for (const state of ["hidden", "inert", "disabled"] as const) {
        const fixture = await paletteFixture();
        try {
            fixture.trigger.setAttribute(state, "");
            await fixture.key(fixture.input, "Escape");
            expect(document.activeElement).not.toBe(fixture.trigger);
            expect(fixture.host.querySelector('[role="dialog"]')).toBeNull();
        } finally {
            await fixture.dispose();
        }
    }
});

test("输入无结果时保留命名的结果区与可见提示，Enter 不导航", async () => {
    const fixture = await paletteFixture();
    try {
        await act(async () => {
            Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(fixture.input, "未提供的页面");
            fixture.input.dispatchEvent(new window.Event("input", { bubbles: true }));
        });
        expect(fixture.host.querySelectorAll('[role="option"]').length).toBe(0);
        expect(fixture.host.querySelector('[role="listbox"]')?.getAttribute("aria-label")).toBe("页面与操作");
        expect(fixture.host.textContent).toContain("未找到「未提供的页面」相关页面");
        expect(fixture.input.hasAttribute("aria-activedescendant")).toBe(false);
        await fixture.key(fixture.input, "Enter");
        expect(fixture.path()).toBe("/settings");
        expect(fixture.walletOpens()).toBe(0);
    } finally {
        await fixture.dispose();
    }
});
