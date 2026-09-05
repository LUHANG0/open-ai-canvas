// 第三期：时间线导出运行时。把 buildTimelineRenderPlan 产出的步骤逐步在 ffmpeg.wasm 中执行，
// 使用同源 Worker/core/WASM；每次导出独占实例，取消不会中断其他画布的合成。
import { fetchFile } from "@ffmpeg/util";
import { waitForTimelineOperation } from "./timeline-abort";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import ffmpegWorkerURL from "@ffmpeg/ffmpeg/worker?worker&url";
import ffmpegCoreURL from "@ffmpeg/core?url";
import ffmpegWasmURL from "@ffmpeg/core/wasm?url";
import { loadFFmpegInstance } from "@/lib/canvas/ffmpeg-load";
import { getMediaBlob } from "@/services/file-storage";
import type { TimelineProject } from "@/types/timeline";
import { SUBTITLE_FILE, buildSubtitleSrt, buildTimelineRenderPlan, getOrderedSubtitleClips, type TimelineRenderContext, type TimelineRenderSource } from "./timeline-to-ffmpeg";

export type TimelineExportProgress = {
    phase: "loading" | "reading" | "encoding";
    percent: number;
    detail: string;
};

export type TimelineExportOptions = {
    onProgress?: (progress: TimelineExportProgress) => void;
    context?: Partial<TimelineRenderContext>;
    signal?: AbortSignal;
    onSubtitleFallback?: () => void;
};

async function fetchSourceBlob(source: TimelineRenderSource, signal?: AbortSignal): Promise<Blob> {
    signal?.throwIfAborted();
    if (source.storageKey) {
        const stored = await waitForTimelineOperation(getMediaBlob(source.storageKey), signal);
        signal?.throwIfAborted();
        if (stored) return stored;
    }
    if (source.url) {
        const response = await fetch(source.url, { signal });
        if (!response.ok) throw new Error("视频资源请求失败（" + response.status + "）");
        return response.blob();
    }
    throw new Error("找不到素材 " + source.nodeId + " 的媒体文件");
}

/** 导出时间线为 MP4：写媒体 → 按计划逐步执行 → 返回 Blob（下载由调用方处理） */
export async function exportTimelineToMp4(timeline: TimelineProject, sources: TimelineRenderSource[], options: TimelineExportOptions = {}): Promise<Blob> {
    const { onProgress, context, signal } = options;
    signal?.throwIfAborted();
    onProgress?.({ phase: "loading", percent: 0, detail: "加载 FFmpeg" });
    const ffmpeg = new FFmpeg();
    const cancel = () => ffmpeg.terminate();
    const plan = buildTimelineRenderPlan(timeline, sources, context);
    try {
        await loadFFmpegInstance(ffmpeg, { classWorkerURL: ffmpegWorkerURL, coreURL: ffmpegCoreURL, wasmURL: ffmpegWasmURL }, signal);
        signal?.throwIfAborted();
        signal?.addEventListener("abort", cancel, { once: true });
        for (const source of sources) {
            signal?.throwIfAborted();
            onProgress?.({ phase: "reading", percent: 5, detail: "读取素材 " + source.fileName });
            const blob = await fetchSourceBlob(source, signal);
            signal?.throwIfAborted();
            await ffmpeg.writeFile(source.fileName, await fetchFile(blob));
        }

        const executableSteps = plan.steps.filter((step) => step.kind !== "subtitle");
        let stepIndex = 0;
        for (const step of plan.steps) {
            signal?.throwIfAborted();
            if (step.kind === "subtitle") {
                const srt = buildSubtitleSrt(getOrderedSubtitleClips(timeline));
                if (srt) {
                    await ffmpeg.writeFile(SUBTITLE_FILE, new TextEncoder().encode(srt));
                }
                continue;
            }
            if (step.args.includes("concat.txt")) {
                const content = plan.concatEntries.map((file) => "file '" + file + "'").join("\n");
                await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(content));
            }
            onProgress?.({ phase: "encoding", percent: Math.round(10 + (stepIndex / Math.max(1, executableSteps.length)) * 75), detail: step.description });

            if (step.kind === "burn") {
                const concatOutput = step.args[step.args.indexOf("-i") + 1];
                try {
                    const exitCode = await ffmpeg.exec(["-y", ...step.args]);
                    if (exitCode !== 0) throw new Error("burn exit " + exitCode);
                } catch {
                    signal?.throwIfAborted();
                    // 当前 @ffmpeg/core 可能不含 libass（subtitles 滤镜），回退为直接封装已拼接视频。
                    options.onSubtitleFallback?.();
                    onProgress?.({ phase: "encoding", percent: 92, detail: "字幕烧录不可用，回退为无字幕导出" });
                    const exitCode = await ffmpeg.exec(["-y", "-i", concatOutput, "-c", "copy", plan.finalOutput]);
                    if (exitCode !== 0) throw new Error("导出失败：字幕烧录与回退均失败");
                }
            } else {
                const exitCode = await ffmpeg.exec(["-y", ...step.args]);
                if (exitCode !== 0) throw new Error("导出失败：" + step.description);
            }
            stepIndex += 1;
        }

        const output = await ffmpeg.readFile(plan.finalOutput);
        signal?.throwIfAborted();
        onProgress?.({ phase: "encoding", percent: 100, detail: "导出完成" });
        return new Blob([output as BlobPart], { type: "video/mp4" });
    } catch (error) {
        signal?.throwIfAborted();
        throw error;
    } finally {
        signal?.removeEventListener("abort", cancel);
        ffmpeg.terminate();
    }
}
