import { Button, Spin } from "antd";
import { ChevronLeft, ChevronRight, Download, Maximize, RefreshCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { AppModal } from "@/components/ui/product/app-modal";
import type { GenerationTask } from "@/services/api/task-center";
import type { WorkbenchKind } from "@/services/api/workbench";
import { WorkbenchOutputImage, workbenchBillingLabel } from "./workbench-results";
import { workbenchTaskOutputs, type WorkbenchOutput } from "./workbench-outputs";

const VideoPlayer = lazy(() => import("@/components/video-player").then((module) => ({ default: module.VideoPlayer })));

export function WorkbenchViewer({
    task,
    kind,
    loading,
    error,
    outputKey,
    modelLabel,
    parameters,
    busy,
    onNavigate,
    onClose,
    onReload,
    onDownload,
    onReference,
    onVideo,
    onReuse,
    onRetry,
}: {
    task: GenerationTask | null;
    kind: WorkbenchKind;
    loading: boolean;
    error: string;
    outputKey?: string;
    modelLabel: string;
    parameters?: Record<string, unknown>;
    busy: boolean;
    onNavigate: (output: WorkbenchOutput) => void;
    onClose: () => void;
    onReload: () => void;
    onDownload: (output: WorkbenchOutput) => void;
    onReference: (output: WorkbenchOutput) => void;
    onVideo?: (output: WorkbenchOutput) => void;
    onReuse: () => void;
    onRetry: () => void;
}) {
    const outputs = task ? workbenchTaskOutputs(task, kind) : [];
    const index = Math.max(
        0,
        outputs.findIndex((output) => output.key === outputKey),
    );
    const output = outputs[index];
    const [zoom, setZoom] = useState(0);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [videoFailed, setVideoFailed] = useState(false);
    const [videoAttempt, setVideoAttempt] = useState(0);
    useEffect(() => {
        setZoom(0);
        setSize({ width: 0, height: 0 });
        setVideoFailed(false);
    }, [output?.key, output?.url]);
    useEffect(() => {
        if (!task || outputs.length < 2) return;
        const handler = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.isContentEditable || target?.closest("input, textarea, select, [data-media-player]")) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                onNavigate(outputs[(index + (event.key === "ArrowLeft" ? -1 : 1) + outputs.length) % outputs.length]);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [index, onNavigate, outputs, task]);
    const dimensions = size.width && size.height ? `${size.width} × ${size.height}` : output?.width && output.height ? `${output.width} × ${output.height}` : "尺寸待读取";
    return (
        <AppModal open={Boolean(task)} onCancel={onClose} footer={null} flush closable={false} title={null} width="min(1280px, calc(100vw - 24px))" centered className="workbench-viewer-modal" rootClassName="workbench-overlay">
            {task ? (
                <div className="workbench-viewer" aria-label="作品详情">
                    <section className="workbench-viewer-stage" aria-label="作品预览">
                        <header>
                            <strong>{output ? `${index + 1} / ${outputs.length}` : "生成记录"}</strong>
                            <div>
                                {output?.kind === "image" ? (
                                    <>
                                        <Button aria-label="缩小作品" icon={<ZoomOut />} disabled={!zoom} onClick={() => setZoom((value) => (value === 2 ? 1 : 0))} />
                                        <Button aria-label="原图百分之百" onClick={() => setZoom(1)}>
                                            100%
                                        </Button>
                                        <Button aria-label="放大作品" icon={<ZoomIn />} disabled={zoom === 2} onClick={() => setZoom(2)} />
                                        <Button aria-label="适应窗口" icon={<Maximize />} onClick={() => setZoom(0)} />
                                    </>
                                ) : null}
                                <Button aria-label="关闭作品预览" icon={<X />} onClick={onClose} />
                            </div>
                        </header>
                        <div className={`workbench-viewer-media ${zoom && output?.kind === "image" ? "is-zoomed" : ""}`} tabIndex={0} aria-label={zoom ? "可滚动查看原图" : "完整作品画面"}>
                            {loading && !output ? (
                                <Spin />
                            ) : output?.kind === "image" ? (
                                <div style={zoom && size.width ? { width: size.width * zoom, height: size.height * zoom, flexShrink: 0 } : undefined}>
                                    <WorkbenchOutputImage output={output} onLoad={(width, height) => setSize({ width, height })} />
                                </div>
                            ) : output?.kind === "video" ? (
                                videoFailed ? (
                                    <div className="workbench-media-unavailable" role="status">
                                        <p>视频预览暂不可用，生成记录已保留</p>
                                        <Button
                                            onClick={() => {
                                                setVideoFailed(false);
                                                setVideoAttempt((value) => value + 1);
                                                onReload();
                                            }}
                                        >
                                            重新加载预览
                                        </Button>
                                    </div>
                                ) : (
                                    <Suspense fallback={<Spin />}>
                                        <VideoPlayer key={`${output.key}:${videoAttempt}`} src={output.url} title="生成视频" className="workbench-viewer-video" onPlaybackFailure={() => setVideoFailed(true)} onError={() => setVideoFailed(true)} />
                                    </Suspense>
                                )
                            ) : (
                                <div className="workbench-media-unavailable" role="status">
                                    <p>{error || (task.status === "succeeded" ? "作品已生成，预览暂不可用" : task.error || task.stage || "等待生成结果")}</p>
                                    <Button onClick={onReload}>重新读取预览</Button>
                                </div>
                            )}
                        </div>
                        {outputs.length > 1 ? (
                            <nav className="workbench-viewer-pagination" aria-label="切换作品">
                                <Button aria-label="上一个作品" icon={<ChevronLeft />} onClick={() => onNavigate(outputs[(index - 1 + outputs.length) % outputs.length])} />
                                <div>
                                    {outputs.map((item, ordinal) => (
                                        <button key={item.key} type="button" aria-label={`查看作品 ${ordinal + 1}`} aria-current={ordinal === index ? "true" : undefined} onClick={() => onNavigate(item)}>
                                            {ordinal + 1}
                                        </button>
                                    ))}
                                </div>
                                <Button aria-label="下一个作品" icon={<ChevronRight />} onClick={() => onNavigate(outputs[(index + 1) % outputs.length])} />
                            </nav>
                        ) : null}
                    </section>
                    <aside className="workbench-viewer-info">
                        <header>
                            <h2>{modelLabel}</h2>
                            <span>{task.status === "succeeded" ? "生成已完成" : task.status === "failed" ? "生成失败" : task.status === "cancelled" ? "已取消" : task.stage || "正在生成"}</span>
                        </header>
                        <div className="workbench-viewer-details" aria-busy={loading}>
                            {error ? (
                                <div role="alert" className="workbench-inline-note">
                                    {error}
                                    <Button type="link" onClick={onReload}>
                                        重新读取
                                    </Button>
                                </div>
                            ) : null}
                            <h3>提示词</h3>
                            <p tabIndex={0} aria-label="任务提示词">
                                {task.prompt || "此记录没有提示词"}
                            </p>
                            <h3>参数</h3>
                            <pre tabIndex={0} aria-label="任务参数">
                                {loading ? "正在读取参数…" : JSON.stringify(parameters || {}, null, 2)}
                            </pre>
                            <dl>
                                <div>
                                    <dt>尺寸</dt>
                                    <dd>{dimensions}</dd>
                                </div>
                                <div>
                                    <dt>费用</dt>
                                    <dd>{workbenchBillingLabel(task)}</dd>
                                </div>
                                <div>
                                    <dt>创建时间</dt>
                                    <dd>{new Date(task.createdAt).toLocaleString("zh-CN")}</dd>
                                </div>
                            </dl>
                        </div>
                        <footer>
                            {output ? (
                                <Button type="primary" icon={<Download className="size-4" />} onClick={() => onDownload(output)}>
                                    下载{kind === "image" ? "原图" : "视频"}
                                </Button>
                            ) : null}
                            <Button disabled={loading} onClick={onReuse}>
                                复用参数
                            </Button>
                            {output?.kind === "image" && output.resourceId ? (
                                <>
                                    <Button onClick={() => onReference(output)}>用作参考图</Button>
                                    {onVideo ? <Button onClick={() => onVideo(output)}>做成视频</Button> : null}
                                </>
                            ) : null}
                            {task.status === "failed" || task.status === "cancelled" ? (
                                <Button loading={busy} disabled={loading} onClick={onRetry}>
                                    重新生成
                                </Button>
                            ) : null}
                            <Button type="text" icon={<RefreshCw className="size-3.5" />} onClick={onReload}>
                                重新读取记录
                            </Button>
                        </footer>
                    </aside>
                </div>
            ) : null}
        </AppModal>
    );
}
