import { expect, test } from "bun:test";
import { apiClient } from "@/services/api/request";
import { uploadResourceFile } from "@/services/api/resources";

test("文件正文直接发到 OSS；平台只收到小样本和完成确认，确认失败可幂等重试", async () => {
    const adapter = apiClient.defaults.adapter;
    const previousXHR = globalThis.XMLHttpRequest;
    const calls: string[] = [];
    const progress: number[][] = [];
    let confirmations = 0;
    let objectPosts = 0;
    class UploadXHR {
        upload = { onprogress: undefined as ((event: ProgressEvent) => void) | undefined };
        withCredentials = true;
        timeout = 0;
        status = 204;
        onload?: () => void;
        onerror?: () => void;
        onabort?: () => void;
        open(method: string, url: string) { expect(method).toBe("POST"); expect(new URL(url).host).toBe("media.example.com"); }
        send(form: FormData) {
            objectPosts++;
            expect(this.withCredentials).toBe(false);
            expect([...form.keys()].at(-1)).toBe("file");
            expect(form.get("x-oss-forbid-overwrite")).toBe("true");
            expect(form.get("file")).toBeInstanceOf(Blob);
            expect(form.has("Authorization")).toBe(false);
            queueMicrotask(() => { this.upload.onprogress?.({ lengthComputable: true, loaded: 500, total: 1000 } as ProgressEvent); this.onload?.(); });
        }
        abort() { this.onabort?.(); }
    }
    globalThis.XMLHttpRequest = UploadXHR as unknown as typeof XMLHttpRequest;
    try {
        apiClient.defaults.adapter = async (config) => {
            calls.push(config.url!);
            let data: unknown;
            if (config.url === "/resources/direct-uploads") {
                const request = JSON.parse(config.data);
                expect(atob(request.sample).length).toBe(3072);
                expect(request.size).toBe(51 * 1024 * 1024);
                expect(config.data.length).toBeLessThan(5000);
                data = { mode: "direct", uploadId: "direct-id", post: { url: "https://media.example.com/", fields: { key: "owned/key", "x-oss-forbid-overwrite": "true" }, expiresAt: new Date(Date.now() + 60_000).toISOString() } };
            } else {
                expect(config.url).toBe("/resources/direct-uploads/direct-id/complete");
                expect(config.data).toBeUndefined();
                confirmations++;
                if (confirmations === 1) return { config, status: 502, headers: {}, statusText: "Error", data: { code: 502, msg: "暂时无法确认" } };
                data = { resource: { id: "direct-id", status: "ready" } };
            }
            return { config, status: 200, headers: {}, statusText: "OK", data: { code: 0, data } };
        };
        const resource = await uploadResourceFile(new Blob([new Uint8Array(51 * 1024 * 1024)]), "video", undefined, (loaded, total) => progress.push([loaded, total]));
        expect(resource.id).toBe("direct-id");
        expect(objectPosts).toBe(1);
        expect(confirmations).toBe(2);
        expect(progress).toEqual([[51 * 1024 * 1024 / 2, 51 * 1024 * 1024]]);
        expect(calls.some(path => path === "/resources" || path === "/resources/uploads")).toBe(false);
    } finally { apiClient.defaults.adapter = adapter; globalThis.XMLHttpRequest = previousXHR; }
});

test("OSS 上传失败不回退海外中转；取消不发完成确认", async () => {
    const adapter = apiClient.defaults.adapter;
    const previousXHR = globalThis.XMLHttpRequest;
    for (const canceled of [false, true]) {
        const calls: string[] = [];
        class FailedXHR {
            upload = {};
            status = 503;
            onload?: () => void;
            onabort?: () => void;
            open() {}
            send() { queueMicrotask(() => canceled ? this.onabort?.() : this.onload?.()); }
            abort() { this.onabort?.(); }
        }
        globalThis.XMLHttpRequest = FailedXHR as unknown as typeof XMLHttpRequest;
        try {
            apiClient.defaults.adapter = async (config) => {
                calls.push(config.url!);
                return { config, status: 200, statusText: "OK", headers: {}, data: config.url?.endsWith("/complete") ? { code: 502, msg: "尚无对象" } : { code: 0, data: { mode: "direct", uploadId: "failed-id", post: { url: "https://media.example.com", fields: {}, expiresAt: new Date(Date.now() + 60_000).toISOString() } } } };
            };
            await expect(uploadResourceFile(new Blob(["file"]), "file")).rejects.toThrow(canceled ? "取消" : "直传失败");
            expect(calls).toEqual(canceled ? ["/resources/direct-uploads"] : ["/resources/direct-uploads", "/resources/direct-uploads/failed-id/complete"]);
        } finally { apiClient.defaults.adapter = adapter; globalThis.XMLHttpRequest = previousXHR; }
    }
});
