import { useParams, useSearchParams } from "react-router";

import { resolveCanvasLocalAgentEntry } from "./canvas-local-agent-entry";

export function useCanvasProjectRoute() {
    const params = useParams<{ id: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const projectId = params.id || "";
    const localAgentEntry = resolveCanvasLocalAgentEntry(searchParams);

    return {
        projectId,
        searchParams,
        setSearchParams,
        ...localAgentEntry,
    };
}
