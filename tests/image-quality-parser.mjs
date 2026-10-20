import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { qualityCriteria, fullQualityCriteria } from "./fixtures/image-quality.mjs";
import { qualityRuntime, response } from "./fixtures/image-quality-runtime.mjs";

const sandbox = { __KFCODING_GROUP_SWITCHER_TEST__: true };
vm.runInNewContext(fs.readFileSync(new URL("../kfcoding-group-switcher.user.js", import.meta.url), "utf8"), sandbox);
const api = sandbox.__KFCODING_GROUP_SWITCHER_API__;
const value = () => ({ unable_to_assess: false, criteria: qualityCriteria(), confidence: "high", reasons: ["本地模拟可见依据"] });
const payload = result => ({ status: "completed", output: [{ type: "message", role: "assistant",
  content: [{ type: "output_text", text: JSON.stringify(result) }] }] });
const parse = result => api.parseImageQualityResponse(payload(result));

assert.equal(parse(value()).score, 85);
for (const format of [score => String(score), score => " " + score + ".0 "]) {
  const result = value();
  for (const item of Object.values(result.criteria)) item.score = format(item.score);
  const entry = parse(result);
  assert.equal(entry.score, 85, "unambiguous integer strings must keep the same scores");
  assert(Object.values(entry.criteria).every(item => Number.isInteger(item.score)));
}
{
  const result = value();
  result.criteria.total = { score: 100, evidence: "额外汇总字段不参与评分" };
  result.criteria.subject.unexpected = "ignored";
  Object.assign(result, { task: -1, structure: "100", harmony: {}, finish: 999, score: 100 });
  const entry = parse(result);
  assert.equal(entry.score, 85, "all subtotals and total must be recomputed from required criteria");
  assert.equal(entry.task, 20); assert.equal(entry.structure, 30);
  assert.equal(Object.keys(entry.criteria).length, 14);
  assert.equal(entry.criteria.total, undefined); assert.equal(entry.criteria.subject.unexpected, undefined);
}
{
  const result = value(); result.criteria = fullQualityCriteria();
  Object.assign(result.criteria.pedal, { connection: "broken", score: "2" });
  result.score = 100; result.structure = 40;
  assert.equal(parse(result).score, 69, "model summaries must never bypass the contact defect ceiling");
}

const rejects = (change, pattern) => {
  const result = value(); change(result);
  assert.throws(() => parse(result), error => pattern.test(error.message) && /未采用图片分/.test(error.message));
};
rejects(result => delete result.criteria.wheels, /车轮结构.*wheels.*缺少/);
rejects(result => result.criteria = [], /细项.*criteria/);
rejects(result => result.criteria.frame = null, /车架结构.*frame/);
for (const score of ["", " ", null, true, [], {}, "0xA", "1e1", "10分", "8.1", 8.1]) {
  rejects(result => result.criteria.subject.score = score, /主体符合.*subject.*整数/);
}
rejects(result => result.criteria.proportion.score = "9", /比例协调.*proportion.*0.*2.*4.*6.*8.*10/);
rejects(result => result.criteria.subject.score = 12, /主体符合.*subject.*0.*10/);
rejects(result => result.criteria.subject.evidence = " ", /主体符合.*subject.*evidence/);
rejects(result => result.criteria.subject.evidence = "字".repeat(121), /主体符合.*subject.*120/);
rejects(result => result.criteria.pedal.connection = "toString", /脚踏传力.*pedal.*connection/);
rejects(result => result.criteria.pedal.score = 0, /脚踏传力.*pedal.*0/);
rejects(result => result.criteria.pedal.connection = "unclear", /脚踏传力.*pedal.*4/);
rejects(result => result.criteria.control.from = "", /车把操控.*control.*from/);
rejects(result => result.criteria.control.to = "字".repeat(61), /车把操控.*control.*to.*60/);
rejects(result => result.criteria.support.to = result.criteria.support.from, /座位支撑.*support.*相同/);
rejects(result => result.confidence = "certain", /confidence/);
rejects(result => result.unable_to_assess = "false", /unable_to_assess/);
for (const reasons of [null, [], [" "], ["字".repeat(181)]]) {
  rejects(result => result.reasons = reasons, /reasons/);
}
{
  const result = value(); result.criteria.pedal.evidence = "private-credential".repeat(20);
  assert.throws(() => parse(result), error => /pedal/.test(error.message) && !error.message.includes("private-credential"));
}
for (const result of [null, [], 1, "text"]) assert.throws(() => parse(result));
assert.throws(() => api.parseImageQualityResponse({ ...payload(value()), status: "incomplete" }), /未完成/);
{
  const result = value(); result.unable_to_assess = true;
  assert.throws(() => parse(result), error => error.code === "IMAGE_UNASSESSABLE");
}
for (const [connection, score, expected] of [["unclear", "4", "low"], ["occluded", "6", "medium"]]) {
  const result = value(); Object.assign(result.criteria.pedal, { connection, score });
  assert.equal(parse(result).confidence, expected, "normalization must preserve evidence confidence restrictions");
}
{
  const r = qualityRuntime(); const malformed = response();
  const result = JSON.parse(malformed.output[0].content[0].text);
  delete result.criteria.wheels;
  malformed.output[0].content[0].text = JSON.stringify(result);
  r.ctx.respond = async () => new Response(JSON.stringify(malformed));
  await assert.rejects(r.ctx.runImageQuality({ candidate: r.rows[0] }), error =>
    error.code === "IMAGE_SCORER_UNAVAILABLE" && /车轮结构.*wheels.*缺少/.test(error.message));
  assert.equal(r.calls.length, 1, "format errors must not trigger paid repair or fallback requests");
  assert.deepEqual(r.groupWrites, []);
  assert.equal(r.ctx.imageQuality.records.size, 0);
}
console.log("PASS parser normalization, local aggregation, field diagnostics, unchanged gates and no paid repair retries");
