import type { FFmpeg } from "@ffmpeg/ffmpeg";

/** Worker 启动失败可能没有消息返回；用独立截止时间结束加载并释放 Worker。 */
export async function loadFFmpegInstance(
    ffmpeg: Pick<FFmpeg, "load" | "terminate">,
    config: Parameters<FFmpeg["load"]>[0],
    signal?: AbortSignal,
    timeoutMs = 30_000,
) {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    if (signal?.aborted) cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("视频工具加载超时，请检查网络后重试")), timeoutMs);
    try {
        controller.signal.throwIfAborted();
        await ffmpeg.load(config, { signal: controller.signal });
    } catch (cause) {
        ffmpeg.terminate();
        if (signal?.aborted) throw signal.reason;
        throw new Error(controller.signal.aborted
            ? "视频工具加载超时，请检查网络后重试"
            : "视频合并工具加载失败，请重试", { cause });
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
    }
}
