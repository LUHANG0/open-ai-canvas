import { AudioLines, Box, CheckCheck, Clapperboard, Copy, Download, FileText, FileUp, FolderOpen, Image as ImageIcon, Link2, MoreHorizontal, PencilLine, Play, Plus, Trash2, Upload, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { App, Button, Dropdown, Form, Input, Progress, Select, Space, Tag, Typography } from "antd";
import type { MenuProps } from "antd";
import { useNavigate } from "react-router";

import { CollectionGrid, ListToolbar, PageHeader, PaginationBar, WorkspacePage } from "@/components/ui/pc/page";
import { WorkspaceLoadingState, WorkspaceState } from "@/components/ui/pc/workspace-state";
import { LibraryCreateCard } from "@/components/ui/pc/library-create-card";
import { DialogFrame, DrawerFrame, SearchField, SelectionBar, Surface } from "@/components/ui/pc";
import { AssetMediaPreview } from "@/components/asset-media-preview";
import { AssetLibraryCard, AssetLibraryCardMedia } from "@/components/assets/asset-library-card";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { BRAND_CONCEPT_POSTER } from "@/lib/public-site-content";
import { resourceStorageLabel, resourceStorageLocation, resourceStorageTitle } from "@/lib/canvas/resource-storage-status";
import { formatBytes, readFileAsDataUrl, readImageMeta } from "@/lib/image-utils";
import { uploadImage } from "@/services/image-storage";
import { uploadMediaFile } from "@/services/file-storage";
import { useAssetStore, type Asset, type AssetCategory, type AssetKind, type ImageAsset } from "@/stores/use-asset-store";
import { exportAssets, readAssetPackage } from "./asset-transfer";
import { AssetStorageUsage, assetStorageUsageQueryKey } from "./asset-storage-usage";
import { formatAssetDimensions, mergeLoadedVideoMetadata, type LoadedVideoMetadata } from "./video-metadata";
import { deleteAssetWithRemoteSync, getRemoteUserDataSyncStatus, saveRemoteUserDataNow } from "@/services/user-data-sync";

import "./assets-pc.css";

type LibraryAsset = Exclude<Asset, { kind: "entity" }>;

type AssetFormValues = {
    kind: AssetKind;
    category: AssetCategory;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    content?: string;
};

type ImageDraft = ImageAsset["data"] | null;

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "文本", value: "text" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
    { label: "3D 模型", value: "model" },
];

const categoryOptions = [
    { label: "全部分类", value: "all" },
    { label: "角色", value: "character" },
    { label: "场景", value: "environment" },
    { label: "服饰", value: "wardrobe" },
    { label: "道具", value: "prop" },
    { label: "武器", value: "weapon" },
    { label: "画风", value: "style" },
    { label: "其他", value: "other" },
];

const assetKindIcons: Record<LibraryAsset["kind"], LucideIcon> = {
    text: FileText,
    image: ImageIcon,
    video: Clapperboard,
    audio: AudioLines,
    model: Box,
};

export default function AssetsPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const copyText = useCopyText();
    const [form] = Form.useForm<AssetFormValues>();
    const coverInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const modelInputRef = useRef<HTMLInputElement>(null);
    const assets = useAssetStore((state) => state.assets);
    const assetsHydrated = useAssetStore((state) => state.hydrated);
    const addAsset = useAssetStore((state) => state.addAsset);

    const updateAsset = useAssetStore((state) => state.updateAsset);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [categoryFilter, setCategoryFilter] = useState<AssetCategory | "all">("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(35);
    const [editingAsset, setEditingAsset] = useState<LibraryAsset | null>(null);
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [assetSaving, setAssetSaving] = useState(false);
    const assetSavePendingRef = useRef(false);
    const pendingAssetIdRef = useRef<string | null>(null);
    const [previewAsset, setPreviewAsset] = useState<LibraryAsset | null>(null);
    const [deletingAsset, setDeletingAsset] = useState<LibraryAsset | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
    const [transferBusy, setTransferBusy] = useState<"" | "export-all" | "export-selected" | "import" | "model">("");
    const [deleteBusy, setDeleteBusy] = useState(false);

    const [formKind, setFormKind] = useState<AssetKind>("text");
    const [imageDraft, setImageDraft] = useState<ImageDraft>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageUploading, setImageUploading] = useState(false);
    const [imageUploadProgress, setImageUploadProgress] = useState<{ phase: "uploading" | "confirming"; percent?: number } | null>(null);
    // 弹窗挂载前已写入编辑初值，预览也需要读取尚未注册的表单字段。
    const coverUrl = Form.useWatch("coverUrl", { form, preserve: true }) || "";
    const title = Form.useWatch("title", { form, preserve: true }) || "";
    const tags = Form.useWatch("tags", { form, preserve: true }) || [];
    const content = Form.useWatch("content", { form, preserve: true }) || "";
    const validAssets = useMemo(() => assets.filter((asset): asset is LibraryAsset => asset.kind !== "entity"), [assets]);
    const selectedAssets = useMemo(() => validAssets.filter((asset) => selectedIds.includes(asset.id)), [selectedIds, validAssets]);
    const kindCounts = useMemo(() => new Map(kindOptions.map((option) => [option.value, option.value === "all" ? validAssets.length : validAssets.filter((asset) => asset.kind === option.value).length])), [validAssets]);
    const categoryCounts = useMemo(() => new Map(categoryOptions.map((option) => [option.value, option.value === "all" ? validAssets.length : validAssets.filter((asset) => (asset.category || "other") === option.value).length])), [validAssets]);
    const canCreateAsset = !keyword.trim() && kindFilter === "all" && categoryFilter === "all";

    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return validAssets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (categoryFilter !== "all" && (asset.category || "other") !== categoryFilter) return false;
            if (!query) return true;
            return assetSearchText(asset).includes(query);
        });
    }, [validAssets, keyword, kindFilter, categoryFilter]);
    const filteredAssetIds = useMemo(() => filteredAssets.map((asset) => asset.id), [filteredAssets]);
    const allFilteredSelected = filteredAssetIds.length > 0 && filteredAssetIds.every((id) => selectedIds.includes(id));

    const visibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filteredAssets.length, pageSize]);

    useEffect(() => {
        const existingIds = new Set(validAssets.map((asset) => asset.id));
        setSelectedIds((current) => current.filter((id) => existingIds.has(id)));
    }, [validAssets]);

    const openCreate = () => {
        pendingAssetIdRef.current = null;
        setEditingAsset(null);
        setImageDraft(null);
        setImageFile(null);
        setImageUploading(false);
        setImageUploadProgress(null);
        setFormKind("text");
        form.setFieldsValue({ kind: "text", category: "other", title: "", coverUrl: "", tags: [], source: "手动添加", note: "", content: "" });
        setIsAssetOpen(true);
    };

    const openEdit = (asset: LibraryAsset) => {
        pendingAssetIdRef.current = asset.id;
        setEditingAsset(asset);
        setImageFile(null);
        setImageUploading(false);
        setImageUploadProgress(null);
        setFormKind(asset.kind);
        setImageDraft(asset.kind === "image" ? asset.data : null);
        form.setFieldsValue({
            kind: asset.kind,
            category: asset.category || "other",
            title: asset.title,
            coverUrl: asset.coverUrl,
            tags: asset.tags || [],
            source: asset.source,
            note: asset.note,
            content: asset.kind === "text" ? asset.data.content : "",
        });
        setIsAssetOpen(true);
    };

    const saveAsset = async () => {
        if (assetSavePendingRef.current) return;
        assetSavePendingRef.current = true;
        setAssetSaving(true);
        try {
            const values = await form.validateFields();
            let imageData = imageDraft;
            if (values.kind === "image" && imageFile) {
                setImageUploading(true);
                setImageUploadProgress({ phase: "uploading", percent: 0 });
                try {
                    const image = await uploadImage(imageFile);
                    setImageUploadProgress({ phase: "confirming" });
                    imageData = { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType };
                    setImageDraft(imageData);
                    setImageFile(null);
                    void queryClient.invalidateQueries({ queryKey: assetStorageUsageQueryKey });
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "图片上传失败，请重试");
                    return;
                } finally {
                    setImageUploading(false);
                    setImageUploadProgress(null);
                }
            }

            const base = {
                title: values.title.trim(),
                category: values.category,
                status: editingAsset?.status || ("confirmed" as const),
                primaryVersionId: editingAsset?.primaryVersionId,
                coverUrl: values.coverUrl?.trim() || (values.kind === "image" && imageData ? imageData.dataUrl : ""),
                tags: values.tags || [],
                source: values.source?.trim(),
                note: values.note?.trim(),
                metadata: editingAsset?.metadata || { source: "manual" },
            };

            if (values.kind === "text") {
                const asset = { ...base, kind: "text" as const, data: { content: (values.content || "").trim() } };
                if (pendingAssetIdRef.current) updateAsset(pendingAssetIdRef.current, asset);
                else pendingAssetIdRef.current = addAsset(asset);
            } else {
                if (!imageData) {
                    message.error("请选择图片文件");
                    return;
                }
                const asset = { ...base, kind: "image" as const, data: imageData };
                if (pendingAssetIdRef.current) updateAsset(pendingAssetIdRef.current, asset);
                else pendingAssetIdRef.current = addAsset(asset);
            }

            // The login snapshot replaces the cache, so explicit save must finish remotely before closing.
            if (getRemoteUserDataSyncStatus().phase === "inactive") throw new Error("尚未建立云端同步会话");
            await saveRemoteUserDataNow();
            message.success(editingAsset ? "素材已更新到服务端" : "素材已保存到服务端");
            setIsAssetOpen(false);
        } catch (error) {
            if (error && typeof error === "object" && "errorFields" in error) return;
            message.error(`素材未同步，输入已保留：${error instanceof Error ? error.message : "请重试保存"}`);
        } finally {
            assetSavePendingRef.current = false;
            setAssetSaving(false);
        }
    };

    const readCoverFile = async (file?: File) => {
        if (!file) return;
        try {
            const dataUrl = await readFileAsDataUrl(file);
            form.setFieldValue("coverUrl", dataUrl);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "封面读取失败，请重试");
        }
    };

    const readImageFile = async (file?: File) => {
        if (!file || !file.type.startsWith("image/") || imageUploading) return;
        try {
            const dataUrl = await readFileAsDataUrl(file);
            const meta = await readImageMeta(dataUrl);
            setImageFile(file);
            const draft = { dataUrl, storageKey: "", width: meta.width, height: meta.height, bytes: file.size, mimeType: file.type || meta.mimeType };
            setImageDraft(draft);
            if (!form.getFieldValue("coverUrl")) form.setFieldValue("coverUrl", dataUrl);
            if (!form.getFieldValue("title")) form.setFieldValue("title", file.name);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取图片失败，请重试");
        }
    };

    const readModelFile = async (file?: File) => {
        if (!file || !/\.(glb|gltf)$/i.test(file.name) || Boolean(transferBusy)) return;
        setTransferBusy("model");
        try {
            const uploaded = await uploadMediaFile(file);
            void queryClient.invalidateQueries({ queryKey: assetStorageUsageQueryKey });
            addAsset({
                kind: "model",
                title: file.name.replace(/\.(glb|gltf)$/i, ""),
                coverUrl: "",
                tags: ["3D模型"],
                source: "手动上传",
                data: { url: uploaded.url, storageKey: uploaded.storageKey, bytes: uploaded.bytes, mimeType: uploaded.mimeType, fileName: file.name },
                metadata: { source: "manual" },
            });
            message.success("3D 模型已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "3D 模型上传失败");
        } finally {
            setTransferBusy("");
        }
    };

    const copyAssetText = async (asset: LibraryAsset) => {
        if (asset.kind !== "text") return;
        copyText(asset.data.content, "文本已复制");
    };

    const downloadImage = (asset: LibraryAsset) => {
        if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio" && asset.kind !== "model") return;
        const url = asset.kind === "image" ? asset.data.dataUrl : asset.data.url;
        const extension = asset.kind === "model" ? asset.data.fileName.split(".").pop() || "glb" : asset.data.mimeType.split("/")[1] || "png";
        saveAs(url, `${asset.title || "asset"}.${extension}`);
    };

    const exportAllAssets = async () => {
        if (!validAssets.length) {
            message.warning("暂无素材可导出");
            return;
        }
        setTransferBusy("export-all");
        try {
            await exportAssets(validAssets);
            message.success(`已导出 ${validAssets.length} 个素材`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材导出失败");
        } finally {
            setTransferBusy("");
        }
    };

    const importAssetZip = async (file?: File) => {
        if (!file || Boolean(transferBusy)) return;
        setTransferBusy("import");
        try {
            const importedAssets = await readAssetPackage(file);
            importedAssets.forEach((asset) => {
                const payload = { ...asset } as Record<string, unknown>;
                delete payload.id;
                delete payload.createdAt;
                delete payload.updatedAt;
                addAsset(payload as Parameters<typeof addAsset>[0]);
            });
            message.success(`已导入 ${importedAssets.length} 个素材`);
        } catch {
            message.error("导入失败，请选择有效的素材压缩包");
        } finally {
            setTransferBusy("");
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const confirmDelete = async () => {
        if (!deletingAsset) return;
        setDeleteBusy(true);
        try {
            await deleteAssetWithRemoteSync(deletingAsset.id);
            message.success("素材已删除");
            setDeletingAsset(null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材删除失败");
        } finally {
            setDeleteBusy(false);
        }
    };

    const exportSelectedAssets = async () => {
        if (!selectedAssets.length || Boolean(transferBusy)) return;
        setTransferBusy("export-selected");
        try {
            await exportAssets(selectedAssets);
            message.success(`已导出 ${selectedAssets.length} 个素材`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "所选素材导出失败");
        } finally {
            setTransferBusy("");
        }
    };

    const confirmBatchDelete = async () => {
        if (!selectedAssets.length) return;
        setDeleteBusy(true);
        try {
            for (const asset of selectedAssets) await deleteAssetWithRemoteSync(asset.id);
            message.success(`已删除 ${selectedAssets.length} 个素材`);
            setSelectedIds([]);
            setBatchDeleteOpen(false);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "批量删除失败");
        } finally {
            setDeleteBusy(false);
        }
    };

    const resetFilters = () => {
        setKeyword("");
        setKindFilter("all");
        setCategoryFilter("all");
        setPage(1);
    };

    return (
        <>
            <WorkspacePage grid className="library-page assets-library-page canvas-library-page">
                <div className="studio-band">
                    <PageHeader
                        title="素材库"
                        description="收藏每次创作，让好的镜头、声音和灵感继续被使用。"
                        eyebrow="CREATIVE LIBRARY"
                        meta={<span className="app-projects-header-meta assets-header-meta">{validAssets.length} 个素材</span>}
                        actions={
                            <div className="assets-header-actions">
                                <div className="assets-header-action-buttons">
                                    <Button className="assets-primary-action" type="primary" icon={<Plus className="size-3.5" />} onClick={openCreate}>
                                        新增素材
                                    </Button>
                                    <Button icon={<FolderOpen className="size-3.5" />} onClick={() => navigate("/plugins/eagle")}>
                                        Eagle 素材库
                                    </Button>
                                    <Button
                                        className="assets-header-secondary-action"
                                        title="导出全部素材"
                                        aria-label="导出全部素材"
                                        icon={<Download className="size-4" />}
                                        loading={transferBusy === "export-all"}
                                        disabled={Boolean(transferBusy && transferBusy !== "export-all")}
                                        onClick={() => void exportAllAssets()}
                                    >
                                        <span className="assets-header-action-label hidden lg:inline">导出全部</span>
                                    </Button>
                                    <Dropdown
                                        trigger={["click"]}
                                        menu={{
                                            items: [
                                                { key: "package", icon: <FileUp className="size-4" />, label: "批量导入素材包", disabled: Boolean(transferBusy), onClick: () => assetInputRef.current?.click() },
                                                { key: "model", icon: <Upload className="size-4" />, label: "上传 3D 模型", disabled: Boolean(transferBusy), onClick: () => modelInputRef.current?.click() },
                                            ],
                                        }}
                                    >
                                        <Button className="assets-header-secondary-action" title="导入或上传素材" aria-label="导入或上传素材" icon={<FileUp className="size-4" />} loading={transferBusy === "import" || transferBusy === "model"}>
                                            <span className="assets-header-action-label hidden lg:inline">导入 / 上传</span>
                                        </Button>
                                    </Dropdown>
                                </div>
                                <AssetStorageUsage />
                            </div>
                        }
                    />
                    <ListToolbar
                        className="library-toolbar"
                        active={Boolean(keyword || kindFilter !== "all" || categoryFilter !== "all")}
                        onReset={resetFilters}
                        trailing={
                            <span className="assets-selection-guide hidden">
                                <CheckCheck aria-hidden="true" />
                                勾选卡片可批量导出或删除
                            </span>
                        }
                    >
                        <SearchField
                            containerClassName="assets-search-field"
                            value={keyword}
                            placeholder="搜索标题、内容、标签或来源"
                            onClear={() => {
                                setKeyword("");
                                setPage(1);
                            }}
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                        />
                    </ListToolbar>
                </div>

                <Surface className="canvas-library-frame assets-library-frame" padding="none">
                    <div className="assets-library-layout">
                        <aside className="assets-filter-rail" aria-label="素材分类">
                            <AssetFilterGroup
                                title="素材类型"
                                options={kindOptions}
                                value={kindFilter}
                                counts={kindCounts}
                                onChange={(value) => {
                                    setKindFilter(value as AssetKind | "all");
                                    setPage(1);
                                }}
                            />
                            <AssetFilterGroup
                                title="业务分类"
                                options={categoryOptions}
                                value={categoryFilter}
                                counts={categoryCounts}
                                onChange={(value) => {
                                    setCategoryFilter(value as AssetCategory | "all");
                                    setPage(1);
                                }}
                                className="assets-category-filters"
                            />
                        </aside>
                        <section className="min-w-0" aria-labelledby={validAssets.length ? "assets-collection-title" : undefined} aria-label={validAssets.length ? undefined : "素材列表"}>
                            {validAssets.length ? (
                                <div className="assets-collection-heading" role="status" aria-live="polite">
                                    <div>
                                        <h2 id="assets-collection-title">{kindFilter === "all" && categoryFilter === "all" ? "全部素材" : "筛选结果"}</h2>
                                        <span>{filteredAssets.length} 项</span>
                                    </div>
                                    <span>点击媒体查看档案，勾选后进入批量处理</span>
                                </div>
                            ) : null}
                            {selectedAssets.length ? (
                                <AssetsBatchBar
                                    count={selectedAssets.length}
                                    allSelected={allFilteredSelected}
                                    exporting={transferBusy === "export-selected"}
                                    onSelectAll={() => setSelectedIds((current) => Array.from(new Set([...current, ...filteredAssetIds])))}
                                    onClear={() => setSelectedIds([])}
                                    onExport={() => void exportSelectedAssets()}
                                    onDelete={() => setBatchDeleteOpen(true)}
                                />
                            ) : null}
                            {!assetsHydrated ? (
                                <WorkspaceLoadingState className="assets-loading-state" label="正在加载素材库" detail="正在整理你的素材与分类" rows={6} />
                            ) : validAssets.length === 0 ? (
                                <AssetsEmptyState onNew={openCreate} onImport={() => assetInputRef.current?.click()} onGoCanvas={() => navigate("/canvas")} />
                            ) : (
                                <>
                                    {filteredAssets.length === 0 ? (
                                        <WorkspaceState icon="assets" compact title="没有匹配的素材" description="调整关键词或素材分类后再试。" action={<Button onClick={resetFilters}>清除筛选</Button>} />
                                    ) : (
                                        <CollectionGrid className="library-grid assets-library-grid">
                                            {canCreateAsset ? <LibraryCreateCard label="新增素材" description="记录文本灵感，上传参考图片" icon={<Plus className="size-8" />} onClick={openCreate} /> : null}
                                            {visibleAssets.map((asset) => (
                                                <AssetCard
                                                    key={asset.id}
                                                    asset={asset}
                                                    selected={selectedIds.includes(asset.id)}
                                                    onSelect={(selected) => setSelectedIds((current) => (selected ? [...new Set([...current, asset.id])] : current.filter((id) => id !== asset.id)))}
                                                    onOpen={() => setPreviewAsset(asset)}
                                                    onEdit={() => openEdit(asset)}
                                                    onCopy={copyAssetText}
                                                    onDownload={downloadImage}
                                                    onDelete={() => setDeletingAsset(asset)}
                                                    onVideoMetadata={(metadata) => {
                                                        if (asset.kind !== "video") return;
                                                        const data = mergeLoadedVideoMetadata(asset.data, metadata);
                                                        if (data) updateAsset(asset.id, { data });
                                                    }}
                                                />
                                            ))}
                                        </CollectionGrid>
                                    )}
                                    <PaginationBar
                                        current={page}
                                        pageSize={pageSize}
                                        total={filteredAssets.length}
                                        pageSizeOptions={[35, 70, 105]}
                                        onChange={(nextPage, nextPageSize) => {
                                            setPage(nextPageSize !== pageSize ? 1 : nextPage);
                                            setPageSize(nextPageSize);
                                        }}
                                    />
                                </>
                            )}
                        </section>
                    </div>
                </Surface>
            </WorkspacePage>

            <DialogFrame
                className="asset-editor-dialog"
                frameSize="lg"
                title={editingAsset ? "编辑素材" : "新增素材"}
                subtitle="编辑素材的基本信息、分类、内容与封面"
                open={isAssetOpen}
                onCancel={() => {
                    if (!assetSavePendingRef.current) setIsAssetOpen(false);
                }}
                onOk={() => void saveAsset()}
                okText={imageUploading ? "正在上传" : assetSaving ? "正在保存" : "保存"}
                cancelText="取消"
                confirmLoading={assetSaving}
                cancelButtonProps={{ disabled: assetSaving }}
                closable={!assetSaving}
                destroyOnHidden
            >
                <div className="asset-editor-layout grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <Form className="asset-editor-form" form={form} disabled={assetSaving} layout="vertical" requiredMark={false} initialValues={{ kind: "text", category: "other", tags: [] }}>
                        <Form.Item name="kind" label="类型">
                            <Select
                                options={[
                                    { label: "文本", value: "text" },
                                    { label: "图片", value: "image" },
                                ]}
                                onChange={(value) => setFormKind(value)}
                            />
                        </Form.Item>
                        <Form.Item name="category" label="业务分类">
                            <Select options={categoryOptions.slice(1)} />
                        </Form.Item>
                        <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                            <Input placeholder="给素材起一个容易检索的名字" />
                        </Form.Item>
                        <Form.Item name="coverUrl" label="封面 URL">
                            <Space.Compact className="w-full">
                                <Input placeholder="可粘贴图片 URL，也可以上传本地封面" />
                                <Button icon={<Upload className="size-3.5" />} onClick={() => coverInputRef.current?.click()}>
                                    上传
                                </Button>
                            </Space.Compact>
                        </Form.Item>
                        <Form.Item name="tags" label="标签">
                            <Select mode="tags" tokenSeparators={[",", "，"]} placeholder="输入标签后回车" />
                        </Form.Item>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Form.Item name="source" label="来源">
                                <Input placeholder="手动添加 / 画布 / 任务中心" />
                            </Form.Item>
                            <Form.Item name="note" label="备注">
                                <Input placeholder="可选" />
                            </Form.Item>
                        </div>
                        {formKind === "text" ? (
                            <Form.Item name="content" label="文本内容" rules={[{ required: true, message: "请输入文本内容" }]}>
                                <Input.TextArea rows={8} placeholder="保存提示词、说明文案、参考描述等文本素材" />
                            </Form.Item>
                        ) : (
                            <Form.Item label="图片内容" required>
                                <div className="asset-image-dropzone">
                                    <Button disabled={assetSaving} icon={<Upload className="size-4" />} onClick={() => imageInputRef.current?.click()}>
                                        {imageUploading ? "正在上传图片" : "选择图片文件"}
                                    </Button>
                                    {imageFile ? (
                                        <Tag color="gold" className="ml-3">
                                            待保存上传
                                        </Tag>
                                    ) : null}
                                    {imageDraft ? (
                                        <Typography.Text type="secondary" className="ml-3 text-xs" title={resourceStorageTitle(imageDraft.storageKey)}>
                                            {imageDraft.width}x{imageDraft.height} · {formatBytes(imageDraft.bytes)} · {resourceStorageLabel(imageDraft.storageKey)}
                                        </Typography.Text>
                                    ) : (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            未选择图片
                                        </Typography.Text>
                                    )}
                                    <span className="asset-image-help">支持常见图片格式；选择后会先本地预览，保存时再上传。</span>
                                </div>
                            </Form.Item>
                        )}
                    </Form>
                    <div className="asset-editor-preview">
                        <Typography.Text strong className="text-xs">
                            预览
                        </Typography.Text>
                        <div className="asset-editor-preview-card">
                            {coverUrl || imageDraft?.dataUrl ? (
                                <div className={`asset-preview-uploading ${imageUploading ? "is-uploading" : ""}`}>
                                    <img src={coverUrl || imageDraft?.dataUrl} alt="" loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
                                    {imageUploading && imageUploadProgress ? (
                                        <div className="asset-preview-uploading-panel">
                                            <div className="asset-preview-uploading-copy">
                                                <span>{imageUploadProgress.phase === "confirming" ? "正在确认资源" : "正在上传到云端"}</span>
                                                {typeof imageUploadProgress.percent === "number" ? <strong>{imageUploadProgress.percent}%</strong> : null}
                                            </div>
                                            <Progress percent={imageUploadProgress.percent} showInfo={false} size="small" status="active" />
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="asset-editor-preview-empty">{content || "暂无封面"}</div>
                            )}
                            <div className="asset-editor-preview-copy">
                                <Typography.Text strong ellipsis className="block">
                                    {title || "未命名素材"}
                                </Typography.Text>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {tags.length ? (
                                        tags.map((tag) => (
                                            <Tag key={tag} className="m-0">
                                                {tag}
                                            </Tag>
                                        ))
                                    ) : (
                                        <Tag className="m-0">未打标签</Tag>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readCoverFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readImageFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
            </DialogFrame>

            <AssetDrawer
                asset={previewAsset}
                onClose={() => setPreviewAsset(null)}
                onEdit={(asset) => {
                    setPreviewAsset(null);
                    openEdit(asset);
                }}
                onCopy={copyAssetText}
                onDownload={downloadImage}
            />

            <input ref={assetInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importAssetZip(event.target.files?.[0])} />
            <input
                ref={modelInputRef}
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                className="hidden"
                onChange={(event) => {
                    void readModelFile(event.target.files?.[0]);
                    event.currentTarget.value = "";
                }}
            />

            <DialogFrame
                className="asset-confirm-dialog"
                frameSize="sm"
                title="删除素材"
                open={Boolean(deletingAsset)}
                onCancel={() => setDeletingAsset(null)}
                onOk={() => void confirmDelete()}
                okText="删除"
                okButtonProps={{ danger: true }}
                confirmLoading={deleteBusy}
                cancelText="取消"
            >
                确定删除「{deletingAsset?.title}」吗？未被其他内容引用的服务器本地或对象存储文件也会同步删除；若仍被画布、任务或其他素材占用，本次删除将被阻止。
            </DialogFrame>
            <DialogFrame
                className="asset-confirm-dialog"
                frameSize="sm"
                title="批量删除素材"
                open={batchDeleteOpen}
                onCancel={() => setBatchDeleteOpen(false)}
                onOk={() => void confirmBatchDelete()}
                okText="删除"
                okButtonProps={{ danger: true }}
                confirmLoading={deleteBusy}
                cancelText="取消"
            >
                确定删除已选择的 {selectedAssets.length} 个素材吗？未被复用的服务器文件会同步删除；仍被画布、任务或其他素材占用的素材会保留并提示具体来源。
            </DialogFrame>
        </>
    );
}

function AssetCard({
    asset,
    selected,
    onSelect,
    onOpen,
    onEdit,
    onCopy,
    onDownload,
    onDelete,
    onVideoMetadata,
}: {
    asset: LibraryAsset;
    selected: boolean;
    onSelect: (selected: boolean) => void;
    onOpen: () => void;
    onEdit: () => void;
    onCopy: (asset: LibraryAsset) => void;
    onDownload: (asset: LibraryAsset) => void;
    onDelete: () => void;
    onVideoMetadata: (metadata: LoadedVideoMetadata) => void;
}) {
    const summary = assetSummary(asset);
    const menuItems: MenuProps["items"] = [
        ...(asset.kind === "text" || asset.kind === "image" ? [{ key: "edit", icon: <PencilLine className="size-3.5" />, label: "编辑", onClick: onEdit }] : []),
        ...(asset.kind === "text" ? [{ key: "copy", icon: <Copy className="size-3.5" />, label: "复制文本", onClick: () => void onCopy(asset) }] : []),
        ...(asset.kind === "image" || asset.kind === "video" || asset.kind === "audio" || asset.kind === "model" ? [{ key: "download", icon: <Download className="size-3.5" />, label: "下载", onClick: () => onDownload(asset) }] : []),
        { type: "divider" as const },
        { key: "delete", danger: true, icon: <Trash2 className="size-3.5" />, label: "删除", onClick: onDelete },
    ];
    return (
        <AssetLibraryCard selected={selected}>
            <AssetCover asset={asset} selected={selected} onSelect={onSelect} onOpen={onOpen} menuItems={menuItems} onVideoMetadata={onVideoMetadata} />
            <button type="button" className="assets-card-copy" onClick={onOpen}>
                <div className="assets-card-title-row">
                    <h2 className="assets-card-title" title={asset.title}>
                        {asset.title}
                    </h2>
                    <span className="assets-card-time">{formatAssetTime(asset.updatedAt)}</span>
                </div>
                <div className="assets-card-summary" title={summary}>
                    {summary}
                </div>
                <div className="assets-card-context">
                    <span className="truncate">{asset.source || "未标注来源"}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{assetProjectLabel(asset)}</span>
                </div>
            </button>
        </AssetLibraryCard>
    );
}

function AssetCover({
    asset,
    selected,
    onSelect,
    onOpen,
    menuItems,
    onVideoMetadata,
}: {
    asset: LibraryAsset;
    selected: boolean;
    onSelect: (selected: boolean) => void;
    onOpen: () => void;
    menuItems: MenuProps["items"];
    onVideoMetadata: (metadata: LoadedVideoMetadata) => void;
}) {
    const KindIcon = assetKindIcons[asset.kind];
    const clock = asset.kind === "video" || asset.kind === "audio" ? formatAssetClock(asset.data.durationMs) : null;
    const showPlay = asset.kind === "video";
    const isLight = asset.kind === "audio" || asset.kind === "text" || asset.kind === "model";
    return (
        <AssetLibraryCardMedia className={isLight ? "assets-cover is-light" : "assets-cover"}>
            <button type="button" className="assets-cover-link" onClick={onOpen} aria-label={`查看素材：${asset.title}`}>
                {asset.kind === "audio" ? (
                    <AudioWaveCover asset={asset} />
                ) : asset.kind === "text" ? (
                    <TextCover asset={asset} />
                ) : asset.kind === "model" ? (
                    <ModelCover asset={asset} />
                ) : (
                    <AssetMediaPreview
                        asset={asset}
                        alt={asset.title}
                        className="assets-cover-media"
                        onVideoMetadata={onVideoMetadata}
                        fallback={
                            <div className="assets-cover-fallback">
                                <KindIcon className="size-7" />
                            </div>
                        }
                    />
                )}
                <span className="assets-cover-vignette" aria-hidden="true" />
                {showPlay ? (
                    <span className="assets-cover-play">
                        <Play className="size-4" />
                    </span>
                ) : null}
            </button>
            <span className="assets-cover-badges">
                <span className="assets-cover-badge is-kind">
                    <KindIcon />
                    {assetKindLabel(asset.kind)}
                </span>
                <span className="assets-cover-badge is-category">{assetCategoryLabel(asset.category)}</span>
            </span>
            {clock ? <span className="assets-cover-clock">{clock}</span> : null}
            <input type="checkbox" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelect(event.target.checked)} className="assets-select-check" aria-label={`选择 ${asset.title}`} />
            <Dropdown trigger={["click"]} menu={{ items: menuItems }}>
                <button type="button" className="assets-cover-more" aria-label="更多素材操作" title="更多操作">
                    <MoreHorizontal className="size-4" />
                </button>
            </Dropdown>
        </AssetLibraryCardMedia>
    );
}

function AudioWaveCover({ asset }: { asset: LibraryAsset & { kind: "audio" } }) {
    const bars = audioWaveBars(asset.id);
    return (
        <div className="assets-cover-wave" aria-hidden="true">
            {bars.map((height, index) => (
                <span key={index} style={{ height: `${height}%` }} />
            ))}
            <AudioLines className="assets-cover-wave-glyph" />
        </div>
    );
}

function TextCover({ asset }: { asset: LibraryAsset & { kind: "text" } }) {
    return (
        <div className="assets-cover-text">
            <p>{asset.data.content || "空白文本素材"}</p>
        </div>
    );
}

function ModelCover({ asset }: { asset: LibraryAsset & { kind: "model" } }) {
    return (
        <div className="assets-cover-model">
            <Box />
            <span>{asset.data.fileName}</span>
        </div>
    );
}

function AssetsBatchBar({ count, allSelected, exporting, onSelectAll, onClear, onExport, onDelete }: { count: number; allSelected: boolean; exporting: boolean; onSelectAll: () => void; onClear: () => void; onExport: () => void; onDelete: () => void }) {
    return (
        <SelectionBar
            className="assets-batch-bar"
            count={count}
            itemLabel="个素材"
            onClear={onClear}
            clearLabel="取消选择"
            actions={
                <div className="assets-batch-actions">
                    <Button size="small" icon={<CheckCheck className="size-3.5" />} disabled={allSelected || exporting} onClick={onSelectAll}>
                        全选
                    </Button>
                    <Button size="small" icon={<Download className="size-3.5" />} loading={exporting} onClick={onExport}>
                        导出
                    </Button>
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={exporting} onClick={onDelete}>
                        删除
                    </Button>
                </div>
            }
        />
    );
}

function AssetsEmptyState({ onNew, onImport, onGoCanvas }: { onNew: () => void; onImport: () => void; onGoCanvas: () => void }) {
    return (
        <section className="assets-empty" aria-labelledby="assets-empty-title">
            <div className="assets-empty-hero">
                <figure className="assets-empty-visual">
                    <img src={BRAND_CONCEPT_POSTER} alt="列车穿过暮色山谷的品牌概念画面" loading="lazy" decoding="async" />
                    <figcaption>AI 品牌概念视觉</figcaption>
                </figure>
                <div className="assets-empty-copy">
                    <span className="assets-empty-eyebrow">YOUR CREATIVE COLLECTION</span>
                    <h2 id="assets-empty-title">好素材，值得留下。</h2>
                    <p>把参考图片、提示词和创作结果收进素材库，下一个作品从这里继续。</p>
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={onNew}>
                        添加第一份素材
                    </Button>
                </div>
            </div>
            <div className="assets-empty-paths">
                <Button icon={<FileUp className="size-4" />} onClick={onImport}>
                    导入素材包
                </Button>
                <Button icon={<Clapperboard className="size-4" />} onClick={onGoCanvas}>
                    从画布收藏
                </Button>
                <span>支持文本、图片、视频、音频和 3D 模型</span>
            </div>
        </section>
    );
}

function AssetFilterGroup({
    title,
    options,
    value,
    counts,
    onChange,
    className = "",
}: {
    title: string;
    options: Array<{ label: string; value: string }>;
    value: string;
    counts: Map<string, number>;
    onChange: (value: string) => void;
    className?: string;
}) {
    return (
        <div className={`assets-filter-group ${className}`}>
            <h2 className="assets-filter-heading">{title}</h2>
            <div className="assets-filter-options thin-scrollbar">
                {options.map((option) => {
                    const active = value === option.value;
                    return (
                        <button key={option.value} type="button" aria-pressed={active} className={`assets-filter-item ${active ? "is-active" : ""}`} onClick={() => onChange(option.value)}>
                            <span className="assets-filter-item-label">{option.label}</span>
                            <span className="assets-filter-count">{counts.get(option.value) || 0}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function AssetDrawer({ asset, onClose, onEdit, onCopy, onDownload }: { asset: LibraryAsset | null; onClose: () => void; onEdit: (asset: LibraryAsset) => void; onCopy: (asset: LibraryAsset) => void; onDownload: (asset: LibraryAsset) => void }) {
    const facts = asset ? assetArchiveFacts(asset) : [];
    const KindIcon = asset ? assetKindIcons[asset.kind] : Clapperboard;
    return (
        <DrawerFrame className="asset-archive-drawer" title="素材档案" subtitle={asset ? `${assetKindLabel(asset.kind)} · ${assetCategoryLabel(asset.category)}` : undefined} open={Boolean(asset)} frameSize="lg" onClose={onClose}>
            {asset ? (
                <div className="space-y-4">
                    <div className="asset-archive-header">
                        <span className="asset-archive-header-icon">
                            <KindIcon />
                        </span>
                        <div className="min-w-0">
                            <h2 className="asset-archive-title">{asset.title}</h2>
                            <p className="asset-archive-subtitle">
                                {assetCategoryLabel(asset.category)} · {formatAssetDateTime(asset.createdAt)} 创建
                            </p>
                        </div>
                    </div>
                    <div className="asset-archive-preview">
                        {asset.kind === "text" ? (
                            <div className="asset-archive-preview-note">{asset.data.content}</div>
                        ) : asset.kind === "audio" ? (
                            <div className="asset-archive-audio">
                                <audio src={asset.data.url} controls />
                            </div>
                        ) : asset.kind === "model" ? (
                            <div className="asset-archive-preview-model">
                                <Box />
                                <span>
                                    {asset.data.fileName} · {formatBytes(asset.data.bytes)}
                                </span>
                            </div>
                        ) : asset.kind === "video" ? (
                            <video src={asset.data.url} controls className="asset-archive-preview-media" />
                        ) : (
                            <img src={asset.coverUrl || asset.data.dataUrl} alt={asset.title} loading="lazy" decoding="async" className="asset-archive-preview-media" />
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {(asset.tags || []).length ? (
                            (asset.tags || []).map((tag) => (
                                <Tag key={tag} className="m-0">
                                    {tag}
                                </Tag>
                            ))
                        ) : (
                            <span className="asset-archive-no-tags">未添加标签</span>
                        )}
                        <StorageTag asset={asset} />
                    </div>
                    <div className="asset-archive-facts">
                        {facts.map((fact) => (
                            <div key={fact.label} className="asset-archive-fact">
                                <span className="asset-archive-fact-label">{fact.label}</span>
                                <span className="asset-archive-fact-value" title={fact.value}>
                                    {fact.value}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="asset-archive-link">
                        <Link2 />
                        <span>所属项目</span>
                        <strong>{assetProjectLabel(asset)}</strong>
                    </div>
                    {asset.note ? (
                        <div className="asset-archive-section">
                            <span className="asset-archive-section-title">备注</span>
                            <p className="asset-archive-section-body">{asset.note}</p>
                        </div>
                    ) : null}
                    <div className="asset-archive-actions">
                        {asset.kind === "text" || asset.kind === "image" ? (
                            <Button className="asset-archive-edit-action" icon={<PencilLine className="size-4" />} onClick={() => onEdit(asset)}>
                                编辑信息
                            </Button>
                        ) : null}
                        {asset.kind === "text" ? (
                            <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(asset)}>
                                复制文本
                            </Button>
                        ) : null}
                        {asset.kind === "image" || asset.kind === "video" || asset.kind === "audio" || asset.kind === "model" ? (
                            <Button type="primary" icon={<Download className="size-4" />} onClick={() => onDownload(asset)}>
                                {assetDownloadLabel(asset)}
                            </Button>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </DrawerFrame>
    );
}

function assetArchiveFacts(asset: LibraryAsset) {
    const facts: Array<{ label: string; value: string }> = [
        { label: "类型", value: assetKindLabel(asset.kind) },
        { label: "分类", value: assetCategoryLabel(asset.category) },
    ];
    if (asset.kind === "image" || asset.kind === "video") {
        facts.push({ label: "尺寸", value: formatAssetDimensions(asset.data.width, asset.data.height) });
    }
    if (asset.kind === "video" || asset.kind === "audio") {
        facts.push({ label: "时长", value: formatAssetClock(asset.data.durationMs) || "未知" });
    }
    if (asset.kind !== "text") {
        facts.push({ label: "大小", value: formatBytes(asset.data.bytes) });
        facts.push({ label: "格式", value: asset.data.mimeType });
        facts.push({ label: "存储", value: resourceStorageLabel(asset.data.storageKey) });
    }
    facts.push({ label: "来源", value: asset.source || "未标注" });
    facts.push({ label: "创建", value: formatAssetDateTime(asset.createdAt) });
    facts.push({ label: "更新", value: formatAssetDateTime(asset.updatedAt) });
    return facts;
}

function assetSummary(asset: LibraryAsset) {
    if (asset.kind === "text") return asset.data.content;
    if (asset.kind === "audio") return `${formatAssetDuration(asset.data.durationMs)} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
    if (asset.kind === "model") return `${asset.data.fileName} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
    return `${formatAssetDimensions(asset.data.width, asset.data.height)} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
}

function StorageTag({ asset }: { asset: LibraryAsset }) {
    if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio" && asset.kind !== "model") return null;
    const location = resourceStorageLocation(asset.data.storageKey);
    const color = location === "oss" ? "green" : location === "local" ? "gold" : "default";
    return (
        <Tag color={color} className="m-0 text-[var(--fs-label)]" title={resourceStorageTitle(asset.data.storageKey)}>
            {resourceStorageLabel(asset.data.storageKey)}
        </Tag>
    );
}

function assetSearchText(asset: LibraryAsset) {
    return [asset.title, asset.source || "", asset.note || "", assetCategoryLabel(asset.category), (asset.tags || []).join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}

function assetCategoryLabel(category?: AssetCategory) {
    return categoryOptions.find((item) => item.value === (category || "other"))?.label || "其他";
}

function assetProjectLabel(asset: LibraryAsset) {
    const projectName = asset.metadata?.projectName;
    if (typeof projectName === "string" && projectName.trim()) return projectName;
    return Array.isArray(asset.metadata?.projectIds) && asset.metadata.projectIds.length ? "已关联项目" : "未关联项目";
}

function assetKindLabel(kind: AssetKind) {
    return kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : kind === "model" ? "3D 模型" : "文本";
}

function assetDownloadLabel(asset: LibraryAsset) {
    if (asset.kind === "video") return "下载视频";
    if (asset.kind === "audio") return "下载音频";
    if (asset.kind === "model") return "下载模型";
    return "下载图片";
}

function formatAssetDuration(durationMs?: number) {
    if (!durationMs) return "时长未知";
    return `${Math.round(durationMs / 100) / 10} 秒`;
}

function formatAssetClock(durationMs?: number) {
    if (!durationMs || durationMs < 1000) return null;
    const total = Math.round(durationMs / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatAssetTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function formatAssetDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function audioWaveBars(seed: string) {
    let hash = 0;
    for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const bars: number[] = [];
    for (let index = 0; index < 26; index += 1) {
        hash = (hash * 9301 + 49297) % 233280;
        const random = hash / 233280;
        const envelope = 0.35 + 0.65 * Math.abs(Math.sin(index * 0.55 + 1.2));
        bars.push(Math.round((0.18 + 0.82 * random * envelope) * 100));
    }
    return bars;
}
