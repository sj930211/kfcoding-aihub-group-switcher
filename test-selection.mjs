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
assert.equal(source.includes('data-ref="version"'), true, "the current version should be visible in the panel header");
assert.equal(source.includes('data-ref="updateBadge"'), true, "available updates should be visible beside the current version");
assert.equal(source.includes('GM_notification({\n      title: "分组监控脚本有新版本"'), true, "new versions should trigger a userscript notification");
assert.equal(source.includes('GM_getValue(STORAGE_UPDATE_NOTICE, "") === version'), true, "update notifications should be deduplicated across reloads");
assert.equal(source.includes('GM_setValue(STORAGE_UPDATE_NOTICE, version)'), true, "the last notified version should be persisted");
assert.equal(source.includes('class="settings-appearance"'), true, "theme selection should live in the settings dialog");
assert.equal(source.includes('data-ref="settings"'), true, "the panel header should expose a settings button");
assert.equal(source.includes('<dialog class="settings-dialog"'), true, "routing configuration should live in a dedicated settings dialog");
assert.equal(source.includes('data-ref="layoutMode"'), false, "the panel should use one stable narrow layout");
assert.equal(source.includes('data-layout-mode'), false, "legacy wide layout selectors must not override responsive rules");
assert.equal(source.includes('class="monitor-command-row"'), false, "wide monitoring wrappers should be removed");
assert.equal(source.includes('class="route-settings-layout"'), false, "wide settings wrappers should be removed");
assert.equal(source.includes('width: min(560px, calc(100vw - 24px));'), true, "the panel should use the narrow desktop width");
assert.equal(source.includes('width: min(560px, calc(100vw - 28px));'), true, "the settings dialog should share the narrow width");
assert.equal(source.includes('.diagnostics-grid { display: grid; grid-template-columns: 1fr; }'), true, "diagnostics should stay in one column");
assert.equal(
  source.includes('theme: refs.theme.value,'),
  true,
  "saving switching settings must preserve the selected theme",
);
assert.equal(
  source.includes('root.host.dataset.resolvedTheme = resolvedTheme;'),
  true,
  "the selected or system theme should be applied to the shadow host",
);
assert.equal(
  source.includes('systemThemeQuery.addEventListener("change", handleSystemThemeChange)'),
  true,
  "system theme changes should update the panel without a reload",
);
assert.equal(source.includes(':host([data-resolved-theme="light"])'), true, "the panel should define a light palette");
assert.equal(source.includes('data-ref="maxFirstTokenLatencySeconds"'), true, "first-token latency should have its own threshold");
assert.equal(source.includes('data-ref="maxOutputDurationSeconds"'), true, "output duration should have its own threshold");
assert.equal(source.includes('data-ref="groupFilterMode"'), true, "group filtering should use a mutually exclusive mode selector");
assert.equal(source.includes('data-ref="groupFilterSelectToggle"'), true, "group membership should use a compact dropdown");
assert.equal(source.includes('data-ref="groupFilterGroups"'), false, "whitelist and blacklist must not share a text input");
assert.equal(source.includes('data-ref="selectionMode"'), true, "users should be able to choose a routing strategy");
assert.equal(source.includes('data-ref="spendProtectionEnabled"'), true, "daily spend protection should be configurable");
assert.equal(source.includes('data-ref="resetSpendProtection"'), true, "spend protection should support resetting its baseline");
assert.equal(source.includes("option.disabled = !candidate.available"), false, "manual routing should expose every checked group");
assert.equal(
  source.includes("minmax(54px, auto)"),
  false,
  "verdict text length must not resize candidate grid columns",
);
assert.equal(
  source.includes(".candidate-head, .candidate {"),
  true,
  "candidate headers and rows should share one grid definition",
);
assert.equal(source.includes("border-left: 2px"), false, "candidate rows should not use decorative status rails");
assert.equal(source.includes("font-family: Inter"), false, "the console should not use the default AI dashboard typeface");
assert.equal(source.includes("GROUP CONTROL"), false, "the header should not use a decorative English eyebrow");
assert.equal(
  source.includes("border-radius: 6px;\n          background: var(--canvas);"),
  true,
  "the console should use a precise technical shell radius",
);
assert.equal(source.includes('class="brand-mark"'), true, "the console should expose a compact provider identity");
assert.equal(source.includes('class="route-connector"'), true, "current and recommended groups should form a visible route");
assert.equal(source.includes('signal.className = "candidate-signal"'), true, "candidate health should use a dedicated status signal");
assert.equal(source.includes('recentSuccess.className = "mono health-value"'), true, "recent health should expose a compact trajectory");
assert.equal(
  source.includes("sanitizeConfig(GM_getValue(STORAGE_CONFIG, {}))"),
  true,
  "legacy group filters must be sanitized before defaults are applied",
);
assert.equal(
  source.includes('<span>首字</span><span>输出</span><span>缓存</span><span>判定</span>'),
  true,
  "candidate status should display latency and cache metrics separately",
);
assert.equal(
  source.includes("const AUTO_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;"),
  true,
  "automatic update checks should run every five minutes",
);
const groupSchedulerSource = source.slice(
  source.indexOf("function scheduleNext("),
  source.indexOf("function scheduleUpdateCheck("),
);
assert.equal(
  groupSchedulerSource.includes("checkForUpdate("),
  false,
  "update checks should not depend on the automatic group scheduler",
);
const updateSchedulerSource = source.slice(
  source.indexOf("function scheduleUpdateCheck("),
  source.indexOf("function formatRatio("),
);
assert.equal(
  updateSchedulerSource.includes("checkForUpdate({ silent: true })"),
  true,
  "the independent update scheduler should perform silent update checks",
);
assert.equal(
  source.includes("scheduleUpdateCheck(0);"),
  true,
  "update checks should start even when automatic group switching is disabled",
);
assert.equal(source.includes('<div class="automation-bar">'), true, "automatic routing should remain a dedicated settings row");
assert.equal(source.includes('<div class="control-grid">'), true, "key and model selectors should use a compact responsive grid");
assert.equal(source.includes('class="button button-check"'), true, "immediate checks should be the primary command");
assert.equal(source.includes('class="button button-route"'), true, "lowest-route switching should remain directly accessible");
assert.equal(source.includes('<div class="summary">'), false, "the old equal-weight summary grid should be removed");
assert.equal(
  (source.match(/<section class="work-view"/g) || []).length,
  2,
  "the primary navigation should contain only monitoring and diagnostics workspaces",
);
assert.equal(source.includes('role="tabpanel" aria-labelledby="kf-tab-monitor"'), true, "tabs should identify their monitor panel");
assert.equal(source.includes('aria-controls="kf-view-diagnostics"'), true, "workspace tabs should expose their controlled panels");
assert.equal(source.includes('function setActiveView(view, options)'), true, "all workspace navigation should share one state transition");
assert.equal(source.includes('["ArrowLeft", "ArrowRight", "Home", "End"]'), true, "workspace tabs should support keyboard navigation");
assert.equal(source.includes('font-family: -apple-system, BlinkMacSystemFont'), true, "the Apple pass should use platform typography");
assert.equal(source.includes('@media (prefers-reduced-transparency: reduce)'), true, "translucent chrome should have a solid accessibility fallback");
assert.equal(source.includes('.work-nav button[data-active="true"]::after'), false, "selected tabs should use a familiar segmented state instead of a web underline");
assert.equal(source.includes('Math.hypot(deltaX, deltaY) < 10'), true, "panel dragging should use touch-friendly hysteresis");
assert.equal(source.includes('refs.status.dataset.tone = state.tone'), true, "status feedback should communicate its semantic state");
assert.equal(
  source.indexOf('data-ref="checkUpdate"') > source.indexOf('data-ref="settingsSection"'),
  true,
  "update controls should live inside the settings dialog",
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
assert.equal(api.extractUserscriptVersion(source), "0.11.1");
assert.equal(api.extractUserscriptVersion("// no version"), "");
assert.equal(api.compareVersions("0.4.5", "0.4.4"), 1);
assert.equal(api.compareVersions("v1.0.0", "1.0"), 0);
assert.equal(api.compareVersions("0.4.4", "0.4.5"), -1);
assert.equal(api.compareVersions("0.11.0", "0.9.9"), 1);
assert.equal(api.DEFAULT_CONFIG.theme, "system");
assert.equal(api.sanitizeConfig({ theme: "light" }).theme, "light");
assert.equal(api.sanitizeConfig({ theme: "dark" }).theme, "dark");
assert.equal(api.sanitizeConfig({ theme: "unknown" }).theme, "system");
assert.equal(api.resolveThemeMode("system", true), "dark");
assert.equal(api.resolveThemeMode("system", false), "light");
assert.equal(api.resolveThemeMode("light", true), "light");
assert.equal(api.DEFAULT_CONFIG.selectionMode, "saving");
assert.equal(api.sanitizeConfig({ selectionMode: "stable" }).selectionMode, "stable");
assert.equal(api.sanitizeConfig({ selectionMode: "balanced" }).selectionMode, "balanced");
assert.equal(api.sanitizeConfig({ selectionMode: "unknown" }).selectionMode, "saving");
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
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG }).maxGroupRatio, 0);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, maxGroupRatio: 0.08 }).maxGroupRatio, 0.08);
assert.equal(api.sanitizeConfig({ ...api.DEFAULT_CONFIG, maxGroupRatio: -1 }).maxGroupRatio, 0);
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
assert.equal(api.candidateHasHealthFailure({ reasons: ["blocked-group"] }), false);
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
  maxFirstTokenLatencySeconds: 60,
  maxOutputDurationSeconds: 0,
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
      outputTokens: 18,
      outputTokensPerSecond: 42,
      cacheHitRate: "89.25%",
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
      outputTokens: null,
      outputTokensPerSecond: null,
      cacheHitRate: null,
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
      outputTokens: 20,
      outputTokensPerSecond: 50,
      cacheHitRate: "70%",
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
      outputTokens: 20,
      outputTokensPerSecond: 50,
      cacheHitRate: "95%",
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
assert.equal(aihubCandidates.find((item) => item.group === "cheap").firstTokenLatencyMs, 12000);
assert.equal(aihubCandidates.find((item) => item.group === "cheap").outputTokensPerSecond, 42);
assert.ok(Math.abs(aihubCandidates.find((item) => item.group === "cheap").outputLatencyMs - (18 / 42 * 1000)) < 1e-9);
assert.equal(aihubCandidates.find((item) => item.group === "cheap").cacheHitRate, 89.25);
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

const delayedAihubCandidates = api.evaluateAihubCandidates(
  aihubSummary,
  aihubSeries,
  aihubGroups,
  { 1: 0.04 },
  api.sanitizeConfig({ ...config, maxFirstTokenLatencySeconds: 10, maxOutputDurationSeconds: 0.4 }),
  aihubNow,
);
assert.ok(delayedAihubCandidates.find((item) => item.group === "cheap").reasons.includes("first-token-latency-high"));
assert.ok(delayedAihubCandidates.find((item) => item.group === "cheap").reasons.includes("output-latency-high"));

const blockedAihubCandidates = api.evaluateAihubCandidates(
  aihubSummary,
  aihubSeries,
  aihubGroups,
  { 1: 0.04 },
  api.sanitizeConfig({
    ...config,
    groupFilterMode: "blacklist",
    groupBlacklist: ["recent-bad"],
  }),
  aihubNow,
);
assert.ok(blockedAihubCandidates.find((item) => item.group === "recent-bad").reasons.includes("blocked-group"));
assert.equal(api.selectBestCandidate(blockedAihubCandidates, "balanced").group, "cheap");

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
        avg_ttft_ms: 1600,
        avg_latency_ms: 12000,
        avg_tps: 42,
        series: series([99, 100, 100]),
      },
      {
        group: "balanced",
        success_rate: 99.8,
        avg_ttft_ms: 1400,
        avg_latency_ms: 9000,
        avg_tps: 45,
        series: series([100, 100, 100]),
      },
      {
        group: "recent-bad",
        success_rate: 99.5,
        avg_ttft_ms: 1300,
        avg_latency_ms: 7000,
        avg_tps: 50,
        series: series([100, 100, 100, 100, 72, 100]),
      },
      {
        group: "unstable",
        success_rate: 99,
        avg_ttft_ms: 1500,
        avg_latency_ms: 8000,
        avg_tps: 48,
        series: series([100, 100, 20]),
      },
      {
        group: "private",
        success_rate: 100,
        avg_ttft_ms: 1200,
        avg_latency_ms: 6000,
        avg_tps: 50,
        series: series([100, 100, 100]),
      },
    ],
  },
};

const candidates = api.evaluateCandidates(pricing, metrics, userGroups, config, now);
assert.equal(candidates.find((item) => item.group === "cheap").available, true);
assert.equal(candidates.find((item) => item.group === "cheap").firstTokenLatencyMs, 1600);
assert.equal(candidates.find((item) => item.group === "cheap").outputTokensPerSecond, 42);
assert.equal(candidates.find((item) => item.group === "cheap").outputLatencyMs, 12000);
assert.equal(Number.isNaN(candidates.find((item) => item.group === "cheap").cacheHitRate), true);
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
const strategyCandidates = [
  {
    group: "cheapest",
    available: true,
    ratio: 0.05,
    aggregateSuccess: 96,
    recentMinSuccess: 96,
    firstTokenLatencyMs: 12000,
    outputLatencyMs: 50000,
    cacheHitRate: 10,
  },
  {
    group: "balanced-choice",
    available: true,
    ratio: 0.1,
    aggregateSuccess: 99.5,
    recentMinSuccess: 100,
    firstTokenLatencyMs: 1200,
    outputLatencyMs: 7000,
    cacheHitRate: 80,
  },
  {
    group: "most-stable",
    available: true,
    ratio: 0.2,
    aggregateSuccess: 100,
    recentMinSuccess: 100,
    firstTokenLatencyMs: 500,
    outputLatencyMs: 2500,
    cacheHitRate: 99,
  },
];
assert.equal(api.selectBestCandidate(strategyCandidates, "", "saving").group, "cheapest");
assert.equal(api.selectBestCandidate(strategyCandidates, "", "stable").group, "most-stable");
assert.equal(api.selectBestCandidate(strategyCandidates, "", "balanced").group, "balanced-choice");
assert.ok(
  api.candidateHealthScore(strategyCandidates[2]) > api.candidateHealthScore(strategyCandidates[1]),
  "stable scoring should reward recent success, latency, output time, and cache hit rate",
);
assert.equal(
  api.selectSwitchCandidate(candidates, "cheap", "balanced").group,
  "balanced",
  "manual selection should use the requested available group instead of the cheapest group",
);
assert.throws(
  () => api.selectSwitchCandidate(candidates, "cheap", "unstable"),
  /目标分组 unstable 当前不可用：.*最新成功率不足/,
);
assert.equal(
  api.selectSwitchCandidate(candidates, "cheap", "unstable", { allowUnavailable: true }).group,
  "unstable",
  "manual selection should allow a user to override automated health policy",
);
assert.throws(
  () => api.selectSwitchCandidate(candidates, "cheap", "missing"),
  /不在当前模型的可选范围内/,
);
assert.equal(api.shouldSwitchCandidate(candidates.find((item) => item.group === "cheap"), "cheap"), false);
assert.equal(api.shouldSwitchCandidate(candidates.find((item) => item.group === "balanced"), "cheap"), true);

const allowListConfig = api.sanitizeConfig({
  ...config,
  groupFilterMode: "whitelist",
  groupWhitelist: ["balanced"],
});
const allowListCandidates = api.evaluateCandidates(pricing, metrics, userGroups, allowListConfig, now);
assert.equal(api.selectBestCandidate(allowListCandidates, "cheap").group, "balanced");
assert.ok(allowListCandidates.find((item) => item.group === "cheap").reasons.includes("not-whitelisted"));

const blockListConfig = api.sanitizeConfig({
  ...config,
  groupFilterMode: "blacklist",
  groupBlacklist: ["recent-bad", "cheap"],
});
const blockListCandidates = api.evaluateCandidates(pricing, metrics, userGroups, blockListConfig, now);
assert.equal(api.selectBestCandidate(blockListCandidates, "cheap").group, "balanced");
assert.ok(blockListCandidates.find((item) => item.group === "cheap").reasons.includes("blocked-group"));
assert.ok(blockListCandidates.find((item) => item.group === "recent-bad").reasons.includes("blocked-group"));

const emptyBlockListCandidates = api.evaluateCandidates(
  pricing,
  metrics,
  userGroups,
  api.sanitizeConfig({ ...config, groupFilterMode: "blacklist", groupBlacklist: [] }),
  now,
);
assert.equal(api.selectBestCandidate(emptyBlockListCandidates, "cheap").group, "recent-bad");

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

const delayedCandidates = api.evaluateCandidates(
  pricing,
  metrics,
  userGroups,
  api.sanitizeConfig({ ...config, maxFirstTokenLatencySeconds: 1, maxOutputDurationSeconds: 10 }),
  now,
);
assert.ok(delayedCandidates.find((item) => item.group === "cheap").reasons.includes("first-token-latency-high"));
assert.ok(delayedCandidates.find((item) => item.group === "cheap").reasons.includes("output-latency-high"));

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
