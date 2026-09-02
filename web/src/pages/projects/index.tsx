import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { App, Button, Form, Input, Select } from "antd";
import { BookOpenText, FileText, FolderKanban, Palette, Plus, Search, Sparkles } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { CollectionGrid, ListToolbar, PageHeader, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState, WorkspaceState } from "@/components/layout/workspace-state";
import { DialogFrame, SearchField, SectionHeader, StatusBadge, Surface } from "@/components/ui/pc";
import { CanvasStylePickerModal, resolveCanvasStylePreset, type CanvasStylePreset } from "@/components/canvas/canvas-style-picker-modal";
import { ModelPicker } from "@/components/model-picker";
import { createStyleProfileSnapshot, parseStyleProfile, serializeStyleProfile } from "@/lib/canvas/style-profile";
import { projectSummaryCompletion } from "@/lib/project-workbench";
import { settingsPath } from "@/lib/settings-navigation";
import { requestImageQuestion } from "@/services/api/image";
import { createProject, deleteProject, importProjectUnits, listProjects } from "@/services/api/projects";
import { modelDisplayName, useEffectiveConfig } from "@/stores/use-config-store";

import { ProjectListCard } from "./project-list-card";
import { generationStepDone, generationSteps, isProjectNameConflict, parseGeneratedStory, projectNameCandidates } from "./project-story-generation";

import "./projects.css";

type ProjectForm = { name: string; aspectRatio: string; sourceType: string };

export default function ProjectsPage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message, modal } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const [createForm] = Form.useForm<ProjectForm>();
    const [searchParams, setSearchParams] = useSearchParams();
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<"all" | "active" | "archived">("all");
    const [sort, setSort] = useState<"updated" | "progress" | "name">("updated");
    const [storyDraft, setStoryDraft] = useState("");
    const [createSource, setCreateSource] = useState<"blank" | "novel" | "text">("blank");
    const [selectedStyle, setSelectedStyle] = useState<CanvasStylePreset | null>(null);
    const [stylePickerOpen, setStylePickerOpen] = useState(false);
    const [generateModel, setGenerateModel] = useState("");
    const [generateChapterCount, setGenerateChapterCount] = useState("5");
    const [generateStructure, setGenerateStructure] = useState("单线推进");
    const [generateChapterLength, setGenerateChapterLength] = useState("中");
    const [generateWordCount, setGenerateWordCount] = useState("800");
    const [generatePerspective, setGeneratePerspective] = useState("第三人称");
    const [generateTone, setGenerateTone] = useState("平稳叙事");
    const [generateCharacterScale, setGenerateCharacterScale] = useState("3-4 个");
    const [generating, setGenerating] = useState(false);
    const [generationStatus, setGenerationStatus] = useState("");
    const [generationPreview, setGenerationPreview] = useState("");
    const createOpen = searchParams.get("create") === "1";
    const setCreateOpen = (open: boolean) => {
        const next = new URLSearchParams(searchParams);
        if (open) next.set("create", "1");
        else next.delete("create");
        setSearchParams(next, { replace: true });
    };
    const openCreate = (source: "blank" | "novel" | "text") => {
        setCreateSource(source);
        setCreateOpen(true);
    };
    useEffect(() => {
        if (!createOpen) return;
        createForm.setFieldsValue({
            name: storyDraft.trim().slice(0, 24) || "",
            sourceType: createSource,
            aspectRatio: "9:16",
        });
    }, [createForm, createOpen, createSource, storyDraft]);

    const generateStory = async () => {
        const story = storyDraft.trim();
        if (!story || generating) return;
        const textModel = generateModel || effectiveConfig.textModel;
        if (!textModel || !effectiveConfig.textModels.includes(textModel)) {
            if (!textModel) {
                modal.warning({
                    title: "需要先选择文本模型",
                    content: "请在上方“AI 模型”中选择一个已配置的文本模型，或先到设置中完成模型渠道配置。",
                    okText: "去设置",
                    cancelText: "取消",
                    onOk: () => navigate(settingsPath("models")),
                });
            } else {
                message.error(`模型 ${textModel} 未在文本模型列表中，请重新选择`);
            }
            return;
        }
        setGenerating(true);
        setGenerationStatus("AI 正在生成故事大纲与章节…");
        setGenerationPreview("");
        let createdProjectId = "";
        try {
            const answer = await requestImageQuestion(
                { ...effectiveConfig, model: textModel, imageModel: textModel, videoModel: textModel, textModel },
                [
                    {
                        role: "system",
                        content: `你是短剧编剧。根据用户的一句话故事，生成一部短剧的标题、一句话简介和 ${generateChapterCount} 个章节。生成要求：叙事采用${generateStructure}结构，每章约 ${generateWordCount} 字，使用${generatePerspective}视角，整体基调${generateTone}，主要角色约 ${generateCharacterScale}，章节篇幅${generateChapterLength}。只输出一个 JSON 对象，不要输出 markdown 代码块或其他文字。JSON 结构：{"title":"剧名","synopsis":"一句话简介","chapters":[{"title":"章节标题","content":"本章情节"}]}`,
                    },
                    { role: "user", content: story },
                ],
                (text) => {
                    setGenerationPreview(text);
                },
            );
            const parsed = parseGeneratedStory(answer);
            if (!parsed.chapters.length) throw new Error("AI 没有返回有效的章节内容，请重试");
            setGenerationStatus("正在创建项目…");
            const projectNames = projectNameCandidates(parsed.title);
            let project: Awaited<ReturnType<typeof createProject>> | undefined;
            for (const [index, name] of projectNames.entries()) {
                try {
                    project = await createProject({
                        name,
                        type: "short-drama",
                        aspectRatio: "9:16",
                        sourceType: "blank",
                        description: (parsed.synopsis || story).trim(),
                        ...(selectedStyle ? { stylePresetId: selectedStyle.id, styleProfileJson: serializeStyleProfile(selectedStyle.profile || createStyleProfileSnapshot(selectedStyle)) } : {}),
                    });
                    break;
                } catch (error) {
                    if (!isProjectNameConflict(error) || index === projectNames.length - 1) throw error;
                }
            }
            if (!project) throw new Error("项目创建失败，请重试");
            createdProjectId = project.project.id;
            setGenerationStatus(`正在导入 ${parsed.chapters.length} 个章节…`);
            await importProjectUnits(
                project.project.id,
                parsed.chapters.map((chapter: { title: string; content: string }) => ({ kind: "chapter", title: chapter.title, sourceText: chapter.content })),
            );
            await queryClient.invalidateQueries({ queryKey: ["projects"] });
            navigate(`/projects/${project.project.id}/overview`);
        } catch (error) {
            const detail = error instanceof Error ? error.message : "AI 生成失败，请重试";
            if (createdProjectId) {
                await queryClient.invalidateQueries({ queryKey: ["projects"] });
                message.warning(`项目已创建，但章节导入失败：${detail}。可以在项目中重新导入或手动添加章节。`);
                navigate(`/projects/${createdProjectId}/overview`);
            } else {
                message.error(detail);
            }
        } finally {
            setGenerating(false);
            setGenerationStatus("");
            setGenerationPreview("");
        }
    };
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const query = useInfiniteQuery({
        // 分页查询和画布页的全量项目查询不能共用缓存形状，否则两个页面会互相覆盖缓存数据。
        queryKey: ["projects", "paged"],
        queryFn: ({ pageParam }) => listProjects({ page: pageParam, pageSize: 50 }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    });
    const mutation = useMutation({
        mutationFn: createProject,
        onSuccess: ({ project }, input) => {
            setCreateOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            navigate(input.sourceType === "novel" || input.sourceType === "text" ? `/projects/${project.id}/chapters?import=1` : `/projects/${project.id}/overview`);
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "项目创建失败"),
    });
    const deleteMutation = useMutation({
        mutationFn: deleteProject,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            message.success("项目已删除");
        },
        onError: (error) => message.error(error instanceof Error ? error.message : "项目删除失败"),
    });
    const confirmDeleteProject = (projectId: string, name: string) => {
        modal.confirm({
            title: "删除项目",
            content: `确定删除「${name}」吗？项目章节、画布关联和素材归属将一并移除；独立画布与素材库原始素材会保留。此操作不可撤销。`,
            okText: "删除",
            okButtonProps: { danger: true, loading: deleteMutation.isPending },
            cancelText: "取消",
            onOk: () => deleteMutation.mutate(projectId),
        });
    };
    const allProjects = useMemo(() => query.data?.pages.flatMap((page) => page.projects) || [], [query.data]);
    const rows = useMemo(() => {
        const normalizedKeyword = keyword.trim().toLowerCase();
        return [...allProjects]
            .filter(({ project }) => status === "all" || project.status === status)
            .filter(
                ({ project }) =>
                    !normalizedKeyword ||
                    `${project.name} ${project.description} ${project.stylePresetId} ${parseStyleProfile(project.styleProfileJson)?.title || resolveCanvasStylePreset(project.stylePresetId)?.title || ""}`.toLowerCase().includes(normalizedKeyword),
            )
            .sort((left, right) => {
                if (sort === "name") return left.project.name.localeCompare(right.project.name, "zh-CN");
                if (sort === "progress") return projectSummaryCompletion(right) - projectSummaryCompletion(left);
                return right.project.updatedAt.localeCompare(left.project.updatedAt);
            });
    }, [allProjects, keyword, sort, status]);
    const totalProjectCount = query.data?.pages[0]?.total ?? allProjects.length;
    useEffect(() => {
        const node = loadMoreRef.current;
        if (!node || !query.hasNextPage || query.isError) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting && !query.isFetchingNextPage) void query.fetchNextPage();
            },
            { rootMargin: "600px" },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [query.fetchNextPage, query.hasNextPage, query.isError, query.isFetchingNextPage]);
    const hasInitialError = query.isError && !query.data;
    return (
        <WorkspacePage className="library-page pc-projects-page" grid>
            <PageHeader
                className="pc-projects-page-header"
                eyebrow="STORY PRODUCTION"
                title="短剧项目"
                description="集中管理故事、章节、角色资产、分镜画布与制作进度。"
                meta={
                    <StatusBadge tone="neutral" dot>
                        {query.isLoading ? "正在读取" : `已加载 ${allProjects.length} / ${totalProjectCount}`}
                    </StatusBadge>
                }
                actions={
                    <Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => openCreate("blank")}>
                        创建项目
                    </Button>
                }
            />
            <Surface className="app-story-create-panel pc-projects-starter" padding="none" aria-label="开始一部新短剧">
                <div className="app-story-create-head">
                    <div className="app-story-create-title">
                        <span className="app-story-create-mark">
                            <Sparkles className="size-4" />
                        </span>
                        <div>
                            <span className="app-story-create-kicker hidden lg:inline-flex">LIGHTFRAME STORY LAB</span>
                            <h2>把一句灵感变成可制作的短剧</h2>
                            <p>输入故事起点，由 AI 建立项目和章节；也可以从空白、小说或文本开始。</p>
                        </div>
                    </div>
                    <div className="app-story-create-actions">
                        <div className="app-story-create-source-actions" aria-label="项目起点">
                            <button type="button" className="app-story-create-shortcut" onClick={() => openCreate("blank")}>
                                <FolderKanban className="size-4" />
                                空白项目
                            </button>
                            <button type="button" className="app-story-create-shortcut" onClick={() => openCreate("novel")}>
                                <FileText className="size-4" />
                                导入小说
                            </button>
                            <button type="button" className="app-story-create-shortcut" onClick={() => setStylePickerOpen(true)}>
                                <Palette className="size-4" />
                                {selectedStyle ? "更换画风" : "选画风"}
                            </button>
                        </div>
                        <div className="app-story-create-execution-actions" aria-label="创建方式">
                            <ModelPicker config={effectiveConfig} value={generateModel || effectiveConfig.textModel} onChange={setGenerateModel} capability="text" variant="creation" placeholder="选择文本模型" showSelectedPrice={false} />
                            <Button type="default" className="app-story-generate-action" icon={<Sparkles className="size-3.5" />} disabled={!storyDraft.trim() || generating} loading={generating} onClick={() => void generateStory()}>
                                AI 生成章节
                            </Button>
                            <Button className="app-story-manual-action" icon={<Plus className="size-3.5" />} onClick={() => openCreate(createSource)}>
                                手动创建
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="app-story-create-main">
                    <Input.TextArea
                        className="app-story-create-input"
                        value={storyDraft}
                        onChange={(event) => setStoryDraft(event.target.value)}
                        placeholder="例如：一个失忆的快递员，每天收到十年前寄出的信件……"
                        autoSize={{ minRows: 1, maxRows: 3 }}
                        aria-label="一句话故事"
                    />
                    {selectedStyle ? (
                        <button type="button" className="app-story-create-style-chip" onClick={() => setStylePickerOpen(true)} title={selectedStyle.title}>
                            <img src={selectedStyle.imageUrl} alt="" />
                            <span>{selectedStyle.title}</span>
                        </button>
                    ) : null}
                    <span className={`pc-projects-story-status${storyDraft.trim() ? " is-ready" : ""}`} aria-live="polite">
                        {storyDraft.trim() ? `${storyDraft.trim().length} 字 · 已可生成，也可以继续补充人物、冲突或结局` : "先输入一句话故事，再选择模型生成章节"}
                    </span>
                </div>
                <div className="app-story-create-controls">
                    <label>
                        <span>章节数量</span>
                        <Select
                            size="small"
                            className="min-w-28"
                            value={generateChapterCount}
                            onChange={setGenerateChapterCount}
                            options={[
                                { label: "3 章", value: "3" },
                                { label: "5 章", value: "5" },
                                { label: "8 章", value: "8" },
                                { label: "10 章", value: "10" },
                            ]}
                        />
                    </label>
                    <label>
                        <span>叙事结构</span>
                        <Select
                            size="small"
                            className="min-w-32"
                            value={generateStructure}
                            onChange={setGenerateStructure}
                            options={[
                                { label: "单线推进", value: "单线推进" },
                                { label: "双线并行", value: "双线并行" },
                                { label: "群像多线", value: "群像多线" },
                                { label: "反转嵌套", value: "反转嵌套" },
                            ]}
                        />
                    </label>
                    <label>
                        <span>章节篇幅</span>
                        <Select
                            size="small"
                            className="min-w-28"
                            value={generateChapterLength}
                            onChange={setGenerateChapterLength}
                            options={[
                                { label: "精炼", value: "短" },
                                { label: "均衡", value: "中" },
                                { label: "丰满", value: "长" },
                            ]}
                        />
                    </label>
                    <label>
                        <span>单章字数</span>
                        <Select
                            size="small"
                            className="min-w-28"
                            value={generateWordCount}
                            onChange={setGenerateWordCount}
                            options={[
                                { label: "500 字", value: "500" },
                                { label: "800 字", value: "800" },
                                { label: "1200 字", value: "1200" },
                                { label: "2000 字", value: "2000" },
                            ]}
                        />
                    </label>
                    <label>
                        <span>叙述视角</span>
                        <Select
                            size="small"
                            className="min-w-28"
                            value={generatePerspective}
                            onChange={setGeneratePerspective}
                            options={[
                                { label: "第三人称", value: "第三人称" },
                                { label: "第一人称", value: "第一人称" },
                                { label: "多视角", value: "多视角" },
                            ]}
                        />
                    </label>
                    <label>
                        <span>故事基调</span>
                        <Select
                            size="small"
                            className="min-w-32"
                            value={generateTone}
                            onChange={setGenerateTone}
                            options={[
                                { label: "平稳叙事", value: "平稳叙事" },
                                { label: "轻松喜剧", value: "轻松喜剧" },
                                { label: "紧张悬疑", value: "紧张悬疑" },
                                { label: "热血成长", value: "热血成长" },
                                { label: "甜宠治愈", value: "甜宠治愈" },
                            ]}
                        />
                    </label>
                    <label>
                        <span>角色规模</span>
                        <Select
                            size="small"
                            className="min-w-28"
                            value={generateCharacterScale}
                            onChange={setGenerateCharacterScale}
                            options={[
                                { label: "2 个", value: "2 个" },
                                { label: "3-4 个", value: "3-4 个" },
                                { label: "5-6 个", value: "5-6 个" },
                            ]}
                        />
                    </label>
                </div>
            </Surface>
            <section className="pc-projects-library" aria-labelledby="pc-projects-library-title">
                <SectionHeader titleId="pc-projects-library-title" title="我的项目" description="筛选只作用于当前已加载的项目；继续下滑会自动加载下一页。" meta={<span className="pc-projects-library-count">{rows.length} 个结果</span>} />
                <ListToolbar
                    className="library-toolbar pc-projects-toolbar"
                    active={Boolean(keyword || status !== "all" || sort !== "updated")}
                    onReset={() => {
                        setKeyword("");
                        setStatus("all");
                        setSort("updated");
                    }}
                >
                    <Input
                        allowClear
                        className="app-list-search pc-projects-search-legacy"
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={keyword}
                        placeholder="搜索项目、简介或画风"
                        onChange={(event) => setKeyword(event.target.value)}
                    />
                    <SearchField containerClassName="pc-projects-search" value={keyword} placeholder="搜索项目、简介或画风" onChange={(event) => setKeyword(event.target.value)} onClear={() => setKeyword("")} />
                    <Select
                        className="w-32"
                        value={status}
                        onChange={setStatus}
                        options={[
                            { label: "全部状态", value: "all" },
                            { label: "进行中", value: "active" },
                            { label: "已归档", value: "archived" },
                        ]}
                    />
                    <Select
                        className="w-32"
                        value={sort}
                        onChange={setSort}
                        options={[
                            { label: "最近更新", value: "updated" },
                            { label: "章节进度", value: "progress" },
                            { label: "项目名称", value: "name" },
                        ]}
                    />
                </ListToolbar>

                {hasInitialError ? <WorkspaceErrorState description={query.error instanceof Error ? query.error.message : "项目列表加载失败"} onRetry={() => void query.refetch()} /> : null}
                {query.isLoading ? <WorkspaceLoadingState label="正在整理项目" detail="读取章节、画布与资产进度" /> : null}
                {!query.isLoading && !hasInitialError && rows.length ? (
                    <CollectionGrid className="library-grid project-library-grid">
                        {rows.map((row) => (
                            <ProjectListCard key={row.project.id} row={row} onDelete={() => confirmDeleteProject(row.project.id, row.project.name)} />
                        ))}
                    </CollectionGrid>
                ) : null}
                {!query.isLoading && !hasInitialError ? (
                    <div ref={loadMoreRef} className="library-load-more" aria-live="polite">
                        {query.isFetchingNextPage ? (
                            "正在加载更多项目…"
                        ) : query.isError ? (
                            <button type="button" onClick={() => void query.fetchNextPage()}>
                                加载更多失败，点击重试
                            </button>
                        ) : query.hasNextPage ? (
                            "继续下滑加载更多（每页 50 条）"
                        ) : allProjects.length ? (
                            `已加载全部 ${totalProjectCount} 个项目`
                        ) : null}
                    </div>
                ) : null}
                {!query.isLoading && !rows.length && !hasInitialError ? (
                    <WorkspaceState
                        className="pc-projects-empty"
                        icon="projects"
                        title={keyword || status !== "all" ? "没有匹配的项目" : "创建第一个故事项目"}
                        description={keyword || status !== "all" ? "调整搜索词或状态筛选后再试。" : "项目会集中保存章节、项目画布、角色场景和制作进度。自由试图可从画布开始。"}
                        action={
                            !keyword && status === "all" ? (
                                <>
                                    <Button className="pc-projects-empty-mobile-action" type="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                                        创建项目
                                    </Button>
                                    <div className="pc-projects-empty-actions">
                                        <Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => openCreate("blank")}>
                                            创建空白项目
                                        </Button>
                                        <Button icon={<FileText className="size-3.5" />} onClick={() => openCreate("novel")}>
                                            导入小说
                                        </Button>
                                    </div>
                                </>
                            ) : undefined
                        }
                    />
                ) : null}
            </section>

            <DialogFrame
                className="library-modal pc-projects-dialog pc-project-dialog"
                title="创建短剧项目"
                subtitle="建立项目基础信息，章节和素材可以稍后继续补充。"
                open={createOpen}
                footer={null}
                destroyOnHidden
                onCancel={() => setCreateOpen(false)}
                frameSize="md"
            >
                <Form<ProjectForm>
                    form={createForm}
                    layout="vertical"
                    initialValues={{ aspectRatio: "9:16", sourceType: "blank" }}
                    onFinish={(values) =>
                        mutation.mutate({ ...values, type: "short-drama", ...(selectedStyle ? { stylePresetId: selectedStyle.id, styleProfileJson: serializeStyleProfile(selectedStyle.profile || createStyleProfileSnapshot(selectedStyle)) } : {}) })
                    }
                >
                    <div className="mb-4 grid grid-cols-3 gap-2">
                        <button
                            type="button"
                            className={createSource === "blank" ? "app-story-source is-active" : "app-story-source"}
                            onClick={() => {
                                setCreateSource("blank");
                                createForm.setFieldValue("sourceType", "blank");
                            }}
                        >
                            <FolderKanban className="size-4" />
                            <span>空白开始</span>
                        </button>
                        <button
                            type="button"
                            className={createSource === "novel" ? "app-story-source is-active" : "app-story-source"}
                            onClick={() => {
                                setCreateSource("novel");
                                createForm.setFieldValue("sourceType", "novel");
                            }}
                        >
                            <FileText className="size-4" />
                            <span>导入小说</span>
                        </button>
                        <button
                            type="button"
                            className={createSource === "text" ? "app-story-source is-active" : "app-story-source"}
                            onClick={() => {
                                setCreateSource("text");
                                createForm.setFieldValue("sourceType", "text");
                            }}
                        >
                            <BookOpenText className="size-4" />
                            <span>粘贴文本</span>
                        </button>
                    </div>
                    <Form.Item name="name" label="项目名称" rules={[{ required: true, whitespace: true, message: "请输入项目名称" }]}>
                        <Input autoFocus placeholder="例如：长安夜行" />
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-3">
                        <Form.Item name="aspectRatio" label="默认画幅">
                            <Select
                                options={[
                                    { label: "9:16 竖屏", value: "9:16" },
                                    { label: "16:9 横屏", value: "16:9" },
                                    { label: "1:1 方形", value: "1:1" },
                                ]}
                            />
                        </Form.Item>
                        <Form.Item name="sourceType" label="内容来源">
                            <Select
                                onChange={(value) => setCreateSource(value as typeof createSource)}
                                options={[
                                    { label: "空白开始", value: "blank" },
                                    { label: "导入小说", value: "novel" },
                                    { label: "粘贴文本", value: "text" },
                                ]}
                            />
                        </Form.Item>
                    </div>
                    <Form.Item label="项目画风">
                        <button type="button" className="app-story-modal-style" onClick={() => setStylePickerOpen(true)}>
                            {selectedStyle ? (
                                <>
                                    <img src={selectedStyle.imageUrl} alt="" />
                                    <span>{selectedStyle.title}</span>
                                    <em>更换</em>
                                </>
                            ) : (
                                <>
                                    <Palette className="size-4" />
                                    <span>选择项目画风（可选）</span>
                                </>
                            )}
                        </button>
                    </Form.Item>
                    <p className="-mt-1 mb-5 text-xs leading-5 text-foreground/48">创建后先进入项目概览。章节、画风和参考资产可以逐步补充。</p>
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setCreateOpen(false)}>取消</Button>
                        <Button type="primary" htmlType="submit" loading={mutation.isPending}>
                            创建项目
                        </Button>
                    </div>
                </Form>
            </DialogFrame>
            <CanvasStylePickerModal
                open={stylePickerOpen}
                value={selectedStyle?.id}
                onClose={() => setStylePickerOpen(false)}
                onSelect={(preset) => {
                    setSelectedStyle(preset);
                    setStylePickerOpen(false);
                }}
            />
            <DialogFrame
                className="library-modal pc-projects-dialog pc-project-dialog pc-projects-generating-dialog"
                title="AI 生成章节"
                subtitle="项目、故事大纲和章节会按顺序创建，请保持当前页面开启。"
                open={generating}
                footer={null}
                closable={false}
                mask={{ closable: false }}
                keyboard={false}
                frameSize="lg"
            >
                <div className="app-story-generating">
                    <div className="app-story-generating-head">
                        <span className="app-story-generating-mark">
                            <Sparkles className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <p>AI 正在创作</p>
                            <span className="block text-[var(--fs-tiny)] text-foreground/45">正在生成剧名、简介与章节</span>
                        </div>
                        {generateModel || effectiveConfig.textModel ? <span className="app-story-generating-model">{modelDisplayName(effectiveConfig, generateModel || effectiveConfig.textModel)}</span> : null}
                    </div>
                    <div className="app-story-generating-progress" aria-hidden="true" />
                    <div className="app-story-generating-grid">
                        <div className="app-story-generating-story">
                            <span className="app-story-generating-caption">故事起点</span>
                            <p>{storyDraft.trim() || "等待故事输入"}</p>
                            <span className="app-story-generating-meta">
                                {generateChapterCount} 章 · 每章约 {generateWordCount} 字 · {generateStructure} · {generatePerspective}
                            </span>
                            {selectedStyle ? (
                                <span className="app-story-generating-style">
                                    <img src={selectedStyle.imageUrl} alt="" />
                                    <span>{selectedStyle.title}</span>
                                </span>
                            ) : null}
                        </div>
                        <ol className="app-story-generating-steps">
                            {generationSteps.map((step) => {
                                const state = generationStatus.startsWith(step.label) ? "is-active" : generationStepDone(step.label, generationStatus) ? "is-done" : "";
                                return (
                                    <li key={step.label} className={state}>
                                        <span className="app-story-generating-step-dot" />
                                        <span>{step.label}</span>
                                        <em>{state === "is-active" ? "进行中" : state === "is-done" ? "完成" : "等待"}</em>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                    <div className="app-story-generating-preview">
                        <div className="app-story-generating-preview-head">
                            <span>实时草稿</span>
                            <span className="app-story-generating-live" />
                            <em>{generationPreview ? "正在输出" : "等待模型输出"}</em>
                        </div>
                        <pre>{generationPreview}</pre>
                    </div>
                </div>
            </DialogFrame>
        </WorkspacePage>
    );
}
