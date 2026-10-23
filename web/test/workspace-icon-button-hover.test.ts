import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("shared workspace feedback does not infer buttons from svg children or override positioning", () => {
    const css = source("../src/styles/workspace-product.css");
    expect(css).not.toContain("button:has(> svg)");
    expect(css).not.toContain("transform: scale(.975)");
    expect(css).not.toContain("product-card-enter");
    expect(css).not.toContain("product-image-reveal");
    expect(source("../src/layouts/user-layout.tsx")).not.toContain("useWorkspaceButtonFeedback");
    expect(existsSync(new URL("../src/hooks/use-workspace-button-feedback.ts", import.meta.url))).toBe(false);
});

test("shared controls expose native keyboard focus without per-page exceptions", () => {
    const css = source("../src/styles/unified-buttons.css");
    expect(css).toContain('[data-slot="icon-button"]');
    expect(css).not.toContain(':focus-visible:not([data-input-modality="keyboard"])');
    expect(css).not.toContain(".creation-home");
    expect(css).toContain("transition-duration: 0s !important");
    for (const file of ["icon-button", "tool-button"]) {
        const button = source(`../src/components/ui/base/buttons/${file}.tsx`);
        expect(button).not.toContain("active:scale");
        expect(button).not.toContain("setInputModality");
    }
});
