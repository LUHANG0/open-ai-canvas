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
mock.module("../src/components/auth/verification-fields", () => ({ VerificationFields: (props: { invitationCode?: string }) => <div data-code={props.invitationCode}>原验证字段</div> }));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router");
const { App, ConfigProvider } = await import("antd");
const { RegistrationInvitationContext } = await import("../src/pages/auth/invitation-context");
const { default: RegisterPage } = await import("../src/pages/auth/register");
afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

test("real registration form uses invitation settings, original agreement and verification with no OAuth bypass", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<MemoryRouter><ConfigProvider theme={{ token: { motion: false } }}><App><RegistrationInvitationContext.Provider value={{ code: "Ab3xY9", settings, bonusMicrocredits: 0, reload: () => {} }}><RegisterPage /></RegistrationInvitationContext.Provider></App></ConfigProvider></MemoryRouter>));
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
