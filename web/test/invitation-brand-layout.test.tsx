import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/i/Ab3xY9" });
Object.defineProperty(dom.Element.prototype, "animate", { configurable: true, value: undefined });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, useEffect } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, Route, Routes } = await import("react-router");
const { App, ConfigProvider } = await import("antd");
const auth = await import("../src/services/api/auth");
const invitations = await import("../src/services/api/registration-invitations");
const baseSettings = { firstUser: false, registrationEnabled: true, emailEnabled: true, emailCodeRequired: true, smsBindingAvailable: true, emailBindingAvailable: true, emailRegistration: true, smsRegistration: false, smsAndEmailRegistration: false, emailLogin: false, smsLogin: false, linuxdoEnabled: true, agreementTitle: "梦层服务协议", agreementContent: "受控测试协议，未提交。" };
let publicSettings = { ...baseSettings, registrationEnabled: false };
let invitationResponse: any;
let writes = 0;
const checkedCodes: string[] = [];
const rejectWrite = async () => { writes++; throw new Error("Invitation layout tests must not submit or deliver verification"); };
mock.module("../src/services/api/auth", () => ({ ...auth, getAuthSettings: async () => publicSettings, getAuthSession: async () => ({ user: null }), register: rejectWrite, login: rejectWrite, logout: rejectWrite, resetPassword: rejectWrite, sendPasswordResetEmailCode: rejectWrite }));
const verification = await import("../src/services/api/verification");
mock.module("../src/services/api/verification", () => ({ ...verification, startVerification: rejectWrite }));
mock.module("../src/services/api/registration-invitations", () => ({ ...invitations, validateRegistrationInvitation: async (code: string) => { checkedCodes.push(code); return invitationResponse; } }));
mock.module("../src/components/ui/product/app-modal", () => ({ AppModal: ({ open, onCancel, afterClose, title, children, className, "aria-labelledby": labelledBy }: any) => {
    useEffect(() => { if (!open) afterClose?.(); }, [open]);
    return open ? <section role="dialog" className={className} aria-labelledby={labelledBy}><div className="ant-modal-container"><header className="ant-modal-header">{title}<button type="button" onClick={onCancel}>关闭登录窗口</button></header><div className="ant-modal-body">{children}</div></div></section> : null;
} }));
mock.module("../src/lib/auth-route-modules", () => ({ loadInvitationPage: () => import("../src/pages/auth/invitation"), loadRegisterPage: () => import("../src/pages/auth/register"), loadLoginPage: () => import("../src/pages/auth/login"), loadForgotPasswordPage: () => import("../src/pages/auth/forgot-password"), preloadAuthRoute() {} }));
const { default: BrandAuthDialog } = await import("../src/components/brand/brand-auth-dialog");

beforeEach(() => {
    invitationResponse = { state: "valid", settings: { ...baseSettings }, bonusMicrocredits: 30_000_000 };
    publicSettings = { ...baseSettings, registrationEnabled: false };
    checkedCodes.length = 0; writes = 0;
});
afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
async function fixture(mode: "invitation" | "login" | "register" | "forgot-password" = "invitation") {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const style = document.createElement("style"); style.textContent = readFileSync(new URL("../src/components/brand/brand-auth-dialog.css", import.meta.url), "utf8"); document.head.append(style);
    const path = mode === "invitation" ? "/i/Ab3xY9" : `/${mode}`;
    await act(async () => root.render(<MemoryRouter initialEntries={[path]}><ConfigProvider theme={{ token: { motion: false } }}><App><Routes><Route path={mode === "invitation" ? "/i/:code" : path} element={<BrandAuthDialog routeMode={mode} next="/create" onClosed={() => {}} />} /></Routes></App></ConfigProvider></MemoryRouter>));
    const selector = mode === "invitation" ? ".mc-invitation-form" : "form";
    for (let attempt = 0; attempt < 100 && !host.querySelector(selector); attempt++) await act(async () => { await new Promise((done) => setTimeout(done, 10)); });
    if (!host.querySelector(selector)) {
        await act(async () => root.unmount()); host.remove(); style.remove();
        throw new Error(`The real ${mode} form did not become ready in the controlled fixture`);
    }
    return { host, close: async () => { await act(async () => root.unmount()); host.remove(); style.remove(); } };
}

test("real invitation dialog keeps full-width account and password fields in the narrow authentication pane", async () => {
    const f = await fixture();
    try {
        const dialog = f.host.querySelector('.mc-auth-dialog-invitation[role="dialog"]')!;
        expect(dialog).not.toBeNull(); expect(f.host.querySelector(".mc-invitation-brand .mc-auth-symbol svg")).not.toBeNull();
        expect(f.host.querySelector(".mc-invitation-wordmark")?.textContent).toBe("MengCeng");
        expect(f.host.querySelector(".mc-auth-heading h2")?.textContent).toBe("加入梦层");
        expect(f.host.querySelector<HTMLDivElement>(".mc-auth-tabs")?.hidden).toBe(true);
        const groups = [...f.host.querySelectorAll<HTMLElement>(".mc-invitation-fields")];
        expect(groups).toHaveLength(2);
        for (const group of groups) expect(getComputedStyle(group).gridTemplateColumns.replace(/\s/g, "")).toBe("minmax(0,1fr)");
        expect(f.host.querySelector('.mc-invitation-form [class*="sm:grid-cols-2"]')).toBeNull();
        expect(checkedCodes).toEqual(["Ab3xY9"]); expect(writes).toBe(0);
    } finally { await f.close(); }
});

test("welcome, real fields, agreement, primary action and existing-account link follow their reading order", async () => {
    const f = await fixture();
    try {
        const welcome = f.host.querySelector(".mc-invitation-welcome")!, form = f.host.querySelector(".mc-invitation-form")!, agreement = form.querySelector(".auth-agreement-row")!, submit = form.querySelector('button[type="submit"]')!, login = f.host.querySelector(".mc-invitation-login")!;
        const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & dom.Node.DOCUMENT_POSITION_FOLLOWING);
        expect(follows(welcome, form)).toBe(true); expect(follows(form.querySelectorAll(".auth-register-field")[3], agreement)).toBe(true);
        expect(follows(agreement, submit)).toBe(true); expect(follows(form, login)).toBe(true);
        expect([...form.querySelectorAll(".auth-register-field > .auth-scene-label")].map((node) => node.textContent)).toEqual(["用户名", "显示名称", "密码", "确认密码"]);
        expect(login.querySelector("a")?.getAttribute("href")).toBe("/login");
        expect(f.host.textContent).not.toContain("Linux.do"); expect(f.host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
    } finally { await f.close(); }
});

for (const [microcredits, text] of [[50_000_000, "50 积分"], [100_000_000, "100 积分"], [200_000_000, "200 积分"], [123_456_789, "123.456789 积分"]] as const) test(`invitation welcome preserves the server grant ${microcredits} without adding another gift`, async () => {
    invitationResponse.bonusMicrocredits = microcredits;
    const f = await fixture();
    try { expect(f.host.querySelector(".mc-invitation-welcome strong")?.textContent).toBe(text); expect(f.host.querySelectorAll(".mc-invitation-welcome")).toHaveLength(1); expect(writes).toBe(0); }
    finally { await f.close(); }
});

test("zero grant has no welcome placeholder and keeps the actual registration and login entry", async () => {
    invitationResponse.bonusMicrocredits = 0; const f = await fixture();
    try { expect(f.host.querySelector(".mc-invitation-welcome")).toBeNull(); expect(f.host.textContent).not.toContain("获赠"); expect(f.host.querySelector(".mc-invitation-form")).not.toBeNull(); expect(f.host.querySelector(".mc-invitation-login a")).not.toBeNull(); }
    finally { await f.close(); }
});

test("unavailable verification leaves invitation fields editable without an initial warning or write", async () => {
    invitationResponse.settings.emailRegistration = false; const f = await fixture();
    try {
        const form = f.host.querySelector(".mc-invitation-form")!;
        expect(form.getAttribute("aria-describedby")).toBeNull();
        expect(form.textContent).not.toContain("当前没有可用的注册验证方式");
        expect(form.querySelector<HTMLInputElement>('input[autocomplete="email"]')?.disabled).toBe(false);
        expect(form.querySelector<HTMLInputElement>('input[autocomplete="username"]')?.disabled).toBe(false);
        expect(form.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
        expect(f.host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false); expect(writes).toBe(0);
    } finally { await f.close(); }
});

test("email and combined verification keep their real fields, code association and original disabled send command", async () => {
    for (const combined of [false, true]) {
        invitationResponse.settings.smsAndEmailRegistration = combined; const f = await fixture();
        try {
            expect(f.host.querySelector('input[autocomplete="email"]')).not.toBeNull();
            expect(Boolean(f.host.querySelector('input[autocomplete="tel"]'))).toBe(combined);
            const code = f.host.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!;
            expect(code).not.toBeNull(); expect(f.host.querySelector(`label[for="${code.id}"]`)).not.toBeNull();
            expect(f.host.querySelector<HTMLButtonElement>(".auth-code-send")?.disabled).toBe(true);
            expect(f.host.querySelector<HTMLInputElement>('input[autocomplete="username"]')?.disabled).toBe(false);
            expect(writes).toBe(0);
        } finally { await f.close(); }
    }
});

test("a long agreement remains in the real form flow without accepting terms or submitting registration", async () => {
    invitationResponse.settings.agreementTitle = "很长的服务协议名称以及个人信息处理条款".repeat(4);
    const f = await fixture();
    try {
        const link = f.host.querySelector<HTMLButtonElement>(".auth-agreement-link")!;
        expect(link.textContent).toContain(invitationResponse.settings.agreementTitle);
        expect(getComputedStyle(link).overflowWrap).toBe("anywhere");
        const field = f.host.querySelector<HTMLElement>(".auth-register-field")!;
        expect(["0", "0px"]).toContain(getComputedStyle(field).minInlineSize);
        expect(f.host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true); expect(writes).toBe(0);
    } finally { await f.close(); }
});

test("login, public registration and recovery retain their own flows inside the shared authentication pane", async () => {
    publicSettings.registrationEnabled = true;
    for (const mode of ["login", "register", "forgot-password"] as const) {
        const f = await fixture(mode);
        try {
            expect(f.host.querySelector(".mc-auth-dialog-invitation")).toBeNull(); expect(f.host.querySelector(".mc-invitation-brand")).toBeNull(); expect(f.host.querySelector(".mc-invitation-form")).toBeNull();
            if (mode === "register") expect(f.host.querySelectorAll('[class*="sm:grid-cols-2"]')).toHaveLength(2);
            expect(writes).toBe(0);
        } finally { await f.close(); }
    }
});
