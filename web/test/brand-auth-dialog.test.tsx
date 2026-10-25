import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
// happy-dom exposes WAAPI without a rendering clock; motion is checked in the real browser.
Object.defineProperty(dom.Element.prototype, "animate", { configurable: true, value: undefined });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, useEffect } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, Routes, Route, useLocation } = await import("react-router");
const { BrandAuthProvider, useBrandAuthFlow } = await import("../src/components/brand/brand-auth-entry");
let session: Promise<{ user: object | null }> = Promise.resolve({ user: null });
let registrationSettings: Promise<{ registrationEnabled: boolean }> = Promise.resolve({ registrationEnabled: true });
let retainExitContent = false;
let modalMotion: { transitionName?: string; maskTransitionName?: string } = {};
let registerLoad = () => Promise.resolve({ default: Register });
function Login() { const flow = useBrandAuthFlow()!; return <form aria-label="密码登录"><output>{flow.next}</output><button type="button" onClick={() => flow.changeMode("forgot-password")}>找回</button></form>; }
function Register() { return <form aria-label="创建账号" />; }
function Recovery() { const flow = useBrandAuthFlow()!; return <form aria-label="邮箱找回"><button type="button" onClick={() => flow.changeMode("login")}>返回登录</button></form>; }
mock.module("../src/services/api/auth", () => ({ getAuthSession: () => session, getAuthSettings: () => registrationSettings }));
mock.module("../src/lib/auth-route-modules", () => ({ loadLoginPage: () => Promise.resolve({ default: Login }), loadRegisterPage: () => registerLoad(), loadForgotPasswordPage: () => Promise.resolve({ default: Recovery }), loadInvitationPage: () => Promise.resolve({ default: () => null }), preloadAuthRoute: () => undefined }));
mock.module("../src/components/ui/product/app-modal", () => ({ AppModal: ({ open, onCancel, afterClose, title, children, wrapProps, transitionName, maskTransitionName }: any) => {
    modalMotion = { transitionName, maskTransitionName };
    useEffect(() => { if (!open) afterClose(); }, [open]);
    return open || retainExitContent ? <div {...wrapProps}><section role="dialog"><button type="button" onClick={onCancel}>关闭</button>{title}{children}</section></div> : null;
} }));
const { default: Dialog } = await import("../src/components/brand/brand-auth-dialog");
const { BrandLink } = await import("../src/components/brand/brand-link");
const { AuthScene } = await import("../src/pages/auth/auth-scene");
function Position() { const location = useLocation(); return <output data-location>{location.pathname + location.search + location.hash}</output>; }
async function fixture() {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); let closed = 0;
    await act(async () => root.render(<MemoryRouter><Position /><Dialog next="/skills?view=all#catalog" onClosed={() => closed++} /></MemoryRouter>));
    return { host, closed: () => closed, click: async (text: string) => { const button = [...host.querySelectorAll("button")].find((node) => node.textContent === text)!; await act(async () => button.click()); }, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

test("modal switches forms and recovery without leaving the homepage or losing next", async () => {
    const f = await fixture();
    try {
        expect(f.host.querySelector('form[aria-label="密码登录"] output')?.textContent).toBe("/skills?view=all#catalog");
        const titleTop = f.host.querySelector(".mc-auth-heading");
        await f.click("注册");
        expect(f.host.querySelector('form[aria-label="创建账号"]')).not.toBeNull();
        expect(f.host.querySelector(".mc-auth-heading")).toBe(titleTop);
        await f.click("登录"); await f.click("找回");
        expect(f.host.querySelector('form[aria-label="邮箱找回"]')).not.toBeNull();
        expect(f.host.querySelector<HTMLElement>('[role="tablist"]')?.hidden).toBe(true);
        await f.click("返回登录");
        expect(f.host.querySelector('form[aria-label="密码登录"] output')?.textContent).toBe("/skills?view=all#catalog");
        expect(f.host.querySelector("[data-location]")?.textContent).toBe("/");
        await f.click("关闭"); expect(f.closed()).toBe(1);
    } finally { await f.close(); }
});
test("a late register load cannot override a newer login selection and failed loads retry their requested mode", async () => {
    const f = await fixture();
    try {
        let resolve!: (value: { default: typeof Register }) => void;
        registerLoad = () => new Promise((done) => { resolve = done; });
        await f.click("注册");
        expect(f.host.querySelector('form[aria-label="密码登录"]')).not.toBeNull();
        await f.click("登录");
        await act(async () => resolve({ default: Register }));
        expect(f.host.querySelector('form[aria-label="创建账号"]')).toBeNull();
        registerLoad = () => Promise.reject(new Error("network unavailable"));
        await f.click("注册"); expect(f.host.querySelector('[role="alert"]')?.textContent).toContain("重新加载");
        registerLoad = () => Promise.resolve({ default: Register });
        await f.click("重新加载"); expect(f.host.querySelector('form[aria-label="创建账号"]')).not.toBeNull();
    } finally { registerLoad = () => Promise.resolve({ default: Register }); await f.close(); }
});

test("forms remain visible during switching and reduced motion disables the modal transition lifecycle", async () => {
    const previousMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    let reduced = false;
    const listeners = new Set<() => void>();
    const frames: Array<Array<{ transform: string; opacity?: number }>> = [];
    const previousRect = Object.getOwnPropertyDescriptor(dom.Element.prototype, "getBoundingClientRect");
    Object.defineProperty(dom.Element.prototype, "getBoundingClientRect", { configurable: true, value: function (this: Element) { return { top: this.classList.contains("mc-auth-scroll") ? this.parentElement?.querySelector(".mc-auth-tabs")?.hasAttribute("hidden") ? 100 : 172 : 0 }; } });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ get matches() { return reduced; }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }) });
    Object.defineProperty(dom.Element.prototype, "animate", { configurable: true, value: (value: Array<{ transform: string }>) => { frames.push(value); return { cancel() {} }; } });
    const f = await fixture();
    try {
        expect(frames).toHaveLength(0);
        await f.click("注册");
        expect(f.host.querySelector('form[aria-label="创建账号"]')).not.toBeNull();
        expect(frames).toHaveLength(0);
        const tab = f.host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
        await act(async () => tab.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })));
        expect(f.host.querySelector('form[aria-label="密码登录"]')).not.toBeNull();
        expect(frames).toHaveLength(0);
        await f.click("找回");
        expect(frames).toEqual([[{ transform: "translateY(72px)" }, { transform: "translateY(0)" }]]);
        expect(frames.flat().every((frame) => frame.opacity === undefined)).toBe(true);
        await f.click("返回登录");
        expect(frames[1]).toEqual([{ transform: "translateY(-72px)" }, { transform: "translateY(0)" }]);
        await act(async () => { reduced = true; listeners.forEach((fn) => fn()); });
        expect(modalMotion).toEqual({ transitionName: "", maskTransitionName: "" });
        await f.click("找回");
        expect(f.host.querySelector('form[aria-label="邮箱找回"]')).not.toBeNull();
        expect(frames).toHaveLength(2);
        await f.click("关闭");
        expect(f.closed()).toBe(1);
    } finally {
        await f.close();
        Object.defineProperty(dom.Element.prototype, "animate", { configurable: true, value: undefined });
        if (previousRect) Object.defineProperty(dom.Element.prototype, "getBoundingClientRect", previousRect); else Reflect.deleteProperty(dom.Element.prototype, "getBoundingClientRect");
        if (previousMedia) Object.defineProperty(window, "matchMedia", previousMedia); else Reflect.deleteProperty(window, "matchMedia");
    }
});

test("the final choice wins when a ready module commits during rapid reverse selection", async () => {
    const f = await fixture();
    try {
        const tabs = [...f.host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        await act(async () => {
            tabs[1].click();
            await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
            tabs[0].click();
        });
        expect(f.host.querySelector('form[aria-label="密码登录"]')).not.toBeNull();
        expect(f.host.querySelector('form[aria-label="创建账号"]')).toBeNull();
        expect(f.host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("登录");
    } finally { await f.close(); }
});
test("signed in members enter the requested destination without mounting a login form", async () => {
    session = Promise.resolve({ user: { id: "existing" } }); const f = await fixture();
    try { expect(f.host.querySelector("[data-location]")?.textContent).toBe("/skills?view=all#catalog"); expect(f.host.querySelector("form")).toBeNull(); }
    finally { session = Promise.resolve({ user: null }); await f.close(); }
});
test("a delayed guest check does not override a newer register selection", async () => {
    let resolve!: (value: { user: object | null }) => void;
    session = new Promise((done) => { resolve = done; });
    const f = await fixture();
    try {
        await f.click("注册");
        expect(f.host.querySelector('form[aria-label="创建账号"]')).not.toBeNull();
        await act(async () => resolve({ user: null }));
        expect(f.host.querySelector('form[aria-label="创建账号"]')).not.toBeNull();
        expect(f.host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("注册");
    } finally { session = Promise.resolve({ user: null }); await f.close(); }
});
test("closing during the identity check cancels a delayed member navigation", async () => {
    let resolve!: (value: { user: object | null }) => void;
    session = new Promise((done) => { resolve = done; });
    const f = await fixture();
    try {
        await f.click("关闭");
        await act(async () => resolve({ user: { id: "existing" } }));
        expect(f.host.querySelector("[data-location]")?.textContent).toBe("/");
        expect(f.host.querySelector("form")).toBeNull();
    } finally { session = Promise.resolve({ user: null }); await f.close(); }
});
test("Tab and Shift+Tab loop at the dialog boundary without trapping nested dialogs", async () => {
    const f = await fixture();
    try {
        const first = f.host.querySelector<HTMLButtonElement>('button')!;
        const last = f.host.querySelector<HTMLButtonElement>('form button')!;
        for (const element of f.host.querySelectorAll<HTMLElement>('button')) Object.defineProperty(element, 'getClientRects', { configurable: true, value: () => [{ width: 40, height: 40 }] });
        const key = async (element: HTMLElement, shiftKey = false) => {
            element.focus(); const event = new dom.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
            await act(async () => element.dispatchEvent(event)); return event;
        };
        expect((await key(last)).defaultPrevented).toBe(true); expect(document.activeElement).toBe(first);
        expect((await key(first, true)).defaultPrevented).toBe(true); expect(document.activeElement).toBe(last);
        const nested = document.createElement('section'); nested.setAttribute('role', 'dialog'); const control = document.createElement('button'); control.type = 'button'; nested.append(control); f.host.querySelector('[role="dialog"]')!.append(nested);
        expect((await key(control)).defaultPrevented).toBe(false);
    } finally { await f.close(); }
});
test("homepage links open the dialog while preview and modified clicks keep their native contract", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<MemoryRouter><BrandAuthProvider><Routes><Route path="/" element={<><BrandLink href="/login?next=%2Fskills%3Fview%3Dall%23catalog">开始创作</BrandLink><BrandLink href="/login?next=%2Fcreate" onClick={(event) => event.preventDefault()}>预览</BrandLink></>} /><Route path="/login" element={<AuthScene />} /></Routes></BrandAuthProvider><Position /></MemoryRouter>));
        const links = [...host.querySelectorAll("a")];
        for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
            const event = new dom.MouseEvent("click", { bubbles: true, cancelable: true, ...options });
            await act(async () => links[0].dispatchEvent(event)); expect(event.defaultPrevented).toBe(false);
        }
        await act(async () => links[1].click()); expect(host.querySelector('[role="dialog"]')).toBeNull();
        await act(async () => links[0].click());
        // Resolve the real dynamic dialog module and its initial identity/form read.
        await act(async () => { await import("../src/components/brand/brand-auth-dialog"); });
        expect(host.querySelector('[role="dialog"]')).not.toBeNull();
        expect(host.querySelector('form output')?.textContent).toBe("/skills?view=all#catalog");
        expect(host.querySelector("[data-location]")?.textContent).toBe("/login?next=%2Fskills%3Fview%3Dall%23catalog");
    } finally { await act(async () => root.unmount()); host.remove(); }
});
test("closed public registration uses the invitation entry without mounting the public register form", async () => {
    registrationSettings = Promise.resolve({ registrationEnabled: false });
    let normalRegisterLoads = 0; registerLoad = () => { normalRegisterLoads++; return Promise.resolve({ default: Register }); };
    const f = await fixture();
    try {
        expect(f.host.querySelectorAll('[role="tab"]')[1].textContent).toBe("内测用户邀请");
        await f.click("内测用户邀请"); await act(async () => { await import("../src/components/brand/brand-invitation-entry"); });
        expect(f.host.querySelector("h2")?.textContent).toBe("加入梦层");
        expect(f.host.textContent).toContain("凭邀请加入，开启你的下一幕。");
        expect(f.host.querySelector('input[maxlength="6"]')).not.toBeNull();
        expect(f.host.querySelector('form[aria-label="创建账号"]')).toBeNull();
        expect(f.host.textContent).not.toContain("关闭普通注册"); expect(normalRegisterLoads).toBe(0);
        await f.click("登录"); expect(f.host.querySelector('form[aria-label="密码登录"]')).not.toBeNull();
    } finally { registrationSettings = Promise.resolve({ registrationEnabled: true }); registerLoad = () => Promise.resolve({ default: Register }); await f.close(); }
});
test("unknown or failed public policy never exposes a guessed registration state and can retry", async () => {
    let reject!: (error: Error) => void; registrationSettings = new Promise((_, fail) => { reject = fail; });
    const f = await fixture();
    try {
        expect(f.host.querySelectorAll('[role="tab"]')[1].textContent).toBe("注册入口");
        await f.click("注册入口"); await act(async () => reject(new Error("offline")));
        expect(f.host.querySelector('[role="alert"]')?.textContent).toContain("暂时无法读取注册设置");
        expect(f.host.querySelector('form[aria-label="创建账号"]')).toBeNull();
        registrationSettings = Promise.resolve({ registrationEnabled: false }); await f.click("重新加载");
        await act(async () => { await import("../src/components/brand/brand-invitation-entry"); });
        expect(f.host.querySelector('input[maxlength="6"]')).not.toBeNull();
    } finally { registrationSettings = Promise.resolve({ registrationEnabled: true }); await f.close(); }
});
test("clicking close immediately aborts invitation validation during retained exit content", async () => {
    const { invitationPath } = await import("../src/services/api/registration-invitations");
    let resolve!: (value: { state: "valid" }) => void; let signal: AbortSignal | undefined;
    mock.module("../src/services/api/registration-invitations", () => ({ invitationPath, validateRegistrationInvitation: async (_: string, current?: AbortSignal) => { signal = current; return new Promise((done) => { resolve = done; }); } }));
    registrationSettings = Promise.resolve({ registrationEnabled: false }); retainExitContent = true;
    const f = await fixture();
    try {
        await f.click("内测用户邀请"); await act(async () => { await import("../src/components/brand/brand-invitation-entry"); });
        const input = f.host.querySelector("input")!;
        await act(async () => { Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(input, "Ab3xY9"); input.dispatchEvent(new dom.Event("input", { bubbles: true })); });
        await act(async () => f.host.querySelector("form")!.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true })));
        expect(signal?.aborted).toBe(false); await f.click("关闭");
        expect(f.host.querySelector("form")).not.toBeNull(); expect(signal?.aborted).toBe(true);
        await act(async () => resolve({ state: "valid" }));
        expect(f.host.querySelector("[data-location]")?.textContent).toBe("/");
    } finally { retainExitContent = false; registrationSettings = Promise.resolve({ registrationEnabled: true }); await f.close(); }
});
