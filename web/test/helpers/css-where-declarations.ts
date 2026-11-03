import { expect } from "bun:test";
import postcss, { type Declaration } from "postcss";
import selectorParser from "postcss-selector-parser";

/** Match the complete zero-specificity target group, whether grouped or split. */
export function expectWhereDeclarations(css: string, targets: readonly string[], declarations: Readonly<Record<string, string>>, scope = "") {
    const expected = [...targets].sort();
    const matches: postcss.Rule[] = [];
    postcss.parse(css).walkRules((rule) => {
        if (!rule.selector.includes(":where(")) return;
        const selectors = selectorParser().astSync(rule.selector);
        const actual: string[] = [];
        for (const selector of selectors.nodes) {
            const where = selector.nodes.at(-1);
            if (where?.type !== "pseudo" || where.value !== ":where") return;
            const prefix = selector.nodes.slice(0, -1).map(String).join("").trim();
            if (prefix !== scope) return;
            for (const target of where.nodes) {
                if (target.nodes.length !== 1 || target.first?.type !== "class") return;
                actual.push(target.first.value);
            }
        }
        if (JSON.stringify(actual.sort()) === JSON.stringify(expected)) matches.push(rule);
    });
    expect(matches.length).toBeGreaterThan(0);
    for (const rule of matches) {
        const values = new Map(rule.nodes.filter((node): node is Declaration => node.type === "decl").map((node) => [node.prop, { value: node.value, important: Boolean(node.important) }]));
        for (const [property, value] of Object.entries(declarations)) {
            expect(values.get(property)).toEqual({ value, important: true });
        }
    }
}
