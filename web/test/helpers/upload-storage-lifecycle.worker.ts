import { mock } from "bun:test";
import { Window } from "happy-dom";

self.onmessage = async () => {
    const dom = new Window({ url: "http://localhost/" });
    try {
        Object.defineProperty(globalThis, "window", { configurable: true, value: dom });
        const stored = new Map<string, unknown>();
        mock.module("localforage", () => ({ default: { config: () => {}, createInstance: () => ({ setItem: async (key: string, value: unknown) => { stored.set(key, value); }, getItem: async (key: string) => stored.get(key), removeItem: async (key: string) => { stored.delete(key); } }) } }));
        const { setActiveUserScope } = await import("../../src/lib/user-scope");
        setActiveUserScope("account-a");
        let decoded = 0;
        const utils = await import("../../src/lib/image-utils");
        mock.module("../../src/lib/image-utils", () => ({ ...utils, readImageMeta: async () => { decoded++; return { width: 80, height: 60, mimeType: "image/png" }; } }));
        const api = await import("../../src/services/api/resources");
        const calls: { meta: any; resolve: (value: any) => void; reject: (error: Error) => void }[] = [];
        mock.module("../../src/services/api/resources", () => ({ ...api, uploadResourceFile: (_file: Blob, _kind: string, meta: any) => { const pending = Promise.withResolvers<any>(); calls.push({ meta, ...pending }); return pending.promise; } }));
        mock.module("../../src/services/resource-blob-cache", () => ({ getCachedResourceBlob: async () => null, primeResourceBlobCache: async () => "" }));
        const live = new Set<string>(); let seq = 0;
        URL.createObjectURL = () => { const url = `blob:test-${++seq}`; live.add(url); return url; };
        URL.revokeObjectURL = url => { live.delete(url); };
        const { uploadImage, deleteStoredImages } = await import("../../src/services/image-storage");
        const { uploadMediaFile } = await import("../../src/services/file-storage");
        const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
        const blob = new Blob(["image"], { type: "image/png" });
        const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
        const successful = uploadImage(blob, undefined, { knownSize: { width: 1200, height: 800 } }); await tick();
        assert(calls[0].meta.width === 1200 && calls[0].meta.height === 800 && decoded === 0, "already decoded dimensions were decoded again");
        assert(calls[0].meta.expectedUserId === "account-a", "image request lost captured scope");
        calls[0].resolve({ id: "ready", width: 1200, height: 800 }); await successful;
        assert(live.size === 0, "successful upload leaked temporary decode URL");
        for (const media of [false, true]) {
            const controller = new AbortController();
            const pending = media ? uploadMediaFile(new Blob(["audio"]), "audio", undefined, { signal: controller.signal }) : uploadImage(blob, undefined, { signal: controller.signal, knownSize: { width: 10, height: 10 } });
            await tick();
            assert(calls.at(-1)!.meta.signal === controller.signal, "upload lost its abort signal");
            controller.abort(); calls.at(-1)!.reject(new Error("late network failure"));
            let error: any; try { await pending; } catch (caught) { error = caught; }
            assert(error?.name === "AbortError" && stored.size === 0, "cancelled upload entered local fallback");
        }
        const failed = uploadImage(blob, undefined, { knownSize: { width: 10, height: 10 } }); await tick();
        calls.at(-1)!.reject(new api.ResourceUploadError("denied", { permanent: true, status: 403 }));
        let denied = false; try { await failed; } catch { denied = true; }
        assert(denied && stored.size === 0 && live.size === 0, "permanent failure retained bytes or object URL");
        const fallback = uploadImage(blob, undefined, { knownSize: { width: 10, height: 10 } }); await tick();
        const identity = calls.at(-1)!.meta.idempotencyKey;
        calls.at(-1)!.reject(new Error("temporary offline"));
        const result = await fallback;
        assert(result.pendingRemoteUpload && result.storageKey === identity && stored.has(identity), "fallback changed logical upload identity");
        await deleteStoredImages([identity]);
        const scoped = uploadImage(blob, undefined, { knownSize: { width: 10, height: 10 } }); await tick();
        setActiveUserScope("account-b"); calls.at(-1)!.resolve({ id: "late" });
        let isolated = false; try { await scoped; } catch (error) { isolated = error instanceof DOMException && error.name === "AbortError"; }
        assert(isolated && live.size === 0 && stored.size === 0, "late success adopted another account");
        self.postMessage({ dimensions: true, cancellation: true, scoped: true, fallbackIdentity: true, permanentFailure: true, released: true });
    } catch (error) { self.postMessage({ error: error instanceof Error ? error.stack : String(error) }); }
    finally { mock.restore(); dom.happyDOM.abort(); }
};
