import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverTests, runIsolatedTests } from "../scripts/test-isolated.mjs";

test("isolated runner discovers colocated and suite tests without dependencies or build copies", () => {
    const root = mkdtempSync(join(tmpdir(), "yingce-test-discovery-"));
    try {
        for (const file of ["src/nested/value.test.ts", "test/ui.test.tsx", "test/icon.test.mjs", "test/helper.ts", "node_modules/pkg/value.test.ts", "dist/value.test.js", ".local/copy/value.test.ts"]) {
            const path = join(root, file);
            mkdirSync(join(path, ".."), { recursive: true });
            writeFileSync(path, "");
        }
        expect(discoverTests(root)).toEqual(["./src/nested/value.test.ts", "./test/icon.test.mjs", "./test/ui.test.tsx"]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("isolated runner aggregates every failure and never converts a crash or timeout into success", () => {
    const files = ["pass", "assertion", "signal", "timeout", "last-pass"];
    const seen: string[] = [];
    const results = [{ status: 0 }, { status: 1 }, { status: null, signal: "SIGTRAP" }, { status: null, error: new Error("ETIMEDOUT") }, { status: 0 }];
    const failures = runIsolatedTests(files, {
        run: (file: string) => {
            seen.push(file);
            return results[seen.length - 1];
        },
        log: () => {},
    });
    expect(seen).toEqual(files);
    expect(failures).toEqual(["assertion", "signal", "timeout"]);
    expect(() => runIsolatedTests([], { log: () => {} })).toThrow("No test files discovered");
});
