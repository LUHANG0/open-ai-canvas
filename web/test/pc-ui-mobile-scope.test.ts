import { describe, expect, test } from "bun:test";

function compact(source: string) {
    return source.replace(/\s+/g, " ").trim();
}

function section(source: string, startMarker: string, endMarker: string) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return compact(source.slice(start, end));
}

describe("PC UI primitive viewport contract", () => {
    test("keeps the pre-refactor primitive visuals below the desktop breakpoint", async () => {
        const source = await Bun.file(new URL("../src/components/ui/pc/pc-ui.css", import.meta.url)).text();
        const mobileContract = compact(source.slice(0, source.indexOf("@media (min-width: 1024px)")));

        expect(mobileContract).toContain(
            ".pc-surface--raised { background: var(--app-surface-1, var(--card, #ffffff)); border-color: var(--app-border-default, var(--border, rgba(17, 17, 17, 0.14))); box-shadow: var(--app-shadow-surface, var(--elevation-card, 0 1px 2px rgba(0, 0, 0, 0.05))); }",
        );
        expect(mobileContract).toContain(
            ".pc-status-badge { --pc-status-bg: var(--app-surface-2, var(--surface-card, #f7f8fa)); --pc-status-border: var(--app-border-subtle, var(--border, rgba(17, 17, 17, 0.1))); --pc-status-fg: var(--app-text-secondary, var(--muted-foreground, rgba(17, 17, 17, 0.64))); display: inline-flex; min-height: 24px;",
        );
        expect(mobileContract).toContain("border-radius: var(--r-full, 9999px); font-size: var(--fs-caption, 12px); font-weight: 600;");
        expect(mobileContract).toContain(".pc-upload-progress__bar { display: block; width: 100%; height: 4px;");
        expect(mobileContract).toContain(
            ".pc-media-thumbnail__overlay { position: absolute; inset: auto 0 0; z-index: 1; padding: var(--app-space-3, var(--space-3, 12px)); color: var(--app-text-inverse, #ffffff); background: linear-gradient(to top, rgba(0, 0, 0, 0.68), transparent);",
        );
        expect(mobileContract).not.toContain(".pc-search-field:hover:not(.is-disabled)");
        expect(mobileContract).not.toContain("box-shadow: inset 3px 0 0 var(--app-action-primary-bg");
    });

    test("retains Brand V2 refinements and new component accessibility on desktop", async () => {
        const source = await Bun.file(new URL("../src/components/ui/pc/pc-ui.css", import.meta.url)).text();
        const brandDesktop = section(source, "/* Brand V2 visual refinements are desktop-only.", "@keyframes pc-status-pulse");

        expect(brandDesktop).toContain("@media (min-width: 1024px)");
        expect(brandDesktop).toContain(".pc-search-field:hover:not(.is-disabled)");
        expect(brandDesktop).toContain(".pc-status-badge--running .pc-status-badge__dot");
        expect(brandDesktop).toContain(".pc-file-dropzone:hover:not(.is-disabled) .pc-file-dropzone__icon");
        expect(brandDesktop).toContain(".pc-media-thumbnail__overlay");
        expect(source).not.toContain(".pc-empty-state");
        expect(source).toContain(".pc-media-thumbnail--interactive:hover");
        expect(source).toContain("@media (prefers-reduced-motion: reduce)");
    });
});
