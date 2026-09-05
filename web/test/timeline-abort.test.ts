import { expect, test } from "bun:test";
import { waitForTimelineOperation } from "../src/lib/timeline/timeline-abort";

test("取消不等待挂起缓存，迟到成功不会改变已取消结果", async () => {
    let complete!: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
        complete = resolve;
    });
    const controller = new AbortController();
    const result = waitForTimelineOperation(pending, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    complete("late media");
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
});

test("正常读取返回原值，真实读取错误不伪装取消", async () => {
    const controller = new AbortController();
    expect(await waitForTimelineOperation(Promise.resolve("media"), controller.signal)).toBe("media");
    await expect(waitForTimelineOperation(Promise.reject(new Error("cache failed")), controller.signal)).rejects.toThrow("cache failed");
});

test("已取消时保留取消理由，并消费迟到失败", async () => {
    await expect(waitForTimelineOperation(Promise.reject(new Error("late failure")), AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
});
