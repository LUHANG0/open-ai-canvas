import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider, Link, useLocation, useNavigate } = await import("react-router");
const { useAuthDestination } = await import("../src/pages/auth/use-auth-destination");
const { authEntry, authLink, authDestination, authReturnState, beginAuthNavigation, clearAuthNavigation, safeAuthNext, observeAuthNavigation } = await import("../src/lib/auth-navigation");
const { linuxDOLoginURL } = await import("../src/services/api/auth");

const destination = "/canvas/example?mode=edit&conversation=thread%201#selected";
function Home() { return <><Link {...authEntry(destination)}>具体画布</Link><Link {...authEntry("/skills?filter=mine#library")}>技能入口</Link><Link to="/login">直接登录</Link></>; }
function AuthProbe() {
    const next = useAuthDestination(); const location = useLocation(); const navigate = useNavigate();
    return <><output>{next}</output><button onClick={() => void navigate("/", { replace: true })}>取消</button><button onClick={() => { clearAuthNavigation(); void navigate(next, { replace: true }); }}>完成</button><Link to="/register" state={location.state} replace>切注册</Link><Link to="/forgot-password" state={location.state} replace>找回</Link><Link to="/">离开</Link></>;
}
async function fixture(path: string = "/") {
    clearAuthNavigation();
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const router = createMemoryRouter([{ path: "/", element: <Home /> }, ...["/login", "/register", "/forgot-password"].map((path) => ({ path, element: <AuthProbe /> })), { path: "/canvas/:id", element: <p>画布目的地</p> }, { path: "/skills", element: <p>技能目的地</p> }, { path: "/create", element: <p>默认目的地</p> }], { initialEntries: [path] });
    const stop = observeAuthNavigation(router);
    await act(async () => root.render(<StrictMode><RouterProvider router={router} /></StrictMode>));
    const click = async (text: string) => { await act(async () => [...host.querySelectorAll<HTMLButtonElement>("a,button")].find((v) => v.textContent === text)!.click()); };
    return { host, router, click, next: () => host.querySelector("output")?.textContent, go: async (to: string | number) => act(async () => { await router.navigate(to as string); }), close: async () => { await act(async () => root.unmount()); stop(); router.dispose(); host.remove(); clearAuthNavigation(); } };
}
afterAll(() => { dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

test("clean native links keep a per-entry target through auth modes, without hover writes", async () => {
    const f = await fixture();
    try {
        const link = f.host.querySelector("a")!;
        expect(link.getAttribute("href")).toBe("/login");
        const before = dom.sessionStorage.length;
        await act(async () => link.dispatchEvent(new dom.MouseEvent("mouseover", { bubbles: true })));
        expect(dom.sessionStorage.length).toBe(before);
        const modified = new dom.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
        await act(async () => link.dispatchEvent(modified));
        expect(modified.defaultPrevented).toBe(false); expect(f.router.state.location.pathname).toBe("/");
        await f.click("具体画布"); expect(f.next()).toBe(destination); expect(f.router.state.location.search).toBe("");
        const entry = authReturnState(f.router.state.location.state)!;
        expect(entry.flow).toBeTruthy(); expect(dom.sessionStorage.getItem("mengceng.auth-navigation.flow")).toBe(entry.flow);
        expect([...Array(dom.sessionStorage.length)].map((_, i) => dom.sessionStorage.getItem(dom.sessionStorage.key(i)!)).join("")).not.toContain(destination);
        await f.click("切注册"); expect(f.next()).toBe(destination);
        await f.click("找回"); expect(f.next()).toBe(destination);
        expect(authReturnState(f.router.state.location.state)?.flow).toBe(entry.flow);
    } finally { await f.close(); }
});

test("legacy next migrates once using replace and retains real protocol parameters and target query/hash", async () => {
    const f = await fixture(`/login?next=${encodeURIComponent(destination)}&oauth_error=fixture#notice`);
    try {
        expect(f.next()).toBe(destination); expect(f.router.state.location.search).toBe("?oauth_error=fixture");
        expect(f.router.state.location.hash).toBe("#notice"); expect(f.router.state.historyAction).toBe("REPLACE");
        const key = f.router.state.location.key;
        await act(async () => f.router.revalidate());
        expect(f.router.state.location.key).toBe(key);
    } finally { await f.close(); }
});

test("leaving and forwarding invalidates the old target; direct login and a second entry cannot inherit it", async () => {
    const f = await fixture();
    try {
        await f.click("具体画布"); expect(f.next()).toBe(destination);
        const stale = f.router.state.location.state;
        await f.go(-1); expect(authDestination(stale)).toBe("/create");
        await f.go(1); expect(f.next()).toBe("/create");
        await f.click("取消"); await f.click("技能入口"); expect(f.next()).toBe("/skills?filter=mine#library");
        await f.click("取消"); await f.click("直接登录"); expect(f.next()).toBe("/create");
    } finally { await f.close(); }
});

test("successful completion consumes the flow before navigation, and explicit session clearing rejects saved entries", async () => {
    const f = await fixture();
    try {
        await f.click("具体画布"); const state = f.router.state.location.state;
        await f.click("完成"); expect(f.router.state.location.pathname + f.router.state.location.search + f.router.state.location.hash).toBe(destination);
        expect(authDestination(state)).toBe("/create");
        await f.go("/"); await f.click("技能入口"); const other = f.router.state.location.state;
        clearAuthNavigation(); expect(authDestination(other)).toBe("/create");
    } finally { await f.close(); }
});

test("a cached document departure invalidates its flow and pageshow refreshes the restored auth entry", async () => {
    const f = await fixture();
    try {
        await f.click("具体画布"); expect(f.next()).toBe(destination);
        await act(async () => {
            window.dispatchEvent(Object.assign(new dom.Event("pagehide"), { persisted: true }));
            window.dispatchEvent(Object.assign(new dom.Event("pageshow"), { persisted: true }));
        });
        expect(f.next()).toBe("/create");
        expect(authReturnState(f.router.state.location.state)?.next).toBe("/create");
    } finally { await f.close(); }
});

test("safe destinations reject external addresses, encoded separators, controls and normalized auth loops", () => {
    for (const value of ["https://evil.test", "//evil.test", "/\\evil.test", "/%5Cevil.test", "/%2Fevil.test", "/%0Aevil", "/login", "/LOGIN?next=/create", "/foo/../register#x", "/%6cogin", "/forgot-password/"]) expect(safeAuthNext(value)).toBe("/create");
    for (const value of [destination, "/share/canvas/token?view=preview#frame", "/settings?section=profile&continue=task", "/i/Ab3xY9"]) expect(safeAuthNext(value)).toBe(value);
    const id = beginAuthNavigation(); expect(authDestination({ authReturn: { next: destination, flow: id } })).toBe(destination);
    clearAuthNavigation(id); expect(authDestination({ authReturn: { next: destination, flow: id } })).toBe("/create");
});

test("old brand auth hrefs clean only next; OAuth keeps the backend next and accepted-terms protocol", () => {
    expect(authLink(`/login?next=${encodeURIComponent(destination)}&oauth_error=x#notice`)).toEqual({ to: "/login?oauth_error=x#notice", state: authEntry(destination).state });
    const url = new URL(linuxDOLoginURL(destination, true), "http://localhost");
    expect(url.pathname).toEndWith("/auth/linuxdo/start"); expect(url.searchParams.get("next")).toBe(destination); expect(url.searchParams.get("acceptedTerms")).toBe("true");
});

test("readable but unwritable session storage falls back once without a replace loop", async () => {
    const storage = dom.sessionStorage;
    const original = Object.getOwnPropertyDescriptor(storage, "setItem");
    Object.defineProperty(storage, "setItem", { configurable: true, value: () => { throw new Error("fixture quota"); } });
    const f = await fixture();
    let changes = 0;
    const stop = f.router.subscribe(() => { changes++; });
    try {
        expect(storage.getItem("mengceng.auth-navigation.flow")).toBeNull();
        await f.click("具体画布"); expect(f.next()).toBe(destination);
        expect(changes).toBeLessThan(6);
        await f.click("切注册"); expect(f.next()).toBe(destination);
        await f.click("取消"); await f.click("直接登录"); expect(f.next()).toBe("/create");
    } finally {
        stop(); await f.close();
        if (original) Object.defineProperty(storage, "setItem", original);
        else Reflect.deleteProperty(storage, "setItem");
    }
});
