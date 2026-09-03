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

    test("安装、更新和部署默认使用当前维护仓库", () => {
        const maintainedRepository = "LUHANG0/open-ai-canvas";
        const deploymentSources = [
            "scripts/install-server.sh",
            "scripts/install-server-image.sh",
            "scripts/install-host-updater.sh",
            "docker-compose.deploy.yml",
            "backend/cmd/host-updater/main.go",
            "backend/internal/hostupdate/manager.go",
            "web/src/lib/canvas/local-agent-setup.ts",
        ];

        for (const file of deploymentSources) {
            const source = readFileSync(resolve(repositoryRoot, file), "utf8");
            expect(source).not.toContain("ddcat-ai/open-ai-canvas");
            expect(source.toLowerCase()).toContain(maintainedRepository.toLowerCase());
        }

        const readme = readFileSync(resolve(repositoryRoot, "README.md"), "utf8");
        expect(readme).toContain("`main` 是本项目唯一持续维护、测试和部署的代码基线");
        expect(readme).toContain("https://github.com/LUHANG0/open-ai-canvas.git");
    });
});
