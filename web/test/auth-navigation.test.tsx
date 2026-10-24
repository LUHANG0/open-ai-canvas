import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
let session: Promise<unknown> = Promise.resolve({ user: null });
mock.module("../src/services/api/auth", () => ({ getAuthSession: () => session }));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, Route, Routes, useLocation } = await import("react-router");
const { BrandLink } = await import("../src/components/brand/brand-link");
const { AuthScene } = await import("../src/pages/auth/auth-scene");
const { loginPath, safeAuthNext } = await import("../src/lib/auth-navigation");
const { RequireAuth } = await import("../src/components/auth/require-auth");
const { useUserStore } = await import("../src/stores/use-user-store");

afterAll(() => {
    mock.restore(); dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

function Position() { const location = useLocation(); return <output>{location.pathname + location.search}</output>; }
function Destination() { const location = useLocation(); return <output>{new URLSearchParams(location.search).get("next")}</output>; }
async function host() {
    const element = document.createElement("div"); document.body.append(element);
    const root = createRoot(element);
    return { element, root, close: async () => { await act(async () => root.unmount()); element.remove(); } };
}

test("login destinations preserve path, query and hash and reject non-local addresses", async () => {
    const destination = "/canvas/example?view=nodes#selected";
    expect(new URLSearchParams(loginPath(destination).split("?")[1]).get("next")).toBe(destination);
    for (const invalid of [undefined, null, "", "https://example.com", "//example.com", "/\\example.com", "/\nexample.com"]) {
        expect(safeAuthNext(invalid)).toBe("/create");
    }
    const previous = useUserStore.getState();
    const f = await host();
    try {
        useUserStore.setState({ user: null, hydrated: true });
        await act(async () => f.root.render(<MemoryRouter initialEntries={[destination]}><Routes><Route path="/canvas/:id" element={<RequireAuth><div>protected</div></RequireAuth>} /><Route path="/login" element={<Destination />} /></Routes></MemoryRouter>));
        expect(f.element.querySelector("output")?.textContent).toBe(destination);
        expect(f.element.textContent).not.toContain("protected");
    } finally { await f.close(); useUserStore.setState(previous); }
});

test("brand links use continuous routing, preserve modified clicks and block preview navigation", async () => {
    const f = await host();
    try {
        await act(async () => f.root.render(<MemoryRouter><header>stable shell</header><BrandLink href="/login?next=%2Fcreate">登录</BrandLink><BrandLink href="/canvas" onClick={(event) => event.preventDefault()}>预览</BrandLink><BrandLink href="https://example.com" target="_blank" rel="noreferrer">外部</BrandLink><Position /></MemoryRouter>));
        const header = f.element.querySelector("header");
        const links = [...f.element.querySelectorAll("a")];
        for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
            const event = new dom.MouseEvent("click", { bubbles: true, cancelable: true, ...options });
            await act(async () => links[0].dispatchEvent(event));
            expect(event.defaultPrevented).toBe(false);
            expect(f.element.querySelector("output")?.textContent).toBe("/");
        }
        const preview = new dom.MouseEvent("click", { bubbles: true, cancelable: true });
        await act(async () => links[1].dispatchEvent(preview));
        expect(preview.defaultPrevented).toBe(true);
        expect(links[2].getAttribute("href")).toBe("https://example.com");
        expect(links[2].target).toBe("_blank");
        await act(async () => links[0].click());
        expect(f.element.querySelector("output")?.textContent).toBe("/login?next=%2Fcreate");
        expect(f.element.querySelector("header")).toBe(header);
    } finally { await f.close(); }
});

for (const outcome of ["guest", "member", "failure"] as const) {
    test(`auth keeps a stable shell and gates the form while identity is unresolved: ${outcome}`, async () => {
        let resolve!: (value: unknown) => void;
        let reject!: (error: Error) => void;
        session = new Promise((yes, no) => { resolve = yes; reject = no; });
        const f = await host();
        try {
            await act(async () => f.root.render(<MemoryRouter initialEntries={["/login?next=%2Fcreate%3Ffrom%3Dbrand"]}><Routes><Route element={<AuthScene />}><Route path="/login" element={<form><input aria-label="test account" /></form>} /></Route><Route path="/create" element={<Position />} /></Routes></MemoryRouter>));
            const shell = f.element.querySelector(".auth-scene");
            const artwork = f.element.querySelector(".auth-scene-artwork");
            expect(shell).not.toBeNull();
            expect(f.element.querySelector("form")).toBeNull();
            expect(f.element.querySelector('[role="status"]')?.textContent).toContain("正在确认登录状态");
            await act(async () => { if (outcome === "failure") reject(new Error("unavailable")); else resolve({ user: outcome === "member" ? { id: "existing" } : null }); });
            if (outcome === "member") {
                expect(f.element.querySelector("form")).toBeNull();
                expect(f.element.querySelector("output")?.textContent).toBe("/create?from=brand");
            } else {
                expect(f.element.querySelector("form")).not.toBeNull();
                expect(f.element.querySelector(".auth-scene")).toBe(shell);
                expect(f.element.querySelector(".auth-scene-artwork")).toBe(artwork);
                if (outcome === "failure") expect(f.element.querySelector('[role="alert"]')?.textContent).toContain("暂时无法确认登录状态");
            }
        } finally { await f.close(); }
    });
}
