import { FFmpeg } from "@ffmpeg/ffmpeg";
import ffmpegWorkerURL from "@ffmpeg/ffmpeg/worker?worker&url";
import ffmpegCoreURL from "@ffmpeg/core?url";
import ffmpegWasmURL from "@ffmpeg/core/wasm?url";
import { fetchFile } from "@ffmpeg/util";
import { getMediaBlob } from "@/services/file-storage";
import { loadFFmpegInstance } from "./ffmpeg-load";

export type MergeVideoInput = { id: string; url?: string; storageKey?: string };
export type MergeVideoProgress = { phase: "loading" | "reading" | "encoding"; progress: number };

let ffmpegPromise: Promise<FFmpeg> | null = null;
let mergeSequence = 0;
const ffmpegConfig = { classWorkerURL: ffmpegWorkerURL, coreURL: ffmpegCoreURL, wasmURL: ffmpegWasmURL };

// ffmpeg 只在用户明确合并视频时加载，避免把 wasm 和 worker 放进画布首屏包体。
export async function loadFFmpeg(onProgress?: (progress: MergeVideoProgress) => void) {
    if (!ffmpegPromise) {
        ffmpegPromise = (async () => {
            const ffmpeg = new FFmpeg();
            onProgress?.({ phase: "loading", progress: 0 });
            // 显式 Worker 入口让 Vite 追踪共享依赖及生产构建资产。
            await loadFFmpegInstance(ffmpeg, ffmpegConfig);
            return ffmpeg;
        })();
    }
    const pending = ffmpegPromise;
    try {
        return await pending;
    } catch (error) {
        if (ffmpegPromise === pending) ffmpegPromise = null;
        throw error;
    }
}

export async function mergeVideos(inputs: MergeVideoInput[], onProgress?: (progress: MergeVideoProgress) => void) {
    if (inputs.length < 2) throw new Error("至少选择 2 个视频才能合并");
    const ffmpeg = await loadFFmpeg(onProgress);
    const blobs: Blob[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
        const input = inputs[index];
        const storedBlob = input.storageKey ? await getMediaBlob(input.storageKey) : null;
        const remoteBlob = !storedBlob && input.url ? await fetch(input.url).then((response) => {
            if (!response.ok) throw new Error(`视频资源请求失败（${response.status}）`);
            return response.blob();
        }) : null;
        const blob = storedBlob || remoteBlob;
        if (!blob) throw new Error(`无法读取第 ${index + 1} 个视频`);
        blobs.push(blob);
        onProgress?.({ phase: "reading", progress: Math.round(((index + 1) / inputs.length) * 45) });
    }
    return encodeVideoBlobs(ffmpeg, blobs, onProgress);
}

/** 将已读取的视频统一封装为 MP4；交付包用它避免重复下载镜头资源。 */
export async function mergeVideoBlobs(blobs: Blob[], onProgress?: (progress: MergeVideoProgress) => void, signal?: AbortSignal) {
    if (blobs.length === 0) throw new Error("至少需要 1 个视频才能生成成片");
    if (signal) {
        signal.throwIfAborted();
        // 可取消的交付独占 Worker，取消时不会中断其他画布的合并。
        const ffmpeg = new FFmpeg();
        const cancel = () => ffmpeg.terminate();
        try {
            onProgress?.({ phase: "loading", progress: 0 });
            await loadFFmpegInstance(ffmpeg, ffmpegConfig, signal);
            signal.throwIfAborted();
            signal.addEventListener("abort", cancel, { once: true });
            return await encodeVideoBlobs(ffmpeg, blobs, onProgress);
        } catch (error) {
            signal.throwIfAborted();
            throw error;
        } finally {
            signal.removeEventListener("abort", cancel);
            ffmpeg.terminate();
        }
    }
    const ffmpeg = await loadFFmpeg(onProgress);
    return encodeVideoBlobs(ffmpeg, blobs, onProgress);
}

async function encodeVideoBlobs(ffmpeg: FFmpeg, blobs: Blob[], onProgress?: (progress: MergeVideoProgress) => void) {
    const runId = `merge-${Date.now()}-${mergeSequence += 1}`;
    const files: string[] = [];
    const concatFile = `${runId}-concat.txt`;
    const outputFile = `${runId}-output.mp4`;
    try {
        for (let index = 0; index < blobs.length; index += 1) {
            const name = `${runId}-input-${index}.mp4`;
            await ffmpeg.writeFile(name, await fetchFile(blobs[index]));
            files.push(name);
            onProgress?.({ phase: "reading", progress: Math.round(((index + 1) / blobs.length) * 45) });
        }
        const concatList = files.map((file) => `file '${file}'`).join("\n");
        await ffmpeg.writeFile(concatFile, concatList);
        onProgress?.({ phase: "encoding", progress: 55 });
        // 先尝试无损拼接；不同模型输出的编码参数不一致时再回退到统一转码。
        let exitCode = await ffmpeg.exec(["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", outputFile]);
        if (exitCode !== 0) {
            exitCode = await ffmpeg.exec(["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart", outputFile]);
        }
        if (exitCode !== 0) throw new Error("视频编码失败，请确认视频编码格式兼容");
        const output = await ffmpeg.readFile(outputFile);
        onProgress?.({ phase: "encoding", progress: 100 });
        return new Blob([output as BlobPart], { type: "video/mp4" });
    } finally {
        await Promise.all([...files, concatFile, outputFile].map((file) => ffmpeg.deleteFile(file).catch(() => undefined)));
    }
}
