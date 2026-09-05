type SharedPosterTask = {
    controller: AbortController;
    consumers: Set<symbol>;
    promise: Promise<string>;
};

export function createCanvasVideoPosterRequests() {
    const inFlight = new Map<string, SharedPosterTask>();

    return (key: string, run: (signal: AbortSignal) => Promise<string>, signal?: AbortSignal) => {
        if (signal?.aborted) return Promise.resolve("");
        let task = inFlight.get(key);
        // StrictMode 或快速重新进入时，旧任务可能已取消但尚未完成异步清理。
        if (!task || task.controller.signal.aborted) {
            const controller = new AbortController();
            const promise = run(controller.signal);
            task = { controller, consumers: new Set(), promise };
            inFlight.set(key, task);
            const release = () => {
                if (inFlight.get(key) === task) inFlight.delete(key);
            };
            void promise.then(release, release);
        }
        return subscribePosterTask(task, signal);
    };
}

function subscribePosterTask(task: SharedPosterTask, signal?: AbortSignal) {
    const consumer = Symbol("poster-consumer");
    task.consumers.add(consumer);
    return new Promise<string>((resolve) => {
        let settled = false;
        const finish = (value: string) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            task.consumers.delete(consumer);
            resolve(value);
        };
        const onAbort = () => {
            finish("");
            if (!task.consumers.size) task.controller.abort();
        };
        if (signal?.aborted) {
            onAbort();
            return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
        void task.promise.then(finish).catch(() => finish(""));
    });
}
