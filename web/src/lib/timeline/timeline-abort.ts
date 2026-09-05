/** 本机缓存读取不接受 signal；取消立即结束等待，迟到结果仍由调用方检查 signal 丢弃。 */
export function waitForTimelineOperation<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return pending;
    return new Promise<T>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        const cleanup = () => signal.removeEventListener("abort", abort);
        pending.then(
            (value) => {
                cleanup();
                if (signal.aborted) abort();
                else resolve(value);
            },
            (error) => {
                cleanup();
                reject(signal.aborted ? signal.reason : error);
            },
        );
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
    });
}
