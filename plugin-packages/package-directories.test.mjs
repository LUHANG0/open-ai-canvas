import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { packageDirectories } from "./package-directories.mjs";

const source = dirname(fileURLToPath(import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "yingce-package-sources-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packages = join(root, "plugin-packages");
  await mkdir(packages);
  for (const name of ["build-packages.sh", "embed-documentation.mjs", "package-directories.mjs"]) {
    await copyFile(join(source, name), join(packages, name));
  }
  return {
    root,
    packages,
    async add(directory, id, version = "1.0.0") {
      const dir = join(packages, directory);
      await mkdir(join(dir, "docs"), { recursive: true });
      await writeFile(join(dir, "manifest.json"), `${JSON.stringify({ apiVersion: "yingce.plugin/v2", id, version })}\n`);
      await writeFile(join(dir, "README.md"), `# ${directory}\n`);
      await writeFile(join(dir, "docs/interface.md"), "# 接口\n\n响应保持原始语义。\n");
    },
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 30_000, ...options });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${command}: ${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test("a canonical directory wins over a stale auxiliary copy with the same plugin ID", async (t) => {
  const f = await fixture(t);
  await f.add("video", "video", "2.0.0");
  await f.add("src-video", "video", "1.0.0");
  await f.add("other", "other");
  assert.deepEqual(await packageDirectories(f.packages), ["other", "video"]);
});

test("a unique legacy directory remains usable, but ambiguous copies fail before packaging", async (t) => {
  const f = await fixture(t);
  await f.add("legacy-video", "video");
  assert.deepEqual(await packageDirectories(f.packages), ["legacy-video"]);
  await f.add("another-video", "video");
  await assert.rejects(packageDirectories(f.packages), /multiple source directories/);
});

test("the source selector CLI works through a symlinked parent directory", async (t) => {
  const f = await fixture(t);
  await f.add("video", "video");
  await symlink(f.packages, join(f.root, "linked-packages"), "dir");
  assert.equal(run(process.execPath, [join(f.root, "linked-packages", "package-directories.mjs")]).trim(), "video");
});

test("documentation generation leaves auxiliary source files untouched and is idempotent", async (t) => {
  const f = await fixture(t);
  await f.add("video", "video", "2.0.0");
  await f.add("src-video", "video", "1.0.0");
  const alias = join(f.packages, "src-video");
  const before = await readFile(join(alias, "manifest.json"), "utf8");
  run(process.execPath, [join(f.packages, "embed-documentation.mjs")]);
  assert.equal(await readFile(join(alias, "manifest.json"), "utf8"), before);
  assert.equal(await readFile(join(alias, "docs/interface.md"), "utf8"), "# 接口\n\n响应保持原始语义。\n");
  const manifestPath = join(f.packages, "video", "manifest.json");
  const first = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(first);
  assert.equal(manifest.version, "2.0.0");
  assert.match(manifest.documentation, /YINGCE_MANIFEST_CONTRACT_START/);
  run(process.execPath, [join(f.packages, "embed-documentation.mjs")]);
  assert.equal(await readFile(manifestPath, "utf8"), first);
});

test("the real full packaging script emits one archive per plugin ID from its canonical source", async (t) => {
  const f = await fixture(t);
  await f.add("video", "video", "2.0.0");
  await f.add("src-video", "video", "1.0.0");
  const payments = ["official-payment-wechat-native", "official-payment-alipay-page", "official-payment-xunhupay", "official-payment-zhifufm", "official-payment-epay"];
  const videos = ["dashscope-wan3-video", "newapi-video-generations-v1"];
  for (const id of videos) await cp(join(source, id), join(f.packages, id), { recursive: true });
  for (const id of payments) await f.add(id, id);
  await mkdir(join(f.root, "backend"));
  const bin = join(f.root, "bin");
  await mkdir(bin);
  const go = join(bin, "go");
  // Payment compilation is outside this test: keep its existing pipeline intact
  // while exercising real source selection, documentation and ZIP creation.
  await writeFile(go, `#!/bin/sh
set -eu
if [ "$1" = version ]; then
  cat "$3"
  exit 0
fi
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then
    shift
    printf 'GOOS=%s\\nGOARCH=%s\\nCGO_ENABLED=%s\\n' "$GOOS" "$GOARCH" "$CGO_ENABLED" > "$1"
    exit 0
  fi
  shift
done
exit 1
`);
  await chmod(go, 0o755);
  run("sh", [join(f.packages, "build-packages.sh")], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PAYMENT_PLUGIN_GOOS: "linux", PAYMENT_PLUGIN_GOARCH: "amd64", PAYMENT_PLUGIN_CGO_ENABLED: "0" },
  });
  const archives = (await readdir(f.packages)).filter((name) => name.endsWith(".yingce-plugin")).sort();
  assert.deepEqual(archives, [...payments, ...videos, "video"].map((id) => `${id}.yingce-plugin`).sort());
  const packed = JSON.parse(run("unzip", ["-p", join(f.packages, "video.yingce-plugin"), "manifest.json"]));
  assert.equal(packed.id, "video");
  assert.equal(packed.version, "2.0.0");
  for (const id of videos) {
    const shipped = join(source, `${id}.yingce-plugin`);
    const rebuilt = join(f.packages, `${id}.yingce-plugin`);
    const entries = (archive) => run("unzip", ["-Z1", archive]).trim().split("\n").sort();
    assert.deepEqual(entries(rebuilt), entries(shipped), `${id}: archive entries`);
    for (const entry of entries(shipped)) {
      assert.equal(run("unzip", ["-p", rebuilt, entry]), run("unzip", ["-p", shipped, entry]), `${id}: ${entry}`);
    }
  }
});
