import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

/**
 * PC 用户端的 TypeScript Foundation 映射。
 * CSS 同名值位于 styles/pc-user-foundation.css；AntD 只从此对象派生，
 * 避免组件配置再分散维护颜色、尺寸、圆角和动效字面值。
 */
export const APP_THEME_FOUNDATION = {
    fontFamily: '"SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    fontSize: {
        label: 12,
        control: 13,
        body: 14,
        section: 16,
        sectionLarge: 18,
        pageTitle: 24,
    },
    controlHeight: {
        small: 30,
        default: 36,
        large: 42,
    },
    radius: {
        controlSmall: 6,
        control: 8,
        surfaceSmall: 10,
        surface: 12,
    },
    motion: {
        fast: "0.12s",
        base: "0.18s",
        slow: "0.24s",
    },
    layout: {
        sidebar: 224,
        sidebarCollapsed: 64,
        topbar: 52,
        shellGutter: 10,
        pageGutter: 24,
        pageMaxWidth: 1440,
    },
} as const;

/**
 * 主操作、普通选中、Checkbox/Radio 和 Switch 是不同交互语义，
 * 因此必须分别维护成对的背景色与前景色。
 */
export const APP_THEME_COLORS = {
    light: {
        background: {
            canvas: "#f3f4f6",
            page: "#f3f4f6",
        },
        surface: {
            one: "#ffffff",
            two: "#f7f8fa",
            three: "#eceff3",
            overlay: "#ffffff",
            subtle: "rgba(17, 17, 17, 0.035)",
        },
        text: {
            primary: "#171717",
            secondary: "rgba(23, 23, 23, 0.72)",
            muted: "rgba(23, 23, 23, 0.52)",
            inverse: "#ffffff",
        },
        border: {
            subtle: "rgba(17, 24, 39, 0.09)",
            default: "rgba(17, 24, 39, 0.14)",
            strong: "rgba(17, 24, 39, 0.22)",
            interactive: "rgba(17, 17, 17, 0.18)",
        },
        action: {
            primary: {
                bg: "#171717",
                hover: "#303030",
                active: "#404040",
                fg: "#ffffff",
            },
            secondary: {
                bg: "transparent",
                hover: "rgba(17, 17, 17, 0.05)",
                active: "rgba(17, 17, 17, 0.09)",
                fg: "#171717",
            },
            check: {
                bg: "#171717",
                hover: "#303030",
                active: "#404040",
                fg: "#ffffff",
            },
            switchChecked: {
                bg: "#171717",
                hover: "#303030",
                handle: "#ffffff",
            },
        },
        selection: {
            bg: "rgba(17, 17, 17, 0.09)",
            hover: "rgba(17, 17, 17, 0.13)",
            active: "rgba(17, 17, 17, 0.16)",
            fg: "#171717",
        },
        control: {
            bg: "#ffffff",
            border: "rgba(17, 17, 17, 0.18)",
            disabledBg: "rgba(17, 17, 17, 0.05)",
            disabledFg: "rgba(17, 17, 17, 0.36)",
            focus: "rgba(17, 17, 17, 0.24)",
            switchOffBg: "rgba(17, 17, 17, 0.22)",
            switchOffHover: "rgba(17, 17, 17, 0.3)",
            switchOffHandle: "#ffffff",
        },
        status: {
            info: {
                bg: "rgba(63, 63, 70, 0.07)",
                hover: "rgba(63, 63, 70, 0.1)",
                border: "rgba(63, 63, 70, 0.18)",
                fg: "#3f3f46",
            },
            success: {
                bg: "rgba(21, 128, 61, 0.09)",
                border: "rgba(21, 128, 61, 0.24)",
                fg: "#15803d",
            },
            warning: {
                bg: "rgba(180, 83, 9, 0.1)",
                border: "rgba(180, 83, 9, 0.26)",
                fg: "#b45309",
            },
            error: {
                bg: "rgba(220, 38, 38, 0.09)",
                border: "rgba(220, 38, 38, 0.24)",
                fg: "#dc2626",
            },
            running: {
                bg: "rgba(37, 99, 235, 0.09)",
                border: "rgba(37, 99, 235, 0.24)",
                fg: "#2563eb",
            },
        },
        menu: {
            bg: "#f5f5f5",
            text: "#171717",
            activeBg: "rgba(17, 17, 17, 0.035)",
            selectedBg: "rgba(17, 17, 17, 0.065)",
        },
        table: {
            headerText: "rgba(23, 23, 23, 0.58)",
            rowHover: "rgba(17, 17, 17, 0.025)",
            selectedBg: "rgba(17, 17, 17, 0.05)",
            selectedHover: "rgba(17, 17, 17, 0.08)",
        },
        shadow: {
            overlay: "0 22px 64px rgba(15, 23, 42, 0.14)",
        },
        skeleton: {
            from: "rgba(15, 23, 42, 0.055)",
            to: "rgba(15, 23, 42, 0.1)",
        },
    },
    dark: {
        background: {
            canvas: "#111315",
            page: "#111315",
        },
        surface: {
            one: "#1a1d20",
            two: "#22262a",
            three: "#2b3035",
            overlay: "#1f1f20",
            subtle: "rgba(255, 255, 255, 0.055)",
        },
        text: {
            primary: "#f5f5f5",
            secondary: "rgba(245, 245, 245, 0.74)",
            muted: "rgba(245, 245, 245, 0.54)",
            inverse: "#171717",
        },
        border: {
            subtle: "rgba(255, 255, 255, 0.09)",
            default: "rgba(255, 255, 255, 0.16)",
            strong: "rgba(255, 255, 255, 0.24)",
            interactive: "rgba(255, 255, 255, 0.18)",
        },
        action: {
            primary: {
                bg: "#f5f5f5",
                hover: "#ffffff",
                active: "#e5e5e5",
                fg: "#171717",
            },
            secondary: {
                bg: "transparent",
                hover: "rgba(255, 255, 255, 0.07)",
                active: "rgba(255, 255, 255, 0.12)",
                fg: "#f5f5f5",
            },
            check: {
                bg: "#f5f5f5",
                hover: "#ffffff",
                active: "#e5e5e5",
                fg: "#131313",
            },
            switchChecked: {
                bg: "#f5f5f5",
                hover: "#ffffff",
                handle: "#131313",
            },
        },
        selection: {
            bg: "rgba(255, 255, 255, 0.12)",
            hover: "rgba(255, 255, 255, 0.16)",
            active: "rgba(255, 255, 255, 0.2)",
            fg: "#f5f5f5",
        },
        control: {
            bg: "rgba(255, 255, 255, 0.035)",
            border: "rgba(255, 255, 255, 0.24)",
            disabledBg: "rgba(255, 255, 255, 0.06)",
            disabledFg: "rgba(255, 255, 255, 0.38)",
            focus: "rgba(255, 255, 255, 0.28)",
            switchOffBg: "rgba(255, 255, 255, 0.22)",
            switchOffHover: "rgba(255, 255, 255, 0.3)",
            switchOffHandle: "#f5f5f5",
        },
        status: {
            info: {
                bg: "rgba(228, 228, 231, 0.09)",
                hover: "rgba(228, 228, 231, 0.12)",
                border: "rgba(228, 228, 231, 0.2)",
                fg: "#e4e4e7",
            },
            success: {
                bg: "rgba(74, 222, 128, 0.1)",
                border: "rgba(74, 222, 128, 0.26)",
                fg: "#4ade80",
            },
            warning: {
                bg: "rgba(251, 191, 36, 0.11)",
                border: "rgba(251, 191, 36, 0.28)",
                fg: "#fbbf24",
            },
            error: {
                bg: "rgba(248, 113, 113, 0.1)",
                border: "rgba(248, 113, 113, 0.26)",
                fg: "#f87171",
            },
            running: {
                bg: "rgba(96, 165, 250, 0.11)",
                border: "rgba(96, 165, 250, 0.28)",
                fg: "#60a5fa",
            },
        },
        menu: {
            bg: "#262626",
            text: "#fafafa",
            activeBg: "rgba(255, 255, 255, 0.055)",
            selectedBg: "rgba(255, 255, 255, 0.09)",
        },
        table: {
            headerText: "rgba(250, 250, 250, 0.62)",
            rowHover: "rgba(255, 255, 255, 0.035)",
            selectedBg: "rgba(255, 255, 255, 0.08)",
            selectedHover: "rgba(255, 255, 255, 0.12)",
        },
        shadow: {
            overlay: "0 24px 72px rgba(0, 0, 0, 0.48)",
        },
        skeleton: {
            from: "rgba(255, 255, 255, 0.055)",
            to: "rgba(255, 255, 255, 0.11)",
        },
    },
} as const;

/**
 * Brand V2 primitives are intentionally separate from the frozen neutral
 * palette above. User-facing semantic colors may reference these values,
 * while Admin continues to derive its theme exclusively from APP_THEME_COLORS.
 */
export const PC_USER_BRAND_COLORS = {
    50: "#f5f3ff",
    100: "#ece9ff",
    200: "#dcd6ff",
    300: "#c4baff",
    400: "#a79bff",
    500: "#8b7cf6",
    600: "#6d5dfb",
    700: "#5b4bdb",
    800: "#4438a8",
    900: "#302779",
} as const;

export const PC_USER_AI_COLORS = {
    50: "#eafbfc",
    100: "#d0f4f6",
    400: "#5dd6df",
    500: "#1aa8b4",
    600: "#0e7f8c",
} as const;

/**
 * PC user-facing semantic palette for the "Lightframe Director Console".
 * Keep this object synchronized with the scoped variables in
 * styles/pc-user-foundation.css.
 */
export const PC_USER_THEME_COLORS = {
    light: {
        background: {
            canvas: "#eff1f7",
            page: "#f7f8fb",
        },
        surface: {
            one: "#ffffff",
            two: "#f3f5fa",
            three: "#e9ecf4",
            overlay: "#ffffff",
            subtle: "rgba(48, 55, 78, 0.04)",
        },
        text: {
            primary: "#181a26",
            secondary: "rgba(24, 26, 38, 0.72)",
            muted: "rgba(24, 26, 38, 0.52)",
            inverse: "#ffffff",
        },
        border: {
            subtle: "rgba(48, 55, 78, 0.1)",
            default: "rgba(48, 55, 78, 0.15)",
            strong: "rgba(48, 55, 78, 0.22)",
            interactive: "rgba(91, 75, 219, 0.38)",
        },
        action: {
            primary: {
                bg: PC_USER_BRAND_COLORS[700],
                hover: "#4e3fc6",
                active: PC_USER_BRAND_COLORS[800],
                fg: "#ffffff",
            },
            secondary: {
                bg: "transparent",
                hover: "rgba(91, 75, 219, 0.07)",
                active: "rgba(91, 75, 219, 0.12)",
                fg: "#181a26",
            },
            check: {
                bg: PC_USER_BRAND_COLORS[600],
                hover: PC_USER_BRAND_COLORS[700],
                active: PC_USER_BRAND_COLORS[800],
                fg: "#ffffff",
            },
            switchChecked: {
                bg: PC_USER_BRAND_COLORS[600],
                hover: PC_USER_BRAND_COLORS[700],
                handle: "#ffffff",
            },
        },
        selection: {
            bg: "rgba(91, 75, 219, 0.1)",
            hover: "rgba(91, 75, 219, 0.14)",
            active: "rgba(91, 75, 219, 0.18)",
            fg: PC_USER_BRAND_COLORS[800],
        },
        control: {
            bg: "#ffffff",
            border: "rgba(48, 55, 78, 0.18)",
            disabledBg: "rgba(48, 55, 78, 0.06)",
            disabledFg: "rgba(24, 26, 38, 0.36)",
            focus: "rgba(91, 75, 219, 0.26)",
            switchOffBg: "rgba(48, 55, 78, 0.22)",
            switchOffHover: "rgba(48, 55, 78, 0.3)",
            switchOffHandle: "#ffffff",
        },
        status: {
            info: {
                bg: "rgba(68, 56, 168, 0.07)",
                hover: "rgba(68, 56, 168, 0.11)",
                border: "rgba(68, 56, 168, 0.2)",
                fg: PC_USER_BRAND_COLORS[800],
            },
            success: {
                bg: "rgba(21, 128, 61, 0.09)",
                border: "rgba(21, 128, 61, 0.24)",
                fg: "#15803d",
            },
            warning: {
                bg: "rgba(180, 83, 9, 0.1)",
                border: "rgba(180, 83, 9, 0.26)",
                fg: "#b45309",
            },
            error: {
                bg: "rgba(220, 38, 38, 0.09)",
                border: "rgba(220, 38, 38, 0.24)",
                fg: "#dc2626",
            },
            running: {
                bg: "rgba(14, 127, 140, 0.1)",
                border: "rgba(14, 127, 140, 0.26)",
                fg: PC_USER_AI_COLORS[600],
            },
        },
        menu: {
            bg: "rgba(91, 75, 219, 0.1)",
            text: PC_USER_BRAND_COLORS[800],
            activeBg: "rgba(91, 75, 219, 0.1)",
            selectedBg: "rgba(91, 75, 219, 0.14)",
        },
        table: {
            headerText: "rgba(24, 26, 38, 0.58)",
            rowHover: "rgba(91, 75, 219, 0.035)",
            selectedBg: "rgba(91, 75, 219, 0.08)",
            selectedHover: "rgba(91, 75, 219, 0.12)",
        },
        shadow: {
            overlay: "0 24px 68px rgba(35, 38, 57, 0.16)",
        },
        skeleton: {
            from: "rgba(48, 55, 78, 0.055)",
            to: "rgba(48, 55, 78, 0.11)",
        },
    },
    dark: {
        background: {
            canvas: "#0a0c13",
            page: "#0e1018",
        },
        surface: {
            one: "#151824",
            two: "#1b1f2d",
            three: "#232838",
            overlay: "#1b1f2d",
            subtle: "rgba(255, 255, 255, 0.055)",
        },
        text: {
            primary: "#f5f5fb",
            secondary: "rgba(245, 245, 251, 0.74)",
            muted: "rgba(245, 245, 251, 0.54)",
            inverse: "#11131d",
        },
        border: {
            subtle: "rgba(226, 229, 255, 0.1)",
            default: "rgba(226, 229, 255, 0.16)",
            strong: "rgba(226, 229, 255, 0.24)",
            interactive: "rgba(167, 155, 255, 0.46)",
        },
        action: {
            primary: {
                bg: PC_USER_BRAND_COLORS[500],
                hover: "#9b8eff",
                active: "#8172ef",
                fg: "#11131d",
            },
            secondary: {
                bg: "transparent",
                hover: "rgba(139, 124, 246, 0.1)",
                active: "rgba(139, 124, 246, 0.16)",
                fg: "#f5f5fb",
            },
            check: {
                bg: PC_USER_BRAND_COLORS[500],
                hover: "#9b8eff",
                active: "#8172ef",
                fg: "#11131d",
            },
            switchChecked: {
                bg: PC_USER_BRAND_COLORS[500],
                hover: "#9b8eff",
                handle: "#11131d",
            },
        },
        selection: {
            bg: "rgba(139, 124, 246, 0.16)",
            hover: "rgba(139, 124, 246, 0.22)",
            active: "rgba(139, 124, 246, 0.28)",
            fg: "#c7c0ff",
        },
        control: {
            bg: "rgba(255, 255, 255, 0.04)",
            border: "rgba(226, 229, 255, 0.24)",
            disabledBg: "rgba(255, 255, 255, 0.06)",
            disabledFg: "rgba(245, 245, 251, 0.38)",
            focus: "rgba(167, 155, 255, 0.34)",
            switchOffBg: "rgba(226, 229, 255, 0.22)",
            switchOffHover: "rgba(226, 229, 255, 0.3)",
            switchOffHandle: "#f5f5fb",
        },
        status: {
            info: {
                bg: "rgba(199, 192, 255, 0.1)",
                hover: "rgba(199, 192, 255, 0.14)",
                border: "rgba(199, 192, 255, 0.22)",
                fg: "#c7c0ff",
            },
            success: {
                bg: "rgba(74, 222, 128, 0.1)",
                border: "rgba(74, 222, 128, 0.26)",
                fg: "#4ade80",
            },
            warning: {
                bg: "rgba(251, 191, 36, 0.11)",
                border: "rgba(251, 191, 36, 0.28)",
                fg: "#fbbf24",
            },
            error: {
                bg: "rgba(248, 113, 113, 0.1)",
                border: "rgba(248, 113, 113, 0.26)",
                fg: "#f87171",
            },
            running: {
                bg: "rgba(93, 214, 223, 0.12)",
                border: "rgba(93, 214, 223, 0.28)",
                fg: PC_USER_AI_COLORS[400],
            },
        },
        menu: {
            bg: "rgba(139, 124, 246, 0.16)",
            text: "#c7c0ff",
            activeBg: "rgba(139, 124, 246, 0.16)",
            selectedBg: "rgba(139, 124, 246, 0.22)",
        },
        table: {
            headerText: "rgba(245, 245, 251, 0.62)",
            rowHover: "rgba(139, 124, 246, 0.055)",
            selectedBg: "rgba(139, 124, 246, 0.12)",
            selectedHover: "rgba(139, 124, 246, 0.18)",
        },
        shadow: {
            overlay: "0 26px 76px rgba(0, 0, 0, 0.56)",
        },
        skeleton: {
            from: "rgba(226, 229, 255, 0.06)",
            to: "rgba(226, 229, 255, 0.13)",
        },
    },
} as const;

type AppThemeMode = keyof typeof APP_THEME_COLORS;

const LEGACY_INFO = {
    light: {
        bg: "rgba(17, 17, 17, 0.045)",
        hover: "rgba(17, 17, 17, 0.07)",
        border: "rgba(17, 17, 17, 0.14)",
        fg: "#3f3f46",
        hoverFg: "#27272a",
        activeFg: "#52525b",
        text: "#27272a",
        textHover: "#27272a",
        textActive: "#3f3f46",
    },
    dark: {
        bg: "rgba(255, 255, 255, 0.08)",
        hover: "rgba(255, 255, 255, 0.11)",
        border: "rgba(255, 255, 255, 0.2)",
        fg: "#e4e4e7",
        hoverFg: "#ffffff",
        activeFg: "#d4d4d8",
        text: "#f4f4f5",
        textHover: "#fafafa",
        textActive: "#e4e4e7",
    },
} as const;

function createAntThemeConfig(dark: boolean, pcUserSemantics: boolean, pcBrandV2: boolean = pcUserSemantics): ThemeConfig {
    const mode: AppThemeMode = dark ? "dark" : "light";
    const color = pcUserSemantics && pcBrandV2 ? PC_USER_THEME_COLORS[mode] : APP_THEME_COLORS[mode];
    const darkColor = pcUserSemantics && pcBrandV2 ? PC_USER_THEME_COLORS.dark : APP_THEME_COLORS.dark;
    const info = pcUserSemantics
        ? {
              ...color.status.info,
              hoverFg: color.status.info.fg,
              activeFg: color.status.info.fg,
              text: color.status.info.fg,
              textHover: color.status.info.fg,
              textActive: color.status.info.fg,
          }
        : LEGACY_INFO[mode];
    const controlFocus = pcUserSemantics ? color.control.focus : dark ? "rgba(255, 255, 255, 0.24)" : "rgba(17, 17, 17, 0.24)";
    const focusShadow = pcUserSemantics ? `0 0 0 2px ${controlFocus}` : "none";
    const secondaryHover = pcUserSemantics ? color.action.secondary.hover : color.selection.bg;
    const secondaryActive = pcUserSemantics ? color.action.secondary.active : color.selection.hover;

    const semanticToken = pcUserSemantics
        ? {
              colorBgBase: color.background.page,
              colorBgLayout: color.background.canvas,
              colorBgContainer: color.surface.one,
              colorBgContainerDisabled: color.control.disabledBg,
              colorBgElevated: color.surface.overlay,
              colorFillSecondary: color.surface.two,
              colorFillTertiary: color.surface.three,
              colorText: color.text.primary,
              colorTextSecondary: color.text.secondary,
              colorTextTertiary: color.text.muted,
              colorTextDisabled: color.control.disabledFg,
              colorBorder: color.border.default,
              colorBorderSecondary: color.border.subtle,
              colorSuccess: color.status.success.fg,
              colorSuccessBg: color.status.success.bg,
              colorSuccessBorder: color.status.success.border,
              colorSuccessText: color.status.success.fg,
              colorWarning: color.status.warning.fg,
              colorWarningBg: color.status.warning.bg,
              colorWarningBorder: color.status.warning.border,
              colorWarningText: color.status.warning.fg,
              colorError: color.status.error.fg,
              colorErrorBg: color.status.error.bg,
              colorErrorBorder: color.status.error.border,
              colorErrorText: color.status.error.fg,
              fontFamily: APP_THEME_FOUNDATION.fontFamily,
              borderRadiusXS: APP_THEME_FOUNDATION.radius.controlSmall,
              borderRadiusSM: APP_THEME_FOUNDATION.radius.controlSmall,
              borderRadius: APP_THEME_FOUNDATION.radius.control,
              borderRadiusLG: APP_THEME_FOUNDATION.radius.surfaceSmall,
              borderRadiusOuter: APP_THEME_FOUNDATION.radius.surface,
          }
        : {};

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: color.action.primary.bg,
            colorPrimaryHover: color.action.primary.hover,
            colorPrimaryActive: color.action.primary.active,
            colorPrimaryBg: color.selection.bg,
            colorPrimaryBgHover: color.selection.hover,
            colorInfoBg: info.bg,
            colorInfoBgHover: info.hover,
            colorInfoBorder: info.border,
            colorInfoBorderHover: info.border,
            colorInfo: info.fg,
            colorInfoHover: info.hoverFg,
            colorInfoActive: info.activeFg,
            colorInfoTextHover: info.textHover,
            colorInfoText: info.text,
            colorInfoTextActive: info.textActive,
            colorLink: color.action.primary.bg,
            colorLinkHover: color.action.primary.hover,
            colorLinkActive: color.action.primary.active,
            colorTextLightSolid: color.action.primary.fg,
            colorBgElevated: color.surface.overlay,
            colorBorderSecondary: dark ? "rgba(255, 255, 255, 0.1)" : "rgba(17, 17, 17, 0.09)",
            boxShadowSecondary: color.shadow.overlay,
            borderRadius: 6,
            borderRadiusLG: 8,
            borderRadiusSM: 5,
            controlHeight: APP_THEME_FOUNDATION.controlHeight.default,
            controlHeightLG: APP_THEME_FOUNDATION.controlHeight.large,
            controlHeightSM: APP_THEME_FOUNDATION.controlHeight.small,
            fontSize: APP_THEME_FOUNDATION.fontSize.control,
            fontSizeSM: APP_THEME_FOUNDATION.fontSize.label,
            motionDurationFast: APP_THEME_FOUNDATION.motion.fast,
            motionDurationMid: APP_THEME_FOUNDATION.motion.base,
            motionDurationSlow: APP_THEME_FOUNDATION.motion.slow,
            ...semanticToken,
        },
        components: {
            Button: {
                primaryShadow: "none",
                fontWeight: 500,
                paddingInline: 14,
                paddingInlineLG: 16,
                paddingInlineSM: 10,
                colorPrimary: color.action.primary.bg,
                colorPrimaryHover: color.action.primary.hover,
                colorPrimaryActive: color.action.primary.active,
                primaryColor: color.action.primary.fg,
                defaultBg: color.action.secondary.bg,
                defaultColor: color.action.secondary.fg,
                defaultBorderColor: color.control.border,
                defaultHoverBg: secondaryHover,
                defaultHoverColor: color.action.secondary.fg,
                defaultHoverBorderColor: color.control.border,
                defaultActiveBg: secondaryActive,
                defaultActiveColor: color.action.secondary.fg,
                defaultActiveBorderColor: color.control.border,
            },
            Input: {
                paddingInline: 11,
                activeBg: color.surface.overlay,
                hoverBg: color.surface.overlay,
                activeBorderColor: color.border.interactive,
                hoverBorderColor: color.border.interactive,
                activeShadow: focusShadow,
            },
            InputNumber: {
                activeBg: color.surface.overlay,
                hoverBg: color.surface.overlay,
                activeBorderColor: color.border.interactive,
                hoverBorderColor: color.border.interactive,
                activeShadow: focusShadow,
            },
            Switch: {
                handleBg: color.control.switchOffHandle,
                handleShadow: dark ? "0 1px 4px rgba(0, 0, 0, 0.42)" : "0 1px 2px rgba(0, 0, 0, 0.2)",
                colorPrimary: color.action.switchChecked.bg,
                colorPrimaryActive: color.action.switchChecked.bg,
                colorPrimaryHover: color.action.switchChecked.hover,
                colorTextQuaternary: color.control.switchOffBg,
                colorTextTertiary: color.control.switchOffHover,
                controlOutline: controlFocus,
            },
            Checkbox: {
                colorBgContainer: color.control.bg,
                colorBgContainerDisabled: color.control.disabledBg,
                colorBorder: color.control.border,
                colorPrimary: color.action.check.bg,
                colorPrimaryActive: color.action.check.active,
                colorPrimaryHover: color.action.check.hover,
                controlOutline: controlFocus,
            },
            Radio: {
                radioSize: 16,
                dotSize: 6,
                buttonBg: color.control.bg,
                buttonCheckedBg: color.selection.bg,
                buttonCheckedBgDisabled: color.control.disabledBg,
                buttonCheckedColorDisabled: color.control.disabledFg,
                buttonSolidCheckedColor: color.action.check.fg,
                buttonSolidCheckedActiveBg: color.action.check.active,
                buttonSolidCheckedBg: color.action.check.bg,
                buttonSolidCheckedHoverBg: color.action.check.hover,
                colorBgContainer: color.control.bg,
                colorBgContainerDisabled: color.control.disabledBg,
                colorBorder: color.control.border,
                colorPrimary: color.action.check.bg,
                colorPrimaryActive: color.action.check.active,
                colorPrimaryHover: color.action.check.hover,
                controlOutline: controlFocus,
            },
            Menu: {
                itemHeight: pcUserSemantics ? APP_THEME_FOUNDATION.controlHeight.default : 40,
                itemMarginBlock: 2,
                itemActiveBg: color.menu.bg,
                itemHoverBg: color.menu.bg,
                itemSelectedBg: color.menu.bg,
                itemSelectedColor: color.menu.text,
                darkItemHoverBg: darkColor.menu.bg,
                darkItemSelectedBg: darkColor.menu.bg,
                darkItemSelectedColor: darkColor.menu.text,
            },
            Select: {
                selectorBg: color.surface.overlay,
                optionHeight: pcUserSemantics ? APP_THEME_FOUNDATION.controlHeight.default : 40,
                optionPadding: "8px 12px",
                multipleItemHeight: 26,
                activeBorderColor: color.border.interactive,
                hoverBorderColor: color.border.interactive,
                activeOutlineColor: "transparent",
                optionActiveBg: color.menu.activeBg,
                optionSelectedBg: color.menu.selectedBg,
                optionSelectedColor: color.menu.text,
            },
            Table: {
                headerBg: color.surface.subtle,
                headerColor: color.table.headerText,
                headerBorderRadius: 0,
                rowHoverBg: color.table.rowHover,
                borderColor: pcUserSemantics ? color.border.subtle : dark ? "rgba(255, 255, 255, 0.08)" : "rgba(17, 17, 17, 0.075)",
                cellPaddingBlockMD: 13,
                cellPaddingInlineMD: 14,
                rowSelectedBg: color.table.selectedBg,
                rowSelectedHoverBg: color.table.selectedHover,
            },
            Pagination: {
                itemBg: "transparent",
                itemLinkBg: "transparent",
                itemActiveBg: color.action.primary.bg,
                itemActiveColor: color.action.primary.fg,
                itemActiveColorHover: color.action.primary.fg,
            },
            Segmented: {
                trackBg: color.surface.subtle,
                trackPadding: 3,
                itemColor: color.control.disabledFg,
                itemHoverColor: color.selection.fg,
                itemHoverBg: color.selection.bg,
                itemActiveBg: color.selection.active,
                itemSelectedBg: color.selection.bg,
                itemSelectedColor: color.selection.fg,
            },
            Modal: {
                headerBg: "transparent",
                contentBg: color.surface.overlay,
                footerBg: "transparent",
                titleFontSize: APP_THEME_FOUNDATION.fontSize.section,
            },
            Form: {
                itemMarginBottom: 18,
                labelFontSize: APP_THEME_FOUNDATION.fontSize.label,
                verticalLabelPadding: "0 0 6px",
            },
            Dropdown: {
                paddingBlock: 6,
            },
            Skeleton: {
                gradientFromColor: color.skeleton.from,
                gradientToColor: color.skeleton.to,
            },
            Card: {
                headerBg: "transparent",
                headerFontSize: 15,
                bodyPadding: 18,
            },
        },
    };
}

export function getAntThemeConfig(dark: boolean, pcBrandV2 = true): ThemeConfig {
    return createAntThemeConfig(dark, true, pcBrandV2);
}

/**
 * Admin 使用原有基础主题和更高密度的控件节奏。这里不注入 PC 用户端新增的
 * 背景、文字、圆角和状态别名，避免本次重构间接改变 Admin 的现有合同。
 */
export function getAdminAntThemeConfig(dark: boolean): ThemeConfig {
    const base = createAntThemeConfig(dark, false);
    const mutedForeground = dark ? "rgba(250, 250, 250, 0.58)" : "rgba(23, 23, 23, 0.58)";

    return {
        ...base,
        token: {
            ...base.token,
            borderRadius: 6,
            borderRadiusLG: 8,
            colorBgContainer: "var(--color-surface)",
            colorBorder: "var(--color-border)",
            fontFamily: "var(--font-sans)",
            padding: 12,
            paddingSM: 8,
            fontSize: 13,
        },
        components: {
            ...base.components,
            Card: {
                ...base.components?.Card,
                boxShadow: "none",
                boxShadowTertiary: "none",
            },
            Drawer: {
                ...base.components?.Drawer,
                colorBgElevated: "var(--color-surface)",
            },
            Form: {
                ...base.components?.Form,
                itemMarginBottom: 16,
            },
            Menu: {
                ...base.components?.Menu,
                itemHeight: 34,
                itemSelectedBg: "transparent",
            },
            Table: {
                ...base.components?.Table,
                cellPaddingBlock: 8,
                cellPaddingBlockMD: 8,
                cellPaddingBlockSM: 6,
                cellPaddingInline: 12,
                cellPaddingInlineMD: 12,
                cellPaddingInlineSM: 8,
                headerBg: "transparent",
                headerColor: mutedForeground,
                headerSplitColor: "transparent",
                borderColor: "var(--color-border)",
            },
        },
    };
}
