import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { __KFCODING_GROUP_SWITCHER_TEST__: true };
vm.runInNewContext(fs.readFileSync(new URL("../kfcoding-group-switcher.user.js", import.meta.url), "utf8"), context);
const api = context.__KFCODING_GROUP_SWITCHER_API__;
const now = Date.parse("2026-11-02T00:00:00Z");
const fresh = new Date(now).toISOString();
const later = new Date(now + 30 * 60_000).toISOString();
const detection = (overrides = {}) => ({
  applicable: true,
  status: "passed",
  model: "model-a",
  execution_complete: true,
  detected_at: fresh,
  presentation: { text: { result: true } },
  stages: [{ status: "passed", execution_complete: true, result: true }],
  ...overrides,
});
const metric = (overrides = {}) => ({
  success_rate: 0.98,
  tps: 82,
  sample_count: 120,
  range_cache: {
    cache_hit_rate: 0.72,
    usage_records: 80,
    ready: true,
    stale: false,
    refreshed_at: fresh,
  },
  ...overrides,
});
const monitor = (id, modelDetection = detection(), overrides = {}) => ({
  group_id: id,
  id: String(id),
  platform: "openai",
  group_models: ["model-a"],
  model_detection: modelDetection,
  priceMultiplier: 0.8,
  enabled: true,
  ...overrides,
});
const providers = (apis, models = { "model-a": metric() }, overrides = {}) => ({
  version: 2,
  generated_at: fresh,
  summary_range: "1h",
  summary_models: models,
  items: apis.map(item => ({ ...item, summary_models: models })),
  ...overrides,
});

const normalized = api.normalizeAihubProviderData(providers([monitor(1)]), {});
assert.equal(normalized.summary.summaryRange, "1h");
assert.equal(normalized.summary.summaryModels["model-a"].sampleCount, 120);
assert.equal(normalized.summary.apis[0].modelDetection.presentationResult, true);

const configured = api.sanitizeConfig({ models: ["model-a"], minSuccessRate: 95 });
// Exercise the real loader: the endpoint URL cannot attest the payload version.
for (const version of [1, undefined, "invalid", 2]) {
  const payload = providers([monitor(1)], undefined, { version });
  const loaded = await api.loadAihubMonitorData(async path => {
    if (path.startsWith("/api/v2/public/providers?")) return payload;
    if (path === "/api/v1/groups/available") return [{ id: 1, name: "Group 1" }];
    if (path === "/api/v1/groups/rates") return { 1: 0.8 };
    throw Error("unexpected loader request: " + path);
  }, undefined, "Asia/Shanghai");
  const candidate = api.evaluateAihubCandidates(loaded.summary, {}, loaded.groups, loaded.rates, configured, now)[0];
  assert.equal(candidate.available, version === 2, "only a declared v2 payload may pass, received " + version);
  assert.equal(loaded.providerVersion, Number(version) || 0);
  assert.equal(loaded.summary.providerVersion, Number(version) || 0);
  assert.equal(loaded.endpointVersion, 2, "URL version is diagnostic metadata only");
}
const rows = api.evaluateAihubCandidates(normalized.summary, {}, [{ id: 1, name: "Group 1" }], { 1: 0.8 }, configured, now);
assert.equal(rows[0].available, true);
assert.equal(rows[0].aihubSuccessRate, 98);
assert.equal(rows[0].aihubCacheHitRate, 72);
assert.equal(rows[0].aihubTps, 82);
assert.equal(rows[0].aihubMetricSampleCount, 120);
assert.equal(rows[0].aihubCacheSampleCount, 80);

const evaluate = (apiItem, modelStats = metric(), providerOverrides = {}, settings = configured) => {
  const payload = api.normalizeAihubProviderData(providers([apiItem], { "model-a": modelStats }, providerOverrides), {});
  return api.evaluateAihubCandidates(payload.summary, {}, [{ id: 1, name: "Group 1" }], { 1: 0.8 }, settings, now)[0];
};
const failedPresentation = detection({ presentation: { text: { result: false } } });
const failedStage = detection({ stages: [{ status: "failed", result: false }] });
const mismatchedDetection = detection({ model: "other-model" });
const refreshingDetection = detection({ status: "refreshing" });
const invalidExpiry = detection({ expires_at: "invalid" });
const expiredDetection = detection({ expires_at: new Date(now - 1).toISOString() });
const validLongDetection = detection({ detected_at: "2026-11-01T22:00:00Z", expires_at: later });
const oldDetection = detection({ expires_at: undefined, detected_at: "2026-11-01T22:00:00Z" });
assert.equal(evaluate(monitor(1, failedPresentation)).available, false);
assert.ok(evaluate(monitor(1, failedStage)).reasons.includes("model-detection-failed"));
assert.ok(evaluate(monitor(1, mismatchedDetection)).reasons.includes("model-detection-model-mismatch"));
assert.ok(evaluate(monitor(1, refreshingDetection)).reasons.includes("model-detection-unknown"));
assert.ok(evaluate(monitor(1, invalidExpiry)).reasons.includes("model-detection-expired"));
assert.ok(evaluate(monitor(1, expiredDetection)).reasons.includes("model-detection-expired"));
assert.equal(evaluate(monitor(1, validLongDetection)).available, true);
assert.ok(evaluate(monitor(1, oldDetection)).reasons.includes("model-detection-expired"));

assert.ok(evaluate(monitor(1), metric(), { generated_at: "invalid" }).reasons.includes("metrics-stale"));
assert.ok(evaluate(monitor(1), metric({ range_cache: { ...metric().range_cache, stale: undefined } })).reasons.includes("cache-stale"));
assert.ok(evaluate(monitor(1), metric({ range_cache: { ...metric().range_cache, ready: false } })).reasons.includes("cache-stale"));
assert.ok(evaluate(monitor(1), metric({ sample_count: 9 })).reasons.includes("metrics-sample-insufficient"));
assert.ok(evaluate(monitor(1), metric({ range_cache: { ...metric().range_cache, usage_records: 9 } })).reasons.includes("cache-sample-insufficient"));
assert.ok(evaluate(monitor(1), metric({ success_rate: null })).reasons.includes("success-low"));
assert.ok(evaluate(monitor(1), metric({ range_cache: { ...metric().range_cache, cache_hit_rate: null } })).reasons.includes("cache-metrics-missing"));

const defaultConfig = api.sanitizeConfig({});
assert.ok(defaultConfig.qualityWeights, "missing configurable quality weights defaults");
assert.deepEqual(JSON.parse(JSON.stringify(defaultConfig.qualityWeights)), { success: 40, cache: 30, tps: 20, ratio: 10 });
assert.equal(defaultConfig.minQualityGain, 5);
assert.deepEqual(JSON.parse(JSON.stringify(api.sanitizeConfig({ qualityWeights: { success: 40, cache: 30, tps: 20, ratio: 10 } }).qualityWeights)),
  { success: 40, cache: 30, tps: 20, ratio: 10 });
assert.deepEqual(JSON.parse(JSON.stringify(api.sanitizeConfig({ qualityWeights: { success: 40, cache: 30, tps: 20, ratio: 9 } }).qualityWeights)),
  { success: 40, cache: 30, tps: 20, ratio: 10 }, "invalid stored totals fall back as one default set");
assert.deepEqual(JSON.parse(JSON.stringify(api.sanitizeConfig({ qualityWeights: { success: -1, cache: 41, tps: 20, ratio: 40 } }).qualityWeights)),
  { success: 40, cache: 30, tps: 20, ratio: 10 }, "negative stored weights do not get silently clamped");
assert.equal(api.sanitizeConfig({ minQualityGain: 120 }).minQualityGain, 100);

const scoreRow = (group, groupId, values = {}) => ({
  group, groupId, aihubMetricModel: "model-a", available: true, scopeEligible: true,
  aggregateSuccess: 98, cacheHitRate: 70, outputTokensPerSecond: 60, ratio: 1,
  aihubMetricSampleCount: 100, aihubCacheSampleCount: 100, ...values,
});
const ranked = api.scoreAihubQualityCandidates([
  scoreRow("low", 1, { aggregateSuccess: 97, cacheHitRate: 20, outputTokensPerSecond: 30, ratio: 0.5 }),
  scoreRow("mid", 2, { aggregateSuccess: 98, cacheHitRate: 50, outputTokensPerSecond: 60, ratio: 0.8 }),
  scoreRow("high", 3, { aggregateSuccess: 99, cacheHitRate: 80, outputTokensPerSecond: 90, ratio: 1 }),
], defaultConfig);
assert.deepEqual(Array.from(ranked, row => row.group), ["high", "mid", "low"]);
assert.ok(Math.abs(ranked[0].qualityScore - (0.4 * 80 * 0.5 + 0.3 * 80 * 0.5 + 0.2 * (100 * 90 / 190) * 0.5 + 0.1 * 50)) < 1e-8);
assert.ok(Math.abs(ranked[1].qualityScore - (0.4 * 60 * 0.5 + 0.3 * 50 * 0.5 + 0.2 * 37.5 * 0.5 + 0.1 * (100 / 1.8))) < 1e-8);
assert.ok(Math.abs(ranked[2].qualityScore - (0.4 * 40 * 0.5 + 0.3 * 20 * 0.5 + 0.2 * (100 * 30 / 130) * 0.5 + 0.1 * (100 / 1.5))) < 1e-8);
const beforeThirdCandidate = api.scoreAihubQualityCandidates([scoreRow("a", 1), scoreRow("b", 2, { aggregateSuccess: 99 })], defaultConfig);
const afterThirdCandidate = api.scoreAihubQualityCandidates([
  scoreRow("a", 1), scoreRow("b", 2, { aggregateSuccess: 99 }), scoreRow("third", 3, { aggregateSuccess: 10 }),
], defaultConfig);
assert.equal(afterThirdCandidate.find(row => row.groupId === 1).qualityScore,
  beforeThirdCandidate.find(row => row.groupId === 1).qualityScore, "adding a third group cannot change an existing fixed score");
assert.equal(afterThirdCandidate.find(row => row.groupId === 2).qualityScore,
  beforeThirdCandidate.find(row => row.groupId === 2).qualityScore, "candidate membership does not change score components");
const successOnly = { ...defaultConfig, qualityWeights: { success: 100, cache: 0, tps: 0, ratio: 0 } };
const sampleScores = api.scoreAihubQualityCandidates([
  scoreRow("small-sample", 1, { aihubMetricSampleCount: 100 }),
  scoreRow("large-sample", 2, { aihubMetricSampleCount: 300 }),
], successOnly);
assert.equal(sampleScores.find(row => row.groupId === 1).qualityScore, 30);
assert.equal(sampleScores.find(row => row.groupId === 2).qualityScore, 45);
const noSuccessWeight = { ...configured, qualityWeights: { success: 0, cache: 0, tps: 0, ratio: 100 } };
const belowThreshold = evaluate(monitor(1), metric({ success_rate: 0.94 }), {}, noSuccessWeight);
assert.equal(belowThreshold.available, false, "zero success weight cannot disable the raw success hard gate");
assert.ok(belowThreshold.reasons.includes("success-low"));
const maxThresholdConfig = { ...configured, minSuccessRate: 100, qualityWeights: { success: 100, cache: 0, tps: 0, ratio: 0 } };
const maxThresholdCandidate = evaluate(monitor(1), metric({ success_rate: 1 }), {}, maxThresholdConfig);
assert.equal(maxThresholdCandidate.available, true);
assert.equal(api.scoreAihubQualityCandidates([scoreRow("max", 1, { aggregateSuccess: 100 })], maxThresholdConfig)[0].qualityScore, 0,
  "a 100% threshold yields zero success headroom without redistributing weight");
const microDifference = api.scoreAihubQualityCandidates([
  scoreRow("base", 1), scoreRow("tiny-gain", 2, { aggregateSuccess: 98.0001 }),
], defaultConfig);
assert.ok(microDifference.find(row => row.groupId === 2).qualityScore
  - microDifference.find(row => row.groupId === 1).qualityScore <= 0.0008,
"a 0.0001 percentage-point success change stays below 0.0008 score points");
assert.equal(api.sanitizeConfig({ selectionMode: "stable" }).selectionMode, "quality");
assert.equal(api.sanitizeConfig({ selectionMode: "saving" }).selectionMode, "quality");

const scoped = api.scopeAihubMonitors({ apis: [monitor(1), monitor(2)] },
  [{ id: 1, name: "Group 1" }, { id: 2, name: "Group 2" }],
  { ...configured, monitorScopeMode: "selected", monitorGroupIds: [] }, ["model-a"]);
assert.equal(scoped.summary.apis.length, 0, "an explicit empty monitor scope must not mean all groups");
assert.equal(api.scopeAihubMonitors({ apis: [monitor(1), monitor(2)] },
  [{ id: 1, name: "Group 1" }, { id: 2, name: "Group 2" }],
  { ...configured, monitorScopeMode: "selected", monitorGroupIds: [1] }, ["model-a"]).summary.apis.length, 1);

// Actual public v2 shape: the 1h window belongs to each item; stages are a named map.
const publishedStages = { detection: { published_state: "completed", state: "completed" }, text: { published_state: "completed", state: "completed" } };
const realShape = api.normalizeAihubProviderData({ version: 2, generated_at: fresh, items: [{
  ...monitor(1, detection({ stages: publishedStages, stage_enabled: { detection: true, text: true } })),
  summary_range: "1h", summary_models: { "model-a": metric() },
}] }, {});
assert.equal(api.evaluateAihubCandidates(realShape.summary, {}, [{ id: 1, name: "Group 1" }], {1: 0.8}, configured, now)[0].available, true);
const failedPublished = structuredClone(realShape.summary);
failedPublished.apis[0].modelDetection = detection({ stages: { ...publishedStages, text: { published_state: "failed", state: "failed" } }, stage_enabled: { detection: true, text: true } });
assert.ok(api.evaluateAihubCandidates(failedPublished, {}, [{id:1,name:"Group 1"}], {1:0.8}, configured, now)[0].reasons.includes("model-detection-failed"));

assert.equal(evaluate(monitor(1), metric(), {generated_at: later}).available, false);
assert.equal(evaluate(monitor(1), metric(), {summary_range: "24h"}).available, false);
assert.equal(evaluate(monitor(1), metric({tps: null})).available, false);
assert.equal(evaluate(monitor(1), metric({range_cache: {...metric().range_cache, refreshed_at: later}})).available, false);
assert.equal(evaluate(monitor(1, detection({presentation: {text: {}}}))).available, false);
assert.equal(evaluate(monitor(1, detection({execution_complete: false}))).available, false);
const qualityRow = (id, model, overrides = {}) => ({group: "q"+id, groupId: id, aihubMetricModel: model, available: true, scopeEligible: true, aggregateSuccess: 98, cacheHitRate: 70, outputTokensPerSecond: 60, ratio: 1, aihubMetricSampleCount: 100, aihubCacheSampleCount: 100, ...overrides});
assert.equal(evaluate(monitor(1, detection({stages: undefined, stage_enabled: {text: true, detection: true}}))).available, false, "explicitly enabled stages require their own evidence");
assert.equal(evaluate(monitor(1), metric(), {version: 1}).available, false, "legacy provider version cannot be admitted");
const wrongWindowFailure = evaluate(monitor(1), metric({success_rate: 0.2}), {summary_range: "24h"});
assert.equal(api.candidateHasExplicitHealthFailure(wrongWindowFailure, configured), false, "wrong metrics window cannot trigger failover");
const duplicateNames = [qualityRow(1, "a", {group: "same"}), qualityRow(2, "b", {group: "same"}), qualityRow(3, "b", {aggregateSuccess: 99})];
assert.equal(api.selectBestCandidate(duplicateNames, {groupId: 2, group: "same"}, "quality").groupId, 3, "group ID selects the correct current model pool");
const ties = api.scoreAihubQualityCandidates([qualityRow(2, "a"), qualityRow(1, "a")], defaultConfig);
assert.deepEqual(Array.from(ties, row => row.groupId), [1,2]);
assert.deepEqual(Array.from(ties, row => row.qualityScore), [31.25, 31.25], "equal metrics keep equal absolute scores");
assert.equal(api.scoreAihubQualityCandidates([qualityRow(1, "a")], defaultConfig)[0].qualityScore, 31.25);
const pools = api.scoreAihubQualityCandidates([qualityRow(1, "a", {aggregateSuccess: 99}), qualityRow(2, "a"), qualityRow(3, "b")], defaultConfig);
assert.equal(pools.find(row => row.groupId === 3).qualityScore, 31.25, "model pools use the same absolute formula independently");
assert.equal(api.selectBestCandidate(pools, "", "quality"), null, "cross-model relative scores cannot produce one recommendation");
assert.equal(api.selectBestCandidate(pools, "q2", "quality").groupId, 1);
assert.equal(api.selectBestCandidate([qualityRow(1, "a", {scopeEligible: false})], "", "quality"), null);
assert.equal(Number.isNaN(api.scoreAihubQualityCandidates([qualityRow(1, "a", {cacheHitRate: NaN})])[0].qualityScore), true);
console.log("PASS AIHub v2 1h data, strict detection details, fixed weighted scoring and explicit monitor scope");
