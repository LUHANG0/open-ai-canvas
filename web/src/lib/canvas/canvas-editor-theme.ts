import { APP_THEME_COLORS } from "@/lib/app-theme";
import { withBrandingAntTheme } from "@/lib/branding-theme";
import { canvasThemes, type CanvasColorTheme, type CanvasTheme } from "@/lib/canvas-theme";

/** DOM 与 Leafer 共用可解析颜色；只在编辑器主题或品牌变更时派生。 */
export function createCanvasEditorTheme(mode: CanvasColorTheme, primaryColor: string): CanvasTheme {
    const base = canvasThemes[mode];
    const colors = APP_THEME_COLORS[mode];
    const brand = withBrandingAntTheme({}, primaryColor, mode === "dark").token!;
    const accent = brand.colorPrimary!;
    const selection = brand.colorPrimaryBg!;
    return {
        ...base,
        canvas: { ...base.canvas, background: colors.background.canvas, selectionFill: selection, selectionStroke: accent },
        node: {
            ...base.node,
            fill: colors.surface.one,
            panel: colors.surface.overlay,
            label: colors.text.secondary,
            text: colors.text.primary,
            muted: colors.text.secondary,
            faint: colors.text.muted,
            placeholder: colors.text.muted,
            stroke: colors.border.default,
            edge: colors.border.strong,
            activeStroke: accent,
        },
        frame: { ...base.frame, stroke: colors.border.strong, activeFill: selection, activeStroke: accent, preview: colors.surface.overlay },
        toolbar: { panel: colors.surface.overlay, border: colors.border.default, item: colors.text.secondary, itemHover: colors.action.secondary.hover, activeBg: selection, activeText: accent },
        spatial: { ...base.spatial, surface: colors.surface.two, elevated: colors.surface.overlay, dropzone: colors.surface.two },
        accent: { primary: colors.action.primary.bg, primarySoft: selection, onPrimary: colors.action.primary.fg, danger: colors.status.error.fg },
    };
}
