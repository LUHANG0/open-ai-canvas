import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sourceRoot = resolve(import.meta.dir, "../src");

describe("AI Markdown 样式边界", () => {
    test("样式跟随组件加载，不再回流全局 CSS", () => {
        const component = readFileSync(resolve(sourceRoot, "components/ai/ai-message-markdown.tsx"), "utf8");
        const componentStyles = readFileSync(resolve(sourceRoot, "components/ai/ai-message-markdown.css"), "utf8");
        const globalStyles = readFileSync(resolve(sourceRoot, "styles/globals.css"), "utf8");

        expect(component).toContain('import "./ai-message-markdown.css";');
        expect(componentStyles).toContain(".ai-message-markdown-table-wrap");
        expect(componentStyles).toContain(".ai-message-markdown-task");
        expect(globalStyles).not.toContain(".ai-message-markdown-heading");
    });
});
