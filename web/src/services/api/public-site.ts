import { apiClient, request } from "@/services/api/request";

export type PublicSiteShowcaseItem = {
    id: string;
    title: string;
    category: string;
    description: string;
    coverUrl: string;
    videoUrl: string;
    externalUrl: string;
};

export type PublicSiteConfig = {
    hero: {
        eyebrow: string;
        title: string;
        description: string;
        primaryCta: string;
        secondaryCta: string;
        showreelUrl: string;
        posterUrl: string;
        showreelLabel: string;
    };
    sections: {
        productTitle: string;
        productDescription: string;
        workflowTitle: string;
        workflowDescription: string;
        showcaseTitle: string;
        showcaseDescription: string;
        aboutTitle: string;
        aboutDescription: string;
    };
    showcases: PublicSiteShowcaseItem[];
    links: {
        docsUrl: string;
        repositoryUrl: string;
        deploymentUrl: string;
        contactUrl: string;
        icpText: string;
        icpUrl: string;
    };
    seo: {
        homeTitle: string;
        homeDescription: string;
        productTitle: string;
        showcaseTitle: string;
        aboutTitle: string;
    };
};

export type PublicSiteSetting = {
    revision: number;
    config: PublicSiteConfig;
};

export type AdminPublicSiteSetting = {
    revision: number;
    publishedRevision: number;
    draft: PublicSiteConfig;
    published: PublicSiteConfig;
    dirty: boolean;
    configured: boolean;
    updatedBy: string;
    createdAt?: string;
    updatedAt?: string;
};

export function getPublicSite() {
    return request<PublicSiteSetting>(apiClient.get("/public/site", { timeout: 5_000 }));
}

export function getAdminPublicSite() {
    return request<{ setting: AdminPublicSiteSetting }>(apiClient.get("/admin/settings/public-site"));
}

export type SiteDisplaySettings = { posterUrl: string; contactUrl: string; icpText: string; icpUrl: string };

export function updateAdminSiteDisplay(expectedRevision: number, settings: SiteDisplaySettings) {
    return request<{ setting: AdminPublicSiteSetting }>(apiClient.patch("/admin/settings/site-display", { expectedRevision, ...settings }));
}
