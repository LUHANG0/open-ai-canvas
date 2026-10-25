import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/i/Ab3xY9" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
let settingsCalls = 0;
const settings = { firstUser: false, registrationEnabled: true, emailEnabled: true, emailCodeRequired: true, smsBindingAvailable: false, emailBindingAvailable: true, emailRegistration: true, smsRegistration: false, smsAndEmailRegistration: false, emailLogin: false, smsLogin: false, linuxdoEnabled: true, agreementTitle: "实际服务协议", agreementContent: "实际协议内容" };
const authAPI = await import("../src/services/api/auth");
mock.module("../src/services/api/auth", () => ({ ...authAPI, getAuthSettings: async () => { settingsCalls++; return { ...settings, registrationEnabled: false }; }, getAuthSession: async () => ({ user: null }), register: async () => { throw new Error("test must not submit"); }, linuxDOLoginURL: () => "/unused-oauth" }));
mock.module("../src/components/auth/verification-fields", () => ({ VerificationFields: (props: { invitationCode?: string; method: string; value: { email: string } }) => <div data-code={props.invitationCode} data-method={props.method} data-email={props.value.email}>原验证字段</div> }));
const { act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router");
const { App, ConfigProvider } = await import("antd");
const { RegistrationInvitationContext } = await import("../src/pages/auth/invitation-context");
const { default: RegisterPage } = await import("../src/pages/auth/register");
afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
const enterValue = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new dom.Event("input", { bubbles: true }));
};
const exposeRefresh = async (host: HTMLElement) => {
    await act(async () => host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    await act(async () => host.querySelector("form")?.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true })));
};

test("real registration form uses invitation settings, original agreement and verification with no OAuth bypass", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<MemoryRouter><ConfigProvider theme={{ token: { motion: false } }}><App><RegistrationInvitationContext.Provider value={{ code: "Ab3xY9", settings, bonusMicrocredits: 0, reload: () => {}, refreshSettings: async () => {} }}><RegisterPage /></RegistrationInvitationContext.Provider></App></ConfigProvider></MemoryRouter>));
        expect(settingsCalls).toBe(0);
        expect(host.querySelector("[data-code]")?.getAttribute("data-code")).toBe("Ab3xY9");
        expect(host.textContent).toContain("用户名"); expect(host.textContent).toContain("显示名称"); expect(host.textContent).toContain("确认密码"); expect(host.textContent).toContain("实际服务协议");
        expect(host.textContent).not.toContain("关闭普通注册"); expect(host.textContent).not.toContain("Linux.do");
        expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toContain("接受邀请并注册");
        expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
        expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
        expect(host.querySelectorAll('input[autocomplete="new-password"]').length).toBe(2);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("invitation does not submit an unverified email through an SMS-only method", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    let restoreSms!: () => void;
    const unavailable = { ...settings, emailEnabled: false, emailRegistration: false };
    function InvitationFixture() {
        const [current, setCurrent] = useState(unavailable);
        restoreSms = () => setCurrent({ ...settings, emailRegistration: false, smsRegistration: true });
        return <MemoryRouter><ConfigProvider theme={{ token: { motion: false } }}><App><RegistrationInvitationContext.Provider value={{ code: "Ab3xY9", settings: current, bonusMicrocredits: 0, reload: () => {}, refreshSettings: async () => restoreSms() }}><RegisterPage /></RegistrationInvitationContext.Provider></App></ConfigProvider></MemoryRouter>;
    }
    try {
        await act(async () => root.render(<InvitationFixture />));
        const email = host.querySelector<HTMLInputElement>('input[autocomplete="email"]')!;
        await act(async () => enterValue(email, "member@example.com"));
        await exposeRefresh(host);
        await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "重新检查")?.click());
        expect(host.querySelector("[data-method]")?.getAttribute("data-method")).toBe("sms");
        expect(host.querySelector("[data-method]")?.getAttribute("data-email")).toBe("");
        expect(host.querySelector('input[autocomplete="email"]')).toBeNull();
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("invitation keeps profile fields editable without a verification channel and refreshes in place", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    let enableEmail!: () => void;
    let failRefresh = true;
    const unavailable = { ...settings, emailEnabled: false, emailRegistration: false, emailBindingAvailable: false };
    function InvitationFixture() {
        const [current, setCurrent] = useState(unavailable);
        enableEmail = () => setCurrent(settings);
        return <MemoryRouter><ConfigProvider theme={{ token: { motion: false } }}><App><RegistrationInvitationContext.Provider value={{ code: "Ab3xY9", settings: current, bonusMicrocredits: 0, reload: () => {}, refreshSettings: async () => { if (failRefresh) throw new Error("network"); enableEmail(); } }}><RegisterPage /></RegistrationInvitationContext.Provider></App></ConfigProvider></MemoryRouter>;
    }
    try {
        await act(async () => root.render(<InvitationFixture />));
        const username = host.querySelector<HTMLInputElement>('input[autocomplete="username"]')!;
        expect(username.disabled).toBe(false);
        expect(host.querySelectorAll('input[autocomplete="new-password"]:disabled').length).toBe(0);
        const email = host.querySelector<HTMLInputElement>('input[autocomplete="email"]')!;
        expect(email.disabled).toBe(false);
        expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
        expect(host.textContent).not.toContain("当前没有可用的注册验证方式");
        expect(host.querySelector("[data-code]")).toBeNull();
        expect([...host.querySelectorAll("label.auth-register-field")].map((label) => label.textContent?.trim())).toEqual(["邮箱", "用户名", "显示名称", "密码", "确认密码"]);

        await act(async () => {
            enterValue(username, "new-member");
            enterValue(email, "member@example.com");
        });
        await exposeRefresh(host);
        expect(host.textContent).toContain("验证码暂不可用");
        const refresh = () => [...host.querySelectorAll("button")].find((button) => button.textContent === "重新检查")!;
        await act(async () => refresh().click());
        expect(host.textContent).toContain("重新检查失败");
        expect(username.value).toBe("new-member");
        expect(email.value).toBe("member@example.com");

        failRefresh = false;
        await act(async () => refresh().click());
        expect(host.textContent).not.toContain("验证码暂不可用");
        expect(host.querySelector("[data-code]")?.getAttribute("data-code")).toBe("Ab3xY9");
        expect(host.querySelector("[data-code]")?.getAttribute("data-email")).toBe("member@example.com");
        expect(username.value).toBe("new-member");
        expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
        expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    } finally { await act(async () => root.unmount()); host.remove(); }
});
