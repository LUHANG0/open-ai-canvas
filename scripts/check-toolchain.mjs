import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");
const expected = read(".bun-version").trim();
const errors = [];

if (!/^\d+\.\d+\.\d+$/.test(expected)) errors.push(".bun-version 必须固定到完整版本号");
if (process.versions.bun !== expected) {
    errors.push(`请使用 Bun ${expected} 运行检查，当前为 ${process.versions.bun || "Node.js"}`);
}

for (const directory of ["web", "canvas-agent"]) {
    const manifest = JSON.parse(read(`${directory}/package.json`));
    if (manifest.packageManager !== `bun@${expected}`) {
        errors.push(`${directory}/package.json 的 packageManager 必须为 bun@${expected}`);
    }
    if (!existsSync(join(root, directory, "bun.lock"))) errors.push(`${directory}/bun.lock 缺失`);
    for (const lock of ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb"]) {
        if (existsSync(join(root, directory, lock))) errors.push(`${directory}/${lock} 与唯一 Bun 锁文件冲突`);
    }
}

// Docker 的镜像标签须在构建前解析，保持字面版本并在同一个入口校验。
for (const path of ["Dockerfile", "docker-compose.dev.yml"]) {
    const versions = [...read(path).matchAll(/oven\/bun:([^\s]+)/g)].map((match) => match[1]);
    if (versions.length !== 1 || versions[0] !== expected) errors.push(`${path} 必须使用 oven/bun:${expected}`);
}
for (const path of [".github/workflows/quality.yml", ".github/workflows/publish-images.yml"]) {
    const workflow = read(path);
    const setups = [...workflow.matchAll(/uses: oven-sh\/setup-bun@[^\n]+/g)].length;
    const versionFiles = [...workflow.matchAll(/bun-version-file: \.bun-version\s*$/gm)].length;
    if (!setups || setups !== versionFiles || /^\s*bun-version:/m.test(workflow)) {
        errors.push(`${path} 的 setup-bun 必须读取根目录 .bun-version`);
    }
}

if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
} else {
    console.log(`工具链一致：Bun ${expected}，Web/Agent 单一锁文件，CI 与 Docker 版本匹配。`);
}
