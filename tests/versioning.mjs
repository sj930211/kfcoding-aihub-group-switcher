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
  const sourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : file.endsWith(".js") ? [file] : [];
  });
  const sources = sourceFiles(path.join(temporary, "src")).map((file) => ({
    file,
    content: fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
  }));
  manifest("0.16.0");
  let lfOutput;
  for (const lineEndings of ["LF", "CRLF", "mixed"]) {
    sources.forEach(({ file, content }, index) => {
      const crlf = lineEndings === "CRLF" || (lineEndings === "mixed" && index % 2 === 0);
      fs.writeFileSync(file, crlf ? content.replace(/\n/g, "\r\n") : content);
    });
    assert.equal(build().status, 0, `${lineEndings} source files must build successfully`);
    const artifact = output();
    assert.equal(artifact.includes("\r"), false, `${lineEndings} source files must produce LF-only output`);
    if (lineEndings === "LF") lfOutput = artifact;
    else assert.equal(Buffer.from(artifact).equals(Buffer.from(lfOutput)), true,
      `${lineEndings} source files must produce the same bytes as LF source files`);
  }
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
