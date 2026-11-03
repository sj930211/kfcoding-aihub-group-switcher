import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./kfcoding-group-switcher.user.js", import.meta.url), "utf8");
const metadataVersion = source.match(/^\/\/\s*@version\s+([^\s]+)\s*$/m)?.[1] || "";
const runtimeVersion = source.match(/const SCRIPT_VERSION = "([^"]+)";/)?.[1] || "";
const packageVersion = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;
assert.equal(metadataVersion, packageVersion, "the userscript metadata must use the package version");
assert.equal(
  runtimeVersion,
  metadataVersion,
  "the runtime version shown in the panel must match the Tampermonkey metadata version",
);
// v2 retires other-site execution, paid image evaluation, and the old three strategies.
assert.deepEqual(source.split('\n').filter(line=>line.startsWith('// @match')).map(line=>line.trim().split(/\s+/).at(-1)), ['https://aihub.top/*']);
for (const removed of ['imageQualityEnabled','prepareAutomaticImageAdmission','selectImageQualifiedCandidate','/v1/responses','imageQualityKeyId']) {
  assert.equal(source.includes(removed), false, 'retired image evaluation must not ship: '+removed);
}
const sandbox = {
  __KFCODING_GROUP_SWITCHER_TEST__: true,
  AbortController,
  DOMException,
  clearTimeout,
  console,
  setTimeout,
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: "kfcoding-group-switcher.user.js" });

const api = sandbox.__KFCODING_GROUP_SWITCHER_API__;
assert.ok(api, "test API should be exposed");
assert.equal(api.extractUserscriptVersion(source), packageVersion);
// AIHub-only startup must leave every other site's storage and document untouched.
for (const hostname of ['kfcoding.codes', 'ooioo.work', 'fluxionai.space', 'unrelated.example']) {
  const stored = new Map([['sentinel', 'unchanged']]); let reads = 0, writes = 0, requests = 0;
  const disabledSite = {
    location: { hostname },
    GM_getValue() { reads++; throw Error('unsupported site read storage'); },
    GM_setValue() { writes++; throw Error('unsupported site wrote storage'); },
    fetch() { requests++; throw Error('unsupported site requested network'); },
    document: new Proxy({}, { get() { throw Error('unsupported site touched document'); } }),
  };
  vm.runInNewContext(source, disabledSite);
  assert.deepEqual([reads, writes, requests], [0, 0, 0], hostname + ' must be inert');
  assert.equal(stored.get('sentinel'), 'unchanged');
}
// Retain the public-provider fallback contract without treating legacy data as new-algorithm evidence.
const publicProviderPaths = [];
const providerLoad = await api.loadAihubMonitorData(async path => {
  publicProviderPaths.push(path);
  if (path.startsWith('/api/v2/public/providers?')) return { version: 2, generated_at: '2026-11-02T00:00:00Z', summary_range: '1h', items: [{ group_id: 1, code: 'fixture', rate_multiplier: 1 }] };
  if (path.startsWith('/api/v2/public/providers/series?')) throw Error('simulated series unavailable');
  if (path === '/api/v1/groups/available') return [{ id: 1, name: 'fixture' }];
  if (path === '/api/v1/groups/rates') return { 1: .8 };
  throw Error('unexpected public path ' + path);
}, '24h', 'Asia/Shanghai');
assert.equal(providerLoad.providerVersion, 2);
assert.match(String(providerLoad.seriesError), /simulated series unavailable/);
assert.equal(providerLoad.summary.apis[0].group_id, 1);
assert.equal(publicProviderPaths.some(path => path.startsWith('/api/v1/public/providers?')), false, 'series-only errors never downgrade a working v2 provider response');
const fallbackPaths = [];
const fallbackLoad = await api.loadAihubMonitorData(async path => {
  fallbackPaths.push(path);
  if (path.startsWith('/api/v2/public/providers?') || path.startsWith('/api/v1/public/providers?')) throw Error('simulated provider unavailable');
  if (path === '/api/v1/public/monitor/summary') return { apis: [{ group_id: 1, planType: 'legacy' }] };
  if (path === '/api/v1/groups/available') return [{ id: 1, name: 'legacy' }];
  if (path === '/api/v1/groups/rates') return { 1: 1 };
  throw Error('unexpected fallback path ' + path);
}, undefined, 'Asia/Shanghai');
assert.equal(fallbackLoad.source, 'legacy');
assert.ok(fallbackPaths.some(path => path.startsWith('/api/v2/public/providers?')));
assert.ok(fallbackPaths.some(path => path.startsWith('/api/v1/public/providers?')));
assert.equal(api.evaluateAihubCandidates(fallbackLoad.summary, {}, fallbackLoad.groups, fallbackLoad.rates, api.sanitizeConfig({ models: ['fixture'] }), Date.now())[0].available, false, 'legacy fallback can display data but never substitutes for required v2 details');
// Upstream detection media remains display-only and accepts only public artifact paths.
const safeArtifact = '/api/v1/public/model-detection-artifacts/fixture_123';
assert.equal(api.normalizeAihubDetectionMedia({ detection_media: { presentation: { image: { status: 'successful', url: safeArtifact } } } }).url, 'https://aihub.top' + safeArtifact);
for (const url of ['javascript:alert(1)', 'data:image/svg+xml,test', '//other.test/image', 'https://other.test/image', safeArtifact + '/../private', '/api/v1/keys']) {
  assert.equal(api.normalizeAihubDetectionMedia({ detection_media: { presentation: { image: { status: 'successful', url } } } }).url, '', 'non-artifact media must be rejected');
}
assert.equal(api.normalizeAihubDetectionMedia({ detection_media: { presentation: { image: { status: 'failed', url: safeArtifact } } } }).url, '', 'failed media never exposes stale images');
const usageNow = new Date(2026, 8, 17, 12, 0, 0);
const todayUsageNow = new Date(2026, 8, 17, 11, 20, 0);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.aihubUsageDateDomain(7, usageNow))),
  ["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"],
  "AIHub statistics should use a continuous browser-local natural-day domain",
);
assert.equal(api.normalizeAihubStatisticsDays(1), 1);
assert.equal(api.normalizeAihubStatisticsDays(undefined), 1, "missing saved range should default to today");
assert.equal(api.normalizeAihubStatisticsRange("today"), "today");
assert.equal(api.normalizeAihubStatisticsRange(1), "today", "legacy numeric today range should migrate to today");
assert.equal(api.normalizeAihubStatisticsRange("yesterday"), "yesterday");
assert.equal(api.normalizeAihubStatisticsRange(7), "7");
assert.deepEqual(
  JSON.parse(JSON.stringify(api.aihubUsageDateDomain(1, usageNow))),
  ["2026-09-17"],
  "today key statistics should use one browser-local natural day",
);
assert.equal(api.aihubUsageHourDomain(todayUsageNow).length, 11);
assert.equal(api.aihubUsageHourDomain(todayUsageNow)[0], "2026-09-17T00:00");
assert.equal(api.aihubUsageHourDomain(todayUsageNow)[10], "2026-09-17T10:00");
assert.equal(api.statisticsTrendPointLabel("2026-09-17T00:00", "hour"), "01:00");
assert.equal(api.statisticsTrendPointLabel("2026-09-17T10:00", "hour"), "11:00");
assert.equal(api.statisticsTrendPointLabel("2026-09-17T23:00", "hour"), "24:00", "the final hourly bucket must not wrap to an ambiguous 00:00 label");
const chartWidth = api.statisticsTrendChartLayout(24, 432, "hour").width;
assert.equal(chartWidth > 432, true, "all 24 hourly points should use a scrollable plot instead of shrinking into one viewport");
assert.equal(chartWidth < 2000, true, "the hourly plot should initially show roughly five or six hours");
assert.equal(api.statisticsTrendChartLayout(4, 300, "hour").width, 300, "a short series should fit the narrow viewport");
assert.equal(api.statisticsTrendChartLayout(30, 300, "day").width, 432, "multi-day trends should retain their existing plot layout");
assert.equal(api.statisticsTrendScrollLeft(0, 432, 432, false, chartWidth, 432), chartWidth - 432, "the initial hourly plot should open at the latest hours");
assert.equal(api.statisticsTrendScrollLeft(80, 1600, 432, true, 1700, 432), 80, "a refresh should preserve an earlier scroll position");
assert.equal(api.statisticsTrendScrollLeft(1168, 1600, 432, true, 1700, 432), 1268, "a refresh should follow the latest point when already at the right edge");
assert.deepEqual(Array.from(api.aihubUsageHourDomain(new Date(2026, 8, 17, 0, 20, 0))), ["2026-09-17T00:00"]);
assert.equal(api.aihubUsageHourDomain(new Date(2026, 8, 22, 11, 20, 0), "yesterday").length, 24);
assert.equal(api.aihubUsageHourDomain(new Date(2026, 8, 22, 11, 20, 0), "yesterday")[0], "2026-09-21T00:00");
assert.equal(api.aihubUsageHourDomain(new Date(2026, 8, 22, 11, 20, 0), "yesterday")[23], "2026-09-21T23:00");
assert.deepEqual(
  JSON.parse(JSON.stringify(api.aihubUsageRange("yesterday", new Date(2026, 8, 22, 11, 20, 0)))),
  {
    range: "yesterday",
    days: 1,
    keyApiDays: 2,
    hourly: true,
    domain: Array.from({ length: 24 }, (_, hour) => `2026-09-21T${String(hour).padStart(2, "0")}:00`),
    keyDomain: ["2026-09-21"],
  },
  "yesterday should use the previous local natural day and complete hourly domain",
);
assert.equal(api.normalizeAihubStatisticsDays(5), 1);
assert.equal(api.normalizeAihubStatisticsDays(7), 7);
assert.equal(api.normalizeAihubStatisticsDays(14), 14);
assert.equal(api.normalizeAihubStatisticsDays(30), 30);
assert.equal(api.normalizeAihubStatisticsMetric("requests"), "requests");
assert.equal(api.normalizeAihubStatisticsMetric("tokens"), "tokens");
assert.equal(api.normalizeAihubStatisticsMetric("cost"), "spend");

const usageDomain = api.aihubUsageDateDomain(7, usageNow);
const accountUsageSeries = api.normalizeAihubUsageSeries({
  items: [
    { date: "2026-09-11", requests: 2, total_tokens: 200, cost: 9, actual_cost: 1.2 },
    { date: "2026-09-13", requests: 3, total_tokens: 300, cost: 8, actual_cost: 0.8 },
  ],
}, usageDomain);
assert.equal(accountUsageSeries.length, 7, "missing AIHub usage dates should be zero-filled");
assert.deepEqual(
  JSON.parse(JSON.stringify(accountUsageSeries[1])),
  { date: "2026-09-12", present: false, spend: 0, requests: 0, tokens: 0 },
  "a genuinely absent natural day should become a zero point",
);
assert.equal(accountUsageSeries[0].spend, 1.2, "actual_cost must be used instead of the standard cost field");
assert.equal(api.sumAihubUsageMetric(accountUsageSeries, "spend").value, 2);
assert.equal(api.sumAihubUsageMetric(accountUsageSeries, "requests").value, 5);
assert.equal(api.sumAihubUsageMetric(accountUsageSeries, "tokens").value, 500);
assert.equal(api.sumAihubUsageMetric([], "spend").available, false, "a failed account request with no normalized date domain is unavailable, not zero usage");
const driftedUsageSeries = api.normalizeAihubUsageSeries({
  items: [{ date: "2026-09-11", requests: 1, total_tokens: 10, cost: 3 }],
}, usageDomain);
assert.equal(api.sumAihubUsageMetric(driftedUsageSeries, "spend").available, false, "a present row without actual_cost is contract drift, not zero spend");
assert.equal(
  api.sumAihubUsageMetric(api.normalizeAihubUsageSeries({}, usageDomain), "spend").available,
  false,
  "an unrecognized response envelope should be contract drift rather than an empty billing period",
);

const completeKeyUsage = [
  {
    id: 2,
    name: "secondary",
    status: "success",
    series: api.normalizeAihubUsageSeries({ items: [{ date: "2026-09-11", requests: 1, total_tokens: 80, actual_cost: 0.5 }] }, usageDomain),
  },
  {
    id: 1,
    name: "primary",
    status: "success",
    series: api.normalizeAihubUsageSeries({ items: [{ date: "2026-09-11", requests: 1, total_tokens: 120, actual_cost: 1 }] }, usageDomain),
  },
];
const spendReconciliation = api.reconcileAihubUsage(accountUsageSeries, completeKeyUsage, "spend");
assert.equal(spendReconciliation.accountTotal, 2);
assert.equal(spendReconciliation.assignedTotal, 1.5);
assert.equal(spendReconciliation.remainder, 0.5);
assert.equal(spendReconciliation.coverage, 0.75);
assert.equal(spendReconciliation.complete, true);
assert.equal(spendReconciliation.anomaly, false);
assert.deepEqual(
  JSON.parse(JSON.stringify(spendReconciliation.keys.map(({ id, value }) => ({ id, value })))),
  [{ id: 1, value: 1 }, { id: 2, value: 0.5 }],
  "all current keys should be sorted by the active metric without truncation",
);
const partialReconciliation = api.reconcileAihubUsage(accountUsageSeries, [
  completeKeyUsage[0],
  { id: 3, name: "failed", status: "error", error: "429" },
], "spend");
assert.equal(partialReconciliation.complete, false);
assert.equal(partialReconciliation.failedCount, 1);
assert.equal(partialReconciliation.coverage, null, "partial key data must not claim exact coverage");
assert.equal(partialReconciliation.remainder, null, "partial key data must not claim exact unallocated usage");
const anomalyReconciliation = api.reconcileAihubUsage(
  api.normalizeAihubUsageSeries({ items: [{ date: "2026-09-11", requests: 1, total_tokens: 10, actual_cost: 0.5 }] }, usageDomain),
  completeKeyUsage,
  "spend",
);
assert.equal(anomalyReconciliation.anomaly, true, "key totals above the account total should be reported as a reconciliation anomaly");
assert.equal(anomalyReconciliation.coverage > 1, true, "anomalies must not be silently capped at 100 percent");
const emptyReconciliation = api.reconcileAihubUsage(
  api.normalizeAihubUsageSeries({ items: [] }, usageDomain),
  [],
  "spend",
);
assert.equal(emptyReconciliation.empty, true, "zero account and zero key usage should render as an empty state");

const paginationCalls = [];
const allUsageKeys = await api.loadAllAihubKeys(async (path) => {
  paginationCalls.push(path);
  return path.includes("page=1")
    ? { items: [{ id: 1, name: "first" }, { id: 2, name: "second" }], total: 3, page: 1, page_size: 2 }
    : { items: [{ id: 3, name: "third" }], total: 3, page: 2, page_size: 2 };
}, 2);
assert.deepEqual(JSON.parse(JSON.stringify(allUsageKeys.map(({ id, name }) => ({ id, name })))), [
  { id: 1, name: "first" },
  { id: 2, name: "second" },
  { id: 3, name: "third" },
]);
assert.equal(paginationCalls.length, 2, "statistics should load every owned-key page");

let activeUsageLoads = 0;
let maximumUsageLoads = 0;
const boundedResults = await api.mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
  activeUsageLoads += 1;
  maximumUsageLoads = Math.max(maximumUsageLoads, activeUsageLoads);
  await new Promise((resolve) => setTimeout(resolve, 1));
  activeUsageLoads -= 1;
  return value * 2;
});
assert.deepEqual(JSON.parse(JSON.stringify(boundedResults)), [2, 4, 6, 8, 10]);
assert.equal(maximumUsageLoads <= 2, true, "per-key daily usage requests should use bounded concurrency");
const statisticsPaths = [];
const loadedStatistics = await api.loadAihubUsageStatistics(async (path) => {
  statisticsPaths.push(path);
  if (path.startsWith("/api/v1/usage/dashboard/trend?")) {
    return { items: [{ date: "2026-09-17", requests: 5, total_tokens: 500, actual_cost: 1.25 }] };
  }
  if (path === "/api/v1/keys?page=1&page_size=100") {
    return { items: [{ id: 9, name: "usage-key" }], total: 1 };
  }
  if (path === "/api/v1/user/api-keys/9/usage/daily?days=7&timezone=Asia%2FShanghai") {
    return { items: [{ date: "2026-09-17", requests: 3, total_tokens: 300, actual_cost: 0.75 }] };
  }
  throw new Error(`unexpected path ${path}`);
}, { days: 7, timezone: "Asia/Shanghai", now: usageNow, concurrency: 3 });
assert.equal(loadedStatistics.accountError, "");
assert.equal(loadedStatistics.keysError, "");
assert.equal(loadedStatistics.accountSeries.length, 7);
assert.equal(loadedStatistics.keyResults[0].status, "success");
assert.equal(
  statisticsPaths[0],
  "/api/v1/usage/dashboard/trend?start_date=2026-09-11&end_date=2026-09-17&granularity=day&timezone=Asia%2FShanghai",
  "account and per-key statistics should share one explicit browser timezone and natural-day window",
);
assert.equal(statisticsPaths.some((path) => path.includes("api-keys-usage")), false, "the rolling batch endpoint should not be requested");
const failedKeyStatistics = await api.loadAihubUsageStatistics(async (path) => {
  if (path.startsWith("/api/v1/usage/dashboard/trend?")) {
    return { items: [{ date: "2026-09-17", requests: 1, total_tokens: 10, actual_cost: 0.1 }] };
  }
  if (path === "/api/v1/keys?page=1&page_size=100") return { items: [{ id: 10, name: "failed-key" }], total: 1 };
  throw new Error("429 rate limited");
}, { days: 7, timezone: "Asia/Shanghai", now: usageNow });
assert.equal(failedKeyStatistics.accountError, "", "a key failure must not discard a valid account trend");
assert.equal(failedKeyStatistics.keyResults[0].status, "error");
const cachedKeyPaths = [];
await api.loadAihubUsageStatistics(async (path) => {
  cachedKeyPaths.push(path);
  if (path.startsWith("/api/v1/usage/dashboard/trend?")) {
    return { items: [{ date: "2026-09-17", requests: 1, total_tokens: 10, actual_cost: 0.1 }] };
  }
  if (path === "/api/v1/user/api-keys/12/usage/daily?days=7&timezone=Asia%2FShanghai") {
    return { items: [{ date: "2026-09-17", requests: 1, total_tokens: 10, actual_cost: 0.1 }] };
  }
  throw new Error(`unexpected cached-key path ${path}`);
}, { days: 7, timezone: "Asia/Shanghai", now: usageNow, keys: [{ id: 12, name: "cached-key" }] });
assert.equal(cachedKeyPaths.some((path) => path === "/api/v1/keys?page=1&page_size=100"), false, "statistics should reuse the loaded key catalog");
const todayStatisticsPaths = [];
const todayStatistics = await api.loadAihubUsageStatistics(async (path) => {
  todayStatisticsPaths.push(path);
  if (path.startsWith("/api/v1/usage/dashboard/trend?")) {
    if (path.includes("granularity=day")) {
      return { items: [{ date: "2026-09-17", requests: 4, total_tokens: 40, actual_cost: 0.6 }] };
    }
    return { items: [
      { date: "2026-09-17T00:00:00", requests: 1, total_tokens: 10, actual_cost: 0.1 },
      { date: "2026-09-17T10:00:00", requests: 3, total_tokens: 30, actual_cost: 0.3 },
    ] };
  }
  if (path === "/api/v1/keys?page=1&page_size=100") return { items: [{ id: 11, name: "today-key" }], total: 1 };
  if (path === "/api/v1/user/api-keys/11/usage/daily?days=1&timezone=Asia%2FShanghai") {
    return { items: [{ date: "2026-09-17", requests: 4, total_tokens: 40, actual_cost: 0.4 }] };
  }
  throw new Error(`unexpected today path ${path}`);
}, { days: 1, timezone: "Asia/Shanghai", now: todayUsageNow, concurrency: 3 });
assert.equal(todayStatistics.granularity, "hour");
assert.equal(todayStatistics.accountSeries.length, 11);
assert.equal(todayStatistics.accountSeries[10].requests, 3);
assert.equal(todayStatistics.accountSeries[1].requests, 0);
assert.equal(todayStatistics.accountReconciliationSeries.length, 1);
assert.equal(todayStatistics.accountReconciliationAggregate.value, 0.6);
assert.equal(todayStatisticsPaths.filter((path) => path.startsWith("/api/v1/usage/dashboard/trend?")).length, 2);
assert.equal(
  api.reconcileAihubUsage(todayStatistics.accountReconciliationSeries, todayStatistics.keyResults, "spend").anomaly,
  false,
  "today reconciliation must use the complete daily account aggregate instead of the partial hourly chart",
);
assert.equal(
  todayStatisticsPaths[0],
  "/api/v1/usage/dashboard/trend?start_date=2026-09-17&end_date=2026-09-17&granularity=hour&timezone=Asia%2FShanghai",
  "today account statistics should use one date boundary with hourly granularity",
);
const yesterdayStatisticsPaths = [];
const yesterdayStatistics = await api.loadAihubUsageStatistics(async (path) => {
  yesterdayStatisticsPaths.push(path);
  if (path.startsWith("/api/v1/usage/dashboard/trend?")) {
    if (path.includes("granularity=day")) {
      return { items: [{ date: "2026-09-16", requests: 24, total_tokens: 240, actual_cost: 2.4 }] };
    }
    return { items: Array.from({ length: 24 }, (_, hour) => ({
      date: `2026-09-16T${String(hour).padStart(2, "0")}:00:00`,
      requests: 1,
      total_tokens: 10,
      actual_cost: 0.1,
    })) };
  }
  if (path === "/api/v1/keys?page=1&page_size=100") return { items: [{ id: 13, name: "yesterday-key" }], total: 1 };
  if (path === "/api/v1/user/api-keys/13/usage/daily?days=2&timezone=Asia%2FShanghai") {
    return { items: [
      { date: "2026-09-16", requests: 20, total_tokens: 200, actual_cost: 2 },
      { date: "2026-09-17", requests: 99, total_tokens: 990, actual_cost: 9.9 },
    ] };
  }
  throw new Error(`unexpected yesterday path ${path}`);
}, { range: "yesterday", timezone: "Asia/Shanghai", now: todayUsageNow, concurrency: 3 });
assert.equal(yesterdayStatistics.range, "yesterday");
assert.equal(yesterdayStatistics.granularity, "hour");
assert.equal(yesterdayStatistics.accountSeries.length, 24, "yesterday should expose every completed hour");
assert.deepEqual(
  JSON.parse(JSON.stringify(yesterdayStatistics.keyResults[0].series)),
  [{ date: "2026-09-16", present: true, spend: 2, requests: 20, tokens: 200 }],
  "yesterday key usage should exclude today's row returned by the rolling daily endpoint",
);
assert.equal(yesterdayStatistics.accountReconciliationSeries[0].date, "2026-09-16");
assert.equal(
  yesterdayStatisticsPaths[0],
  "/api/v1/usage/dashboard/trend?start_date=2026-09-16&end_date=2026-09-16&granularity=hour&timezone=Asia%2FShanghai",
  "yesterday account statistics should use the previous local natural day",
);
assert.equal(
  api.reconcileAihubUsage(yesterdayStatistics.accountReconciliationSeries, yesterdayStatistics.keyResults, "spend").anomaly,
  false,
  "yesterday reconciliation should compare the same historical day for account and key usage",
);
assert.equal(source.includes("/api/v1/usage/dashboard/api-keys-usage"), false, "the limited batch endpoint must not become the statistics data source");
assert.equal(fs.readFileSync(new URL("./src/statistics/usage.js", import.meta.url), "utf8").includes("Authorization:"), false, "statistics diagnostics must not persist or print authorization credentials");
assert.equal(source.includes(".slice(0, 8)"), false, "the channel status table must not truncate the evaluated groups");
assert.equal(api.normalizeAihubModelKey("gpt-5.6-sol"), "sol");
assert.equal(api.normalizeAihubModelKey("Terra"), "terra");
assert.equal(api.effectiveRatioReasonLabel("runtime_window_not_ready"), "统计窗口未就绪");
assert.equal(api.effectiveRatioReasonLabel("insufficient_samples"), "样本不足");
assert.equal(api.formatAihubLatency(10648.631), "10,649ms");
assert.equal(api.formatAihubLatency(800), "800ms");
assert.equal(api.formatAihubLatency(NaN), "-");
assert.equal(
  api.effectiveRatioReasonLabel("provider_recalibrating"),
  "provider_recalibrating",
  "unknown non-empty platform reasons should remain visible",
);
assert.equal(
  api.aihubModelHealthStatus({ model_health: { Sol: "HEALTHY" } }, "gpt-5.6-sol"),
  "healthy",
);
const normalizedDetection=api.normalizeAihubModelDetection({applicable:true,status:'SUSPECTED',model:'gpt-5.6-sol',execution_complete:true,all_targets_passed:false,expires_at:'2026-09-16T16:10:21+08:00'});
assert.equal(normalizedDetection.applicable,true);assert.equal(normalizedDetection.status,'suspected');assert.equal(normalizedDetection.model,'gpt-5.6-sol');assert.equal(normalizedDetection.executionComplete,true);assert.equal(normalizedDetection.allTargetsPassed,false);assert.equal(normalizedDetection.expiresAtMs,Date.parse('2026-09-16T16:10:21+08:00'));
assert.equal(api.detectSiteId("kfcoding.codes"), "kfcoding");
assert.equal(api.detectSiteId("AIHUB.TOP"), "aihub");
assert.equal(api.detectSiteId("ooioo.work"), "ooioo");
assert.equal(api.detectSiteId("FLUXIONAI.SPACE"), "fluxionai");
assert.equal(api.SITE_METADATA.ooioo.apiFamily, "new-api");
assert.equal(api.SITE_METADATA.ooioo.shortLabel, "OO");
assert.equal(api.SITE_METADATA.fluxionai.apiFamily, "aihub");
assert.equal(api.SITE_METADATA.fluxionai.shortLabel, "FX");
assert.equal(
  new Set(["kfcoding", "aihub", "ooioo", "fluxionai"].map(api.storagePrefixForSite)).size,
  4,
  "each provider must keep configuration, logs, UI state, and switch guards isolated",
);
assert.equal(api.storagePrefixForSite("ooioo"), "ooioo-group-switcher");
assert.equal(api.storagePrefixForSite("fluxionai"), "fluxionai-group-switcher");
assert.equal(api.extractUserscriptVersion("// no version"), "");
assert.equal(api.compareVersions("0.4.5", "0.4.4"), 1);
assert.equal(api.compareVersions("v1.0.0", "1.0"), 0);
assert.equal(api.compareVersions("0.4.4", "0.4.5"), -1);
assert.equal(api.compareVersions("0.11.0", "0.9.9"), 1);
assert.equal(api.compareVersions("0.16.0", "0.15.11"), 1);
assert.equal(api.compareVersions("0.16.1", "0.16.0"), 1);
assert.equal(api.compareVersions("0.16.10", "0.16.9"), 1);
assert.equal(api.compareVersions("0.17.0", "0.16.99"), 1);
assert.equal(api.compareVersions("1.0.0", "0.99.99"), 1);
assert.equal(api.extractUserscriptVersion("// @version 0.16.0-beta.1"), "");
assert.equal(api.extractUserscriptVersion("// @version 0.016.0"), "");
assert.equal(api.compareVersions("0.16.0-beta.1", "0.15.11"), 0);
assert.equal(api.compareVersions("broken", "0.15.11"), 0);
assert.equal(api.DEFAULT_CONFIG.theme, "system");
assert.equal(api.DEFAULT_CONFIG.glassTransparency, 0);
assert.equal(api.sanitizeConfig({ theme: "light" }).theme, "light");
assert.equal(api.sanitizeConfig({ theme: "dark" }).theme, "dark");
assert.equal(api.sanitizeConfig({ theme: "unknown" }).theme, "system");
assert.equal(api.sanitizeConfig({ glassTransparency: 35 }).glassTransparency, 35);
assert.equal(api.sanitizeConfig({ glassTransparency: -1 }).glassTransparency, 0);
assert.equal(api.sanitizeConfig({ glassTransparency: 101 }).glassTransparency, 100);
assert.equal(api.sanitizeConfig({ glassTransparency: "invalid" }).glassTransparency, 0);
assert.equal(
  api.resolveGlassMaterial("dark", 60),
  "linear-gradient(135deg, rgb(31 37 45 / 49%), rgb(13 17 22 / 38%))",
);
assert.equal(
  api.resolveGlassMaterial("light", 60),
  "linear-gradient(135deg, rgb(255 255 255 / 62%), rgb(235 240 244 / 48%))",
);
assert.equal(
  api.resolveGlassMaterial("dark", 0),
  "linear-gradient(135deg, rgb(31 37 45 / 100%), rgb(13 17 22 / 100%))",
);
assert.equal(
  api.resolveGlassMaterial("dark", 100),
  "linear-gradient(135deg, rgb(31 37 45 / 20%), rgb(13 17 22 / 12%))",
);
assert.equal(api.resolveThemeMode("system", true), "dark");
assert.equal(api.resolveThemeMode("system", false), "light");
assert.equal(api.resolveThemeMode("light", true), "light");
assert.equal(api.normalizeActiveView("settings"), "settings");
assert.equal(api.DEFAULT_CONFIG.selectionMode, "quality");
assert.equal(api.DEFAULT_CONFIG.requireModelDetection, true);
assert.equal(api.DEFAULT_CONFIG.switchHoldMinutes, 10);
assert.equal(api.sanitizeConfig({ requireModelDetection: true }).requireModelDetection, true);
assert.equal(api.sanitizeConfig({ requireModelDetection: false }).requireModelDetection, true);
assert.equal(api.sanitizeConfig({ cooldownMinutes: 25 }).switchHoldMinutes, 25, "legacy cooldown should migrate to switch hold");
assert.equal(api.sanitizeConfig({ cooldownMinutes: 25, switchHoldMinutes: 40 }).switchHoldMinutes, 40, "the explicit hold setting should win after migration");
const activeHold = api.switchHoldState(
  { byToken: { 7: { model: "gpt-5.6-sol", group: "A001", at: 1_000 } } },
  7,
  "gpt-5.6-sol",
  "A001",
  10,
  301_000,
);
assert.equal(activeHold.tracked, true);
assert.equal(activeHold.remainingMs, 300_000);
assert.equal(activeHold.expired, false);
assert.equal(api.shouldKeepCurrentDuringHold({ available: true }, activeHold), true);
assert.equal(api.shouldKeepCurrentDuringHold({ available: false }, activeHold), false, "an unhealthy current channel must bypass the hold");
const expiredHold = api.switchHoldState(
  { byToken: { 7: { model: "gpt-5.6-sol", group: "A001", at: 1_000 } } },
  7,
  "gpt-5.6-sol",
  "A001",
  10,
  601_001,
);
assert.equal(expiredHold.tracked, true);
assert.equal(expiredHold.remainingMs, 0);
assert.equal(expiredHold.expired, true);
assert.equal(api.shouldKeepCurrentDuringHold({ available: true }, expiredHold), false, "an expired hold must restore strategy switching");
assert.equal(
  api.switchHoldState(
    { byToken: { 7: { model: "gpt-5.6-sol", group: "A001", at: 1_000 } } },
    7,
    "gpt-5.6-terra",
    "A001",
    10,
    2_000,
  ).tracked,
  false,
  "another target-model selection must not inherit an old hold",
);
assert.equal(api.sanitizeConfig({ selectionMode: "stable" }).selectionMode, "quality");
assert.equal(api.sanitizeConfig({ selectionMode: "balanced" }).selectionMode, "quality");
assert.equal(api.sanitizeConfig({ selectionMode: "unknown" }).selectionMode, "quality");
assert.equal(api.sanitizeConfig({ spendProtectionEnabled: true }).spendProtectionEnabled, true);
assert.equal(api.sanitizeConfig({ dailySpendLimit: 12.5 }).dailySpendLimit, 12.5);
assert.equal(api.sanitizeConfig({ dailySpendLimit: -1 }).dailySpendLimit, 0);

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
assert.deepEqual(
  JSON.parse(JSON.stringify(api.sanitizeConfig({ model: "gpt-5.6-sol" }).models)),
  ["gpt-5.6-sol"],
  "legacy single-model configuration should migrate automatically",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.sanitizeConfig({
    model: "legacy-ignored-when-models-exist",
    models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-sol", "", null],
  }).models)),
  ["gpt-5.6-sol", "gpt-5.6-terra"],
  "multiple target models should be deduplicated without inventing empty values",
);
assert.equal(api.sanitizeConfig({ models: ["gpt-5.6-sol", "gpt-5.6-terra"] }).model, "gpt-5.6-sol");
assert.deepEqual(
  JSON.parse(JSON.stringify(api.targetModels({ model: "gpt-5.6-sol" }))),
  ["gpt-5.6-sol"],
  "runtime helpers should remain compatible with unsanitized legacy config",
);
assert.equal(
  api.targetModelIdentity({ models: ["gpt-5.6-terra", "gpt-5.6-sol"] }),
  api.targetModelIdentity({ models: ["gpt-5.6-sol", "gpt-5.6-terra"] }),
  "selection order should not reset hold or rollback protection",
);

assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG }).rollbackChecks, 2);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, rollbackChecks: 0 }).rollbackChecks, 0);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, rollbackChecks: 99 }).rollbackChecks, 10);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG }).blacklistMinutes, 60);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, blacklistMinutes: 0 }).blacklistMinutes, 1);
const migratedLatencyConfig = api.sanitizeConfig({ maxLatencySeconds: 60, minThroughput: 20 });
assert.equal(migratedLatencyConfig.maxFirstTokenLatencySeconds, 60);
assert.equal(migratedLatencyConfig.maxOutputDurationSeconds, 0);
assert.equal(
  api.sanitizeConfig({ maxOutputLatencySeconds: 0.025 }).maxOutputDurationSeconds,
  0,
  "legacy per-token latency must not be reused as a full-output duration",
);
assert.equal(api.sanitizeConfig({ maxOutputDurationSeconds: 12.5 }).maxOutputDurationSeconds, 12.5);
const migratedGroupFilter = api.sanitizeConfig({ allowedGroups: ["cheap", "balanced"] });
assert.equal(migratedGroupFilter.groupFilterMode, "whitelist");
assert.deepEqual(
  JSON.parse(JSON.stringify(migratedGroupFilter.groupWhitelist)),
  ["cheap", "balanced"],
  "legacy allowedGroups should migrate to the whitelist",
);
assert.deepEqual(JSON.parse(JSON.stringify(migratedGroupFilter.groupBlacklist)), []);
const migratedBlacklist = api.sanitizeConfig({
  groupFilterMode: "blacklist",
  groupFilterGroups: ["unstable"],
});
assert.deepEqual(JSON.parse(JSON.stringify(migratedBlacklist.groupWhitelist)), []);
assert.deepEqual(JSON.parse(JSON.stringify(migratedBlacklist.groupBlacklist)), ["unstable"]);
const separateGroupFilters = api.sanitizeConfig({
  groupFilterMode: "blacklist",
  groupWhitelist: ["cheap"],
  groupBlacklist: ["unstable"],
});
assert.deepEqual(JSON.parse(JSON.stringify(api.activeGroupFilter(separateGroupFilters))), ["unstable"]);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.activeGroupFilter({ ...separateGroupFilters, groupFilterMode: "whitelist" }))),
  ["cheap"],
);
assert.equal(api.sanitizeConfig({ groupFilterMode: "blacklist" }).groupFilterMode, "blacklist");
assert.equal(api.sanitizeConfig({ groupFilterMode: "unknown" }).groupFilterMode, "whitelist");
assert.equal(api.parsePercentValue("89.25%"), 89.25);
assert.equal(api.parsePercentValue(0.8925), 89.25);
assert.equal(api.parsePercentValue(null), Number.NaN);

const spendGuard = { dateKey: "2026-07-23", baselineSpend: 0, warnedApproaching: false, warnedReached: false };
const approachingSpend = api.evaluateSpendProtection(
  { available: true, spend: 8 },
  { spendProtectionEnabled: true, dailySpendLimit: 10 },
  spendGuard,
  "2026-07-23",
);
assert.equal(approachingSpend.tone, "approaching");
assert.equal(approachingSpend.ratio, 0.8);
assert.equal(
  api.evaluateSpendProtection(
    { available: true, spend: 10 },
    { spendProtectionEnabled: true, dailySpendLimit: 10 },
    spendGuard,
    "2026-07-23",
  ).tone,
  "reached",
);
assert.equal(
  api.evaluateSpendProtection(
    { available: true, spend: 8 },
    { spendProtectionEnabled: true, dailySpendLimit: 10 },
    { ...spendGuard, baselineSpend: 6 },
    "2026-07-23",
  ).tone,
  "normal",
  "resetting should count only spend after the new baseline",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeSpendGuard(spendGuard, "2026-07-24"))),
  { dateKey: "2026-07-24", baselineSpend: 0, warnedApproaching: false, warnedReached: false },
  "a new local day should reset the spend baseline and alert flags",
);

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
  JSON.parse(JSON.stringify(api.normalizeNewApiTodayUsage({
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
assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeNewApiTodayUsage({
    data: [
      { quota: 40000, count: 4, token_used: 2_400_000 },
      { quota: 10000, count: 1, token_used: 600_000 },
    ],
  }, {
    data: { display_in_currency: true, quota_per_unit: 500000, quota_display_type: "CNY" },
  }, {
    data: { quota: 2_500_000 },
  }))),
  { balance: 5, spend: 0.1, requests: 5, tokens: 3_000_000, symbol: "¥" },
  "ooioo should reuse the verified New API usage shape and currency conversion",
);
const ooiooTokenItems = [
  { id: 17, name: "primary", status: 1, group: "codex-plus", model_limits: "gpt-5.6-terra" },
];
assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeNewApiTokenList({
    success: true,
    data: { page: 1, page_size: 100, total: 1, items: ooiooTokenItems },
  }))),
  ooiooTokenItems,
  "ooioo token catalogs should parse the paginated New API response without reading key values",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.unwrapUserGroups({
    success: true,
    data: {
      "codex-plus": { desc: "Plus pool", ratio: 0.08 },
      "codex-pro": { desc: "Pro pool", ratio: 0.2 },
    },
  }))),
  {
    "codex-plus": { desc: "Plus pool", ratio: 0.08 },
    "codex-pro": { desc: "Pro pool", ratio: 0.2 },
  },
  "ooioo group catalogs should preserve account-selectable group ratios",
);

assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeAihubToken({
    id: 7971,
    name: "codex",
    status: "active",
    group_id: 2,
    group: { id: 2, name: "GPT-Plus-余额", rate_multiplier: 0.1 },
  }))),
  {
    id: 7971,
    name: "codex",
    status: "active",
    group_id: 2,
    group: "GPT-Plus-余额",
    groupId: 2,
  },
  "FluxionAI key rows should reuse the verified AIHub-compatible key normalizer without retaining key values",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeAihubTodayUsage({
    total_actual_cost: 0.1285852,
    total_requests: 22,
    total_tokens: 1_813_958,
  }, { balance: 24.9044443 }))),
  { balance: 24.9044443, spend: 0.1285852, requests: 22, tokens: 1_813_958, symbol: "$" },
  "FluxionAI usage stats should reuse the compatible account usage format",
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
assert.equal(
  api.requiresTokenSelection("ooioo", { manual: true }),
  true,
  "ooioo checks should keep the model and API-key requirements used by New API sites",
);
assert.equal(
  api.requiresTokenSelection("fluxionai", { manual: true }),
  false,
  "FluxionAI immediate checks should refresh monitored groups without requiring a selected API key",
);
assert.equal(api.requiresTokenSelection("fluxionai", { manual: true, forceSwitch: true }), true);
assert.equal(api.requiresTokenSelection("fluxionai", { manual: false }), true);
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
      7: { model: "gpt-test", fromGroup: "stable", toGroup: "cheap", remaining: 2, at: 1000,
        switchAt: 0, lastEvidence: "", seenEvidence: [], initialEvidence: "" },
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
assert.deepEqual(
  JSON.parse(JSON.stringify(api.listActiveIsolations(guardState, 2000))),
  [{ model: "gpt-test", group: "cheap", until: 5000 }],
);
const removedIsolation = api.removeIsolation(guardState, "gpt-test", "cheap", 2000);
assert.equal(removedIsolation.state.blacklist.length, 0);
assert.deepEqual(
  JSON.parse(JSON.stringify(removedIsolation.removed)),
  [{ model: "gpt-test", group: "cheap", until: 5000 }],
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.restoreIsolations(removedIsolation.state, removedIsolation.removed, 2000).blacklist)),
  [{ model: "gpt-test", group: "cheap", until: 5000 }],
);
assert.equal(api.restoreIsolations(removedIsolation.state, removedIsolation.removed, 6000).blacklist.length, 0);
const clearedIsolations = api.removeAllIsolations(guardState, 2000);
assert.equal(clearedIsolations.state.blacklist.length, 0);
assert.equal(clearedIsolations.removed.length, 1);
assert.equal(
  api.applyTemporaryBlacklist([
    { group: "cheap", available: true, reasons: [], ratio: 0.05 },
  ], guardState, "other-model", 2000)[0].available,
  true,
  "blacklists must stay scoped to a model",
);
assert.equal(api.candidateHasHealthFailure({ reasons: ["success-low"] }), true);
assert.equal(api.candidateHasHealthFailure({ reasons: ["blocked-group"] }), false);
assert.equal(api.candidateHasHealthFailure({ reasons: ["ratio-too-high"] }), false);
assert.equal(api.candidateHasHealthFailure(null), true);
const rollbackToPrevious = api.selectRollbackCandidate([
  { group: "cheap", available: true, aggregateSuccess: 99, cacheHitRate: 70, outputTokensPerSecond: 50, aihubMetricSampleCount: 100, aihubCacheSampleCount: 100, latencyMs: 1000, ratio: 0.05 },
  { group: "stable", available: true, aggregateSuccess: 99, cacheHitRate: 70, outputTokensPerSecond: 50, aihubMetricSampleCount: 100, aihubCacheSampleCount: 100, latencyMs: 1000, ratio: 0.2 },
], "stable");
assert.equal(rollbackToPrevious.candidate.group, "stable");
assert.equal(rollbackToPrevious.usedPrevious, true);
const rollbackToAlternative = api.selectRollbackCandidate([
  { group: "cheap", available: true, aggregateSuccess: 99, cacheHitRate: 70, outputTokensPerSecond: 50, aihubMetricSampleCount: 100, aihubCacheSampleCount: 100, latencyMs: 1000, ratio: 0.05 },
  { group: "stable", available: false, aggregateSuccess: 99, cacheHitRate: 70, outputTokensPerSecond: 50, aihubMetricSampleCount: 100, aihubCacheSampleCount: 100, latencyMs: 1000, ratio: 0.2 },
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

const migratedAstraState = api.migrateAihubStoredModelAliases(
  { model: "astra", tokenIds: [7] },
  { byToken: { 7: { model: "astra", group: "A015-Pro", at: 123 } } },
  {
    byToken: { 7: { model: "astra", fromGroup: "A003-Pro", toGroup: "A015-Pro", remaining: 2, at: 123 } },
    blacklist: [{ model: "astra", group: "A009-Pro", until: 999 }],
  },
);
assert.equal(migratedAstraState.changed, true);
assert.equal(migratedAstraState.config.model, "gpt-6-astra");
assert.equal(migratedAstraState.history.byToken[7].model, "gpt-6-astra");
assert.equal(migratedAstraState.guard.byToken[7].model, "gpt-6-astra");
assert.equal(migratedAstraState.guard.blacklist[0].model, "gpt-6-astra");
assert.equal(migratedAstraState.history.byToken[7].at, 123);
assert.equal(migratedAstraState.guard.byToken[7].remaining, 2);
assert.equal(migratedAstraState.guard.byToken[7].fromGroup, "A003-Pro");
assert.equal(migratedAstraState.guard.blacklist[0].until, 999);
assert.equal(api.migrateAihubStoredModelAliases(
  migratedAstraState.config, migratedAstraState.history, migratedAstraState.guard,
).changed, false, "already migrated state must not trigger repeated storage writes");
const migratedMultiAstraState = api.migrateAihubStoredModelAliases(
  { models: ["astra", "gpt-5.6-sol"], model: "astra", tokenIds: [7] },
  { byToken: { 7: { model: "astra\u001fgpt-5.6-sol", group: "A015-Pro", at: 123 } } },
  { blacklist: [{ model: "astra\u001fgpt-5.6-sol", group: "A009-Pro", until: 999 }] },
);
assert.deepEqual(
  JSON.parse(JSON.stringify(migratedMultiAstraState.config.models)),
  ["gpt-6-astra", "gpt-5.6-sol"],
);
assert.equal(migratedMultiAstraState.history.byToken[7].model, "gpt-5.6-sol\u001fgpt-6-astra");
assert.equal(migratedMultiAstraState.guard.blacklist[0].model, "gpt-5.6-sol\u001fgpt-6-astra");
const currentGroupTokens = [
  { id: 1, groupId: 12, group: "renamed-group", name: "primary" },
  { id: 2, groupId: 12, group: "selected", name: "backup" },
  { id: 3, groupId: 13, group: "selected", name: "other-group" },
  { id: 4, groupId: 12, group: "selected", name: "unselected" },
];
assert.deepEqual(Array.from(api.candidateCurrentTokens({ groupId: 12, group: "selected" }, currentGroupTokens, [1, 2, 3]), token => token.id), [1, 2],
  "current markers must match selected key group IDs, not misleading or renamed display names");
assert.equal(api.candidateCurrentTokens({ groupId: 12, group: "selected" }, currentGroupTokens, []).length, 0,
  "no selected keys must produce no current group marker");
assert.equal(api.candidateCurrentTokens({ group: "selected" }, currentGroupTokens, [2]).length, 1,
  "legacy data may fall back to group names when group IDs are absent");
assert.equal(api.candidateCurrentTokens({ groupId: 12, group: "selected" }, [...currentGroupTokens, currentGroupTokens[0]], [1, 1]).length, 1,
  "duplicate keys must not inflate current-group counts");
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

assert.equal(api.requiresNewApiAccessToken("/api/pricing"), false);
assert.equal(api.requiresNewApiAccessToken("/api/perf-metrics?model=gpt-test&hours=24"), false);
assert.equal(api.requiresNewApiAccessToken("/api/status"), false);
assert.equal(api.requiresNewApiAccessToken("/api/token/?p=1&size=100"), true);
assert.equal(api.requiresNewApiAccessToken("/api/user/self/groups"), true);

const authBundle = api.normalizeNewApiAuthBundle({
  success: true,
  data: {
    access_token: "test-access-token",
    token_type: "Bearer",
    access_expires_at: 2_000_000_000,
    session: { sid: "test-session", current: true },
  },
});
assert.deepEqual(
  JSON.parse(JSON.stringify(authBundle)),
  { accessToken: "test-access-token", accessExpiresAt: 2_000_000_000, sessionId: "test-session" },
);
await assert.rejects(
  Promise.resolve().then(() => api.normalizeNewApiAuthBundle({ success: true, data: {} }, "ooioo")),
  /ooioo 鉴权刷新响应无效/,
);
await assert.rejects(
  Promise.resolve().then(() => api.normalizeNewApiAuthBundle({ success: true, data: {} })),
  /鉴权刷新响应无效/,
);

let refreshAttempts = 0;
let authLockRuns = 0;
const authManager = api.createNewApiAuthManager({
  nowSeconds: () => 1_900_000_000,
  sleep: async () => {},
  runExclusive: async (task) => {
    authLockRuns += 1;
    return task();
  },
  requestRefresh: async () => {
    refreshAttempts += 1;
    return {
      success: true,
      data: {
        access_token: `test-access-token-${refreshAttempts}`,
        token_type: "Bearer",
        access_expires_at: 2_000_000_000,
        session: { sid: "test-session", current: true },
      },
    };
  },
});
const concurrentTokens = await Promise.all([
  authManager.getAccessToken(false),
  authManager.getAccessToken(false),
]);
assert.deepEqual(concurrentTokens, ["test-access-token-1", "test-access-token-1"]);
assert.equal(refreshAttempts, 1, "concurrent account requests should share one access-token refresh");
assert.equal(authLockRuns, 1, "concurrent refreshes should share one cross-tab auth lock");
assert.equal(await authManager.getAccessToken(false), "test-access-token-1");
assert.equal(refreshAttempts, 1, "a non-expiring in-memory access token should be reused");

let authenticatedRequests = 0;
const authenticatedResult = await api.requestWithNewApiAuth(
  "/api/token/?p=1&size=100",
  authManager,
  async (accessToken) => {
    authenticatedRequests += 1;
    if (authenticatedRequests === 1) {
      const error = new Error("expired");
      error.status = 401;
      throw error;
    }
    return accessToken;
  },
);
assert.equal(authenticatedResult, "test-access-token-2");
assert.equal(authenticatedRequests, 2, "an authenticated API request should retry exactly once after 401");
assert.equal(refreshAttempts, 2, "a 401 should force one access-token refresh");

let refreshRaceAttempts = 0;
const refreshRaceSleeps = [];
const refreshRaceManager = api.createNewApiAuthManager({
  nowSeconds: () => 1_900_000_000,
  sleep: async (delay) => refreshRaceSleeps.push(delay),
  requestRefresh: async () => {
    refreshRaceAttempts += 1;
    if (refreshRaceAttempts === 1) {
      const error = new Error("refresh race");
      error.status = 409;
      throw error;
    }
    return {
      success: true,
      data: {
        access_token: "race-recovered-token",
        token_type: "Bearer",
        access_expires_at: 2_000_000_000,
        session: { sid: "race-session", current: true },
      },
    };
  },
});
assert.equal(await refreshRaceManager.getAccessToken(false), "race-recovered-token");
assert.equal(refreshRaceAttempts, 2);
assert.deepEqual(refreshRaceSleeps, [80]);

const expiredLoginManager = api.createNewApiAuthManager({
  requestRefresh: async () => {
    const error = new Error("Unauthorized");
    error.status = 401;
    throw error;
  },
});
await assert.rejects(
  expiredLoginManager.getAccessToken(false),
  /KFCoding 登录已失效，请重新登录后再试/,
);

const expiredOoiooLoginManager = api.createNewApiAuthManager({
  providerLabel: "ooioo",
  requestRefresh: async () => {
    const error = new Error("Unauthorized");
    error.status = 401;
    throw error;
  },
});
await assert.rejects(
  expiredOoiooLoginManager.getAccessToken(false),
  /ooioo 登录已失效，请重新登录后再试/,
);

console.log("PASS v2 metadata, public statistics, configuration migration, spend protection, key IDs, isolation and HTTP retry regressions (local fixtures)");
