import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";

const readProjectFile = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

// Nginx replaces the fallback head with the published server metadata. Both paths
// must declare a crawlable icon before client JavaScript resolves appearance.
describe("app icon bootstrap", () => {
    test("the backend-unavailable fallback has exactly one valid square PNG icon", () => {
        const indexHtml = readProjectFile("index.html");
        const dom = new Window({ url: "https://example.test/" });
        try {
            dom.document.write(indexHtml);
            const icons = dom.document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
            expect(icons.length).toBe(1);
            expect(icons[0].href).toBe("https://example.test/favicon.png");
            expect(icons[0].type).toBe("image/png");
            const image = readFileSync(new URL("../public/favicon.png", import.meta.url));
            expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
            const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
            expect(width).toBe(height);
            expect(width).toBeGreaterThan(48);
            expect(icons[0].getAttribute("sizes")).toBe(`${width}x${height}`);
        } finally { dom.happyDOM.abort(); }
    });
});
