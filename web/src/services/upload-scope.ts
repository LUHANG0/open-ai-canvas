import { getActiveUserScope } from "@/lib/user-scope";

export type UploadScopeOptions = { signal?: AbortSignal; expectedUserId?: string };

/** Capture before decoding/reading bytes so delayed work cannot adopt a new account. */
export function captureUploadScope(options: UploadScopeOptions = {}) {
    const scope = getActiveUserScope();
    const assertCurrent = () => {
        if (options.signal?.aborted || getActiveUserScope() !== scope || (options.expectedUserId && options.expectedUserId !== scope)) throw new DOMException("上传已取消或账号已切换", "AbortError");
    };
    assertCurrent();
    return { assertCurrent, options: { ...options, ...(scope !== "guest" ? { expectedUserId: scope } : {}) } };
}
