import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentMarkdown } from "@/components/document-markdown";

test("document GFM keeps ordered starts, nested lists and focusable table/code boundaries", () => {
    const html = renderToStaticMarkup(<DocumentMarkdown source={'3. 第一步\n4. 第二步\n   - 嵌套项\n\n| 参数 | 说明 |\n| --- | --- |\n| key | value |\n\n```ts\nconst result = 1;\n```'} />);
    expect(html).toContain('<ol start="3">');
    expect(html).toContain("<ul>");
    expect(html).toContain("嵌套项");
    expect(html).toContain('aria-label="说明表格，可左右滚动"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="ts 代码，可滚动阅读"');
    expect(html).toContain("const result = 1;");
});

test("only an explicitly identified long JSON block is initially folded, with its whole code retained", () => {
    const json = JSON.stringify({ providers: Array.from({ length: 8 }, (_, id) => ({ id, enabled: true })) }, null, 2);
    const html = renderToStaticMarkup(<DocumentMarkdown source={`说明保持可见。\n\n\`\`\`json\n${json}\n\`\`\`\n\n\`\`\`js\n${json}\n\`\`\`\n\n\`\`\`json\n{}\n\`\`\``} />);
    const dom = new Window();
    dom.document.body.innerHTML = html;
    const details = dom.document.querySelectorAll("details");
    expect(details).toHaveLength(1);
    expect(details[0].open).toBe(false);
    expect(details[0].querySelector("summary")?.textContent).toContain("展开查看完整代码");
    expect(details[0].querySelector("code")?.textContent).toBe(json + "\n");
    expect(dom.document.querySelectorAll("pre")).toHaveLength(3);
    expect(dom.document.querySelector("p")?.textContent).toBe("说明保持可见。");
    dom.happyDOM.abort();
});

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("a rendering error retains readable source and a different source can preview again", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host, { onCaughtError: () => undefined });
    const source = "原始说明 **必须保留**\n第二行";
    await act(async () => root.render(<DocumentMarkdown source={source} components={{ p: () => { throw new Error("Expected renderer failure"); } }} />));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector("pre")?.textContent).toBe(source);
    await act(async () => root.render(<DocumentMarkdown source="# 恢复预览" />));
    expect(host.querySelector("h1")?.textContent).toBe("恢复预览");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await act(async () => root.unmount());
    host.remove();
});
