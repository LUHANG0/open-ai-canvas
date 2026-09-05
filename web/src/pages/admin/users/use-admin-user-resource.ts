import { useEffect, useState } from "react";

// 每次切换用户或页码都清除上一份结果，迟到请求不能覆盖当前用户的记录。
export function useAdminUserResource<T>(userId: string | null, page: number, reload: number, read: (userId: string, params: { page: number; limit: number }) => Promise<T>) {
    const key = `${userId}:${page}:${reload}`;
    const [state, setState] = useState<{ key: string; data: T | null; loading: boolean; error: string }>({ key, data: null, loading: Boolean(userId), error: "" });
    useEffect(() => {
        let active = true;
        setState({ key, data: null, loading: Boolean(userId), error: "" });
        if (!userId) return;
        void read(userId, { page, limit: 20 })
            .then((data) => {
                if (active) setState({ key, data, loading: false, error: "" });
            })
            .catch((cause) => {
                if (active) setState({ key, data: null, loading: false, error: cause instanceof Error ? cause.message : "读取失败，请稍后重试" });
            });
        return () => {
            active = false;
        };
    }, [userId, page, key, read]);
    return state.key === key ? state : { data: null, loading: Boolean(userId), error: "" };
}
