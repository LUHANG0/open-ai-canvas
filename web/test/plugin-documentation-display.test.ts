import { describe, expect, test } from "bun:test";

import { PLUGIN_API_VERSION, type PluginManifest } from "../src/lib/plugins/plugin-types";
import { getPluginDocumentation, getPluginDocumentationDisplaySource } from "../src/pages/plugins/plugin-documentation";

const identity = { name: "Example", description: "A complete summary." };

describe("plugin documentation display identity", () => {
    test("removes only the exact plain heading and adjacent complete summary", () => {
        const source = "# Example\n\nA complete summary.\n\n## Usage\n\nKeep this section.";
        expect(getPluginDocumentationDisplaySource(source, identity)).toBe("## Usage\n\nKeep this section.");
    });

    test("supports plain ATX closing markers and Setext headings", () => {
        expect(getPluginDocumentationDisplaySource("## Example ##\n\nKeep this.", identity)).toBe("Keep this.");
        expect(getPluginDocumentationDisplaySource("Example\n=======\n\nKeep this.", identity)).toBe("Keep this.");
    });

    test("keeps similar introductions and later unique headings", () => {
        const body = "Example has another introduction.\n\n# Example API\n\nKeep this.";
        expect(getPluginDocumentationDisplaySource(`# Example\n\n${body}`, identity)).toBe(body);
        expect(getPluginDocumentationDisplaySource(`# Example API\n\n${identity.description}`, identity)).toBe(`# Example API\n\n${identity.description}`);
    });

    test("keeps inline links, code, HTML, and literal autolinks", () => {
        for (const source of ["# [Example](https://example.com)\n\nKeep this.", "# `Example`\n\nKeep this.", "<h1>Example</h1>\n\nKeep this."]) {
            expect(getPluginDocumentationDisplaySource(source, identity)).toBe(source);
        }
        for (const description of ["Use `example`.", "See [example](https://example.com).", "Visit https://example.com."]) {
            expect(getPluginDocumentationDisplaySource(description, { ...identity, description })).toBe(description);
        }
    });

    test("preserves full code blocks and internal names and descriptions", () => {
        const code = '```json\n{\n  "name": "Example",\n  "description": "A complete summary."\n}\n```';
        expect(getPluginDocumentationDisplaySource(`# Example\n\n${identity.description}\n\n${code}`, identity)).toBe(code);
        expect(getPluginDocumentationDisplaySource(code, identity)).toBe(code);
    });

    test("does not treat an indented code line or list as an identity block", () => {
        const code = "    Example\n=======\n\nKeep this.";
        expect(getPluginDocumentationDisplaySource(code, identity)).toBe(code);
        expect(getPluginDocumentationDisplaySource("- A summary.", { ...identity, description: "- A summary." })).toBe("- A summary.");
    });

    test("leaves the raw documentation and fallback source unchanged", () => {
        const manifest: PluginManifest = {
            apiVersion: PLUGIN_API_VERSION, id: "example", name: identity.name, description: identity.description,
            version: "1.0.0", permissions: [], surfaces: [], runtime: { web: "declarative" }, contributes: {},
        };
        const source = getPluginDocumentation(manifest);
        expect(source.startsWith(`# Example\n\n${identity.description}`)).toBe(true);
        expect(getPluginDocumentationDisplaySource(source, identity).startsWith("## 插件信息")).toBe(true);
        expect(getPluginDocumentation(manifest)).toBe(source);
        expect(manifest.documentation).toBeUndefined();
    });
});
