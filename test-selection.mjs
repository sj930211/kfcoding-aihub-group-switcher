import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./kfcoding-group-switcher.user.js", import.meta.url), "utf8");
assert.equal(source.includes('data-ref="refresh"'), false, "manual refresh should be folded into immediate check");
assert.equal(
  source.indexOf("const manualUsageRefresh = manual ? refreshTodayUsage() : null;") < source.indexOf("if (!config.model)"),
  true,
  "manual checks should refresh account usage before group-check prerequisites can return early",
);
assert.equal(
  source.includes('const usageLoadingText = state.todayUsage.loading ? "..." : "";'),
  true,
  "today usage should visibly enter a loading state during an immediate refresh",
);
assert.equal(source.includes('data-ref="save"'), false, "settings should save automatically without an ambiguous save button");
assert.equal(source.includes('data-ref="tokenSelectToggle"'), true, "API keys should use a compact dropdown trigger");
assert.equal(source.includes('<dialog class="manual-dialog"'), true, "manual group selection should use a confirmation dialog");
assert.equal(source.includes('<section class="overview"'), true, "the primary route state should lead the redesigned hierarchy");
assert.equal(source.includes('<section class="usage-strip"'), true, "today usage should use a compact monitoring strip");
assert.equal(source.includes('data-ref="balance"'), true, "the account balance should be visible in the monitoring strip");
assert.equal(
  source.includes("checkForUpdate({ silent: true })"),
  true,
  "automatic group checks should also run the throttled update check",
);
assert.equal(
  source.includes("const AUTO_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;"),
  true,
  "automatic update checks should be rate limited independently from group polling",
);
assert.equal(source.includes('<div class="automation-bar">'), true, "automatic and manual switching should share one control bar");
assert.equal(source.includes('<div class="control-grid">'), true, "key and model selectors should use a compact responsive grid");
assert.equal(source.includes('class="button button-check"'), true, "immediate checks should be the primary command");
assert.equal(source.includes('class="button button-route"'), true, "lowest-route switching should remain directly accessible");
assert.equal(source.includes('<div class="summary">'), false, "the old equal-weight summary grid should be removed");
assert.equal(
  source.indexOf('data-ref="checkUpdate"') < source.indexOf('data-ref="settingsSection"'),
  true,
  "the update icon should live in the panel header",
);
const sandbox = {
  __KFCODING_GROUP_SWITCHER_TEST__: true,
  AbortController,
  clearTimeout,
  console,
  setTimeout,
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: "kfcoding-group-switcher.user.js" });

const api = sandbox.__KFCODING_GROUP_SWITCHER_API__;
assert.ok(api, "test API should be exposed");
assert.equal(api.extractUserscriptVersion(source), "0.4.8");
assert.equal(api.extractUserscriptVersion("// no version"), "");
assert.equal(api.compareVersions("0.4.5", "0.4.4"), 1);
assert.equal(api.compareVersions("v1.0.0", "1.0"), 0);
assert.equal(api.compareVersions("0.4.4", "0.4.5"), -1);
assert.equal(api.compareVersions("0.10.0", "0.9.9"), 1);

const persistedLogs = Array.from({ length: 12 }, (_, index) => ({
  at: `10:00:${String(index).padStart(2, "0")}`,
  message: `event ${index}`,
  tone: index === 0 ? "error" : "unknown",
}));
persistedLogs.splice(3, 0, null, { at: "10:00:99", message: "" });
const normalizedLogs = api.normalizeLogs(persistedLogs);
assert.equal(normalizedLogs.length, 10);
assert.equal(normalizedLogs[0].message, "event 0");
assert.equal(normalizedLogs[0].tone, "error");
assert.equal(normalizedLogs[1].tone, "info");
assert.deepEqual(JSON.parse(JSON.stringify(api.normalizeLogs({ invalid: true }))), []);

assert.deepEqual(
  JSON.parse(JSON.stringify(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, tokenId: 7 }).tokenIds)),
  [7],
  "legacy single-token config should migrate automatically",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.sanitizeConfig({
    ...api.DEFAULT_CONFIG,
    tokenId: 7,
    tokenIds: [9, "7", 9, 0, "bad"],
  }).tokenIds)),
  [9, 7],
);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG }).maxGroupRatio, 0);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, maxGroupRatio: 0.08 }).maxGroupRatio, 0.08);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, maxGroupRatio: -1 }).maxGroupRatio, 0);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG }).rollbackChecks, 2);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, rollbackChecks: 0 }).rollbackChecks, 0);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, rollbackChecks: 99 }).rollbackChecks, 10);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG }).blacklistMinutes, 60);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, blacklistMinutes: 0 }).blacklistMinutes, 1);

assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeAihubTodayUsage({
    total_actual_cost: 1.23456,
    total_requests: 42,
    total_tokens: 98765,
  }, { balance: 26.34020161 }))),
  { balance: 26.34020161, spend: 1.23456, requests: 42, tokens: 98765, symbol: "$" },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeAihubTodayUsage({
    actual_cost: null,
    total_actual_cost: 0.25,
    request_count: 7,
    input_tokens: 100,
    output_tokens: 50,
    cache_read_tokens: 25,
  }, { data: { balance: 12.5 } }))),
  { balance: 12.5, spend: 0.25, requests: 7, tokens: 175, symbol: "$" },
  "AIHub usage should tolerate field aliases used by different API versions",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeKfcodingTodayUsage({
    success: true,
    data: [
      { quota: 250000, count: 2, token_used: 1200 },
      { quota: 500000, count: 3, token_used: 3400 },
    ],
  }, {
    data: { display_in_currency: true, quota_per_unit: 500000, quota_display_type: "USD" },
  }, {
    data: { quota: 48287708 },
  }))),
  { balance: 96.575416, spend: 1.5, requests: 5, tokens: 4600, symbol: "$" },
);
assert.equal(api.formatBalance({ balance: 26.34020161, symbol: "$", available: true }), "$26.34");
assert.equal(api.formatBalance({ balance: 1250000, symbol: "", available: true }), "1,250,000");
assert.equal(api.formatBalance({ balance: 10, symbol: "$", available: false }), "-");
assert.equal(
  api.requiresTokenSelection("aihub", { manual: true }),
  false,
  "AIHub immediate checks should monitor groups without requiring a selected API key",
);
assert.equal(api.formatTokenCount(999_999, true), "999,999");
assert.equal(api.formatTokenCount(1_000_000, true), "1M");
assert.equal(api.formatTokenCount(1_250_000, true), "1.25M");
assert.equal(api.formatTokenCount(12_340_000, true), "12.34M");
assert.equal(api.formatTokenCount(100_000_000, true), "1亿");
assert.equal(api.formatTokenCount(125_000_000, true), "1.25亿");
assert.equal(api.formatTokenCount(12_340_000_000, true), "123.4亿");
assert.equal(api.formatTokenCount(1_000_000, false), "-");

const usageRange = api.todayTimestampRange(new Date(2026, 6, 19, 14, 30, 0));
assert.equal(usageRange.end - usageRange.start, 15.5 * 60 * 60);
assert.equal(api.requiresTokenSelection("aihub", { manual: true, forceSwitch: true }), true);
assert.equal(api.requiresTokenSelection("aihub", { manual: true, targetGroup: "A001-K12" }), true);
assert.equal(api.requiresTokenSelection("aihub", { manual: false }), true);
assert.equal(
  api.requiresTokenSelection("kfcoding", { manual: true }),
  true,
  "KFCoding selection behavior must remain unchanged",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeSwitchHistory({
    tokenId: 7,
    model: "gpt-test",
    group: "cheap",
    at: 1234,
  }))),
  { byToken: { 7: { model: "gpt-test", group: "cheap", at: 1234 } } },
);
const guardState = api.normalizeSwitchGuardState({
  byToken: {
    7: { model: "gpt-test", fromGroup: "stable", toGroup: "cheap", remaining: 2, at: 1000 },
    8: { model: "gpt-test", fromGroup: "same", toGroup: "same", remaining: 2, at: 1000 },
    bad: { model: "gpt-test", fromGroup: "stable", toGroup: "cheap", remaining: 2, at: 1000 },
  },
  blacklist: [
    { model: "gpt-test", group: "cheap", until: 5000 },
    { model: "", group: "invalid", until: 5000 },
  ],
});
assert.deepEqual(
  JSON.parse(JSON.stringify(guardState)),
  {
    byToken: {
      7: { model: "gpt-test", fromGroup: "stable", toGroup: "cheap", remaining: 2, at: 1000 },
    },
    blacklist: [{ model: "gpt-test", group: "cheap", until: 5000 }],
  },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.pruneSwitchGuardState(guardState, 6000).blacklist)),
  [],
  "expired group blacklists should be discarded",
);
const blacklistedCandidates = api.applyTemporaryBlacklist([
  { group: "cheap", available: true, reasons: [], ratio: 0.05 },
  { group: "stable", available: true, reasons: [], ratio: 0.2 },
], guardState, "gpt-test", 2000);
assert.equal(blacklistedCandidates[0].available, false);
assert.equal(blacklistedCandidates[0].reasons[0], "temporarily-blacklisted");
assert.equal(blacklistedCandidates[1].available, true);
assert.equal(
  api.applyTemporaryBlacklist([
    { group: "cheap", available: true, reasons: [], ratio: 0.05 },
  ], guardState, "other-model", 2000)[0].available,
  true,
  "blacklists must stay scoped to a model",
);
assert.equal(api.candidateHasHealthFailure({ reasons: ["latest-success-low"] }), true);
assert.equal(api.candidateHasHealthFailure({ reasons: ["ratio-too-high"] }), false);
assert.equal(api.candidateHasHealthFailure(null), true);
const rollbackToPrevious = api.selectRollbackCandidate([
  { group: "cheap", available: true, aggregateSuccess: 99, latencyMs: 1000, ratio: 0.05 },
  { group: "stable", available: true, aggregateSuccess: 99, latencyMs: 1000, ratio: 0.2 },
], "stable");
assert.equal(rollbackToPrevious.candidate.group, "stable");
assert.equal(rollbackToPrevious.usedPrevious, true);
const rollbackToAlternative = api.selectRollbackCandidate([
  { group: "cheap", available: true, aggregateSuccess: 99, latencyMs: 1000, ratio: 0.05 },
  { group: "stable", available: false, aggregateSuccess: 99, latencyMs: 1000, ratio: 0.2 },
], "stable");
assert.equal(rollbackToAlternative.candidate.group, "cheap");
assert.equal(rollbackToAlternative.usedPrevious, false);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeSwitchHistory({
    byToken: {
      7: { model: "gpt-test", group: "cheap", at: 1234 },
      invalid: { model: "gpt-test", group: "balanced", at: 5678 },
    },
  }))),
  { byToken: { 7: { model: "gpt-test", group: "cheap", at: 1234 } } },
);
assert.equal(
  api.summarizeTokenGroups([
    { group: "cheap" },
    { group: "balanced" },
    { group: "cheap" },
  ]),
  "3 个密钥 · cheap 2 / balanced 1",
);

assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeUiPositions({
    launcher: { x: 120, y: 80 },
    panel: { x: "bad", y: 10 },
  }))),
  { launcher: { x: 120, y: 80 }, panel: null },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.clampPosition(
    { x: -50, y: 900 },
    800,
    600,
    430,
    500,
  ))),
  { x: 8, y: 92 },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.clampPosition(
    { x: 1000, y: -20 },
    320,
    240,
    430,
    500,
  ))),
  { x: 8, y: 8 },
);

const config = api.sanitizeConfig({
  ...api.DEFAULT_CONFIG,
  model: "gpt-test",
  minSuccessRate: 95,
  minLatestSuccessRate: 95,
  maxMetricAgeMinutes: 120,
  maxLatencySeconds: 60,
});

assert.equal(api.aihubMonitorRange(6), "6h");
assert.equal(api.aihubMonitorRange(24), "24h");
assert.equal(api.aihubMonitorRange(168), "7d");
assert.equal(api.aihubMonitorRange(720), "30d");
assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeAihubToken({
    id: 11,
    name: "codex",
    status: "active",
    group_id: 2,
    group: { id: 2, name: "A002-Pro" },
  }))),
  {
    id: 11,
    name: "codex",
    status: "active",
    group_id: 2,
    group: "A002-Pro",
    groupId: 2,
  },
);

const aihubNow = 2_000_000_000;
const aihubSummary = {
  generatedAt: new Date(aihubNow).toISOString(),
  monitoringActive: true,
  apis: [
    {
      id: "monitor-cheap",
      group_id: 1,
      planType: "cheap",
      enabled: true,
      available: true,
      checkedAt: new Date(aihubNow - 30_000).toISOString(),
      priceMultiplier: 0.05,
      firstTokenLatencyMs: 12_000,
      outputTokensPerSecond: 42,
      successRates: { "24h": 0.994 },
    },
    {
      id: "monitor-balanced",
      group_id: 2,
      planType: "balanced",
      enabled: true,
      available: false,
      checkedAt: new Date(aihubNow - 20_000).toISOString(),
      priceMultiplier: 0.1,
      firstTokenLatencyMs: null,
      outputTokensPerSecond: null,
      successRates: { "24h": 0.998 },
    },
    {
      id: "monitor-recent-bad",
      group_id: 3,
      planType: "recent-bad",
      enabled: true,
      available: true,
      checkedAt: new Date(aihubNow - 10_000).toISOString(),
      priceMultiplier: 0.02,
      firstTokenLatencyMs: 7_000,
      outputTokensPerSecond: 50,
      successRates: { "24h": 0.995 },
    },
    {
      id: "monitor-private",
      group_id: 4,
      planType: "private",
      enabled: true,
      available: true,
      checkedAt: new Date(aihubNow - 10_000).toISOString(),
      priceMultiplier: 0.01,
      firstTokenLatencyMs: 6_000,
      outputTokensPerSecond: 50,
      successRates: { "24h": 1 },
    },
  ],
};
const monitorSeries = (availability) => availability.map((available, index) => [
  aihubNow - (availability.length - index) * 60_000,
  available ? 1 : 0,
  5_000,
  30,
]);
const aihubSeries = {
  seriesByApiId: {
    "monitor-cheap": monitorSeries([true, true, true]),
    "monitor-balanced": monitorSeries([true, true, false]),
    "monitor-recent-bad": monitorSeries([true, false, true]),
    "monitor-private": monitorSeries([true, true, true]),
  },
};
const aihubGroups = [
  { id: 1, name: "cheap", rate_multiplier: 0.05 },
  { id: 2, name: "balanced", rate_multiplier: 0.1 },
  { id: 3, name: "recent-bad", rate_multiplier: 0.02 },
];
const aihubCandidates = api.evaluateAihubCandidates(
  aihubSummary,
  aihubSeries,
  aihubGroups,
  { 1: 0.04 },
  config,
  aihubNow,
);
assert.equal(aihubCandidates.find((item) => item.group === "cheap").available, true);
assert.equal(aihubCandidates.find((item) => item.group === "cheap").ratio, 0.04);
assert.equal(aihubCandidates.find((item) => item.group === "balanced").available, false);
assert.ok(aihubCandidates.find((item) => item.group === "balanced").reasons.includes("latest-unavailable"));
assert.equal(aihubCandidates.find((item) => item.group === "recent-bad").recentMinSuccess, 100);
assert.equal(
  aihubCandidates.find((item) => item.group === "recent-bad").available,
  true,
  "AIHub should only use the most recent bar for recent availability",
);
assert.ok(aihubCandidates.find((item) => item.group === "private").reasons.includes("not-user-selectable"));
assert.equal(api.selectBestCandidate(aihubCandidates, "balanced").group, "recent-bad");

const cappedAihubCandidates = api.evaluateAihubCandidates(
  aihubSummary,
  aihubSeries,
  aihubGroups,
  { 1: 0.04 },
  api.sanitizeConfig({ ...config, maxGroupRatio: 0.03 }),
  aihubNow,
);
assert.ok(cappedAihubCandidates.find((item) => item.group === "cheap").reasons.includes("ratio-too-high"));
assert.equal(api.selectBestCandidate(cappedAihubCandidates, "cheap").group, "recent-bad");

const pricing = {
  data: [{
    model_name: "gpt-test",
    enable_groups: ["cheap", "balanced", "recent-bad", "unstable", "private"],
  }],
  group_ratio: {
    cheap: 0.05,
    balanced: 0.1,
    "recent-bad": 0.02,
    unstable: 0.03,
    private: 0.01,
  },
};
const userGroups = {
  data: {
    cheap: { ratio: 0.05 },
    balanced: { ratio: 0.1 },
    "recent-bad": { ratio: 0.02 },
    unstable: { ratio: 0.03 },
  },
};
const now = 2_000_000;
const series = (successRates) => successRates.map((successRate, index) => ({
  ts: now - (successRates.length - index) * 600,
  success_rate: successRate,
}));
const metrics = {
  data: {
    groups: [
      {
        group: "cheap",
        success_rate: 99.4,
        avg_latency_ms: 12000,
        avg_tps: 42,
        series: series([99, 100, 100]),
      },
      {
        group: "balanced",
        success_rate: 99.8,
        avg_latency_ms: 9000,
        avg_tps: 45,
        series: series([100, 100, 100]),
      },
      {
        group: "recent-bad",
        success_rate: 99.5,
        avg_latency_ms: 7000,
        avg_tps: 50,
        series: series([100, 100, 100, 100, 72, 100]),
      },
      {
        group: "unstable",
        success_rate: 99,
        avg_latency_ms: 8000,
        avg_tps: 48,
        series: series([100, 100, 20]),
      },
      {
        group: "private",
        success_rate: 100,
        avg_latency_ms: 6000,
        avg_tps: 50,
        series: series([100, 100, 100]),
      },
    ],
  },
};

const candidates = api.evaluateCandidates(pricing, metrics, userGroups, config, now);
assert.equal(candidates.find((item) => item.group === "cheap").available, true);
assert.equal(candidates.find((item) => item.group === "balanced").available, true);
assert.equal(candidates.find((item) => item.group === "recent-bad").available, true);
assert.equal(candidates.find((item) => item.group === "recent-bad").recentMinSuccess, 100);
assert.equal(candidates.find((item) => item.group === "unstable").available, false);
assert.ok(
  candidates.find((item) => item.group === "unstable").reasons.includes("latest-success-low"),
);
assert.equal(candidates.find((item) => item.group === "private").available, false);
assert.ok(
  candidates.find((item) => item.group === "private").reasons.includes("not-user-selectable"),
);

assert.equal(api.selectBestCandidate(candidates, "balanced").group, "recent-bad");
assert.equal(api.selectBestCandidate(candidates, "cheap").group, "recent-bad");
assert.equal(
  api.selectSwitchCandidate(candidates, "cheap", "balanced").group,
  "balanced",
  "manual selection should use the requested available group instead of the cheapest group",
);
assert.throws(
  () => api.selectSwitchCandidate(candidates, "cheap", "unstable"),
  /目标分组 unstable 当前不可用：.*最新成功率不足/,
);
assert.throws(
  () => api.selectSwitchCandidate(candidates, "cheap", "missing"),
  /不在当前模型的可选范围内/,
);
assert.equal(api.shouldSwitchCandidate(candidates.find((item) => item.group === "cheap"), "cheap"), false);
assert.equal(api.shouldSwitchCandidate(candidates.find((item) => item.group === "balanced"), "cheap"), true);

const allowListConfig = api.sanitizeConfig({ ...config, allowedGroups: ["balanced"] });
const allowListCandidates = api.evaluateCandidates(pricing, metrics, userGroups, allowListConfig, now);
assert.equal(api.selectBestCandidate(allowListCandidates, "cheap").group, "balanced");

const cappedCandidates = api.evaluateCandidates(
  pricing,
  metrics,
  userGroups,
  api.sanitizeConfig({ ...config, maxGroupRatio: 0.04 }),
  now,
);
assert.ok(cappedCandidates.find((item) => item.group === "cheap").reasons.includes("ratio-too-high"));
assert.equal(api.selectBestCandidate(cappedCandidates, "cheap").group, "recent-bad");
assert.throws(
  () => api.selectSwitchCandidate(cappedCandidates, "recent-bad", "cheap"),
  /超过倍率上限/,
);

const token = {
  id: 7,
  name: "codex",
  remain_quota: 123,
  expired_time: -1,
  unlimited_quota: false,
  model_limits_enabled: true,
  model_limits: "gpt-test,gpt-other",
  allow_ips: "",
  cross_group_retry: true,
};
assert.equal(api.tokenSupportsModel(token, "gpt-test"), true);
assert.equal(api.tokenSupportsModel(token, "claude-test"), false);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.buildTokenUpdatePayload(token, "cheap"))),
  {
    id: 7,
    name: "codex",
    remain_quota: 123,
    expired_time: -1,
    unlimited_quota: false,
    model_limits_enabled: true,
    model_limits: "gpt-test,gpt-other",
    allow_ips: "",
    group: "cheap",
    cross_group_retry: false,
  },
);

assert.deepEqual(
  JSON.parse(JSON.stringify(api.buildTokenUpdatePayload({
    ...token,
    unlimited_quota: true,
    remain_quota: 999,
    expired_time: null,
    model_limits: ["gpt-test", "", " gpt-other "],
  }, "balanced"))),
  {
    id: 7,
    name: "codex",
    remain_quota: 0,
    expired_time: -1,
    unlimited_quota: true,
    model_limits_enabled: true,
    model_limits: "gpt-test,gpt-other",
    allow_ips: "",
    group: "balanced",
    cross_group_retry: false,
  },
);

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() {
    return payload;
  },
});

let getAttempts = 0;
const recovered = await api.requestJsonWithRetry(
  "/api/retry-test",
  { method: "GET", maxAttempts: 3, timeoutMs: 100 },
  {
    fetchImpl: async () => {
      getAttempts += 1;
      if (getAttempts < 3) throw new TypeError("temporary network failure");
      return jsonResponse({ success: true, data: "ok" });
    },
    sleepImpl: async () => {},
  },
);
assert.equal(getAttempts, 3);
assert.equal(recovered.data, "ok");

let putAttempts = 0;
await assert.rejects(
  api.requestJsonWithRetry(
    "/api/token/",
    { method: "PUT", body: { id: 7 }, timeoutMs: 100 },
    {
      fetchImpl: async () => {
        putAttempts += 1;
        throw new TypeError("connection lost");
      },
      sleepImpl: async () => {},
    },
  ),
  /网络请求失败/,
);
assert.equal(putAttempts, 1, "mutations must never retry automatically");

let timeoutAttempts = 0;
await assert.rejects(
  api.requestJsonWithRetry(
    "/api/slow-test",
    { method: "GET", maxAttempts: 2, timeoutMs: 5 },
    {
      fetchImpl: async (_path, request) => {
        timeoutAttempts += 1;
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
      sleepImpl: async () => {},
    },
  ),
  /请求超时（已重试 1 次）/,
);
assert.equal(timeoutAttempts, 2);

let serviceAttempts = 0;
const serviceRecovered = await api.requestJsonWithRetry(
  "/api/service-test",
  { method: "GET", maxAttempts: 3, timeoutMs: 100 },
  {
    fetchImpl: async () => {
      serviceAttempts += 1;
      return serviceAttempts === 1
        ? jsonResponse({ success: false, message: "busy" }, 503)
        : jsonResponse({ success: true, data: "ready" });
    },
    sleepImpl: async () => {},
  },
);
assert.equal(serviceAttempts, 2);
assert.equal(serviceRecovered.data, "ready");

let authAttempts = 0;
await assert.rejects(
  api.requestJsonWithRetry(
    "/api/auth-test",
    { method: "GET", maxAttempts: 3, timeoutMs: 100 },
    {
      fetchImpl: async () => {
        authAttempts += 1;
        return jsonResponse({ success: false, message: "unauthorized" }, 401);
      },
      sleepImpl: async () => {},
    },
  ),
  /unauthorized/,
);
assert.equal(authAttempts, 1, "authentication errors must not retry");

console.log("selection tests passed");
