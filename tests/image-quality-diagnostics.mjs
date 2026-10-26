import assert from "node:assert/strict";
import { qualityRuntime, response } from "./fixtures/image-quality-runtime.mjs";

function runtime() {
  const r = qualityRuntime({ imageQualityFallbackGroupIds: [], imageQualityMinScore: 80 });
  let now = 1000;
  r.ctx.Date = class extends Date { static now() { return now; } };
  const timers = new Map(); let timerId = 0;
  r.ctx.setTimeout = (action, ms) => { timers.set(++timerId, { action, ms }); return timerId; };
  r.ctx.clearTimeout = id => timers.delete(id);
  r.timers = timers;
  r.fire = ms => {
    const entry = [...timers].find(([, timer]) => timer.ms === ms);
    assert(entry, "expected an active timer for " + ms); timers.delete(entry[0]); entry[1].action();
  };
  r.ctx.refs = { imageQualityDiagnostic: {}, imageQualityTestDiagnostic: {} };
  // Isolate the full panel renderer; exercise the production diagnostic renderer.
  r.ctx.render = () => r.ctx.renderImageQualityDiagnostic();
  r.advance = ms => { now += ms; };
  return r;
}

// A model returning unable_to_assess is not a low numeric score. No repair request is allowed.
{
  const r = runtime();
  r.ctx.respond = async () => {
    r.advance(35000);
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify({ unable_to_assess: true, reasons: ["sk-private-fixture-never-show"] }) }] }] }));
  };
  await assert.rejects(r.ctx.runImageQuality({ candidate: r.rows[0] }), e => e.code === "IMAGE_UNASSESSABLE");
  assert.equal(r.ctx.imageQuality.diagnostic?.code, "IMAGE_UNASSESSABLE", "unable-to-assess must have a visible fixed diagnostic code");
  const text = r.ctx.imageQualityDiagnosticText();
  assert.match(text, /模型响应累计35\.0秒/);
  assert.match(text, /不是低分/);
  assert(!text.includes("sk-private"), "model explanations must not leak into diagnostics");
  assert.equal(r.calls.length, 1);
  assert.equal(r.ctx.imageQuality.records.size, 0);
  assert.deepEqual(r.groupWrites, []);
  assert.equal(r.timers.size, 0, "all progress and request timers must be cleared");
  assert.equal(r.ctx.refs.imageQualityDiagnostic.textContent, text);
  assert.equal(r.ctx.refs.imageQualityTestDiagnostic.textContent, text);
  const finished = r.ctx.imageQualityDiagnosticText();
  r.advance(10000);
  assert.equal(r.ctx.imageQualityDiagnosticText(), finished, "completed timing must stop advancing");
}

// These scores are valid assessments; diagnostics must preserve the score and existing gate.
{
  const r = runtime();
  r.ctx.respond = async () => { r.advance(2000); return new Response(JSON.stringify(response())); };
  const entry = await r.ctx.runImageQuality({ candidate: r.rows[0] });
  assert.equal(entry.score, 85);
  assert.equal(r.ctx.imageQuality.diagnostic.code, "IMAGE_ASSESSED");
  r.ctx.config.imageQualityMinScore = 85;
  await r.ctx.runImageQuality({ candidate: r.rows[0] });
  assert.equal(r.ctx.imageQuality.diagnostic.code, "IMAGE_LOW_SCORE", "equal-to-threshold remains a failed gate, not inability to see");
  assert.equal(r.ctx.imageQuality.records.get(1).entry.score, 85);
  assert.match(r.ctx.imageQualityDiagnosticText(), /低分1张/);
  assert.equal(r.calls.length, 2);
}

// While awaiting the real fetch boundary, elapsed time updates; abort must finish the diagnostic.
{
  const r = runtime();
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  r.ctx.respond = async (_, options) => {
    started();
    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  };
  const task = r.ctx.runImageQuality({ test: true });
  await ready;
  r.advance(12000);
  r.fire(1000);
  assert.match(r.ctx.imageQualityDiagnosticText(), /等待模型响应.*12\.0秒/);
  assert.match(r.ctx.refs.imageQualityTestDiagnostic.textContent, /等待模型响应.*12\.0秒/);
  r.ctx.imageQuality.controller.abort();
  await task;
  assert.equal(r.ctx.imageQuality.diagnostic.code, "IMAGE_CANCELLED");
  assert.equal(r.ctx.imageQuality.controller, null);
  assert.equal(r.calls.length, 1);
  assert.deepEqual(r.groupWrites, []);
  assert.equal(r.timers.size, 0);
}

// A timeout is not a failed picture, and final route handling must retain its safe diagnostic.
{
  const r = runtime(); let started;
  const ready = new Promise(resolve => { started = resolve; });
  r.ctx.respond = async (_, options) => {
    started();
    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  };
  const task = r.ctx.runImageQuality({ test: true }); await ready;
  r.advance(60000); r.fire(60000); await task;
  assert.equal(r.ctx.imageQuality.diagnostic.code, "IMAGE_MODEL_TIMEOUT");
  assert.equal(r.calls.length, 1); assert.equal(r.ctx.imageQuality.records.size, 0);
  assert.equal(r.timers.size, 0);
}
for (const [status, expected] of [[401, "IMAGE_AUTH_FAILED"], [403, "IMAGE_ACCESS_DENIED"], [429, "IMAGE_RATE_LIMITED"]]) {
  const r = runtime();
  r.ctx.respond = async () => new Response(JSON.stringify({ message: "sk-private-fixture-never-show" }), { status });
  await r.ctx.runImageQuality({ test: true });
  assert.equal(r.ctx.imageQuality.diagnostic.code, expected);
  assert(!r.ctx.imageQualityDiagnosticText().includes("sk-private"));
  assert.equal(r.calls.length, 1); assert.equal(r.timers.size, 0);
}
{
  const r = runtime(); r.ctx.respond = async () => new Response("private-invalid-model-response");
  await r.ctx.runImageQuality({ test: true });
  assert.equal(r.ctx.imageQuality.diagnostic.code, "IMAGE_RESPONSE_INVALID");
  assert(!r.ctx.imageQualityDiagnosticText().includes("private-invalid"));
  assert.equal(r.calls.length, 1); assert.equal(r.timers.size, 0);
}

// Two simultaneous requests contribute cumulative stage time, never inflate wall-clock duration.
{
  const r = runtime(); let started; const releases = [];
  const ready = new Promise(resolve => { started = resolve; });
  r.ctx.respond = () => new Promise(resolve => { releases.push(() => resolve(new Response(JSON.stringify(response())))); if (releases.length === 2) started(); });
  const task = r.ctx.runImageQuality(); await ready; r.advance(35000);
  assert.match(r.ctx.imageQualityDiagnosticText(), /总计35\.0秒/);
  assert.match(r.ctx.imageQualityDiagnosticText(), /模型响应累计70\.0秒/);
  releases.splice(0).forEach(release => release());
  // The third image is released immediately; only the first two were slow.
  r.ctx.respond = async () => new Response(JSON.stringify(response()));
  await task; assert.equal(r.calls.length, 3); assert.equal(r.timers.size, 0);
  assert.equal(r.ctx.imageQuality.diagnostic.assessed, 3);
  assert(r.writes.every(key => key === "watermark"), "diagnostics must never be persisted");
  r.ctx.clearImageQualityPage();
  assert.equal(r.ctx.imageQualityDiagnosticText(), "");
  assert.equal(r.ctx.refs.imageQualityDiagnostic.hidden, true);
}
{
  const r = runtime(); const fetch = r.ctx.fetch; let reads = 0, started, release;
  const ready = new Promise(resolve => { started = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  r.ctx.fetch = async (url, options) => {
    if (url === "/api/v1/keys/1" && ++reads === 2) { started(); await held; }
    return fetch(url, options);
  };
  const task = r.ctx.runImageQuality({ test: true }); await ready; r.advance(3000);
  const waiting = r.ctx.imageQualityDiagnosticText(); release(); await task;
  assert.match(waiting, /校验评分分组.*3\.0秒/);
  assert.match(r.ctx.imageQualityDiagnosticText(), /校验评分分组累计3\.0秒/);
  assert.equal(r.calls.length, 1); assert.deepEqual(r.groupWrites, []); assert.equal(r.timers.size, 0);
}
for (const type of ["response.failed", "error"]) {
  const r = runtime();
  const event = { type, error: { code: "rate_limit_exceeded", message: "sk-private-upstream-never-show" } };
  r.ctx.respond = async () => new Response("event: " + type + "\ndata: " + JSON.stringify(event) + "\n\n", { headers: { "Content-Type": "text/event-stream" } });
  await r.ctx.runImageQuality({ test: true });
  assert.equal(r.ctx.imageQuality.diagnostic.code, "IMAGE_RATE_LIMITED");
  assert.equal(r.calls.length, 1); assert.deepEqual(r.groupWrites, []); assert.equal(r.timers.size, 0);
  assert(!r.ctx.imageQualityDiagnosticText().includes("sk-private"));
}
console.log("PASS image diagnostic stages, fixed codes, frozen timing, privacy and unchanged request/gate behavior");
