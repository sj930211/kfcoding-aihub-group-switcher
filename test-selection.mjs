import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./kfcoding-group-switcher.user.js", import.meta.url), "utf8");
const metadataVersion = source.match(/^\/\/\s*@version\s+([^\s]+)\s*$/m)?.[1] || "";
const runtimeVersion = source.match(/const SCRIPT_VERSION = "([^"]+)";/)?.[1] || "";
assert.equal(metadataVersion, "0.14.6", "the userscript metadata should expose the patch release");
assert.equal(
  runtimeVersion,
  metadataVersion,
  "the runtime version shown in the panel must match the Tampermonkey metadata version",
);
assert.equal(source.includes("// @match        https://ooioo.work/*"), true, "ooioo pages should load the userscript");
assert.equal(source.includes("// @match        https://fluxionai.space/*"), true, "FluxionAI pages should load the userscript");
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
assert.equal(source.includes('class="settings-appearance"'), true, "theme selection should live in the settings workspace");
assert.equal(source.includes('data-ref="glassTransparency"'), true, "glass transparency should be adjustable in settings");
assert.equal(source.includes('data-ref="glassTransparencyValue"'), true, "glass transparency should display its current value");
assert.equal(source.includes('data-ref="settings"'), false, "the settings tab should be the only settings entry point");
assert.equal(source.includes('<dialog class="settings-dialog"'), false, "settings should not open in a modal dialog");
assert.equal(source.includes('data-view="settings" role="tabpanel"'), true, "routing configuration should live in an internal workspace");
assert.equal(source.includes('refs.settings.addEventListener'), false, "the removed header settings shortcut should not retain event bindings");
assert.equal(source.includes('settingsDialog.showModal()'), false, "the settings shortcut must not open a modal");
assert.equal(source.includes('data-ref="layoutMode"'), false, "the panel should use one stable narrow layout");
assert.equal(source.includes('data-layout-mode'), false, "legacy wide layout selectors must not override responsive rules");
assert.equal(source.includes('class="monitor-command-row"'), false, "wide monitoring wrappers should be removed");
assert.equal(source.includes('class="route-settings-layout"'), false, "wide settings wrappers should be removed");
assert.equal(source.includes('width: min(480px, calc(100vw - 24px));'), true, "the panel should use the compact desktop width");
assert.equal(source.includes('grid-template-columns: repeat(3, minmax(0, 1fr));'), true, "monitoring, diagnostics, and settings should share one navigation bar");
assert.equal(source.includes('.diagnostics-grid { display: grid; grid-template-columns: 1fr; }'), true, "diagnostics should stay in one column");
assert.equal(
  source.includes('theme: refs.theme.value,'),
  true,
  "saving switching settings must preserve the selected theme",
);
assert.equal(
  source.includes('glassTransparency: refs.glassTransparency.value,'),
  true,
  "saving switching settings must preserve glass transparency",
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
assert.equal(source.includes("border-radius: 20px;"), true, "the panel should use the approved continuous glass radius");
assert.equal(source.includes("background: var(--panel-glass);"), true, "the panel should use a translucent material surface");
assert.equal(
  source.includes("backdrop-filter: blur(22px) saturate(175%) contrast(108%);"),
  true,
  "the panel should visibly refract the provider page behind it",
);
assert.equal(source.includes('class="brand-mark"'), true, "the console should expose a compact provider identity");
assert.equal(source.includes('class="route-connector"'), false, "the approved compact route summary should not use a decorative connector");
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
  source.includes('>标/实</span><span>整体</span>'),
  true,
  "candidate status should label nominal and actual multipliers separately",
);
assert.equal(
  source.includes('ratio.className = "candidate-ratio mono";'),
  true,
  "candidate rows should render nominal and actual multipliers together",
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
assert.equal(source.includes('class="icon-button route-apply"'), true, "recommended-route switching should remain directly accessible");
assert.equal(source.includes('目标模型（站点探测）'), true, "AIHub should expose a monitored target-model selector");
assert.equal(source.includes('refs.model.disabled = running || IS_AIHUB'), false, "AIHub model selection must remain interactive");
assert.equal(source.includes('<div class="summary">'), false, "the old equal-weight summary grid should be removed");
assert.equal(
  (source.match(/<section class="work-view/g) || []).length,
  3,
  "the primary navigation should contain monitoring, diagnostics, and settings workspaces",
);
assert.equal(source.includes('role="tabpanel" aria-labelledby="kf-tab-monitor"'), true, "tabs should identify their monitor panel");
assert.equal(source.includes('aria-controls="kf-view-diagnostics"'), true, "workspace tabs should expose their controlled panels");
assert.equal(source.includes('aria-controls="kf-view-settings"'), true, "the settings tab should expose its controlled panel");
assert.equal(source.includes('function setActiveView(view, options)'), true, "all workspace navigation should share one state transition");
assert.equal(source.includes('["ArrowLeft", "ArrowRight", "Home", "End"]'), true, "workspace tabs should support keyboard navigation");
assert.equal(source.includes('font-family: -apple-system, BlinkMacSystemFont'), true, "the Apple pass should use platform typography");
assert.equal(source.includes('@media (prefers-reduced-transparency: reduce)'), true, "translucent chrome should have a solid accessibility fallback");
assert.equal(source.includes('data-ref="isolationRows"'), true, "settings should expose active fault isolations");
assert.equal(source.includes('data-ref="clearAllIsolations"'), true, "fault isolations should support clearing all entries");
assert.equal(source.includes('data-ref="isolationToastUndo"'), true, "fault-isolation removal should offer undo");
assert.equal(source.includes('.work-nav button[data-active="true"]::after'), false, "selected tabs should use a familiar segmented state instead of a web underline");
assert.equal(source.includes('Math.hypot(deltaX, deltaY) < 10'), true, "panel dragging should use touch-friendly hysteresis");
assert.equal(source.includes('refs.status.dataset.tone = state.tone'), true, "status feedback should communicate its semantic state");
assert.equal(
  source.indexOf('data-ref="checkUpdate"') > source.indexOf('data-ref="settingsSection"'),
  true,
  "update controls should live inside the settings workspace",
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
assert.equal(api.extractUserscriptVersion(source), "0.14.6");
assert.equal(api.normalizeAihubModelKey("gpt-5.6-sol"), "sol");
assert.equal(api.normalizeAihubModelKey("Terra"), "terra");
assert.equal(
  api.aihubModelHealthStatus({ model_health: { Sol: "HEALTHY" } }, "gpt-5.6-sol"),
  "healthy",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.normalizeAihubModelDetection({
    applicable: true,
    status: "SUSPECTED",
    model: "gpt-5.6-sol",
    confidence: "HIGH",
    execution_complete: true,
    all_targets_passed: false,
    expires_at: "2026-09-16T16:10:21+08:00",
  }))),
  {
    applicable: true,
    status: "suspected",
    model: "gpt-5.6-sol",
    modelKey: "sol",
    confidence: "high",
    executionComplete: true,
    allTargetsPassed: false,
    expiresAt: "2026-09-16T16:10:21+08:00",
    expiresAtMs: Date.parse("2026-09-16T16:10:21+08:00"),
  },
);
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

const fluxionGroups = [
  {
    id: 2,
    name: "GPT-Plus-余额",
    status: "active",
    platform: "openai",
    rate_multiplier: 0.1,
    promo_active: true,
    promo_rate_enabled: true,
    promo_rate_multiplier: 0.05,
    promo_end_at: "2026-08-31T23:59:00+08:00",
    peak_rate_enabled: false,
    models_list_config: { enabled: true, models: ["gpt-5.6-sol"] },
  },
  {
    id: 46,
    name: "GPT-Pro-余额",
    status: "active",
    platform: "openai",
    rate_multiplier: 0.2,
    promo_active: true,
    promo_rate_enabled: true,
    promo_rate_multiplier: 0.15,
    promo_end_at: "2026-08-31T23:59:00+08:00",
    peak_rate_enabled: false,
    models_list_config: { enabled: true, models: ["gpt-5.6-sol", "gpt-5.3-codex-spark"] },
  },
  {
    id: 136,
    name: "Claude-Max-Fable-余额",
    status: "active",
    platform: "anthropic",
    rate_multiplier: 1.2,
    promo_active: false,
    peak_rate_enabled: false,
    models_list_config: { enabled: true, models: ["claude-fable-5"] },
  },
];
const fluxionMonitorsPayload = {
  code: 0,
  data: {
    items: [
      {
        id: 21,
        name: "GPT-Plus分组",
        group_name: "GPT",
        provider: "openai",
        primary_model: "gpt-5.6-sol",
        extra_models: [],
        primary_status: "error",
        primary_latency_ms: 30000,
        primary_ping_latency_ms: 20,
        availability_7d: 75.6,
        timeline: [
          { checked_at: "2026-08-06T03:00:00Z", status: "operational", latency_ms: 1436, ping_latency_ms: 22 },
          { checked_at: "2026-08-06T03:11:00Z", status: "error", latency_ms: 30000, ping_latency_ms: 20 },
          { checked_at: "2026-08-06T02:50:00Z", status: "operational", latency_ms: 1278, ping_latency_ms: 21 },
        ],
      },
      {
        id: 22,
        name: "GPT-Pro分组",
        group_name: "GPT",
        provider: "openai",
        primary_model: "gpt-5.6-sol",
        extra_models: [],
        primary_status: "operational",
        primary_latency_ms: 2796,
        primary_ping_latency_ms: 18,
        availability_7d: 97.65,
        timeline: [
          { checked_at: "2026-08-06T03:10:00Z", status: "operational", latency_ms: 2796, ping_latency_ms: 18 },
          { checked_at: "2026-08-06T02:55:00Z", status: "error", latency_ms: 30000, ping_latency_ms: 20 },
        ],
      },
    ],
  },
};
const normalizedFluxionMonitors = api.normalizeFluxionMonitors(fluxionMonitorsPayload);
assert.equal(normalizedFluxionMonitors.length, 2);
assert.equal(normalizedFluxionMonitors[0].primaryModel, "gpt-5.6-sol");
assert.equal(normalizedFluxionMonitors[0].timeline[0].checkedAt, "2026-08-06T03:00:00Z");
assert.deepEqual(
  JSON.parse(JSON.stringify(api.buildFluxionModelCatalog(fluxionMonitorsPayload, fluxionGroups))),
  { data: [{ model_name: "gpt-5.6-sol" }] },
  "FluxionAI should only list models backed by both a selectable group and a monitor",
);
assert.ok(
  api.fluxionMonitorMatchScore(
    { name: "Claude-Max外接分组", provider: "anthropic" },
    { name: "Claude-Max-无Fable-外接-余额", platform: "anthropic" },
  ) > api.fluxionMonitorMatchScore(
    { name: "Claude-Max外接分组", provider: "anthropic" },
    { name: "Claude-Max-无Fable-余额", platform: "anthropic" },
  ),
  "FluxionAI monitor matching should preserve the external-pool distinction",
);
assert.ok(
  api.fluxionMonitorMatchScore(
    { name: "Claude-Vertex逆向分组", provider: "anthropic" },
    { name: "Claude-Max-无Fable-余额", platform: "anthropic" },
  ) < 75,
  "a shared Claude prefix must not map one FluxionAI channel monitor onto another group",
);
const fluxionRateNow = Date.parse("2026-08-06T03:12:00Z");
assert.equal(api.fluxionEffectiveGroupRatio(fluxionGroups[0], {}, fluxionRateNow), 0.05);
assert.equal(api.fluxionEffectiveGroupRatio(fluxionGroups[0], { 2: 0.08 }, fluxionRateNow), 0.08);
assert.equal(api.fluxionEffectiveGroupRatio(fluxionGroups[0], { 2: { rate_multiplier: 0.07 } }, fluxionRateNow), 0.07);
assert.equal(
  api.fluxionEffectiveGroupRatio({ ...fluxionGroups[0], promo_end_at: "2026-08-01T00:00:00Z" }, {}, fluxionRateNow),
  0.1,
  "expired FluxionAI promotions should fall back to the base group ratio",
);
assert.equal(
  api.fluxionEffectiveGroupRatio({
    ...fluxionGroups[0],
    peak_rate_enabled: true,
    peak_rate_multiplier: 2,
    peak_start: "10:00",
    peak_end: "12:00",
  }, {}, new Date(2026, 7, 6, 11, 12, 0).getTime()),
  0.1,
  "FluxionAI peak periods should multiply the currently effective promotional ratio",
);
const fluxionCandidates = api.evaluateFluxionCandidates(
  fluxionMonitorsPayload,
  fluxionGroups,
  {},
  {
    ...api.DEFAULT_CONFIG,
    model: "gpt-5.6-sol",
    maxGroupRatio: 0.2,
    minSuccessRate: 95,
    minLatestSuccessRate: 95,
    maxMetricAgeMinutes: 180,
  },
  fluxionRateNow,
);
assert.equal(fluxionCandidates.length, 2);
assert.equal(fluxionCandidates[0].group, "GPT-Plus-余额");
assert.equal(fluxionCandidates[0].ratio, 0.05);
assert.equal(fluxionCandidates[0].latestSuccess, 0);
assert.equal(fluxionCandidates[0].available, false);
assert.ok(fluxionCandidates[0].reasons.includes("success-low"));
assert.ok(fluxionCandidates[0].reasons.includes("latest-unavailable"));
assert.equal(fluxionCandidates[1].group, "GPT-Pro-余额");
assert.equal(fluxionCandidates[1].ratio, 0.15);
assert.equal(fluxionCandidates[1].latestSuccess, 100);
assert.equal(fluxionCandidates[1].outputLatencyMs, 2796);
assert.equal(Number.isNaN(fluxionCandidates[1].firstTokenLatencyMs), true);
assert.equal(Number.isNaN(fluxionCandidates[1].cacheHitRate), true);
assert.equal(fluxionCandidates[1].available, true);
assert.equal(
  api.selectBestCandidate(fluxionCandidates, "", "saving").group,
  "GPT-Pro-余额",
  "the cheapest unhealthy FluxionAI group must not beat a healthy monitored group",
);
const unmonitoredFluxionCandidates = api.evaluateFluxionCandidates(
  fluxionMonitorsPayload,
  fluxionGroups,
  {},
  { ...api.DEFAULT_CONFIG, model: "claude-fable-5" },
  fluxionRateNow,
);
assert.equal(unmonitoredFluxionCandidates.length, 1);
assert.deepEqual(
  Array.from(unmonitoredFluxionCandidates[0].reasons),
  ["metrics-missing"],
  "a FluxionAI group without a matching model monitor must stay unavailable without borrowing another group",
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

const ooiooNow = 2_000_000_000;
const ooiooCandidates = api.evaluateCandidates({
  success: true,
  data: [{
    model_name: "gpt-5.6-terra",
    enable_groups: ["codex-plus", "codex-pro"],
  }],
  group_ratio: { "codex-plus": 0.08, "codex-pro": 0.2 },
}, {
  success: true,
  data: {
    model_name: "gpt-5.6-terra",
    series_schema: "v1",
    groups: [
      {
        group: "codex-plus",
        avg_ttft_ms: 3_619,
        avg_latency_ms: 14_614,
        success_rate: 97.83,
        avg_tps: 47.45,
        series: [{ ts: ooiooNow - 60, success_rate: 100, avg_ttft_ms: 3_619 }],
      },
      {
        group: "codex-pro",
        avg_ttft_ms: 2_000,
        avg_latency_ms: 12_000,
        success_rate: 99,
        avg_tps: 55,
        series: [{ ts: ooiooNow - 30, success_rate: 80, avg_ttft_ms: 2_000 }],
      },
    ],
  },
}, {
  success: true,
  data: {
    "codex-plus": { desc: "Plus pool", ratio: 0.08 },
    "codex-pro": { desc: "Pro pool", ratio: 0.2 },
  },
}, api.sanitizeConfig({
  ...api.DEFAULT_CONFIG,
  model: "gpt-5.6-terra",
  minSuccessRate: 95,
  minLatestSuccessRate: 95,
  maxMetricAgeMinutes: 180,
  maxFirstTokenLatencySeconds: 120,
}), ooiooNow);
assert.equal(ooiooCandidates.length, 2);
assert.equal(ooiooCandidates[0].group, "codex-plus");
assert.equal(ooiooCandidates[0].available, true);
assert.equal(ooiooCandidates[0].latestSuccess, 100);
assert.equal(ooiooCandidates[0].outputLatencyMs, 14_614);
assert.equal(ooiooCandidates[1].available, false);
assert.deepEqual(Array.from(ooiooCandidates[1].reasons), ["latest-success-low"]);
assert.equal(api.selectBestCandidate(ooiooCandidates, "", "saving").group, "codex-plus");

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
const aihubConfig = api.sanitizeConfig({ ...config, model: "gpt-5.6-sol" });
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
      probe_e2e_ttft_ms: 13_000,
      outputTokens: 18,
      outputTokensPerSecond: 42,
      cacheHitRate: "89.25%",
      modelHealth: { sol: "healthy", terra: "healthy", luna: "failed" },
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
      modelHealth: { sol: "failed", terra: "healthy", luna: "failed" },
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
      modelHealth: { sol: "healthy", terra: "healthy", luna: "failed" },
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
  aihubConfig,
  aihubNow,
);
assert.equal(aihubCandidates.find((item) => item.group === "cheap").available, true);
assert.equal(aihubCandidates.find((item) => item.group === "cheap").modelHealthStatus, "healthy");
assert.equal(aihubCandidates.find((item) => item.group === "cheap").ratio, 0.04);
assert.equal(aihubCandidates.find((item) => item.group === "cheap").firstTokenLatencyMs, 13000);
assert.equal(aihubCandidates.find((item) => item.group === "cheap").outputTokensPerSecond, 42);
assert.ok(Math.abs(aihubCandidates.find((item) => item.group === "cheap").outputLatencyMs - (18 / 42 * 1000)) < 1e-9);
assert.equal(aihubCandidates.find((item) => item.group === "cheap").cacheHitRate, 89.25);
assert.ok(
  Math.abs(api.candidateEffectiveRatio(aihubCandidates.find((item) => item.group === "cheap")) - 0.061968503937007875) < 1e-12,
  "AIHub actual ratio should normalize cache cost against the 97% baseline",
);
assert.equal(aihubCandidates.find((item) => item.group === "balanced").available, false);
assert.ok(aihubCandidates.find((item) => item.group === "balanced").reasons.includes("latest-unavailable"));
assert.ok(aihubCandidates.find((item) => item.group === "balanced").reasons.includes("model-unavailable"));
assert.equal(aihubCandidates.find((item) => item.group === "recent-bad").recentMinSuccess, 100);
assert.equal(
  aihubCandidates.find((item) => item.group === "recent-bad").available,
  true,
  "AIHub should only use the most recent bar for recent availability",
);
assert.ok(aihubCandidates.find((item) => item.group === "private").reasons.includes("not-user-selectable"));
assert.ok(aihubCandidates.find((item) => item.group === "private").reasons.includes("model-status-unknown"));
assert.equal(api.selectBestCandidate(aihubCandidates, "balanced").group, "recent-bad");

const degradedAihubCandidates = api.evaluateAihubCandidates(
  aihubSummary,
  {},
  aihubGroups,
  { 1: 0.04 },
  aihubConfig,
  aihubNow,
);
assert.equal(
  degradedAihubCandidates.find((item) => item.group === "cheap").latestSuccess,
  100,
  "AIHub should fall back to the latest summary availability when the series endpoint fails",
);
assert.equal(degradedAihubCandidates.find((item) => item.group === "cheap").available, true);
assert.equal(degradedAihubCandidates.find((item) => item.group === "balanced").latestSuccess, 0);

const requestedAihubMonitorPaths = [];
const degradedAihubMonitorData = await api.loadAihubMonitorData(async (path) => {
  requestedAihubMonitorPaths.push(path);
  if (path === "/api/v1/public/monitor/series/24h") throw new Error("non-json response");
  if (path === "/api/v1/public/monitor/summary") return aihubSummary;
  if (path === "/api/v1/groups/available") return aihubGroups;
  if (path === "/api/v1/groups/rates") return { 1: 0.04 };
  throw new Error(`unexpected path ${path}`);
}, "24h", "Asia/Shanghai");
assert.equal(degradedAihubMonitorData.summary, aihubSummary);
assert.deepEqual(JSON.parse(JSON.stringify(degradedAihubMonitorData.series)), {});
assert.match(degradedAihubMonitorData.seriesError.message, /non-json response/);
assert.deepEqual(
  requestedAihubMonitorPaths.slice().sort(),
  [
    "/api/v1/groups/available",
    "/api/v1/groups/rates",
    "/api/v1/public/monitor/series/24h",
    "/api/v1/public/monitor/summary",
    "/api/v1/public/providers?timezone=Asia%2FShanghai",
  ],
);

const providerSummary = {
  generated_at: new Date(aihubNow).toISOString(),
  items: [{
    code: "cheap",
    group_id: 1,
    rate_multiplier: 0.05,
    available: true,
    visible_in_hall: true,
    last_probed_at: new Date(aihubNow - 10_000).toISOString(),
    probe_ttft_ms: 1900,
    probe_e2e_ttft_ms: 2300,
    output_tps: 40,
    output_tokens: 20,
    success_rates: { "24h": 0.99 },
    cache_hit_rate: "88%",
    model_health: { sol: "healthy", terra: "healthy", luna: "failed" },
    model_detection: {
      applicable: true,
      status: "passed",
      model: "gpt-5.6-sol",
      confidence: "high",
      execution_complete: true,
      all_targets_passed: true,
      expires_at: new Date(aihubNow + 86_400_000).toISOString(),
    },
  }],
};
const providerSeries = {
  generated_at: new Date(aihubNow).toISOString(),
  items: [{ group_id: 1, probe: monitorSeries([false, true]) }],
};
const normalizedProviderData = api.normalizeAihubProviderData(providerSummary, providerSeries);
assert.equal(normalizedProviderData.summary.apis[0].firstTokenLatencyMs, 2300);
assert.deepEqual(
  JSON.parse(JSON.stringify(normalizedProviderData.summary.apis[0].modelHealth)),
  { sol: "healthy", terra: "healthy", luna: "failed" },
);
assert.equal(normalizedProviderData.summary.apis[0].modelDetection.status, "passed");
assert.equal(normalizedProviderData.summary.apis[0].modelDetection.modelKey, "sol");
assert.deepEqual(
  JSON.parse(JSON.stringify(api.buildAihubModelCatalog(normalizedProviderData.summary))),
  { data: [
    { model_name: "gpt-5.6-sol" },
    { model_name: "gpt-5.6-terra" },
    { model_name: "gpt-5.6-luna" },
  ] },
);
assert.equal(normalizedProviderData.series.seriesByApiId["1"].length, 2);
const providerPaths = [];
const loadedProviderData = await api.loadAihubMonitorData(async (path) => {
  providerPaths.push(path);
  if (path === "/api/v1/public/providers?timezone=Asia%2FShanghai") return providerSummary;
  if (path === "/api/v1/public/providers/series?range=24h&timezone=Asia%2FShanghai") return providerSeries;
  if (path === "/api/v1/groups/available") return aihubGroups;
  if (path === "/api/v1/groups/rates") return { 1: 0.04 };
  throw new Error(`unexpected path ${path}`);
}, "24h", "Asia/Shanghai");
assert.equal(loadedProviderData.source, "providers");
assert.equal(loadedProviderData.seriesError, null);
assert.equal(loadedProviderData.summary.apis[0].firstTokenLatencyMs, 2300);
assert.equal(providerPaths.some((path) => path.includes("/public/monitor/")), false);

const modelScopedAihubSummary = {
  generatedAt: new Date(aihubNow).toISOString(),
  monitoringActive: true,
  apis: [{
    id: "monitor-model-scoped",
    group_id: 1,
    planType: "cheap",
    enabled: true,
    available: false,
    checkedAt: new Date(aihubNow - 10_000).toISOString(),
    priceMultiplier: 0.05,
    firstTokenLatencyMs: 2_000,
    outputTokens: 20,
    outputTokensPerSecond: 40,
    cacheHitRate: "90%",
    modelHealth: { sol: "healthy", terra: "healthy", luna: "failed" },
    successRates: { "24h": 1 },
  }],
};
const modelScopedSeries = {
  seriesByApiId: { "monitor-model-scoped": monitorSeries([true, false]) },
};
const lunaProbeGroups = [{ id: 1, name: "cheap", rate_multiplier: 0.05, probe_model: "gpt-5.6-luna" }];
const solWithFailedLuna = api.evaluateAihubCandidates(
  modelScopedAihubSummary,
  modelScopedSeries,
  lunaProbeGroups,
  { 1: 0.04 },
  aihubConfig,
  aihubNow,
)[0];
assert.equal(solWithFailedLuna.probeModelKey, "luna");
assert.equal(solWithFailedLuna.modelHealthStatus, "healthy");
assert.equal(solWithFailedLuna.latestSuccess, 100);
assert.equal(solWithFailedLuna.available, true);
assert.equal(solWithFailedLuna.reasons.includes("latest-unavailable"), false);

const lunaWithFailedLuna = api.evaluateAihubCandidates(
  modelScopedAihubSummary,
  modelScopedSeries,
  lunaProbeGroups,
  { 1: 0.04 },
  api.sanitizeConfig({ ...aihubConfig, model: "gpt-5.6-luna" }),
  aihubNow,
)[0];
assert.equal(lunaWithFailedLuna.modelHealthStatus, "failed");
assert.equal(lunaWithFailedLuna.latestSuccess, 0);
assert.equal(lunaWithFailedLuna.available, false);
assert.ok(lunaWithFailedLuna.reasons.includes("model-unavailable"));

const solProbeGroups = [{ id: 1, name: "cheap", rate_multiplier: 0.05, probe_model: "gpt-5.6-sol" }];
const failedLatestSolProbe = api.evaluateAihubCandidates(
  modelScopedAihubSummary,
  modelScopedSeries,
  solProbeGroups,
  { 1: 0.04 },
  aihubConfig,
  aihubNow,
)[0];
assert.equal(failedLatestSolProbe.latestSuccess, 0);
assert.equal(failedLatestSolProbe.available, false);
assert.ok(failedLatestSolProbe.reasons.includes("latest-unavailable"));

const detectionBaseSummary = {
  ...modelScopedAihubSummary,
  apis: [{
    ...modelScopedAihubSummary.apis[0],
    available: true,
    modelDetection: {
      applicable: true,
      status: "passed",
      model: "gpt-5.6-sol",
      executionComplete: true,
      allTargetsPassed: true,
      expiresAt: new Date(aihubNow + 86_400_000).toISOString(),
    },
  }],
};
const healthySolSeries = { seriesByApiId: { "monitor-model-scoped": monitorSeries([true, true]) } };
const evaluateDetection = (detection, model = "gpt-5.6-sol") => api.evaluateAihubCandidates(
  {
    ...detectionBaseSummary,
    apis: [{ ...detectionBaseSummary.apis[0], modelDetection: detection }],
  },
  healthySolSeries,
  solProbeGroups,
  { 1: 0.04 },
  api.sanitizeConfig({ ...aihubConfig, model }),
  aihubNow,
)[0];
const passedDetection = evaluateDetection(detectionBaseSummary.apis[0].modelDetection);
assert.equal(passedDetection.available, true);
assert.equal(passedDetection.modelDetectionStatus, "passed");
assert.equal(passedDetection.modelDetectionModelKey, "sol");

const suspectedDetection = evaluateDetection({
  ...detectionBaseSummary.apis[0].modelDetection,
  status: "suspected",
});
assert.equal(suspectedDetection.available, false);
assert.ok(suspectedDetection.reasons.includes("model-detection-suspected"));
assert.equal(api.candidateHasHealthFailure(suspectedDetection), true);

const insufficientDetection = evaluateDetection({
  ...detectionBaseSummary.apis[0].modelDetection,
  status: "insufficient_evidence",
});
assert.ok(insufficientDetection.reasons.includes("model-detection-insufficient"));

const failedDetection = evaluateDetection({
  ...detectionBaseSummary.apis[0].modelDetection,
  status: "detection_failed",
});
assert.ok(failedDetection.reasons.includes("model-detection-failed"));

const expiredDetection = evaluateDetection({
  ...detectionBaseSummary.apis[0].modelDetection,
  expiresAt: new Date(aihubNow - 1).toISOString(),
});
assert.ok(expiredDetection.reasons.includes("model-detection-expired"));

const incompleteDetection = evaluateDetection({
  ...detectionBaseSummary.apis[0].modelDetection,
  allTargetsPassed: false,
});
assert.ok(incompleteDetection.reasons.includes("model-detection-incomplete"));

const otherModelDetection = evaluateDetection({
  ...detectionBaseSummary.apis[0].modelDetection,
  model: "gpt-5.6-terra",
});
assert.equal(otherModelDetection.available, true, "Sol checks must ignore Terra-scoped detection evidence");

const legacyWithoutDetection = evaluateDetection(null);
assert.equal(legacyWithoutDetection.available, true, "legacy provider rows without detection must stay compatible");

const cappedAihubCandidates = api.evaluateAihubCandidates(
  aihubSummary,
  aihubSeries,
  aihubGroups,
  { 1: 0.04 },
  api.sanitizeConfig({ ...aihubConfig, maxGroupRatio: 0.03 }),
  aihubNow,
);
assert.ok(cappedAihubCandidates.find((item) => item.group === "cheap").reasons.includes("ratio-too-high"));
assert.equal(api.selectBestCandidate(cappedAihubCandidates, "cheap").group, "recent-bad");

const delayedAihubCandidates = api.evaluateAihubCandidates(
  aihubSummary,
  aihubSeries,
  aihubGroups,
  { 1: 0.04 },
  api.sanitizeConfig({ ...aihubConfig, maxFirstTokenLatencySeconds: 10, maxOutputDurationSeconds: 0.4 }),
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
    ...aihubConfig,
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
const withAihubCachePricing = (candidate) => ({
  ...candidate,
  cachePricingModel: api.AIHUB_CACHE_PRICING,
});
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
].map(withAihubCachePricing);
assert.equal(api.selectBestCandidate(strategyCandidates, "", "saving").group, "most-stable");
assert.equal(api.selectBestCandidate(strategyCandidates, "", "stable").group, "most-stable");
assert.equal(api.selectBestCandidate(strategyCandidates, "", "balanced").group, "balanced-choice");
assert.ok(
  api.candidateHealthScore(strategyCandidates[2]) > api.candidateHealthScore(strategyCandidates[1]),
  "stable scoring should reward recent success, latency, output time, and cache hit rate",
);
assert.ok(
  Math.abs(api.cacheUnitCost(97) - 0.635) < 1e-12,
  "the 97% cache baseline should cost 0.635 per million input tokens",
);
[
  { group: "A027-BugTeam", ratio: 0.04, cacheHitRate: 81.49, displayed: 0.08 },
  { group: "A015-Plus", ratio: 0.08, cacheHitRate: 92.31, displayed: 0.11 },
  { group: "A003-Pro", ratio: 0.22, cacheHitRate: 94.7, displayed: 0.26 },
  { group: "A015-Pro", ratio: 0.16, cacheHitRate: 91.02, displayed: 0.23 },
].map(withAihubCachePricing).forEach((example) => {
  assert.equal(
    Number(api.candidateEffectiveRatio(example).toFixed(2)),
    example.displayed,
    `${example.group} should match the AIHub channel-status actual ratio`,
  );
});
assert.ok(
  Math.abs(api.candidateEffectiveRatio(withAihubCachePricing({ ratio: 0.1, cacheHitRate: 60 })) - 0.36220472440944884) < 1e-12,
  "candidate actual ratio should use current cache cost over the 97% baseline",
);
const cacheBalancedSavingCandidates = [
  { group: "lower-ratio", available: true, ratio: 0.05, cacheHitRate: 10 },
  { group: "higher-cache", available: true, ratio: 0.06, cacheHitRate: 90 },
].map(withAihubCachePricing);
assert.equal(
  api.selectBestCandidate(cacheBalancedSavingCandidates, "", "saving").group,
  "higher-cache",
  "saving mode should allow a much higher cache hit rate to offset a small ratio increase",
);
assert.equal(
  api.selectBestCandidate([
    { group: "much-lower-ratio", available: true, ratio: 0.05, cacheHitRate: 10 },
    { group: "much-higher-cache", available: true, ratio: 0.1, cacheHitRate: 90 },
  ].map(withAihubCachePricing), "", "saving").group,
  "much-higher-cache",
  "saving mode should compare calculated effective multipliers instead of arbitrary ranking weights",
);
assert.equal(
  api.selectBestCandidate([
    { group: "lower-effective-ratio", available: true, ratio: 0.05, cacheHitRate: 10 },
    { group: "higher-effective-ratio", available: true, ratio: 0.2, cacheHitRate: 50 },
  ].map(withAihubCachePricing), "", "saving").group,
  "lower-effective-ratio",
  "a cache discount should not beat a nominal ratio when its calculated effective multiplier is higher",
);
assert.equal(
  api.selectBestCandidate([
    { group: "known-cache", available: true, ratio: 0.1, cacheHitRate: 90 },
    { group: "unknown-cache", available: true, ratio: 0.015, cacheHitRate: null },
  ].map(withAihubCachePricing), "", "saving").group,
  "unknown-cache",
  "a candidate with missing cache data should conservatively use its nominal ratio",
);
assert.equal(api.candidateEffectiveRatio({ ratio: 0.06, cacheHitRate: null }), 0.06);
assert.equal(
  api.candidateEffectiveRatio({ ratio: 0.06, cacheHitRate: 99 }),
  0.06,
  "cache metrics without a confirmed pricing model must fall back to the nominal ratio",
);
assert.equal(
  api.hasEffectiveRatioEstimate({ ratio: 0.06, cacheHitRate: 99 }),
  false,
  "a cache rate alone must not be presented as an actual multiplier",
);
assert.equal(
  api.selectBestCandidate([
    { group: "current-low-cache", available: true, ratio: 0.05, cacheHitRate: 10 },
    { group: "same-ratio-high-cache", available: true, ratio: 0.05, cacheHitRate: 90 },
  ].map(withAihubCachePricing), "current-low-cache", "saving").group,
  "same-ratio-high-cache",
  "saving mode should switch away from the current group when the same ratio has a higher cache rate",
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

console.log("selection tests passed");
