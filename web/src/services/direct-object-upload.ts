import { ApiError } from "@/services/api/request";

export type DirectUploadPost = { url: string; fields: Record<string, string>; expiresAt: string };

// Deliberately bypass the authenticated API client: OSS must never receive
// platform cookies, Authorization, account headers, or the backend Base URL.
export function postObjectFile(post: DirectUploadPost, file: Blob, name: string, signal: AbortSignal | undefined, assertLive: () => void, onProgress?: (loaded: number, total: number) => void) {
    assertLive();
    const target = new URL(post.url);
    if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash) throw new Error("上传地址无效");
    if (Date.parse(post.expiresAt) <= Date.now()) throw new ApiError("上传授权已过期，请重试", { status: 408 });
    const form = new FormData();
    for (const [key, value] of Object.entries(post.fields)) form.append(key, value);
    form.append("file", file, name);
    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = () => xhr.abort();
        const cleanup = () => signal?.removeEventListener("abort", abort);
        xhr.open("POST", target.toString());
        xhr.withCredentials = false;
        xhr.timeout = 30 * 60 * 1000;
        xhr.upload.onprogress = (event) => {
            try { assertLive(); } catch { xhr.abort(); return; }
            if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(file.size, file.size * event.loaded / event.total), file.size);
        };
        xhr.onload = () => {
            cleanup();
            if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
            // Do not expose signed form data or raw provider XML to users/logs.
            reject(new ApiError("文件直传失败，请重试", { status: xhr.status, retryable: xhr.status === 403 || xhr.status === 409 || xhr.status >= 500 }));
        };
        xhr.onerror = () => { cleanup(); reject(new ApiError("直传连接中断，请检查网络后重试", { retryable: true })); };
        xhr.ontimeout = () => { cleanup(); reject(new ApiError("直传超时，请重试", { status: 408 })); };
        xhr.onabort = () => { cleanup(); reject(new DOMException("上传已取消或账号已切换", "AbortError")); };
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) { cleanup(); reject(new DOMException("上传已取消", "AbortError")); return; }
        xhr.send(form);
    });
}
