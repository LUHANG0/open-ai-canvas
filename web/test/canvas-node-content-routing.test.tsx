import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("real world and node content preserve media isolation, routing transitions and current actions", () => {
    const result = Bun.spawnSync([process.execPath, "test", "./test/fixtures/canvas-node-content-routing.harness.tsx"], { cwd: resolve(import.meta.dir, ".."), timeout: 30000 });
    const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
    expect(result.exitCode, output).toBe(0);
});
