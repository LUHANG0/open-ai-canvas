import { expect, test } from "bun:test";
import { loadFFmpegInstance } from "../src/lib/canvas/ffmpeg-load";

function silentWorker() {
    let terminated = 0;
    return {
        load: (_config: unknown, options?: { signal?: AbortSignal }) =>
            new Promise<boolean>((_resolve, reject) => {
                options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
            }),
        terminate: () => {
            terminated += 1;
        },
        get terminated() {
            return terminated;
        },
    };
}

test("无 Worker 响应时超时释放实例，不无限等待", async () => {
    const worker = silentWorker();
    await expect(loadFFmpegInstance(worker, {}, undefined, 5)).rejects.toThrow("视频工具加载超时");
    expect(worker.terminated).toBe(1);
});

test("加载中取消保留 AbortError 并释放 Worker", async () => {
    const worker = silentWorker();
    const controller = new AbortController();
    const pending = loadFFmpegInstance(worker, {}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminated).toBe(1);
});

test("已取消时不启动 Worker", async () => {
    let loads = 0;
    const worker = {
        load: async () => {
            loads += 1;
            return true;
        },
        terminate: () => {},
    };
    await expect(loadFFmpegInstance(worker, {}, AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
    expect(loads).toBe(0);
});

test("核心加载错误释放失败实例，下一实例可正常加载且清除计时器", async () => {
    const bad = {
        load: async () => {
            throw new Error("wasm 404");
        },
        terminate: () => {},
    };
    await expect(loadFFmpegInstance(bad, {})).rejects.toThrow("视频合并工具加载失败，请重试");
    let terminated = 0;
    const controller = new AbortController();
    await loadFFmpegInstance(
        {
            load: async () => true,
            terminate: () => {
                terminated += 1;
            },
        },
        {},
        controller.signal,
        5,
    );
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(terminated).toBe(0);
});
