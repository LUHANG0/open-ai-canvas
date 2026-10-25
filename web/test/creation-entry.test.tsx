import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, StrictMode, useRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, useLocation, useNavigate } = await import("react-router");
const { readCreationEntry, useCreationEntry, useExploreEntryScroll } = await import("../src/pages/create/use-creation-entry");
const { authDestination, authLink } = await import("../src/lib/auth-navigation");
type CreationEntry = NonNullable<ReturnType<typeof readCreationEntry>>;

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("entry accepts only image, video and the existing inspiration hall", () => {
    expect(readCreationEntry("?mode=image")).toEqual({ mode: "image", explore: false });
    expect(readCreationEntry("?mode=video&view=explore")).toEqual({ mode: "video", explore: true });
    expect(readCreationEntry("?view=explore")).toEqual({ explore: true });
    for (const value of ["", "?mode=admin", "?mode=text", "?mode=VIDEO", "?view=wallet", "?mode=https://example.com"]) {
        expect(readCreationEntry(value)).toBeNull();
    }
});

test("brand prompt survives the authentication return as bounded plain Unicode text", () => {
    const prompt = "海边的黄昏 🎬\n人物说：A&B? #下一镜 <镜头推进>";
    const next = `/create?mode=video&prompt=${encodeURIComponent(prompt)}`;
    const login = authLink("/login", next);
    const destination = authDestination(login.state);
    expect(destination).toBe(next);
    expect(readCreationEntry(new URL(destination, "http://localhost/").search)).toEqual({ mode: "video", explore: false, prompt });
    expect(readCreationEntry(`?mode=image&prompt=${encodeURIComponent("  " + "🎬".repeat(2001) + "  ")}`)?.prompt).toBe("🎬".repeat(2000));
    expect(readCreationEntry("?prompt=%20%0A%20")).toBeNull();
});

async function fixture(initial = "/create?mode=video&keep=1#preserved") {
    const url = new URL(initial, "http://localhost/");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const opened: CreationEntry[] = [];
    let blocked = 0;
    let navigate: ReturnType<typeof useNavigate>;
    let location: ReturnType<typeof useLocation>;
    function Harness({ ready, hasDraft, busy }: { ready: boolean; hasDraft: boolean; busy: boolean }) {
        location = useLocation();
        navigate = useNavigate();
        useCreationEntry({ ready, hasDraft, busy, onOpen: (entry) => opened.push(entry), onBlocked: () => { blocked++; } });
        return null;
    }
    const render = async (ready: boolean, hasDraft = false, busy = false) => act(async () => {
        root.render(<StrictMode><MemoryRouter initialEntries={[{ pathname: url.pathname, search: url.search, hash: url.hash, state: { fromBrand: true } }]}>
            <Harness ready={ready} hasDraft={hasDraft} busy={busy} />
        </MemoryRouter></StrictMode>);
    });
    await render(false);
    return {
        opened, blocked: () => blocked, location: () => location!, render,
        navigate: async (to: string) => act(async () => { await navigate!(to); }),
        close: async () => { await act(async () => root.unmount()); host.remove(); },
    };
}

test("entry waits for hydration, runs once in strict mode, and preserves unrelated URL state", async () => {
    const f = await fixture();
    try {
        expect(f.opened).toEqual([]);
        expect(f.location().search).toContain("mode=video");
        await f.render(true);
        expect(f.opened).toEqual([{ mode: "video", explore: false }]);
        expect(f.location().search).toBe("?keep=1");
        expect(f.location().hash).toBe("#preserved");
        expect(f.location().state).toEqual({ fromBrand: true });
        await f.render(true);
        expect(f.opened).toHaveLength(1);
        expect(f.blocked()).toBe(0);
    } finally { await f.close(); }
});

test("prompt is handed off once after hydration and removed from the URL", async () => {
    const prompt = "在阳光下，拍一段缓慢推进的镜头";
    const f = await fixture(`/create?mode=video&prompt=${encodeURIComponent(prompt)}&keep=1#preserved`);
    try {
        expect(f.opened).toHaveLength(0);
        await f.render(true);
        expect(f.opened).toEqual([{ mode: "video", explore: false, prompt }]);
        expect(f.location().search).toBe("?keep=1");
        expect(f.location().hash).toBe("#preserved");
        expect(f.location().state).toEqual({ fromBrand: true });
        await f.render(true, true);
        expect(f.opened).toHaveLength(1);
        expect(f.blocked()).toBe(0);
    } finally { await f.close(); }
});

test("incoming prompt cannot replace an existing draft or replay after a running task", async () => {
    for (const [hasDraft, busy] of [[true, false], [false, true]]) {
        const f = await fixture("/create?mode=video&prompt=hello&keep=1");
        try {
            await f.render(true, hasDraft, busy);
            expect(f.opened).toHaveLength(0);
            expect(f.blocked()).toBe(1);
            expect(f.location().search).toBe("?keep=1");
            await f.render(true);
            expect(f.opened).toHaveLength(0);
        } finally { await f.close(); }
    }
});

test("a draft entered during hydration is retained and the blocked request is not replayed", async () => {
    const f = await fixture();
    try {
        await f.render(true, true);
        expect(f.opened).toEqual([]);
        expect(f.blocked()).toBe(1);
        expect(f.location().search).toBe("?keep=1");
        await f.render(true, false);
        expect(f.opened).toEqual([]);
        expect(f.blocked()).toBe(1);
    } finally { await f.close(); }
});

test("busy generation blocks an entry while a later explicit entry can open the inspiration hall", async () => {
    const f = await fixture("/create?mode=image");
    try {
        await f.render(true, false, true);
        expect(f.opened).toEqual([]);
        expect(f.blocked()).toBe(1);
        await f.render(true);
        await f.navigate("/create?view=explore");
        expect(f.opened).toEqual([{ explore: true }]);
        expect(f.location().search).toBe("");
        await f.navigate("/create?mode=image");
        expect(f.opened.at(-1)).toEqual({ mode: "image", explore: false });
    } finally { await f.close(); }
});

async function scrollFixture() {
    const request = window.requestAnimationFrame;
    const cancel = window.cancelAnimationFrame;
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    window.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
    window.cancelAnimationFrame = (id) => { frames.delete(id); };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let settled = 0;
    let scrolled = 0;
    function Harness({ ready, blocked }: { ready: boolean; blocked: boolean }) {
        const target = useRef<HTMLDivElement>(null);
        const [pending, setPending] = useState(true);
        useExploreEntryScroll({ pending, ready, blocked, target, onSettled: () => { settled++; setPending(false); } });
        return <div ref={target} tabIndex={-1}>灵感大厅</div>;
    }
    const render = async (ready: boolean, blocked = false) => act(async () => root.render(<Harness ready={ready} blocked={blocked} />));
    await render(false);
    const target = host.firstElementChild as HTMLDivElement;
    Object.defineProperty(target, "scrollIntoView", { value: () => { scrolled++; }, configurable: true });
    return {
        render, target, frames, settled: () => settled, scrolled: () => scrolled,
        flush: async () => act(async () => { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(0); }),
        close: async () => { await act(async () => root.unmount()); host.remove(); window.requestAnimationFrame = request; window.cancelAnimationFrame = cancel; },
    };
}

test("explore scroll waits for the lazy hall and catalog, then scrolls and focuses once", async () => {
    const f = await scrollFixture();
    try {
        // The Suspense fallback and loading catalog cannot consume the request.
        await f.flush();
        expect(f.scrolled()).toBe(0);
        expect(f.settled()).toBe(0);
        await f.render(false);
        expect(f.frames.size).toBe(0);
        await f.render(true);
        expect(f.frames.size).toBe(1);
        await f.flush();
        expect(f.scrolled()).toBe(1);
        expect(f.settled()).toBe(1);
        expect(document.activeElement).toBe(f.target);
        await f.render(true);
        await f.flush();
        expect(f.scrolled()).toBe(1);
    } finally { await f.close(); }
});

test("editing while the hall loads cancels the pending scroll without stealing focus", async () => {
    const f = await scrollFixture();
    try {
        await f.render(true);
        expect(f.frames.size).toBe(1);
        await f.render(true, true);
        expect(f.frames.size).toBe(0);
        expect(f.settled()).toBe(1);
        await f.render(true, false);
        await f.flush();
        expect(f.scrolled()).toBe(0);
        expect(document.activeElement).not.toBe(f.target);
    } finally { await f.close(); }
});
