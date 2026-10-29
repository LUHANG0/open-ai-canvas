import { expect, test } from "bun:test";
import type { AxiosProgressEvent } from "axios";
import { apiClient } from "../src/services/api/request";
import { uploadResourceFile, uploadTimeoutMs } from "../src/services/api/resources";

test("普通 multipart 将传输进度换算为文件字节，总量未知不伪造百分比", async () => {
    const adapter = apiClient.defaults.adapter;
    const progress: number[][] = [];
    try {
        apiClient.defaults.adapter = async (config) => {
            if (config.url === "/resources/direct-uploads") return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data: { mode: "server" } } };
            config.onUploadProgress?.({ loaded: 100, total: undefined } as AxiosProgressEvent);
            config.onUploadProgress?.({ loaded: 250, total: 1000 } as AxiosProgressEvent);
            config.onUploadProgress?.({ loaded: 1000, total: 1000 } as AxiosProgressEvent);
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data: { resource: { id: "upload-test" } } } };
        };
        await uploadResourceFile(new Blob([new Uint8Array(400)]), "file", undefined, (loaded, total) => progress.push([loaded, total]));
        expect(progress).toEqual([[100, 400], [400, 400]]);
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test("分片上传累加片内真实进度，传输 100% 后仍须等待合并响应", async () => {
    const adapter = apiClient.defaults.adapter;
    const size = 51 * 1024 * 1024;
    const chunkSize = 32 * 1024 * 1024;
    const progress: number[][] = [];
    let merged = false;
    try {
        apiClient.defaults.adapter = async (config) => {
            let data: unknown;
            if (config.url === "/resources/direct-uploads") data = { mode: "server" };
            else if (config.url === "/resources/uploads") data = { uploadId: "session", chunkSize, chunkCount: 2 };
            else if (config.url?.endsWith("/complete")) {
                expect(progress.at(-1)).toEqual([size, size]);
                merged = true;
                data = { resource: { id: "chunk-test" } };
            } else {
                const index = Number(config.url?.split("/").at(-1));
                const bytes = index === 0 ? chunkSize : size - chunkSize;
                config.onUploadProgress?.({ loaded: bytes / 2, total: bytes } as AxiosProgressEvent);
                data = { index };
            }
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data } };
        };
        await uploadResourceFile(new Blob([new Uint8Array(size)]), "video", undefined, (loaded, total) => progress.push([loaded, total]));
        expect(progress).toEqual([[chunkSize / 2, size], [chunkSize, size], [chunkSize + (size - chunkSize) / 2, size], [size, size]]);
        expect(merged).toBe(true);
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test("传输结束不吞掉服务端保存错误", async () => {
    const adapter = apiClient.defaults.adapter;
    try {
        apiClient.defaults.adapter = async (config) => {
            config.onUploadProgress?.({ loaded: 100, total: 100 } as AxiosProgressEvent);
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 9, msg: "保存失败" } };
        };
        await expect(uploadResourceFile(new Blob(["text"]), "file", undefined, () => {})).rejects.toThrow("保存失败");
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test("large multipart and chunk bodies use size budgets while small control requests keep a short timeout", async () => {
    expect(uploadTimeoutMs()).toBe(60_000);
    expect(uploadTimeoutMs(40 * 1024 * 1024)).toBe(220_000);
    expect(uploadTimeoutMs(8 * 1024 * 1024)).toBe(92_000);
    expect(uploadTimeoutMs(1024 ** 3)).toBe(900_000);
    expect(uploadTimeoutMs(NaN)).toBe(60_000);
    const adapter = apiClient.defaults.adapter;
    const controller = new AbortController();
    try {
        for (const size of [40, 51].map(mb => mb * 1024 * 1024)) {
            let chunks = 0;
            apiClient.defaults.adapter = async config => {
                expect(config.signal).toBe(controller.signal);
                expect(config.headers.get("X-Idempotency-Key") || "").toBe(config.url === "/resources/direct-uploads" || config.url === "/resources/uploads" || config.url === "/resources" ? "same-upload" : "");
                let data: unknown;
                if (config.url === "/resources/direct-uploads") { expect(config.timeout).toBe(60_000); data = { mode: "server" }; }
                else if (config.url === "/resources/uploads") { expect(config.timeout).toBe(60_000); data = { uploadId: "sized", chunkSize: 8 * 1024 * 1024, chunkCount: 7 }; }
                else if (config.url?.includes("/chunks/")) { chunks++; expect(config.timeout).toBe(uploadTimeoutMs((config.data as Blob).size)); data = {}; }
                else { expect(config.timeout).toBe(uploadTimeoutMs(size)); data = { resource: { id: "sized-resource" } }; }
                return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data } };
            };
            await uploadResourceFile(new Blob([new Uint8Array(size)]), "file", { idempotencyKey: "same-upload", signal: controller.signal });
            expect(chunks).toBe(size > 50 * 1024 * 1024 ? 7 : 0);
        }
    } finally { apiClient.defaults.adapter = adapter; }
});
