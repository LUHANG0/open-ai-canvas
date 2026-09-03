import { useQuery } from "@tanstack/react-query";

import { getProject } from "@/services/api/projects";

export function resolveCanvasLinkedProjectId(shortDramaEnabled: boolean, projectId: string | undefined) {
    return shortDramaEnabled ? projectId || "" : "";
}

export function useCanvasLinkedProjectQuery(shortDramaEnabled: boolean, projectId: string | undefined) {
    const linkedProjectId = resolveCanvasLinkedProjectId(shortDramaEnabled, projectId);
    const query = useQuery({ queryKey: ["project", linkedProjectId], queryFn: () => getProject(linkedProjectId), enabled: Boolean(linkedProjectId) });

    return {
        linkedProjectDetail: query.data,
        linkedProjectId,
        refetchLinkedProject: query.refetch,
    };
}
