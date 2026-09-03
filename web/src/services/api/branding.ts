import { apiBaseURL, apiClient, request } from "@/services/api/request";

export type BrandingConfig = {
    identity: {
        displayName: string;
        shortName: string;
        englishName: string;
        workspaceLabel: string;
        slogan: string;
        description: string;
    };
    theme: {
        primaryColor: string;
    };
    auth: {
        eyebrow: string;
        title: string;
        description: string;
        liveBadge: string;
    };
    browser: {
        title: string;
        metaDescription: string;
    };
};

export type BrandingAssetURLs = {
    logoUrl: string;
    faviconUrl: string;
    authHeroUrl: string;
    authHeroPosterUrl: string;
    authHeroKind: "" | "image" | "video";
};

export type PublicBrandingSetting = {
    revision: number;
    config: BrandingConfig;
    assets: BrandingAssetURLs;
};

export type AdminBrandingSetting = PublicBrandingSetting & {
    assetReferences: {
        logoResourceId: string;
        faviconResourceId: string;
        authHeroResourceId: string;
        authHeroPosterResourceId: string;
    };
    configured: boolean;
    updatedBy: string;
    createdAt?: string;
    updatedAt?: string;
};

export type BrandAssetSlot = "logo" | "favicon" | "auth-hero" | "auth-hero-poster";

const api = apiClient;

export function getPublicBranding() {
    return request<PublicBrandingSetting>(api.get("/public/branding", { timeout: 5_000 }));
}

export function getAdminBranding() {
    return request<{ setting: AdminBrandingSetting }>(api.get("/admin/settings/branding")).then(resolveAdminBrandingResult);
}

export function updateAdminBranding(expectedRevision: number, config: BrandingConfig) {
    return request<{ setting: AdminBrandingSetting }>(api.patch("/admin/settings/branding", { expectedRevision, config })).then(resolveAdminBrandingResult);
}

export function resetAdminBranding(expectedRevision: number) {
    return request<{ setting: AdminBrandingSetting }>(api.post("/admin/settings/branding/reset", { expectedRevision })).then(resolveAdminBrandingResult);
}

export function uploadAdminBrandAsset(slot: BrandAssetSlot, expectedRevision: number, file: File) {
    const formData = new FormData();
    formData.append("expectedRevision", String(expectedRevision));
    formData.append("file", file, file.name);
    return request<{ setting: AdminBrandingSetting }>(api.post(`/admin/settings/branding/assets/${encodeURIComponent(slot)}`, formData)).then(resolveAdminBrandingResult);
}

export function clearAdminBrandAsset(slot: BrandAssetSlot, expectedRevision: number) {
    return request<{ setting: AdminBrandingSetting }>(api.delete(`/admin/settings/branding/assets/${encodeURIComponent(slot)}`, { params: { expectedRevision } })).then(resolveAdminBrandingResult);
}

export function resolveBrandAssetURL(url: string) {
    if (!url.startsWith("/api/")) return url;
    const base = String(apiBaseURL).replace(/\/+$/, "");
    return base === "/api" ? url : `${base}${url.slice("/api".length)}`;
}

function resolveAdminBrandingResult(result: { setting: AdminBrandingSetting }) {
    return {
        setting: {
            ...result.setting,
            assets: {
                ...result.setting.assets,
                logoUrl: resolveBrandAssetURL(result.setting.assets.logoUrl),
                faviconUrl: resolveBrandAssetURL(result.setting.assets.faviconUrl),
                authHeroUrl: resolveBrandAssetURL(result.setting.assets.authHeroUrl),
                authHeroPosterUrl: resolveBrandAssetURL(result.setting.assets.authHeroPosterUrl),
            },
        },
    };
}
