import { expect, test } from "bun:test";

test("素材库 Word 从原件上传、正文读回到画布引用，并阻止失败与切号后的入库", async () => {
    const worker = new Worker(new URL("./helpers/asset-word-upload.worker.ts", import.meta.url).href, { type: "module" });
    try {
        const result = await new Promise((resolve, reject) => {
            worker.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data);
            worker.onerror = (event) => reject(event.error ?? new Error(event.message));
            worker.postMessage("run");
        });
        expect(result).toEqual({ uploaded: true, readback: true, preservedDuringSync: true, canvas: true, corrupt: true, failed: true, cancelled: true });
    } finally { worker.terminate(); }
}, 15000);
