import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, ShadowRoot: dom.ShadowRoot, ResizeObserver: dom.ResizeObserver, getComputedStyle: dom.getComputedStyle.bind(dom), Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, createRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { apiClient } = await import("@/services/api/request");
const { HumanVerification } = await import("@/components/auth/human-verification");
type Handle = import("@/components/auth/human-verification").HumanVerificationHandle;
type API = import("@/components/auth/turnstile-client").TurnstileAPI;
const oldAdapter = apiClient.defaults.adapter;
let enabled = true, reads = 0;
apiClient.defaults.adapter = async (config) => {
    reads++;
    return { status: 200, statusText: "OK", headers: {}, config, data: { code: 0, data: { turnstile: { enabled, siteKey: "test-site-key", registration: true, codeLogin: true, passwordReset: true, passwordLogin: true } } } };
};
afterAll(() => {
    apiClient.defaults.adapter = oldAdapter;
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key);
    }
});

test("each submission gets a fresh token and reloads policy; expiry and unmount reject pending work", async () => {
    let options: Parameters<API["render"]>[1] | undefined;
    let rendered = 0, removed = 0;
    window.turnstile = { render: (_node, value) => { options = value; return String(++rendered); }, execute: () => {}, remove: () => { removed++; } };
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const ref = createRef<Handle>();
    await act(async () => root.render(<HumanVerification ref={ref} action="register" />));
    let pending!: Promise<string>;
    await act(async () => { pending = ref.current!.verify(); await Promise.resolve(); });
    expect(options?.action).toBe("register"); expect(rendered).toBe(1);
    await act(async () => options!.callback("first-token"));
    expect(await pending).toBe("first-token"); expect(removed).toBe(1);
    await act(async () => { pending = ref.current!.verify(); await Promise.resolve(); });
    const expired = pending.then(() => "unexpected", (error: Error) => error.message);
    await act(async () => options!["expired-callback"]());
    expect(await expired).toContain("过期"); expect(host.querySelector('[role="alert"]')?.textContent).toContain("过期");
    await act(async () => { pending = ref.current!.verify(); await Promise.resolve(); });
    await act(async () => options!.callback("fresh-token"));
    expect(await pending).toBe("fresh-token"); expect(rendered).toBe(3);
    enabled = false;
    await act(async () => { pending = ref.current!.verify(); });
    expect(await pending).toBe(""); expect(reads).toBe(4); expect(rendered).toBe(3);
    enabled = true;
    await act(async () => { pending = ref.current!.verify(); await Promise.resolve(); });
    const cancelled = pending.then(() => "unexpected", (error: Error) => error.message);
    await act(async () => root.unmount());
    expect(await cancelled).toContain("取消"); expect(removed).toBe(4);
    host.remove(); window.turnstile = undefined;
});

test("script load failure can be retried without duplicate scripts", async () => {
    const { loadTurnstile } = await import("@/components/auth/turnstile-client");
    const append = document.head.appendChild.bind(document.head);
    const scripts: HTMLScriptElement[] = [];
    document.head.appendChild = ((node: Node) => { scripts.push(node as HTMLScriptElement); return node; }) as typeof document.head.appendChild;
    try {
        const first = loadTurnstile(); const same = loadTurnstile(); expect(first).toBe(same);
        expect(scripts).toHaveLength(1);
        const failure = first.then(() => "unexpected", (error: Error) => error.message);
        scripts[0].dispatchEvent(new window.Event("error"));
        expect(await failure).toContain("加载失败");
        const retry = loadTurnstile(); expect(scripts).toHaveLength(2);
        window.turnstile = { render: () => "test", execute: () => {}, remove: () => {} };
        scripts[1].dispatchEvent(new window.Event("load"));
        expect(await retry).toBe(window.turnstile);
    } finally { document.head.appendChild = append; window.turnstile = undefined; }
});

test("cancel while the shared script is loading releases the form immediately", async () => {
    enabled = true; window.turnstile = undefined;
    const append = document.head.appendChild.bind(document.head);
    let script: HTMLScriptElement | undefined;
    document.head.appendChild = ((node: Node) => { script = node as HTMLScriptElement; return node; }) as typeof document.head.appendChild;
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const ref = createRef<Handle>();
    try {
        await act(async () => root.render(<HumanVerification ref={ref} action="password_reset" />));
        let pending!: Promise<string>;
        await act(async () => { pending = ref.current!.verify(); await Promise.resolve(); });
        const cancelled = pending.then(() => "unexpected", (error: Error) => error.message);
        expect(script).toBeDefined();
        await act(async () => ref.current!.reset());
        expect(await cancelled).toContain("取消");
        expect(host.querySelector<HTMLElement>(".auth-human-verification")?.hidden).toBe(true);
        // A late script failure must not resurrect an abandoned verification.
        await act(async () => script!.dispatchEvent(new window.Event("error")));
        expect(host.querySelector<HTMLElement>(".auth-human-verification")?.hidden).toBe(true);
    } finally { document.head.appendChild = append; await act(async () => root.unmount()); host.remove(); }
});


test("server rejection of the human token preserves the previous code and allows an immediate retry", async () => {
    const { App } = await import("antd");
    const { VerificationFields } = await import("@/components/auth/verification-fields");
    const { emptyVerification } = await import("@/services/api/verification");
    const previousAdapter = apiClient.defaults.adapter;
    let options: Parameters<API["render"]>[1] | undefined;
    apiClient.defaults.adapter = async (config) => ({ status: 200, statusText: "OK", headers: {}, config, data: config.url === "/auth/verification" ? { code: 403, msg: "验证已过期", details: { humanVerificationRequired: true, action: "code_login" } } : { code: 0, data: { turnstile: { enabled: true, siteKey: "test-site-key", codeLogin: true } } } });
    window.turnstile = { render: (_node, value) => { options = value; return "server-rejection-test"; }, execute: () => {}, remove: () => {} };
    function Form() {
        const [value, setValue] = useState({ ...emptyVerification, email: "member@example.com", ticket: "previous-ticket", emailCode: "654321" });
        return <App><VerificationFields purpose="login" method="email" value={value} onChange={setValue} /><output data-ticket>{value.ticket}</output></App>;
    }
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<Form />));
        await act(async () => { host.querySelector<HTMLButtonElement>(".auth-code-send")!.click(); await Promise.resolve(); });
        expect(options).toBeDefined();
        await act(async () => options!.callback("fresh-browser-token"));
        const button = host.querySelector<HTMLButtonElement>(".auth-code-send")!;
        expect(button.textContent).toContain("获取验证码");
        expect(button.disabled).toBe(false);
        expect(host.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!.value).toBe("654321");
        expect(host.querySelector("[data-ticket]")!.textContent).toBe("previous-ticket");
    } finally { apiClient.defaults.adapter = previousAdapter; window.turnstile = undefined; await act(async () => root.unmount()); host.remove(); }
});
