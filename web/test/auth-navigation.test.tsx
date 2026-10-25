import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, Route, Routes, useLocation } = await import("react-router");
const { BrandLink } = await import("../src/components/brand/brand-link");
const { authEntry, authDestination, safeAuthNext } = await import("../src/lib/auth-navigation");
const { RequireAuth } = await import("../src/components/auth/require-auth");
const { useUserStore } = await import("../src/stores/use-user-store");

afterAll(() => { dom.happyDOM.abort(); for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
function Position() { const location = useLocation(); return <output>{location.pathname + location.search + location.hash}</output>; }
function Destination() { const location = useLocation(); return <output>{authDestination(location.state, new URLSearchParams(location.search).get("next"))}</output>; }
async function host() {
    const element = document.createElement("div"); document.body.append(element); const root = createRoot(element);
    return { element, root, close: async () => { await act(async () => root.unmount()); element.remove(); } };
}

test("login destinations preserve path, query and hash and reject non-local addresses", async () => {
    const destination = "/canvas/example?view=nodes#selected";
    expect(authEntry(destination).to).toBe("/login");
    expect(authDestination(authEntry(destination).state)).toBe(destination);
    for (const invalid of [undefined, null, "", "https://example.com", "//example.com", "/\\example.com", "/\nexample.com"]) expect(safeAuthNext(invalid)).toBe("/create");
    const previous = useUserStore.getState(); const f = await host();
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
        const header = f.element.querySelector("header"); const links = [...f.element.querySelectorAll("a")];
        for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
            const event = new dom.MouseEvent("click", { bubbles: true, cancelable: true, ...options });
            await act(async () => links[0].dispatchEvent(event));
            expect(event.defaultPrevented).toBe(false); expect(f.element.querySelector("output")?.textContent).toBe("/");
        }
        const preview = new dom.MouseEvent("click", { bubbles: true, cancelable: true });
        await act(async () => links[1].dispatchEvent(preview)); expect(preview.defaultPrevented).toBe(true);
        expect(links[2].getAttribute("href")).toBe("https://example.com"); expect(links[2].target).toBe("_blank");
        await act(async () => links[0].click());
        expect(f.element.querySelector("output")?.textContent).toBe("/login"); expect(f.element.querySelector("header")).toBe(header);
    } finally { await f.close(); }
});
