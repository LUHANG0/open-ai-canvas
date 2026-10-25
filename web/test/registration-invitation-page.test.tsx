import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
let response: Promise<unknown> = Promise.resolve({ state: "invalid" });
let session: Promise<unknown> = Promise.resolve({ user: null });
let logoutCalls = 0;
mock.module("../src/services/api/auth", () => ({ getAuthSession: () => session, logout: async () => { logoutCalls++; session = Promise.resolve({ user: null }); } }));
mock.module("../src/lib/user-session", () => ({ applyUserSession: async () => {} }));
const api = await import("../src/services/api/registration-invitations");
mock.module("../src/services/api/registration-invitations", () => ({ ...api, validateRegistrationInvitation: () => response }));
mock.module("../src/pages/auth/register", () => ({ default: () => <form aria-label="original registration form"><input aria-label="original required field" /></form> }));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, Route, Routes } = await import("react-router");
const { default: InvitationPage } = await import("../src/pages/auth/invitation");

afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
async function fixture() {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter initialEntries={["/i/Ab3xY9"]}><Routes><Route path="/i/:code" element={<InvitationPage />} /></Routes></MemoryRouter>));
    return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
test("invitation loading does not flash closed registration or an unusable form", async () => {
    let resolve!: (value: unknown) => void; response = new Promise((done) => { resolve = done; });
    const f = await fixture();
    try { expect(f.host.textContent).toContain("正在验证邀请"); expect(f.host.querySelector("form")).toBeNull(); expect(f.host.textContent).not.toContain("关闭"); await act(async () => resolve({ state: "invalid" })); }
    finally { await f.close(); }
});
for (const state of ["expired", "revoked", "used", "invalid"] as const) test(`invitation ${state} shows a clear terminal state and retains safe login context`, async () => {
    response = Promise.resolve({ state }); const f = await fixture();
    try { expect(f.host.querySelector("form")).toBeNull(); expect(f.host.textContent).toContain(api.invitationStateMessages[state]); expect(f.host.querySelector("a")?.getAttribute("href")).toBe("/login"); }
    finally { await f.close(); }
});
test("a network failure is retryable and does not claim the invitation is invalid", async () => {
    response = Promise.reject(new Error("network")); const f = await fixture();
    try {
        expect(f.host.textContent).toContain("暂时无法验证邀请"); expect(f.host.textContent).not.toContain("未找到有效邀请");
        response = Promise.resolve({ state: "valid", settings: {}, bonusMicrocredits: 100000000 });
        await act(async () => [...f.host.querySelectorAll("button")].find((button) => button.textContent.replace(/\s/g, "") === "重试")?.click());
        expect(f.host.querySelector("form")).not.toBeNull(); expect(f.host.textContent).toContain("100 积分");
    } finally { await f.close(); }
});
test("zero invitation grant hides the gift line and uses the existing registration form", async () => {
    response = Promise.resolve({ state: "valid", settings: {}, bonusMicrocredits: 0 }); const f = await fixture();
    try { expect(f.host.querySelector("form")?.getAttribute("aria-label")).toBe("original registration form"); expect(f.host.textContent).not.toContain("获赠"); }
    finally { await f.close(); }
});
test("members stay on invitation page without logout until they choose switch account", async () => {
    response = Promise.resolve({ state: "valid", settings: {}, bonusMicrocredits: 0 }); session = Promise.resolve({ user: { id: "existing" } }); logoutCalls = 0;
    const f = await fixture();
    try {
        expect(f.host.textContent).toContain("你已登录，无需注册"); expect(f.host.querySelector("form")).toBeNull(); expect(logoutCalls).toBe(0);
        await act(async () => [...f.host.querySelectorAll("button")].find((button) => button.textContent === "切换账号")?.click());
        expect(logoutCalls).toBe(1); expect(f.host.querySelector("form")).not.toBeNull();
    } finally { session = Promise.resolve({ user: null }); await f.close(); }
});
