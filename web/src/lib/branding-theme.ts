import type { ThemeConfig } from "antd";

export const DEFAULT_BRAND_PRIMARY = "#8B7CF6";

const DEFAULT_BRAND_PALETTE = {
    50: "#f5f3ff",
    100: "#ece9ff",
    200: "#dcd6ff",
    300: "#c4baff",
    400: "#b1a4ff",
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
    for (const mode of ["light", "dark"] as const) {
        const accent = brandAccent(palette, mode === "dark");
        const rgb = hexToRGB(accent);
        root.style.setProperty(`--app-brand-accent-${mode}`, accent);
        root.style.setProperty(`--app-brand-accent-rgb-${mode}`, `${rgb.r} ${rgb.g} ${rgb.b}`);
    }
    return palette;
}

export function withBrandingAntTheme(base: ThemeConfig, primaryColor: string, dark: boolean): ThemeConfig {
    const palette = createBrandPalette(primaryColor);
    const primary = brandAccent(palette, dark);
    const hover = accessibleAccent(dark ? palette[300] : palette[600], dark);
    const active = accessibleAccent(dark ? palette[500] : palette[800], dark);
    const selection = alpha(primary, dark ? 0.18 : 0.11);
    const selectionHover = alpha(primary, dark ? 0.24 : 0.16);

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
            controlOutline: alpha(primary, 0.35),
        },
        components: {
            ...base.components,
            Input: { ...base.components?.Input, activeBorderColor: primary, hoverBorderColor: primary, activeShadow: `0 0 0 2px ${alpha(primary, 0.35)}` },
            InputNumber: { ...base.components?.InputNumber, activeBorderColor: primary, hoverBorderColor: primary, activeShadow: `0 0 0 2px ${alpha(primary, 0.35)}` },
            Select: { ...base.components?.Select, activeBorderColor: primary, hoverBorderColor: primary, activeOutlineColor: alpha(primary, 0.35), optionSelectedBg: selection, optionSelectedColor: primary },
            Menu: { ...base.components?.Menu, itemSelectedBg: selection, itemSelectedColor: primary, darkItemSelectedBg: selection, darkItemSelectedColor: primary },
            Table: { ...base.components?.Table, rowSelectedBg: selection, rowSelectedHoverBg: selectionHover },
            Pagination: { ...base.components?.Pagination, itemActiveBg: selection, itemActiveColor: primary, itemActiveColorHover: hover },
            Segmented: { ...base.components?.Segmented, itemSelectedBg: selection, itemSelectedColor: primary },
        },
    };
}

function brandAccent(palette: BrandPalette, dark: boolean) {
    return accessibleAccent(dark ? palette[400] : palette[700], dark);
}

// 自定义品牌色可能接近白色或黑色；链接和焦点色需在当前表面上仍然可读。
function accessibleAccent(value: string, dark: boolean) {
    const surface = relativeLuminance(dark ? "#22252e" : "#ffffff");
    const rgb = hexToRGB(value);
    const target = dark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    for (let step = 0; step <= 20; step++) {
        const candidate = mixRGB(rgb, target, step / 20);
        const luminance = relativeLuminance(candidate);
        if ((Math.max(surface, luminance) + 0.05) / (Math.min(surface, luminance) + 0.05) >= 4.5) return candidate;
    }
    return dark ? "#ffffff" : "#000000";
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

function relativeLuminance(value: string) {
    const { r, g, b } = hexToRGB(value);
    const luminance = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722;
}

function readableForeground(value: string) {
    const relative = relativeLuminance(value);
    const whiteContrast = 1.05 / (relative + 0.05);
    const blackContrast = (relative + 0.05) / 0.05;
    return whiteContrast >= blackContrast ? "#ffffff" : "#11131d";
}
