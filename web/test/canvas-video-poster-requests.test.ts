import { describe, expect, test } from "bun:test";

import { createCanvasVideoPosterRequests } from "../src/lib/canvas/canvas-video-poster-requests";

function posterHarness() {
    const load = createCanvasVideoPosterRequests();
    const jobs: Array<{ signal: AbortSignal; resolve: (url: string) => void; reject: (error: Error) => void }> = [];
    const run = (signal: AbortSignal) => new Promise<string>((resolve, reject) => { jobs.push({ signal, resolve, reject }); });
    return { load: (signal?: AbortSignal, key = "user:video:640") => load(key, run, signal), jobs };
}

describe("canvas video poster request lifecycle", () => {
    test("卸载后立即重挂载不会复用已取消的封面任务", async () => {
        const { load, jobs } = posterHarness();
        const firstMount = new AbortController();
        const first = load(firstMount.signal);
        firstMount.abort();
        const remounted = load();
        expect(jobs).toHaveLength(2);
        expect(jobs[0].signal.aborted).toBe(true);
        expect(jobs[1].signal.aborted).toBe(false);
        jobs[0].resolve("");
        jobs[1].resolve("blob:restored-poster");
        expect(await first).toBe("");
        expect(await remounted).toBe("blob:restored-poster");
    });

    for (const outcome of ["resolve", "reject"] as const) {
        test(`旧任务迟到的 ${outcome} 不会清除重挂载后的共享任务`, async () => {
            const { load, jobs } = posterHarness();
            const firstMount = new AbortController();
            void load(firstMount.signal);
            firstMount.abort();
            const second = load();
            if (outcome === "resolve") jobs[0].resolve("");
            else jobs[0].reject(new Error("cancelled capture"));
            await Promise.resolve();
            const third = load();
            expect(jobs).toHaveLength(2);
            jobs[1].resolve("blob:shared-poster");
            expect(await second).toBe("blob:shared-poster");
            expect(await third).toBe("blob:shared-poster");
        });
    }

    test("同一视频多个节点共享封面，只有最后一个退出才取消底层任务", async () => {
        const { load, jobs } = posterHarness();
        const firstMount = new AbortController();
        const secondMount = new AbortController();
        const first = load(firstMount.signal);
        const second = load(secondMount.signal);
        expect(jobs).toHaveLength(1);
        firstMount.abort();
        expect(jobs[0].signal.aborted).toBe(false);
        jobs[0].resolve("blob:shared-poster");
        expect(await first).toBe("");
        expect(await second).toBe("blob:shared-poster");
        secondMount.abort();
        expect(jobs[0].signal.aborted).toBe(false);

        const lastMount = new AbortController();
        const last = load(lastMount.signal);
        expect(jobs).toHaveLength(2);
        lastMount.abort();
        expect(jobs[1].signal.aborted).toBe(true);
        jobs[1].resolve("");
        expect(await last).toBe("");
    });

    test("已经取消的调用不会新建任务或影响其他订阅者", async () => {
        const { load, jobs } = posterHarness();
        const cancelled = new AbortController();
        cancelled.abort();
        expect(await load(cancelled.signal)).toBe("");
        expect(jobs).toHaveLength(0);
        const active = load();
        expect(await load(cancelled.signal)).toBe("");
        expect(jobs).toHaveLength(1);
        expect(jobs[0].signal.aborted).toBe(false);
        jobs[0].resolve("blob:active-poster");
        expect(await active).toBe("blob:active-poster");
    });

    test("用户、视频或封面尺寸不同的请求保持独立，失败后可重新读取", async () => {
        const { load, jobs } = posterHarness();
        const first = load();
        const other = load(undefined, "other-user:video:320");
        expect(jobs).toHaveLength(2);
        jobs[0].reject(new Error("media unavailable"));
        jobs[1].resolve("blob:other-poster");
        expect(await first).toBe("");
        expect(await other).toBe("blob:other-poster");
        const retry = load();
        expect(jobs).toHaveLength(3);
        jobs[2].resolve("blob:retry-poster");
        expect(await retry).toBe("blob:retry-poster");
    });
});
