import { Button, Input, Spin } from "antd";
import { ArrowRight, Download, Images, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { resourceStorageKey } from "@/services/api/resources";
import { resolveWorkbenchResourceURL, type WorkbenchKind } from "@/services/api/workbench";
import type { GenerationTask } from "@/services/api/task-center";
import { formatCredits } from "@/constant/credits";
import { getActiveUserScope } from "@/lib/user-scope";
import { resourceIdFromMediaUrl, workbenchTaskOutputs, type WorkbenchOutput } from "./workbench-outputs";

export function workbenchBillingLabel(task: GenerationTask) {
    const billing = task.billing;
    if (!billing) return "费用待核实";
    if (billing.status === "settled") return typeof billing.actualAmountMicrocredits === "number" ? `实收 ${formatCredits(billing.actualAmountMicrocredits)} 积分` : "实收待核实";
    if (billing.status === "refunded") return "已退回";
    if (billing.status === "uncertain") return "结算待确认";
    return `冻结 ${formatCredits(billing.amountMicrocredits)} 积分`;
}

export function WorkbenchOutputImage({ output, thumbnail = false, onLoad }: { output: WorkbenchOutput; thumbnail?: boolean; onLoad?: (width: number, height: number) => void }) {
    const [attempt, setAttempt] = useState(0);
    const [failed, setFailed] = useState(false);
    const [refreshed, setRefreshed] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        setFailed(false);
        setRefreshed("");
        setError("");
    }, [output.key, output.url, thumbnail]);
    const reload = async () => {
        const scope = getActiveUserScope();
        setRefreshing(true);
        try {
            if (output.resourceId) {
                const url = await resolveWorkbenchResourceURL(output.resourceId, thumbnail ? "thumbnail" : "original", true);
                if (scope !== getActiveUserScope()) return;
                if (!url) throw new Error("预览地址暂不可用");
                setRefreshed(url);
            }
            setAttempt((value) => value + 1);
            setFailed(false);
            setError("");
        } catch (reason) {
            if (scope === getActiveUserScope()) setError(reason instanceof Error ? reason.message : "预览加载失败");
        } finally {
            setRefreshing(false);
        }
    };
    if (failed)
        return (
            <span className="workbench-media-unavailable" role="status">
                <Images />
                <span>{error || "预览暂不可用，生成记录已保留"}</span>
                <Button
                    size="small"
                    loading={refreshing}
                    onClick={(event) => {
                        event.stopPropagation();
                        void reload();
                    }}
                >
                    重新加载预览
                </Button>
            </span>
        );
    return (
        <CachedResourceImage
            key={`${output.key}:${thumbnail}:${attempt}`}
            storageKey={!refreshed && output.resourceId ? resourceStorageKey(output.resourceId) : undefined}
            src={refreshed || (thumbnail ? output.thumbUrl || output.url : output.url)}
            variant={thumbnail ? "thumbnail" : "original"}
            eager={!thumbnail}
            alt={thumbnail ? "作品缩略图" : "生成作品"}
            loading="lazy"
            onLoad={(event) => onLoad?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
            onError={() => setFailed(true)}
            loadingFallback={
                <span className="workbench-media-unavailable">
                    <Spin size="small" />
                    <span>正在读取预览</span>
                </span>
            }
            fallback={
                <span className="workbench-media-unavailable">
                    预览暂不可用
                    <Button
                        size="small"
                        onClick={(event) => {
                            event.stopPropagation();
                            void reload();
                        }}
                    >
                        重新加载预览
                    </Button>
                </span>
            }
        />
    );
}

type ResultActions = {
    open: (task: GenerationTask, output?: WorkbenchOutput) => void;
    loadDetail: (task: GenerationTask, force?: boolean) => Promise<void>;
    cancel: (task: GenerationTask) => void;
    retry: (task: GenerationTask) => void;
    reuse: (task: GenerationTask) => void;
    download: (output: WorkbenchOutput) => void;
};

function WorkbenchResultCard({ task, detail, detailError, kind, busy, label, actions }: { task: GenerationTask; detail?: GenerationTask; detailError?: string; kind: WorkbenchKind; busy: boolean; label: string; actions: ResultActions }) {
    const ref = useRef<HTMLElement>(null);
    const load = useRef(actions.loadDetail);
    load.current = actions.loadDetail;
    useEffect(() => {
        if (task.status !== "succeeded" || !ref.current) return;
        if (typeof IntersectionObserver === "undefined") {
            void load.current(task);
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    observer.disconnect();
                    void load.current(task);
                }
            },
            { rootMargin: "240px" },
        );
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [task.id, task.status, task.updatedAt]);
    const outputs = useMemo(() => workbenchTaskOutputs(task, kind, detail), [detail, kind, task]);
    const active = task.status === "queued" || task.status === "running";
    const failed = task.status === "failed" || task.status === "cancelled";
    return (
        <article ref={ref} className="workbench-result-card" aria-label={`生成记录：${task.prompt || label}`}>
            <header>
                <div>
                    <strong>{label}</strong>
                    <span>{new Date(task.createdAt).toLocaleString("zh-CN")}</span>
                </div>
                <span className={`workbench-status is-${task.status}`}>{active ? task.stage || (task.status === "queued" ? "排队中" : "生成中") : failed ? (task.status === "cancelled" ? "已取消" : "生成失败") : "已完成"}</span>
            </header>
            <p className="workbench-result-prompt">{task.prompt || "此记录没有提示词"}</p>
            {outputs.length ? (
                <div className="workbench-output-grid">
                    {outputs.map((output, index) => (
                        <div key={output.key} className="workbench-output-tile">
                            <div className="workbench-output-media">
                                {output.kind === "image" ? (
                                    <WorkbenchOutputImage output={output} thumbnail />
                                ) : output.thumbUrl ? (
                                    <WorkbenchOutputImage output={{ ...output, resourceId: resourceIdFromMediaUrl(output.thumbUrl) || undefined, url: output.thumbUrl, kind: "image" }} thumbnail />
                                ) : (
                                    <span className="workbench-video-placeholder">视频作品</span>
                                )}
                            </div>
                            <Button onClick={() => actions.open(detail || task, output)} aria-label={`查看第 ${index + 1} ${kind === "image" ? "张图片" : "条视频"}`}>
                                查看{kind === "image" ? "大图" : "视频"}
                                <ArrowRight className="size-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="workbench-result-state" role="status">
                    {active ? (
                        <>
                            <Spin size="small" />
                            <strong>{task.stage || "等待生成结果"}</strong>
                            {typeof task.progress === "number" ? <span>{Math.round(task.progress)}%</span> : null}
                        </>
                    ) : failed ? (
                        <p>{task.error || (task.status === "cancelled" ? "任务已取消" : "生成失败，可检查参数后重试")}</p>
                    ) : (
                        <>
                            <p>{detailError || (detail ? "作品已生成，预览暂不可用" : "作品已生成，正在准备预览")}</p>
                            <Button onClick={() => void actions.loadDetail(task, true)}>重新加载预览</Button>
                        </>
                    )}
                </div>
            )}
            {detailError && outputs.length ? (
                <div className="workbench-inline-note" role="status">
                    {detailError}
                    <Button type="link" onClick={() => void actions.loadDetail(task, true)}>
                        重新读取
                    </Button>
                </div>
            ) : null}
            <footer>
                <span>{workbenchBillingLabel(detail || task)}</span>
                <div>
                    {!outputs.length ? <Button onClick={() => actions.open(detail || task)}>查看记录</Button> : null}
                    <Button onClick={() => actions.reuse(task)}>复用参数</Button>
                    {outputs.length === 1 ? (
                        <Button icon={<Download className="size-3.5" />} onClick={() => actions.download(outputs[0])}>
                            下载
                        </Button>
                    ) : null}
                    {active ? (
                        <Button loading={busy} onClick={() => actions.cancel(task)}>
                            取消任务
                        </Button>
                    ) : null}
                    {failed ? (
                        <Button loading={busy} onClick={() => actions.retry(task)}>
                            重新生成
                        </Button>
                    ) : null}
                </div>
            </footer>
        </article>
    );
}

export function workbenchResultMatches(task: GenerationTask, filter: string, query: string) {
    const needle = query.trim().toLocaleLowerCase();
    if (needle && !task.prompt.toLocaleLowerCase().includes(needle)) return false;
    if (filter === "active") return task.status === "queued" || task.status === "running";
    if (filter === "done") return task.status === "succeeded";
    if (filter === "failed") return task.status === "failed" || task.status === "cancelled";
    return true;
}

export function WorkbenchResults({
    tasks,
    details,
    detailErrors,
    kind,
    loading,
    error,
    query,
    onQueryChange,
    onRefresh,
    modelLabel,
    busyId,
    actions,
}: {
    tasks: GenerationTask[];
    details: Record<string, GenerationTask>;
    detailErrors: Record<string, string>;
    kind: WorkbenchKind;
    loading: boolean;
    error: string;
    query: string;
    onQueryChange: (value: string) => void;
    onRefresh: () => void;
    modelLabel: (task: GenerationTask) => string;
    busyId: string;
    actions: ResultActions;
}) {
    const [filter, setFilter] = useState("all");
    const filtered = tasks.filter((task) => workbenchResultMatches(task, filter, query));
    return (
        <section className="workbench-collection" aria-label="作品与生成记录">
            <header className="workbench-collection-header">
                <div>
                    <h2>我的作品</h2>
                    <p>按每次生成整理结果，随时比较和继续创作</p>
                </div>
                <Button aria-label="刷新作品列表" icon={<RefreshCw className="size-4" />} onClick={onRefresh} />
            </header>
            <div className="workbench-collection-filters">
                <div role="group" aria-label="筛选作品状态">
                    {[
                        ["all", "全部"],
                        ["active", "进行中"],
                        ["done", "已完成"],
                        ["failed", "失败或取消"],
                    ].map(([value, title]) => (
                        <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                            {title}
                        </button>
                    ))}
                </div>
                <Input allowClear prefix={<Search className="size-4" />} placeholder="搜索提示词" aria-label="搜索作品提示词" value={query} onChange={(event) => onQueryChange(event.target.value)} />
            </div>
            {error ? (
                <div className="workbench-inline-note" role="alert">
                    {error}
                    <Button onClick={onRefresh}>重新读取</Button>
                </div>
            ) : null}
            <div className="workbench-collection-scroll" aria-busy={loading}>
                {loading && !tasks.length ? (
                    <div className="workbench-result-state">
                        <Spin />
                        <span>正在读取作品</span>
                    </div>
                ) : !filtered.length ? (
                    <div className="workbench-results-empty">
                        <Images />
                        <h3>{tasks.length ? "没有符合条件的作品" : "把想法，变成下一幅画面"}</h3>
                        <p>{tasks.length ? "换个筛选条件或提示词试试。" : "在左侧选择参考素材、描述画面；生成结果会保存在这里。"}</p>
                    </div>
                ) : (
                    filtered.map((task) => <WorkbenchResultCard key={task.id} task={task} detail={details[task.id]} detailError={detailErrors[task.id]} kind={kind} busy={busyId === task.id} label={modelLabel(task)} actions={actions} />)
                )}
                {tasks.length ? (
                    <p className="workbench-history-note">
                        最近 {tasks.length} 条生成记录 · <Link to="/tasks">查看全部任务</Link>
                    </p>
                ) : null}
            </div>
        </section>
    );
}
