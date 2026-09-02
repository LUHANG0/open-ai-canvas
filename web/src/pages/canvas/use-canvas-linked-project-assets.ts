import { useCallback, useEffect, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { App } from "antd";
import { refreshCanvasCharacterReferenceNodes } from "@/lib/canvas/canvas-character-reference";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import type { ProjectAsset, ProjectAssetFolder } from "@/services/api/projects";
import type { Asset } from "@/stores/use-asset-store";
import { CanvasNodeType, type CanvasFolderStyle, type CanvasFolderTheme, type CanvasNodeData, type Position } from "@/types/canvas";

type ArchivedNodeSnapshot = {
    assetId: string;
    content: string | undefined;
    previousAssetId: string | undefined;
};

type CreateLinkedFolder = (
    position?: Position,
    linked?: { id: string; projectId: string; title: string; style: CanvasFolderStyle; theme: CanvasFolderTheme; createdAt: string },
) => void;

type OpenProjectAssets = (initialCategory?: string, position?: Position, scope?: "canvas" | "timeline", initialFolderId?: string) => void;

const LINKED_FOLDER_STYLES = new Set<CanvasFolderStyle>(["glass", "stacked", "midnight", "paper", "cinema", "compact"]);
const LINKED_FOLDER_THEMES = new Set<CanvasFolderTheme>(["aurora", "obsidian", "ember", "pearl"]);

export function resolveLinkedFolderAppearance(folder: Pick<ProjectAssetFolder, "style" | "theme">) {
    return {
        style: LINKED_FOLDER_STYLES.has(folder.style as CanvasFolderStyle) ? (folder.style as CanvasFolderStyle) : "glass",
        theme: LINKED_FOLDER_THEMES.has(folder.theme as CanvasFolderTheme) ? (folder.theme as CanvasFolderTheme) : "aurora",
    };
}

export function applyArchivedAssetIds(nodes: CanvasNodeData[], archivedByNodeId: ReadonlyMap<string, ArchivedNodeSnapshot>) {
    let changed = false;
    const next = nodes.map((node) => {
        const archived = archivedByNodeId.get(node.id);
        if (!archived || node.metadata?.content !== archived.content || node.metadata?.assetId !== archived.previousAssetId) return node;
        changed = true;
        return { ...node, metadata: { ...node.metadata, assetId: archived.assetId } };
    });
    return changed ? next : nodes;
}

export function buildLinkedFolderPreviewNodes(localAssets: Asset[], projectAssets: ProjectAsset[]) {
    const result = new Map<string, CanvasNodeData[]>();
    const localById = new Map(localAssets.map((asset) => [asset.id, asset]));
    for (const asset of projectAssets) {
        if (!asset.folderId) continue;
        const local = localById.get(asset.id);
        const characterCover = asset.character?.representations.find((item) => item.role === "turnaround_sheet") || asset.character?.representations.find((item) => item.role === "primary") || asset.character?.representations[0];
        const type = asset.category === "character" || asset.mediaType === "image" ? CanvasNodeType.Image : asset.mediaType === "video" ? CanvasNodeType.Video : asset.mediaType === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Text;
        const remoteResourceId = resourceIdFromStorageKey(asset.storageKey);
        const content = characterCover
            ? resourceFileUrl(characterCover.resourceId)
            : local?.kind === "image"
              ? local.data.dataUrl || local.coverUrl
              : local?.kind === "video" || local?.kind === "audio"
                ? local.data.url
                : local?.kind === "text"
                  ? local.data.content
                  : remoteResourceId
                    ? resourceFileUrl(remoteResourceId)
                    : asset.previewText || "";
        const preview: CanvasNodeData = { id: asset.id, type, title: asset.title, position: { x: 0, y: 0 }, width: 240, height: 160, metadata: { assetId: asset.id, content } };
        const current = result.get(asset.folderId) || [];
        current.push(preview);
        result.set(asset.folderId, current);
    }
    return result;
}

type UseCanvasLinkedProjectAssetSyncOptions = {
    canvasId: string;
    linkedProjectId: string;
    projectLoaded: boolean;
    projectAssets: ProjectAsset[] | undefined;
    projectFolders: ProjectAssetFolder[] | undefined;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    refetchLinkedProject: () => unknown;
};

export function useCanvasLinkedProjectAssetSync({ canvasId, linkedProjectId, projectLoaded, projectAssets, projectFolders, setNodes, refetchLinkedProject }: UseCanvasLinkedProjectAssetSyncOptions) {
    const { message } = App.useApp();

    const archiveNodesToLinkedFolder = useCallback(
        (folder: CanvasNodeData, droppedNodes: CanvasNodeData[]) => {
            const folderId = folder.metadata?.folder?.assetFolderId;
            const domainProjectId = folder.metadata?.folder?.projectId || linkedProjectId;
            if (!folderId || !domainProjectId || !droppedNodes.length) return;
            void import("@/services/project-asset-sync")
                .then(({ ensureCanvasNodeAsset }) => Promise.all(droppedNodes.map((node) => ensureCanvasNodeAsset({ canvasId, domainProjectId, folderId, node, source: "canvas-manual" }))))
                .then((results) => {
                    const archivedByNodeId = new Map<string, ArchivedNodeSnapshot>(
                        droppedNodes.map((node, index) => [node.id, { assetId: results[index].assetId, content: node.metadata?.content, previousAssetId: node.metadata?.assetId }]),
                    );
                    setNodes((current) => applyArchivedAssetIds(current, archivedByNodeId));
                    void refetchLinkedProject();
                    message.success(`已归档到“${folder.title}”`);
                })
                .catch((error) => message.error(error instanceof Error ? error.message : "素材归档失败"));
        },
        [canvasId, linkedProjectId, message, refetchLinkedProject, setNodes],
    );

    useEffect(() => {
        if (!projectLoaded || !projectAssets) return;
        setNodes((current) => refreshCanvasCharacterReferenceNodes(current, projectAssets));
    }, [projectAssets, projectLoaded, setNodes]);

    useEffect(() => {
        if (!projectFolders?.length) return;
        const byId = new Map(projectFolders.map((folder) => [folder.id, folder]));
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                const folderMetadata = node.metadata?.folder;
                if (!folderMetadata?.assetFolderId) return node;
                const folder = byId.get(folderMetadata.assetFolderId);
                if (!folder) return node;
                const { style, theme } = resolveLinkedFolderAppearance(folder);
                if (node.title === folder.name && folderMetadata.style === style && folderMetadata.theme === theme) return node;
                changed = true;
                return { ...node, title: folder.name, metadata: { ...node.metadata, folder: { ...folderMetadata, style, theme, themeCover: undefined } } };
            });
            return changed ? next : current;
        });
    }, [projectFolders, setNodes]);

    return { archiveNodesToLinkedFolder };
}

type UseCanvasLinkedProjectFolderInteractionsOptions = {
    assets: Asset[];
    linkedProjectId: string;
    projectAssets: ProjectAsset[] | undefined;
    projectFolders: ProjectAssetFolder[] | undefined;
    projectAssetInsertPosition: Position | undefined;
    nodesRef: MutableRefObject<CanvasNodeData[]>;
    createFolder: CreateLinkedFolder;
    openProjectAssets: OpenProjectAssets;
    toggleFrameCollapsed: (nodeId: string) => void;
};

export function useCanvasLinkedProjectFolderInteractions({
    assets,
    linkedProjectId,
    projectAssets,
    projectFolders,
    projectAssetInsertPosition,
    nodesRef,
    createFolder,
    openProjectAssets,
    toggleFrameCollapsed,
}: UseCanvasLinkedProjectFolderInteractionsOptions) {
    const handleProjectFolderInsert = useCallback(
        (folderId: string) => {
            const folder = projectFolders?.find((item) => item.id === folderId);
            if (!folder || !linkedProjectId) throw new Error("素材文件夹已不存在，请刷新后重试");
            const { style, theme } = resolveLinkedFolderAppearance(folder);
            createFolder(projectAssetInsertPosition, { id: folder.id, projectId: linkedProjectId, title: folder.name, style, theme, createdAt: folder.createdAt });
        },
        [createFolder, linkedProjectId, projectAssetInsertPosition, projectFolders],
    );

    const handleFrameToggle = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            const linkedFolderId = node?.metadata?.folder?.assetFolderId;
            if (linkedFolderId) {
                openProjectAssets("all", node ? { x: node.position.x + node.width + 40, y: node.position.y } : undefined, "canvas", linkedFolderId);
                return;
            }
            toggleFrameCollapsed(nodeId);
        },
        [nodesRef, openProjectAssets, toggleFrameCollapsed],
    );

    const linkedFolderPreviewNodesById = useMemo(() => buildLinkedFolderPreviewNodes(assets, projectAssets || []), [assets, projectAssets]);

    return { handleFrameToggle, handleProjectFolderInsert, linkedFolderPreviewNodesById };
}
