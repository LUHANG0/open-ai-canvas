import { useCallback, useRef, useState } from "react";
import { App } from "antd";
import type { InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import type { CanvasNodeData, Position } from "@/types/canvas";
import type { TimelineDirectMedia } from "@/types/timeline";

type AssetInsertScope = "canvas" | "timeline";

type UseCanvasAssetInsertionOptions = {
    linkedProjectId: string;
    handleAssetsInsert: (payloads: InsertAssetPayload[]) => Promise<CanvasNodeData[]>;
    handleProjectAssetsInsert: (payloads: InsertAssetPayload[], position?: Position) => Promise<CanvasNodeData[]>;
    openAssetsAtPosition: (position?: Position) => void;
    refetchLinkedProject: () => unknown;
};

export function payloadToTimelineMedia(payload: InsertAssetPayload): TimelineDirectMedia | null {
    const id = payload.assetId || `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (payload.kind === "video") {
        return {
            id,
            kind: "video",
            title: payload.title,
            storageKey: payload.storageKey,
            url: payload.url,
            width: payload.width,
            height: payload.height,
            durationMs: payload.durationMs,
            bytes: payload.bytes,
            mimeType: payload.mimeType,
        };
    }
    if (payload.kind === "audio") {
        return { id, kind: "audio", title: payload.title, storageKey: payload.storageKey, url: payload.url, durationMs: payload.durationMs, bytes: payload.bytes, mimeType: payload.mimeType };
    }
    return null;
}

export function resolveTimelineMediaPayloads(payloads: InsertAssetPayload[]) {
    const media = payloads.map(payloadToTimelineMedia).filter((item): item is TimelineDirectMedia => Boolean(item));
    return { media, unsupportedCount: payloads.length - media.length };
}

export function useCanvasAssetInsertion({ linkedProjectId, handleAssetsInsert, handleProjectAssetsInsert, openAssetsAtPosition, refetchLinkedProject }: UseCanvasAssetInsertionOptions) {
    const { message } = App.useApp();
    const timelineAddNodeRef = useRef<((node: CanvasNodeData) => void) | null>(null);
    const timelineMediaAddRef = useRef<((media: TimelineDirectMedia) => void) | null>(null);
    const [assetInsertScope, setAssetInsertScope] = useState<AssetInsertScope>("canvas");
    const [projectAssetScope, setProjectAssetScope] = useState<AssetInsertScope>("canvas");
    const [projectAssetOpen, setProjectAssetOpen] = useState(false);
    const [projectAssetInitialCategory, setProjectAssetInitialCategory] = useState("all");
    const [projectAssetInitialFolderId, setProjectAssetInitialFolderId] = useState("all");
    const [projectAssetInsertPosition, setProjectAssetInsertPosition] = useState<Position | undefined>();

    const handleLibraryAssetsInsert = useCallback(
        async (payloads: InsertAssetPayload[]) => {
            if (assetInsertScope === "timeline") {
                const { media, unsupportedCount } = resolveTimelineMediaPayloads(payloads);
                if (unsupportedCount) throw new Error("图片和文本素材暂不支持直接入轨，请先插入画布");
                media.forEach((item) => timelineMediaAddRef.current?.(item));
                return;
            }
            const created = await handleAssetsInsert(payloads);
            created.forEach((node) => timelineAddNodeRef.current?.(node));
        },
        [assetInsertScope, handleAssetsInsert],
    );

    const handleTimelineProjectAssetsInsert = useCallback(
        async (payloads: InsertAssetPayload[]) => {
            if (projectAssetScope === "timeline") {
                const { media, unsupportedCount } = resolveTimelineMediaPayloads(payloads);
                media.forEach((item) => timelineMediaAddRef.current?.(item));
                if (unsupportedCount) message.info("图片/文本/角色素材暂不支持直接入轨，仅音视频素材已加入时间线");
                return;
            }
            const created = await handleProjectAssetsInsert(payloads, projectAssetInsertPosition);
            created.forEach((node) => timelineAddNodeRef.current?.(node));
        },
        [handleProjectAssetsInsert, message, projectAssetInsertPosition, projectAssetScope],
    );

    const openProjectAssets = useCallback(
        (initialCategory = "all", position?: Position, scope: AssetInsertScope = "canvas", initialFolderId = "all") => {
            setProjectAssetScope(scope);
            setProjectAssetInitialCategory(initialCategory);
            setProjectAssetInitialFolderId(initialFolderId);
            setProjectAssetInsertPosition(position);
            setProjectAssetOpen(true);
            if (linkedProjectId) void refetchLinkedProject();
        },
        [linkedProjectId, refetchLinkedProject],
    );

    const openCanvasAssetLibrary = useCallback(
        (position?: Position) => {
            setAssetInsertScope("canvas");
            openAssetsAtPosition(position);
        },
        [openAssetsAtPosition],
    );

    const openTimelineAssetLibrary = useCallback(() => {
        setAssetInsertScope("timeline");
        openAssetsAtPosition();
    }, [openAssetsAtPosition]);

    const closeProjectAssets = useCallback(() => {
        setProjectAssetOpen(false);
        setProjectAssetInsertPosition(undefined);
        setProjectAssetInitialFolderId("all");
    }, []);

    return {
        assetInsertScope,
        closeProjectAssets,
        handleLibraryAssetsInsert,
        handleTimelineProjectAssetsInsert,
        openCanvasAssetLibrary,
        openProjectAssets,
        openTimelineAssetLibrary,
        projectAssetInitialCategory,
        projectAssetInitialFolderId,
        projectAssetInsertPosition,
        projectAssetOpen,
        projectAssetScope,
        timelineAddNodeRef,
        timelineMediaAddRef,
    };
}
