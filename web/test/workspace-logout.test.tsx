import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/create" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider } = await import("react-router");
const events: string[] = [];
let logoutResult: Promise<void> = Promise.resolve();
let cleanupResult: Promise<void> = Promise.resolve();
mock.module("../src/services/api/auth", () => ({ logout: () => { events.push("logout"); return logoutResult; } }));
mock.module("../src/lib/user-session", () => ({ applyUserSession: async (session: unknown) => { expect(session).toEqual({ user: null }); events.push("clear-session"); await cleanupResult; } }));
mock.module("antd", () => ({ App: { useApp: () => ({ message: { success: () => events.push("success"), error: (value: string) => events.push(`error:${value}`) } }) }, Popover: ({ content, children, open, onOpenChange }: any) => <div><div onClick={() => onOpenChange(!open)}>{children}</div>{open && content}</div> }));
mock.module("../src/hooks/use-wallet-balance", () => ({ useWalletBalance: () => ({ availableMicrocredits: null }) }));
mock.module("../src/components/layout/app-changelog-modal", () => ({ AppChangelogButton: () => null }));
mock.module("../src/components/layout/identity-provider-badge", () => ({ IdentityProviderBadge: () => null }));
mock.module("../src/components/layout/user-avatar", () => ({ UserAvatar: () => null }));
mock.module("../src/components/layout/system-announcement-center", () => ({ SystemAnnouncementCenter: () => null }));
mock.module("../src/components/ui/base/switch", () => ({ Switch: () => null }));
const { useWorkspaceLogout } = await import("../src/hooks/use-workspace-logout");
const { WorkspaceSidebarFooter } = await import("../src/components/layout/workspace-sidebar-footer");
const { useUserStore } = await import("../src/stores/use-user-store");
function Harness() { const { handleLogout, loggingOut } = useWorkspaceLogout(() => events.push("menu-close")); return <button disabled={loggingOut} onClick={() => void handleLogout()}>{loggingOut ? "正在退出" : "退出"}</button>; }
function defer() { let resolve!: () => void; let reject!: (value: Error) => void; const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
async function fixture(sidebar = false) {
    events.length = 0; const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const router = createMemoryRouter([{ path: "/create", element: sidebar ? <WorkspaceSidebarFooter expandedClassName="expanded" collapsedClassName="collapsed" accountClassName="account" showAnnouncement={false} /> : <Harness /> }, { path: "/login", element: <p>登录目的地</p> }], { initialEntries: ["/create"] });
    const unsubscribe = router.subscribe(({ location }) => { if (location.pathname === "/login") events.push("navigate"); });
    await act(async () => root.render(<RouterProvider router={router} />));
    return { host, router, close: async () => { await act(async () => root.unmount()); unsubscribe(); router.dispose(); host.remove(); } };
}
afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });

test("logout waits for server success and session cleanup before navigating, ignoring same-tick duplicates", async () => {
    const gate = defer(); logoutResult = gate.promise; const f = await fixture();
    try {
        const button = f.host.querySelector("button")!;
        await act(async () => { button.click(); button.click(); });
        expect(events).toEqual(["logout"]); expect(button.disabled).toBe(true); expect(f.router.state.location.pathname).toBe("/create");
        await act(async () => gate.resolve());
        expect(events).toEqual(["logout", "clear-session", "menu-close", "success", "navigate"]); expect(f.router.state.location.pathname).toBe("/login");
        expect(f.router.state.historyAction).toBe("REPLACE");
    } finally { await f.close(); logoutResult = Promise.resolve(); }
});
test("server logout failure retains the session and route and permits a real retry", async () => {
    const gate = defer(); logoutResult = gate.promise; const f = await fixture();
    try {
        await act(async () => f.host.querySelector("button")!.click()); await act(async () => gate.reject(new Error("server failed")));
        expect(events).toEqual(["logout", "error:server failed"]); expect(f.router.state.location.pathname).toBe("/create"); expect(f.host.querySelector("button")!.disabled).toBe(false);
        logoutResult = Promise.resolve(); await act(async () => f.host.querySelector("button")!.click());
        expect(events.slice(2)).toEqual(["logout", "clear-session", "menu-close", "success", "navigate"]);
    } finally { await f.close(); logoutResult = Promise.resolve(); }
});
test("failed account cleanup cannot navigate to login or report success", async () => {
    logoutResult = Promise.resolve(); const cleanup = defer(); cleanupResult = cleanup.promise; const f = await fixture();
    try {
        await act(async () => f.host.querySelector("button")!.click()); expect(events).toEqual(["logout", "clear-session"]);
        await act(async () => cleanup.reject(new Error("cleanup failed")));
        expect(events).toEqual(["logout", "clear-session", "error:cleanup failed"]); expect(f.router.state.location.pathname).toBe("/create");
    } finally { await f.close(); cleanupResult = Promise.resolve(); }
});
test("the real sidebar uses the shared logout path and disables repeated commands until it completes", async () => {
    const previous = useUserStore.getState(); useUserStore.setState({ user: { id: "fixture", username: "fixture", displayName: "测试用户", role: "user" } as typeof previous.user, hydrated: true });
    const gate = defer(); logoutResult = gate.promise; const f = await fixture(true);
    try {
        await act(async () => f.host.querySelector<HTMLButtonElement>("button.account")!.click());
        const button = [...f.host.querySelectorAll("button")].find((node) => node.textContent === "退出登录")!;
        await act(async () => { button.click(); button.click(); });
        expect(events).toEqual(["logout"]); expect(button.disabled).toBe(true); expect(button.textContent).toBe("正在退出");
        await act(async () => gate.resolve()); expect(events).toEqual(["logout", "clear-session", "success", "navigate"]);
    } finally { await f.close(); useUserStore.setState(previous); logoutResult = Promise.resolve(); }
});
