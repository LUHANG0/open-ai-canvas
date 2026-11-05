import { useRef, useSyncExternalStore } from "react";

import { formatTaskElapsed, idleTaskTickerSubscribe, subscribeTaskTicker, taskTickerSnapshot } from "@/lib/canvas/task-ticker";

/** 生成任务已用时：共用一个每秒时钟；终态时不再订阅，耗时冻结在完成时刻。 */
export function useTaskElapsed(createdAt?: string, completedAt?: string, terminal = false) {
    const stopped = useRef<{ createdAt?: string; at: string } | null>(null);
    if (!terminal || stopped.current?.createdAt !== createdAt) stopped.current = null;
    if (terminal && !completedAt && !stopped.current) stopped.current = { createdAt, at: new Date(taskTickerSnapshot()).toISOString() };
    const endpoint = completedAt || (terminal ? stopped.current?.at : undefined);
    const live = Boolean(createdAt) && !terminal && !endpoint;
    const now = useSyncExternalStore(live ? subscribeTaskTicker : idleTaskTickerSubscribe, taskTickerSnapshot, taskTickerSnapshot);
    return formatTaskElapsed(createdAt, now, endpoint);
}
