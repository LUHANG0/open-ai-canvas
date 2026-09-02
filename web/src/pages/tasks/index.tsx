import { App, Button, Form, Input, Modal, Select } from "antd";
import { Braces, Bug, ChevronDown, Clock3, FileText, FolderKanban, LayoutGrid, List, MoveHorizontal, Plus, RefreshCw, ScrollText, Settings2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { MediaPreview } from "@/components/media-preview";
import { ListToolbar, PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { DialogFrame, DrawerFrame, SearchField, Surface, ViewToggle } from "@/components/ui/pc";
import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport";
import { CONTENT_MODERATION_ERROR_CODE, generationErrorMessage, isContentModerationError } from "@/lib/generation-error";
import { formatTaskKind, isGenerationTaskSubmissionUncertain, operationOptions, statusLabel } from "@/lib/generation-task-display";
import { backendProviderConfig, logicalModelIDForConfig } from "@/services/api/generation-task";

import {
    createAgentSession,
    createGenerationTask,
    deleteGenerationTask,
    formatTaskLog,
    listGenerationTasks,
    listTaskLogs,
    queryFailedVideoProviderTask,
    queryGenerationTask,
    refreshGenerationTaskStatus,
    retryGenerationTask,
    type CreateTaskInput,
    type GenerationTask,
    type TaskLog,
} from "@/services/api/task-center";
import { syncGenerationTaskToCanvasStore } from "@/lib/canvas/canvas-generation-task-sync";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { resolveModelRequestConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { listProjects, type ProjectSummary } from "@/services/api/projects";
import { TaskGridCard } from "./task-grid-card";
import { TaskGroupHeader, type TaskGroup } from "./task-group-header";
import { TaskListRow } from "./task-list-row";
import { formatModelName, getTaskCanvasContext, isTaskFailed, providerCancelStatusLabel, statusDotClassName, TaskBilling, taskMediaKind } from "./task-shared";
import { TaskStatusFilterBar, type TaskStatusFilter } from "./task-status-filter";

import "./tasks-pc.css";

type TaskKindFilter = "all" | "text" | "image" | "video";
type TaskViewMode = "list" | "grid";

function preferenceKeys() {
    const userId = useUserStore.getState().user?.id ?? "anon";
    return { view: `task-center-view.${userId}`, group: `task-center-group.${userId}` };
}

function readTaskPreference(key: string, fallback: string): string {
    try {
        return window.localStorage.getItem(key) ?? fallback;
    } catch (error) {
        console.warn("读取任务中心偏好失败", error);
        return fallback;
    }
}

function writeTaskPreference(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch (error) {
        console.warn("保存任务中心偏好失败", error);
    }
}

function taskStatusFilter(value: string | null): TaskStatusFilter {
    return value === "failed" || value === "active" || value === "succeeded" ? value : "all";
}

export default function TasksPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const isPcBrandViewport = usePcBrandViewport();
    const [searchParams, setSearchParams] = useSearchParams();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const projects = useCanvasStore((state) => state.projects);
    const shortDramaEnabled = useUserStore((state) => state.features.shortDramaEnabled);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const [form] = Form.useForm<CreateTaskInput & { operation: string }>();
    const { view: viewPreferenceKey, group: groupPreferenceKey } = preferenceKeys();
    const [domainProjects, setDomainProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [actingId, setActingId] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const statusFilter = taskStatusFilter(searchParams.get("status"));
    const setStatusFilter = (value: TaskStatusFilter) => {
        const next = new URLSearchParams(searchParams);
        next.set("status", value);
        setSearchParams(next, { replace: true });
    };
    const [keyword, setKeyword] = useState("");
    const [projectFilter, setProjectFilter] = useState("all");
    const [kindFilter, setKindFilter] = useState<TaskKindFilter>("all");
    const [modelFilter, setModelFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [viewMode, setViewMode] = useState<TaskViewMode>(() => (readTaskPreference(viewPreferenceKey, "list") === "grid" ? "grid" : "list"));
    const [groupEnabled, setGroupEnabled] = useState<boolean>(() => readTaskPreference(groupPreferenceKey, "0") === "1");
    const [retryingGroup, setRetryingGroup] = useState("");
    const [detailTask, setDetailTask] = useState<GenerationTask | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [mediaPreview, setMediaPreview] = useState<{ url: string; kind: "image" | "video"; title: string } | null>(null);
    const [tasks, setTasks] = useState<GenerationTask[]>([]);
    const [loadError, setLoadError] = useState("");
    const syncedCanvasTaskIdsRef = useRef(new Set<string>());
    const tasksRef = useRef<GenerationTask[]>([]);
    const canvasById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
    const domainProjectNameById = useMemo(() => new Map(domainProjects.map((item) => [item.project.id, item.project.name])), [domainProjects]);
    const projectOptions = useMemo(
        () =>
            projects.map((project) => {
                const projectName = project.projectId ? domainProjectNameById.get(project.projectId) : "";
                return { label: projectName ? `${project.title || "未命名画布"} · ${projectName}` : project.title || "未命名画布", value: project.id };
            }),
        [domainProjectNameById, projects],
    );
    const modelOptions = useMemo(() => Array.from(new Set(tasks.map((task) => formatModelName(effectiveConfig, task)).filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-CN")), [effectiveConfig, tasks]);
    const filteredTasks = useMemo(
        () =>
            tasks
                .filter((task) => {
                    if (statusFilter === "all") return true;
                    if (statusFilter === "active") return task.status === "queued" || task.status === "running";
                    if (statusFilter === "failed") return task.status === "failed" || task.status === "cancelled";
                    if (statusFilter === "succeeded") return task.status === "succeeded";
                    return false;
                })
                .filter((task) => {
                    if (projectFilter !== "all" && task.projectId !== projectFilter) return false;
                    if (kindFilter !== "all" && taskMediaKind(task) !== kindFilter) return false;
                    if (modelFilter !== "all" && formatModelName(effectiveConfig, task) !== modelFilter) return false;
                    const query = keyword.trim().toLowerCase();
                    const context = getTaskCanvasContext(task, canvasById, domainProjectNameById);
                    return !query || `${task.prompt} ${task.model || ""} ${formatTaskKind(task)} ${context.canvasName} ${context.projectName}`.toLowerCase().includes(query);
                }),
        [canvasById, domainProjectNameById, effectiveConfig, keyword, kindFilter, modelFilter, projectFilter, statusFilter, tasks],
    );
    const visibleTasks = useMemo(() => filteredTasks.slice((page - 1) * pageSize, page * pageSize), [filteredTasks, page, pageSize]);
    const taskStats = useMemo(() => {
        let today = 0;
        let active = 0;
        let succeeded = 0;
        let failed = 0;
        const now = new Date();
        for (const task of tasks) {
            if (task.createdAt) {
                const created = new Date(task.createdAt);
                if (!Number.isNaN(created.getTime()) && created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth() && created.getDate() === now.getDate()) today += 1;
            }
            if (task.status === "queued" || task.status === "running") active += 1;
            else if (task.status === "succeeded") succeeded += 1;
            else if (task.status === "failed" || task.status === "cancelled") failed += 1;
        }
        return { total: tasks.length, today, active, succeeded, failed };
    }, [tasks]);
    const groupingActive = viewMode === "list" && groupEnabled;
    const visibleTaskGroups = useMemo(() => (groupingActive ? groupTasksByCanvas(filteredTasks, canvasById, domainProjectNameById) : []), [canvasById, domainProjectNameById, filteredTasks, groupingActive]);

    const changeViewMode = (mode: TaskViewMode) => {
        setViewMode(mode);
        writeTaskPreference(viewPreferenceKey, mode);
    };

    const changeGroupEnabled = (enabled: boolean) => {
        setGroupEnabled(enabled);
        writeTaskPreference(groupPreferenceKey, enabled ? "1" : "0");
    };

    const retryGroupTasks = async (key: string, items: GenerationTask[]) => {
        const retryable = items.filter((task) => isTaskFailed(task) && task.errorCode !== CONTENT_MODERATION_ERROR_CODE && !isContentModerationError(task.error));
        if (!retryable.length) return;
        setRetryingGroup(key);
        try {
            for (const task of retryable) {
                await runAction(task.id);
            }
        } finally {
            setRetryingGroup("");
        }
    };

    const renderTaskRow = (task: GenerationTask) => (
        <TaskListRow
            key={task.id}
            task={task}
            canvasById={canvasById}
            projectNameById={domainProjectNameById}
            effectiveConfig={effectiveConfig}
            creditsEnabled={creditsEnabled}
            actingId={actingId}
            onOpen={() => void openTaskDetail(task)}
            onRetry={() => void runAction(task.id)}
            onPreview={() => task.previewUrl && setMediaPreview({ url: task.previewUrl, kind: task.previewKind === "video" ? "video" : "image", title: task.prompt || formatTaskKind(task) })}
        />
    );

    const renderTaskGridCard = (task: GenerationTask) => {
        const context = getTaskCanvasContext(task, canvasById, domainProjectNameById);
        return (
            <TaskGridCard
                key={task.id}
                task={task}
                kind={formatTaskKind(task)}
                model={formatModelName(effectiveConfig, task)}
                canvasLabel={context.projectName ? `${context.canvasName} · ${context.projectName}` : context.canvasName}
                creditsEnabled={creditsEnabled}
                actingId={actingId}
                onOpen={() => void openTaskDetail(task)}
                onRetry={() => void runAction(task.id)}
            />
        );
    };

    useEffect(() => {
        if (!shortDramaEnabled) {
            setDomainProjects([]);
            return;
        }
        let cancelled = false;
        void listProjects()
            .then((result) => {
                if (!cancelled) setDomainProjects(result.projects);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [shortDramaEnabled]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
        if (page > maxPage) setPage(maxPage);
    }, [filteredTasks.length, page, pageSize]);

    const syncCompletedCanvasTasks = useCallback(async (items: GenerationTask[]) => {
        const pendingTaskIds = new Set(
            useCanvasStore
                .getState()
                .projects.flatMap((project) => project.nodes)
                .filter((node) => node.metadata?.taskId && (node.metadata.status !== "success" || !node.metadata.content))
                .map((node) => node.metadata!.taskId!),
        );
        const candidates = items.filter((task) => task.status === "succeeded" && pendingTaskIds.has(task.id) && task.projectId && task.type.startsWith("canvas_") && !syncedCanvasTaskIdsRef.current.has(task.id));
        await Promise.all(
            candidates.map(async (task) => {
                syncedCanvasTaskIdsRef.current.add(task.id);
                try {
                    const detail = task.resultJson ? task : await queryGenerationTask(task.id);
                    await syncGenerationTaskToCanvasStore(detail);
                } catch {
                    syncedCanvasTaskIdsRef.current.delete(task.id);
                }
            }),
        );
    }, []);

    const loadTasks = useCallback(
        async (showLoading = false) => {
            if (showLoading) setLoading(true);
            try {
                const next = await listGenerationTasks();
                setLoadError("");
                setTasks((current) => reconcileTaskSummaries(current, next));
                void syncCompletedCanvasTasks(next);
                return next;
            } catch (error) {
                if (showLoading) {
                    const nextError = error instanceof Error ? error.message : "任务加载失败";
                    setLoadError(nextError);
                    message.error(nextError);
                }
                return undefined;
            } finally {
                if (showLoading) setLoading(false);
            }
        },
        [message, syncCompletedCanvasTasks],
    );

    const openTaskDetail = useCallback(
        async (task: GenerationTask) => {
            setDetailTask(task);
            setTaskLogs([]);
            setDetailError("");
            setDetailLoading(true);
            setLogsLoading(true);
            try {
                const [detail, logs] = await Promise.all([queryGenerationTask(task.id), listTaskLogs(task.id)]);
                const mergedDetail = mergeTaskSnapshots(task, detail);
                setDetailTask(mergedDetail);
                setTaskLogs(logs);
                if (await syncGenerationTaskToCanvasStore(mergedDetail)) message.success("已同步到画布");
            } catch (error) {
                const nextError = error instanceof Error ? error.message : "任务详情加载失败";
                setDetailError(nextError);
                message.error(nextError);
            } finally {
                setDetailLoading(false);
                setLogsLoading(false);
            }
        },
        [message],
    );

    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    useEffect(() => {
        let stopped = false;
        let timer = 0;
        const poll = async (initial = false) => {
            const next = await loadTasks(initial);
            if (stopped) return;
            const items = next || tasksRef.current;
            const hasActiveTasks = items.some((task) => task.status === "queued" || task.status === "running");
            timer = window.setTimeout(() => void poll(false), document.hidden ? 60_000 : hasActiveTasks ? 10_000 : 60_000);
        };
        const handleVisibility = () => {
            if (document.hidden) return;
            window.clearTimeout(timer);
            void poll(false);
        };
        void poll(true);
        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            stopped = true;
            window.clearTimeout(timer);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [loadTasks]);

    const runAction = async (id: string) => {
        const currentTask = tasksRef.current.find((task) => task.id === id);
        if (currentTask && isGenerationTaskSubmissionUncertain(currentTask)) {
            message.warning("提交结果尚未确认，不能自动重试；请先核对官方状态，避免重复生成。");
            return;
        }
        setActingId(id);
        try {
            const next = await retryGenerationTask(id);
            setTasks((items) => items.map((item) => (item.id === id ? next : item)));
            setDetailTask((current) => (current?.id === id ? { ...current, ...next } : current));
            setStatusFilter("active");
            setPage(1);
            message.success("任务已重新入队");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
        } finally {
            setActingId("");
        }
    };

    const deleteLocalTask = (task: GenerationTask) => {
        if (task.status === "queued" || task.status === "running") {
            message.warning("任务正在执行，不能删除本机记录；请等待任务完成");
            return;
        }
        Modal.confirm({
            title: "删除本机任务记录？",
            content: "这只会删除本机任务记录，不会删除已生成的素材。",
            okText: "删除本机记录",
            okButtonProps: { danger: true },
            cancelText: "保留",
            onOk: async () => {
                setActingId(task.id);
                try {
                    await deleteGenerationTask(task.id);
                    setTasks((items) => items.filter((item) => item.id !== task.id));
                    if (detailTask?.id === task.id) setDetailTask(null);
                    message.success("本机任务记录已删除");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "删除失败");
                } finally {
                    setActingId("");
                }
            },
        });
    };

    const refreshLocalTaskStatus = async (task: GenerationTask) => {
        setActingId(task.id);
        try {
            const next = await refreshGenerationTaskStatus(task.id);
            setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, ...next } : item)));
            setDetailTask((current) => (current?.id === task.id ? { ...current, ...next } : current));
            message.success(next.officialStatus ? `官方返回状态：${next.officialStatus}` : "状态已更新");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新状态失败");
        } finally {
            setActingId("");
        }
    };

    const queryProviderTask = async (task: GenerationTask) => {
        setActingId(task.id);
        try {
            const result = await queryFailedVideoProviderTask(task.id);
            if (!result.recovered) {
                setTaskLogs(await listTaskLogs(task.id));
                message.info("生成任务仍在处理中，请稍后再查询");
                return;
            }
            setDetailTask(result.task);
            setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, ...result.task } : item)));
            setTaskLogs(await listTaskLogs(task.id));
            await syncGenerationTaskToCanvasStore(result.task);
            window.dispatchEvent(new CustomEvent("wallet:updated"));
            void loadTasks(false);
            if (result.billingSettled) message.success("已获取生成结果，任务已恢复并完成结算");
            else message.warning("已获取生成结果，任务已恢复，计费状态待管员核对");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "查询生成状态失败");
        } finally {
            setActingId("");
        }
    };

    const submitTask = async () => {
        const values = await form.validateFields();
        setCreating(true);
        try {
            if (values.operation === "agent_session") {
                const textModel = values.model?.trim() || effectiveConfig.textModel || effectiveConfig.model;
                if (!isAiConfigReady(effectiveConfig, textModel)) {
                    message.error("请先在设置里配置可用的文本模型、Base URL 和 API Key");
                    return;
                }
                const requestConfig = resolveModelRequestConfig(effectiveConfig, textModel);
                const detail = await createAgentSession({
                    projectId: values.projectId,
                    prompt: values.prompt,
                    config: backendProviderConfig(requestConfig),
                    ...(logicalModelIDForConfig(requestConfig) ? { logicalModelId: logicalModelIDForConfig(requestConfig) } : {}),
                });
                setTasks((items) => [...detail.tasks, ...items]);
            } else {
                const videoModel = values.model?.trim() || effectiveConfig.videoModel || effectiveConfig.model;
                if (values.operation !== "compare_versions" && !isAiConfigReady(effectiveConfig, videoModel)) {
                    message.error("请先在设置里配置可用的视频模型、Base URL 和 API Key");
                    return;
                }
                const requestConfig = resolveModelRequestConfig(effectiveConfig, videoModel);
                const task = await createGenerationTask({
                    projectId: values.projectId,
                    type: `video_${values.operation}`,
                    operation: values.operation,
                    prompt: values.prompt,
                    provider: values.operation === "compare_versions" ? "internal-agent" : "openai-compatible",
                    model: values.operation === "compare_versions" ? "version-router" : requestConfig.model,
                    ...(values.operation !== "compare_versions" && logicalModelIDForConfig(requestConfig) ? { logicalModelId: logicalModelIDForConfig(requestConfig) } : {}),
                    input: {
                        source: "tasks-page",
                        mode: values.operation === "compare_versions" ? "workflow" : "video",
                        prompt: buildVideoOperationPrompt(values.operation, values.prompt),
                        config: values.operation === "compare_versions" ? undefined : backendProviderConfig(requestConfig),
                        metadata: { videoEditOperation: values.operation },
                    },
                });
                setTasks((items) => [task, ...items]);
            }
            setStatusFilter("active");
            setPage(1);
            setCreateOpen(false);
            form.resetFields();
            message.success("任务已创建");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "任务创建失败");
        } finally {
            setCreating(false);
        }
    };

    return (
        <>
            <WorkspacePage grid className="library-page task-library-page">
                <div className="studio-band">
                    <PageHeader
                        title="任务"
                        description="跟踪生成进度、结果与异常"
                        eyebrow="生产管理"
                        meta={<span className="task-page-total">共 {taskStats.total} 条记录</span>}
                        actions={
                            <Button className="library-primary-action task-create-action" type="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                                新建任务
                            </Button>
                        }
                    />
                    <TaskStatusFilterBar
                        stats={taskStats}
                        value={statusFilter}
                        onChange={(value) => {
                            setStatusFilter(value);
                            setPage(1);
                        }}
                    />
                    <ListToolbar
                        className="library-toolbar task-library-toolbar"
                        active={Boolean(keyword || projectFilter !== "all" || kindFilter !== "all" || modelFilter !== "all" || statusFilter !== "all")}
                        onReset={() => {
                            setKeyword("");
                            setProjectFilter("all");
                            setKindFilter("all");
                            setModelFilter("all");
                            setStatusFilter("all");
                            setPage(1);
                        }}
                        trailing={
                            <div className="flex flex-wrap items-center gap-2.5">
                                {viewMode === "list" ? (
                                    <Button
                                        type="default"
                                        size="small"
                                        className={`task-group-toggle${groupEnabled ? " is-active" : ""}`}
                                        icon={<FolderKanban className="size-3.5" />}
                                        aria-pressed={groupEnabled}
                                        onClick={() => changeGroupEnabled(!groupEnabled)}
                                    >
                                        按画布分组
                                    </Button>
                                ) : null}
                                <ViewToggle
                                    compact
                                    value={viewMode}
                                    ariaLabel="任务视图"
                                    options={[
                                        { value: "list", label: "列表视图", icon: <List className="size-3.5" /> },
                                        { value: "grid", label: "网格视图", icon: <LayoutGrid className="size-3.5" /> },
                                    ]}
                                    onChange={changeViewMode}
                                />
                            </div>
                        }
                    >
                        <SearchField
                            id="task-search"
                            name="taskSearch"
                            containerClassName="task-search-input"
                            value={keyword}
                            placeholder="搜索任务、模型或画布"
                            onClear={() => {
                                setKeyword("");
                                setPage(1);
                            }}
                            onChange={(event) => {
                                setKeyword(event.target.value);
                                setPage(1);
                            }}
                        />
                        <Select
                            className="w-full sm:w-48"
                            aria-label="按画布筛选任务"
                            value={projectFilter}
                            onChange={(value) => {
                                setProjectFilter(value);
                                setPage(1);
                            }}
                            options={[{ label: "全部画布", value: "all" }, ...projectOptions]}
                        />
                        <Select
                            className="w-full sm:w-32"
                            aria-label="按类型筛选任务"
                            value={kindFilter}
                            onChange={(value) => {
                                setKindFilter(value as TaskKindFilter);
                                setPage(1);
                            }}
                            options={[
                                { label: "全部类型", value: "all" },
                                { label: "文本", value: "text" },
                                { label: "图片", value: "image" },
                                { label: "视频", value: "video" },
                            ]}
                        />
                        <Select
                            className="w-full sm:w-44"
                            aria-label="按模型筛选任务"
                            value={modelFilter}
                            onChange={(value) => {
                                setModelFilter(value);
                                setPage(1);
                            }}
                            options={[{ label: "全部模型", value: "all" }, ...modelOptions.map((model) => ({ label: model, value: model }))]}
                        />
                    </ListToolbar>
                </div>

                <Surface id="task-results" className="canvas-library-frame task-library-frame" padding="none">
                    {loadError && tasks.length ? (
                        <div className="task-load-warning hidden" role="alert">
                            <span>任务记录暂时未能更新：{loadError}</span>
                            <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void loadTasks(true)}>
                                重试
                            </Button>
                        </div>
                    ) : null}
                    {loading && !tasks.length ? (
                        <div className="library-loading-grid" aria-label="正在加载任务">
                            {Array.from({ length: 8 }, (_, index) => (
                                <div key={index} className="library-skeleton" />
                            ))}
                        </div>
                    ) : null}
                    {isPcBrandViewport && !loading && loadError && !tasks.length ? (
                        <WorkspaceState
                            compact
                            title="任务记录加载失败"
                            description={loadError}
                            action={
                                <Button icon={<RefreshCw className="size-3.5" />} onClick={() => void loadTasks(true)}>
                                    重新加载
                                </Button>
                            }
                        />
                    ) : null}
                    {(!loading || tasks.length) && (!isPcBrandViewport || !loadError || tasks.length) ? (
                        visibleTasks.length ? (
                            viewMode === "grid" ? (
                                <div className="task-grid-view">{visibleTasks.map(renderTaskGridCard)}</div>
                            ) : groupingActive ? (
                                <div className="task-group-list">
                                    <TaskScrollHint />
                                    {visibleTaskGroups.map((group) => (
                                        <section key={group.key} className="task-group">
                                            <TaskGroupHeader group={group} retrying={retryingGroup === group.key} onRetryFailed={() => void retryGroupTasks(group.key, group.tasks)} />
                                            <div className="task-group-records-scroll" tabIndex={0} aria-label={`${group.title}任务列表，可横向滚动`}>
                                                <div className="task-record-list">{group.tasks.map(renderTaskRow)}</div>
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            ) : (
                                <div className="task-record-scroll-shell">
                                    <TaskScrollHint />
                                    <div className="task-record-table" tabIndex={0} aria-label="任务明细表，可横向滚动查看全部七列">
                                        <TaskTableHeader creditsEnabled={creditsEnabled} />
                                        <div className="task-record-list">{visibleTasks.map(renderTaskRow)}</div>
                                    </div>
                                </div>
                            )
                        ) : (
                            <WorkspaceState
                                compact
                                title={taskEmptyState(statusFilter).title}
                                description={taskEmptyState(statusFilter).description}
                                action={
                                    <Button className="library-primary-action" type="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreateOpen(true)}>
                                        新建任务
                                    </Button>
                                }
                            />
                        )
                    ) : null}
                    {!groupingActive ? (
                        <PaginationBar
                            current={page}
                            pageSize={pageSize}
                            total={filteredTasks.length}
                            pageSizeOptions={[20, 50, 100]}
                            onChange={(nextPage, nextPageSize) => {
                                setPage(nextPageSize !== pageSize ? 1 : nextPage);
                                setPageSize(nextPageSize);
                            }}
                        />
                    ) : null}
                </Surface>
            </WorkspacePage>
            <DialogFrame
                className="task-create-dialog"
                frameSize="md"
                title="新建异步生成任务"
                subtitle="创建后可在任务中心跟踪进度与结果"
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={submitTask}
                confirmLoading={creating}
                okText="创建任务"
            >
                <Form form={form} layout="vertical" initialValues={{ operation: "agent_session" }}>
                    <Form.Item name="operation" label="任务类型" rules={[{ required: true, message: "请选择任务类型" }]}>
                        <Select options={operationOptions} />
                    </Form.Item>
                    <Form.Item name="prompt" label="创作指令" rules={[{ required: true, message: "请输入创作指令" }]}>
                        <Input.TextArea rows={5} placeholder="描述短剧、MV、TVC 或要执行的视频编辑操作" />
                    </Form.Item>
                    <Form.Item name="projectId" label="绑定画布">
                        <Select allowClear showSearch optionFilterProp="label" options={projectOptions} placeholder={projectOptions.length ? "可选，选择要绑定的画布" : "暂无本地画布"} />
                    </Form.Item>
                    <Form.Item name="model" label="目标模型">
                        <Input placeholder="可选，例如 seedance、kling、wan、nano-banana" />
                    </Form.Item>
                </Form>
            </DialogFrame>
            <DrawerFrame className="task-detail-drawer" frameSize="lg" title="任务详情" subtitle={detailTask ? `ID ${detailTask.id.slice(0, 8)}` : undefined} open={Boolean(detailTask)} onClose={() => setDetailTask(null)} destroyOnHidden>
                {detailTask ? (
                    <div className="task-detail-content">
                        <header className={`task-detail-summary is-${detailTask.status}`}>
                            <div className="task-detail-summary-copy">
                                <div className="task-detail-summary-status">
                                    <span className={`task-detail-status is-${detailTask.status}`}>
                                        <i className={statusDotClassName(detailTask.status)} aria-hidden="true" />
                                        {statusLabel[detailTask.status]}
                                    </span>
                                    <span>{formatTaskKind(detailTask)}</span>
                                </div>
                                <h2>{formatModelName(effectiveConfig, detailTask)}</h2>
                                <p>
                                    <FolderKanban aria-hidden="true" />
                                    {getTaskCanvasContext(detailTask, canvasById, domainProjectNameById).canvasName}
                                </p>
                            </div>
                            <div className="task-detail-summary-metrics">
                                <div>
                                    <span>耗时</span>
                                    <strong>{formatTaskDuration(detailTask)}</strong>
                                </div>
                                <div>
                                    <span>尝试</span>
                                    <strong>第 {detailTask.attempts || 1} 次</strong>
                                </div>
                                {creditsEnabled ? (
                                    <div className="task-detail-billing">
                                        <span>积分状态</span>
                                        <TaskBilling billing={detailTask.billing} />
                                    </div>
                                ) : null}
                            </div>
                        </header>

                        <div className="task-detail-actions">
                            {detailTask.provider === "dreamina-cli" && detailTask.receiptRecorded && detailTask.status === "running" ? (
                                <Button aria-label="更新官方状态" icon={<RefreshCw className="size-4" />} loading={actingId === detailTask.id} onClick={() => void refreshLocalTaskStatus(detailTask)}>
                                    更新官方状态
                                </Button>
                            ) : null}
                            {detailTask.provider === "dreamina-cli" ? (
                                <Button danger aria-label="删除本机记录" icon={<Trash2 className="size-4" />} loading={actingId === detailTask.id} onClick={() => deleteLocalTask(detailTask)}>
                                    删除本机记录
                                </Button>
                            ) : null}
                            {canQueryProviderTask(detailTask) ? (
                                <Button icon={<RefreshCw className="size-4" />} loading={actingId === detailTask.id} onClick={() => void queryProviderTask(detailTask)}>
                                    手动查询任务
                                </Button>
                            ) : null}
                            {isTaskFailed(detailTask) ? (
                                <Button
                                    icon={<Bug className="size-4" />}
                                    onClick={() => navigate(`/settings?section=diagnostics&taskId=${encodeURIComponent(detailTask.id)}${detailTask.projectId ? `&projectId=${encodeURIComponent(detailTask.projectId)}` : ""}`)}
                                >
                                    导出诊断包
                                </Button>
                            ) : null}
                        </div>
                        {detailTask.provider === "dreamina-cli" ? <p className="task-detail-provider-note">官方状态采用最终一致轮询；转入后台后仍会继续等待并同步官方状态。官方即梦 CLI 当前不支持可靠的官方取消。</p> : null}
                        {detailError ? (
                            <section className="task-detail-load-error hidden" role="alert">
                                <div>
                                    <strong>任务详情未能完整加载</strong>
                                    <p>{detailError}</p>
                                </div>
                                <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={detailLoading} onClick={() => void openTaskDetail(detailTask)}>
                                    重试
                                </Button>
                            </section>
                        ) : null}
                        {detailTask.error ? (
                            <section className="task-detail-error" aria-label="失败原因">
                                <strong>失败原因</strong>
                                <p>{generationErrorMessage(detailTask.error)}</p>
                            </section>
                        ) : null}

                        <TaskDetailSection icon={<Clock3 />} title="执行时间" description="提交、开始与完成时间">
                            <dl className="task-detail-facts">
                                <InfoItem label="创建时间" value={formatDate(detailTask.createdAt)} />
                                <InfoItem label="开始时间" value={formatDate(detailTask.startedAt)} />
                                <InfoItem label="完成时间" value={formatDate(detailTask.completedAt)} />
                                <InfoItem label="更新时间" value={formatDate(detailTask.updatedAt)} />
                                {detailTask.providerCancelStatus ? <InfoItem label="取消状态" value={providerCancelStatusLabel(detailTask)} wrap /> : null}
                                {detailTask.providerCancelRequestedAt ? <InfoItem label="请求取消时间" value={formatDate(detailTask.providerCancelRequestedAt)} /> : null}
                            </dl>
                        </TaskDetailSection>

                        <TaskResultMedia value={detailTask.resultJson} previewUrl={detailTask.previewUrl} taskType={detailTask.type} />

                        <TaskDetailSection icon={<FileText />} title="生成输入" description="本次任务实际使用的提示词">
                            <div className="task-detail-prompt">{detailLoading ? "详情加载中..." : detailTask.prompt || "无"}</div>
                        </TaskDetailSection>

                        <TaskParameters inputJson={detailLoading ? undefined : detailTask.inputJson} />

                        <TaskDetailDisclosure icon={<Braces />} title="原始结果" description="用于接口核对和问题排查" value={detailLoading ? "详情加载中..." : formatTaskJson(detailTask.resultJson)} />
                        <TaskDetailDisclosure
                            icon={<ScrollText />}
                            title="运行日志"
                            description={logsLoading ? "日志加载中..." : taskLogs.length ? `${taskLogs.length} 条记录` : "暂无日志"}
                            value={logsLoading ? "日志加载中..." : taskLogs.length ? taskLogs.map((log) => `[${new Date(log.createdAt).toLocaleString()}] ${log.level.toUpperCase()} ${formatTaskLog(log)}`).join("\n\n") : "暂无日志"}
                        />
                    </div>
                ) : null}
            </DrawerFrame>
            <DialogFrame
                title={mediaPreview?.title || "生成结果预览"}
                subtitle="生成结果仅用于预览，原始资源保持不变"
                frameSize="lg"
                open={Boolean(mediaPreview)}
                onCancel={() => setMediaPreview(null)}
                footer={null}
                centered
                destroyOnHidden
                className="task-media-preview-modal"
            >
                {mediaPreview ? (
                    <MediaPreview
                        src={mediaPreview.url}
                        kind={mediaPreview.kind}
                        alt={mediaPreview.title}
                        controls={mediaPreview.kind === "video"}
                        className="max-h-[76vh] w-full bg-black object-contain"
                        fallbackClassName="task-media-preview-unavailable"
                    />
                ) : null}
            </DialogFrame>
        </>
    );
}

function TaskTableHeader({ creditsEnabled }: { creditsEnabled: boolean }) {
    return (
        <div className="task-record-table-head" aria-hidden="true">
            <span>任务</span>
            <span>类型</span>
            <span>模型</span>
            <span>画布</span>
            <span>创建时间</span>
            <span>{creditsEnabled ? "积分状态" : "计费"}</span>
            <span>操作</span>
        </div>
    );
}

function TaskScrollHint() {
    return (
        <div className="task-record-scroll-hint hidden" role="note">
            <MoveHorizontal aria-hidden="true" />
            <span>表格内横向滚动，可查看模型、画布、时间与积分明细</span>
        </div>
    );
}

function canQueryProviderTask(task: GenerationTask) {
    return task.status === "failed" && (task.type.startsWith("canvas_video") || task.type.startsWith("video_")) && Boolean(task.providerRequestId);
}

function reconcileTaskSummaries(current: GenerationTask[], next: GenerationTask[]) {
    if (current.length === 0) return next;
    const currentById = new Map(current.map((task) => [task.id, task]));
    let changed = false;
    const reconciled = next.map((task) => {
        const previous = currentById.get(task.id);
        if (previous?.updatedAt === task.updatedAt && previous.previewUrl === task.previewUrl && previous.billing?.status === task.billing?.status && previous.billing?.amountMicrocredits === task.billing?.amountMicrocredits) return previous;
        changed = true;
        return task;
    });
    return changed ? reconciled : current;
}

function mergeTaskSnapshots(summary: GenerationTask, detail: GenerationTask): GenerationTask {
    const definedDetail = Object.fromEntries(Object.entries(detail).filter(([, value]) => value !== undefined));
    return { ...summary, ...definedDetail } as GenerationTask;
}

function TaskResultMedia({ value, previewUrl, taskType }: { value?: string; previewUrl?: string; taskType: string }) {
    const urls = resultMediaUrls(value);
    if (previewUrl && !urls.includes(previewUrl)) urls.unshift(previewUrl);
    if (!urls.length) return null;
    return (
        <TaskDetailSection title="生成结果" description={`${urls.length} 个可用结果`}>
            <div className={`task-detail-media-grid${urls.length === 1 ? " is-single" : ""}`}>
                {urls.map((url, index) => {
                    const isVideo = isVideoResult(url, taskType);
                    return (
                        <MediaPreview
                            key={`${url}-${index}`}
                            src={url}
                            kind={isVideo ? "video" : "image"}
                            alt={`生成结果 ${index + 1}`}
                            controls={isVideo}
                            className={isVideo ? "task-result-media is-video" : "task-result-media"}
                            fallbackClassName={isVideo ? "task-result-media is-video" : "task-result-media"}
                        />
                    );
                })}
            </div>
        </TaskDetailSection>
    );
}

function resultMediaUrls(value?: string) {
    if (!value) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        parsed = value;
    }
    const urls: string[] = [];
    const visit = (item: unknown, key = "") => {
        if (typeof item === "string") {
            const isInlineMedia = /^(data:image\/|data:video\/)/.test(item);
            const isMediaPath = /\.(png|jpe?g|webp|gif|avif|mp4|webm|mov)(?:$|\?)/i.test(item);
            const isNamedMediaUrl = /^(https?:|blob:|\/)/.test(item) && /(url|image|video|result|output|media)/i.test(key);
            if ((isInlineMedia || isMediaPath || isNamedMediaUrl) && !urls.includes(item)) urls.push(item);
            return;
        }
        if (Array.isArray(item)) return item.forEach((value) => visit(value, key));
        if (item && typeof item === "object") Object.entries(item).forEach(([field, value]) => visit(value, field));
    };
    visit(parsed);
    return urls.slice(0, 12);
}

function isVideoResult(value: string, taskType: string) {
    return value.startsWith("data:video/") || /\.(mp4|webm|mov)(?:$|\?)/i.test(value) || taskType.includes("video");
}

function groupTasksByCanvas(tasks: GenerationTask[], canvasById: Map<string, { title: string; projectId?: string }>, projectNameById: Map<string, string>): TaskGroup[] {
    const groups: TaskGroup[] = [];
    const byKey = new Map<string, TaskGroup>();
    for (const task of tasks) {
        const context = getTaskCanvasContext(task, canvasById, projectNameById);
        const key = `${context.projectName}\u0000${context.canvasName}`;
        let group = byKey.get(key);
        if (!group) {
            group = { key, title: context.canvasName, projectName: context.projectName, tasks: [] };
            byKey.set(key, group);
            groups.push(group);
        }
        group.tasks.push(task);
    }
    return groups;
}

function taskEmptyState(status: TaskStatusFilter) {
    if (status === "all") return { title: "还没有任务", description: "新提交的生成会在这里显示状态和实时进度。" };
    if (status === "active") return { title: "没有运行中的任务", description: "新提交的生成会在这里显示排队状态和实时进度。" };
    if (status === "succeeded") return { title: "还没有已完成任务", description: "生成成功后，结果预览和执行记录会保留在这里。" };
    return { title: "没有失败或取消的任务", description: "失败或取消的生成会出现在这里，并提供原因和可用操作。" };
}

function formatDate(value?: string) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

function formatTaskDuration(task: GenerationTask) {
    if (!task.createdAt) return "-";
    const start = new Date(task.startedAt || task.createdAt).getTime();
    const end = task.completedAt ? new Date(task.completedAt).getTime() : task.status === "queued" || task.status === "running" ? Date.now() : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "-";
    const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}分 ${seconds}秒` : `${seconds}秒`;
}

function InfoItem({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
    return (
        <div className="task-detail-fact">
            <dt>{label}</dt>
            <dd className={wrap ? "is-wrapped" : ""} title={value}>
                {value}
            </dd>
        </div>
    );
}

function TaskDetailSection({ icon, title, description, children }: { icon?: ReactNode; title: string; description?: string; children: ReactNode }) {
    return (
        <section className="task-detail-section">
            <div className="task-detail-section-heading">
                {icon ? (
                    <span className="task-detail-section-icon" aria-hidden="true">
                        {icon}
                    </span>
                ) : null}
                <div>
                    <h3>{title}</h3>
                    {description ? <p>{description}</p> : null}
                </div>
            </div>
            {children}
        </section>
    );
}

function TaskDetailDisclosure({ icon, title, description, value }: { icon: ReactNode; title: string; description: string; value: string }) {
    return (
        <details className="task-detail-disclosure">
            <summary>
                <span className="task-detail-section-icon" aria-hidden="true">
                    {icon}
                </span>
                <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                </span>
                <ChevronDown className="task-detail-disclosure-chevron" aria-hidden="true" />
            </summary>
            <pre>{value}</pre>
        </details>
    );
}

function TaskParameters({ inputJson }: { inputJson?: string }) {
    const fields = taskParameterFields(inputJson);
    return (
        <TaskDetailSection icon={<Settings2 />} title="生成参数" description="尺寸、时长与参考素材">
            {fields.length ? (
                <dl className="task-detail-facts">
                    {fields.map((field) => (
                        <InfoItem key={field.label} label={field.label} value={field.value} wrap />
                    ))}
                </dl>
            ) : (
                <div className="task-detail-empty">暂无参数记录</div>
            )}
        </TaskDetailSection>
    );
}

function taskParameterFields(inputJson?: string) {
    const input = parseTaskInput(inputJson);
    if (!input) return [];
    const config = asRecord(input.config);
    const fields: Array<{ label: string; value: string }> = [];
    const add = (label: string, value: unknown) => {
        const text = formatParameterValue(value);
        if (text) fields.push({ label, value: text });
    };

    add("模式", input.mode);
    add("尺寸 / 比例", config.size);
    add("分辨率", config.vquality || config.quality);
    add("时长", config.videoSeconds === undefined ? undefined : `${config.videoSeconds} 秒`);
    add("生成数量", config.count);
    add("生成声音", booleanParameter(config.videoGenerateAudio));
    add("水印", booleanParameter(config.videoWatermark));
    add("音色", config.audioVoice);
    add("音频格式", config.audioFormat);
    add("音频速度", config.audioSpeed);

    add("参考图片", formatReferenceList(input.referenceImages, "图片"));
    add("参考视频", formatReferenceList(input.referenceVideos, "视频"));
    add("参考音频", formatReferenceList(input.referenceAudios, "音频"));
    add("遮罩图片", formatReferenceList(input.mask ? [input.mask] : [], "遮罩"));
    return fields;
}

function parseTaskInput(value?: string): Record<string, unknown> | null {
    if (!value) return null;
    try {
        const parsed: unknown = JSON.parse(value);
        return asRecord(parsed);
    } catch {
        return null;
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function formatParameterValue(value: unknown) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
}

function booleanParameter(value: unknown) {
    if (value === true || value === "true") return "是";
    if (value === false || value === "false") return "否";
    return undefined;
}

function formatReferenceList(value: unknown, kind: string) {
    if (!Array.isArray(value) || !value.length) return "无";
    return value
        .map((item, index) => {
            const reference = asRecord(item);
            const name = typeof reference.name === "string" && reference.name.trim() && !/^https?:|^data:|^blob:/i.test(reference.name) ? reference.name.trim() : `${kind}${index + 1}`;
            const dimensions = typeof reference.width === "number" && typeof reference.height === "number" ? `${reference.width}×${reference.height}` : "";
            const duration = typeof reference.durationMs === "number" && reference.durationMs > 0 ? `${Math.round(reference.durationMs / 100) / 10}s` : "";
            const details = [dimensions, duration].filter(Boolean).join("，");
            return details ? `${name}（${details}）` : name;
        })
        .join("、");
}

function formatTaskJson(value?: string) {
    if (!value) return "无";
    try {
        return JSON.stringify(
            JSON.parse(value),
            (_key, item: unknown) => {
                if (typeof item !== "string" || !/^data:(?:image|video|audio)\//.test(item) || item.length <= 160) return item;
                return `${item.slice(0, 72)}…（已省略 ${item.length - 72} 个字符）`;
            },
            2,
        );
    } catch {
        return value;
    }
}

function buildVideoOperationPrompt(operation: string, prompt: string) {
    const operationLabel = operationOptions.find((item) => item.value === operation)?.label || "其他视频操作";
    if (operation === "compare_versions") return `请对以下视频结果版本做对比分析，输出推荐版本、差异点和修改建议：\n${prompt}`;
    return `视频编辑任务：${operationLabel}\n创作要求：${prompt}`;
}
