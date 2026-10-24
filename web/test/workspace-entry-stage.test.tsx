import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/create" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider, Outlet } = await import("react-router");
const { WorkspaceEntryStage } = await import("../src/components/layout/workspace-entry-stage");

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

function gate<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

async function fixture() {
    const project = gate<{ Component: () => React.JSX.Element }>();
    const canvas = gate<{ Component: () => React.JSX.Element }>();
    const router = createMemoryRouter([{
        Component: () => <><nav>persistent navigation</nav><WorkspaceEntryStage><Outlet /></WorkspaceEntryStage></>,
        children: [
            { path: "/create", element: <button id="old-command">old content</button> },
            { path: "/projects", lazy: () => project.promise, hydrateFallbackElement: <p>initial loading</p>, errorElement: <div role="alert">module failure, retry</div> },
            { path: "/canvas", lazy: () => canvas.promise, hydrateFallbackElement: <p>initial loading</p> },
        ],
    }], { initialEntries: ["/create"] });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<RouterProvider router={router} useTransitions={false} />));
    return { project, canvas, router, host, close: async () => { await act(async () => root.unmount()); router.dispose(); host.remove(); } };
}

test("lazy entry retains the old content, blocks its commands and keeps navigation mounted", async () => {
    const f = await fixture();
    try {
        const nav = f.host.querySelector("nav");
        f.host.querySelector<HTMLButtonElement>("#old-command")!.focus();
        let navigation!: Promise<void>;
        await act(async () => { navigation = f.router.navigate("/projects"); });
        expect(f.host.textContent).toContain("old content");
        const stage = f.host.querySelector<HTMLElement>("[data-workspace-entry-stage]")!;
        expect(stage.getAttribute("aria-busy")).toBe("true");
        expect(stage.firstElementChild!.hasAttribute("inert")).toBe(true);
        expect(document.activeElement).toBe(stage);
        expect(f.host.querySelector('[role="status"]')).toBeNull();
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 170)); });
        expect(f.host.querySelector('[role="status"]')!.textContent).toContain("短剧项目");
        await act(async () => { f.project.resolve({ Component: () => <h1>project content</h1> }); await navigation; });
        expect(f.host.textContent).not.toContain("old content");
        expect(f.host.textContent).toContain("project content");
        expect(f.host.querySelector("nav")).toBe(nav);
        expect(stage.getAttribute("aria-busy")).toBe("false");
        expect(stage.firstElementChild!.hasAttribute("inert")).toBe(false);
        expect(f.host.querySelector('[role="status"]')).toBeNull();
    } finally { await f.close(); }
});

test("a failed module uses the content error boundary and restores interactivity", async () => {
    const f = await fixture();
    try {
        const nav = f.host.querySelector("nav");
        let navigation!: Promise<void>;
        await act(async () => { navigation = f.router.navigate("/projects"); });
        await act(async () => { f.project.reject(new Error("controlled failure")); await navigation; });
        expect(f.host.querySelector('[role="alert"]')!.textContent).toContain("retry");
        expect(f.host.querySelector("nav")).toBe(nav);
        expect(f.host.querySelector('[data-workspace-entry-stage]')!.getAttribute("aria-busy")).toBe("false");
    } finally { await f.close(); }
});

test("a second navigation supersedes a slow module without briefly showing the cancelled page", async () => {
    const f = await fixture();
    try {
        let first!: Promise<void>, second!: Promise<void>;
        await act(async () => { first = f.router.navigate("/projects"); });
        await act(async () => { second = f.router.navigate("/canvas"); });
        await act(async () => { f.canvas.resolve({ Component: () => <h1>canvas content</h1> }); await second; });
        await act(async () => { f.project.resolve({ Component: () => <h1>cancelled project</h1> }); await first; });
        expect(f.host.textContent).toContain("canvas content");
        expect(f.host.textContent).not.toContain("cancelled project");
        expect(f.router.state.location.pathname).toBe("/canvas");
    } finally { await f.close(); }
});
