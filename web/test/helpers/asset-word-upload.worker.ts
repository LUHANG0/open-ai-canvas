import { mock } from "bun:test";
import { Window } from "happy-dom";
import { strToU8, zipSync } from "fflate";

self.onmessage = async () => {
    const dom = new Window({ url: "http://localhost/" });
    try {
        for (const [key, value] of Object.entries({ window: dom, document: dom.document, DOMParser: dom.DOMParser, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node })) Object.defineProperty(globalThis, key, { configurable: true, value });
        const { setActiveUserScope } = await import("../../src/lib/user-scope");
        setActiveUserScope("word-owner");
        const calls: { file: File; options: any }[] = [];
        let fail = false;
        const resources = await import("../../src/services/api/resources");
        mock.module("../../src/services/api/resources", () => ({ ...resources, uploadResourceFile: async (file: File, _kind: string, options: any, progress?: (a: number, b: number) => void) => {
            calls.push({ file, options });
            if (fail) throw new Error("isolated storage unavailable");
            progress?.(file.size, file.size);
            return { id: "word-original", status: "ready", size: file.size };
        } }));
        const { uploadAssetDocument } = await import("../../src/pages/assets/asset-document-upload");
        const { parseAssetRecord } = await import("../../src/lib/asset-record");
        const { assetOriginalDocument } = await import("../../src/lib/asset-document");
        const { ensureRemoteResourceReferences } = await import("../../src/services/user-data-sync-media");
        const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
        const file = new File([zipSync({
            "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
            "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>第一章 雨夜</w:t><w:br/><w:t>对白正文</w:t></w:r></w:p></w:body></w:document>'),
        })], "剧本.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const asset = await uploadAssetDocument(file);
        assert(calls[0].file === file && calls[0].options.expectedUserId === "word-owner" && calls[0].options.fileName === file.name, "original file/account/name lost");
        const reopened = parseAssetRecord(JSON.parse(JSON.stringify({ ...asset, id: "word-asset", createdAt: "2026-11-10", updatedAt: "2026-11-10" })));
        assert(reopened.kind === "text" && reopened.data.content === "第一章 雨夜\n对白正文" && assetOriginalDocument(reopened)?.storageKey === "resource:word-original", "readback lost text or original reference");
        const synced = await ensureRemoteResourceReferences(reopened);
        assert(JSON.stringify(synced.data) === JSON.stringify(reopened.data), "sync replaced body with a resource URL");
        const { assetPickerItemsToInsertPayloads } = await import("../../src/components/canvas/asset-picker-modal");
        const [payload] = assetPickerItemsToInsertPayloads([reopened.id], [{ id: reopened.id, title: reopened.title, category: "material", asset: reopened }]);
        assert(payload.kind === "text" && payload.content === "第一章 雨夜\n对白正文" && payload.assetId === reopened.id, "canvas reference lost body or asset identity");
        let corrupt = false;
        try { await uploadAssetDocument(new File(["bad"], "坏文档.docx")); } catch { corrupt = true; }
        assert(corrupt && calls.length === 1, "corrupt document reached storage");
        fail = true;
        let failed = false;
        try { await uploadAssetDocument(file); } catch { failed = true; }
        assert(failed, "failed storage returned a usable asset");
        const pending = Promise.withResolvers<ArrayBuffer>();
        const delayed = new File(["pending"], "延迟.docx");
        delayed.arrayBuffer = () => pending.promise;
        const uploading = uploadAssetDocument(delayed);
        const rejection = uploading.catch(error => error);
        setActiveUserScope("other-owner");
        pending.resolve(await file.arrayBuffer());
        const error = await rejection;
        assert(error instanceof DOMException && error.name === "AbortError" && calls.length === 2, "account switch uploaded a document under the wrong user");
        self.postMessage({ uploaded: true, readback: true, preservedDuringSync: true, canvas: true, corrupt: true, failed: true, cancelled: true });
    } catch (error) { self.postMessage({ error: error instanceof Error ? error.stack : String(error) }); }
    finally { dom.happyDOM.abort(); }
};
