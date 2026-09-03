import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../..");
const entryDocuments = ["README.md", "docs/index.md", "DEPLOYMENT_GUIDE.md"];

function localTargets(markdown: string) {
    const targets = [...Array.from(markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g), (match) => match[1]), ...Array.from(markdown.matchAll(/<(?:a|img)\s+[^>]*(?:href|src)="([^"]+)"/g), (match) => match[1])];
    return targets.map((target) => target.trim().split("#", 1)[0]).filter((target) => target && !/^(?:https?:|mailto:|#)/.test(target));
}

describe("入口文档链接", () => {
    for (const document of entryDocuments) {
        test(`${document} 不引用缺失的仓库文件`, () => {
            const documentPath = resolve(repositoryRoot, document);
            const missing = localTargets(readFileSync(documentPath, "utf8")).filter((target) => !existsSync(resolve(dirname(documentPath), target)));
            expect(missing).toEqual([]);
        });
    }
});
