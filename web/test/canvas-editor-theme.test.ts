import { describe, expect, test } from "bun:test";
import { APP_THEME_COLORS } from "../src/lib/app-theme";
import { withBrandingAntTheme } from "../src/lib/branding-theme";
import { canvasThemes } from "../src/lib/canvas-theme";
import { createCanvasEditorTheme } from "../src/lib/canvas/canvas-editor-theme";

describe("画布编辑器品牌映射", () => {
    for (const mode of ["light", "dark"] as const) {
        for (const primary of ["#8B7CF6", "#18A56B", "#FFFFFF", "#000000"]) {
            test(`${mode} ${primary} 与公共主题使用相同的表面、选区和主命令`, () => {
                const before = JSON.stringify(canvasThemes);
                const theme = createCanvasEditorTheme(mode, primary);
                const shared = APP_THEME_COLORS[mode];
                const brand = withBrandingAntTheme({}, primary, mode === "dark").token!;
                expect(theme.node.fill).toBe(shared.surface.one);
                expect(theme.toolbar.panel).toBe(shared.surface.overlay);
                expect(theme.node.activeStroke).toBe(brand.colorPrimary!);
                expect(theme.canvas.selectionFill).toBe(brand.colorPrimaryBg!);
                expect(theme.accent.primary).toBe(shared.action.primary.bg);
                expect(theme.accent.onPrimary).toBe(shared.action.primary.fg);
                expect(theme.timeline).toBe(canvasThemes[mode].timeline);
                expect(JSON.stringify(canvasThemes)).toBe(before);
                expect(JSON.stringify(theme)).not.toContain("var(");
            });
        }
    }
});
