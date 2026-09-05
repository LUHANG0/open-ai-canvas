import { ArrowLeft, ChevronDown, ChevronUp, Download, FileAudio, FileBox, FileImage, FileVideo, FolderPlus, RefreshCw, Search, Settings2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { App, Button, Input, Tag, Tree, Typography } from "antd";
import type { DataNode } from "antd/es/tree";
import { useNavigate } from "react-router";

import "@/lib/plugins/builtin";
import { createEagleAssetSource, EAGLE_DEFAULT_BASE_URL, eagleAssetPlugin } from "@/lib/plugins/builtin/eagle";
import type { ExternalAssetFolder, ExternalAssetItem } from "@/lib/plugins/plugin-types";
import type { Asset } from "@/stores/use-asset-store";
import { usePluginStore } from "@/stores/use-plugin-store";
import { CollectionGrid, ListToolbar, PageHeader, PaginationBar, WorkspacePage } from "@/components/ui/pc/page";
import { WorkspaceErrorState, WorkspaceLoadingState, WorkspaceState } from "@/components/ui/pc/workspace-state";
import { DrawerFrame, StatusBadge, Surface } from "@/components/ui/pc";
import { PathBreadcrumb } from "@/components/ui/pc/path-breadcrumb";
import { AssetLibraryCard, AssetLibraryCardMedia } from "@/components/assets/asset-library-card";
import "./eagle.css";

export default function EagleLibraryPage() {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const installations = usePluginStore((state) => state.installations);
    const hydrated = usePluginStore((state) => state.hydrated);
    const ensurePlugin = usePluginStore((state) => state.ensurePlugin);
    const installation = installations.find((item) => item.manifest.id === eagleAssetPlugin.manifest.id);
    const pluginState = usePluginStore((state) => state.pluginStates[eagleAssetPlugin.manifest.id]);
    const enabled = pluginState?.effectiveEnabled ?? Boolean(installation?.enabled);
    const savedBaseUrl = installation?.config.baseUrl;
    const baseUrl = typeof savedBaseUrl === "string" && savedBaseUrl.trim() ? savedBaseUrl.trim() : EAGLE_DEFAULT_BASE_URL;
    const provider = useMemo(() => createEagleAssetSource(baseUrl), [baseUrl]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [folders, setFolders] = useState<ExternalAssetFolder[]>([]);
    const [items, setItems] = useState<ExternalAssetItem[]>([]);
    const [selectedFolder, setSelectedFolder] = useState("");
    const [keyword, setKeyword] = useState("");
    const [folderName, setFolderName] = useState("");
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [loading, setLoading] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");
    const [progress, setProgress] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(40);
    const [previewItem, setPreviewItem] = useState<ExternalAssetItem | null>(null);
    const [foldersExpanded, setFoldersExpanded] = useState(true);
    const [connected, setConnected] = useState(false);
    const loadRequest = useRef(0);

    const treeData = useMemo<DataNode[]>(() => renderFolderNodes(folders), [folders]);
    const folderPath = useMemo(() => externalFolderPath(folders, selectedFolder), [folders, selectedFolder]);
    const currentFolder = folders.find((folder) => folder.id === selectedFolder);
    const visibleItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
    const totalBytes = useMemo(() => items.reduce((total, item) => total + (item.bytes || 0), 0), [items]);

    useEffect(() => {
        ensurePlugin(eagleAssetPlugin.manifest);
    }, [ensurePlugin]);

    const load = async (folderId = selectedFolder, search = keyword) => {
        const request = ++loadRequest.current;
        setLoading(true);
        setError("");
        try {
            const [nextFolders, nextItems] = await Promise.all([provider.listFolders?.(), provider.list?.({ folderId: folderId || undefined, keyword: search.trim() || undefined, limit: 100, offset: 0 })]);
            if (request !== loadRequest.current) return;
            setFolders(nextFolders || []);
            setItems(nextItems || []);
            setPage(1);
            setConnected(true);
        } catch (reason) {
            if (request !== loadRequest.current) return;
            setError(reason instanceof Error ? reason.message : "连接 Eagle 失败，请确认 Eagle 已启动");
            setItems([]);
            setConnected(false);
        } finally {
            if (request === loadRequest.current) setLoading(false);
        }
    };

    useEffect(() => {
        setConnected(false);
        if (!enabled) return;
        setSelectedFolder("");
        setKeyword("");
        void load("", "");
        return () => {
            loadRequest.current += 1;
        };
        // provider 随本机 API 地址变化；页面进入或配置变化时重新读取 Eagle。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, provider]);

    const handleFolderSelect = (nextFolder: string) => {
        const folderId = nextFolder === "root" ? "" : nextFolder;
        setSelectedFolder(folderId);
        setKeyword("");
        setPreviewItem(null);
        setPage(1);
        void load(folderId, "");
    };

    const handleCreateFolder = async () => {
        const name = folderName.trim();
        if (!name || !provider.createFolder || creatingFolder) return;
        setCreatingFolder(true);
        setError("");
        try {
            await provider.createFolder(name, selectedFolder || undefined);
            setFolderName("");
            message.success("已在" + (currentFolder?.name || "Eagle 素材库") + "中新建文件夹");
            await load();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "新建 Eagle 文件夹失败");
        } finally {
            setCreatingFolder(false);
        }
    };

    const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (!files.length || !provider.uploadFile || working) return;
        setWorking(true);
        setError("");
        let uploaded = 0;
        try {
            for (const [index, file] of files.entries()) {
                setProgress("正在写入 " + (index + 1) + "/" + files.length + "：" + file.name);
                await provider.uploadFile(file, selectedFolder || undefined);
                uploaded += 1;
            }
            message.success("已写入 Eagle " + uploaded + " 个文件");
            await load();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "写入 Eagle 失败");
            if (uploaded) message.warning("已写入 " + uploaded + " 个文件，剩余文件未完成");
        } finally {
            setProgress("");
            setWorking(false);
        }
    };

    if (hydrated && !enabled) {
        return (
            <WorkspacePage grid className="library-page eagle-library-page">
                <PageHeader
                    eyebrow="外部素材"
                    title="Eagle 素材库"
                    description="把 Eagle 作为影策的外部素材来源，直接浏览和管理 Eagle 原始文件。"
                    actions={
                        <Button icon={<ArrowLeft className="size-3.5" />} onClick={() => navigate("/assets")}>
                            返回影策素材库
                        </Button>
                    }
                />
                <Surface className="eagle-enable-surface mt-4" padding="none">
                    <WorkspaceState
                        icon="settings"
                        title={pluginState?.blockedReason || "先启用 Eagle 素材来源"}
                        description="请在插件中心确认平台可用性与个人开关，再连接已打开的 Eagle 资料库。"
                        action={
                            <Button type="primary" icon={<Settings2 className="size-4" />} onClick={() => navigate("/plugins")}>
                                去插件中心启用
                            </Button>
                        }
                    />
                </Surface>
            </WorkspacePage>
        );
    }

    return (
        <>
            <WorkspacePage grid className="library-page assets-library-page canvas-library-page eagle-library-page">
                <div className="studio-band">
                    <PageHeader
                        eyebrow="外部素材"
                        title="Eagle 素材库"
                        description="Eagle 是影策的外部素材来源；这里复用影策素材库的浏览方式，直接读取和写入 Eagle 原始文件。"
                        meta={
                            <StatusBadge dot tone={loading ? "running" : error ? "error" : connected ? "success" : "neutral"} live>
                                {loading ? "Eagle · 正在连接" : error ? "Eagle · 操作异常" : connected ? "Eagle · 已连接" : "Eagle · 尚未连接"}
                            </StatusBadge>
                        }
                        actions={
                            <div className="assets-header-actions">
                                <div className="assets-header-action-buttons">
                                    <Button className="library-primary-action" type="primary" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()} disabled={working || loading || !connected}>
                                        写入素材
                                    </Button>
                                    <Button icon={<ArrowLeft className="size-3.5" />} onClick={() => navigate("/assets")}>
                                        影策素材库
                                    </Button>
                                    <Button icon={<Settings2 className="size-3.5" />} onClick={() => navigate("/plugins")}>
                                        插件设置
                                    </Button>
                                </div>
                            </div>
                        }
                    />
                    <ListToolbar
                        className="library-toolbar"
                        active={Boolean(keyword)}
                        onReset={() => {
                            setKeyword("");
                            setPage(1);
                            void load(selectedFolder, "");
                        }}
                        trailing={
                            <>
                                {progress ? (
                                    <span className="eagle-upload-progress" role="status" aria-live="polite">
                                        {progress}
                                    </span>
                                ) : null}
                                <Button icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>
                                    刷新
                                </Button>
                            </>
                        }
                    >
                        <Input
                            allowClear
                            className="w-full sm:w-80"
                            prefix={<Search className="size-4 text-foreground/40" />}
                            value={keyword}
                            placeholder="搜索 Eagle 素材标题、标签或文件夹"
                            aria-label="搜索 Eagle 素材"
                            onChange={(event) => {
                                setPage(1);
                                setKeyword(event.target.value);
                            }}
                            onPressEnter={() => void load()}
                        />
                    </ListToolbar>
                </div>

                <div className="canvas-library-frame assets-library-frame eagle-library-frame mt-4">
                    <div className="grid min-h-0 gap-4 lg:grid-cols-[176px_minmax(0,1fr)]">
                        <aside className="eagle-folder-sidebar thin-scrollbar flex gap-2 overflow-x-auto py-3 lg:sticky lg:top-0 lg:block lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto lg:pr-3">
                            <div className="eagle-folder-sidebar-header">
                                <span className="text-[var(--fs-label)] font-semibold">Eagle 文件夹</span>
                                <Button type="text" size="small" icon={<RefreshCw className="size-3.5" />} aria-label="刷新 Eagle 文件夹" loading={loading} onClick={() => void load()} />
                            </div>
                            <button type="button" className={"assets-filter-item " + (selectedFolder === "" ? "is-active" : "")} aria-pressed={selectedFolder === ""} onClick={() => handleFolderSelect("root")}>
                                <span className="assets-filter-item-label">全部素材</span>
                                <span className="assets-filter-count">{items.length}</span>
                            </button>
                            <div className="eagle-folder-sidebar-label">
                                <span>文件夹</span>
                                <button type="button" className="eagle-folder-collapse" aria-expanded={foldersExpanded} aria-controls="eagle-folder-tree" onClick={() => setFoldersExpanded((expanded) => !expanded)}>
                                    {foldersExpanded ? <ChevronUp className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
                                    <span className="sr-only">{foldersExpanded ? "收起文件夹" : "展开文件夹"}</span>
                                </button>
                            </div>
                            {foldersExpanded ? (
                                treeData.length ? (
                                    <div id="eagle-folder-tree">
                                        <Tree className="eagle-folder-tree" blockNode selectable selectedKeys={selectedFolder ? [selectedFolder] : []} treeData={treeData} onSelect={(keys) => handleFolderSelect(String(keys[0] || "root"))} />
                                    </div>
                                ) : (
                                    <div className="eagle-folder-empty">Eagle 中还没有文件夹</div>
                                )
                            ) : null}
                            <Button className="eagle-folder-create" disabled={!connected || loading || working} icon={<FolderPlus className="size-3.5" />} onClick={() => setFolderName((value) => (value ? "" : "新文件夹"))}>
                                新建文件夹
                            </Button>
                        </aside>

                        <section className="min-w-0">
                            <PathBreadcrumb
                                ariaLabel="Eagle 文件夹路径"
                                className="eagle-breadcrumb mb-3"
                                rootLabel="Eagle 素材库"
                                items={folderPath.map((folder) => ({ key: folder.id, label: folder.name }))}
                                onRootClick={() => handleFolderSelect("root")}
                                onItemClick={handleFolderSelect}
                            />

                            <div className="eagle-content-header mb-4 flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="text-base font-semibold">{currentFolder?.name || "全部素材"}</h2>
                                        <span className="app-projects-header-meta">{items.length} 个素材</span>
                                    </div>
                                    <p className="mt-1 text-xs text-foreground/48">{currentFolder ? "当前文件夹由 Eagle 管理，影策只负责展示和调用。" : "当前展示 Eagle 素材库中的全部文件。"}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button disabled={!connected || loading || working} icon={<FolderPlus className="size-3.5" />} onClick={() => setFolderName((value) => (value ? "" : "新文件夹"))}>
                                        新建文件夹
                                    </Button>
                                    <Button
                                        icon={<Download className="size-3.5" />}
                                        onClick={() => {
                                            const firstFile = visibleItems.find((item) => item.fileUrl);
                                            if (firstFile?.fileUrl) window.open(firstFile.fileUrl, "_blank", "noopener,noreferrer");
                                        }}
                                    >
                                        下载当前文件
                                    </Button>
                                </div>
                            </div>

                            {folderName ? (
                                <div className="eagle-create-folder-panel mb-4 flex flex-wrap items-center gap-2 rounded-[var(--r-lg)] bg-surface-secondary p-3">
                                    <Input
                                        autoFocus
                                        value={folderName}
                                        onChange={(event) => setFolderName(event.target.value)}
                                        onPressEnter={() => void handleCreateFolder()}
                                        placeholder="输入文件夹名称"
                                        className="min-w-48 flex-1"
                                        aria-label="新文件夹名称"
                                    />
                                    <Button type="primary" loading={creatingFolder} onClick={() => void handleCreateFolder()}>
                                        创建
                                    </Button>
                                    <Button onClick={() => setFolderName("")}>取消</Button>
                                </div>
                            ) : null}

                            {error && items.length ? (
                                <div className="eagle-inline-error" role="alert">
                                    <span>{error}</span>
                                    <Button size="small" icon={<RefreshCw className="size-3.5" />} onClick={() => void load()}>
                                        重新读取
                                    </Button>
                                </div>
                            ) : null}

                            {loading ? (
                                <WorkspaceLoadingState label="正在读取 Eagle 文件" detail="正在同步当前文件夹与素材信息。" rows={6} />
                            ) : error && !items.length ? (
                                <WorkspaceErrorState compact title="无法读取 Eagle 素材库" description={error} onRetry={() => void load()} />
                            ) : items.length ? (
                                <>
                                    <CollectionGrid className="library-grid assets-library-grid eagle-assets-grid">
                                        {visibleItems.map((item) => (
                                            <EagleItemCard key={item.id} item={item} selected={previewItem?.id === item.id} onOpen={() => setPreviewItem(item)} />
                                        ))}
                                    </CollectionGrid>
                                    <PaginationBar
                                        current={page}
                                        pageSize={pageSize}
                                        total={items.length}
                                        pageSizeOptions={[20, 40, 80]}
                                        onChange={(nextPage, nextPageSize) => {
                                            setPage(nextPageSize !== pageSize ? 1 : nextPage);
                                            setPageSize(nextPageSize);
                                        }}
                                    />
                                </>
                            ) : (
                                <div className="eagle-empty-state">
                                    <WorkspaceState
                                        compact
                                        icon="empty"
                                        title={keyword ? "没有匹配的 Eagle 素材" : "当前文件夹还没有文件"}
                                        description={keyword ? "试试更换搜索词，或清空搜索后重新读取。" : "可以写入图片、视频或音频，素材会保留在 Eagle 原目录中。"}
                                    />
                                </div>
                            )}
                        </section>
                    </div>
                </div>

                <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={(event) => void handleUpload(event)} />
            </WorkspacePage>
            <EagleAssetDrawer item={previewItem} onClose={() => setPreviewItem(null)} totalBytes={totalBytes} />
        </>
    );
}

function EagleItemCard({ item, selected, onOpen }: { item: ExternalAssetItem; selected: boolean; onOpen: () => void }) {
    return (
        <AssetLibraryCard selected={selected}>
            <AssetLibraryCardMedia className={item.kind === "image" || item.kind === "video" ? "assets-cover" : "assets-cover is-light"}>
                <button type="button" className="assets-cover-link" onClick={onOpen} aria-label={"查看 Eagle 素材：" + item.title}>
                    {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt={item.title} loading="lazy" decoding="async" className="assets-cover-media" />
                    ) : (
                        <div className="assets-cover-fallback">
                            <AssetKindIcon kind={item.kind} size="size-7" />
                        </div>
                    )}
                    <span className="assets-cover-vignette" aria-hidden="true" />
                </button>
                <span className="assets-cover-badges">
                    <span className="assets-cover-badge is-kind">
                        <AssetKindIcon kind={item.kind} size="size-3" />
                        {assetKindLabel(item.kind)}
                    </span>
                    <span className="assets-cover-badge is-category">Eagle</span>
                </span>
                {item.fileUrl ? (
                    <a href={item.fileUrl} download={item.title} target="_blank" rel="noreferrer" className="eagle-cover-download" aria-label={"下载原文件：" + item.title}>
                        <Download className="size-3.5" aria-hidden="true" />
                    </a>
                ) : null}
            </AssetLibraryCardMedia>
            <button type="button" className="block w-full px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--workspace-accent)]" onClick={onOpen}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                    <h2 className="truncate text-[var(--fs-body)] font-semibold text-foreground" title={item.title}>
                        {item.title}
                    </h2>
                    <span className="shrink-0 text-[var(--fs-tiny)] tabular-nums text-foreground/38">{formatBytes(item.bytes || 0)}</span>
                </div>
                <div className="mt-1 truncate text-[var(--fs-label)] text-foreground/52" title={item.folderPath?.join(" / ") || "Eagle 根目录"}>
                    {item.folderPath?.join(" / ") || "Eagle 根目录"}
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[var(--fs-tiny)] text-foreground/38">
                    <span className="truncate">{formatDimensions(item)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">Eagle 原文件</span>
                </div>
            </button>
        </AssetLibraryCard>
    );
}

function EagleAssetDrawer({ item, onClose, totalBytes }: { item: ExternalAssetItem | null; onClose: () => void; totalBytes: number }) {
    return (
        <DrawerFrame className="library-drawer eagle-asset-drawer" title="素材档案" subtitle="Eagle 原文件的预览、属性与下载入口。" frameSize="md" open={Boolean(item)} onClose={onClose}>
            {item ? (
                <div className="space-y-4">
                    <div className="asset-archive-header">
                        <span className="asset-archive-header-icon">
                            <AssetKindIcon kind={item.kind} size="size-5" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="asset-archive-title">{item.title}</h2>
                            <p className="asset-archive-subtitle">Eagle 原文件 · {item.folderPath?.join(" / ") || "根目录"}</p>
                        </div>
                    </div>
                    <div className="eagle-drawer-preview">{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt={item.title} loading="lazy" decoding="async" /> : <AssetKindIcon kind={item.kind} size="size-9" />}</div>
                    <div className="grid gap-2">
                        <EagleFact label="类型" value={assetKindLabel(item.kind)} />
                        <EagleFact label="尺寸" value={formatDimensions(item)} />
                        <EagleFact label="文件大小" value={formatBytes(item.bytes || 0)} />
                        <EagleFact label="所在文件夹" value={item.folderPath?.join(" / ") || "Eagle 根目录"} />
                        <EagleFact label="素材库总大小" value={formatBytes(totalBytes)} />
                    </div>
                    {item.tags?.length ? (
                        <div>
                            <Typography.Text strong className="text-xs">
                                标签
                            </Typography.Text>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {item.tags.map((tag) => (
                                    <Tag key={tag} className="m-0">
                                        {tag}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    ) : null}
                    {item.description ? (
                        <div>
                            <Typography.Text strong className="text-xs">
                                备注
                            </Typography.Text>
                            <p className="mt-2 text-sm leading-6 text-foreground/65">{item.description}</p>
                        </div>
                    ) : null}
                    {item.fileUrl ? (
                        <a href={item.fileUrl} download={item.title} target="_blank" rel="noreferrer" className="eagle-drawer-download inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium">
                            <Download className="size-4" aria-hidden="true" />
                            下载 Eagle 原文件
                        </a>
                    ) : null}
                </div>
            ) : null}
        </DrawerFrame>
    );
}

function EagleFact({ label, value }: { label: string; value: string }) {
    return (
        <div className="eagle-fact flex items-center justify-between gap-3 rounded-md bg-surface-secondary px-3 py-2 text-sm">
            <span className="eagle-fact-label text-foreground/48">{label}</span>
            <span className="eagle-fact-value max-w-[65%] truncate text-right font-medium" title={value}>
                {value}
            </span>
        </div>
    );
}

function AssetKindIcon({ kind, size = "size-5" }: { kind: Asset["kind"]; size?: string }) {
    if (kind === "image") return <FileImage className={size + " text-foreground/48"} aria-hidden="true" />;
    if (kind === "video") return <FileVideo className={size + " text-foreground/48"} aria-hidden="true" />;
    if (kind === "audio") return <FileAudio className={size + " text-foreground/48"} aria-hidden="true" />;
    return <FileBox className={size + " text-foreground/48"} aria-hidden="true" />;
}

function assetKindLabel(kind: Asset["kind"]) {
    if (kind === "image") return "图片";
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    if (kind === "model") return "模型";
    return "文件";
}

function formatBytes(bytes: number) {
    if (!bytes) return "—";
    if (bytes < 1024) return String(bytes) + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDimensions(item: ExternalAssetItem) {
    if (item.width && item.height) return item.width + " × " + item.height;
    return item.mimeType || assetKindLabel(item.kind);
}

function renderFolderNodes(folders: ExternalAssetFolder[], parentId = ""): DataNode[] {
    return folders
        .filter((folder) => (folder.parentId || "") === parentId)
        .map((folder) => ({
            key: folder.id,
            title: (
                <span className="eagle-folder-tree-title" title={folder.name}>
                    {folder.name}
                </span>
            ),
            children: renderFolderNodes(folders, folder.id),
        }));
}

function externalFolderPath(folders: ExternalAssetFolder[], folderId: string) {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const result: ExternalAssetFolder[] = [];
    const seen = new Set<string>();
    let current = byId.get(folderId);
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        result.unshift(current);
        current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return result;
}
