import { useEffect, useRef } from "react";
import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { canvasAssetHandoffAttempt, finalizeCanvasAssetHandoff, uninsertedCanvasAssetHandoffPayloads } from "@/lib/canvas/canvas-asset-handoff";
import { flushCanvasStorePersistence } from "@/stores/canvas/use-canvas-store";
import type { Asset } from "@/stores/use-asset-store";
import type { CanvasNodeData } from "@/types/canvas";

type UseCanvasAssetHandoffOptions = {
    assets: Asset[];
    assetsHydrated: boolean;
    handleProjectAssetsInsert: (payloads: InsertAssetPayload[]) => Promise<CanvasNodeData[]>;
    nodesRef: { current: CanvasNodeData[] };
    projectId: string;
    projectLoaded: boolean;
    searchParams: URLSearchParams;
    setSearchParams: (params: URLSearchParams, options: { replace: boolean }) => void;
    updateProject: (projectId: string, patch: { nodes: CanvasNodeData[] }) => void;
};

export function buildCanvasAssetHandoffKey(projectId: string, assetIds: string[], assets: Asset[]) {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const readiness = assetIds.map((assetId) => `${assetId}:${assetsById.get(assetId)?.kind || "missing"}`).join("|");
    return `${projectId}:${readiness}`;
}

export function useCanvasAssetHandoff({
    assets,
    assetsHydrated,
    handleProjectAssetsInsert,
    nodesRef,
    projectId,
    projectLoaded,
    searchParams,
    setSearchParams,
    updateProject,
}: UseCanvasAssetHandoffOptions) {
    const attemptedHandoffRef = useRef("");

    useEffect(() => {
        if (!projectLoaded || !assetsHydrated || searchParams.get("mode") !== "handoff") return;
        const attempt = canvasAssetHandoffAttempt(assets, searchParams);
        const { assetIds, payloads } = attempt;
        if (!assetIds.length) return;
        const handoffKey = buildCanvasAssetHandoffKey(projectId, assetIds, assets);
        if (attemptedHandoffRef.current === handoffKey) return;
        attemptedHandoffRef.current = handoffKey;

        if (attempt.kind === "retry") return;
        const pendingPayloads = uninsertedCanvasAssetHandoffPayloads(nodesRef.current, payloads);
        const persistHandoff = async (createdNodes: CanvasNodeData[]) => {
            const finalized = await finalizeCanvasAssetHandoff({
                searchParams,
                currentNodes: nodesRef.current,
                createdNodes,
                persist: async (nextNodes) => {
                    nodesRef.current = nextNodes;
                    updateProject(projectId, { nodes: nextNodes });
                    await flushCanvasStorePersistence();
                },
            });
            setSearchParams(finalized.searchParams, { replace: true });
        };
        const insertion = pendingPayloads.length ? handleProjectAssetsInsert(pendingPayloads) : Promise.resolve([] as CanvasNodeData[]);
        void insertion.then(persistHandoff).catch(() => {
            attemptedHandoffRef.current = "";
        });
    }, [assets, assetsHydrated, handleProjectAssetsInsert, nodesRef, projectId, projectLoaded, searchParams, setSearchParams, updateProject]);
}
