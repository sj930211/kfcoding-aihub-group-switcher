import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "aihub-versioning-"));
try {
  fs.cpSync(path.join(root, "src"), path.join(temporary, "src"), { recursive: true });
  fs.mkdirSync(path.join(temporary, "scripts"));
  fs.copyFileSync(path.join(root, "scripts/build.mjs"), path.join(temporary, "scripts/build.mjs"));
  const build = () => spawnSync(process.execPath, [path.join(temporary, "scripts/build.mjs"), "build"], { encoding: "utf8" });
  const manifest = (version) => fs.writeFileSync(path.join(temporary, "package.json"), JSON.stringify({ type: "module", version }));
  const output = () => fs.readFileSync(path.join(temporary, "kfcoding-group-switcher.user.js"), "utf8");
  for (const version of ["0.16.0", "0.16.10", "1.0.0"]) {
    manifest(version);
    assert.equal(build().status, 0);
    assert.equal(output().match(/^\/\/\s*@version\s+(\S+)/m)[1], version);
    assert(output().includes(`const SCRIPT_VERSION = "${version}";`));
    assert(!output().includes("__SCRIPT_VERSION__"));
  }
  const lastValid = output();
  for (const version of ["v0.16.0", "0.16", "0.016.0", "0.16.0-beta.1", "0.16.0+build", "bad", null]) {
    manifest(version);
    assert.notEqual(build().status, 0, `must reject invalid release version ${version}`);
    assert.equal(output(), lastValid, "failed build must not overwrite the existing artifact");
  }
  manifest("0.16.0");
  const metadata = path.join(temporary, "src/metadata.js");
  fs.writeFileSync(metadata, fs.readFileSync(metadata, "utf8").replace("__SCRIPT_VERSION__", "0.15.11"));
  assert.notEqual(build().status, 0, "a manually divergent source version must fail the build");
  assert.equal(output(), lastValid);
  console.log("Version generation and release-format tests passed");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
