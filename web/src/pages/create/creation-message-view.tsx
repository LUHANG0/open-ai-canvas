import { useState } from "react";
import { Modal } from "antd";
import { Copy, CornerUpLeft, Download, FileText, Film, Image as ImageIcon, LoaderCircle, Maximize2, Music2, PanelTop, RefreshCw, Sparkles, Square } from "lucide-react";
import { Link } from "react-router";

import { AIMessageMarkdown } from "@/components/ai/ai-message-markdown";
import { GenerationToolCard, type GenerationToolStatus } from "@/components/ai/generation-tool-card";
import { MessageReasoning } from "@/components/ai/message-reasoning";
import { useCopyText } from "@/hooks/use-copy-text";
import { creationCanvasHandoffPath, creationResultAssetIds, creationResultMediaEntries, type CreationResultMediaEntry } from "@/lib/canvas/canvas-asset-handoff";
import { generationErrorMessage } from "@/lib/generation-error";
import { formatVideoResolutionLabel } from "@/lib/video-generation-options";
import { useAssetStore } from "@/stores/use-asset-store";

import { creationAttachmentKind, creationMediaAspectRatio } from "./creation-assets";
import type { CreationMode } from "./creation-empty-state";
import { displayCreationPrompt, type CreationReference } from "./creation-references";
import type { CreationMessage, CreationShot } from "./creation-types";
import { CreationTooltip } from "./creation-tooltip";

const messageTimeFormatter = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function formatMessageTime(value: string) {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? messageTimeFormatter.format(timestamp) : "";
}

export function CreationTurnView({
    shot,
    turnNumber,
    sourceTurnNumber,
    modelName,
    compactLayout,
    isLatest,
    cancelling,
    onRetryFailure,
    onCreateVariant,
    onCancelGeneration,
}: {
    shot: CreationShot;
    turnNumber: number;
    sourceTurnNumber?: number;
    modelName: string;
    compactLayout: boolean;
    isLatest: boolean;
    cancelling: boolean;
    onRetryFailure: () => void;
    onCreateVariant: () => void;
    onCancelGeneration: () => void;
}) {
    return (
        <section className={`creation-turn${isLatest ? " is-latest" : ""}`} aria-label={`第 ${turnNumber} 轮创作`}>
            <span className="creation-turn-index" aria-hidden="true">
                {String(turnNumber).padStart(2, "0")}
            </span>
            <div className="creation-turn-body">
                {shot.user ? (
                    <CreationMessageView
                        item={shot.user}
                        modelName=""
                        compactLayout={compactLayout}
                        turnNumber={turnNumber}
                        sourceTurnNumber={sourceTurnNumber}
                        cancelling={false}
                        onRetryFailure={onRetryFailure}
                        onCreateVariant={onCreateVariant}
                        onCancelGeneration={onCancelGeneration}
                    />
                ) : null}
                {shot.result ? (
                    <CreationMessageView item={shot.result} modelName={modelName} compactLayout={compactLayout} cancelling={cancelling} onRetryFailure={onRetryFailure} onCreateVariant={onCreateVariant} onCancelGeneration={onCancelGeneration} />
                ) : null}
            </div>
        </section>
    );
}

export function CreationMessageView({
    item,
    modelName,
    compactLayout,
    turnNumber,
    sourceTurnNumber,
    cancelling,
    onRetryFailure,
    onCreateVariant,
    onCancelGeneration,
}: {
    item: CreationMessage;
    modelName: string;
    compactLayout: boolean;
    turnNumber?: number;
    sourceTurnNumber?: number;
    cancelling: boolean;
    onRetryFailure: () => void;
    onCreateVariant: () => void;
    onCancelGeneration: () => void;
}) {
    if (item.role === "user") return <CreationUserMessage item={item} turnNumber={turnNumber} sourceTurnNumber={sourceTurnNumber} />;
    const mode = item.mode || "text";
    const isRunning = item.status === "pending" || item.status === "streaming";
    const stateLabel = item.status === "cancelled" ? "已停止" : item.status === "error" ? "生成失败" : "";
    const resultLabel = mode === "image" ? "图像" : mode === "video" ? "视频" : "文本";
    const headingLabel = mode === "text" ? "影策 AI" : item.status === "error" ? `${resultLabel}生成失败` : item.status === "cancelled" ? `${resultLabel}生成已停止` : isRunning ? `正在生成${resultLabel}` : `${resultLabel}已生成`;
    const heading = (
        <>
            <span className="creation-message-mark">
                <Sparkles />
            </span>
            <strong>{headingLabel}</strong>
            {modelName ? <span className="creation-message-model">{modelName}</span> : null}
            {item.createdAt ? <time dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time> : null}
            {stateLabel ? <span className={`creation-message-state is-${item.status}`}>{stateLabel}</span> : null}
            {isRunning ? (
                <button type="button" className="creation-message-stop" onClick={onCancelGeneration} disabled={cancelling} aria-label={cancelling ? "正在停止本轮生成" : "停止本轮生成"}>
                    {cancelling ? <LoaderCircle className="animate-spin" /> : <Square />}
                    <span>{cancelling ? "正在停止" : "停止"}</span>
                </button>
            ) : null}
        </>
    );
    const toolStatus: GenerationToolStatus = item.status === "pending" ? "running" : item.status === "error" ? "error" : item.status === "cancelled" ? "cancelled" : "completed";
    return (
        <article className={`creation-assistant-message is-${mode}`} aria-busy={item.status === "pending" || item.status === "streaming" ? true : undefined}>
            {mode === "text" ? (
                <>
                    <div className="creation-message-heading">{heading}</div>
                    {item.reasoning ? <MessageReasoning reasoning={item.reasoning} isStreaming={item.status === "streaming"} /> : null}
                    <div className="creation-message-content">{item.content ? <AIMessageMarkdown isStreaming={item.status === "streaming"}>{item.content}</AIMessageMarkdown> : <span>正在生成…</span>}</div>
                </>
            ) : (
                <GenerationToolCard status={toolStatus} isBulk={mode !== "video" && (item.resultUrls?.length || Number(item.settings?.count) || 1) > 1} defaultExpanded={compactLayout ? true : undefined} heading={heading}>
                    <MediaResult item={item} compactLayout={compactLayout} onRetryFailure={onRetryFailure} onCreateVariant={onCreateVariant} />
                </GenerationToolCard>
            )}
            {item.error && mode === "text" ? (
                <div className="creation-message-error" role="alert">
                    <span>{generationErrorMessage(item.error)}</span>
                    <button type="button" onClick={onRetryFailure}>
                        <RefreshCw />
                        重新生成
                    </button>
                </div>
            ) : null}
        </article>
    );
}

function CreationUserMessage({ item, turnNumber, sourceTurnNumber }: { item: CreationMessage; turnNumber?: number; sourceTurnNumber?: number }) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const copyText = useCopyText();
    const visiblePrompt = displayCreationPrompt(item.content, item.references || []);
    return (
        <article className="creation-user-message">
            <div className="creation-user-message-meta">
                <span>你的描述</span>
                {turnNumber ? <span className="creation-user-message-turn">第 {String(turnNumber).padStart(2, "0")} 轮</span> : null}
                {item.createdAt ? <time dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time> : null}
                <CreationTooltip title="复制消息">
                    <button type="button" className="creation-user-message-copy" aria-label="复制提示词" onClick={() => copyText(visiblePrompt, "提示词已复制")}>
                        <Copy />
                    </button>
                </CreationTooltip>
            </div>
            <div className="creation-user-message-copy-wrap">
                <p>{visiblePrompt}</p>
            </div>
            {sourceTurnNumber ? (
                <div className="creation-user-message-context">
                    <CornerUpLeft aria-hidden="true" />
                    延续第 {sourceTurnNumber} 轮
                </div>
            ) : null}
            {item.references?.length ? <CreationMessageReferences references={item.references} /> : null}
            {item.attachments?.length ? (
                <div className="creation-user-message-attachments">
                    {item.attachments.map((attachment) => {
                        const kind = creationAttachmentKind(attachment);
                        const previewable = kind === "image" || kind === "video";
                        const url = attachment.previewUrl || ("dataUrl" in attachment ? attachment.dataUrl : attachment.url) || "";
                        return (
                            <button
                                key={attachment.id}
                                type="button"
                                className={!previewable ? "is-file" : undefined}
                                onClick={() => {
                                    if (!previewable) return;
                                    setPreviewType(kind === "video" ? "video" : "image");
                                    setPreviewUrl(kind === "video" ? attachment.url || "" : url);
                                }}
                                aria-label={previewable ? `预览 ${attachment.name || "附件"}` : attachment.name || "附件"}
                                disabled={previewable && !url}
                            >
                                {kind === "video" ? (
                                    <video src={attachment.url || ""} poster={url !== attachment.url ? url : undefined} muted playsInline preload="metadata" />
                                ) : kind === "image" ? (
                                    <img src={url} alt={attachment.name || "附件"} width={44} height={44} loading="lazy" />
                                ) : kind === "audio" ? (
                                    <Music2 />
                                ) : (
                                    <FileText />
                                )}
                                {previewable ? (
                                    <span aria-hidden="true">
                                        <Maximize2 />
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </article>
    );
}

type CreationMediaMetadata = { width: number; height: number; durationMs?: number; mimeType?: string };

function creationMediaFormatLabel(url: string, mimeType?: string) {
    const normalized = (mimeType || "").toLowerCase();
    if (normalized.includes("jpeg") || /\.jpe?g(?:$|[?#])/i.test(url)) return "JPG";
    if (normalized.includes("png") || /\.png(?:$|[?#])/i.test(url)) return "PNG";
    if (normalized.includes("webp") || /\.webp(?:$|[?#])/i.test(url)) return "WEBP";
    if (normalized.includes("gif") || /\.gif(?:$|[?#])/i.test(url)) return "GIF";
    if (normalized.includes("webm") || /\.webm(?:$|[?#])/i.test(url)) return "WEBM";
    if (normalized.includes("quicktime") || /\.mov(?:$|[?#])/i.test(url)) return "MOV";
    if (normalized.includes("mp4") || /\.mp4(?:$|[?#])/i.test(url)) return "MP4";
    return "媒体";
}

function creationMediaResponseCopy(item: CreationMessage, isVideo: boolean) {
    const content = item.content.trim();
    const genericCompletionMessages = new Set(["视频已生成", "图片已生成", "图像已生成"]);
    if (content && !genericCompletionMessages.has(content)) return content;
    return isVideo ? "本轮视频已完成，可继续调整或添加到画布。" : "本轮图片已完成，可继续调整或添加到画布。";
}

function creationGenerationElapsedLabel(start?: string, end?: string) {
    if (!start || !end) return "已完成";
    const elapsedMs = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "已完成";
    if (elapsedMs < 1000) return "不足 1 秒";
    const seconds = Math.round(elapsedMs / 1000);
    if (seconds < 60) return `${seconds} 秒`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

function creationMediaDurationLabel(durationMs?: number) {
    if (!durationMs || !Number.isFinite(durationMs)) return "";
    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds} 秒`;
}

function configuredMediaResolution(item: CreationMessage, isVideo: boolean) {
    const ratio = item.settings?.ratio || "";
    if (/^\d+x\d+$/i.test(ratio)) return ratio.replace(/x/i, " × ");
    if (isVideo) {
        const height = Number((item.settings?.videoQuality || "").replace(/p$/i, ""));
        const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);
        if (Number.isFinite(height) && height > 0 && Number.isFinite(ratioWidth) && Number.isFinite(ratioHeight) && ratioWidth > 0 && ratioHeight > 0) {
            const width = Math.round((height * ratioWidth) / ratioHeight / 2) * 2;
            return `${width} × ${height}`;
        }
        if (height > 0) return `${height}P`;
    }
    return ratio ? `${ratio} 画幅` : "自动";
}

function compactVideoResolutionLabel(item: CreationMessage, metadata?: CreationMediaMetadata) {
    const configured = formatVideoResolutionLabel(item.settings?.videoQuality);
    if (configured) return configured;
    const shortEdge = metadata?.width && metadata?.height ? Math.min(metadata.width, metadata.height) : metadata?.height;
    return shortEdge ? formatVideoResolutionLabel(shortEdge) : "自动";
}

function MediaResult({ item, compactLayout, onRetryFailure, onCreateVariant }: { item: CreationMessage; compactLayout: boolean; onRetryFailure: () => void; onCreateVariant: () => void }) {
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const [mediaMetadata, setMediaMetadata] = useState<Record<string, CreationMediaMetadata>>({});
    const assets = useAssetStore((state) => state.assets);
    const resultUrls = item.resultUrls || [];
    const resultAssetIds = resultUrls.length ? creationResultAssetIds(assets, { messageId: item.id, taskIds: item.taskIds || [], resultUrls }) : [];
    const resultMedia = creationResultMediaEntries(assets, { messageId: item.id, taskIds: item.taskIds || [], resultUrls, mode: item.mode === "video" ? "video" : "image" });
    const canvasPath = creationCanvasHandoffPath(resultAssetIds, resultUrls.length) || "/canvas";
    if (item.status === "pending") return <CreationMediaPending mode={item.mode || "image"} ratio={item.settings?.ratio} />;
    if ((item.status === "error" || item.status === "cancelled") && !resultUrls.length)
        return (
            <div className={`creation-media-error${item.status === "cancelled" ? " is-cancelled" : ""}`} role="alert">
                <span>{item.status === "cancelled" ? item.content || "已停止" : generationErrorMessage(item.error || "生成失败")}</span>
                <button type="button" onClick={onRetryFailure}>
                    <RefreshCw />
                    重新生成
                </button>
            </div>
        );
    if (!resultUrls.length)
        return (
            <div className="creation-media-empty" role="status">
                没有返回可预览结果{" "}
                <button type="button" onClick={onRetryFailure}>
                    重试
                </button>
            </div>
        );
    const isVideo = item.mode === "video";
    const primaryResult = isVideo ? resultMedia.find((entry) => entry.kind === "video") || resultMedia[0] : resultMedia.find((entry) => entry.kind === "image") || resultMedia[0];
    const primaryUrl = primaryResult?.url || resultUrls[0];
    const supplementalImages = isVideo ? resultMedia.filter((entry) => entry.kind === "image") : [];
    const imageResults = resultMedia.filter((entry) => entry.kind === "image");
    const resultAssets = resultAssetIds.flatMap((id) => {
        const asset = assets.find((candidate) => candidate.id === id);
        return asset ? [asset] : [];
    });
    const firstAsset = (primaryResult?.assetId ? assets.find((asset) => asset.id === primaryResult.assetId) : undefined) || resultAssets.find((asset) => asset.kind === (isVideo ? "video" : "image"));
    const storedMetadata: CreationMediaMetadata | undefined =
        firstAsset?.kind === "video"
            ? { width: firstAsset.data.width, height: firstAsset.data.height, durationMs: firstAsset.data.durationMs, mimeType: firstAsset.data.mimeType }
            : firstAsset?.kind === "image"
              ? { width: firstAsset.data.width, height: firstAsset.data.height, mimeType: firstAsset.data.mimeType }
              : undefined;
    const primaryMetadata = mediaMetadata[primaryUrl] || storedMetadata;
    const resolution = primaryMetadata?.width && primaryMetadata?.height ? `${primaryMetadata.width} × ${primaryMetadata.height}` : configuredMediaResolution(item, isVideo);
    const compactResolution = isVideo ? compactVideoResolutionLabel(item, primaryMetadata) : resolution;
    const format = creationMediaFormatLabel(primaryUrl, primaryMetadata?.mimeType);
    const completedAt = item.completedAt || firstAsset?.createdAt;
    const elapsed = creationGenerationElapsedLabel(item.createdAt, completedAt);
    const mediaDuration = isVideo ? creationMediaDurationLabel(primaryMetadata?.durationMs || Number(item.settings?.seconds || 0) * 1000) : "";
    const supplementalLabel = supplementalImages.some((entry) => entry.role === "last_frame") ? "含尾帧" : supplementalImages.length ? `${supplementalImages.length} 张附图` : "";
    const resultMetrics = isVideo
        ? [
              { label: "格式", value: format },
              { label: "清晰度", value: compactResolution },
              { label: "时长", value: mediaDuration || "—" },
              { label: "生成耗时", value: elapsed },
          ]
        : [
              { label: "数量", value: `${imageResults.length} 张` },
              { label: "格式", value: format },
              { label: "分辨率", value: resolution },
              { label: "生成耗时", value: elapsed },
          ];
    const compactResultDetails = (
        <div className="creation-result-summary">
            <dl className="creation-result-meta" aria-label="生成结果明细">
                {resultMetrics.map((metric) => (
                    <div key={metric.label} aria-label={`${metric.label} ${metric.value}`}>
                        <dt className="sr-only">{metric.label}</dt>
                        <dd>{metric.label === "生成耗时" ? `耗时 ${metric.value}` : metric.value}</dd>
                    </div>
                ))}
            </dl>
            {supplementalLabel ? <span>{supplementalLabel}</span> : null}
        </div>
    );
    const resultDetails = (
        <dl className="creation-media-details" aria-label="生成结果明细">
            {resultMetrics.map((metric) => (
                <div key={metric.label}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                </div>
            ))}
        </dl>
    );
    const resultActions = (
        <div className="creation-media-actions">
            <CreationTooltip title={compactLayout ? "沿用本轮提示词、素材与输出参数，在新回合中继续调整" : "沿用本轮参数生成新版本"}>
                <button type="button" className={compactLayout ? "is-primary" : undefined} onClick={onCreateVariant}>
                    <RefreshCw />
                    {compactLayout ? "继续调整" : "生成同款"}
                </button>
            </CreationTooltip>
            <Link className="creation-result-canvas-action" to={canvasPath}>
                <PanelTop />
                {resultAssetIds.length ? "添加到画布" : "打开画布"}
            </Link>
            <CreationResultDownloads results={resultMedia} />
        </div>
    );
    return (
        <div className="creation-media-result">
            <p className="creation-media-response-copy">{creationMediaResponseCopy(item, isVideo)}</p>
            {isVideo ? (
                <button
                    type="button"
                    className="creation-video-result"
                    onClick={() => {
                        setPreviewType("video");
                        setPreviewUrl(primaryUrl);
                    }}
                    aria-label="预览生成视频"
                >
                    <video
                        muted
                        playsInline
                        preload="metadata"
                        src={primaryUrl}
                        onLoadedMetadata={(event) => {
                            const video = event.currentTarget;
                            setMediaMetadata((current) => ({
                                ...current,
                                [primaryUrl]: { width: video.videoWidth, height: video.videoHeight, durationMs: Number.isFinite(video.duration) ? video.duration * 1000 : undefined, mimeType: storedMetadata?.mimeType },
                            }));
                        }}
                    />
                    <span>
                        <Maximize2 />
                        预览视频
                    </span>
                </button>
            ) : (
                <div className="creation-image-result-grid">
                    {imageResults.map((entry) => (
                        <button
                            key={entry.url}
                            type="button"
                            className="creation-image-result"
                            onClick={() => {
                                setPreviewType("image");
                                setPreviewUrl(entry.url);
                            }}
                            aria-label="预览生成图片"
                        >
                            <img
                                src={entry.url}
                                alt="生成结果"
                                onLoad={(event) => {
                                    const image = event.currentTarget;
                                    const asset = entry.assetId ? assets.find((candidate) => candidate.id === entry.assetId) : undefined;
                                    setMediaMetadata((current) => ({ ...current, [entry.url]: { width: image.naturalWidth, height: image.naturalHeight, mimeType: asset?.kind === "image" ? asset.data.mimeType : undefined } }));
                                }}
                            />
                            <span>
                                <Maximize2 />
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {isVideo ? (
                <CreationVideoSupplementalImages
                    results={supplementalImages}
                    onPreview={(url) => {
                        setPreviewType("image");
                        setPreviewUrl(url);
                    }}
                />
            ) : null}
            {compactLayout ? (
                <footer className={`creation-result-footer is-${isVideo ? "video" : "image"}`} aria-label="结果信息与操作">
                    {compactResultDetails}
                    {resultActions}
                </footer>
            ) : (
                <>
                    {resultDetails}
                    {resultActions}
                </>
            )}
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </div>
    );
}

export function CreationVideoSupplementalImages({ results, onPreview }: { results: CreationResultMediaEntry[]; onPreview: (url: string) => void }) {
    if (!results.length) return null;
    return (
        <div className="creation-video-result-attachments" aria-label="视频附加图片">
            {results.map((entry) => {
                const label = entry.role === "last_frame" ? "尾帧" : entry.role === "first_frame" ? "首帧" : "附图";
                return (
                    <button key={entry.url} type="button" className="creation-video-result-attachment" onClick={() => onPreview(entry.url)} aria-label={`预览视频${label}`}>
                        <img src={entry.url} alt={`生成视频${label}`} />
                        <em>{label}</em>
                        <span aria-hidden="true">
                            <Maximize2 />
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

export function CreationResultDownloads({ results }: { results: CreationResultMediaEntry[] }) {
    if (!results.length) return null;
    if (results.length === 1)
        return (
            <a className="creation-result-download-action" href={results[0].url} download>
                <Download />
                下载
            </a>
        );
    return (
        <details className="creation-result-download-menu">
            <summary>
                <Download />
                下载
                <span>{results.length}</span>
            </summary>
            <div>
                {results.map((entry, index) => (
                    <a key={`${entry.url}-download`} href={entry.url} download>
                        {entry.kind === "video" ? "下载视频" : entry.role === "last_frame" ? "下载尾帧" : `下载图片 ${index + 1}`}
                    </a>
                ))}
            </div>
        </details>
    );
}

export function StoryboardResultDownloads({ results }: { results: CreationResultMediaEntry[] }) {
    if (!results.length) return null;
    if (results.length === 1)
        return (
            <a href={results[0].url} download>
                <Download />
                下载
            </a>
        );
    return (
        <details className="storyboard-editor-download-menu">
            <summary>
                <Download />
                下载
                <span>{results.length}</span>
            </summary>
            <div>
                {results.map((entry, index) => (
                    <a key={`${entry.url}-storyboard-download`} href={entry.url} download>
                        {entry.kind === "video" ? "下载视频" : entry.role === "last_frame" ? "下载尾帧" : `下载图片 ${index + 1}`}
                    </a>
                ))}
            </div>
        </details>
    );
}

function CreationMediaPending({ mode, ratio }: { mode: CreationMode; ratio?: string }) {
    return (
        <div className={`creation-media-pending is-${mode}`} style={{ aspectRatio: creationMediaAspectRatio(ratio, mode) }} role="status" aria-live="polite" aria-busy="true">
            <span className="creation-media-pending-icon">
                <Sparkles />
            </span>
            <span className="sr-only">影策正在生成{mode === "video" ? "视频" : "图像"}</span>
        </div>
    );
}

export function CreationMessageReferences({ references }: { references: CreationReference[] }) {
    return (
        <div className="creation-user-message-references" aria-label="本次引用">
            {references.map((reference) => {
                const Icon = reference.kind === "skill" ? Sparkles : reference.kind === "image" ? ImageIcon : reference.kind === "video" ? Film : reference.kind === "audio" ? Music2 : FileText;
                return (
                    <span key={reference.id} className="creation-user-message-reference">
                        {reference.previewUrl && reference.kind === "video" ? (
                            <video src={reference.previewUrl} muted playsInline preload="metadata" aria-label={reference.label} />
                        ) : reference.previewUrl && reference.kind === "image" ? (
                            <img src={reference.previewUrl} alt="" />
                        ) : (
                            <Icon />
                        )}
                        <span>{reference.label}</span>
                    </span>
                );
            })}
        </div>
    );
}

export function CreationMediaPreviewModal({ url, type, onClose }: { url: string; type: "image" | "video"; onClose: () => void }) {
    return (
        <Modal open={Boolean(url)} title={null} footer={null} centered destroyOnHidden width="fit-content" onCancel={onClose} className={`creation-media-preview-modal is-${type}`} styles={{ body: { padding: 0 } }}>
            {url ? type === "video" ? <video controls autoPlay playsInline preload="metadata" className="creation-media-preview-video" src={url} /> : <img className="creation-media-preview-image" src={url} alt="媒体预览" /> : null}
        </Modal>
    );
}
