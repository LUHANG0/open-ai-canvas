import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// 减少动态效果时，用 `* { transition-duration: … }` 缩短过渡会让 antd 浮层根节点的 left/top 也产生过渡；
// rc-trigger 同帧写入 left/top 后测量到的仍是 -1000vw 预隐藏坐标，浮层停在屏幕外。
// 非零时长的通配规则必须在同一个 reduce 媒体块里把浮层根节点的过渡归零。
const OVERLAY_ROOTS = [".ant-popover", ".ant-dropdown", ".ant-select-dropdown", ".ant-tooltip", ".ant-picker-dropdown"];

function reducedMotionBlocks(css: string) {
    const blocks: string[] = [];
    const marker = "@media (prefers-reduced-motion: reduce)";
    let index = css.indexOf(marker);
    while (index >= 0) {
        let depth = 0;
        let end = css.indexOf("{", index);
        for (let cursor = end; cursor < css.length; cursor++) {
            if (css[cursor] === "{") depth++;
            if (css[cursor] === "}" && --depth === 0) {
                end = cursor;
                break;
            }
        }
        blocks.push(css.slice(index, end + 1));
        index = css.indexOf(marker, end);
    }
    return blocks;
}

function rules(block: string) {
    const body = block.slice(block.indexOf("{") + 1, block.lastIndexOf("}")).replace(/\/\*[\s\S]*?\*\//g, "");
    return [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].replace(/\s+/g, " ").trim(), declarations: match[2] }));
}

function hasSafeOverlayTransitions(block: string) {
    const entries = rules(block);
    const universal = entries.filter((rule) => /\*\s*(,|$)/.test(rule.selector) && rule.declarations.includes("transition-duration"));
    if (universal.every((rule) => /transition-duration:\s*0(?:ms|s)\s*!important/.test(rule.declarations))) return true;
    return entries.some((rule) => OVERLAY_ROOTS.every((root) => rule.selector.includes(root)) && /transition-duration:\s*0(?:ms|s)\s*!important/.test(rule.declarations));
}

test("overlay validator rejects nonzero universal transitions unless overlay roots are reset", () => {
    const universal = "* { transition-duration: 0.01ms !important; }";
    expect(hasSafeOverlayTransitions(`@media (prefers-reduced-motion: reduce) { ${universal} }`)).toBe(false);
    expect(hasSafeOverlayTransitions(`@media (prefers-reduced-motion: reduce) { ${universal} ${OVERLAY_ROOTS.join(",")} { transition-duration: 0s !important; } }`)).toBe(true);
    expect(hasSafeOverlayTransitions("@media (prefers-reduced-motion: reduce) { * { transition-duration: 0s !important; } }")).toBe(true);
});

for (const file of ["../src/styles/workspace-product.css", "../src/pages/admin/theme/admin-chrome.css"]) {
    test(`${file.split("/").pop()} 减少动态效果下浮层根节点不参与过渡`, () => {
        const css = readFileSync(new URL(file, import.meta.url), "utf8");
        const blocks = reducedMotionBlocks(css).filter((block) => rules(block).some((rule) => /\*\s*(,|$)/.test(rule.selector) && rule.declarations.includes("transition-duration")));
        expect(blocks.length).toBeGreaterThan(0);
        for (const block of blocks) {
            expect(hasSafeOverlayTransitions(block)).toBe(true);
        }
    });
}
