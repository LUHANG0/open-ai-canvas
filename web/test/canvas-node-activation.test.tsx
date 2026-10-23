import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("real node controls, selection controller, render model and node shells satisfy explicit activation", () => {
    const result = Bun.spawnSync([process.execPath, "test", "./test/fixtures/canvas-node-activation.harness.tsx"], { cwd: resolve(import.meta.dir, ".."), timeout: 30000 });
    const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    expect(result.exitCode, output).toBe(0);
});
