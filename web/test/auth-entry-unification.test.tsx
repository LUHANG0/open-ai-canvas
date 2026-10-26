import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
Object.defineProperty(dom.Element.prototype, "animate", { configurable: true, value: undefined });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, useEffect } = await import("react");
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider } = await import("react-router");
const auth = await import("../src/services/api/auth");
const brand = await import("../src/services/api/brand-site");
const invitations = await import("../src/services/api/registration-invitations");
const settings = { firstUser: false, registrationEnabled: true, emailEnabled: true, emailCodeRequired: false, smsBindingAvailable: false, emailBindingAvailable: true, emailRegistration: false, smsRegistration: false, smsAndEmailRegistration: false, emailLogin: false, smsLogin: false, linuxdoEnabled: false, agreementTitle: "服务协议", agreementContent: "测试协议" };
let policy: Promise<unknown> = Promise.resolve(settings);
let session: Promise<unknown> = Promise.resolve({ user: null });
let sessionCalls = 0, brandCalls = 0;
let invite: Promise<unknown> = Promise.resolve({ state: "invalid" });
const validated: string[] = [];
const errors: string[] = [];
const notices = { error: (value: string) => errors.push(value), success() {}, warning() {} };
mock.module("../src/services/api/auth", () => ({ ...auth, getAuthSettings: () => policy, getAuthSession: () => { sessionCalls++; return session; }, login: async () => { throw new Error("must not submit"); } }));
mock.module("../src/services/api/brand-site", () => ({ ...brand, getBrandSite: async () => { brandCalls++; return brand.DEFAULT_BRAND_CONTENT; } }));
mock.module("../src/services/api/registration-invitations", () => ({ ...invitations, validateRegistrationInvitation: (code: string) => { validated.push(code); return invite; } }));
const antd = await import("antd");
mock.module("antd", () => ({ ...antd, App: Object.assign(antd.App, { useApp: () => ({ message: notices }) }) }));
mock.module("../src/components/ui/product/app-modal", () => ({ AppModal: ({ open, onCancel, afterClose, children, title, className }: any) => {
    useEffect(() => { if (!open) afterClose?.(); }, [open]);
    return open ? <section role="dialog" className={className}><button type="button" onClick={onCancel}>关闭登录窗口</button>{title}{children}</section> : null;
} }));
const realLogin = () => import("../src/pages/auth/login");
let loadLogin = realLogin;
const realRegister = () => import("../src/pages/auth/register");
let loadRegister = realRegister;
mock.module("../src/lib/auth-route-modules", () => ({ loadLoginPage: () => loadLogin(), loadRegisterPage: () => loadRegister(), loadForgotPasswordPage: () => import("../src/pages/auth/forgot-password"), loadInvitationPage: () => import("../src/pages/auth/invitation"), preloadAuthRoute() {} }));
const { brandPublicRoutes } = await import("../src/pages/welcome/brand-public-routes");

afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
function defer<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
async function settle() { await act(async () => { await new Promise((done) => setTimeout(done, 10)); }); }
async function fixture(path = "/") {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const router = createMemoryRouter([brandPublicRoutes, { path: "/create", element: <p>创作工作台</p> }, { path: "/settings", element: <p>设置目的地</p> }], { initialEntries: [path] });
    await act(async () => root.render(<RouterProvider router={router} />)); await settle();
    const find = (text: string) => [...host.querySelectorAll<HTMLElement>("button,a")].find((node) => node.textContent?.replace(/\s/g, "") === text)!;
    return { host, router, find, click: async (text: string) => { await act(async () => find(text).click()); await settle(); }, go: async (to: string | number) => { await act(async () => { await router.navigate(to as string); }); await settle(); }, close: async () => { await act(async () => root.unmount()); router.dispose(); host.remove(); } };
}

test("homepage entry and direct auth routes share the actual published brand tree without workspace bootstrap", async () => {
    sessionCalls = 0;
    const f = await fixture();
    try {
        expect(sessionCalls).toBe(0); expect(brandCalls).toBe(1);
        const background = f.host.querySelector(".mengceng-site"); const hero = f.host.querySelector(".mv-hero");
        expect(background).not.toBeNull(); expect(hero).not.toBeNull();
        for (const section of brand.DEFAULT_BRAND_CONTENT.sections.filter((section) => section.visible)) expect(f.host.querySelector(`#${section.id}`)).not.toBeNull();
        await f.click("开始创作");
        expect(f.router.state.location.pathname).toBe("/login"); expect(f.router.state.location.search).toBe("");
        expect(f.host.querySelector("#login-account")).not.toBeNull();
        for (const path of ["/register", "/forgot-password", "/login"]) {
            await f.go(path + "?next=%2Fsettings#kept");
            expect(f.host.querySelector(".mengceng-site") === background).toBe(true); expect(f.host.querySelector(".mv-hero") === hero).toBe(true);
            expect(f.host.querySelectorAll('[role="dialog"]')).toHaveLength(1); expect(f.host.querySelector(".auth-scene-simple")).toBeNull();
            expect(f.router.state.location.search).toBe(""); expect(f.router.state.location.hash).toBe("#kept");
        }
        expect(brandCalls).toBe(1); expect(sessionCalls).toBe(1);
    } finally { await f.close(); }
});

test("login keeps password access and shows submission failure beside the form", async () => {
    const f = await fixture("/login");
    try {
        expect(f.host.querySelector(".mc-auth-heading h2")?.textContent).toBe("欢迎登录梦层");
        expect(f.host.querySelector<HTMLButtonElement>('.mc-login-form button[type="submit"]')?.disabled).toBe(true);
        expect(f.host.textContent).not.toContain("使用 Linux.do 登录");
        const setInput = async (id: string, value: string) => {
            const input = f.host.querySelector<HTMLInputElement>(id)!;
            await act(async () => {
                Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(input, value);
                input.dispatchEvent(new dom.Event("input", { bubbles: true }));
            });
        };
        await setInput("#login-account", "sample-user");
        await setInput("#login-password", "sample-password");
        expect(f.host.querySelector<HTMLButtonElement>('.mc-login-form button[type="submit"]')?.disabled).toBe(false);
        await act(async () => f.host.querySelector(".mc-login-form")!.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true })));
        expect(f.host.querySelector('[role="alert"].mc-login-feedback')?.textContent).toBe("must not submit");
        await setInput("#login-account", "another-user");
        expect(f.host.querySelector('[role="alert"].mc-login-feedback')).toBeNull();
        expect(f.host.querySelector("#login-password")).not.toBeNull();
    } finally { await f.close(); }
});

test("login settings failure leaves the password form available", async () => {
    policy = Promise.reject(new Error("settings unavailable"));
    const f = await fixture("/login");
    try {
        expect(f.host.querySelector("#login-account")).not.toBeNull();
        expect(f.host.querySelector("#login-password")).not.toBeNull();
        expect(f.host.querySelector('[role="status"].mc-login-feedback')?.textContent).toContain("其他登录方式暂不可用");
    } finally { await f.close(); policy = Promise.resolve(settings); }
});

test("real tabs keep current navigation key, query/hash, roving focus and one associated panel", async () => {
    const f = await fixture("/login?next=%2Fsettings&oauth_error=TestError#kept");
    try {
        expect(errors).toContain("TestError");
        const tabs = [...f.host.querySelectorAll<HTMLButtonElement>('.mc-auth-tabs [role="tab"]')];
        const key = async (index: number, value: string) => { await act(async () => tabs[index].dispatchEvent(new dom.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }))); await settle(); };
        const initial = f.router.state.location.key;
        await act(async () => tabs[0].click()); await key(0, "Home");
        expect(f.router.state.location.key).toBe(initial); expect(document.activeElement).toBe(tabs[0]);
        await key(0, "ArrowRight");
        expect(f.router.state.location.pathname).toBe("/register"); expect(document.activeElement).toBe(tabs[1]);
        expect(tabs[1].getAttribute("aria-selected")).toBe("true"); expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
        const panel = f.host.querySelector('[role="tabpanel"]')!;
        expect(f.host.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
        expect(panel.id).toBe(tabs[1].getAttribute("aria-controls")); expect(panel.getAttribute("aria-labelledby")).toBe(tabs[1].id);
        expect(panel.querySelector('input[autocomplete="new-password"]')).not.toBeNull();
        const current = f.router.state.location.key; await key(1, "End"); expect(f.router.state.location.key).toBe(current);
        await key(1, "Home"); expect(document.activeElement).toBe(tabs[0]);
        await key(0, "End"); expect(document.activeElement).toBe(tabs[1]);
        await key(1, "ArrowRight"); expect(document.activeElement).toBe(tabs[0]);
        expect(f.router.state.location.search).toBe("?oauth_error=TestError"); expect(f.router.state.location.hash).toBe("#kept");
        await f.click("忘记密码？"); expect(f.router.state.location.pathname).toBe("/forgot-password");
        expect(f.host.querySelector('[role="tablist"]')?.hasAttribute("hidden")).toBe(true);
        await f.click("返回登录"); expect(f.router.state.location.pathname).toBe("/login"); expect(f.router.state.location.hash).toBe("#kept");
    } finally { await f.close(); }
});

test("closing, reopening and browser history preserve one background and do not reopen the modal in a loop", async () => {
    const f = await fixture();
    try {
        const background = f.host.querySelector(".mengceng-site");
        await f.click("开始创作"); await f.go(-1);
        expect(f.router.state.location.pathname).toBe("/"); expect(f.host.querySelector('[role="dialog"]')).toBeNull();
        await f.go(1); expect(f.host.querySelector("#login-account")).not.toBeNull();
        await f.click("关闭登录窗口"); expect(f.router.state.location.pathname).toBe("/");
        expect(f.host.querySelector('[role="dialog"]')).toBeNull(); expect(f.host.querySelector(".mengceng-site")).toBe(background);
        await f.go(-1); await f.go(1); expect(f.host.querySelector('[role="dialog"]')).toBeNull();
        await f.click("开始创作"); expect(f.host.querySelector("#login-account")).not.toBeNull();
    } finally { await f.close(); }
});

test("closing a direct auth address returns keyboard focus to the homepage creation entry", async () => {
    const f = await fixture("/login");
    try {
        await f.click("关闭登录窗口");
        expect(f.router.state.location.pathname).toBe("/");
        expect(document.activeElement).toBe(f.host.querySelector(".mc-nav-actions a"));
    } finally { await f.close(); }
});

test("a slow external register route followed by login ends on login in both URL and form", async () => {
    const f = await fixture("/login?next=%2Fsettings#kept");
    const gate = defer<Awaited<ReturnType<typeof realRegister>>>(); loadRegister = () => gate.promise;
    try {
        const form = f.host.querySelector("#login-account")?.closest("form");
        await f.go("/register?next=%2Fsettings#kept"); expect(f.host.querySelector("#login-account")?.closest("form")).toBe(form);
        await act(async () => f.host.querySelector<HTMLButtonElement>('.mc-auth-tabs [role="tab"]')!.click());
        expect(f.router.state.location.pathname).toBe("/login");
        await act(async () => gate.resolve(await realRegister()));
        expect(f.host.querySelector("#login-account")?.closest("form")).toBe(form); expect(f.host.querySelector('input[autocomplete="new-password"]')).toBeNull();
        expect(f.router.state.location.pathname).toBe("/login"); expect(f.router.state.location.hash).toBe("#kept");
    } finally { loadRegister = realRegister; await f.close(); }
});

test("module failure keeps the old form and retries the final requested route", async () => {
    const f = await fixture("/login");
    try {
        loadRegister = () => Promise.reject(new Error("module unavailable"));
        await f.click("注册"); expect(f.host.querySelector("#login-account")).not.toBeNull(); expect(f.host.textContent).toContain("表单暂时无法加载");
        expect(f.router.state.location.pathname).toBe("/login");
        loadRegister = realRegister; await f.click("重新加载");
        expect(f.router.state.location.pathname).toBe("/register"); expect(f.host.querySelector('input[autocomplete="new-password"]')).not.toBeNull();
    } finally { loadRegister = realRegister; await f.close(); }
});

test("registration pending and failure do not guess policy; retry uses the shared invitation entry when closed", async () => {
    const gate = defer<unknown>(); policy = gate.promise; const f = await fixture("/register");
    try {
        expect(f.host.textContent).toContain("正在读取注册设置"); expect(f.host.querySelector(".mc-invitation-entry")).toBeNull();
        expect(f.host.querySelector('input[autocomplete="new-password"]')).toBeNull();
        await act(async () => gate.resolve({ ...settings, registrationEnabled: false })); await settle();
        expect(f.host.querySelector(".mc-invitation-entry")).not.toBeNull(); expect(f.host.querySelector('input[autocomplete="new-password"]')).toBeNull();
    } finally { await f.close(); }
    policy = Promise.reject(new Error("policy unavailable")); const failed = await fixture("/register");
    try {
        expect(failed.host.textContent).toContain("暂时无法读取注册设置"); expect(failed.host.querySelector(".mc-invitation-entry")).toBeNull();
        policy = Promise.resolve({ ...settings, registrationEnabled: false }); await failed.click("重新加载");
        expect(failed.host.querySelector(".mc-invitation-entry")).not.toBeNull();
    } finally { await failed.close(); policy = Promise.resolve(settings); }
});

test("public registration hides invitation entry while direct invitations keep registration and rewards", async () => {
    policy = Promise.resolve(settings);
    session = Promise.resolve({ user: null });
    validated.length = 0;
    const f = await fixture("/login");
    try {
        expect([...f.host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(["登录", "注册"]);
        expect(f.host.textContent).not.toContain("受邀加入");
        await f.click("注册");
        await act(async () => { await realRegister(); });
        await settle();
        expect(f.host.querySelector('input[autocomplete="new-password"]')).not.toBeNull();
        expect(f.host.querySelector(".mc-invitation-entry")).toBeNull();
        expect(f.host.querySelector('input[maxlength="6"]')).toBeNull();
        expect(validated).toEqual([]);
        invite = Promise.resolve({ state: "valid", settings, bonusMicrocredits: 1000000 });
        await f.go("/i/OpenA1");
        await act(async () => { await import("../src/pages/auth/invitation"); });
        await settle();
        expect(validated).toEqual(["OpenA1"]);
        expect(f.host.querySelector(".mc-invitation-registration")).not.toBeNull();
        expect(f.host.querySelector('input[autocomplete="new-password"]')).not.toBeNull();
        expect(f.host.querySelector(".mc-invitation-welcome")?.textContent).toContain("注册后赠送");
        expect(f.host.querySelector(".mc-invitation-entry")).toBeNull();
    } finally { await f.close(); invite = Promise.resolve({ state: "invalid" }); }
});

test("case-sensitive invitation routes validate their real code, retain status/context and omit the short-code entry", async () => {
    validated.length = 0; invite = Promise.resolve({ state: "expired" }); const f = await fixture("/i/Ab3xY9?next=%2Fsettings");
    try {
        // Await the actual lazy route boundary instead of assuming it loads within settle's 10 ms.
        await act(async () => { await import("../src/pages/auth/invitation"); });
        await settle();
        expect(validated).toEqual(["Ab3xY9"]); expect(f.host.textContent).toContain(invitations.invitationStateMessages.expired);
        expect(f.host.querySelector(".mc-invitation-entry")).toBeNull();
        expect(f.find("已有账号？登录").getAttribute("href")).toBe("/login");
        invite = Promise.resolve({ state: "valid", settings, bonusMicrocredits: 0 }); await f.go("/i/Xy9Ab3");
        expect(validated).toEqual(["Ab3xY9", "Xy9Ab3"]); expect(f.host.querySelector('input[autocomplete="new-password"]')).not.toBeNull();
        expect(f.host.textContent).not.toContain("获赠"); expect(f.host.querySelector(".mc-invitation-entry")).toBeNull();
    } finally { await f.close(); }
});

test("member login uses safe next while root and invitation keep the brand shell and invitation context", async () => {
    session = Promise.resolve({ user: { id: "fixture-member" } });
    const root = await fixture();
    try { expect(root.router.state.location.pathname).toBe("/"); expect(root.host.querySelector(".mengceng-site")).not.toBeNull(); } finally { await root.close(); }
    for (const [path, expected] of [["/login?next=%2Fsettings", "/settings"], ["/login?next=https%3A%2F%2Fexternal.example", "/create"]]) {
        const f = await fixture(path); try { expect(f.router.state.location.pathname).toBe(expected); } finally { await f.close(); }
    }
    const member = await fixture("/i/Ab3xY9");
    try { expect(member.router.state.location.pathname).toBe("/i/Ab3xY9"); expect(member.host.textContent).toContain("你已登录，无需注册"); expect(member.find("切换账号")).toBeDefined(); expect(member.host.querySelector(".mengceng-site")).not.toBeNull(); }
    finally { await member.close(); session = Promise.resolve({ user: null }); }
});


test("opening login never waits for its form chunk", async () => {
    const waiting = defer<Awaited<ReturnType<typeof realLogin>>>();
    loadLogin = () => waiting.promise;
    const f = await fixture();
    try {
        await f.click("开始创作");
        expect(f.router.state.location.pathname).toBe("/login");
        expect(f.host.querySelector('[role="dialog"]')).not.toBeNull();
        expect(f.host.textContent).toContain("正在准备登录");
        await act(async () => waiting.resolve(await realLogin())); await settle();
        expect(f.host.querySelector("#login-account")).not.toBeNull();
    } finally { loadLogin = realLogin; await f.close(); }
});

test("a slow session request cannot prevent typing login details", async () => {
    const waiting = defer<unknown>(); session = waiting.promise;
    const f = await fixture("/login");
    try {
        expect(f.host.querySelector("#login-account")).not.toBeNull();
        const input = f.host.querySelector<HTMLInputElement>("#login-account")!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(input, "waiting-user");
            input.dispatchEvent(new dom.Event("input", { bubbles: true }));
        });
        await act(async () => waiting.resolve({ user:null })); await settle();
        expect(input.value).toBe("waiting-user");
    } finally { session = Promise.resolve({user:null}); await f.close(); }
});


test("failed login chunks show recovery actions without an endless loading animation", async () => {
    loadLogin = () => Promise.reject(new Error("chunk unavailable"));
    const f = await fixture();
    try {
        await f.click("开始创作");
        expect(f.router.state.location.pathname).toBe("/login");
        expect(f.host.textContent).toContain("表单暂时无法加载");
        expect(f.host.textContent).not.toContain("正在准备登录");
        expect(f.find("刷新页面")).toBeDefined();
        loadLogin = realLogin;
        await f.click("重新加载");
        expect(f.host.querySelector("#login-account")).not.toBeNull();
    } finally { loadLogin = realLogin; await f.close(); }
});
