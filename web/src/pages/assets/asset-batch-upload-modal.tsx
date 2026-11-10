import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Progress } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/ui/base/badges";
import { FileImage, FileText, UploadCloud, X } from "lucide-react";

import { ASSET_ASSIGNABLE_CATEGORY_OPTIONS, type AssetCategory } from "@/lib/asset-category";
import { uploadImage } from "@/services/image-storage";
import { localSavedRemotePendingMessage, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { flushAssetStorePersistence, useAssetStore } from "@/stores/use-asset-store";
import type { AssetFolder } from "@/services/api/user-data";
import { Select } from "@/components/ui/base/select";
import { ASSET_UPLOAD_ACCEPT, isAssetUploadDocument, uploadAssetDocument } from "./asset-document-upload";
import { isLegacyWordUploadFile, unsupportedDocumentUploadMessage } from "@/lib/document-upload";
import { captureUploadScope } from "@/services/upload-scope";
import { useUserStore } from "@/stores/use-user-store";

type BatchItem = { id: string; file: File; status: "queued" | "uploading" | "done" | "error"; error?: string; percent?: number };

export function AssetBatchUploadModal({ open, defaultFolderId, folders, onClose, afterClose, onComplete }: { open: boolean; defaultFolderId: string; folders: AssetFolder[]; onClose: () => void; afterClose?: () => void; onComplete: () => Promise<void> }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const addAsset = useAssetStore((state) => state.addAsset);
    const [items, setItems] = useState<BatchItem[]>([]);
    const [category, setCategory] = useState<AssetCategory>("material");
    const [folderId, setFolderId] = useState(defaultFolderId);
    const [tags, setTags] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const batchRef = useRef<AbortController | null>(null);
    useEffect(() => {
        const unsubscribe = useUserStore.subscribe((next, previous) => {
            if (next.user?.id !== previous.user?.id || (!next.hydrated && previous.hydrated)) {
                batchRef.current?.abort();
                setItems([]);
                setTags([]);
                setFolderId("");
                setUploading(false);
                setDragging(false);
            }
        });
        return () => { unsubscribe(); batchRef.current?.abort(); };
    }, []);
    const doneCount = items.filter((item) => item.status === "done").length;
    const failedItems = items.filter((item) => item.status === "error");
    const hasFiles = items.length > 0;
    const folderOptions = useMemo(() => [{ label: t("library.assets.uncategorized"), value: "" }, ...folders.map((folder) => ({ label: folder.name, value: folder.id }))], [folders, t]);

    const chooseFiles = (files: File[]) => {
        if (batchRef.current) return;
        const accepted = files.filter((file) => file.type.startsWith("image/") || isAssetUploadDocument(file));
        const unsupported = files.find((file) => !accepted.includes(file));
        if (unsupported) message.warning(isLegacyWordUploadFile(unsupported) ? unsupportedDocumentUploadMessage(unsupported) : "素材库支持图片和 Word（.docx）文档");
        if (!accepted.length) {
            return;
        }
        setItems((current) => [...current, ...accepted.map((file) => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, status: "queued" as const }))]);
    };

    const uploadBatch = async () => {
        const pending = items.filter((item) => item.status === "queued" || item.status === "error");
        if (!pending.length || batchRef.current) return;
        const controller = new AbortController();
        batchRef.current = controller;
        const scope = captureUploadScope({ signal: controller.signal });
        const isCurrent = () => { try { scope.assertCurrent(); return true; } catch { return false; } };
        setUploading(true);
        let cursor = 0;
        const worker = async () => {
            while (cursor < pending.length && isCurrent()) {
                const item = pending[cursor++];
                setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "uploading", percent: 10, error: undefined } : entry));
                try {
                    const onProgress = (loaded: number, total: number) => {
                        if (!isCurrent()) return;
                        const percent = total > 0 ? Math.min(95, Math.max(10, Math.round((loaded / total) * 95))) : 10;
                        setItems((current) => current.map((entry) => entry.id === item.id && entry.status === "uploading" ? { ...entry, percent } : entry));
                    };
                    if (isAssetUploadDocument(item.file)) {
                        const document = await uploadAssetDocument(item.file, { ...scope.options, idempotencyKey: `asset-document:${item.id}` }, onProgress);
                        if (!isCurrent()) return;
                        addAsset({ ...document, category, folderId: folderId || undefined, tags });
                    } else {
                        // uploadImage 已从本地文件读取尺寸，不再回读远端地址。
                        const uploaded = await uploadImage(item.file, onProgress, scope.options);
                        if (!isCurrent()) return;
                        addAsset({ kind: "image", title: item.file.name.replace(/\.[^.]+$/, ""), category, folderId: folderId || undefined, coverUrl: uploaded.url, tags, source: "批量上传", metadata: { source: "manual-batch" }, data: { dataUrl: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width, height: uploaded.height, bytes: uploaded.bytes, mimeType: uploaded.mimeType } });
                    }
                    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "done", percent: 100 } : entry));
                    succeeded++;
                } catch (error) {
                    if (!isCurrent()) return;
                    failed++;
                    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "error", error: error instanceof Error ? error.message : t("library.assets.batch.uploadFailed") } : entry));
                }
            }
        };
        let succeeded = 0;
        let failed = 0;
        let syncError: unknown = null;
        try {
            await Promise.all(Array.from({ length: Math.min(4, pending.length) }, () => worker()));
            if (succeeded && isCurrent()) {
                // flush 可能抛出此前其他生成任务遗留的写入失败，不能让它卡住本次上传的收尾。
                await flushAssetStorePersistence().catch((error) => { syncError = error; });
                if (isCurrent()) await saveRemoteUserDataNow([]).catch((error) => { syncError ??= error; });
            }
        } finally {
            batchRef.current = null;
            if (isCurrent()) setUploading(false);
        }
        if (!isCurrent()) return;
        if (syncError) message.warning(localSavedRemotePendingMessage(t("library.assets.batch.partialLocal"), syncError));
        // 有失败项时保留弹窗，失败标记与「重试失败项」仍可见；关闭时再刷新列表。
        if (!failed) await onComplete();
    };

    const close = () => {
        if (uploading || batchRef.current) return;
        const hasUploaded = items.some((item) => item.status === "done");
        setItems([]);
        setTags([]);
        setFolderId(defaultFolderId);
        if (hasUploaded) void onComplete();
        else onClose();
    };

    return <AppModal className="library-modal library-batch-upload-modal" title="上传素材" open={open} onCancel={close} footer={null} destroyOnHidden focusable={afterClose ? { focusTriggerAfterClose: false } : undefined} afterClose={afterClose}>
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-medium text-foreground/65">业务分类<Select ariaLabel="批量上传业务分类" className="mt-1 w-full" value={category} options={ASSET_ASSIGNABLE_CATEGORY_OPTIONS} onChange={(value) => setCategory(value)} /></label>
                <label className="text-xs font-medium text-foreground/65">自定义分类<Select ariaLabel="批量上传自定义分类" className="mt-1 w-full" value={folderId} options={folderOptions} onChange={setFolderId} /></label>
                <label className="text-xs font-medium text-foreground/65">公共标签<Select ariaLabel="批量上传公共标签" mode="tags" className="mt-1 w-full" value={tags} tokenSeparators={[",", "，"]} onChange={setTags} placeholder="输入后回车" /></label>
            </div>
            <button
                type="button"
                className={dragging ? "batch-upload-dropzone is-dragging" : "batch-upload-dropzone"}
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
                onDrop={(event) => { event.preventDefault(); setDragging(false); if (!uploading) chooseFiles(Array.from(event.dataTransfer.files)); }}
            >
                <UploadCloud className="size-7" /><strong>选择图片或 Word 文档</strong><span>{t("library.assets.batch.chooseHint")}</span><span>Word 支持 .docx，上传后可预览、编辑正文并插入画布</span>
            </button>
            <input ref={inputRef} type="file" hidden accept={ASSET_UPLOAD_ACCEPT} disabled={uploading} multiple onChange={(event) => { chooseFiles(Array.from(event.target.files || [])); event.currentTarget.value = ""; }} />
            {hasFiles ? <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-foreground/55"><span>{t("library.assets.batch.summary", { total: items.length, done: doneCount })}</span><button type="button" className="text-foreground/45 hover:text-foreground" onClick={() => setItems([])} disabled={uploading}>{t("library.assets.batch.clear")}</button></div>
                <div className="batch-upload-list">{items.map((item) => <div key={item.id} className="batch-upload-item">{isAssetUploadDocument(item.file) ? <FileText className="size-4 shrink-0 text-foreground/45" /> : <FileImage className="size-4 shrink-0 text-foreground/45" />}<span className="min-w-0 flex-1"><span className="block truncate" title={item.file.name}>{item.file.name}</span>{item.status === "error" && item.error ? <span className="block truncate text-[var(--fs-label)] text-red-500" title={item.error}>{item.error}</span> : null}</span>{item.status === "uploading" ? <div className="w-20 shrink-0"><Progress percent={item.percent || 10} size="small" showInfo={false} /></div> : item.status === "done" ? <StatusBadge tone="success" size="sm" label={t("library.assets.batch.done")} /> : item.status === "error" ? <StatusBadge tone="error" size="sm" label={t("library.assets.batch.failed")} title={item.error} /> : <StatusBadge tone="neutral" size="sm" label={t("library.assets.batch.queued")} />}<button type="button" aria-label={t("library.assets.batch.removeItem", { name: item.file.name })} title={t("library.assets.batch.remove")} className="batch-upload-remove" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} disabled={uploading}><X className="size-3.5" /></button></div>)}</div>
            </div> : null}
            <div className="flex justify-end gap-2"><Button onClick={close} disabled={uploading}>{t("common.cancel")}</Button><Button type="primary" icon={<UploadCloud className="size-4" />} onClick={() => void uploadBatch()} disabled={!items.some((item) => item.status === "queued" || item.status === "error")} loading={uploading}>{failedItems.length ? t("library.assets.batch.retryFailed", { count: failedItems.length }) : t("library.assets.batch.start")}</Button></div>
        </div>
    </AppModal>;
}
