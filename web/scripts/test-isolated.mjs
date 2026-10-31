import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ignored = new Set(["node_modules", ".git", ".local", "dist", "coverage", "test-results", "playwright-report"]);
const testName = /[._](?:test|spec)\.[cm]?[jt]sx?$/;

export function discoverTests(root) {
    const files = [];
    function visit(directory) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory() && !ignored.has(entry.name)) visit(path);
            else if (entry.isFile() && testName.test(entry.name)) files.push(`./${relative(root, path).replaceAll("\\", "/")}`);
        }
    }
    visit(root);
    return files.sort();
}

// Bun 1.3.9 shares mock.module registrations and DOM globals across files. A fresh
// process also releases each file's DOM/module graph before the next file starts.
export function runIsolatedTests(files, { run = (file) => spawnSync(process.execPath, ["test", file], { stdio: "inherit", timeout: 180_000 }), log = console.log } = {}) {
    if (!files.length) throw new Error("No test files discovered; refusing an empty successful run.");
    const failures = [];
    for (const file of files) {
        const result = run(file);
        if (result.error || result.signal || result.status !== 0) {
            failures.push(file);
            log(`FAIL ${file}: ${result.error?.message || result.signal || `exit ${result.status}`}`);
        } else {
            log(`PASS ${file}`);
        }
    }
    log(`Isolated test files: ${files.length - failures.length} passed, ${failures.length} failed, ${files.length} total.`);
    return failures;
}

if (import.meta.main) {
    try {
        process.exitCode = runIsolatedTests(discoverTests(process.cwd())).length ? 1 : 0;
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}
