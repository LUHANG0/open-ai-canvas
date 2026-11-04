import { expect, test } from "bun:test";
import { apiClient } from "@/services/api/request";
import { importResourceFromUrl, uploadResourceFile } from "@/services/api/resources";
import { getActiveUserScope, setActiveUserScope } from "@/lib/user-scope";

for (const mode of ["multipart", "direct-ready", "chunked", "url"] as const) {
    test(`account-scoped ${mode} uploads preserve the retry identity and account guard together`, async () => {
        const adapter = apiClient.defaults.adapter;
        const previousWindow = globalThis.window;
        const disk = new Map<string, string>();
        if (!previousWindow) Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => disk.set(key, value) } } });
        const scope = getActiveUserScope();
        const controller = new AbortController();
        const calls: string[] = [];
        setActiveUserScope("import-owner");
        apiClient.defaults.adapter = async (config) => {
            const path = String(config.url);
            calls.push(path);
            expect(config.headers.get("X-Canvas-Expected-User")).toBe("import-owner");
            expect(config.signal?.aborted).toBe(false);
            if (["/resources/direct-uploads", "/resources", "/resources/uploads", "/resources/import"].includes(path)) {
                expect(config.headers.get("X-Idempotency-Key")).toBe("inline:stable-content");
            }
            const resource = { id: "stable-resource", status: "ready" };
            const data = path === "/resources/direct-uploads"
                ? mode === "direct-ready" ? { mode: "ready", resource } : { mode: "server" }
                : path === "/resources/uploads" ? { uploadId: "session", chunkSize: 64 * 1024 * 1024, chunkCount: 1 }
                : path.includes("/chunks/") ? { index: 0 } : { resource };
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data } };
        };
        try {
            const meta = { idempotencyKey: "inline:stable-content", signal: controller.signal };
            const resource = mode === "url"
                ? await importResourceFromUrl("https://provider.example/import.png", "image", meta)
                : await uploadResourceFile(new Blob([mode === "chunked" ? new Uint8Array(51 * 1024 * 1024) : "media"], { type: "image/png" }), "image", meta);
            expect(resource.id).toBe("stable-resource");
            expect(calls).toEqual(mode === "url" ? ["/resources/import"] : mode === "direct-ready" ? ["/resources/direct-uploads"] : mode === "chunked" ? ["/resources/direct-uploads", "/resources/uploads", "/resources/uploads/session/chunks/0", "/resources/uploads/session/complete"] : ["/resources/direct-uploads", "/resources"]);
        } finally {
            apiClient.defaults.adapter = adapter;
            setActiveUserScope(scope);
            if (!previousWindow) delete (globalThis as { window?: unknown }).window;
        }
    });
}
