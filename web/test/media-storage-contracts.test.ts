import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fetchBlob } from "../src/services/fetch-blob";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("media fetch contract", () => {
    test("rejects non-success HTTP responses before reading a Blob", async () => {
        let blobRead = false;
        globalThis.fetch = (async () => ({
            ok: false,
            status: 413,
            blob: async () => {
                blobRead = true;
                return new Blob();
            },
        })) as typeof fetch;

        await expect(fetchBlob("https://media.example/oversized", undefined, "图片读取")).rejects.toThrow("图片读取失败（HTTP 413）");
        expect(blobRead).toBe(false);
    });

    test("returns the response Blob for a successful request", async () => {
        const expected = new Blob(["ok"], { type: "text/plain" });
        globalThis.fetch = (async () => ({ ok: true, status: 200, blob: async () => expected })) as typeof fetch;

        expect(await fetchBlob("data:text/plain,ok")).toBe(expected);
    });
});

describe("media upload persistence contract", () => {
    test("new uploads never turn a failed server write into a local success", () => {
        for (const file of ["../src/services/image-storage.ts", "../src/services/file-storage.ts"]) {
            const source = readFileSync(resolve(import.meta.dir, file), "utf8");
            const uploadBody = source.slice(source.indexOf("export async function upload"), source.indexOf("export async function resolve"));
            expect(source).toContain("未保存到服务器");
            expect(uploadBody).toContain("throw uploadPersistenceError");
            expect(uploadBody).not.toContain("store.setItem");
            expect(uploadBody).not.toContain("nanoid");
        }
    });
});
