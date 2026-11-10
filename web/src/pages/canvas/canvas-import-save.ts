import { translate } from "@/i18n";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { CanvasSyncPendingError } from "@/lib/canvas/sync-recovery";
import { canvasNodeToAsset, findCanvasNodeAsset } from "@/lib/canvas/canvas-node-asset";
import { useAssetStore } from "@/stores/use-asset-store";
import { setImageBlob } from "@/services/image-storage";
import { getActiveUserScope } from "@/lib/user-scope";

type CanvasImportContent = { nodes: CanvasNodeData[]; connections: CanvasConnection[] };
type CanvasImportPersistence = {
    canvasId: string;
    sessionScope?: string;
    read: () => CanvasImportContent;
    write: (content: CanvasImportContent) => void;
    persistLocal: () => Promise<void>;
    syncRemote: () => Promise<void>;
};

export type CanvasImportSaveStatus = "synced" | "pending";

export async function applyCanvasImport(nodes: CanvasNodeData[], connections: CanvasConnection[], persistence: CanvasImportPersistence): Promise<CanvasImportSaveStatus> {
    if (!persistence.canvasId.trim()) throw new Error("请先打开有效画布再导入");
    const scope = persistence.sessionScope ?? getActiveUserScope();
    const requireCurrentSession = () => {
        if (scope !== getActiveUserScope()) throw new Error("账号已切换，已停止旧账号的画布导入");
    };
    requireCurrentSession();
    const preparedNodes = await Promise.all(nodes.map((node) => prepareImportImage(node, scope)));
    requireCurrentSession();
    const current = persistence.read();
    const nodeIds = new Set(current.nodes.map((node) => node.id));
    const connectionIds = new Set(current.connections.map((connection) => connection.id));
    persistence.write({
        nodes: [
            ...current.nodes,
            ...preparedNodes
                .filter((node) => {
                    if (nodeIds.has(node.id)) return false;
                    nodeIds.add(node.id);
                    return true;
                })
                .map((node) => bindImportAsset(persistence.canvasId, node)),
        ],
        connections: [
            ...current.connections,
            ...connections.filter((connection) => {
                if (connectionIds.has(connection.id)) return false;
                connectionIds.add(connection.id);
                return true;
            }),
        ],
    });
    try {
        await persistence.persistLocal();
    } catch (error) {
        requireCurrentSession();
        throw new Error("导入内容仍在当前页面，本地保存未完成，请重试保存", { cause: error });
    }
    requireCurrentSession();
    try {
        await persistence.syncRemote();
    } catch (error) {
        requireCurrentSession();
        // 等待上限不取消后台事务；恢复旧数组会删除已提交节点或等待期间的编辑。
        if (error instanceof CanvasSyncPendingError) return "pending";
        throw new Error(`导入内容已在本机保存，云端保存未完成：${error instanceof Error ? error.message : "请重试保存"}`, { cause: error });
    }
    requireCurrentSession();
    return "synced";
}

function bindImportAsset(canvasId: string, node: CanvasNodeData): CanvasNodeData {
    if (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) return node;
    const store = useAssetStore.getState();
    const existing = findCanvasNodeAsset(store.assets, node, canvasId);
    const input = existing ? null : canvasNodeToAsset(node, { canvasId, source: "canvas-upload" });
    const assetId = existing?.id || (input ? store.addAsset(input) : undefined);
    // 绑定同时写入编辑器与持久化快照，避免后台补出的 assetId 被下一次编辑覆盖。
    return assetId ? { ...node, metadata: { ...node.metadata, assetId } } : node;
}


async function prepareImportImage(node: CanvasNodeData, scope: string): Promise<CanvasNodeData> {
    const content = node.metadata?.content;
    if (node.type !== CanvasNodeType.Image || node.metadata?.storageKey || !content?.startsWith("data:image/")) return node;
    // 刷新时素材缓存会恢复内嵌图片；先与节点共用一个本地 key，避免各自上传成不同资源。
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (scope !== getActiveUserScope()) throw new Error("账号已切换，已停止旧账号的画布导入");
    const blob = await (await fetch(content)).blob();
    if (scope !== getActiveUserScope()) throw new Error("账号已切换，已停止旧账号的画布导入");
    const storageKey = `image:${scope}:canvas-import:${hash}`;
    const url = await setImageBlob(storageKey, blob);
    return { ...node, metadata: { ...node.metadata, storageKey, content: url, ...(node.metadata?.previewContent === content ? { previewContent: url } : {}) } };
}
