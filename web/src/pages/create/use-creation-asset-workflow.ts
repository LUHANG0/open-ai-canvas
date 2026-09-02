import { useCallback, useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";

import type { AssetLibraryPickerItem } from "@/components/assets/asset-library-picker-modal";
import { useExternalAssetSources } from "@/hooks/use-external-asset-sources";
import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import type { Asset, NewAsset } from "@/stores/use-asset-store";
import {
    creationAttachmentFromAsset,
    creationAttachmentFromAudio,
    creationAttachmentFromAudioAsset,
    creationAttachmentFromDocument,
    creationAttachmentFromExternalAsset,
    creationAttachmentFromImage,
    creationAttachmentFromVideo,
    creationAttachmentFromVideoAsset,
    creationAttachmentKind,
    creationAttachmentLimit,
    creationAudioAsset,
    creationImageAsset,
    creationVideoAsset,
    countCreationAttachments,
    filterCreationUploadFiles,
    reconcileCreationAttachmentLimits,
    type CreationAttachment,
    type CreationAttachmentKind,
    type CreationAttachmentLimits,
} from "./creation-assets";
import type { CreationMode } from "./creation-empty-state";

type CreationToast = {
    success: (content: string) => unknown;
    info: (content: string) => unknown;
    warning: (content: string) => unknown;
    error: (content: string) => unknown;
};

type CreationAssetWorkflowOptions = {
    toast: CreationToast;
    mode: CreationMode;
    selectedModel: string;
    attachments: CreationAttachment[];
    setAttachments: Dispatch<SetStateAction<CreationAttachment[]>>;
    maxReferences: number;
    referenceLimits: CreationAttachmentLimits;
    assets: Asset[];
    addAsset: (asset: NewAsset) => string;
    busy: boolean;
    normalizeVideoAttachments: (attachments: CreationAttachment[]) => CreationAttachment[];
    replaceAttachmentReference: (targetAttachmentId: string, replacement: CreationAttachment) => boolean;
};

const creationModeLabels: Record<CreationMode, string> = { text: "文本", image: "图片", video: "视频" };

export function mergeUploadedCreationAttachments(input: {
    current: CreationAttachment[];
    uploaded: CreationAttachment[];
    mode: CreationMode;
    referenceLimits: CreationAttachmentLimits;
    maxReferences: number;
    normalizeVideoAttachments?: (attachments: CreationAttachment[]) => CreationAttachment[];
}) {
    const merged = [...input.current, ...input.uploaded.filter((item) => !input.current.some((currentItem) => currentItem.id === item.id))];
    const byKind = reconcileCreationAttachmentLimits(merged, input.mode, input.referenceLimits).attachments;
    const limited = input.mode === "text" ? byKind.slice(0, input.maxReferences) : byKind;
    return input.mode === "video" && input.normalizeVideoAttachments ? input.normalizeVideoAttachments(limited) : limited;
}

export function useCreationAssetWorkflow(options: CreationAssetWorkflowOptions) {
    const {
        toast,
        mode,
        selectedModel,
        attachments,
        setAttachments,
        maxReferences,
        referenceLimits,
        assets,
        addAsset,
        busy,
        normalizeVideoAttachments,
        replaceAttachmentReference,
    } = options;
    const [referenceReplacementBusy, setReferenceReplacementBusy] = useState(false);
    const [pendingUploadCount, setPendingUploadCount] = useState(0);
    const [uploadError, setUploadError] = useState("");
    const pendingUploadCountRef = useRef(0);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const externalAssetSources = useExternalAssetSources(libraryOpen);
    const referenceCounts = useMemo(() => countCreationAttachments(attachments), [attachments]);

    const attachmentDisabledReason = useCallback(
        (kind: CreationAttachmentKind, alreadySelected = false, ignoreCapacity = false) => {
            if (!selectedModel) return `请先选择可用${creationModeLabels[mode]}模型`;
            if (alreadySelected) return undefined;
            if (!ignoreCapacity && mode === "text" && attachments.length >= maxReferences) return `文本创作最多添加 ${maxReferences} 个参考内容`;
            const limit = creationAttachmentLimit(mode, referenceLimits, kind);
            const label = kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : "文件";
            if (limit <= 0) return mode === "image" ? "图片创作仅支持参考图" : `当前模型不支持参考${label}`;
            if (!ignoreCapacity && referenceCounts[kind] >= limit) return `当前模型最多支持 ${limit} 个参考${label}`;
            return undefined;
        },
        [attachments.length, maxReferences, mode, referenceCounts, referenceLimits, selectedModel],
    );

    const externalLibraryItems = useMemo<AssetLibraryPickerItem[]>(
        () =>
            externalAssetSources.items.map((item) => ({
                ...item,
                disabledReason:
                    item.external?.item.kind === "image" || item.external?.item.kind === "video" || item.external?.item.kind === "audio"
                        ? attachmentDisabledReason(item.external.item.kind, attachments.some((attachment) => attachment.id === item.id), true)
                        : "当前素材类型不能作为创作参考",
            })),
        [attachmentDisabledReason, attachments, externalAssetSources.items],
    );

    const libraryItems = useMemo<AssetLibraryPickerItem[]>(
        () => [
            ...assets
                .filter((asset): asset is Extract<Asset, { kind: "image" | "video" | "audio" }> => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio")
                .map((asset) => ({
                    id: asset.id,
                    title: asset.title,
                    category: asset.category || "other",
                    kindLabel: asset.kind === "video" ? "视频" : asset.kind === "audio" ? "音频" : "图片",
                    asset,
                    searchText: (asset.tags || []).join(" "),
                    disabledReason: attachmentDisabledReason(asset.kind, attachments.some((attachment) => attachment.id === `asset:${asset.id}`), true),
                })),
            ...externalLibraryItems,
        ],
        [assets, attachmentDisabledReason, attachments, externalLibraryItems],
    );

    const uploadCreationAsset = async (file: File) => {
        if (file.type.startsWith("video/")) {
            const uploaded = await uploadMediaFile(file, "create-upload");
            return {
                asset: creationVideoAsset({ title: file.name, uploaded, metadata: { source: "create-upload", fileName: file.name } }),
                attachment: creationAttachmentFromVideo(file, uploaded),
            };
        }
        if (file.type.startsWith("audio/")) {
            const uploaded = await uploadMediaFile(file, "create-upload");
            return {
                asset: creationAudioAsset({ title: file.name, uploaded, metadata: { source: "create-upload", fileName: file.name } }),
                attachment: creationAttachmentFromAudio(file, uploaded),
            };
        }
        if (!file.type.startsWith("image/")) {
            const uploaded = await uploadMediaFile(file, "create-upload");
            return { attachment: creationAttachmentFromDocument(file, uploaded) };
        }
        const uploaded = await uploadImage(file);
        return {
            asset: creationImageAsset({ title: file.name, uploaded, metadata: { source: "create-upload", fileName: file.name } }),
            attachment: creationAttachmentFromImage(file, uploaded),
        };
    };

    const trackUploadBatch = useCallback(async <T,>(count: number, operation: () => Promise<T>) => {
        if (count <= 0) return operation();
        pendingUploadCountRef.current += count;
        setPendingUploadCount(pendingUploadCountRef.current);
        setUploadError("");
        try {
            return await operation();
        } catch (error) {
            setUploadError(error instanceof Error ? error.message : "素材上传失败，请重试");
            throw error;
        } finally {
            pendingUploadCountRef.current = Math.max(0, pendingUploadCountRef.current - count);
            setPendingUploadCount(pendingUploadCountRef.current);
        }
    }, []);

    const addAttachments = (files: FileList | File[]) => {
        const filtered = filterCreationUploadFiles(Array.from(files), mode, referenceLimits, attachments);
        const remainingTotal = mode === "text" ? Math.max(0, maxReferences - attachments.length) : filtered.acceptedFiles.length;
        const next = filtered.acceptedFiles.slice(0, remainingTotal);
        const rejectedCount = filtered.rejectedFiles.length + Math.max(0, filtered.acceptedFiles.length - next.length);
        if (rejectedCount) toast.warning(`${rejectedCount} 个素材超出当前模型的类型或数量限制`);
        if (!next.length) return;
        void trackUploadBatch(next.length, async () => {
            const settled = await Promise.allSettled(
                next.map(async (file) => {
                    const { asset, attachment } = await uploadCreationAsset(file);
                    if (asset) addAsset(asset);
                    return attachment;
                }),
            );
            const items = settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
            const failed = settled.filter((entry) => entry.status === "rejected");
            if (items.length) {
                setAttachments((current) =>
                    mergeUploadedCreationAttachments({ current, uploaded: items, mode, referenceLimits, maxReferences, normalizeVideoAttachments }),
                );
            }
            if (failed.length) {
                const message = `${failed.length} 个参考素材上传失败，请重试`;
                setUploadError(message);
                toast.error(message);
            }
        });
    };

    const uploadLibraryAssets = async (files: FileList | File[]) => {
        const requested = Array.from(files);
        const next = requested.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/"));
        const unsupportedCount = requested.length - next.length;
        if (unsupportedCount) toast.warning(`${unsupportedCount} 个文件暂不能保存到素材库；目前支持图片、视频和音频`);
        if (!next.length) return [];
        return trackUploadBatch(next.length, async () => {
            const settled = await Promise.allSettled(
                next.map(async (file) => {
                    const { asset } = await uploadCreationAsset(file);
                    return asset ? addAsset(asset) : "";
                }),
            );
            const assetIds = settled.flatMap((entry) => (entry.status === "fulfilled" && entry.value ? [entry.value] : []));
            const failed = settled.filter((entry) => entry.status === "rejected");
            if (assetIds.length) toast.success(`${assetIds.length} 个素材已保存到素材库`);
            if (failed.length) {
                const message = `${failed.length} 个素材上传失败，请重试`;
                setUploadError(message);
                toast.error(message);
            }
            return assetIds;
        });
    };

    const hasReferenceCapacity = () => {
        if (!selectedModel) return false;
        if (mode === "text" && attachments.length >= maxReferences) return false;
        return (["image", "video", "audio", "file"] as const).some((kind) => referenceCounts[kind] < creationAttachmentLimit(mode, referenceLimits, kind));
    };

    const addOrStoreLocalFiles = (files: FileList | File[]) => {
        const requested = Array.from(files);
        if (!requested.length) return;
        if (pendingUploadCountRef.current > 0) {
            toast.info("已有素材正在上传，请等待完成后再继续添加");
            return;
        }
        if (!hasReferenceCapacity()) {
            void uploadLibraryAssets(requested);
            return;
        }

        const filtered = filterCreationUploadFiles(requested, mode, referenceLimits, attachments);
        const remainingTotal = mode === "text" ? Math.max(0, maxReferences - attachments.length) : filtered.acceptedFiles.length;
        const attachable = filtered.acceptedFiles.slice(0, remainingTotal);
        const libraryOnly = [...filtered.acceptedFiles.slice(remainingTotal), ...filtered.rejectedFiles];
        if (attachable.length) addAttachments(attachable);
        if (libraryOnly.length) {
            toast.info(`${libraryOnly.length} 个素材不适合当前生成配置，已改为保存到素材库`);
            void uploadLibraryAssets(libraryOnly);
        }
    };

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) addOrStoreLocalFiles(event.target.files);
        event.target.value = "";
    };

    const handleLibrarySelect = (selectedIds: string[]) => {
        const selectedIdSet = new Set(selectedIds);
        const next = selectedIds.flatMap((id): CreationAttachment[] => {
            const asset = assets.find((item) => item.id === id);
            if (asset?.kind === "image") return [creationAttachmentFromAsset(asset)];
            if (asset?.kind === "video" && mode !== "image") return [creationAttachmentFromVideoAsset(asset)];
            if (asset?.kind === "audio" && mode !== "image") return [creationAttachmentFromAudioAsset(asset)];
            const external = libraryItems.find((item) => item.id === id)?.external;
            return external ? [creationAttachmentFromExternalAsset(external)] : [];
        });
        if (selectedIds.length && !next.length) throw new Error("所选素材不能用于当前生成配置，请更换模型或素材类型");
        const retainedAttachments = attachments.filter((item) => {
            const libraryId = item.id.startsWith("asset:") ? item.id.slice(6) : item.id.startsWith("external:") ? item.id : "";
            return !libraryId || selectedIdSet.has(libraryId);
        });
        const merged = [...retainedAttachments.filter((item) => !next.some((candidate) => candidate.id === item.id)), ...next];
        const reconciled = reconcileCreationAttachmentLimits(merged, mode, referenceLimits);
        if (reconciled.removedAttachments.length || (mode === "text" && merged.length > maxReferences)) {
            throw new Error("所选素材超过当前模型的类型或数量上限，请减少选择后再试");
        }
        setAttachments(mode === "video" ? normalizeVideoAttachments(merged) : merged);
        setLibraryOpen(false);
    };

    const replaceReferenceFromFiles = useCallback(
        async (targetAttachmentId: string, files: File[]) => {
            if (busy || referenceReplacementBusy || pendingUploadCountRef.current > 0) return;
            const file = files.find((item) => item.type.startsWith("image/"));
            if (!file) {
                toast.warning("请拖入图片文件进行替换");
                return;
            }
            setReferenceReplacementBusy(true);
            try {
                const { asset, attachment } = await trackUploadBatch(1, () => uploadCreationAsset(file));
                if (creationAttachmentKind(attachment) !== "image") throw new Error("上传结果不是可用图片");
                if (asset) addAsset(asset);
                if (replaceAttachmentReference(targetAttachmentId, attachment)) toast.success("参考图已替换，槽位不变，提示词无需修改");
            } catch (error) {
                const message = error instanceof Error ? error.message : "参考图上传或替换失败";
                setUploadError(message);
                toast.error(message);
            } finally {
                setReferenceReplacementBusy(false);
            }
        },
        [addAsset, busy, referenceReplacementBusy, replaceAttachmentReference, toast, trackUploadBatch],
    );

    return {
        referenceReplacementBusy,
        pendingUploadCount,
        pendingUploadCountRef,
        uploadError,
        dismissUploadError: () => setUploadError(""),
        libraryOpen,
        setLibraryOpen,
        externalAssetSources,
        libraryItems,
        trackUploadBatch,
        uploadLibraryAssets,
        addOrStoreLocalFiles,
        handleFileChange,
        handleLibrarySelect,
        replaceReferenceFromFiles,
    };
}
