import type { ReactNode } from "react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { AuthSessionHydrator } from "@/components/auth/auth-session-hydrator";
import { ClientRootInit } from "@/components/layout/client-root-init";
import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport";
import { createAppThemePathnameStore, getAntThemeConfigForPathname, type AppThemeRouter } from "@/lib/app-theme-route";
import { appQueryClient } from "@/lib/query-client";
import { useThemeStore } from "@/stores/use-theme-store";
import { listRegisteredPlugins } from "@/lib/plugins/plugin-registry";
import { usePluginStore } from "@/stores/use-plugin-store";
import { fetchPluginRuntimeState, setUserPluginEnabled } from "@/services/api/plugins";
import { useUserStore } from "@/stores/use-user-store";

export function AppProviders({ children, router }: { children: ReactNode; router: AppThemeRouter }) {
    const theme = useThemeStore((state) => state.theme);
    const dark = theme === "dark";
    const pcBrandV2 = usePcBrandViewport();
    const pathnameStore = useMemo(() => createAppThemePathnameStore(router), [router]);
    const pathname = useSyncExternalStore(pathnameStore.subscribe, pathnameStore.getSnapshot, pathnameStore.getSnapshot);
    const antTheme = useMemo(() => getAntThemeConfigForPathname(dark, pcBrandV2, pathname), [dark, pathname, pcBrandV2]);
    const ensurePlugin = usePluginStore((state) => state.ensurePlugin);
    const setRuntimeStatuses = usePluginStore((state) => state.setRuntimeStatuses);
    const setPluginStates = usePluginStore((state) => state.setPluginStates);
    const pluginStoreHydrated = usePluginStore((state) => state.hydrated);
    const userId = useUserStore((state) => state.user?.id);

    useEffect(() => {
        if (!pluginStoreHydrated) return;
        for (const plugin of listRegisteredPlugins()) ensurePlugin(plugin.manifest);
    }, [ensurePlugin, pluginStoreHydrated, userId]);

    useEffect(() => {
        if (!userId) {
            setRuntimeStatuses({});
            setPluginStates({});
            return;
        }
        if (!pluginStoreHydrated) return;
        let cancelled = false;
        void fetchPluginRuntimeState()
            .then(async ({ statuses, states }) => {
                const legacyEnabledIds = usePluginStore
                    .getState()
                    .installations.filter((installation) => installation.enabled && states[installation.manifest.id]?.canToggle && !states[installation.manifest.id]?.userConfigured)
                    .map((installation) => installation.manifest.id);
                if (legacyEnabledIds.length) {
                    try {
                        const migrated = await Promise.all(legacyEnabledIds.map((pluginId) => setUserPluginEnabled(pluginId, true)));
                        for (const state of migrated) states[state.pluginId] = state;
                        for (const pluginId of legacyEnabledIds) statuses[pluginId] = states[pluginId]?.effectiveEnabled ? "enabled" : "disabled";
                    } catch (error) {
                        console.warn("迁移用户插件启用状态失败，已保留服务端状态", error);
                    }
                }
                if (!cancelled) {
                    setRuntimeStatuses(statuses);
                    setPluginStates(states);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setRuntimeStatuses({});
                    setPluginStates({});
                }
            });
        return () => {
            cancelled = true;
        };
    }, [pluginStoreHydrated, setPluginStates, setRuntimeStatuses, userId]);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.colorScheme = theme;
    }, [dark, theme]);

    // DEV 复现台必须是同源本地确定性场景：AuthSessionHydrator 会打 /api/auth/session，
    // ClientRootInit 会打 /api/model-catalog；没有后端时产生的错误会污染导演台和画布的验收判据。
    // 只匹配两个复现路由；生产构建中 import.meta.env.DEV 为 false，本分支被摇树删除。
    const isolateDevRepro = import.meta.env.DEV && typeof window !== "undefined" && (window.location.pathname === "/dev/director-repro" || window.location.pathname.startsWith("/dev/canvas-repro/"));

    return (
        <ConfigProvider locale={zhCN} theme={antTheme}>
            <App message={{ duration: 3, maxCount: 3 }} notification={{ duration: 4.5, maxCount: 3, placement: "topRight" }}>
                <QueryClientProvider client={appQueryClient}>
                    {isolateDevRepro ? (
                        children
                    ) : (
                        <AuthSessionHydrator>
                            <ClientRootInit>{children}</ClientRootInit>
                        </AuthSessionHydrator>
                    )}
                </QueryClientProvider>
            </App>
        </ConfigProvider>
    );
}
