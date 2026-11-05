import { Button, Spin } from "antd";
import { ChevronLeft, ChevronRight, Clapperboard, Copy, Download, ImageOff, ImagePlus, SquarePen, X } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { RelativeTime } from "@/components/ui/product/relative-time";
import { AppModal } from "@/components/ui/product/app-modal/app-modal";
import { taskBillingLabel } from "@/lib/generation-task-billing";
import type { GenerationTask } from "@/services/api/task-center";
import type { WorkbenchKind } from "@/services/api/workbench";
import { resolveWorkbenchResourceURL } from "@/services/api/workbench";
import { getActiveUserScope } from "@/lib/user-scope";

import type { WorkbenchOutput } from "./workbench-batches";
import type { GalleryBatch } from "./workbench-gallery";
import { WorkbenchOutputImage } from "./workbench-results";

const VideoPlayer = lazy(() => import("@/components/video-player").then((module) => ({ default: module.VideoPlayer })));

export function WorkbenchOutputVideo({ output }: { output: WorkbenchOutput }) {
    const scope = useRef(getActiveUserScope()).current;
    const live = useRef(true);
    const [attempt, setAttempt] = useState(0);
    const [url, setURL] = useState(output.url);
    const [failed, setFailed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        live.current = true;
        return () => {
            live.current = false;
        };
    }, []);
    const active = () => live.current && scope === getActiveUserScope();
    const reload = async () => {
        if (!active() || refreshing) return;
        setRefreshing(true);
        try {
            const nextURL = output.resourceId ? await resolveWorkbenchResourceURL(output.resourceId, "playback", true) : output.url;
            if (!active()) return;
            if (!nextURL) throw new Error("视频预览地址暂不可用");
            setURL(nextURL);
            setAttempt((value) => value + 1);
            setFailed(false);
            setError("");
        } catch (reason) {
            if (active()) setError(reason instanceof Error ? reason.message : "预览加载失败");
        } finally {
            if (active()) setRefreshing(false);
        }
    };
    return failed ? (
        <div className="workbench-media-unavailable" role="status">
            <ImageOff />
            <span>{error || "视频预览暂不可用，生成记录已保留"}</span>
            <Button loading={refreshing} onClick={() => void reload()}>
                重新加载预览
            </Button>
        </div>
    ) : (
        <Suspense fallback={<Spin />}>
            <VideoPlayer key={`${output.key}:${attempt}`} src={url} mimeType={output.mimeType} title="生成视频" className="wb-viewer-video" autoPlay onPlaybackFailure={() => setFailed(true)} onError={() => setFailed(true)} />
        </Suspense>
    );
}

function elapsedLabel(task: GenerationTask) {
    const start = Date.parse(task.startedAt || task.createdAt);
    const end = task.completedAt ? Date.parse(task.completedAt) : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function isEditableTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest("input, textarea, select, [data-media-player]")));
}

export function WorkbenchViewer({
    kind,
    batch,
    outputKey,
    detail,
    presetName,
    onNavigate,
    onClose,
    onDownload,
    onUseAsReference,
    onMakeVideo,
    onReuse,
    onCopyPrompt,
}: {
    kind: WorkbenchKind;
    batch: GalleryBatch | null;
    outputKey: string | null;
    detail?: GenerationTask;
    presetName?: string;
    onNavigate: (output: WorkbenchOutput) => void;
    onClose: () => void;
    onDownload: (output: WorkbenchOutput) => void;
    onUseAsReference?: (output: WorkbenchOutput) => void;
    onMakeVideo?: (output: WorkbenchOutput) => void;
    onReuse: (task: GenerationTask) => void;
    onCopyPrompt: (prompt: string) => void;
}) {
    const outputs = batch?.outputs || [];
    const index = Math.max(
        0,
        outputs.findIndex((item) => item.key === outputKey),
    );
    const output = outputs[index];
    const task = output ? batch?.tasks.find((item) => item.id === output.taskId) : undefined;
    const [size, setSize] = useState<{ key: string; width: number; height: number } | null>(null);
    const open = Boolean(batch && output);
    const prompt = detail?.prompt || task?.prompt || batch?.prompt || "";

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target) || outputs.length < 2) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                onNavigate(outputs[(index + (event.key === "ArrowLeft" ? -1 : 1) + outputs.length) % outputs.length]);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [index, onNavigate, open, outputs]);

    const billing = detail?.billing || task?.billing;
    const elapsed = task ? elapsedLabel(detail || task) : "";
    const dimensions = output && size?.key === output.key ? `${size.width} × ${size.height}` : output?.width && output.height ? `${output.width} × ${output.height}` : "";

    return (
        <AppModal open={open} flush footer={null} closable={false} centered width="min(1240px, calc(100vw - 32px))" onCancel={onClose} className="wb-viewer-modal" title={null} aria-label="作品详情">
            {batch && output ? (
                <div className="wb-viewer">
                    <div className="wb-viewer-stage">
                        <div className="wb-viewer-canvas">
                            {output.kind === "video" ? (
                                <WorkbenchOutputVideo key={`${output.key}:${output.url}`} output={output} />
                            ) : (
                                <WorkbenchOutputImage key={`${output.key}:${output.url}`} output={output} onLoad={(width, height) => setSize({ key: output.key, width, height })} />
                            )}
                            {outputs.length > 1 ? (
                                <>
                                    <span className="wb-viewer-counter">
                                        {index + 1} / {outputs.length}
                                    </span>
                                    <button type="button" className="wb-viewer-nav is-prev" data-icon-only aria-label="上一个" onClick={() => onNavigate(outputs[(index - 1 + outputs.length) % outputs.length])}>
                                        <ChevronLeft />
                                    </button>
                                    <button type="button" className="wb-viewer-nav is-next" data-icon-only aria-label="下一个" onClick={() => onNavigate(outputs[(index + 1) % outputs.length])}>
                                        <ChevronRight />
                                    </button>
                                </>
                            ) : null}
                        </div>
                        {outputs.length > 1 ? (
                            <div className="wb-viewer-strip" role="listbox" aria-label="同批作品">
                                {outputs.map((item, itemIndex) => (
                                    <button key={item.key} type="button" role="option" aria-selected={item.key === output.key} aria-label={`第 ${itemIndex + 1} 个`} className={item.key === output.key ? "is-active" : ""} onClick={() => onNavigate(item)}>
                                        {item.thumbUrl ? <img src={item.thumbUrl} alt="" loading="lazy" /> : <span className="wb-viewer-strip-video" />}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <aside className="wb-viewer-info">
                        <header>
                            <div>
                                <span className="wb-viewer-kicker">{kind === "image" ? "图片" : "视频"}作品</span>
                                <h2>{batch.toolName || "自由创作"}</h2>
                            </div>
                            <button type="button" className="wb-icon-button" data-icon-only aria-label="关闭预览" onClick={onClose}>
                                <X />
                            </button>
                        </header>
                        <div className="wb-viewer-scroll">
                            <section className="wb-viewer-block">
                                <div className="wb-viewer-block-head">
                                    <span>提示词</span>
                                    <button type="button" className="wb-text-link" disabled={!prompt} onClick={() => onCopyPrompt(prompt)}>
                                        <Copy />
                                        复制
                                    </button>
                                </div>
                                <p className="wb-viewer-prompt">{prompt || "（无提示词）"}</p>
                            </section>
                            {batch.chips.length ? (
                                <div className="wb-viewer-tags">
                                    {batch.chips.map((chip) => (
                                        <span key={chip} className="wb-tag">
                                            {chip}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                            <dl className="wb-viewer-meta">
                                {batch.modelLabel ? (
                                    <div>
                                        <dt>模型</dt>
                                        <dd>{batch.modelLabel}</dd>
                                    </div>
                                ) : null}
                                {presetName ? (
                                    <div>
                                        <dt>模板</dt>
                                        <dd>{presetName}</dd>
                                    </div>
                                ) : null}
                                {dimensions ? (
                                    <div>
                                        <dt>尺寸</dt>
                                        <dd>{dimensions} px</dd>
                                    </div>
                                ) : null}
                                <div>
                                    <dt>创建</dt>
                                    <dd>
                                        <RelativeTime value={task?.createdAt || batch.createdAt} />
                                    </dd>
                                </div>
                                {elapsed ? (
                                    <div>
                                        <dt>耗时</dt>
                                        <dd>{elapsed}</dd>
                                    </div>
                                ) : null}
                                {billing ? (
                                    <div>
                                        <dt>积分</dt>
                                        <dd>{taskBillingLabel(billing)}</dd>
                                    </div>
                                ) : null}
                            </dl>
                        </div>
                        <footer className="wb-viewer-actions">
                            <Button type="primary" icon={<Download />} onClick={() => onDownload(output)}>
                                下载{output.kind === "video" ? "视频" : "原图"}
                            </Button>
                            <div className="wb-viewer-secondary">
                                {onUseAsReference && output.kind === "image" && output.resourceId ? (
                                    <Button icon={<ImagePlus />} onClick={() => onUseAsReference(output)}>
                                        用作参考图
                                    </Button>
                                ) : null}
                                {onMakeVideo && output.kind === "image" && output.resourceId ? (
                                    <Button icon={<Clapperboard />} onClick={() => onMakeVideo(output)}>
                                        做成视频
                                    </Button>
                                ) : null}
                                {task ? (
                                    <Button icon={<SquarePen />} onClick={() => onReuse(task)}>
                                        复用参数
                                    </Button>
                                ) : null}
                            </div>
                        </footer>
                    </aside>
                </div>
            ) : null}
        </AppModal>
    );
}
