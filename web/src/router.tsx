import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router";

import { RequireAuth } from "@/components/auth/require-auth";
import { FullScreenLoader, WorkspaceRouteLoader } from "@/components/ui/aceternity/full-screen-loader";
import { loadAssetsPage, loadCanvasPage, loadCanvasProjectPage, loadCreatePage, loadProjectDetailPage, loadProjectsPage, loadTasksPage, loadSkillsPage, loadPluginsPage, loadImageWorkbenchPage, loadVideoWorkbenchPage } from "@/lib/workspace-route-modules";
import type { FeatureKey } from "@/components/auth/require-feature";
import { CanvasRefreshShell } from "@/pages/canvas/canvas-refresh-shell";
import { WorkspaceBootstrap } from "@/components/layout/app-providers";
import { WorkspaceEntryError } from "@/components/layout/workspace-entry-error";
import { brandPublicRoutes } from "@/pages/welcome/brand-public-routes";
import RouteErrorPage from "@/pages/route-error";
import { isGuestWorkspacePath } from "@/lib/guest-workspace";

const AdminPage = lazy(() => import("@/pages/admin"));
const BrandSiteSettingsPage = lazy(() => import("@/pages/admin/settings/brand-site-settings-page"));
const AnalyticsPage = lazy(() => import("@/pages/admin/admin-route-pages").then((module) => ({ default: module.AnalyticsPage })));
const AnnouncementsPage = lazy(() => import("@/pages/admin/admin-route-pages").then((module) => ({ default: module.AnnouncementsPage })));
const BannerAnnouncementsPage = lazy(() => import("@/pages/admin/admin-route-pages").then((module) => ({ default: module.BannerAnnouncementsPage })));
const StorageResourcesPage = lazy(() => import("@/pages/admin/admin-route-pages").then((module) => ({ default: module.StorageResourcesPage })));
const CreditOperationsPage = lazy(() => import("@/pages/admin/admin-route-pages").then((module) => ({ default: module.CreditOperationsPage })));
const AccessSettingsPage = lazy(() => import("@/pages/admin/admin-route-pages").then((module) => ({ default: module.AccessSettingsPage })));
const TurnstileSettingsPage = lazy(() => import("@/pages/admin/settings/turnstile-settings-page"));
const EmailTemplatesSettingsPage = lazy(() => import("@/pages/admin/settings/email-templates-settings-page"));
const EmailSettingsPage = lazy(() => import("@/pages/admin/admin-route-pages").then((module) => ({ default: module.EmailSettingsPage })));
const FeatureAvailabilityPage = lazy(() => import("@/pages/admin/admin-route-pages").then((module) => ({ default: module.FeatureAvailabilityPage })));
const AgentLessonsPage = lazy(() => import("@/pages/admin/admin-route-pages").then((module) => ({ default: module.AgentLessonsPage })));
const ChannelsPage = lazy(() => import("@/pages/admin/channels/channels-page"));
const LogicalModelsPage = lazy(() => import("@/pages/admin/logical-models/logical-models-page"));
const AdminPluginsPage = lazy(() => import("@/pages/admin/plugins/plugins-page"));
const SkillCurationPage = lazy(() => import("@/pages/admin/skill-curation-page"));
const AdminPaymentsPage = lazy(() => import("@/pages/admin/payments/payments-page"));
const LogsPage = lazy(() => import("@/pages/admin/logs/logs-page"));
const LoginLogsPage = lazy(() => import("@/pages/admin/login-logs/login-logs-page"));
const RedemptionCodesPage = lazy(() => import("@/pages/admin/redemption-codes/redemption-codes-page"));
const RuntimePolicySettingsPage = lazy(() => import("@/pages/admin/settings/runtime-policy-settings-page"));
const AppearanceSettingsPage = lazy(() => import("@/pages/admin/settings/appearance-settings-page"));
const SEOSettingsPage = lazy(() => import("@/pages/admin/settings/seo-settings-page"));
const DrawingEngineSettingsPage = lazy(() => import("@/pages/admin/settings/drawing-engine-settings-page"));
const StorageSettingsPage = lazy(() => import("@/pages/admin/settings/storage-settings-page"));
const ArkPrivateAssetsSettingsPage = lazy(() => import("@/pages/admin/settings/ark-private-assets-settings-page"));
const ResponseInterceptionSettingsPage = lazy(() => import("@/pages/admin/settings/response-interception-settings-page"));
const ThirdPartySettingsPage = lazy(() => import("@/pages/admin/settings/libtv-settings-page"));
const WorkbenchToolsPage = lazy(() => import("@/pages/admin/workbench-tools/workbench-tools-page"));
const SystemUpdatePage = lazy(() => import("@/pages/admin/settings/system-update-page"));
const SystemPerformancePage = lazy(() => import("@/pages/admin/settings/system-performance-page"));
const StoryboardPromptsPage = lazy(() => import("@/pages/admin/storyboard-prompts/storyboard-prompts-page"));
const UsersPage = lazy(() => import("@/pages/admin/users/users-page"));
const CanvasProjectPage = lazy(loadCanvasProjectPage);
const SharedCanvasPage = lazy(() => import("@/pages/canvas/shared"));
const NotFound = lazy(() => import("@/pages/not-found"));
const EagleLibraryPage = lazy(() => import("@/pages/plugins/eagle"));
const ProjectDetailPage = lazy(loadProjectDetailPage);
const SettingsPage = lazy(() => import("@/pages/settings"));
const TestVoiceRecording = lazy(() => import("@/pages/test-voice-recording"));
const UserLayout = lazy(() => import("@/layouts/user-layout"));
const RequireFeature = lazy(() => import("@/components/auth/require-feature").then((module) => ({ default: module.RequireFeature })));

function deferred(element: ReactNode) {
    return <Suspense fallback={<WorkspaceRouteLoader />}>{element}</Suspense>;
}

function fullScreenDeferred(element: ReactNode) {
    return <Suspense fallback={<FullScreenLoader label="正在打开创作空间" detail="准备当前页面" />}>{element}</Suspense>;
}

function workspaceEntry(loadPage: () => Promise<{ default: ComponentType }>, feature?: FeatureKey) {
    return {
        // Keep the entry's boundary available even when its lazy module rejects.
        hydrateFallbackElement: <WorkspaceRouteLoader />,
        errorElement: <WorkspaceEntryError />,
        lazy: async () => {
            const [{ default: Page }, featureModule] = await Promise.all([
                loadPage(),
                feature ? import("@/components/auth/require-feature") : Promise.resolve(undefined),
            ]);
            const Feature = featureModule?.RequireFeature;
            return { element: <RequireAuth>{Feature && feature ? <Feature feature={feature}><Page /></Feature> : <Page />}</RequireAuth> };
        },
    };
}

function AuthenticatedWorkspaceLayout() {
    const { pathname } = useLocation();
    const isCanvasProjectRoute = pathname.startsWith("/canvas/");
    const fallback = isCanvasProjectRoute ? <CanvasRefreshShell /> : <FullScreenLoader label="正在打开创作空间" detail="准备当前页面" />;
    return (
        <RequireAuth allowAnonymous={isGuestWorkspacePath(pathname)}>
            <Suspense fallback={fallback}>
                <UserLayout>
                    <Suspense fallback={isCanvasProjectRoute ? <CanvasRefreshShell /> : <WorkspaceRouteLoader />}>
                        <Outlet />
                    </Suspense>
                </UserLayout>
            </Suspense>
        </RequireAuth>
    );
}

/**
 * DEV 专用实验室路由。
 *
 * lazy(() => import(...)) 写在函数体内，而不是模块顶层常量：
 * 生产构建时 import.meta.env.DEV 被替换为 false，本函数随之不可达，
 * 摇树会连同其中的动态 import 一起删除，实验室代码不进入生产依赖图。
 * 若把 lazy 提到模块顶层，动态 import 会被静态分析成真实 chunk 并打进 dist。
 */
function devRoutes() {
    const FolderPreviewLab = lazy(() => import("@/pages/dev/folder-preview-lab"));
    const PrevisReproLab = lazy(() => import("@/pages/dev/previs-repro-lab"));
    return [
        { path: "/dev/folders", element: fullScreenDeferred(<FolderPreviewLab />), errorElement: <RouteErrorPage /> },
        { path: "/dev/previs-repro", element: fullScreenDeferred(<PrevisReproLab />), errorElement: <RouteErrorPage /> },
    ];
}

export const router = createBrowserRouter([
    { ...brandPublicRoutes, errorElement: <RouteErrorPage /> },
    { path: "/welcome", element: <Navigate to="/" replace /> },
    { path: "/share/canvas/:token", element: fullScreenDeferred(<SharedCanvasPage />), errorElement: <RouteErrorPage /> },
    ...(import.meta.env.DEV ? devRoutes() : []),
    {
        element: <WorkspaceBootstrap><AuthenticatedWorkspaceLayout /></WorkspaceBootstrap>,
        errorElement: <RouteErrorPage />,
        children: [
            {
                path: "/create",
                lazy: async () => ({ Component: (await loadCreatePage()).default }),
                hydrateFallbackElement: <WorkspaceRouteLoader />,
                errorElement: <WorkspaceEntryError />,
            },
            { path: "/toolbox/image", ...workspaceEntry(loadImageWorkbenchPage, "imageWorkbenchEnabled") },
            { path: "/toolbox/video", ...workspaceEntry(loadVideoWorkbenchPage, "videoWorkbenchEnabled") },
            { path: "/tasks", ...workspaceEntry(loadTasksPage, "taskCenterEnabled") },
            { path: "/assets", ...workspaceEntry(loadAssetsPage) },
            { path: "/skills", ...workspaceEntry(loadSkillsPage) },
            { path: "/plugins", ...workspaceEntry(loadPluginsPage, "pluginCenterEnabled") },
            {
                path: "/plugins/eagle",
                element: (
                    <RequireAuth>
                        <RequireFeature feature="pluginCenterEnabled">{deferred(<EagleLibraryPage />)}</RequireFeature>
                    </RequireAuth>
                ),
            },
            {
                path: "/wallet",
                element: <RequireAuth>{null}</RequireAuth>,
            },
            { path: "/settings", element: <RequireAuth>{deferred(<SettingsPage />)}</RequireAuth> },
            { path: "/test-voice-recording", element: <RequireAuth>{deferred(<TestVoiceRecording />)}</RequireAuth> },
            {
                path: "/projects",
                hydrateFallbackElement: <WorkspaceRouteLoader />,
                lazy: async () => {
                    const [{ default: Page }, { RequireFeature: Feature }] = await Promise.all([
                        loadProjectsPage(),
                        import("@/components/auth/require-feature"),
                    ]);
                    return { element: <RequireAuth><Feature feature="shortDramaEnabled"><Page /></Feature></RequireAuth> };
                },
                errorElement: <WorkspaceEntryError />,
            },
            {
                path: "/projects/:projectId",
                element: (
                    <RequireAuth>
                        <RequireFeature feature="shortDramaEnabled">{deferred(<ProjectDetailPage />)}</RequireFeature>
                    </RequireAuth>
                ),
            },
            {
                path: "/projects/:projectId/:view",
                element: (
                    <RequireAuth>
                        <RequireFeature feature="shortDramaEnabled">{deferred(<ProjectDetailPage />)}</RequireFeature>
                    </RequireAuth>
                ),
            },
            {
                path: "/projects/:projectId/chapters/:chapterId",
                element: (
                    <RequireAuth>
                        <RequireFeature feature="shortDramaEnabled">{deferred(<ProjectDetailPage />)}</RequireFeature>
                    </RequireAuth>
                ),
            },
            {
                path: "/projects/:projectId/workflow/:unitId/:stage",
                element: (
                    <RequireAuth>
                        <RequireFeature feature="shortDramaEnabled">{deferred(<ProjectDetailPage />)}</RequireFeature>
                    </RequireAuth>
                ),
            },
            {
                path: "/canvas",
                hydrateFallbackElement: <WorkspaceRouteLoader />,
                lazy: async () => {
                    const { default: Page } = await loadCanvasPage();
                    return { element: <RequireAuth><Page /></RequireAuth> };
                },
                errorElement: <WorkspaceEntryError />,
            },
            {
                path: "/canvas/:id",
                element: (
                    <RequireAuth>
                        <CanvasProjectPage />
                    </RequireAuth>
                ),
            },
            {
                path: "/admin",
                element: <RequireAuth>{deferred(<AdminPage />)}</RequireAuth>,
                children: [
                    { index: true, element: <AnalyticsPage /> },
                    { path: "users", element: <UsersPage /> },
                    { path: "login-logs", element: <LoginLogsPage /> },
                    { path: "channels", element: <ChannelsPage /> },
                    {
                        path: "models",
                        element: (
                            <RequireFeature feature="frontendModelsEnabled">
                                <LogicalModelsPage />
                            </RequireFeature>
                        ),
                    },
                    { path: "plugins", element: <AdminPluginsPage /> },
                    { path: "workbench-tools", element: <WorkbenchToolsPage /> },
                    { path: "skill-curation", element: <SkillCurationPage /> },
                    { path: "payments", element: <AdminPaymentsPage /> },
                    { path: "prompt-templates", element: <StoryboardPromptsPage /> },
                    { path: "storyboard-prompts", element: <Navigate to="/admin/prompt-templates" replace /> },
                    { path: "announcements", element: <AnnouncementsPage /> },
                    { path: "banner-announcements", element: <BannerAnnouncementsPage /> },
                    { path: "agent-lessons", element: <AgentLessonsPage /> },
                    { path: "resources", element: <StorageResourcesPage /> },
                    { path: "credit-operations", element: <CreditOperationsPage /> },
                    { path: "redemption-codes", element: <RedemptionCodesPage /> },
                    { path: "logs", element: <LogsPage /> },
                    { path: "settings", element: <Navigate to="runtime-policy" replace /> },
                    { path: "settings/appearance", element: <AppearanceSettingsPage /> },
                    { path: "settings/seo", element: <SEOSettingsPage /> },
                    { path: "settings/brand-site", element: <BrandSiteSettingsPage /> },
                    { path: "settings/drawing-engine", element: <DrawingEngineSettingsPage /> },
                    { path: "settings/concurrency", element: <Navigate to="/admin/settings/runtime-policy" replace /> },
                    { path: "settings/runtime-policy", element: <RuntimePolicySettingsPage /> },
                    { path: "settings/features", element: <FeatureAvailabilityPage /> },
                    { path: "settings/access", element: <AccessSettingsPage /> },
                    { path: "settings/email", element: <EmailSettingsPage /> },
                    { path: "settings/turnstile", element: <TurnstileSettingsPage /> },
                    { path: "settings/email-templates", element: <EmailTemplatesSettingsPage /> },
                    { path: "settings/storage", element: <StorageSettingsPage /> },
                    { path: "settings/ark-private-assets", element: <ArkPrivateAssetsSettingsPage /> },
                    { path: "settings/response-interception", element: <ResponseInterceptionSettingsPage /> },
                    { path: "settings/third-party", element: <ThirdPartySettingsPage /> },
                    { path: "settings/system-update", element: <SystemUpdatePage /> },
                    { path: "settings/system-performance", element: <SystemPerformancePage /> },
                    { path: "settings/libtv", element: <Navigate to="/admin/settings/third-party" replace /> },
                ],
            },
        ],
    },
    { path: "*", element: fullScreenDeferred(<NotFound />) },
]);
