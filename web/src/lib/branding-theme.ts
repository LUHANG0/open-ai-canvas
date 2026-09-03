import type { ThemeConfig } from "antd";

export const DEFAULT_BRAND_PRIMARY = "#8B7CF6";

const DEFAULT_BRAND_PALETTE = {
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

export type BrandPalette = Record<keyof typeof DEFAULT_BRAND_PALETTE, string>;

export function normalizeBrandPrimary(value: string) {
    const normalized = value.trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : DEFAULT_BRAND_PRIMARY;
}
export function createBrandPalette(primaryColor: string): BrandPalette {
    const primary = normalizeBrandPrimary(primaryColor);
    if (primary === DEFAULT_BRAND_PRIMARY) return { ...DEFAULT_BRAND_PALETTE };
    const rgb = hexToRGB(primary);
    return {
        50: mixRGB(rgb, { r: 255, g: 255, b: 255 }, 0.92),
        100: mixRGB(rgb, { r: 255, g: 255, b: 255 }, 0.84),
        200: mixRGB(rgb, { r: 255, g: 255, b: 255 }, 0.7),
        300: mixRGB(rgb, { r: 255, g: 255, b: 255 }, 0.5),
        400: mixRGB(rgb, { r: 255, g: 255, b: 255 }, 0.25),
        500: primary.toLowerCase(),
        600: mixRGB(rgb, { r: 0, g: 0, b: 0 }, 0.1),
        700: mixRGB(rgb, { r: 0, g: 0, b: 0 }, 0.22),
        800: mixRGB(rgb, { r: 0, g: 0, b: 0 }, 0.35),
        900: mixRGB(rgb, { r: 0, g: 0, b: 0 }, 0.5),
    };
}

export function applyBrandPalette(primaryColor: string) {
    const palette = createBrandPalette(primaryColor);
    const root = document.documentElement;
    for (const [tone, value] of Object.entries(palette)) root.style.setProperty(`--app-brand-${tone}`, value);
    const primaryRGB = hexToRGB(palette[500]);
    root.style.setProperty("--app-brand-rgb", `${primaryRGB.r} ${primaryRGB.g} ${primaryRGB.b}`);
    root.style.setProperty("--app-brand-on-500", readableForeground(palette[500]));
    root.style.setProperty("--app-brand-on-700", readableForeground(palette[700]));
    return palette;
}

export function withBrandingAntTheme(base: ThemeConfig, primaryColor: string, dark: boolean): ThemeConfig {
    const palette = createBrandPalette(primaryColor);
    const primary = dark ? palette[500] : palette[700];
    const hover = dark ? palette[400] : palette[600];
    const active = dark ? palette[600] : palette[800];
    const foreground = readableForeground(primary);
    const selection = alpha(palette[500], dark ? 0.18 : 0.11);
    const selectionHover = alpha(palette[500], dark ? 0.24 : 0.16);

    return {
        ...base,
        token: {
            ...base.token,
            colorPrimary: primary,
            colorPrimaryHover: hover,
            colorPrimaryActive: active,
            colorPrimaryBg: selection,
            colorPrimaryBgHover: selectionHover,
            colorLink: primary,
            colorLinkHover: hover,
            colorLinkActive: active,
            colorTextLightSolid: foreground,
        },
        components: {
            ...base.components,
            Button: { ...base.components?.Button, colorPrimary: primary, colorPrimaryHover: hover, colorPrimaryActive: active, primaryColor: foreground },
            Switch: { ...base.components?.Switch, colorPrimary: primary, colorPrimaryActive: active, colorPrimaryHover: hover },
            Checkbox: { ...base.components?.Checkbox, colorPrimary: primary, colorPrimaryActive: active, colorPrimaryHover: hover },
            Radio: {
                ...base.components?.Radio,
                colorPrimary: primary,
                colorPrimaryActive: active,
                colorPrimaryHover: hover,
                buttonSolidCheckedBg: primary,
                buttonSolidCheckedHoverBg: hover,
                buttonSolidCheckedActiveBg: active,
                buttonSolidCheckedColor: foreground,
            },
            Pagination: { ...base.components?.Pagination, itemActiveBg: primary, itemActiveColor: foreground, itemActiveColorHover: foreground },
            Segmented: { ...base.components?.Segmented, itemSelectedBg: selection, itemSelectedColor: dark ? palette[200] : palette[800] },
        },
    };
}

function hexToRGB(value: string) {
    const normalized = normalizeBrandPrimary(value).slice(1);
    return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16),
    };
}

function mixRGB(source: { r: number; g: number; b: number }, target: { r: number; g: number; b: number }, amount: number) {
    return rgbToHex({
        r: Math.round(source.r + (target.r - source.r) * amount),
        g: Math.round(source.g + (target.g - source.g) * amount),
        b: Math.round(source.b + (target.b - source.b) * amount),
    });
}

function rgbToHex(rgb: { r: number; g: number; b: number }) {
    return `#${[rgb.r, rgb.g, rgb.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function alpha(value: string, opacity: number) {
    const rgb = hexToRGB(value);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

function readableForeground(value: string) {
    const { r, g, b } = hexToRGB(value);
    const luminance = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    const relative = luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722;
    const whiteContrast = 1.05 / (relative + 0.05);
    const blackContrast = (relative + 0.05) / 0.05;
    return whiteContrast >= blackContrast ? "#ffffff" : "#11131d";
}
