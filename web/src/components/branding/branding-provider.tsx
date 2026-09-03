import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { applyBrandPalette, DEFAULT_BRAND_PRIMARY, normalizeBrandPrimary } from "@/lib/branding-theme";
import { getPublicBranding, resolveBrandAssetURL, type PublicBrandingSetting } from "@/services/api/branding";

const BRANDING_CACHE_KEY = "infinite-canvas:public-branding:v1";

export const DEFAULT_PUBLIC_BRANDING: PublicBrandingSetting = {
    revision: 0,
    config: {
        identity: {
            displayName: "影策",
            shortName: "影策",
            englishName: "YINGCE STUDIO",
            workspaceLabel: "创作工作台",
            slogan: "让一个故事，从文字走向银幕。",
            description: "面向 AI 影视与短剧创作的开源工作台。",
        },
        theme: { primaryColor: DEFAULT_BRAND_PRIMARY },
        auth: {
            eyebrow: "YINGCE STUDIO",
            title: "让一个故事，\n从文字走向银幕。",
            description: "在同一个创作空间里组织素材、生成内容并完成画布编排。",
            liveBadge: "创作正在发生",
        },
        browser: {
            title: "影策",
            metaDescription: "影策，让一个故事从文字走向银幕。面向 AI 影视与短剧创作的开源工作台。",
        },
    },
    assets: {
        logoUrl: "/logo.svg",
        faviconUrl: "/logo.svg",
        authHeroUrl: "",
        authHeroPosterUrl: "",
        authHeroKind: "",
    },
};

type BrandingContextValue = {
    branding: PublicBrandingSetting;
    refreshing: boolean;
    refresh: () => Promise<void>;
    replace: (setting: PublicBrandingSetting) => void;
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
    const [branding, setBranding] = useState(readCachedBranding);
    const [refreshing, setRefreshing] = useState(false);

    const replace = useCallback((setting: PublicBrandingSetting) => {
        const normalized = normalizePublicBranding(setting);
        setBranding(normalized);
        writeCachedBranding(normalized);
    }, []);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            replace(await getPublicBranding());
        } catch {
            // The embedded or last successful brand remains authoritative for
            // this render; a branding outage must never block authentication.
        } finally {
            setRefreshing(false);
        }
    }, [replace]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        applyBrandPalette(branding.config.theme.primaryColor);
        document.title = branding.config.browser.title;
        updateMetaDescription(branding.config.browser.metaDescription);
        updateFavicon(resolveBrandAssetURL(branding.assets.faviconUrl));
        document.documentElement.dataset.brandRevision = String(branding.revision);
    }, [branding]);

    const value = useMemo<BrandingContextValue>(() => ({ branding, refreshing, refresh, replace }), [branding, refresh, refreshing, replace]);
    return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
    const value = useContext(BrandingContext);
    if (!value) throw new Error("useBranding must be used within BrandingProvider");
    return value;
}

export function toPublicBranding(setting: PublicBrandingSetting): PublicBrandingSetting {
    return normalizePublicBranding(setting);
}

function normalizePublicBranding(value: PublicBrandingSetting): PublicBrandingSetting {
    if (!isPublicBranding(value)) return DEFAULT_PUBLIC_BRANDING;
    const identity = { ...DEFAULT_PUBLIC_BRANDING.config.identity, ...value.config.identity };
    const auth = { ...DEFAULT_PUBLIC_BRANDING.config.auth, ...value.config.auth };
    const browser = { ...DEFAULT_PUBLIC_BRANDING.config.browser, ...value.config.browser };
    const assets = { ...DEFAULT_PUBLIC_BRANDING.assets, ...value.assets };
    return {
        ...value,
        config: {
            identity,
            auth,
            browser,
            theme: { primaryColor: normalizeBrandPrimary(value.config.theme.primaryColor) },
        },
        assets: {
            logoUrl: resolveBrandAssetURL(assets.logoUrl || "/logo.svg"),
            faviconUrl: resolveBrandAssetURL(assets.faviconUrl || "/logo.svg"),
            authHeroUrl: resolveBrandAssetURL(assets.authHeroUrl || ""),
            authHeroPosterUrl: resolveBrandAssetURL(assets.authHeroPosterUrl || ""),
            authHeroKind: assets.authHeroKind === "image" || assets.authHeroKind === "video" ? assets.authHeroKind : "",
        },
    };
}

function isPublicBranding(value: unknown): value is PublicBrandingSetting {
    if (!value || typeof value !== "object") return false;
    const setting = value as Partial<PublicBrandingSetting>;
    return (
        typeof setting.revision === "number" &&
        Boolean(setting.config && setting.assets) &&
        typeof setting.config?.identity?.displayName === "string" &&
        typeof setting.config?.theme?.primaryColor === "string" &&
        typeof setting.config?.auth?.title === "string" &&
        typeof setting.config?.browser?.title === "string" &&
        typeof setting.assets?.logoUrl === "string"
    );
}

function readCachedBranding() {
    if (typeof window === "undefined") return DEFAULT_PUBLIC_BRANDING;
    try {
        const value = JSON.parse(window.localStorage.getItem(BRANDING_CACHE_KEY) || "null");
        return normalizePublicBranding(value);
    } catch {
        return DEFAULT_PUBLIC_BRANDING;
    }
}

function writeCachedBranding(setting: PublicBrandingSetting) {
    try {
        window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(setting));
    } catch {
        // Storage can be unavailable in private/restricted browser contexts.
    }
}

function updateMetaDescription(content: string) {
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.append(meta);
    }
    meta.content = content;
}

function updateFavicon(href: string) {
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.append(link);
    }
    link.href = href || "/logo.svg";
}
