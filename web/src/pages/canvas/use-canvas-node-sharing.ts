import { useCallback, useState } from "react";
import copyToClipboard from "copy-to-clipboard";
import { App, Modal } from "antd";
import { imageMetadata } from "@/lib/canvas/canvas-generation-task-sync";
import { resourceFileUrl, resourceIdFromStorageKey, syncResourceToArkPrivateAsset } from "@/services/api/resources";
import { uploadImage } from "@/services/image-storage";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

type UseCanvasNodeSharingOptions = {
    onMetadataChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    releaseCopiedNodesPastePriority: () => void;
};

export function resolveCanvasNodeCopySource(node: CanvasNodeData | null) {
    const content = node?.metadata?.content?.trim();
    if (content) return content;
    if (node?.type !== CanvasNodeType.Image) return "";
    const resourceId = resourceIdFromStorageKey(node.metadata?.storageKey);
    return resourceId ? resourceFileUrl(resourceId) : "";
}

export function resolveCanvasNodeMediaURL(node: CanvasNodeData | null, baseURL: string) {
    const content = node?.metadata?.content?.trim();
    const resourceId = resourceIdFromStorageKey(node?.metadata?.storageKey);
    const mediaPath = content && !content.startsWith("data:") && !content.startsWith("blob:") ? content : resourceId ? resourceFileUrl(resourceId) : "";
    return mediaPath ? new URL(mediaPath, baseURL).toString() : "";
}

async function convertClipboardImageToPNG(blob: Blob) {
    if (typeof createImageBitmap !== "function") throw new Error("当前浏览器无法转换这张图片的格式");
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("当前浏览器无法处理这张图片");
        context.drawImage(bitmap, 0, 0);
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("图片格式转换失败"))), "image/png"));
    } finally {
        bitmap.close();
    }
}

async function copyImageToSystemClipboard(source: string) {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("当前浏览器不支持复制图片");
    const response = await fetch(source);
    if (!response.ok) throw new Error(`图片读取失败（HTTP ${response.status}）`);
    const sourceBlob = await response.blob();
    const blob = sourceBlob.type === "image/png" ? sourceBlob : await convertClipboardImageToPNG(sourceBlob);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function useCanvasNodeSharing({ onMetadataChange, releaseCopiedNodesPastePriority }: UseCanvasNodeSharingOptions) {
    const { message } = App.useApp();
    const [arkPrivateAssetUploadNodeId, setArkPrivateAssetUploadNodeId] = useState<string | null>(null);

    const copyNodeContentToClipboard = useCallback(
        async (node: CanvasNodeData | null) => {
            releaseCopiedNodesPastePriority();
            const copySource = resolveCanvasNodeCopySource(node);
            if (!node || !copySource) {
                message.warning("没有可复制的内容");
                return;
            }

            try {
                if (node.type === CanvasNodeType.Image) {
                    await copyImageToSystemClipboard(copySource);
                    message.success("图片已复制");
                    return;
                }

                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(copySource);
                else if (!copyToClipboard(copySource)) throw new Error("当前浏览器不支持写入剪贴板");
                message.success(node.type === CanvasNodeType.Text ? "文本已复制" : "内容链接已复制");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "复制失败，请检查浏览器剪贴板权限");
            }
        },
        [message, releaseCopiedNodesPastePriority],
    );

    const copyNodeMediaUrlToClipboard = useCallback(
        async (node: CanvasNodeData | null) => {
            releaseCopiedNodesPastePriority();
            try {
                const mediaURL = resolveCanvasNodeMediaURL(node, window.location.href);
                if (!mediaURL) throw new Error("当前媒体只有本地内容，没有可复制的地址");
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(mediaURL);
                else if (!copyToClipboard(mediaURL)) throw new Error("当前浏览器不支持写入剪贴板");
                message.success(node?.type === CanvasNodeType.Video ? "视频地址已复制" : "图片地址已复制");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "媒体地址复制失败");
            }
        },
        [message, releaseCopiedNodesPastePriority],
    );

    const uploadNodeImageToArkPrivateAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning("请选择一张可用图片后再上传");
                return;
            }
            if (arkPrivateAssetUploadNodeId === node.id) return;
            const feedbackKey = `ark-private-asset-${node.id}`;
            setArkPrivateAssetUploadNodeId(node.id);
            message.loading({ key: feedbackKey, content: "正在保存并上传到方舟素材库...", duration: 0 });
            try {
                let resourceID = resourceIdFromStorageKey(node.metadata.storageKey);
                if (!resourceID) {
                    const uploaded = await uploadImage(node.metadata.content);
                    resourceID = resourceIdFromStorageKey(uploaded.storageKey);
                    if (!resourceID) throw new Error("图片未能保存到系统素材库，请检查对象存储配置后重试");
                    onMetadataChange(node.id, imageMetadata(uploaded));
                }
                await syncResourceToArkPrivateAsset(resourceID);
                message.success({ key: feedbackKey, content: "已同步到方舟素材库，Seedance 将自动复用该素材", duration: 4 });
            } catch (error) {
                message.error({ key: feedbackKey, content: error instanceof Error ? error.message : "上传到方舟素材库失败", duration: 5 });
            } finally {
                setArkPrivateAssetUploadNodeId((current) => (current === node.id ? null : current));
            }
        },
        [arkPrivateAssetUploadNodeId, message, onMetadataChange],
    );

    const confirmUploadNodeImageToArkPrivateAsset = useCallback(
        (node: CanvasNodeData) => {
            Modal.confirm({
                title: "上传到方舟素材库",
                content: "仅可上传你拥有肖像、版权或其他合法使用权的图片。方舟审核通过后，Seedance 会使用受控素材标识生成视频。",
                okText: "确认拥有使用权并上传",
                cancelText: "取消",
                onOk: () => uploadNodeImageToArkPrivateAsset(node),
            });
        },
        [uploadNodeImageToArkPrivateAsset],
    );

    return { confirmUploadNodeImageToArkPrivateAsset, copyNodeContentToClipboard, copyNodeMediaUrlToClipboard };
}
