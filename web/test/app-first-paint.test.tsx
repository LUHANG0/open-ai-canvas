import { afterAll, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const dom = new Window({ url: "https://example.test/", settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true } });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AppBootstrapReady } = await import("../src/components/ui/app-bootstrap-ready");
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

function fixture() {
    document.documentElement.className = "";
    document.head.innerHTML = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(([style]) => style.replace(/@layer[^;]+;/g, "")).join("");
    // Model the actual SSI home response, with the published content inside #root.
    const cover = html.slice(html.indexOf('<div id="app-boot-screen"'), html.indexOf('<div id="root"'));
    document.body.innerHTML = `${cover}<div id="root"><main><h1>让想象，不止于想象。</h1><a href="/login">开始创作</a></main></div>`;
    return document.getElementById("root")!;
}

test("without JavaScript the server-rendered content stays readable and the cover is hidden", () => {
    const host = fixture();
    expect(["", "visible"]).toContain(dom.getComputedStyle(host).visibility);
    expect(dom.getComputedStyle(document.getElementById("app-boot-screen")!).display).toBe("none");
    expect(host.querySelector("h1")?.textContent).toBe("让想象，不止于想象。");
});

for (const path of ["/", "/login", "/i/example", "/canvas"]) {
    test(`the early inline bootstrap covers unstyled content before modules load: ${path}`, () => {
        const host = fixture();
        const earlyScript = html.match(/<script>([\s\S]*?)<\/script>/)![1];
        new Function("document", "location", earlyScript)(document, { pathname: path });
        const cover = document.getElementById("app-boot-screen")!;
        expect(host.contains(cover)).toBe(false);
        expect(dom.getComputedStyle(host).visibility).toBe("hidden");
        expect(dom.getComputedStyle(cover).display).toBe("grid");
        expect(dom.getComputedStyle(cover).position).toBe("fixed");
        expect(document.documentElement.classList.contains("app-boot-brand")).toBe(path !== "/canvas");
    });
}

test("the first React commit reveals the shell and removes the cover, including StrictMode replay", async () => {
    const host = fixture();
    document.documentElement.classList.add("app-initializing", "app-boot-brand");
    const root = createRoot(host);
    try {
        await act(async () => root.render(<StrictMode><AppBootstrapReady /><main>正式页面</main></StrictMode>));
        expect(document.getElementById("app-boot-screen")).toBeNull();
        expect(document.documentElement.classList.contains("app-initializing")).toBe(false);
        expect(document.documentElement.classList.contains("app-boot-brand")).toBe(false);
        expect(["", "visible"]).toContain(dom.getComputedStyle(host).visibility);
        expect(host.textContent).toBe("正式页面");
    } finally { await act(async () => root.unmount()); }
});
