// Local interaction fixture only. No real service requests or credentials.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const server = http.createServer((request, response) => {
  const route = new URL(request.url, "http://127.0.0.1").pathname;
  if (route === "/" || route === "/v2.html") {
    const html = fs.readFileSync(path.join(repo, "ui-preview.html"), "utf8")
      .replace('if (previewParams.has("pelican")) return;', 'return; // v2 fixture must never inject legacy demonstration rows')
      .replace('<script src="./kfcoding-group-switcher.user.js"></script>', '<script src="/v2-mock.js"></script><script src="/kfcoding-group-switcher.user.js"></script>');
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  } else if (route === "/kfcoding-group-switcher.user.js" || route === "/v2-mock.js") {
    const file = route === "/v2-mock.js" ? "tests/fixtures/aihub-v2-ui-mock.js" : "kfcoding-group-switcher.user.js";
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    response.end(fs.readFileSync(path.join(repo, file)));
  } else {
    response.writeHead(404); response.end();
  }
});
server.listen(8773, "127.0.0.1", () => console.log("AIHub 2.0 local mock: http://127.0.0.1:8773/v2.html?site=aihub&pelican"));
