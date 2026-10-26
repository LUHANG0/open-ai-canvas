import { http } from "./request";

export type PublicPageEntry = { url: string; revision: string; updatedAt: string };
export type SEOJob = { id: string; provider: "baidu" | "indexnow"; url: string; status: string; attempts: number; nextAttemptAt: string; leaseUntil?: string; lastCode?: string; httpStatus?: number; updatedAt: string; acceptedAt?: string };
export type SEOSetting = { revision: number; enabled: boolean; baiduEnabled: boolean; baiduAllowHTTP: boolean; indexNowEnabled: boolean; googleSitemapRegistered: boolean; hasBaiduToken: boolean; hasIndexNowKey: boolean; origin: string; pages: PublicPageEntry[]; jobs: SEOJob[]; providerNotBefore: Record<string, string> | null };
export type SEOSettingInput = Pick<SEOSetting, "revision" | "enabled" | "baiduEnabled" | "baiduAllowHTTP" | "indexNowEnabled" | "googleSitemapRegistered"> & { baiduToken: string; clearBaiduToken: boolean };
export const getSEOSetting = (signal?: AbortSignal) => http.get<{ setting: SEOSetting }>("/admin/settings/seo", { signal });
export const saveSEOSetting = (input: SEOSettingInput) => http.patch<{ setting: SEOSetting }>("/admin/settings/seo", input);
export const checkSEO = () => http.post<{ scheduled: boolean }>("/admin/settings/seo/check");
