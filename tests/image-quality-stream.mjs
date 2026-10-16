import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { qualityCriteria } from "./fixtures/image-quality.mjs";

const sandbox = { __KFCODING_GROUP_SWITCHER_TEST__: true, AbortController, DOMException,
  TextDecoder, setTimeout, clearTimeout, console };
vm.runInNewContext(fs.readFileSync(new URL("../kfcoding-group-switcher.user.js", import.meta.url), "utf8"), sandbox);
const api = sandbox.__KFCODING_GROUP_SWITCHER_API__;
const candidate = { detectionMedia: { status: "successful", url: "https://aihub.top/api/v1/public/model-detection-artifacts/fixture-1" } };
const request = api.buildImageQualityRequest(candidate, { imageQualityModel: "gpt-6.1-sol", imageQualityTask: "鹈鹕骑自行车" }, "data:image/png;base64,iVBORw0KGgo=");
const actual400 = { error: { code: "stream_required", message: "This group only accepts streaming conversation requests. Set stream to true.", param: "stream", type: "invalid_request_error" } };
assert.equal(request.stream, true, "stream_required groups reject the existing stream:false scoring request with HTTP400");
const criteria = qualityCriteria();
const completed = { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ unable_to_assess: false, criteria, confidence: "high", reasons: ["测试评分"] }) }] }] };
const event = (type, fields = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
const end = event("response.completed", { response: completed });
function streamResponse(text, chunkSize = 7) {
  const bytes = new TextEncoder().encode(text); let offset = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (offset >= bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.slice(offset, offset += chunkSize));
  } }), { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}
async function run(response, controller = new AbortController()) {
  let calls = 0;
  sandbox.fetch = async () => { calls++; return response; };
  try { return await api.imageQualityFetchJson("/v1/responses", {}, controller); }
  finally { assert.equal(calls, 1, "no fallback or automatic paid retry"); }
}
for (const newline of ["\n", "\r\n", "\r"]) {
  const text = ": heartbeat\n\n" + event("response.created") + event("response.output_text.delta", { delta: "untrusted partial" }) + end;
  const result = await run(streamResponse(text.replace(/\n/g, newline), 1));
  assert.equal(api.parseImageQualityResponse(result).score, 85, "split UTF8 and line boundaries must preserve completed evidence");
}
const multiline = `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: completed }, null, 2).split("\n").join("\ndata: ")}\n\n`;
assert.equal(api.parseImageQualityResponse(await run(streamResponse(multiline))).score, 85);
assert.equal(api.parseImageQualityResponse(await run(new Response(JSON.stringify(completed), { headers: { "Content-Type": "application/json" } }))).score, 85);
await assert.rejects(run(new Response(JSON.stringify(actual400), { status: 400 })), /流式.*stream_required/);
for (const text of [event("response.output_text.delta", { delta: JSON.stringify(completed) }), "data: [DONE]\n\n", end.trimEnd(), "data: {bad}\n\n",
  event("response.incomplete", { response: { status: "incomplete" } }),
  event("response.completed", { response: { ...completed, status: "failed" } }),
  `event: response.failed\ndata: ${JSON.stringify({ type: "response.completed", response: completed })}\n\n`,
  ":" + "x".repeat(2 * 1024 * 1024)]) {
  await assert.rejects(run(streamResponse(text, 65536)), error => {
    assert.match(error.message, /接口|评分/);
    assert.equal(api.imageQualityFailureMessage(error, new AbortController()), error.message,
      "local fixed stream diagnostics must remain visible without upstream text");
    return true;
  });
}
for (const type of ["error", "response.failed"]) {
  await assert.rejects(run(streamResponse(event(type, { error: { code: "SUPPLIER_UPSTREAM_BLOCKED", message: "sk-private-test-do-not-display" } }))), error => {
    assert.match(error.message, /SUPPLIER_UPSTREAM_BLOCKED/);
    assert(!error.message.includes("sk-private")); return true;
  });
}
let cancelled = false;
const terminal = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(end)); }, cancel() { cancelled = true; } }), { headers: { "Content-Type": "text/event-stream" } });
await run(terminal); assert(cancelled, "terminal completion must release a connection that stays open");
const midAbort = new AbortController();
let midCancelled = false;
const interrupted = new Response(new ReadableStream({ pull(controller) {
  controller.enqueue(new TextEncoder().encode(": heartbeat\n\n")); midAbort.abort();
}, cancel() { midCancelled = true; } }), { headers: { "Content-Type": "text/event-stream" } });
await assert.rejects(run(interrupted, midAbort), /停止|abort/i);
assert(midCancelled, "aborted streaming reader must be released");
const aborted = new AbortController(); aborted.abort();
await assert.rejects(run(streamResponse(end), aborted), /停止|abort/i);
console.log("PASS streaming-only HTTP400 regression, complete SSE, split UTF8/lines, failures, bounds, cancellation and no retry");
