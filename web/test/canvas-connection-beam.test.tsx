import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { activeConnectionPath, CanvasConnectionBeam, ConnectionPath } from "../src/components/canvas/canvas-connections";
import { CanvasConnectionDrafts } from "../src/components/canvas/canvas-connection-drafts";
import { CANVAS_CONNECTION_STROKE_WIDTH, canvasThemes } from "../src/lib/canvas-theme";
import { CanvasNodeType } from "../src/types/canvas";
import { readFileSync } from "node:fs";
import { createRef } from "react";

const from = { id: "from", title: "来源", type: CanvasNodeType.Text, position: { x: 0, y: 0 }, width: 200, height: 100 };
const to = { ...from, id: "to", position: { x: 500, y: 200 } };
const connection = { id: "edge", fromNodeId: from.id, toNodeId: to.id };

function render(active: boolean, hideVisual = false) {
    return renderToStaticMarkup(<ConnectionPath connection={connection} from={from} to={to} active={active} hideVisual={hideVisual} visualMode="hover-only" onSelect={() => {}} />);
}

test("focusing a node displays beams even without hovering the connection", () => {
    expect(render(true)).toContain("data-connection-beam");
    expect(render(false)).not.toContain("data-connection-beam");
});

test("dragging hides static beams while preserving the connection hit target", () => {
    const markup = render(true, true);
    expect(markup).not.toContain("data-connection-beam");
    expect(markup).toContain('data-connection-id="edge"');
    expect(markup).toContain('stroke-width="16"');
});

test("both themes use neutral gray droplets with zoom-compensated widths", () => {
    for (const theme of [canvasThemes.light, canvasThemes.dark]) {
        const rgb = theme.connection.beam.match(/[a-f0-9]{2}/gi)!;
        expect(new Set(rgb).size).toBe(1);
        const markup = renderToStaticMarkup(<CanvasConnectionBeam pathD="M 0 0 C 100 0 100 200 200 200" color={theme.connection.beam} contrast={theme.connection.beamContrast} />);
        expect(markup).toContain(`stroke="${theme.connection.beam}"`);
        expect(markup).toContain("pointer-events:none");
        expect(markup).toContain(`stroke-width:calc(${theme.connection.beamContrast === "strong" ? 2.65 : 2.1}px / var(--canvas-committed-scale, 1))`);
        expect(markup).not.toMatch(/filter=|blur\(/);
    }
});

for (const theme of [canvasThemes.light, canvasThemes.dark]) test(`${theme.connection.beamContrast} droplets share the same leading edge and thicken from tail to head`, () => {
    const markup = renderToStaticMarkup(<CanvasConnectionBeam pathD="M 0 0 L 300 0" color={theme.connection.beam} contrast={theme.connection.beamContrast} />);
    const layers = [...markup.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)" stroke-dashoffset="(-?[\d.]+)"/g)];
    expect(layers).toHaveLength(8);
    for (const [, length, gap, offset] of layers) {
        expect(Number(length) + Number(gap)).toBe(100);
        expect(Number(length) - Number(offset)).toBe(36);
    }
    const widths = [...markup.matchAll(/stroke-width="([\d.]+)"/g)].map((match) => Number(match[1]));
    const opacities = [...markup.matchAll(/stroke-opacity="([\d.]+)"/g)].map((match) => Number(match[1]));
    expect(widths[widths.length - 1]).toBeGreaterThan(widths[0] * 4);
    expect(widths[widths.length - 1]).toBeLessThanOrEqual(2.65);
    for (let index = 1; index < widths.length; index++) {
        expect(widths[index]).toBeGreaterThan(widths[index - 1]);
        expect(widths[index] - widths[index - 1]).toBeLessThanOrEqual(0.31);
        expect(opacities[index]).toBeGreaterThan(opacities[index - 1]);
    }
    expect(markup).toContain("--canvas-beam-offset:-28px");
    expect(markup).toContain('stroke-linecap="round"');
});

test("light uses a legible tail and solid leading edge while dark keeps every existing layer", () => {
    const layers = (theme: typeof canvasThemes.light | typeof canvasThemes.dark) => {
        const markup = renderToStaticMarkup(<CanvasConnectionBeam pathD="M 0 0 L 300 0" color={theme.connection.beam} contrast={theme.connection.beamContrast} />);
        return { widths: [...markup.matchAll(/stroke-width="([\d.]+)"/g)].map(match => Number(match[1])), opacities: [...markup.matchAll(/stroke-opacity="([\d.]+)"/g)].map(match => Number(match[1])) };
    };
    const light = layers(canvasThemes.light), dark = layers(canvasThemes.dark);
    expect(light.widths).toEqual([0.65, 0.9, 1.2, 1.5, 1.75, 2.05, 2.35, 2.65]);
    expect(light.opacities).toEqual([0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.84, 0.94]);
    expect(dark.widths).toEqual([0.35, 0.6, 0.9, 1.2, CANVAS_CONNECTION_STROKE_WIDTH, 1.65, 1.9, 2.1]);
    expect(dark.opacities).toEqual(Array.from({ length: 8 }, (_, index) => 0.14 + index * 0.07));
    expect(canvasThemes.light.connection.stroke).toBe("#a3a3a3");
    expect(canvasThemes.dark.connection.beam).toBe("#e5e5e5");
});

test("connection drafts use the same light profile without changing their curve or dark presentation", () => {
    const mouseWorld = { x: 500, y: 200 };
    const handle = { nodeId: from.id, handleType: "source" as const };
    const expectedPath = activeConnectionPath(from, handle, mouseWorld);
    for (const theme of [canvasThemes.light, canvasThemes.dark]) {
        const markup = renderToStaticMarkup(<CanvasConnectionDrafts containerRef={createRef<HTMLDivElement>()} viewport={{ x: 0, y: 0, k: 2 }} theme={theme} connectingParams={handle} batchConnectionPreview={null} mouseWorld={mouseWorld} nodeById={new Map([[from.id, from]])} scriptScrollTopById={{}} />);
        expect(markup).toContain(`d="${expectedPath}"`);
        expect(markup).toContain(`stroke-opacity="${theme.connection.beamContrast === "strong" ? 0.88 : 0.72}"`);
        expect(markup).toContain(`stroke="${theme.connection.beam}"`);
        expect(markup).toContain("data-connection-beam");
        expect(markup).toContain('vector-effect="non-scaling-stroke"');
    }
});

test("all beam consumers pass the theme profile and motion remains in the existing CSS path", () => {
    for (const file of ["../src/components/canvas/canvas-connections.tsx", "../src/components/canvas/canvas-connection-drafts.tsx", "../src/pages/canvas/canvas-project-world-layers.tsx"]) {
        const source = readFileSync(new URL(file, import.meta.url), "utf8");
        const calls = source.match(/<CanvasConnectionBeam\b[^>]+\/>/g) || [];
        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) expect(call).toMatch(/contrast=\{(?:props\.)?theme.connection.beamContrast\}/);
    }
    const css = readFileSync(new URL("../src/styles/globals.css", import.meta.url), "utf8");
    expect(css).toContain("animation: canvas-connection-comet 1.5s var(--motion-ease-linear) infinite;");
    expect(css).toContain('html[data-theme-switching="true"] :where(.canvas-node-shell, .aceternity-comet-card, .aceternity-floating-panel, .canvas-connection-comet, .canvas-connection-draft)');
    expect(css).toContain('[data-canvas-viewport-interacting="true"] :where(.canvas-connection-comet, .canvas-connection-draft)');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
});
