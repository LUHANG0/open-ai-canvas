import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BrandInvitationEntry, default: BrandInvitationPage } = await import("../src/components/brand/brand-invitation-entry");
const { ApiError } = await import("../src/services/api/request");
type State = "valid" | "expired" | "revoked" | "used" | "invalid";
async function fixture(validateCode: (code: string, signal?: AbortSignal) => Promise<{ state: State }>) {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const accepted: string[] = [];
    await act(async () => root.render(<BrandInvitationEntry validateCode={validateCode} onAccepted={(code) => accepted.push(code)} />));
    const input = host.querySelector<HTMLInputElement>("input")!;
    await act(async () => { Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(input, "Ab3xY9"); input.dispatchEvent(new dom.Event("input", { bubbles: true })); });
    return { host, input, accepted, submit: async () => { await act(async () => host.querySelector("form")!.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true }))); }, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

test("valid invitation preserves the six-character case and calls acceptance only after validation", async () => {
    const calls: string[] = []; const f = await fixture(async (code) => { calls.push(code); return { state: "valid" }; });
    try { expect(f.accepted).toHaveLength(0); await f.submit(); expect(calls).toEqual(["Ab3xY9"]); expect(f.accepted).toEqual(["Ab3xY9"]); expect(f.input.maxLength).toBe(6); }
    finally { await f.close(); }
});
for (const [state, text] of [["invalid", "检查邀请码"], ["expired", "已过期"], ["revoked", "已撤销"], ["used", "已使用"]] as const) {
    test(`${state} invitation gives its actual status and never navigates`, async () => {
        const f = await fixture(async () => ({ state }));
        try { await f.submit(); expect(f.host.querySelector('[role="alert"]')?.textContent).toContain(text); expect(f.accepted).toHaveLength(0); expect(f.input.getAttribute("aria-invalid")).toBe("true"); }
        finally { await f.close(); }
    });
}
test("network failures remain retryable without being treated as invalid invitations", async () => {
    let failed = true; const f = await fixture(async () => { if (failed) throw new Error("offline"); return { state: "valid" }; });
    try {
        await f.submit(); expect(f.host.querySelector('[role="alert"]')?.textContent).toContain("检查网络后重试");
        expect(f.host.querySelector("button")?.textContent).toContain("重新验证"); expect(f.input.getAttribute("aria-invalid")).toBeNull();
        expect(f.input.value).toBe("Ab3xY9"); failed = false; await f.submit(); expect(f.accepted).toEqual(["Ab3xY9"]);
    } finally { await f.close(); }
});
test("rate limiting stays retryable and a closed component aborts and ignores a late valid response", async () => {
    const limited = await fixture(async () => { throw new ApiError("limited", { status: 429 }); });
    try { await limited.submit(); expect(limited.host.querySelector('[role="alert"]')?.textContent).toContain("稍后重试"); } finally { await limited.close(); }
    let resolve!: (value: { state: State }) => void; let signal: AbortSignal | undefined;
    const late = await fixture(async (_, activeSignal) => { signal = activeSignal; return new Promise((done) => { resolve = done; }); });
    await late.submit(); expect(late.input.disabled).toBe(true); expect(late.host.querySelector("button")?.textContent).toContain("正在验证邀请"); await late.close(); expect(signal?.aborted).toBe(true);
    await act(async () => resolve({ state: "valid" })); expect(late.accepted).toHaveLength(0);
});
test("the real brand wrapper uses the shared invitation path only after successful validation", async () => {
    const { invitationPath } = await import("../src/services/api/registration-invitations");
    const calls: string[] = [];
    mock.module("../src/services/api/registration-invitations", () => ({ invitationPath, validateRegistrationInvitation: async (code: string) => { calls.push(code); return { state: "valid" }; } }));
    const { MemoryRouter, useLocation } = await import("react-router");
    function Position() { const location = useLocation(); return <output>{location.pathname}</output>; }
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<MemoryRouter><BrandInvitationPage /><Position /></MemoryRouter>));
        expect(host.querySelector("output")?.textContent).toBe("/");
        const input = host.querySelector("input")!;
        await act(async () => { Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(input, "Ab3xY9"); input.dispatchEvent(new dom.Event("input", { bubbles: true })); });
        await act(async () => host.querySelector("form")!.dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true })));
        expect(calls).toEqual(["Ab3xY9"]); expect(host.querySelector("output")?.textContent).toBe("/i/Ab3xY9");
    } finally { await act(async () => root.unmount()); host.remove(); }
});
