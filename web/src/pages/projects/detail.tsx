import { lazy, Suspense } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceLoadingState, WorkspaceErrorState } from "@/components/layout/workspace-state";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { getDrama } from "@/services/api/drama";
import { ApiError } from "@/services/api/request";
import { dramaKeys } from "@/lib/drama/drama-query-keys";
const LegacyProject = lazy(() => import("./legacy-detail"));
const DramaStudio = lazy(() => import("./studio-page"));

export default function ProjectDetailPage() {
    const { projectId = "", view, chapterId, unitId, episodeId } = useParams();
    const legacyRoute = Boolean(view || chapterId || unitId);
    const query = useQuery({ queryKey: dramaKeys.summary(projectId), queryFn: ({ signal }) => getDrama(projectId, signal), enabled: Boolean(projectId) && !legacyRoute && !episodeId, retry: false });
    let Page = DramaStudio;
    if (legacyRoute || query.error instanceof ApiError && (query.error.status === 404 || query.error.code === 404)) Page = LegacyProject;
    else if (!episodeId && query.isPending) return <WorkspacePage><WorkspaceLoadingState label="正在打开项目" /></WorkspacePage>;
    else if (!episodeId && query.isError) return <WorkspacePage><WorkspaceErrorState description="项目暂时无法读取。" onRetry={() => void query.refetch()} /></WorkspacePage>;
    return <Suspense fallback={<WorkspacePage><WorkspaceLoadingState label="正在打开制作台" /></WorkspacePage>}><Page /></Suspense>;
}
