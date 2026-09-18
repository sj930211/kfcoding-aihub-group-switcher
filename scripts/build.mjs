import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePaths = [
  "src/metadata.js",
  "src/runtime/site-config.js",
  "src/core/config.js",
  "src/providers/catalog.js",
  "src/providers/monitor.js",
  "src/core/selection.js",
  "src/core/http.js",
  "src/statistics/usage.js",
  "src/runtime/version.js",
  "src/runtime/test-api.js",
  "src/runtime/state.js",
  "src/runtime/operations.js",
  "src/ui/render.js",
  "src/ui/mount.js",
  "src/entry.js",
];

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function write(relativePath, content) {
  const absolutePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content.endsWith("\n") ? content : `${content}\n`);
}

function buildDistribution() {
  const [metadataPath] = modulePaths;
  const metadata = read(metadataPath).trimEnd();
  const body = modulePaths
    .slice(1)
    .map((relativePath) => read(relativePath).trimEnd())
    .join("\n\n");
  const output = `${metadata}\n\n(function () {\n  "use strict";\n\n${body}\n})();\n`;
  const metadataVersion = output.match(/^\/\/\s*@version\s+([^\s]+)\s*$/m)?.[1] || "";
  const runtimeVersion = output.match(/const\s+SCRIPT_VERSION\s*=\s*"([^"]+)";/)?.[1] || "";
  if (!metadataVersion || metadataVersion !== runtimeVersion) {
    throw new Error(`Version mismatch: metadata=${metadataVersion || "missing"}, runtime=${runtimeVersion || "missing"}`);
  }
  write("kfcoding-group-switcher.user.js", output);
}

const command = process.argv[2] || "build";
if (command === "build") {
  buildDistribution();
} else {
  throw new Error(`Unknown command: ${command}`);
}
