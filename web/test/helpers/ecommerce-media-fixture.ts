import { spyOn } from "bun:test";
import * as resources from "../../src/services/api/resources";
import * as imageLoader from "../../src/services/canvas-image-loader";

// Keep ownership-aware delivery and image decoding outside the page lifecycle
// fixture; resource transport and image fallback have their own focused tests.
export function mockEcommerceImageDelivery() {
    const unavailable = new Set<string>();
    spyOn(resources, "getResourceAccess").mockImplementation(async (storageKey, _purpose, variant = "original") => {
        const resourceId = resources.resourceIdFromStorageKey(storageKey);
        if (!resourceId) throw new Error("Expected a remote resource in the ecommerce fixture");
        return {
            resourceId,
            requestedVariant: variant,
            actualVariant: variant,
            url: `/api/resources/${encodeURIComponent(resourceId)}/file?variant=${variant}`,
            delivery: "platform-local",
            issuedAt: new Date().toISOString(),
            refreshAt: new Date(Date.now() + 300_000).toISOString(),
            revision: "fixture",
        };
    });
    spyOn(imageLoader, "prepareCanvasImage").mockImplementation(async (source) => {
        if (source.resourceId && unavailable.has(source.resourceId)) throw new Error("Fixture image remains unavailable after renewal");
        return document.createElement("img");
    });
    return (resourceId: string) => unavailable.add(resourceId);
}
