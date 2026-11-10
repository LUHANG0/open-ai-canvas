import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("Agent chat composer exposes the same thinking control as settings", () => {
    const parts = readFileSync(new URL("../src/components/canvas/canvas-cloud-agent-panel-parts.tsx", import.meta.url), "utf8");
    const composer = parts.slice(parts.indexOf("export function ComposerControls("), parts.indexOf("export function ApprovalCard("));
    expect(composer).toContain("<ThinkingLevelSlider");
    expect(composer).toContain("onChange={onReasoningModeChange}");
    expect(composer).toContain('className="agent-thinking-popover"');
    expect(composer).toContain('className="agent-thinking-trigger"');
    expect(composer).toContain("aria-expanded={thinkingOpen}");
    expect(composer).not.toContain('className="agent-composer-thinking"');
    const panel = readFileSync(new URL("../src/components/canvas/canvas-cloud-agent-panel.tsx", import.meta.url), "utf8");
    const wiring = panel.slice(panel.indexOf("<ComposerControls"));
    expect(wiring).toContain("reasoningMode={reasoningMode}");
    expect(wiring).toContain("onReasoningModeChange={setReasoningMode}");
});
