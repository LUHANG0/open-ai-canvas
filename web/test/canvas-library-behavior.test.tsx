import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("canvas library keeps selection scoped and distinguishes search waiting from an empty library", () => {
    const result = Bun.spawnSync([process.execPath, "test/fixtures/canvas-library-behavior.harness.tsx"], { cwd: resolve(import.meta.dir, ".."), timeout: 10000 });
    const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    expect(result.exitCode, output).toBe(0);
}, 15000);
