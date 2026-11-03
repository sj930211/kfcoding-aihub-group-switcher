// ==UserScript==
// @name         KFCoding 智能低倍率分组切换
// @namespace    https://kfcoding.codes/
// @version      2.1.0
// @description  AIHub 专用分组工作台：监控范围、模型检测详情、1h 综合质量与故障转移。
// @author       sj930211
// @license      MIT
// @homepageURL  https://github.com/sj930211/kfcoding-aihub-group-switcher
// @supportURL   https://github.com/sj930211/kfcoding-aihub-group-switcher/issues
// @downloadURL  https://raw.githubusercontent.com/sj930211/kfcoding-aihub-group-switcher/main/kfcoding-group-switcher.user.js
// @updateURL    https://raw.githubusercontent.com/sj930211/kfcoding-aihub-group-switcher/main/kfcoding-group-switcher.user.js
// @match        https://aihub.top/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  "use strict";

  const SITE_METADATA = Object.freeze({
    kfcoding: Object.freeze({
      id: "kfcoding",
      hostname: "kfcoding.codes",
      label: "KFCoding",
      shortLabel: "KF",
      storagePrefix: "kfcoding-group-switcher",
      apiFamily: "new-api",
    }),
    aihub: Object.freeze({
      id: "aihub",
      hostname: "aihub.top",
      label: "AIHub",
      shortLabel: "AH",
      storagePrefix: "aihub-group-switcher",
      apiFamily: "aihub",
    }),
    ooioo: Object.freeze({
      id: "ooioo",
      hostname: "ooioo.work",
      label: "ooioo",
      shortLabel: "OO",
      storagePrefix: "ooioo-group-switcher",
      apiFamily: "new-api",
    }),
    fluxionai: Object.freeze({
      id: "fluxionai",
      hostname: "fluxionai.space",
      label: "FluxionAI",
      shortLabel: "FX",
      storagePrefix: "fluxionai-group-switcher",
      apiFamily: "aihub",
    }),
  });

  function detectSiteId(value) {
    const normalized = String(value || "").trim().toLowerCase();
    const matched = Object.values(SITE_METADATA).find((site) => site.hostname === normalized);
    return matched ? matched.id : "kfcoding";
  }

  function storagePrefixForSite(siteId) {
    return (SITE_METADATA[siteId] || SITE_METADATA.kfcoding).storagePrefix;
  }

  const hostname = String((globalThis.location && globalThis.location.hostname) || "").toLowerCase();
  const previewSiteId = globalThis.__KFCODING_GROUP_SWITCHER_PREVIEW__ === true
    ? String(globalThis.__KFCODING_GROUP_SWITCHER_PREVIEW_SITE_ID__ || "")
    : "";
  const SITE_ID = SITE_METADATA[previewSiteId] ? previewSiteId : detectSiteId(hostname);
  const SITE = SITE_METADATA[SITE_ID];
  const IS_AIHUB = SITE_ID === "aihub";
  const IS_FLUXION = SITE_ID === "fluxionai";
  const IS_AIHUB_API = SITE.apiFamily === "aihub";
  const IS_NEW_API_SITE = SITE.apiFamily === "new-api";
  const SITE_LABEL = SITE.label;
  const SITE_SHORT_LABEL = SITE.shortLabel;
  const AIHUB_LEGACY_MONITOR_MODEL = "AIHub 公共渠道监测";
  const MODEL_IDENTITY_SEPARATOR = "\u001f";
  const AIHUB_MODEL_NAMES = Object.freeze({
    sol: "gpt-5.6-sol",
    terra: "gpt-5.6-terra",
    luna: "gpt-5.6-luna",
    astra: "gpt-6-astra",
  });
  const SCRIPT_VERSION = "2.1.0";
  const SCRIPT_DOWNLOAD_URL = "https://raw.githubusercontent.com/sj930211/kfcoding-aihub-group-switcher/main/kfcoding-group-switcher.user.js";
  /*
  const AIHUB_CACHE_PRICING = Object.freeze({
    baselineHitRate: 97,
    hitUnitPrice: 0.5,
    missUnitPrice: 5,
  });
  */

  const DEFAULT_CONFIG = Object.freeze({
    theme: "system",
    glassTransparency: 0,
    enabled: false,
    tokenIds: [],
    models: [],
    model: "",
    automaticSwitchMode: "strategy",
    businessPlatform: "",
    selectionMode: "quality",
    qualityWeights: Object.freeze({ success: 40, cache: 30, tps: 20, ratio: 10 }),
    minQualityGain: 5,
    tokenModels: Object.freeze({}),
    monitorScopeMode: "all",
    monitorGroupIds: [],
    monitorScopeMigrationPending: false,
    monitorScopeMigrationPlatform: "",
    minMetricSamples: 10,
    minCacheSamples: 10,
    groupFilterMode: "whitelist",
    groupWhitelist: [],
    groupBlacklist: [],
    requireModelDetection: true,
    spendProtectionEnabled: false,
    dailySpendLimit: 0,
    pollSeconds: 30,
    strategySeconds: 300,
    metricHours: 24,
    minSuccessRate: 95,
    minLatestSuccessRate: 95,
    maxMetricAgeMinutes: 180,
    maxFirstTokenLatencySeconds: 120,
    maxOutputDurationSeconds: 0,
    maxGroupRatio: 0,
    confirmPolls: 2,
    switchHoldMinutes: 10,
    rollbackChecks: 2,
    blacklistMinutes: 60,
  });

  const STORAGE_PREFIX = storagePrefixForSite(SITE_ID);
  const STORAGE_CONFIG = `${STORAGE_PREFIX}:config:v1`;
  const STORAGE_LAST_SWITCH = `${STORAGE_PREFIX}:last-switch:v1`;
  const STORAGE_LOGS = `${STORAGE_PREFIX}:logs:v1`;
  const STORAGE_POSITIONS = `${STORAGE_PREFIX}:positions:v1`;
  const STORAGE_UI = `${STORAGE_PREFIX}:ui:v1`;
  const STORAGE_SWITCH_GUARD = `${STORAGE_PREFIX}:switch-guard:v1`;
  const STORAGE_SPEND_GUARD = `${STORAGE_PREFIX}:spend-guard:v1`;
  const STORAGE_UPDATE_NOTICE = "kfcoding-aihub-group-switcher:update-notice:v1";
  const MAX_LOG_ENTRIES = 10;
  const VIEWPORT_MARGIN = 8;
  const HOST_ID = `${STORAGE_PREFIX}-host`;
  const GET_REQUEST_TIMEOUT_MS = 25000;
  const MUTATION_REQUEST_TIMEOUT_MS = 30000;
  const GET_MAX_ATTEMPTS = 3;
  const AUTO_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const STATISTICS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const SPEND_WARNING_RATIO = 0.8;
  const NEW_API_PUBLIC_API_PATHS = new Set([
    "/api/pricing",
    "/api/perf-metrics",
    "/api/status",
  ]);
  const NEW_API_AUTH_REFRESH_DELAYS_MS = [0, 80, 200, 500];

  function clampNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function normalizeThemeMode(value) {
    return ["system", "light", "dark"].includes(value) ? value : DEFAULT_CONFIG.theme;
  }

  function normalizeGlassTransparency(value) {
    return Math.round(clampNumber(value, DEFAULT_CONFIG.glassTransparency, 0, 100));
  }

  function resolveGlassMaterial(theme, transparency) {
    const ratio = normalizeGlassTransparency(transparency) / 100;
    const light = theme === "light";
    const alphaAt = (defaultAlpha, minimumAlpha) => ratio <= 0.6
      ? 1 - ((1 - defaultAlpha) * (ratio / 0.6))
      : defaultAlpha - ((defaultAlpha - minimumAlpha) * ((ratio - 0.6) / 0.4));
    const startAlpha = light ? alphaAt(0.62, 0.34) : alphaAt(0.49, 0.2);
    const endAlpha = light ? alphaAt(0.48, 0.24) : alphaAt(0.38, 0.12);
    const startColor = light ? "255 255 255" : "31 37 45";
    const endColor = light ? "235 240 244" : "13 17 22";
    return `linear-gradient(135deg, rgb(${startColor} / ${Math.round(startAlpha * 100)}%), rgb(${endColor} / ${Math.round(endAlpha * 100)}%))`;
  }

  function normalizeActiveView(value) {
    return ["monitor", "statistics", "diagnostics", "settings"].includes(value) ? value : "monitor";
  }

  function normalizeSelectionMode(value) {
    return "quality";
  }

  function normalizeAutomaticSwitchMode(value) {
    return value === "failover" ? "failover" : "strategy";
  }

  function validQualityWeights(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value)
      && ["success", "cache", "tps", "ratio"].every((key) => value[key] !== null && value[key] !== ""
        && Number.isInteger(Number(value[key])) && Number(value[key]) >= 0 && Number(value[key]) <= 100)
      && ["success", "cache", "tps", "ratio"].reduce((sum, key) => sum + Number(value[key]), 0) === 100);
  }

  function normalizeQualityWeights(value) {
    const source = validQualityWeights(value) ? value : DEFAULT_CONFIG.qualityWeights;
    return Object.fromEntries(["success", "cache", "tps", "ratio"].map((key) => [key, Number(source[key])]));
  }

  function normalizeBusinessPlatform(value) {
    const key = String(value || "").normalize("NFKC").trim().toLowerCase().replace(/[\s_-]+/g, "");
    if (["zhipu", "zhipuglm", "glm"].includes(key)) return "zhipu";
    return ["openai", "deepseek", "kimi", "grok", "unknown"].includes(key) ? key : "";
  }

  function selectionModeLabel(value) {
    return "1h 综合质量";
  }

  function normalizeMonitorGroupIds(value) {
    return [...new Set((Array.isArray(value) ? value : []).map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0))];
  }

  function resolveThemeMode(value, prefersDark) {
    const theme = normalizeThemeMode(value);
    return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function normalizeSpendGuard(value, dateKey) {
    const source = value && typeof value === "object" ? value : {};
    const today = String(dateKey || localDateKey());
    if (source.dateKey !== today) {
      return { dateKey: today, baselineSpend: 0, warnedApproaching: false, warnedReached: false };
    }
    return {
      dateKey: today,
      baselineSpend: Math.max(0, Number(source.baselineSpend) || 0),
      warnedApproaching: Boolean(source.warnedApproaching),
      warnedReached: Boolean(source.warnedReached),
    };
  }

  function evaluateSpendProtection(usage, config, guard, dateKey) {
    const today = String(dateKey || localDateKey());
    const normalizedGuard = normalizeSpendGuard(guard, today);
    const limit = Math.max(0, Number(config && config.dailySpendLimit) || 0);
    const available = Boolean(usage && usage.available);
    const active = Boolean(config && config.spendProtectionEnabled && limit > 0 && available);
    const actualSpend = available ? Math.max(0, Number(usage.spend) || 0) : 0;
    const trackedSpend = Math.max(0, actualSpend - normalizedGuard.baselineSpend);
    const ratio = active ? trackedSpend / limit : 0;
    const tone = !active ? "none" : ratio >= 1 ? "reached" : ratio >= SPEND_WARNING_RATIO ? "approaching" : "normal";
    return {
      active,
      tone,
      actualSpend,
      trackedSpend,
      limit,
      ratio,
      remaining: active ? Math.max(0, limit - trackedSpend) : 0,
      guard: normalizedGuard,
    };
  }

  function parseAllowedGroups(value) {
    const source = Array.isArray(value) ? value : String(value || "").split(/[,，\n]/);
    return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
  }

  function parseTokenIds(value, legacyTokenId) {
    const source = Array.isArray(value) ? value : [];
    const values = source.length ? source : [legacyTokenId];
    return [...new Set(
      values
        .map((item) => Math.trunc(Number(item) || 0))
        .filter((item) => item > 0),
    )];
  }

  function normalizeTargetModels(value, legacyModel) {
    const source = Array.isArray(value) && value.length ? value : [legacyModel];
    return [...new Set(source.map((item) => String(item || "").trim()).filter(Boolean))];
  }

  function targetModels(config) {
    const source = config && typeof config === "object" ? config : {};
    return normalizeTargetModels(source.models, source.model);
  }

  function targetModelIdentity(config) {
    return targetModels(config).slice().sort().join(MODEL_IDENTITY_SEPARATOR);
  }

  function normalizeTokenModels(value, ids, models) {
    if (value === undefined) return models.length === 1
      ? Object.fromEntries(ids.map((id) => [id, models[0]])) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([id, model]) => Number.isSafeInteger(Number(id))
      && Number(id) > 0 && typeof model === "string" && model.trim()).map(([id, model]) => [String(Number(id)), model.trim()]));
  }

  function tokenDecisionModel(settings, tokenId) {
    const model = settings.tokenModels?.[Number(tokenId)] || "";
    return targetModels(settings).includes(model) ? model : "";
  }

  function targetModelLabel(config) {
    return targetModels(config).join("、");
  }

  function modelIdentityLabel(value) {
    return String(value || "").split(MODEL_IDENTITY_SEPARATOR).filter(Boolean).join("、");
  }

  function activeGroupFilter(config) {
    return config.groupFilterMode === "blacklist"
      ? config.groupBlacklist || []
      : config.groupWhitelist || [];
  }

  function requiresTokenSelection(siteId, options) {
    const request = options && typeof options === "object" ? options : {};
    const isMonitorOnlyCheck = ["aihub", "fluxionai"].includes(siteId)
      && Boolean(request.manual)
      && !Boolean(request.forceSwitch)
      && !String(request.targetGroup || "").trim();
    return !isMonitorOnlyCheck;
  }

  function normalizeLogs(value) {
    if (!Array.isArray(value)) return [];
    const tones = new Set(["info", "success", "warning", "error"]);
    return value
      .filter((entry) => entry && typeof entry === "object" && String(entry.message || "").trim())
      .map((entry) => ({
        at: String(entry.at || "-").slice(0, 32),
        message: String(entry.message).trim().slice(0, 500),
        tone: tones.has(entry.tone) ? entry.tone : "info",
      }))
      .slice(0, MAX_LOG_ENTRIES);
  }

  function normalizePosition(value) {
    if (!value || typeof value !== "object") return null;
    const x = Number(value.x);
    const y = Number(value.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }

  function normalizeUiPositions(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      launcher: normalizePosition(source.launcher),
      panel: normalizePosition(source.panel),
    };
  }

  function normalizeSwitchHistory(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawEntries = source.byToken && typeof source.byToken === "object"
      ? Object.entries(source.byToken)
      : Number(source.tokenId) > 0
        ? [[String(source.tokenId), source]]
        : [];
    const byToken = {};
    rawEntries.forEach(([tokenId, entry]) => {
      const id = Math.trunc(Number(tokenId) || 0);
      if (id <= 0 || !entry || typeof entry !== "object") return;
      byToken[id] = {
        model: String(entry.model || ""),
        group: String(entry.group || ""),
        at: Math.max(0, Number(entry.at) || 0),
      };
    });
    return { byToken };
  }

  function normalizeSwitchGuardState(value) {
    const source = value && typeof value === "object" ? value : {};
    const rawByToken = source.byToken && typeof source.byToken === "object"
      ? Object.entries(source.byToken)
      : [];
    const byToken = {};
    rawByToken.forEach(([tokenId, entry]) => {
      const id = Math.trunc(Number(tokenId) || 0);
      if (id <= 0 || !entry || typeof entry !== "object") return;
      const fromGroup = String(entry.fromGroup || "").trim();
      const toGroup = String(entry.toGroup || "").trim();
      const [fromGroupId] = normalizeMonitorGroupIds([entry.fromGroupId]);
      const [toGroupId] = normalizeMonitorGroupIds([entry.toGroupId]);
      const remaining = Math.trunc(clampNumber(entry.remaining, 0, 0, 10));
      const sameGroup = fromGroupId && toGroupId ? fromGroupId === toGroupId : fromGroup === toGroup;
      if (!fromGroup || !toGroup || sameGroup || remaining <= 0) return;
      byToken[id] = {
        model: String(entry.model || ""),
        fromGroup,
        toGroup,
        ...(fromGroupId ? { fromGroupId } : {}),
        ...(toGroupId ? { toGroupId } : {}),
        remaining,
        at: Math.max(0, Number(entry.at) || 0),
        switchAt: Math.max(0, Number(entry.switchAt) || 0),
        lastEvidence: String(entry.lastEvidence || ""),
        seenEvidence: (Array.isArray(entry.seenEvidence) ? entry.seenEvidence : []).filter((item) => typeof item === "string").slice(-20),
        initialEvidence: String(entry.initialEvidence || ""),
      };
    });
    const blacklist = (Array.isArray(source.blacklist) ? source.blacklist : [])
      .filter((entry) => entry && typeof entry === "object" && entry.type !== "image")
      .map((entry) => ({
        model: String(entry.model || ""),
        group: String(entry.group || "").trim(),
        ...(Number.isSafeInteger(Number(entry.groupId)) && Number(entry.groupId) > 0 ? { groupId: Number(entry.groupId) } : {}),
        until: Math.max(0, Number(entry.until) || 0),
        ...(entry.type === "health" ? { type: entry.type,
          reason: String(entry.reason || "").slice(0, 180) } : {}),
      }))
      .filter((entry) => entry.model && entry.group && entry.until > 0)
      .slice(0, 100);
    return { byToken, blacklist };
  }

  function pruneSwitchGuardState(value, now) {
    const state = normalizeSwitchGuardState(value);
    state.blacklist = state.blacklist.filter((entry) => entry.until > now);
    return state;
  }

  function listActiveIsolations(value, now) {
    const timestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    return pruneSwitchGuardState(value, timestamp).blacklist
      .slice()
      .sort((left, right) => left.until - right.until || left.model.localeCompare(right.model) || left.group.localeCompare(right.group));
  }

  function removeIsolation(value, model, group, now, groupId) {
    const state = pruneSwitchGuardState(value, Number.isFinite(Number(now)) ? Number(now) : Date.now());
    const targetModel = String(model || "");
    const targetGroup = String(group || "").trim();
    const hasId = groupId !== undefined && groupId !== null;
    const targetId = Number(groupId);
    const validId = Number.isSafeInteger(targetId) && targetId > 0;
    const matches = state.blacklist.filter((entry) => entry.model === targetModel
      && (hasId ? validId && entry.groupId === targetId : entry.group === targetGroup));
    // Legacy callers may use a unique name; an ambiguous name must never clear siblings.
    const removed = hasId || matches.length === 1 ? matches : [];
    state.blacklist = state.blacklist.filter((entry) => !removed.includes(entry));
    return { state, removed };
  }

  function removeAllIsolations(value, now) {
    const state = pruneSwitchGuardState(value, Number.isFinite(Number(now)) ? Number(now) : Date.now());
    const removed = state.blacklist.slice();
    state.blacklist = [];
    return { state, removed };
  }

  function restoreIsolations(value, entries, now) {
    const timestamp = Number.isFinite(Number(now)) ? Number(now) : Date.now();
    const state = pruneSwitchGuardState(value, timestamp);
    const restored = normalizeSwitchGuardState({ blacklist: entries }).blacklist
      .filter((entry) => entry.until > timestamp);
    const byKey = new Map(
      state.blacklist.map((entry) => [`${entry.model}\u0000${entry.groupId ? "id:" + entry.groupId : "name:" + entry.group}\u0000${entry.type || "health"}`, entry]),
    );
    restored.forEach((entry) => {
      const key = `${entry.model}\u0000${entry.groupId ? "id:" + entry.groupId : "name:" + entry.group}\u0000${entry.type || "health"}`;
      const current = byKey.get(key);
      if (!current || current.until < entry.until) byKey.set(key, entry);
    });
    state.blacklist = [...byKey.values()].slice(0, 100);
    return state;
  }

  function applyTemporaryBlacklist(candidates, guardState, model, now, options) {
    const blocked = normalizeSwitchGuardState(guardState).blacklist
      .filter((entry) => entry.until > now);
    return candidates.map((candidate) => {
      const reasons = candidate.reasons.filter((reason) => reason !== "temporarily-blacklisted");
      if (blocked.some((entry) => entry.model === (candidate.aihubMetricModel || model)
        && (entry.groupId ? Number(candidate.groupId) === entry.groupId : candidate.group === entry.group))) {
        reasons.unshift("temporarily-blacklisted");
      }
      return { ...candidate, reasons, emergencyEligible: candidate.emergencyEligible === true && !reasons.includes("temporarily-blacklisted"),
        available: reasons.length === 0 && (candidate.available || candidate.reasons.includes("temporarily-blacklisted")) };
    });
  }

  function candidateHasHealthFailure(candidate) {
    if (!candidate) return true;
    const healthReasons = new Set([
      "metrics-missing",
      "metrics-stale",
      "success-low",
      "latest-success-low",
      "first-token-latency-high",
      "output-latency-high",
      "monitor-disabled",
      "latest-unavailable",
      "model-unavailable",
      "model-status-unknown",
      "model-detection-suspected",
      "model-detection-insufficient",
      "model-detection-failed",
      "model-detection-expired",
      "model-detection-incomplete",
      "model-detection-unknown",
    ]);
    return candidate.reasons.some((reason) => healthReasons.has(reason));
  }

  function healthMetricNumber(value) {
    if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function candidateHasExplicitHealthFailure(candidate, settings) {
    if (!candidate) return false;
    if (Array.isArray(candidate.modelResults)) {
      return candidate.modelResults.some((entry) => candidateHasExplicitHealthFailure(entry.candidate, settings));
    }
    if (candidate.providerId === "aihub") {
      const evidence = candidate.healthEvidence;
      if (!evidence || evidence.providerVersionValid !== true || !evidence.supported || !evidence.monitoringActive
        || !targetModels(settings).includes(evidence.model)) return false;
      if (evidence.modelDetectionFresh === true && evidence.modelDetectionFailed === true) return true;
      return candidate.aggregateSuccessWindow === "1h" && evidence.metricsMatchModel === true && evidence.sufficientSamples === true
        && Number.isFinite(evidence.ageMinutes) && evidence.ageMinutes >= 0 && evidence.ageMinutes <= 60
        && Number.isFinite(candidate.aggregateSuccess) && candidate.aggregateSuccess >= 0
        && candidate.aggregateSuccess < settings.minSuccessRate;
    }
    const evidence = candidate.healthEvidence;
    if (!evidence || evidence.monitoringActive !== true || evidence.supported !== true) return false;
    if (!targetModels(settings).some((model) => normalizeAihubModelKey(model) === normalizeAihubModelKey(evidence.model))) return false;
    const fresh = (age) => Number.isFinite(age) && age >= 0 && age <= settings.maxMetricAgeMinutes;
    if (evidence.modelHealthFailed === true && fresh(evidence.modelHealthAgeMinutes)) return true;
    if (settings.requireModelDetection && evidence.modelDetectionFailed === true && evidence.modelDetectionFresh === true) return true;
    if (evidence.metricsMatchModel !== true) return false;
    const percentBelow = (value, threshold) => Number.isFinite(value) && value >= 0 && value <= 100 && value < threshold;
    const latencyAbove = (value, threshold) => threshold > 0 && Number.isFinite(value) && value > 0 && value > threshold * 1000;
    return (fresh(evidence.ageMinutes) && (
      percentBelow(candidate.aggregateSuccess, settings.minSuccessRate)
      || latencyAbove(candidate.firstTokenLatencyMs, settings.maxFirstTokenLatencySeconds)
      || latencyAbove(candidate.outputLatencyMs, settings.maxOutputDurationSeconds)
    )) || (fresh(evidence.latestAgeMinutes) && percentBelow(candidate.latestSuccess, settings.minLatestSuccessRate));
  }

  function selectRollbackCandidate(candidates, previousGroup, mode) {
    const matches = candidates.filter((candidate) => Number(previousGroup?.groupId) > 0
      ? Number(candidate.groupId) === Number(previousGroup.groupId)
      : candidate.group === String(previousGroup?.group || previousGroup || ""));
    const previous = matches.length === 1 && matches[0].available && matches[0].scopeEligible !== false ? matches[0] : null;
    return {
      candidate: previous || selectBestCandidate(candidates, "", mode),
      usedPrevious: Boolean(previous),
    };
  }

  function clampPosition(position, viewportWidth, viewportHeight, elementWidth, elementHeight) {
    const source = normalizePosition(position) || { x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN };
    const maxX = Math.max(VIEWPORT_MARGIN, Number(viewportWidth) - Number(elementWidth) - VIEWPORT_MARGIN);
    const maxY = Math.max(VIEWPORT_MARGIN, Number(viewportHeight) - Number(elementHeight) - VIEWPORT_MARGIN);
    return {
      x: Math.min(maxX, Math.max(VIEWPORT_MARGIN, source.x)),
      y: Math.min(maxY, Math.max(VIEWPORT_MARGIN, source.y)),
    };
  }

  function sanitizeConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    const models = normalizeTargetModels(source.models, source.model);
    const groupFilterMode = source.groupFilterMode === "blacklist" ? "blacklist" : "whitelist";
    const hasModeAwareLegacyFilter = source.groupFilterGroups !== undefined;
    const legacyGroupFilter = parseAllowedGroups(
      hasModeAwareLegacyFilter ? source.groupFilterGroups : source.allowedGroups,
    );
    const groupWhitelist = parseAllowedGroups(
      source.groupWhitelist !== undefined
        ? source.groupWhitelist
        : (!hasModeAwareLegacyFilter || groupFilterMode === "whitelist" ? legacyGroupFilter : []),
    );
    const groupBlacklist = parseAllowedGroups(
      source.groupBlacklist !== undefined
        ? source.groupBlacklist
        : (hasModeAwareLegacyFilter && groupFilterMode === "blacklist" ? legacyGroupFilter : []),
    );
    const legacyPlatform = normalizeBusinessPlatform(source.businessPlatform);
    const hasMonitorScope = source.monitorScopeMode !== undefined || Array.isArray(source.monitorGroupIds);
    const monitorScopeMigrationPending = source.monitorScopeMigrationPending === true
      || (!hasMonitorScope && Boolean(legacyPlatform));
    return {
      theme: normalizeThemeMode(source.theme),
      glassTransparency: normalizeGlassTransparency(source.glassTransparency),
      enabled: Boolean(source.enabled),
      tokenIds: parseTokenIds(source.tokenIds, source.tokenId),
      tokenModels: normalizeTokenModels(source.tokenModels, parseTokenIds(source.tokenIds, source.tokenId), models),
      models,
      model: models[0] || "",
      automaticSwitchMode: normalizeAutomaticSwitchMode(source.automaticSwitchMode),
      businessPlatform: normalizeBusinessPlatform(source.businessPlatform),
      selectionMode: normalizeSelectionMode(source.selectionMode),
      qualityWeights: normalizeQualityWeights(source.qualityWeights),
      minQualityGain: clampNumber(source.minQualityGain, DEFAULT_CONFIG.minQualityGain, 0, 100),
      monitorScopeMode: hasMonitorScope ? (source.monitorScopeMode === "selected" ? "selected" : "all")
        : (legacyPlatform ? "selected" : "all"),
      monitorGroupIds: normalizeMonitorGroupIds(source.monitorGroupIds),
      monitorScopeMigrationPending,
      monitorScopeMigrationPlatform: monitorScopeMigrationPending
        ? normalizeBusinessPlatform(source.monitorScopeMigrationPlatform || legacyPlatform) : "",
      minMetricSamples: Math.trunc(clampNumber(source.minMetricSamples, DEFAULT_CONFIG.minMetricSamples, 1, 1000000)),
      minCacheSamples: Math.trunc(clampNumber(source.minCacheSamples, DEFAULT_CONFIG.minCacheSamples, 1, 1000000)),
      groupFilterMode,
      groupWhitelist,
      groupBlacklist,
      requireModelDetection: true,
      spendProtectionEnabled: Boolean(source.spendProtectionEnabled),
      dailySpendLimit: clampNumber(source.dailySpendLimit, DEFAULT_CONFIG.dailySpendLimit, 0, 1000000000),
      pollSeconds: clampNumber(source.pollSeconds, DEFAULT_CONFIG.pollSeconds, 15, 3600),
      strategySeconds: clampNumber(source.strategySeconds, DEFAULT_CONFIG.strategySeconds, 15, 3600),
      metricHours: clampNumber(source.metricHours, DEFAULT_CONFIG.metricHours, 1, 168),
      minSuccessRate: clampNumber(source.minSuccessRate, DEFAULT_CONFIG.minSuccessRate, 0, 100),
      minLatestSuccessRate: clampNumber(
        source.minLatestSuccessRate,
        DEFAULT_CONFIG.minLatestSuccessRate,
        0,
        100,
      ),
      maxMetricAgeMinutes: clampNumber(
        source.maxMetricAgeMinutes,
        DEFAULT_CONFIG.maxMetricAgeMinutes,
        5,
        1440,
      ),
      maxFirstTokenLatencySeconds: clampNumber(
        source.maxFirstTokenLatencySeconds ?? source.maxLatencySeconds,
        DEFAULT_CONFIG.maxFirstTokenLatencySeconds,
        0,
        3600,
      ),
      maxOutputDurationSeconds: clampNumber(
        source.maxOutputDurationSeconds,
        DEFAULT_CONFIG.maxOutputDurationSeconds,
        0,
        3600,
      ),
      maxGroupRatio: clampNumber(source.maxGroupRatio, DEFAULT_CONFIG.maxGroupRatio, 0, 100000),
      confirmPolls: Math.trunc(
        clampNumber(source.confirmPolls, DEFAULT_CONFIG.confirmPolls, 1, 10),
      ),
      switchHoldMinutes: clampNumber(
        source.switchHoldMinutes ?? source.cooldownMinutes,
        DEFAULT_CONFIG.switchHoldMinutes,
        0,
        1440,
      ),
      rollbackChecks: Math.trunc(
        clampNumber(source.rollbackChecks, DEFAULT_CONFIG.rollbackChecks, 0, 10),
      ),
      blacklistMinutes: clampNumber(
        source.blacklistMinutes,
        DEFAULT_CONFIG.blacklistMinutes,
        1,
        1440,
      ),
    };
  }

  function unwrapUserGroups(payload) {
    const data = payload && payload.data && typeof payload.data === "object" ? payload.data : {};
    return data && !Array.isArray(data) ? data : {};
  }

  function reasonLabel(reason) {
    const labels = {
      "not-user-selectable": "账号不可选",
      "not-whitelisted": "不在白名单",
      "blocked-group": "已被黑名单排除",
      "ratio-unknown": "倍率未知",
      "ratio-too-high": "超过倍率上限",
      "metrics-missing": "无性能数据",
      "tps-missing": "1h TPS 缺失（仅故障时可应急）",
      "metrics-stale": "指标已过期",
      "success-low": "1h 成功率不足",
      "latest-success-low": "最新成功率不足",
      "first-token-latency-high": "首字延迟过高",
      "output-latency-high": "输出延迟过高",
      "monitor-disabled": "监测已停用",
      "latest-unavailable": "最新监测不可用",
      "model-unavailable": "目标模型不可用",
      "model-unsupported": "分组不支持目标模型",
      "model-status-unknown": "模型状态未知",
      "model-detection-suspected": "模型检测疑似",
      "model-detection-insufficient": "模型检测证据不足",
      "model-detection-failed": "模型检测未通过",
      "model-detection-expired": "模型检测已过期",
      "model-detection-incomplete": "模型检测未完成",
      "model-detection-unknown": "模型检测状态未知",
      "model-detection-missing": "缺少模型检测详情",
      "model-detection-model-mismatch": "检测模型与启用模型不匹配",
      "model-detection-not-applicable": "模型检测不适用",
      "metrics-window-invalid": "1h 指标窗口无效",
      "metrics-provider-version": "非 v2 监控数据，暂停自动准入",
      "metrics-sample-insufficient": "1h 指标样本不足",
      "cache-metrics-missing": "缓存指标缺失",
      "cache-stale": "缓存统计尚未就绪或已过期",
      "cache-sample-insufficient": "缓存样本不足",
      "tps-missing": "TPS 指标缺失",
      "scope-migration-pending": "旧平台范围尚未映射到分组",
      "outside-monitor-scope": "未纳入监控范围",
      "temporarily-blacklisted": "故障隔离",
    };
    return labels[reason] || reason;
  }

  function effectiveRatioReasonLabel(reason) {
    const labels = {
      runtime_window_not_ready: "统计窗口未就绪",
      insufficient_samples: "样本不足",
    };
    const normalizedReason = String(reason || "").trim();
    return labels[normalizedReason] || normalizedReason || "平台暂未提供";
  }

  function parsePercentValue(value) {
    if (value == null || value === "") return NaN;
    const source = String(value).trim();
    const parsed = Number(source.endsWith("%") ? source.slice(0, -1) : source);
    if (!Number.isFinite(parsed) || parsed < 0) return NaN;
    return source.endsWith("%") || parsed > 1 ? parsed : parsed * 100;
  }

  function evaluateCandidates(pricingPayload, metricsPayload, userGroupsPayload, config, nowSeconds) {
    const pricing = pricingPayload && typeof pricingPayload === "object" ? pricingPayload : {};
    const metricsData = metricsPayload && metricsPayload.data ? metricsPayload.data : {};
    const model = (Array.isArray(pricing.data) ? pricing.data : []).find(
      (item) => item && item.model_name === config.model,
    );

    if (!model) {
      throw new Error(`模型 ${config.model} 不在当前定价列表中`);
    }

    const userGroups = unwrapUserGroups(userGroupsPayload);
    const userGroupNames = new Set(Object.keys(userGroups));
    const filteredGroups = new Set(activeGroupFilter(config));
    const enforceGroupFilter = filteredGroups.size > 0;
    const publicRatios = pricing.group_ratio && typeof pricing.group_ratio === "object"
      ? pricing.group_ratio
      : {};
    const metricsMap = new Map(
      (Array.isArray(metricsData.groups) ? metricsData.groups : [])
        .filter((item) => item && item.group)
        .map((item) => [item.group, item]),
    );
    const now = Number.isFinite(nowSeconds) ? nowSeconds : Date.now() / 1000;

    return (Array.isArray(model.enable_groups) ? model.enable_groups : []).map((group) => {
      const reasons = [];
      const groupMeta = userGroups[group] && typeof userGroups[group] === "object"
        ? userGroups[group]
        : {};
      const userRatio = Number(groupMeta.ratio);
      const publicRatio = Number(publicRatios[group]);
      const ratio = Number.isFinite(userRatio) && userRatio > 0 ? userRatio : publicRatio;
      const metric = metricsMap.get(group);
      const series = metric && Array.isArray(metric.series)
        ? metric.series
            .filter((point) => point && Number.isFinite(Number(point.ts)))
            .slice()
            .sort((left, right) => Number(left.ts) - Number(right.ts))
        : [];
      const latest = series.length ? series[series.length - 1] : null;
      const aggregateSuccess = healthMetricNumber(metric && metric.success_rate);
      const latestSuccess = healthMetricNumber(latest && latest.success_rate);
      const firstTokenLatencyMs = healthMetricNumber(metric && metric.avg_ttft_ms);
      const outputTokensPerSecond = Number(metric && metric.avg_tps);
      const outputLatencyMs = healthMetricNumber(metric && metric.avg_latency_ms);
      const cacheHitRate = parsePercentValue(
        metric && (metric.cache_hit_rate ?? metric.cacheHitRate),
      );
      const ageMinutes = latest ? Math.max(0, now - Number(latest.ts)) / 60 : Infinity;

      if (!userGroupNames.has(group)) reasons.push("not-user-selectable");
      if (
        enforceGroupFilter
        && config.groupFilterMode === "whitelist"
        && !filteredGroups.has(group)
      ) reasons.push("not-whitelisted");
      if (
        enforceGroupFilter
        && config.groupFilterMode === "blacklist"
        && filteredGroups.has(group)
      ) reasons.push("blocked-group");
      if (!Number.isFinite(ratio) || ratio <= 0) reasons.push("ratio-unknown");
      if (config.maxGroupRatio > 0 && Number.isFinite(ratio) && ratio > config.maxGroupRatio) {
        reasons.push("ratio-too-high");
      }
      if (!metric) reasons.push("metrics-missing");
      if (ageMinutes > config.maxMetricAgeMinutes) reasons.push("metrics-stale");
      if (!Number.isFinite(aggregateSuccess) || aggregateSuccess < config.minSuccessRate) {
        reasons.push("success-low");
      }
      if (!Number.isFinite(latestSuccess) || latestSuccess < config.minLatestSuccessRate) {
        reasons.push("latest-success-low");
      }
      if (
        config.maxFirstTokenLatencySeconds > 0 &&
        (!Number.isFinite(firstTokenLatencyMs)
          || firstTokenLatencyMs <= 0
          || firstTokenLatencyMs > config.maxFirstTokenLatencySeconds * 1000)
      ) {
        reasons.push("first-token-latency-high");
      }
      if (
        config.maxOutputDurationSeconds > 0 &&
        (!Number.isFinite(outputLatencyMs)
          || outputLatencyMs <= 0
          || outputLatencyMs > config.maxOutputDurationSeconds * 1000)
      ) {
        reasons.push("output-latency-high");
      }
      return {
        group,
        ratio,
        available: reasons.length === 0,
        reasons,
        aggregateSuccess,
        latestSuccess,
        recentSuccess: latestSuccess,
        recentMinSuccess: latestSuccess,
        recentSampleCount: Number.isFinite(latestSuccess) ? 1 : 0,
        firstTokenLatencyMs,
        outputLatencyMs,
        outputTokensPerSecond,
        cacheHitRate,
        ageMinutes,
        healthEvidence: { model: config.model, monitoringActive: true, supported: true,
          metricsMatchModel: true, ageMinutes, latestAgeMinutes: ageMinutes },
      };
    });
  }

  function normalizeAihubGroups(payload) {
    return Array.isArray(payload) ? payload : [];
  }

  function normalizeAihubRates(payload) {
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  }

  function normalizeAihubModelKey(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return "";
    const entry = Object.entries(AIHUB_MODEL_NAMES).find(([, name]) => name === normalized);
    return entry ? entry[0] : normalized;
  }

  function aihubModelName(value) {
    const key = normalizeAihubModelKey(value);
    return AIHUB_MODEL_NAMES[key] || key;
  }

  function migrateAihubStoredModelAliases(configValue, historyValue, guardValue) {
    const config = sanitizeConfig(configValue);
    const history = normalizeSwitchHistory(historyValue);
    const guard = normalizeSwitchGuardState(guardValue);
    let changed = false;
    const canonicalize = (value) => {
      const source = String(value || "");
      const canonical = source === AIHUB_LEGACY_MONITOR_MODEL ? "" : aihubModelName(source);
      if (source !== canonical) changed = true;
      return canonical;
    };
    const canonicalizeIdentity = (value) => String(value || "")
      .split(MODEL_IDENTITY_SEPARATOR)
      .map(canonicalize)
      .filter(Boolean)
      .sort()
      .join(MODEL_IDENTITY_SEPARATOR);
    config.models = config.models.map(canonicalize).filter(Boolean);
    config.model = config.models[0] || "";
    config.tokenModels = Object.fromEntries(Object.entries(config.tokenModels).map(([id, model]) => [id, canonicalize(model)]));
    Object.values(history.byToken).forEach((entry) => {
      entry.model = canonicalizeIdentity(entry.model);
    });
    Object.values(guard.byToken).forEach((entry) => {
      entry.model = canonicalizeIdentity(entry.model);
    });
    guard.blacklist.forEach((entry) => {
      entry.model = canonicalizeIdentity(entry.model);
    });
    return { config, history, guard, changed };
  }

  function normalizeAihubModelHealth(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.fromEntries(
      Object.entries(source)
        .map(([model, status]) => [normalizeAihubModelKey(model), String(status || "").trim().toLowerCase()])
        .filter(([model]) => Boolean(model)),
    );
  }

  function normalizeAihubModelCards(value) {
    const source = Array.isArray(value) ? value : [];
    return source
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const model = String(entry.model ?? entry.model_name ?? entry.name ?? "").trim();
        if (!model) return null;
        return {
          ...entry,
          model,
          modelKey: normalizeAihubModelKey(model),
          alias: String(entry.alias ?? "").trim(),
          health: String(entry.health ?? entry.status ?? "").trim().toLowerCase(),
        };
      })
      .filter(Boolean);
  }

  function normalizeAihubModelDetection(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const model = String(value.model ?? value.model_name ?? value.target_model ?? "").trim();
    const hasExpiresAt = Object.prototype.hasOwnProperty.call(value, "expires_at")
      || Object.prototype.hasOwnProperty.call(value, "expiresAt");
    const expiresAt = String(value.expires_at ?? value.expiresAt ?? "").trim();
    const expiresAtMs = Date.parse(expiresAt);
    const detectedAt = String(value.detected_at ?? value.detectedAt ?? "").trim();
    const detectedAtMs = Date.parse(detectedAt);
    const presentation = value.presentation && typeof value.presentation === "object" ? value.presentation : {};
    const text = presentation.text && typeof presentation.text === "object" ? presentation.text : {};
    const enabled = value.stage_enabled && typeof value.stage_enabled === "object" ? value.stage_enabled : {};
    const namedStages = value.stages && typeof value.stages === "object" && !Array.isArray(value.stages) ? value.stages : null;
    const rawStages = namedStages || (!Array.isArray(value.stages) && Object.values(enabled).some((flag) => flag === true)) ? [...new Set([...Object.keys(namedStages || {}), ...Object.keys(enabled)])]
      .filter((name) => enabled[name] !== false).map((name) => ({ ...namedStages?.[name], name, named: true }))
      : Array.isArray(value.stages) ? value.stages.filter((stage) => stage?.enabled !== false) : [];
    Object.keys(enabled).filter((name) => enabled[name] === true && !rawStages.some((stage) => stage?.name === name))
      .forEach((name) => rawStages.push({ name, named: true }));
    return {
      applicable: value.applicable === true,
      refreshing: value.refreshing === true,
      status: String(value.status || "").trim().toLowerCase(),
      model,
      modelKey: normalizeAihubModelKey(model),
      presentationResult: typeof text.result === "boolean" ? text.result
        : typeof value.presentationResult === "boolean" ? value.presentationResult : null,
      confidence: String(value.confidence || "").trim().toLowerCase(),
      executionComplete: typeof value.execution_complete !== "boolean" && typeof value.executionComplete !== "boolean"
        ? null : value.execution_complete === true || value.executionComplete === true,
      allTargetsPassed: typeof value.all_targets_passed !== "boolean" && typeof value.allTargetsPassed !== "boolean"
        ? null : value.all_targets_passed === true || value.allTargetsPassed === true,
      detectedAt,
      detectedAtMs: Number.isFinite(detectedAtMs) ? detectedAtMs : NaN,
      stages: rawStages.map((stage) => {
        const item = stage && typeof stage === "object" ? stage : {};
        const stagePresentation = item.presentation && typeof item.presentation === "object" ? item.presentation : {};
        const stageText = stagePresentation.text && typeof stagePresentation.text === "object" ? stagePresentation.text : {};
        const published = String(item.published_state ?? item.status ?? item.result_status ?? "").trim().toLowerCase();
        const completed = item.named === true && published === "completed" && item.state === "completed";
        return {
          name: String(item.name || ""),
          status: published,
          result: typeof item.result === "boolean" ? item.result
            : typeof stageText.result === "boolean" ? stageText.result
              : typeof item.passed === "boolean" ? item.passed : completed ? true : null,
          executionComplete: typeof item.execution_complete !== "boolean" && typeof item.executionComplete !== "boolean"
            ? (item.named === true ? completed : null) : item.execution_complete === true || item.executionComplete === true,
          finishedAt: String(item.finished_at ?? item.finishedAt ?? ""),
        };
      }),
      hasExpiresAt: value.hasExpiresAt === undefined ? hasExpiresAt : value.hasExpiresAt === true,
      expiresAt,
      expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : NaN,
    };
  }

  function aihubScopedModelDetection(monitor, model) {
    const selectedModelKey = normalizeAihubModelKey(model);
    const detection = normalizeAihubModelDetection(
      monitor && (monitor.modelDetection ?? monitor.model_detection),
    );
    return detection
      && detection.applicable === true
      && selectedModelKey
      && detection.modelKey === selectedModelKey
      ? detection
      : null;
  }

  function aihubModelDetectionReason(monitor, model, nowMs) {
    const raw = monitor && (monitor.modelDetection ?? monitor.model_detection);
    const detection = normalizeAihubModelDetection(raw);
    if (!detection) {
      return "model-detection-missing";
    }
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    if (detection.applicable !== true) return "model-detection-not-applicable";
    if (!normalizeAihubModelKey(model) || detection.model !== String(model || "").trim()) {
      return "model-detection-model-mismatch";
    }
    if (detection.hasExpiresAt
      ? (!Number.isFinite(detection.expiresAtMs) || detection.expiresAtMs <= now)
      : (!Number.isFinite(detection.detectedAtMs) || detection.detectedAtMs > now
        || now - detection.detectedAtMs > 60 * 60 * 1000)) {
      return "model-detection-expired";
    }
    if (detection.refreshing) return "model-detection-unknown";
    if (detection.stages.some((stage) => stage.result === false
      || ["failed", "failure", "error", "detection_failed"].includes(stage.status))) return "model-detection-failed";
    if (detection.status === "passed" && detection.executionComplete === true
      && detection.presentationResult === true && detection.allTargetsPassed !== false
      && detection.stages.every((stage) => stage.executionComplete === true
        && stage.result === true && ["passed", "pass", "success", "completed"].includes(stage.status))) return "";
    if (detection.status === "passed" && (detection.executionComplete !== true
      || detection.presentationResult !== true || detection.allTargetsPassed === false
      || detection.stages.some((stage) => stage.executionComplete !== true || stage.result !== true))) {
      return "model-detection-incomplete";
    }
    if (detection.status === "suspected") return "model-detection-suspected";
    if (detection.status === "insufficient_evidence") return "model-detection-insufficient";
    if (["detection_failed", "failed"].includes(detection.status)) return "model-detection-failed";
    return "model-detection-unknown";
  }

  function aihubRequiredModelDetectionReason(monitor, model, nowMs) {
    const detection = aihubScopedModelDetection(monitor, model);
    if (!detection) return "";
    return aihubModelDetectionReason(monitor, model, nowMs);
  }

  function buildAihubModelCatalog(summaryPayload) {
    const summary = summaryPayload && typeof summaryPayload === "object" ? summaryPayload : {};
    const models = new Map();
    let hasExactModels = false;
    (Array.isArray(summary.apis) ? summary.apis : []).forEach((monitor) => {
      const names = aihubGroupModelNames(monitor);
      const fallback = normalizeAihubModelCards(monitor && (monitor.modelCards ?? monitor.model_cards));
      if (names !== null || fallback.length) hasExactModels = true;
      const supported = names !== null ? names : fallback.length ? fallback.map((card) => card.model)
        : Object.keys(normalizeAihubModelHealth(monitor && (monitor.modelHealth ?? monitor.model_health))).map(aihubModelName);
      supported.forEach((model) => {
        const name = aihubModelName(model);
        if (!models.has(name)) models.set(name, new Set());
        const platform = String(monitor.platform || "").trim();
        if (platform) models.get(name).add(platform);
      });
    });
    const order = new Map(Object.values(AIHUB_MODEL_NAMES).map((model, index) => [model, index]));
    return {
      data: (hasExactModels ? [...models.keys()] : [...models.keys()]
        .sort((left, right) => (order.get(left) ?? 99) - (order.get(right) ?? 99) || left.localeCompare(right)))
        .map((model) => ({ model_name: model, ...(models.get(model).size ? { platforms: [...models.get(model)].sort() } : {}) })),
    };
  }

  function aihubGroupModelNames(monitor) {
    const value = monitor && (monitor.group_models !== undefined ? monitor.group_models : monitor.groupModels);
    // Missing means legacy API; an explicitly empty list still declares no supported models.
    if (value === undefined) return null;
    return [...new Set((Array.isArray(value) ? value : []).map((entry) => String(
      typeof entry === "string" ? entry : entry && (entry.model ?? entry.model_name ?? entry.name) || "",
    ).trim()).filter(Boolean))];
  }

  function aihubGroupSupportsModel(monitor, model) {
    const names = aihubGroupModelNames(monitor);
    return names === null || names.some((name) => normalizeAihubModelKey(name) === normalizeAihubModelKey(model));
  }

  function aihubModelHealthStatus(monitor, model) {
    const key = normalizeAihubModelKey(model);
    if (!key || !aihubGroupSupportsModel(monitor, model)) return "";
    const selectedModel = String(model || "").trim().toLowerCase();
    const modelCards = normalizeAihubModelCards(monitor && (monitor.modelCards ?? monitor.model_cards));
    if (modelCards.length) {
      const card = modelCards.find((entry) => entry.model.toLowerCase() === selectedModel)
        || modelCards.find((entry) => entry.modelKey === key);
      return card ? card.health : "";
    }
    const health = normalizeAihubModelHealth(monitor && (monitor.modelHealth ?? monitor.model_health));
    return health[key] || "";
  }

  function normalizeFluxionModelName(value) {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    return String(value.model || value.model_name || value.name || "").trim();
  }

  function fluxionMonitorModels(monitor) {
    const source = monitor && typeof monitor === "object" ? monitor : {};
    return [...new Set([
      normalizeFluxionModelName(source.primaryModel ?? source.primary_model),
      ...(Array.isArray(source.extra_models) ? source.extra_models : []),
      ...(Array.isArray(source.extraModels) ? source.extraModels : []),
    ].map(normalizeFluxionModelName).filter(Boolean))];
  }

  function normalizeFluxionMonitors(payload) {
    const source = payload && payload.data !== undefined ? payload.data : payload;
    const items = Array.isArray(source)
      ? source
      : source && Array.isArray(source.items)
        ? source.items
        : [];
    return items
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        ...item,
        id: Number(item.id),
        name: String(item.name || "").trim(),
        groupName: String(item.group_name || item.groupName || "").trim(),
        provider: String(item.provider || "").trim().toLowerCase(),
        primaryModel: normalizeFluxionModelName(item.primary_model ?? item.primaryModel),
        primaryStatus: String(item.primary_status || item.primaryStatus || "").trim().toLowerCase(),
        primaryLatencyMs: Number(item.primary_latency_ms ?? item.primaryLatencyMs),
        primaryPingLatencyMs: Number(item.primary_ping_latency_ms ?? item.primaryPingLatencyMs),
        availability7d: healthMetricNumber(item.availability_7d ?? item.availability7d),
        timeline: (Array.isArray(item.timeline) ? item.timeline : [])
          .filter((point) => point && typeof point === "object")
          .map((point) => ({
            checkedAt: String(point.checked_at || point.checkedAt || "").trim(),
            status: String(point.status || "").trim().toLowerCase(),
            latencyMs: Number(point.latency_ms ?? point.latencyMs),
            pingLatencyMs: Number(point.ping_latency_ms ?? point.pingLatencyMs),
          })),
      }))
      .filter((item) => Number.isFinite(item.id) && item.id > 0 && item.name);
  }

  function normalizeFluxionGroups(payload) {
    const source = payload && payload.data !== undefined ? payload.data : payload;
    return Array.isArray(source)
      ? source.filter((group) => group && typeof group === "object")
      : [];
  }

  function fluxionGroupModels(group) {
    const source = group && typeof group === "object" ? group : {};
    const config = source.models_list_config && typeof source.models_list_config === "object"
      ? source.models_list_config
      : source.modelsListConfig && typeof source.modelsListConfig === "object"
        ? source.modelsListConfig
        : {};
    const values = Array.isArray(config.models)
      ? config.models
      : Array.isArray(source.models)
        ? source.models
        : [];
    return [...new Set(values.map(normalizeFluxionModelName).filter(Boolean))];
  }

  function fluxionGroupSupportsModel(group, model) {
    const target = String(model || "").trim();
    if (!target) return false;
    const source = group && typeof group === "object" ? group : {};
    const config = source.models_list_config && typeof source.models_list_config === "object"
      ? source.models_list_config
      : source.modelsListConfig && typeof source.modelsListConfig === "object"
        ? source.modelsListConfig
        : null;
    if (config && config.enabled === false) return true;
    const models = fluxionGroupModels(source);
    return models.length ? models.includes(target) : true;
  }

  function normalizeFluxionComparableName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/无\s*fable/gi, "")
      .replace(/混合号池|号池|余额|分组|逆向|逆|专用|文本|模型/g, "")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  }

  const FLUXION_MONITOR_MATCH_THRESHOLD = 75;

  function fluxionMonitorMatchScore(monitor, group) {
    const monitorName = String(monitor && monitor.name || "").toLowerCase();
    const groupName = String(group && group.name || "").toLowerCase();
    const monitorKey = normalizeFluxionComparableName(monitorName);
    const groupKey = normalizeFluxionComparableName(groupName);
    if (!monitorKey || !groupKey) return -Infinity;
    const monitorProvider = String(monitor && monitor.provider || "").toLowerCase();
    const groupPlatform = String(group && group.platform || "").toLowerCase();
    if (monitorProvider && groupPlatform && monitorProvider !== groupPlatform) return -Infinity;

    let score = monitorProvider && groupPlatform ? 10 : 0;
    if (monitorKey === groupKey) {
      score += 100;
    } else if (monitorKey.includes(groupKey) || groupKey.includes(monitorKey)) {
      score += 70 + Math.min(monitorKey.length, groupKey.length) / Math.max(monitorKey.length, groupKey.length) * 20;
    } else {
      let prefixLength = 0;
      while (
        prefixLength < monitorKey.length
        && prefixLength < groupKey.length
        && monitorKey[prefixLength] === groupKey[prefixLength]
      ) prefixLength += 1;
      score += prefixLength >= 4 ? 30 + prefixLength : 0;
    }

    const monitorExternal = monitorName.includes("外接");
    const groupExternal = groupName.includes("外接");
    if (monitorExternal === groupExternal) score += 12;
    else score -= 80;
    const monitorFable = monitorName.includes("fable");
    const groupFable = groupName.includes("fable") && !groupName.includes("无fable");
    if (monitorFable !== groupFable) score -= 40;
    return score;
  }

  function findFluxionMonitorForGroup(monitors, group, model) {
    const targetModel = String(model || "").trim();
    const ranked = (Array.isArray(monitors) ? monitors : [])
      .filter((monitor) => fluxionMonitorModels(monitor).includes(targetModel))
      .map((monitor) => ({ monitor, score: fluxionMonitorMatchScore(monitor, group) }))
      .filter((item) => Number.isFinite(item.score) && item.score >= FLUXION_MONITOR_MATCH_THRESHOLD)
      .sort((left, right) => right.score - left.score);
    return ranked.length ? ranked[0].monitor : null;
  }

  function buildFluxionModelCatalog(monitorsPayload, groupsPayload) {
    const monitors = normalizeFluxionMonitors(monitorsPayload);
    const groups = normalizeFluxionGroups(groupsPayload);
    const models = new Set();
    monitors.forEach((monitor) => {
      fluxionMonitorModels(monitor).forEach((model) => {
        const matched = groups.some(
          (group) => fluxionGroupSupportsModel(group, model)
            && fluxionMonitorMatchScore(monitor, group) >= FLUXION_MONITOR_MATCH_THRESHOLD,
        );
        if (matched) models.add(model);
      });
    });
    return {
      data: [...models]
        .sort((left, right) => left.localeCompare(right, "zh-CN"))
        .map((model) => ({ model_name: model })),
    };
  }

  function fluxionPromoActive(group, nowMs) {
    if (!group || group.promo_active !== true || group.promo_rate_enabled === false) return false;
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    const start = Date.parse(group.promo_start_at || "");
    const end = Date.parse(group.promo_end_at || "");
    if (Number.isFinite(start) && now < start) return false;
    if (Number.isFinite(end) && now >= end) return false;
    return true;
  }

  function fluxionPeakMultiplier(group, nowMs) {
    if (!group || group.peak_rate_enabled !== true) return 1;
    const multiplier = Number(group.peak_rate_multiplier);
    const startMatch = String(group.peak_start || "").match(/^(\d{1,2}):(\d{2})/);
    const endMatch = String(group.peak_end || "").match(/^(\d{1,2}):(\d{2})/);
    if (!Number.isFinite(multiplier) || multiplier <= 0 || !startMatch || !endMatch) return 1;
    const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
    const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
    if (startMinutes === endMinutes) return 1;
    const date = new Date(Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now());
    const currentMinutes = date.getHours() * 60 + date.getMinutes();
    const active = startMinutes < endMinutes
      ? currentMinutes >= startMinutes && currentMinutes < endMinutes
      : currentMinutes >= startMinutes || currentMinutes < endMinutes;
    return active ? multiplier : 1;
  }

  function fluxionEffectiveGroupRatio(group, ratesPayload, nowMs) {
    const rates = normalizeAihubRates(ratesPayload);
    const rateValue = rates[group && group.id] ?? rates[String(group && group.id)] ?? rates[group && group.name];
    const userRatio = Number(rateValue && typeof rateValue === "object"
      ? rateValue.rate_multiplier ?? rateValue.ratio ?? rateValue.multiplier
      : rateValue);
    const baseRatio = Number(group && group.rate_multiplier);
    const promoRatio = Number(group && group.promo_rate_multiplier);
    const ratio = Number.isFinite(userRatio) && userRatio > 0
      ? userRatio
      : fluxionPromoActive(group, nowMs) && Number.isFinite(promoRatio) && promoRatio > 0
        ? promoRatio
        : baseRatio;
    return Number.isFinite(ratio) && ratio > 0
      ? ratio * fluxionPeakMultiplier(group, nowMs)
      : NaN;
  }

  function fluxionStatusOperational(value) {
    return ["operational", "healthy", "ok", "success"].includes(String(value || "").toLowerCase());
  }

  function evaluateFluxionCandidates(monitorsPayload, groupsPayload, ratesPayload, config, nowMs) {
    const monitors = normalizeFluxionMonitors(monitorsPayload);
    const groups = normalizeFluxionGroups(groupsPayload);
    const filteredGroups = new Set(activeGroupFilter(config));
    const enforceGroupFilter = filteredGroups.size > 0;
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();

    return groups
      .filter((group) => fluxionGroupSupportsModel(group, config.model))
      .map((group) => {
        const reasons = [];
        const groupId = Number(group.id);
        const groupName = String(group.name || `#${groupId}`);
        const monitor = findFluxionMonitorForGroup(monitors, group, config.model);
        const timeline = monitor
          ? monitor.timeline
              .filter((point) => Number.isFinite(Date.parse(point.checkedAt)))
              .slice()
              .sort((left, right) => Date.parse(left.checkedAt) - Date.parse(right.checkedAt))
          : [];
        const latest = timeline.length ? timeline[timeline.length - 1] : null;
        const latestStatus = latest ? latest.status : monitor && monitor.primaryStatus;
        const latestSuccess = fluxionStatusOperational(latestStatus) ? 100
          : ["error", "failed", "down", "unavailable", "offline"].includes(String(latestStatus || "").toLowerCase()) ? 0 : NaN;
        const aggregateSuccess = healthMetricNumber(monitor && monitor.availability7d);
        const checkedAtMs = latest ? Date.parse(latest.checkedAt) : NaN;
        const ageMinutes = Number.isFinite(checkedAtMs) ? Math.max(0, now - checkedAtMs) / 60000 : Infinity;
        const outputLatencyMs = Number(
          latest && Number.isFinite(latest.latencyMs)
            ? latest.latencyMs
            : monitor && monitor.primaryLatencyMs,
        );
        const ratio = fluxionEffectiveGroupRatio(group, ratesPayload, now);

        if (!Number.isFinite(groupId) || groupId <= 0 || group.status !== "active") {
          reasons.push("not-user-selectable");
        }
        if (
          enforceGroupFilter
          && config.groupFilterMode === "whitelist"
          && !filteredGroups.has(groupName)
        ) reasons.push("not-whitelisted");
        if (
          enforceGroupFilter
          && config.groupFilterMode === "blacklist"
          && filteredGroups.has(groupName)
        ) reasons.push("blocked-group");
        if (!Number.isFinite(ratio) || ratio <= 0) reasons.push("ratio-unknown");
        if (config.maxGroupRatio > 0 && Number.isFinite(ratio) && ratio > config.maxGroupRatio) {
          reasons.push("ratio-too-high");
        }
        if (!monitor) {
          reasons.push("metrics-missing");
        } else {
          if (ageMinutes > config.maxMetricAgeMinutes) reasons.push("metrics-stale");
          if (!Number.isFinite(aggregateSuccess) || aggregateSuccess < config.minSuccessRate) {
            reasons.push("success-low");
          }
          if (!fluxionStatusOperational(latestStatus)) reasons.push("latest-unavailable");
          if (!Number.isFinite(latestSuccess) || latestSuccess < config.minLatestSuccessRate) {
            reasons.push("latest-success-low");
          }
          if (
            config.maxOutputDurationSeconds > 0
            && (!Number.isFinite(outputLatencyMs)
              || outputLatencyMs <= 0
              || outputLatencyMs > config.maxOutputDurationSeconds * 1000)
          ) reasons.push("output-latency-high");
        }

        return {
          group: groupName,
          groupId,
          ratio,
          available: reasons.length === 0,
          reasons,
          aggregateSuccess,
          latestSuccess,
          recentSuccess: latestSuccess,
          recentMinSuccess: latestSuccess,
          recentSampleCount: Number.isFinite(latestSuccess) ? 1 : 0,
          firstTokenLatencyMs: NaN,
          outputLatencyMs,
          outputTokensPerSecond: NaN,
          outputTokens: NaN,
          cacheHitRate: NaN,
          ageMinutes,
          monitorName: monitor ? monitor.name : "",
          healthEvidence: { model: config.model, monitoringActive: Boolean(monitor), supported: true,
            metricsMatchModel: Boolean(monitor && String(monitor.primaryModel).toLowerCase() === String(config.model).toLowerCase()),
            ageMinutes, latestAgeMinutes: ageMinutes },
        };
      });
  }

  function aihubTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
    } catch (_) {
      return "Asia/Shanghai";
    }
  }

  function aihubDetectionImageUrl(value) {
    const path = String(value || "").trim().replace(/^https:\/\/aihub\.top(?=\/)/, "");
    return /^\/api\/v1\/public\/model-detection-artifacts\/[A-Za-z0-9_-]+(?:\/preview)?$/.test(path)
      ? `https://aihub.top${path}`
      : "";
  }

  function normalizeAihubDetectionMedia(monitor) {
    const source = monitor && typeof monitor === "object" ? monitor : {};
    const media = source.detection_media ?? source.detectionMedia;
    const presentation = media?.presentation ?? source.model_detection?.presentation ?? source.modelDetection?.presentation;
    const image = presentation?.image ?? media;
    const url = aihubDetectionImageUrl(image?.url);
    const status = String(image?.status || "").toLowerCase();
    return {
      status: url && status === "successful" ? "successful" : status === "failed" ? "failed" : "missing",
      url: status === "successful" ? url : "",
      previewUrl: status === "successful" && url ? aihubDetectionImageUrl(image?.preview_url ?? image?.previewUrl) || url : "",
      title: String(image?.title?.zh || image?.title?.en || (typeof image?.title === "string" ? image.title : "鹈鹕")),
      reason: String(image?.user_reason || image?.reason || ""),
      publishedAt: String(media?.published_at || media?.publishedAt || ""),
    };
  }

  function normalizeAihubProviderData(providersPayload, seriesPayload) {
    const providers = providersPayload && typeof providersPayload === "object" ? providersPayload : {};
    const providerItems = Array.isArray(providers.items) ? providers.items : [];
    if (!providerItems.length) throw new Error("AIHub 供应商列表为空");
    const series = seriesPayload && typeof seriesPayload === "object" ? seriesPayload : {};
    const seriesItems = Array.isArray(series.items) ? series.items : [];
    const seriesByApiId = {};
    seriesItems.forEach((item) => {
      const groupId = Number(item && item.group_id);
      if (!Number.isFinite(groupId) || groupId <= 0) return;
      seriesByApiId[String(groupId)] = Array.isArray(item.probe) ? item.probe : [];
    });
    return {
      summary: {
        providerVersion: Number(providers.version) || 0,
        generatedAt: providers.generated_at || providers.generatedAt || "",
        summaryRange: String(providers.summary_range ?? providers.summaryRange ?? "").trim().toLowerCase(),
        summaryModels: normalizeAihubSummaryModels(providers.summary_models ?? providers.summaryModels),
        platformTabs: Array.isArray(providers.platform_tabs) ? providers.platform_tabs.slice() : [],
        monitoringActive: providers.monitoring_active !== false && providers.monitoringActive !== false,
        apis: providerItems.map((item) => ({
          ...item,
          id: String(item.group_id),
          planType: item.code,
          priceMultiplier: item.rate_multiplier,
          checkedAt: item.last_probed_at,
          firstTokenLatencyMs: item.probe_e2e_ttft_ms
            ?? item.probeE2eTtftMs
            ?? item.firstTokenLatencyMs
            ?? item.probe_ttft_ms,
          outputTokens: item.output_tokens,
          outputTokensPerSecond: item.output_tps,
          cacheHitRate: item.cache_hit_rate,
          modelHealth: normalizeAihubModelHealth(item.model_health ?? item.modelHealth),
          modelCards: normalizeAihubModelCards(item.model_cards ?? item.modelCards),
          modelDetection: normalizeAihubModelDetection(item.model_detection ?? item.modelDetection),
          detectionMedia: normalizeAihubDetectionMedia(item),
          successRates: item.success_rates,
          enabled: item.enabled !== false,
        })),
      },
      series: { seriesByApiId },
    };
  }

  function normalizeAihubSummaryModels(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([model, entry]) => [String(model).trim(), { ...entry, sampleCount: aihubMetricNumber(entry?.sample_count ?? entry?.sampleCount) }])
      .filter(([model, entry]) => model && entry && typeof entry === "object" && !Array.isArray(entry)));
  }

  function aihubMetricNumber(value) {
    if (typeof value !== "number" && typeof value !== "string") return NaN;
    if (typeof value === "string" && !value.trim()) return NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function aihubMetricPercent(value) {
    const number = aihubMetricNumber(value);
    return Number.isFinite(number) && number >= 0 && number <= 1
      ? number * 100
      : Number.isFinite(number) && number > 1 && number <= 100 ? number : NaN;
  }

  function aihubSummaryModelGroup(entry, groupId) {
    const groups = entry && (entry.groups ?? entry.items ?? entry.by_group ?? entry.byGroup);
    if (Array.isArray(groups)) return groups.find((item) => Number(item?.group_id ?? item?.groupId) === Number(groupId)) || null;
    if (groups && typeof groups === "object") return groups[String(groupId)] || null;
    return entry;
  }

  function aihubModelMetrics(summary, model, groupId, monitor) {
    const localModels = monitor?.summary_models ?? monitor?.summaryModels ?? {};
    const local = localModels[model];
    const global = summary.summaryModels?.[model];
    // Only a model metric attached to this provider (or explicitly indexed by group) is comparable.
    const indexedGlobal = global && (global.groups || global.items || global.by_group || global.byGroup)
      ? aihubSummaryModelGroup(global, groupId) : null;
    const source = local && typeof local === "object" ? local : indexedGlobal || {};
    const modelName = local || indexedGlobal ? model : "";
    const cache = source.range_cache ?? source.rangeCache ?? {};
    const timestamp = String(cache.refreshed_at ?? cache.refreshedAt ?? "").trim();
    const parsedTimestamp = Date.parse(timestamp);
    const successValue = source.success_rate ?? source.successRate;
    const cacheValue = cache.cache_hit_rate ?? cache.cacheHitRate ?? source.cache_hit_rate ?? source.cacheHitRate;
    const tps = aihubMetricNumber(source.tps ?? source.output_tps ?? source.outputTps);
    const sampleCount = aihubMetricNumber(source.sample_count ?? source.sampleCount);
    const cacheSampleCount = aihubMetricNumber(cache.usage_records ?? cache.usageRecords);
    return {
      successRate: aihubMetricPercent(successValue),
      tps: Number.isFinite(tps) && tps >= 0 ? tps : NaN,
      sampleCount: Number.isInteger(sampleCount) && sampleCount >= 0 ? sampleCount : NaN,
      cacheHitRate: aihubMetricPercent(cacheValue),
      cacheSampleCount: Number.isInteger(cacheSampleCount) && cacheSampleCount >= 0 ? cacheSampleCount : NaN,
      cacheReady: cache.ready === true,
      cacheStale: cache.stale === false,
      cacheRefreshedAt: timestamp,
      cacheRefreshedAtMs: Number.isFinite(parsedTimestamp) ? parsedTimestamp : NaN,
      windowStart: String(source.window_start ?? source.windowStart ?? ""),
      windowEnd: String(source.window_end ?? source.windowEnd ?? ""),
      model: modelName || "",
    };
  }

  function migrateAihubMonitorScope(config, groups, monitors) {
    const source = sanitizeConfig(config);
    if (!source.monitorScopeMigrationPending) return { config: source, changed: false };
    const platform = source.monitorScopeMigrationPlatform;
    const monitorPlatforms = new Map((Array.isArray(monitors) ? monitors : []).map((monitor) => [
      Number(monitor.group_id), normalizeBusinessPlatform(monitor.platform) || "unknown",
    ]));
    const catalog = Array.isArray(groups) ? groups : [];
    const platformFor = (group) => normalizeBusinessPlatform(group.platform) || monitorPlatforms.get(Number(group.id)) || "unknown";
    if (!catalog.length || catalog.some((group) => !Number.isSafeInteger(Number(group.id)) || Number(group.id) <= 0 || platformFor(group) === "unknown")) {
      return { config: { ...source, monitorScopeMode: "selected", monitorGroupIds: [], monitorScopeMigrationPending: true }, changed: false };
    }
    const matching = catalog.filter((group) => platformFor(group) === platform)
      .map((group) => Number(group.id)).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (!matching.length) return { config: { ...source, monitorScopeMode: "selected", monitorGroupIds: [], monitorScopeMigrationPending: true }, changed: false };
    const migrated = { ...source, monitorScopeMode: "selected", monitorGroupIds: [...new Set(matching)],
      monitorScopeMigrationPending: false, monitorScopeMigrationPlatform: "" };
    return { config: migrated, changed: JSON.stringify(source) !== JSON.stringify(migrated) };
  }

  function aihubSeriesPoint(point) {
    if (!Array.isArray(point)) return null;
    const timestampMs = Number(point[0]);
    if (!Number.isFinite(timestampMs)) return null;
    const availability = healthMetricNumber(point[1]);
    return {
      timestampMs,
      available: point[1] === true ? true : point[1] === false ? false
        : availability === 1 ? true : availability === 0 ? false : null,
      firstTokenLatencyMs: Number.isFinite(Number(point[2])) ? Number(point[2]) : NaN,
      outputTokensPerSecond: Number.isFinite(Number(point[3])) ? Number(point[3]) : NaN,
    };
  }

  function aihubMonitorRange(hours) {
    const value = Number(hours);
    if (value <= 6) return "6h";
    if (value <= 24) return "24h";
    if (value <= 168) return "7d";
    return "30d";
  }

  async function loadAihubProviderData(fetcher, range, timezone) {
    const zone = encodeURIComponent(String(timezone || aihubTimezone()));
    let providerError = null;
    for (const version of [2, 1]) {
      try {
        const providers = await fetcher(`/api/v${version}/public/providers?timezone=${zone}`);
        let providerSeries = {};
        let seriesError = null;
        if (range) {
          try {
            providerSeries = await fetcher(`/api/v${version}/public/providers/series?range=${range}&timezone=${zone}`);
          } catch (error) {
            seriesError = error;
          }
        }
        const normalized = normalizeAihubProviderData(providers, providerSeries);
        return { ...normalized, seriesError, source: "providers",
          providerVersion: normalized.summary.providerVersion, endpointVersion: version };
      } catch (error) {
        providerError = error;
      }
    }
    const summary = await fetcher("/api/v1/public/monitor/summary");
    let series = {};
    let seriesError = null;
    if (range) {
      try {
        series = await fetcher(`/api/v1/public/monitor/series/${range}`);
      } catch (error) {
        seriesError = error;
      }
    }
    return { summary, series, seriesError, source: "legacy", providerError };
  }

  async function loadAihubMonitorData(fetcher, range, timezone) {
    const [monitorResult, groups, rates] = await Promise.all([
      loadAihubProviderData(fetcher, range, timezone),
      fetcher("/api/v1/groups/available"),
      fetcher("/api/v1/groups/rates"),
    ]);
    return { ...monitorResult, groups, rates };
  }

  function positiveAihubMetric(value) {
    if (typeof value !== "number" && typeof value !== "string") return NaN;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : NaN;
  }

  function aihubFirstTokenMetric(monitor) {
    const probeLatencyMs = positiveAihubMetric(
      monitor.probe_e2e_ttft_ms
        ?? monitor.probeE2eTtftMs
        ?? monitor.firstTokenLatencyMs
        ?? monitor.probe_ttft_ms,
    );
    const runtimeMetrics = [
      {
        source: "runtime-trimmed-avg",
        value: monitor.runtime_trimmed_avg_ttft_ms,
        hasData: monitor.runtime_trimmed_avg_has_data,
        samples: monitor.runtime_trimmed_avg_sample_count,
      },
      {
        source: "runtime-p90",
        value: monitor.runtime_p90_ttft_ms,
        hasData: monitor.runtime_p90_has_data,
        samples: monitor.runtime_p90_sample_count,
      },
    ];
    for (const metric of runtimeMetrics) {
      const value = positiveAihubMetric(metric.value);
      const samples = positiveAihubMetric(metric.samples);
      if (metric.hasData === true && Number.isInteger(samples) && Number.isFinite(value)) {
        return { value, source: metric.source, probeLatencyMs };
      }
    }
    return {
      value: probeLatencyMs,
      source: Number.isFinite(probeLatencyMs) ? "probe" : "unknown",
      probeLatencyMs,
    };
  }

  function monitorGroupInScope(settings, groupId) {
    return !settings.monitorScopeMigrationPending && (settings.monitorScopeMode !== "selected"
      || normalizeMonitorGroupIds(settings.monitorGroupIds).includes(Number(groupId)));
  }

  function scopeAihubMonitors(summary, groups, settings, models, request = {}) {
    const groupMap = new Map(groups.map((group) => [Number(group.id), group]));
    const filter = new Set(activeGroupFilter(settings));
    const eligibleIds = new Set();
    const currentIds = new Set((request.currentTokens || []).map((token) => Number(token.groupId)));
    const apis = (summary.apis || []).filter((monitor) => {
      const id = Number(monitor.group_id);
      const meta = groupMap.get(id);
      const name = String(meta?.name || monitor.planType || "#" + id);
      const inScope = monitorGroupInScope(settings, id);
      const eligible = inScope && (!filter.size || (settings.groupFilterMode === "blacklist" ? !filter.has(name) : filter.has(name)))
        && models.some((model) => aihubGroupSupportsModel(monitor, model));
      if (eligible) eligibleIds.add(id);
      // Explicit manual checks are limited to the chosen destination and current group(s).
      if (request.targetGroup) return currentIds.has(id) || (name === request.targetGroup
        && (!(Number(request.targetGroupId) > 0) || id === Number(request.targetGroupId)));
      return inScope && (!request.healthOnly || currentIds.has(id));
    });
    return { summary: { ...summary, apis }, eligibleIds };
  }

  function evaluateAihubCandidates(summaryPayload, seriesPayload, groupsPayload, ratesPayload, settings, nowMs) {
    const summary = summaryPayload && typeof summaryPayload === "object" ? summaryPayload : {};
    const groupMap = new Map(normalizeAihubGroups(groupsPayload).map((group) => [Number(group.id), group]));
    const rates = normalizeAihubRates(ratesPayload);
    const filter = new Set(activeGroupFilter(settings));
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const seen = new Set();
    const generatedAtMs = Date.parse(summary.generatedAt || "");
    const metricFresh = Number.isFinite(generatedAtMs) && generatedAtMs <= now && now - generatedAtMs <= 3600000;
    return (Array.isArray(summary.apis) ? summary.apis : []).filter((monitor) => {
      const id = Number(monitor?.group_id);
      if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return false;
      seen.add(id); return true;
    }).map((monitor) => {
      const reasons = [];
      const groupId = Number(monitor.group_id);
      const meta = groupMap.get(groupId);
      const group = String(meta?.name || monitor.planType || "#" + groupId);
      const detection = normalizeAihubModelDetection(monitor.modelDetection ?? monitor.model_detection);
      const matchedModel = targetModels(settings).find((model) => model === detection?.model) || "";
      const metricModel = matchedModel || detection?.model || "";
      const supported = Boolean(matchedModel && aihubGroupSupportsModel(monitor, matchedModel));
      const metrics = aihubModelMetrics(summary, metricModel, groupId, monitor);
      const inMonitorScope = monitorGroupInScope(settings, groupId);
      const userRatio = positiveAihubMetric(rates[groupId]);
      const groupRatio = positiveAihubMetric(meta?.rate_multiplier);
      const publicRatio = positiveAihubMetric(monitor.priceMultiplier);
      const ratio = Number.isFinite(userRatio) ? userRatio : Number.isFinite(groupRatio) ? groupRatio : publicRatio;
      const ratioSource = Number.isFinite(userRatio) ? "account" : Number.isFinite(groupRatio) ? "group" : "public";
      const summaryRange = String(monitor.summary_range ?? monitor.summaryRange ?? summary.summaryRange ?? "").trim().toLowerCase();
      const modelDetectionReason = matchedModel ? aihubModelDetectionReason(monitor, matchedModel, now)
        : detection ? "model-detection-model-mismatch" : "model-detection-missing";
      if (!meta) reasons.push("not-user-selectable");
      if (!inMonitorScope) reasons.push(settings.monitorScopeMigrationPending ? "scope-migration-pending" : "outside-monitor-scope");
      if (filter.size && settings.groupFilterMode === "whitelist" && !filter.has(group)) reasons.push("not-whitelisted");
      if (filter.size && settings.groupFilterMode === "blacklist" && filter.has(group)) reasons.push("blocked-group");
      if (!Number.isFinite(ratio)) reasons.push("ratio-unknown");
      if (settings.maxGroupRatio > 0 && ratio > settings.maxGroupRatio) reasons.push("ratio-too-high");
      if (summary.monitoringActive === false || monitor.enabled === false) reasons.push("monitor-disabled");
      if (matchedModel && !supported) reasons.push("model-unsupported");
      if (modelDetectionReason) reasons.push(modelDetectionReason);
      if (summaryRange !== "1h") reasons.push("metrics-window-invalid");
      if (summary.providerVersion !== 2) reasons.push("metrics-provider-version");
      if (!metricFresh) reasons.push("metrics-stale");
      if (!Number.isFinite(metrics.successRate) || !Number.isFinite(metrics.sampleCount)) reasons.push("metrics-missing");
      if (!Number.isFinite(metrics.tps)) reasons.push("tps-missing");
      if (Number.isFinite(metrics.sampleCount) && metrics.sampleCount < settings.minMetricSamples) reasons.push("metrics-sample-insufficient");
      if (!Number.isFinite(metrics.successRate) || metrics.successRate < settings.minSuccessRate) reasons.push("success-low");
      if (!Number.isFinite(metrics.cacheHitRate) || !Number.isFinite(metrics.cacheSampleCount)) reasons.push("cache-metrics-missing");
      if (!metrics.cacheReady || !metrics.cacheStale || !Number.isFinite(metrics.cacheRefreshedAtMs)
        || metrics.cacheRefreshedAtMs > now || now - metrics.cacheRefreshedAtMs > 3600000) reasons.push("cache-stale");
      if (Number.isFinite(metrics.cacheSampleCount) && metrics.cacheSampleCount < settings.minCacheSamples) reasons.push("cache-sample-insufficient");
      const firstToken = aihubFirstTokenMetric(monitor);
      const effectiveRatio = monitor.effective_multiplier_ready === true ? positiveAihubMetric(monitor.effective_multiplier) : NaN;
      const detectionFresh = Boolean(detection && (detection.hasExpiresAt
        ? Number.isFinite(detection.expiresAtMs) && detection.expiresAtMs > now
        : Number.isFinite(detection.detectedAtMs) && detection.detectedAtMs <= now && now - detection.detectedAtMs <= 3600000));
      const emergencyReasons = new Set(["tps-missing", "cache-metrics-missing", "cache-stale", "cache-sample-insufficient"]);
      const emergencyEligible = reasons.length > 0 && reasons.every((reason) => emergencyReasons.has(reason));
      return {
        group, groupId, ratio, publicRatio, ratioSource, available: reasons.length === 0, emergencyEligible, reasons, warnings: [],
        providerId: "aihub", platform: String(monitor.platform || meta?.platform || ""),
        aggregateSuccess: metrics.successRate, aggregateSuccessWindow: summaryRange,
        cacheHitRate: metrics.cacheHitRate, outputTokensPerSecond: metrics.tps,
        aihubSuccessRate: metrics.successRate, aihubCacheHitRate: metrics.cacheHitRate, aihubTps: metrics.tps,
        aihubMetricSampleCount: metrics.sampleCount, aihubCacheSampleCount: metrics.cacheSampleCount,
        aihubMetricWindowStart: metrics.windowStart, aihubMetricWindowEnd: metrics.windowEnd,
        aihubMetricModel: metricModel, targetModels: matchedModel ? [matchedModel] : [],
        inMonitorScope, monitored: inMonitorScope, scopeEligible: inMonitorScope,
        modelDetection: detection, modelDetectionReason, modelDetectionStatus: detection?.status || "",
        modelDetectionModelKey: detection?.modelKey || "", modelHealthStatus: "",
        modelCards: normalizeAihubModelCards(monitor.modelCards ?? monitor.model_cards),
        detectionMedia: normalizeAihubDetectionMedia(monitor),
        latestSuccess: NaN, recentSuccess: NaN, recentMinSuccess: NaN, recentSampleCount: 0,
        firstTokenLatencyMs: firstToken.value, firstTokenLatencySource: firstToken.source,
        probeFirstTokenLatencyMs: firstToken.probeLatencyMs, outputLatencyMs: NaN,
        effectiveRatio, effectiveRatioReady: Number.isFinite(effectiveRatio),
        effectiveInputPricePerMillion: NaN, effectiveRatioReason: String(monitor.effective_multiplier_reason || ""),
        ageMinutes: metricFresh ? (now - generatedAtMs) / 60000 : Infinity,
        healthEvidence: {
          providerVersionValid: summary.providerVersion === 2,
          model: matchedModel, supported, monitoringActive: summary.monitoringActive !== false && monitor.enabled !== false,
          metricsMatchModel: Boolean(matchedModel && metrics.model === matchedModel),
          ageMinutes: metricFresh ? (now - generatedAtMs) / 60000 : Infinity,
          sufficientSamples: metrics.sampleCount >= settings.minMetricSamples,
          modelDetectionFresh: detectionFresh, modelDetectionFailed: modelDetectionReason === "model-detection-failed",
        },
      };
    });
  }

  function finiteCandidateValues(candidates, key, predicate = Number.isFinite) {
    return candidates
      .map((candidate) => Number(candidate && candidate[key]))
      .filter((value) => predicate(value));
  }

  function mergeTargetModelCandidates(modelCandidateSets) {
    const sets = (Array.isArray(modelCandidateSets) ? modelCandidateSets : [])
      .map((entry) => ({
        model: String(entry && entry.model || "").trim(),
        candidates: Array.isArray(entry && entry.candidates) ? entry.candidates : [],
      }))
      .filter((entry) => entry.model);
    const models = [...new Set(sets.map((entry) => entry.model))];
    const groupKey = (candidate) => Number(candidate.groupId) > 0 ? `id:${candidate.groupId}` : `name:${candidate.group}`;
    const groups = [...new Set(sets.flatMap((entry) => entry.candidates.filter((candidate) => candidate.group).map(groupKey)))];

    return groups.map((key) => {
      const modelResults = sets.map((entry) => {
        const candidate = entry.candidates.find((item) => groupKey(item) === key) || null;
        return {
          model: entry.model,
          candidate,
          available: Boolean(candidate && candidate.available),
          reasons: candidate
            ? [...new Set(Array.isArray(candidate.reasons) ? candidate.reasons : [])]
            : ["model-unavailable"],
          warnings: candidate
            ? [...new Set(Array.isArray(candidate.warnings) ? candidate.warnings : [])]
            : [],
        };
      });
      const candidates = modelResults.map((entry) => entry.candidate).filter(Boolean);
      const representative = candidates[0];
      const reasons = [...new Set(modelResults.flatMap((entry) => entry.reasons))];
      const warnings = [...new Set(modelResults.flatMap((entry) => entry.warnings))];
      const ratios = finiteCandidateValues(candidates, "ratio", (value) => Number.isFinite(value) && value > 0);
      const aggregateSuccesses = finiteCandidateValues(candidates, "aggregateSuccess");
      const recentSuccesses = finiteCandidateValues(candidates, "recentMinSuccess");
      const cacheHitRates = finiteCandidateValues(candidates, "cacheHitRate");
      const firstTokenCandidates = candidates.filter((candidate) => Number.isFinite(Number(candidate.firstTokenLatencyMs)));
      const outputCandidates = candidates.filter((candidate) => Number.isFinite(Number(candidate.outputLatencyMs)));
      const worstFirstToken = firstTokenCandidates.slice().sort(
        (left, right) => Number(right.firstTokenLatencyMs) - Number(left.firstTokenLatencyMs),
      )[0];
      const worstOutput = outputCandidates.slice().sort(
        (left, right) => Number(right.outputLatencyMs) - Number(left.outputLatencyMs),
      )[0];
      const readyEffectiveCandidates = candidates.filter(hasEffectiveRatioEstimate);
      const allEffectiveReady = candidates.length === models.length
        && readyEffectiveCandidates.length === models.length;
      const effectiveRatios = allEffectiveReady
        ? finiteCandidateValues(readyEffectiveCandidates, "effectiveRatio", (value) => Number.isFinite(value) && value > 0)
        : [];
      const effectiveInputPrices = allEffectiveReady
        ? finiteCandidateValues(readyEffectiveCandidates, "effectiveInputPricePerMillion", (value) => Number.isFinite(value) && value >= 0)
        : [];
      const aggregateWindows = [...new Set(candidates.map((candidate) => candidate.aggregateSuccessWindow).filter(Boolean))];

      return {
        ...representative,
        group: representative.group,
        targetModels: models.slice(),
        modelResults,
        available: modelResults.length > 0 && modelResults.every((entry) => entry.available),
        reasons,
        warnings,
        ratio: ratios.length ? Math.max(...ratios) : NaN,
        aggregateSuccess: aggregateSuccesses.length === models.length ? Math.min(...aggregateSuccesses) : NaN,
        aggregateSuccessWindow: aggregateWindows.length === 1 ? aggregateWindows[0] : aggregateWindows.length ? "mixed" : "",
        latestSuccess: recentSuccesses.length === models.length ? Math.min(...recentSuccesses) : NaN,
        recentSuccess: recentSuccesses.length === models.length ? Math.min(...recentSuccesses) : NaN,
        recentMinSuccess: recentSuccesses.length === models.length ? Math.min(...recentSuccesses) : NaN,
        recentSampleCount: modelResults.reduce(
          (count, entry) => count + (Number(entry.candidate && entry.candidate.recentSampleCount) || 0),
          0,
        ),
        firstTokenLatencyMs: worstFirstToken ? Number(worstFirstToken.firstTokenLatencyMs) : NaN,
        firstTokenLatencySource: worstFirstToken ? worstFirstToken.firstTokenLatencySource : "unknown",
        probeFirstTokenLatencyMs: worstFirstToken ? worstFirstToken.probeFirstTokenLatencyMs : NaN,
        outputLatencyMs: worstOutput ? Number(worstOutput.outputLatencyMs) : NaN,
        outputTokensPerSecond: worstOutput ? worstOutput.outputTokensPerSecond : NaN,
        outputTokens: worstOutput ? worstOutput.outputTokens : NaN,
        cacheHitRate: cacheHitRates.length === models.length ? Math.min(...cacheHitRates) : NaN,
        effectiveRatio: effectiveRatios.length === models.length ? Math.max(...effectiveRatios) : NaN,
        effectiveInputPricePerMillion: effectiveInputPrices.length === models.length
          ? Math.max(...effectiveInputPrices)
          : NaN,
        effectiveRatioReady: effectiveRatios.length === models.length,
        effectiveRatioReason: allEffectiveReady
          ? ""
          : String(candidates.find((candidate) => candidate.effectiveRatioReason)?.effectiveRatioReason || ""),
        publicRatio: finiteCandidateValues(candidates, "publicRatio", (value) => Number.isFinite(value) && value > 0).length === models.length
          ? Math.max(...finiteCandidateValues(candidates, "publicRatio", (value) => Number.isFinite(value) && value > 0))
          : NaN,
        ratioSource: candidates.some((candidate) => candidate.ratioSource === "account")
          ? "account"
          : candidates.some((candidate) => candidate.ratioSource === "group")
            ? "group"
            : "public",
        ageMinutes: finiteCandidateValues(candidates, "ageMinutes").length === models.length
          ? Math.max(...finiteCandidateValues(candidates, "ageMinutes"))
          : Infinity,
      };
    });
  }

  function candidateIssueText(candidate) {
    const modelResults = Array.isArray(candidate && candidate.modelResults) ? candidate.modelResults : [];
    if (modelResults.length <= 1) {
      return [...(candidate && candidate.reasons || []), ...(candidate && candidate.warnings || [])]
        .map(reasonLabel)
        .join("、");
    }
    return modelResults
      .map((entry) => {
        const issues = [...entry.reasons, ...entry.warnings].map(reasonLabel);
        return issues.length ? `${entry.model}：${issues.join("、")}` : "";
      })
      .filter(Boolean)
      .join("；");
  }

  function hasEffectiveRatioEstimate(candidate) {
    const effectiveRatio = Number(candidate && candidate.effectiveRatio);
    return candidate && candidate.effectiveRatioReady === true
      && Number.isFinite(effectiveRatio)
      && effectiveRatio > 0;
  }

  function candidateEffectiveRatio(candidate) {
    if (hasEffectiveRatioEstimate(candidate)) return Number(candidate.effectiveRatio);
    const nominalRatio = Number(candidate && candidate.ratio);
    return Number.isFinite(nominalRatio) && nominalRatio > 0 ? nominalRatio : NaN;
  }

  function candidateRecommendationLabel(candidate) {
    if (!candidate) return "无可用分组";
    return hasEffectiveRatioEstimate(candidate)
      ? `${candidate.group} ${formatRatio(Number(candidate.effectiveRatio))}`
      : `${candidate.group} 预测 -`;
  }

  function candidateAggregateSuccessTitle(candidate) {
    const targetPrefix = Array.isArray(candidate && candidate.targetModels) && candidate.targetModels.length > 1
      ? "全部目标模型最差 · "
      : "";
    if (!candidate || candidate.providerId !== "aihub") return `${targetPrefix}整体成功率`;
    const labels = { "1h": "1 小时", "5m": "5 分钟", "6h": "6 小时", "24h": "24 小时", "7d": "7 天", "30d": "30 天" };
    const windowLabel = candidate.aggregateSuccessWindow === "mixed"
      ? "不同统计窗口"
      : labels[candidate.aggregateSuccessWindow] || candidate.aggregateSuccessWindow || "未知窗口";
    return `${targetPrefix}${windowLabel}整体成功率`;
  }

  function candidateFirstTokenLatencyTitle(candidate) {
    const targetPrefix = Array.isArray(candidate && candidate.targetModels) && candidate.targetModels.length > 1
      ? "全部目标模型最慢 · "
      : "";
    if (!candidate || candidate.providerId !== "aihub") return `${targetPrefix}首字延迟`;
    const labels = {
      "runtime-trimmed-avg": "用户首字延迟 · 最快95%平均",
      "runtime-p90": "用户首字延迟 · P90 回退",
      probe: "首字延迟 · 探针回退",
      unknown: "首字延迟 · 暂无有效数据",
    };
    return `${targetPrefix}${labels[candidate.firstTokenLatencySource] || labels.unknown}`;
  }

  function qualityModel(candidate) {
    return String(candidate.aihubMetricModel || candidate.targetModels?.[0] || "");
  }

  function qualityMetricValid(candidate) {
    return Number.isFinite(candidate.aggregateSuccess) && candidate.aggregateSuccess >= 0 && candidate.aggregateSuccess <= 100
      && Number.isFinite(candidate.cacheHitRate) && candidate.cacheHitRate >= 0 && candidate.cacheHitRate <= 100
      && Number.isFinite(candidate.outputTokensPerSecond) && candidate.outputTokensPerSecond >= 0
      && Number.isFinite(candidate.ratio) && candidate.ratio > 0
      && Number.isFinite(candidate.aihubMetricSampleCount) && candidate.aihubMetricSampleCount >= 0
      && Number.isFinite(candidate.aihubCacheSampleCount) && candidate.aihubCacheSampleCount >= 0;
  }

  function candidateQualityTie(left, right) {
    return right.aggregateSuccess - left.aggregateSuccess || right.cacheHitRate - left.cacheHitRate
      || right.outputTokensPerSecond - left.outputTokensPerSecond
      || candidateEffectiveRatio(left) - candidateEffectiveRatio(right)
      || Number(left.groupId || 0) - Number(right.groupId || 0) || left.group.localeCompare(right.group);
  }

  const QUALITY_SCALES = Object.freeze({ successHeadroom: 5, tps: 100, ratio: 1, samples: 100 });

  function scoreAihubQualityCandidates(candidates, settings = DEFAULT_CONFIG) {
    const weights = normalizeQualityWeights(settings.qualityWeights);
    const minimum = clampNumber(settings.minSuccessRate, DEFAULT_CONFIG.minSuccessRate, 0, 100);
    const result = candidates.map((candidate) => ({ ...candidate, qualityScore: NaN, qualityComponents: null }));
    result.forEach((candidate) => {
      if (!candidate.available || candidate.scopeEligible === false || !qualityMetricValid(candidate)) return;
      if (candidate.aggregateSuccess < minimum) return;
      const qModel = candidate.aihubMetricSampleCount / (candidate.aihubMetricSampleCount + QUALITY_SCALES.samples);
      const qCache = candidate.aihubCacheSampleCount / (candidate.aihubCacheSampleCount + QUALITY_SCALES.samples);
      const utilities = {
        success: Math.min(100, Math.max(0, 100 * (candidate.aggregateSuccess - minimum) / Math.max(100 - minimum, QUALITY_SCALES.successHeadroom))),
        cache: candidate.cacheHitRate,
        tps: 100 * candidate.outputTokensPerSecond / (candidate.outputTokensPerSecond + QUALITY_SCALES.tps),
        ratio: 100 / (1 + candidate.ratio / QUALITY_SCALES.ratio),
      };
      const contributions = Object.fromEntries(Object.entries(utilities).map(([name, value]) => [name,
        weights[name] / 100 * value * (name === "ratio" ? 1 : name === "cache" ? qCache : qModel)]));
      candidate.qualityComponents = { utilities, contributions, qModel, qCache };
      candidate.qualityScore = Object.values(contributions).reduce((sum, value) => sum + value, 0);
    });
    return result.sort((left, right) => qualityModel(left).localeCompare(qualityModel(right))
      || (Number.isFinite(right.qualityScore) ? right.qualityScore : -1) - (Number.isFinite(left.qualityScore) ? left.qualityScore : -1)
      || candidateQualityTie(left, right));
  }

  function candidateStrategyScore(candidate, candidates, settings) {
    const scored = scoreAihubQualityCandidates(candidates, settings).find((row) => Number(candidate.groupId) > 0
      ? Number(row.groupId) === Number(candidate.groupId) : row.group === candidate.group);
    return scored?.qualityScore ?? NaN;
  }

  function sortCandidatesForMode(candidates, mode, settings) {
    return scoreAihubQualityCandidates(candidates, settings);
  }

  function sortCandidateRowsForMode(candidates, mode, settings) {
    const scored = scoreAihubQualityCandidates(candidates, settings);
    return [...scored.filter((row) => row.available), ...scored.filter((row) => !row.available)];
  }

  function candidateCurrentTokens(candidate, tokens, selectedIds) {
    const selected = new Set(selectedIds.map(Number));
    const unique = new Map(tokens.map((token) => [Number(token.id), token]));
    return [...unique.values()].filter((token) => {
      if (!selected.has(Number(token.id))) return false;
      if (Number(candidate.groupId) > 0 && Number(token.groupId) > 0) {
        return Number(candidate.groupId) === Number(token.groupId);
      }
      return token.group === candidate.group;
    });
  }

  function candidateMatchesToken(candidate, token) {
    return Boolean(candidate && (Number(candidate.groupId) > 0 && Number(token.groupId) > 0
      ? Number(candidate.groupId) === Number(token.groupId) : candidate.group === token.group));
  }

  function candidateEmergencySafe(candidate, settings) {
    const allowed = new Set(["tps-missing", "cache-metrics-missing", "cache-stale", "cache-sample-insufficient"]);
    const evidence = candidate.healthEvidence;
    return candidate.emergencyEligible === true && candidate.scopeEligible !== false && candidate.reasons.length > 0
      && candidate.reasons.every((reason) => allowed.has(reason))
      && Number.isSafeInteger(Number(candidate.groupId)) && Number(candidate.groupId) > 0
      && Number.isFinite(candidate.ratio) && candidate.ratio > 0 && (!settings.maxGroupRatio || candidate.ratio <= settings.maxGroupRatio)
      && Number.isFinite(candidate.aggregateSuccess) && candidate.aggregateSuccess >= settings.minSuccessRate && candidate.aggregateSuccess <= 100
      && Number.isFinite(candidate.aihubMetricSampleCount) && candidate.aihubMetricSampleCount >= settings.minMetricSamples
      && evidence?.providerVersionValid === true && evidence.metricsMatchModel === true && evidence.supported === true
      && evidence.monitoringActive === true && evidence.ageMinutes >= 0 && evidence.ageMinutes <= 60
      && !candidate.modelDetectionReason && !candidateHasExplicitHealthFailure(candidate, settings);
  }

  function selectRecoveryCandidate(candidates, model, settings, previousGroup) {
    const sameModel = candidates.filter((row) => qualityModel(row) === model && row.scopeEligible !== false);
    const complete = scoreAihubQualityCandidates(sameModel, settings).filter((row) => row.available && Number.isFinite(row.qualityScore));
    const successUtility = (row) => Math.min(100, Math.max(0, 100 * (row.aggregateSuccess - settings.minSuccessRate)
      / Math.max(100 - settings.minSuccessRate, QUALITY_SCALES.successHeadroom)))
      * row.aihubMetricSampleCount / (row.aihubMetricSampleCount + QUALITY_SCALES.samples);
    const emergency = sameModel.filter((row) => candidateEmergencySafe(row, settings)).sort((left, right) => successUtility(right) - successUtility(left)
      || right.aggregateSuccess - left.aggregateSuccess || right.aihubMetricSampleCount - left.aihubMetricSampleCount
      || left.ratio - right.ratio || Number(left.groupId) - Number(right.groupId));
    const pool = complete.length ? complete : emergency;
    const previous = Number(previousGroup?.groupId) > 0 ? pool.find((row) => Number(row.groupId) === Number(previousGroup.groupId)) : null;
    return (previous || pool[0]) ? { ...(previous || pool[0]), recoveryTier: complete.length ? "complete" : "emergency" } : null;
  }

  function candidateDecisionEvidence(candidate) {
    if (!candidate?.available || !qualityMetricValid(candidate)) return "";
    return JSON.stringify([candidate.groupId, qualityModel(candidate), candidate.aihubMetricWindowStart || "", candidate.aihubMetricWindowEnd || "",
      candidate.aggregateSuccess, candidate.cacheHitRate, candidate.outputTokensPerSecond,
      candidate.aihubMetricSampleCount, candidate.aihubCacheSampleCount, candidate.ratio]);
  }

  function candidateHealthPublications(candidate, switchAt, now) {
    if (!candidate) return [];
    const detection = candidate.modelDetection;
    const detectionAt = Math.max(detection?.detectedAtMs || 0,
      ...(detection?.stages || []).map((stage) => Date.parse(stage.finishedAt || "") || 0));
    const metricAt = Date.parse(candidate.aihubMetricWindowEnd || "");
    return [["detection", detectionAt], ["metrics", metricAt]]
      .filter(([, at]) => Number.isFinite(at) && at > switchAt && at <= now)
      .map(([type, at]) => `${candidate.groupId}:${qualityModel(candidate)}:${type}:${at}`);
  }

  function selectBestCandidate(candidates, currentGroup, mode, settings) {
    let available = candidates.filter((candidate) => candidate.available && candidate.scopeEligible !== false && qualityMetricValid(candidate));
    const matching = candidates.filter((candidate) => typeof currentGroup === "object"
      ? candidateMatchesToken(candidate, currentGroup) : candidate.group === currentGroup);
    if (matching.length > 1) return null;
    const current = matching[0];
    const currentModel = current && qualityModel(current);
    const models = [...new Set(available.map(qualityModel))];
    // Relative scores from different models are never compared. No matching current model is ambiguous.
    if (currentModel) available = available.filter((candidate) => qualityModel(candidate) === currentModel);
    else if (models.length > 1) return null;
    const scored = scoreAihubQualityCandidates(available, settings);
    const best = scored.find((row) => Number.isFinite(row.qualityScore));
    const scoredCurrent = current && scored.find((row) => candidateMatchesToken(row, current));
    return (scoredCurrent && best && scoredCurrent.qualityScore === best.qualityScore ? scoredCurrent : best) || null;
  }

  function selectSwitchCandidate(candidates, currentGroup, targetGroup, options) {
    const target = String(targetGroup || "").trim();
    const request = options && typeof options === "object" ? options : {};
    if (!target) return selectBestCandidate(candidates, currentGroup, request.mode, request.settings);

    const candidate = candidates.find((item) => item.group === target
      && (!(Number(request.targetGroupId) > 0) || Number(item.groupId) === Number(request.targetGroupId)));
    if (!candidate) {
      throw new Error(`目标分组 ${target} 不在当前目标模型组合的可选范围内`);
    }
    if (!candidate.available && !request.allowUnavailable) {
      const reasons = candidate.reasons.map(reasonLabel).join("，") || "未知原因";
      throw new Error(`目标分组 ${target} 当前不可用：${reasons}`);
    }
    return candidate;
  }

  function shouldSwitchCandidate(candidate, currentGroup) {
    return Boolean(candidate && candidate.group !== currentGroup);
  }

  function tokenSupportsModel(token, model) {
    if (!token || !token.model_limits_enabled) return true;
    const limits = Array.isArray(token.model_limits)
      ? token.model_limits
      : String(token.model_limits || "").split(",");
    return limits.map((item) => String(item).trim()).filter(Boolean).includes(model);
  }

  function buildTokenUpdatePayload(token, group) {
    if (!token || !Number.isFinite(Number(token.id))) {
      throw new Error("API 密钥详情缺少有效 ID");
    }
    const modelLimits = Array.isArray(token.model_limits)
      ? token.model_limits.map((item) => String(item).trim()).filter(Boolean).join(",")
      : String(token.model_limits || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .join(",");
    const expiredTime = Number(token.expired_time);
    const unlimitedQuota = Boolean(token.unlimited_quota);
    return {
      id: Number(token.id),
      name: String(token.name || ""),
      remain_quota: unlimitedQuota ? 0 : Number(token.remain_quota) || 0,
      expired_time: Number.isFinite(expiredTime) && expiredTime > 0 ? expiredTime : -1,
      unlimited_quota: unlimitedQuota,
      model_limits_enabled: modelLimits.length > 0,
      model_limits: modelLimits,
      allow_ips: String(token.allow_ips || ""),
      group,
      cross_group_retry: group === "auto" && Boolean(token.cross_group_retry),
    };
  }

  function requestError(message, retryable, status) {

    const error = new Error(message);
    error.kfcodingRequestError = true;
    error.retryable = Boolean(retryable);
    error.status = Number(status) || 0;
    return error;
  }

  function isRetryableStatus(status) {
    return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
  }

  async function requestJsonWithRetry(path, options, runtime) {
    const request = options || {};
    const environment = runtime || {};
    const method = String(request.method || "GET").toUpperCase();
    const isGet = method === "GET";
    const maxAttempts = Math.max(
      1,
      Math.trunc(Number(request.maxAttempts) || (isGet ? GET_MAX_ATTEMPTS : 1)),
    );
    const timeoutMs = Math.max(
      1,
      Number(request.timeoutMs) || (isGet ? GET_REQUEST_TIMEOUT_MS : MUTATION_REQUEST_TIMEOUT_MS),
    );
    const fetchImpl = environment.fetchImpl || globalThis.fetch.bind(globalThis);
    const AbortControllerImpl = environment.AbortControllerImpl || globalThis.AbortController;
    const setTimer = environment.setTimeoutImpl || globalThis.setTimeout.bind(globalThis);
    const clearTimer = environment.clearTimeoutImpl || globalThis.clearTimeout.bind(globalThis);
    const sleepImpl = environment.sleepImpl || ((delay) => new Promise((resolve) => setTimer(resolve, delay)));
    let lastError = null;
    let attemptsMade = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attemptsMade = attempt;
      const controller = new AbortControllerImpl();
      const timeout = setTimer(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(path, {
          method,
          body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
          credentials: "include",
          cache: "no-store",
          headers: request.headers || {},
          signal: controller.signal,
        });
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw requestError(
            `接口 ${path} 返回了非 JSON 数据`,
            isGet && (isRetryableStatus(response.status) || response.status === 200),
            response.status,
          );
        }
        if (!response.ok || payload.success === false) {
          throw requestError(
            payload.message || `接口 ${path} 请求失败 (${response.status})`,
            isGet && isRetryableStatus(response.status),
            response.status,
          );
        }
        return payload;
      } catch (error) {
        if (error && error.kfcodingRequestError) {
          lastError = error;
        } else if (error && error.name === "AbortError") {
          lastError = requestError(`接口 ${path} 请求超时`, isGet, 0);
        } else {
          const detail = error && error.message ? `：${error.message}` : "";
          lastError = requestError(`接口 ${path} 网络请求失败${detail}`, isGet, 0);
        }
      } finally {
        clearTimer(timeout);
      }

      if (!lastError.retryable || attempt >= maxAttempts) break;
      await sleepImpl(750 * 2 ** (attempt - 1));
    }

    if (attemptsMade > 1) {
      lastError.message = `${lastError.message}（已重试 ${attemptsMade - 1} 次）`;
    }
    throw lastError;
  }

  function requiresNewApiAccessToken(path) {
    const apiPath = String(path || "").split("?", 1)[0];
    return apiPath.startsWith("/api/") && !NEW_API_PUBLIC_API_PATHS.has(apiPath);
  }

  function normalizeNewApiAuthBundle(payload, providerLabel) {
    const label = String(providerLabel || "KFCoding");
    const source = payload && payload.data && typeof payload.data === "object"
      ? payload.data
      : null;
    const accessToken = source && typeof source.access_token === "string"
      ? source.access_token.trim()
      : "";
    const accessExpiresAt = Number(source && source.access_expires_at);
    const tokenType = String((source && source.token_type) || "");
    const sessionId = String((source && source.session && source.session.sid) || "");
    if (
      !accessToken
      || tokenType !== "Bearer"
      || !Number.isFinite(accessExpiresAt)
      || accessExpiresAt <= 0
      || !sessionId
    ) {
      throw requestError(`${label} 鉴权刷新响应无效，请刷新页面或重新登录`, false, 0);
    }
    return { accessToken, accessExpiresAt, sessionId };
  }

  function createNewApiAuthManager(options) {
    const runtime = options || {};
    const providerLabel = String(runtime.providerLabel || "KFCoding");
    const requestRefresh = runtime.requestRefresh;
    const nowSeconds = runtime.nowSeconds || (() => Math.floor(Date.now() / 1000));
    const sleep = runtime.sleep || ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
    const runExclusive = runtime.runExclusive || ((task) => {
      const locks = globalThis.navigator && globalThis.navigator.locks;
      return locks
        ? locks.request("new-api:auth-refresh", { mode: "exclusive" }, task)
        : task();
    });
    let accessToken = "";
    let accessExpiresAt = 0;
    let sessionId = "";
    let refreshPromise = null;

    const invalidateAccessToken = () => {
      accessToken = "";
      accessExpiresAt = 0;
    };

    const getAccessToken = async (forceRefresh) => {
      if (!forceRefresh && accessToken && accessExpiresAt > nowSeconds() + 60) {
        return accessToken;
      }
      if (refreshPromise) return refreshPromise;

      refreshPromise = runExclusive(async () => {
        let lastError = null;
        for (let attempt = 0; attempt < NEW_API_AUTH_REFRESH_DELAYS_MS.length; attempt += 1) {
          const delay = NEW_API_AUTH_REFRESH_DELAYS_MS[attempt];
          if (delay > 0) await sleep(delay);
          try {
            const headers = {
              Accept: "application/json",
              "Cache-Control": "no-store",
            };
            if (sessionId) headers["X-Auth-Session"] = sessionId;
            const payload = await requestRefresh(headers);
            const bundle = normalizeNewApiAuthBundle(payload, providerLabel);
            accessToken = bundle.accessToken;
            accessExpiresAt = bundle.accessExpiresAt;
            sessionId = bundle.sessionId;
            return accessToken;
          } catch (error) {
            lastError = error;
            if (Number(error && error.status) === 401) {
              invalidateAccessToken();
              sessionId = "";
              throw requestError(`${providerLabel} 登录已失效，请重新登录后再试`, false, 401);
            }
            if (Number(error && error.status) !== 409) throw error;
            sessionId = "";
          }
        }
        throw requestError(
          `${providerLabel} 登录状态正在同步，请稍后重试`,
          false,
          Number(lastError && lastError.status) || 409,
        );
      }).finally(() => {
        refreshPromise = null;
      });
      return refreshPromise;
    };

    return Object.freeze({ getAccessToken, invalidateAccessToken });
  }

  async function requestWithNewApiAuth(path, authManager, execute) {
    if (!requiresNewApiAccessToken(path)) return execute("");
    let accessToken = await authManager.getAccessToken(false);
    try {
      return await execute(accessToken);
    } catch (error) {
      if (Number(error && error.status) !== 401) throw error;
      authManager.invalidateAccessToken();
      accessToken = await authManager.getAccessToken(true);
      return execute(accessToken);
    }
  }

  function normalizeAihubTodayUsage(payload, accountPayload) {
    const source = payload && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload && typeof payload === "object"
        ? payload
        : {};
    const firstNumber = (...values) => {
      const found = values
        .filter((value) => value !== null && value !== undefined && value !== "")
        .map(Number)
        .find(Number.isFinite);
      return found === undefined ? NaN : found;
    };
    const tokenParts = [
      source.input_tokens,
      source.output_tokens,
      source.cache_read_tokens,
      source.cache_creation_tokens,
    ];
    const tokenFallback = tokenParts.some(
      (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)),
    )
      ? tokenParts.reduce((total, value) => total + (Number(value) || 0), 0)
      : (Number(source.prompt_tokens) || 0) + (Number(source.completion_tokens) || 0);
    const account = accountPayload && accountPayload.data && typeof accountPayload.data === "object"
      ? accountPayload.data
      : accountPayload && typeof accountPayload === "object"
        ? accountPayload
        : {};
    return {
      balance: Math.max(0, firstNumber(account.balance, account.available_balance) || 0),
      spend: Math.max(0, firstNumber(
        source.actual_cost,
        source.total_actual_cost,
        source.total_cost,
        source.cost,
      ) || 0),
      requests: Math.max(0, firstNumber(
        source.total_requests,
        source.request_count,
        source.requests,
      ) || 0),
      tokens: Math.max(0, firstNumber(source.total_tokens, tokenFallback) || 0),
      symbol: "$",
    };
  }

  function normalizeAihubStatisticsDays(value) {
    const days = Number(value);
    if (days === 1) return 1;
    if (days === 7) return 7;
    if (days === 14) return 14;
    if (days === 30) return 30;
    return 1;
  }

  function normalizeAihubStatisticsRange(value) {
    if (value === "today" || Number(value) === 1) return "today";
    if (value === "yesterday") return "yesterday";
    if ([7, 14, 30].includes(Number(value))) return String(Number(value));
    return "today";
  }

  function normalizeAihubStatisticsMetric(value) {
    return ["spend", "requests", "tokens"].includes(value) ? value : "spend";
  }

  function aihubUsageDateDomain(days, now) {
    const length = normalizeAihubStatisticsDays(days);
    const end = now instanceof Date ? new Date(now.getTime()) : new Date(now == null ? Date.now() : now);
    if (!Number.isFinite(end.getTime())) return [];
    end.setHours(12, 0, 0, 0);
    return Array.from({ length }, (_, index) => {
      const date = new Date(end.getTime());
      date.setDate(end.getDate() - (length - index - 1));
      return localDateKey(date);
    });
  }

  function aihubUsageHourDomain(now, range) {
    const end = now instanceof Date ? new Date(now.getTime()) : new Date(now == null ? Date.now() : now);
    if (!Number.isFinite(end.getTime())) return [];
    const normalizedRange = normalizeAihubStatisticsRange(range);
    const yesterday = normalizedRange === "yesterday";
    const currentHour = end.getHours();
    const length = yesterday ? 24 : currentHour === 0 ? 1 : currentHour;
    if (yesterday) end.setDate(end.getDate() - 1);
    end.setHours(0, 0, 0, 0);
    return Array.from({ length }, (_, index) => {
      const hour = new Date(end.getTime());
      hour.setHours(index, 0, 0, 0);
      return `${localDateKey(hour)}T${String(index).padStart(2, "0")}:00`;
    });
  }

  function aihubUsageRange(value, now) {
    const range = normalizeAihubStatisticsRange(value);
    if (range === "yesterday") {
      const today = aihubUsageDateDomain(1, now)[0];
      const yesterdayDate = new Date(`${today}T12:00:00`);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const keyDomain = [localDateKey(yesterdayDate)];
      return {
        range,
        days: 1,
        keyApiDays: 2,
        hourly: true,
        domain: aihubUsageHourDomain(now, range),
        keyDomain,
      };
    }
    if (range === "today") {
      const keyDomain = aihubUsageDateDomain(1, now);
      return {
        range,
        days: 1,
        keyApiDays: 1,
        hourly: true,
        domain: aihubUsageHourDomain(now, range),
        keyDomain,
      };
    }
    const days = normalizeAihubStatisticsDays(range);
    const keyDomain = aihubUsageDateDomain(days, now);
    return { range, days, keyApiDays: days, hourly: false, domain: keyDomain, keyDomain };
  }

  function aihubUsageRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.trend)) return payload.trend;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === "object") {
      if (Array.isArray(payload.data.items)) return payload.data.items;
      if (Array.isArray(payload.data.trend)) return payload.data.trend;
    }
    return [];
  }

  function hasAihubUsageRows(payload) {
    return Array.isArray(payload)
      || Boolean(payload && typeof payload === "object" && (
        Array.isArray(payload.items)
        || Array.isArray(payload.trend)
        || Array.isArray(payload.data)
        || (payload.data && typeof payload.data === "object" && (
          Array.isArray(payload.data.items)
          || Array.isArray(payload.data.trend)
        ))
      ));
  }

  function aihubUsageNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function aihubUsagePointKey(row, granularity) {
    if (!row || typeof row !== "object") return "";
    const raw = String(row.date ?? row.datetime ?? row.hour ?? row.timestamp ?? "");
    const dateMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (!dateMatch) return "";
    if (granularity !== "hour") return dateMatch[0];
    const hourValue = row.hour ?? row.hour_of_day ?? row.hourOfDay;
    const rawHour = hourValue !== undefined && hourValue !== null && /^\d{1,2}(?::\d{2})?$/.test(String(hourValue))
      ? Number.parseInt(String(hourValue), 10)
      : Number((raw.match(/[T\s](\d{1,2})(?::\d{2})?/) || [])[1]);
    if (!Number.isInteger(rawHour) || rawHour < 0 || rawHour > 23) return "";
    return `${dateMatch[0]}T${String(rawHour).padStart(2, "0")}:00`;
  }

  function normalizeAihubUsageSeries(payload, domain, granularity) {
    const dates = Array.isArray(domain) ? domain.map(String) : [];
    const pointGranularity = granularity === "hour" ? "hour" : "day";
    if (!hasAihubUsageRows(payload)) {
      return dates.map((date) => ({ date, present: true, spend: null, requests: null, tokens: null }));
    }
    const requestedDates = new Set(dates);
    const rowsByDate = new Map();
    aihubUsageRows(payload).forEach((row) => {
      if (!row || typeof row !== "object") return;
      const date = aihubUsagePointKey(row, pointGranularity);
      if (!date || !requestedDates.has(date)) return;
      rowsByDate.set(date, row);
    });
    return dates.map((date) => {
      const row = rowsByDate.get(date);
      if (!row) return { date, present: false, spend: 0, requests: 0, tokens: 0 };
      return {
        date,
        present: true,
        spend: aihubUsageNumber(row.actual_cost),
        requests: aihubUsageNumber(row.requests),
        tokens: aihubUsageNumber(row.total_tokens),
      };
    });
  }

  function sumAihubUsageMetric(series, metric) {
    const key = normalizeAihubStatisticsMetric(metric);
    const points = Array.isArray(series) ? series : [];
    if (!points.length) return { available: false, value: 0, invalidDates: [] };
    const invalidDates = points
      .filter((point) => !Number.isFinite(point && point[key]))
      .map((point) => String((point && point.date) || ""))
      .filter(Boolean);
    if (invalidDates.length) return { available: false, value: 0, invalidDates };
    return {
      available: true,
      value: points.reduce((total, point) => total + Math.max(0, Number(point && point[key]) || 0), 0),
      invalidDates: [],
    };
  }

  function reconcileAihubUsage(accountSeries, keyResults, metric) {
    const key = normalizeAihubStatisticsMetric(metric);
    const account = sumAihubUsageMetric(accountSeries, key);
    let failedCount = 0;
    const keys = (Array.isArray(keyResults) ? keyResults : []).map((entry) => {
      const source = entry && typeof entry === "object" ? entry : {};
      const aggregate = source.status === "success"
        ? sumAihubUsageMetric(source.series, key)
        : { available: false, value: 0 };
      const available = source.status === "success" && aggregate.available;
      if (!available) failedCount += 1;
      return {
        id: Number(source.id) || 0,
        name: String(source.name || `密钥 ${source.id || "-"}`),
        status: available ? "success" : "error",
        value: available ? aggregate.value : null,
        error: available ? "" : String(source.error || (source.status === "success" ? "统计字段不完整" : "读取失败")),
      };
    }).sort((left, right) => {
      if (left.status !== right.status) return left.status === "success" ? -1 : 1;
      if (left.status === "success" && right.value !== left.value) return right.value - left.value;
      return left.name.localeCompare(right.name, "zh-CN");
    });
    const assignedTotal = keys.reduce(
      (total, entry) => total + (entry.status === "success" ? Math.max(0, Number(entry.value) || 0) : 0),
      0,
    );
    const complete = account.available && failedCount === 0;
    const accountTotal = account.available ? account.value : null;
    const coverage = complete && accountTotal > 0 ? assignedTotal / accountTotal : complete && assignedTotal === 0 ? 0 : null;
    const remainder = complete ? accountTotal - assignedTotal : null;
    const tolerance = complete ? Math.max(1e-9, accountTotal * 1e-9) : 0;
    const anomaly = complete && assignedTotal - accountTotal > tolerance;
    return {
      metric: key,
      accountAvailable: account.available,
      accountTotal,
      assignedTotal,
      remainder,
      coverage,
      complete,
      failedCount,
      anomaly,
      empty: complete && accountTotal === 0 && assignedTotal === 0,
      keys,
    };
  }

  async function loadAllAihubKeys(fetcher, pageSize) {
    const size = Math.max(1, Math.min(100, Math.trunc(Number(pageSize) || 100)));
    const keys = [];
    const seenIds = new Set();
    for (let page = 1; page <= 100; page += 1) {
      const payload = await fetcher(`/api/v1/keys?page=${page}&page_size=${size}`);
      const items = payload && Array.isArray(payload.items) ? payload.items : [];
      items.forEach((item) => {
        const token = normalizeAihubToken(item);
        if (!token.id || seenIds.has(token.id)) return;
        seenIds.add(token.id);
        keys.push(token);
      });
      const total = Number(payload && (payload.total ?? payload.total_count));
      const hasMore = payload && typeof payload.has_more === "boolean" ? payload.has_more : null;
      if (hasMore === false || items.length === 0 || (Number.isFinite(total) && keys.length >= total)) break;
      if (items.length < size && hasMore !== true) break;
    }
    return keys;
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const source = Array.isArray(items) ? items : [];
    const results = new Array(source.length);
    const workerCount = Math.min(source.length, Math.max(1, Math.trunc(Number(limit) || 1)));
    let nextIndex = 0;
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (nextIndex < source.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(source[index], index);
      }
    }));
    return results;
  }

  async function loadAihubUsageStatistics(fetcher, options) {
    const request = options && typeof options === "object" ? options : {};
    const reportProgress = (phase, progress) => {
      if (typeof request.onProgress !== "function") return;
      request.onProgress({ phase, progress: Math.max(0, Math.min(1, Number(progress) || 0)) });
    };
    const usageRange = aihubUsageRange(request.range ?? request.days, request.now);
    const { range, days, keyApiDays, hourly, domain, keyDomain } = usageRange;
    const timezone = String(request.timezone || aihubTimezone());
    const startDate = keyDomain[0] || "";
    const endDate = keyDomain[keyDomain.length - 1] || "";
    const trendPath = `/api/v1/usage/dashboard/trend?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&granularity=${hourly ? "hour" : "day"}&timezone=${encodeURIComponent(timezone)}`;
    const reconciliationTrendPath = `/api/v1/usage/dashboard/trend?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&granularity=day&timezone=${encodeURIComponent(timezone)}`;
    const cachedKeys = Array.isArray(request.keys) ? request.keys : null;
    reportProgress("trend", 0.12);
    const [accountResult, reconciliationAccountResult, keysResult] = await Promise.allSettled([
      fetcher(trendPath),
      hourly && reconciliationTrendPath !== trendPath ? fetcher(reconciliationTrendPath) : Promise.resolve(null),
      cachedKeys ? Promise.resolve(cachedKeys) : loadAllAihubKeys(fetcher, 100),
    ]);
    reportProgress("keys", 0.28);
    const accountSeries = accountResult.status === "fulfilled"
      ? normalizeAihubUsageSeries(accountResult.value, domain, hourly ? "hour" : "day")
      : [];
    const accountReconciliationSeries = !hourly
      ? accountSeries
      : reconciliationAccountResult.status === "fulfilled"
        ? normalizeAihubUsageSeries(reconciliationAccountResult.value, keyDomain, "day")
        : [];
    const keys = keysResult.status === "fulfilled" ? keysResult.value : [];
    const completedKeys = { count: 0 };
    const keyResults = await mapWithConcurrency(keys, request.concurrency || 3, async (token) => {
      try {
        const payload = await fetcher(`/api/v1/user/api-keys/${encodeURIComponent(token.id)}/usage/daily?days=${keyApiDays}&timezone=${encodeURIComponent(timezone)}`);
        return {
          id: token.id,
          name: String(token.name || `密钥 ${token.id}`),
          status: "success",
          series: normalizeAihubUsageSeries(payload, keyDomain, "day"),
        };
      } catch (error) {
        return {
          id: token.id,
          name: String(token.name || `密钥 ${token.id}`),
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        completedKeys.count += 1;
        reportProgress("keys", 0.28 + (keys.length ? completedKeys.count / keys.length * 0.67 : 0.67));
      }
    });
    reportProgress("complete", 1);
    return {
      range,
      days,
      granularity: hourly ? "hour" : "day",
      timezone,
      domain,
      keyDomain,
      accountSeries,
      accountReconciliationSeries,
      accountReconciliationAggregate: sumAihubUsageMetric(accountReconciliationSeries, "spend"),
      accountError: accountResult.status === "rejected"
        ? (accountResult.reason instanceof Error ? accountResult.reason.message : String(accountResult.reason))
        : "",
      accountReconciliationError: hourly && reconciliationAccountResult.status === "rejected"
        ? (reconciliationAccountResult.reason instanceof Error ? reconciliationAccountResult.reason.message : String(reconciliationAccountResult.reason))
        : "",
      keyResults,
      keysError: keysResult.status === "rejected"
        ? (keysResult.reason instanceof Error ? keysResult.reason.message : String(keysResult.reason))
        : "",
      loadedAt: Date.now(),
    };
  }

  function normalizeNewApiTodayUsage(payload, statusPayload, accountPayload) {
    const rows = payload && Array.isArray(payload.data)
      ? payload.data
      : payload && payload.data && Array.isArray(payload.data.items)
        ? payload.data.items
      : Array.isArray(payload)
        ? payload
        : [];
    const status = statusPayload && statusPayload.data && typeof statusPayload.data === "object"
      ? statusPayload.data
      : statusPayload && typeof statusPayload === "object"
        ? statusPayload
        : {};
    const totals = rows.reduce((result, row) => {
      result.quota += Math.max(0, Number(row && row.quota) || 0);
      result.requests += Math.max(0, Number(row && row.count) || 0);
      result.tokens += Math.max(0, Number(row && row.token_used) || 0);
      return result;
    }, { quota: 0, requests: 0, tokens: 0 });
    const currency = status.currency && typeof status.currency === "object" ? status.currency : {};
    const displayInCurrency = (status.display_in_currency ?? status.displayInCurrency
      ?? currency.displayInCurrency) !== false;
    const quotaPerUnit = Math.max(
      1,
      Number(status.quota_per_unit ?? status.quotaPerUnit ?? currency.quotaPerUnit) || 500000,
    );
    const quotaDisplayType = String(
      status.quota_display_type ?? status.quotaDisplayType ?? currency.quotaDisplayType ?? "USD",
    ).toUpperCase();
    const symbol = quotaDisplayType === "CNY"
      ? "¥"
      : quotaDisplayType === "USD"
        ? "$"
        : String(
            status.custom_currency_symbol
            ?? status.customCurrencySymbol
            ?? currency.customCurrencySymbol
            ?? "",
          );
    const account = accountPayload && accountPayload.data && typeof accountPayload.data === "object"
      ? accountPayload.data
      : accountPayload && typeof accountPayload === "object"
        ? accountPayload
        : {};
    const balanceQuota = Math.max(0, Number(account.quota) || 0);
    return {
      balance: displayInCurrency ? balanceQuota / quotaPerUnit : balanceQuota,
      spend: displayInCurrency ? totals.quota / quotaPerUnit : totals.quota,
      requests: totals.requests,
      tokens: totals.tokens,
      symbol: displayInCurrency ? symbol : "",
    };
  }

  function todayTimestampRange(now) {
    const end = now instanceof Date ? new Date(now.getTime()) : new Date(now == null ? Date.now() : now);
    const start = new Date(end.getTime());
    start.setHours(0, 0, 0, 0);
    return {
      start: Math.floor(start.getTime() / 1000),
      // New API dashboards extend the end boundary by one hour so the
      // still-open current aggregation bucket is included.
      end: Math.floor((end.getTime() + 60 * 60 * 1000) / 1000),
    };
  }

  function formatTokenCount(value, available) {

    if (!available) return "-";
    const count = Math.max(0, Number(value) || 0);
    if (count >= 100_000_000) {
      return `${Number((count / 100_000_000).toFixed(2))}亿`;
    }
    if (count >= 1_000_000) {
      return `${Number((count / 1_000_000).toFixed(2))}M`;
    }
    return count.toLocaleString("zh-CN");
  }

  function extractUserscriptVersion(source) {
    const match = String(source || "").match(/^\/\/\s*@version\s+([^\s]+)\s*$/m);
    return match && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(match[1]) ? match[1] : "";
  }

  function compareVersions(left, right) {
    const normalizedLeftVersion = String(left || "").replace(/^v/i, "");
    const normalizedRightVersion = String(right || "").replace(/^v/i, "");
    // Legacy shortened numeric versions remain comparable; only stable releases enter the update channel.
    const numericVersion = /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,2}$/;
    if (!numericVersion.test(normalizedLeftVersion) || !numericVersion.test(normalizedRightVersion)) return 0;
    const leftParts = normalizedLeftVersion.split(".");
    const rightParts = normalizedRightVersion.split(".");
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
      const leftPart = Number.parseInt(leftParts[index] || "0", 10);
      const rightPart = Number.parseInt(rightParts[index] || "0", 10);
      const normalizedLeft = Number.isFinite(leftPart) ? leftPart : 0;
      const normalizedRight = Number.isFinite(rightPart) ? rightPart : 0;
      if (normalizedLeft !== normalizedRight) return normalizedLeft > normalizedRight ? 1 : -1;
    }
    return 0;
  }

  const TEST_API = Object.freeze({
    DEFAULT_CONFIG,
    SITE_METADATA,
    activeGroupFilter,
    normalizeBusinessPlatform,
    scopeAihubMonitors,
    monitorGroupInScope,
    migrateAihubMonitorScope,
    scoreAihubQualityCandidates,
    normalizeQualityWeights,
    validQualityWeights,
    tokenDecisionModel,
    candidateMatchesToken,
    normalizeAihubGroups,
    normalizeAihubRates,
    aihubMonitorRange,
    aihubUsageDateDomain,
    aihubUsageHourDomain,
    aihubUsageRange,
    buildTokenUpdatePayload,
    buildFluxionModelCatalog,
    clampPosition,
    evaluateAihubCandidates,
    evaluateCandidates,
    evaluateFluxionCandidates,
    mergeTargetModelCandidates,
    extractUserscriptVersion,
    formatBalance,
    formatAihubLatency,
    formatTokenCount,
    fluxionEffectiveGroupRatio,
    fluxionGroupSupportsModel,
    fluxionMonitorMatchScore,
    parsePercentValue,
    compareVersions,
    applyTemporaryBlacklist,
    aihubModelHealthStatus,
    aihubModelDetectionReason,
    aihubModelName,
    buildAihubModelCatalog,
    normalizeAihubModelHealth,
    normalizeAihubModelCards,
    normalizeAihubModelDetection,
    normalizeAihubModelKey,
    migrateAihubStoredModelAliases,
    hasEffectiveRatioEstimate,
    candidateHasHealthFailure,
    candidateHasExplicitHealthFailure,
    aihubGroupModelNames,
    aihubGroupSupportsModel,
    candidateEffectiveRatio,
    candidateRecommendationLabel,
    candidateAggregateSuccessTitle,
    candidateFirstTokenLatencyTitle,
    candidateStrategyScore,
    sortCandidateRowsForMode,
    candidateCurrentTokens,
    evaluateSpendProtection,
    effectiveRatioReasonLabel,
    localDateKey,
    loadAllAihubKeys,
    loadAihubMonitorData,
    loadAihubUsageStatistics,
    mapWithConcurrency,
    normalizeLogs,
    normalizeActiveView,
    normalizeAihubStatisticsDays,
    normalizeAihubStatisticsRange,
    normalizeAihubStatisticsMetric,
    normalizeAihubTodayUsage,
    normalizeAihubUsageSeries,
    normalizeAihubProviderData,
    normalizeAihubDetectionMedia,
    normalizeAihubToken,
    normalizeFluxionMonitors,
    normalizeNewApiTodayUsage,
    normalizeNewApiTokenList,
    normalizeSwitchHistory,
    normalizeSwitchGuardState,
    normalizeSpendGuard,
    normalizeGlassTransparency,
    normalizeSelectionMode,
    normalizeAutomaticSwitchMode,
    normalizeThemeMode,
    normalizeUiPositions,
    normalizeTargetModels,
    parseAllowedGroups,
    parseTokenIds,
    pruneSwitchGuardState,
    createNewApiAuthManager,
    detectSiteId,
    listActiveIsolations,
    removeIsolation,
    removeAllIsolations,
    restoreIsolations,
    requestJsonWithRetry,
    requestWithNewApiAuth,
    reconcileAihubUsage,
    requiresNewApiAccessToken,
    normalizeNewApiAuthBundle,
    requiresTokenSelection,
    resolveGlassMaterial,
    resolveThemeMode,
    sanitizeConfig,
    selectBestCandidate,
    selectRollbackCandidate,
    selectSwitchCandidate,
    selectionModeLabel,
    shouldSwitchCandidate,
    storagePrefixForSite,
    statisticsTrendPointLabel,
    statisticsTrendChartLayout,
    statisticsTrendScrollLeft,
    sumAihubUsageMetric,
    summarizeTokenGroups,
    switchHoldState,
    shouldKeepCurrentDuringHold,
    candidateIssueText,
    targetModelIdentity,
    targetModels,
    tokenSupportsModel,
    todayTimestampRange,
    unwrapUserGroups,
  });

  if (globalThis.__KFCODING_GROUP_SWITCHER_TEST__) {
    globalThis.__KFCODING_GROUP_SWITCHER_API__ = TEST_API;
    return;
  }

  // Non-AIHub sites must stop before reading or migrating their legacy storage.
  if (!globalThis.__KFCODING_GROUP_SWITCHER_PREVIEW__ && !IS_AIHUB) return;
  const storedConfig = GM_getValue(STORAGE_CONFIG, {});
  let config = sanitizeConfig(storedConfig);
  if (IS_AIHUB) {
    const migrated = migrateAihubStoredModelAliases(
      storedConfig,
      GM_getValue(STORAGE_LAST_SWITCH, {}),
      GM_getValue(STORAGE_SWITCH_GUARD, {}),
    );
    config = migrated.config;
    if (migrated.changed) {
      GM_setValue(STORAGE_CONFIG, migrated.config);
      GM_setValue(STORAGE_LAST_SWITCH, migrated.history);
      GM_setValue(STORAGE_SWITCH_GUARD, migrated.guard);
    }
  }
  if (JSON.stringify(storedConfig) !== JSON.stringify(config)) GM_setValue(STORAGE_CONFIG, config);
  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let scheduler = null;
  const checkSchedule = { healthAt: 0, strategyAt: 0, revision: 0 };
  let updateScheduler = null;
  let statisticsScheduler = null;
  let isolationUndoScheduler = null;
  let root = null;
  let refs = {};
  const renderedSections = new WeakMap();
  let running = false;
  let pricingCache = null;
  let tokensCache = [];
  let userGroupsCache = {};
  let aihubGroupsCache = [];
  let aihubPlatformMonitorsCache = [];
  let aihubRatesCache = {};
  let fluxionGroupsCache = [];
  let fluxionRatesCache = {};
  let fluxionMonitorsCache = [];
  const inflightGetRequests = new Map();
  const newApiAuthManager = IS_NEW_API_SITE ? createNewApiAuthManager({
    providerLabel: SITE_LABEL,
    requestRefresh: (headers) => requestJsonWithRetry("/api/user/auth/refresh", {
      method: "POST",
      headers,
      maxAttempts: 1,
    }),
  }) : null;
  const pendingCandidates = new Map();
  const storedUi = GM_getValue(STORAGE_UI, {}) || {};
  const state = {
    configWarnings: storedConfig.qualityWeights !== undefined && !validQualityWeights(storedConfig.qualityWeights)
      ? ["已保存的质量权重损坏，已整套恢复默认 40/30/20/10，请检查设置。"] : [],
    checkCancelRevision: 0,
    outOfScopeTokens: [],
    tone: "idle",
    status: config.enabled ? "等待首次检查" : "自动切换已暂停",
    currentGroup: "-",
    bestGroup: "-",
    lastCheck: "-",
    lastHealthCheck: "-",
    lastStrategyCheck: "-",
    candidates: [],
    candidateRevision: 0, candidateRequestRevision: 0,
    tokenResults: [],
    todayUsage: {
      balance: 0,
      spend: 0,
      requests: 0,
      tokens: 0,
      symbol: "$",
      available: false,
      loading: true,
      error: "",
    },
    statistics: {
      metric: normalizeAihubStatisticsMetric(storedUi.statisticsMetric),
      range: normalizeAihubStatisticsRange(storedUi.statisticsRange ?? storedUi.statisticsDays),
      dataRange: "",
      dataDays: 0,
      granularity: "day",
      timezone: "",
      loading: false,
      loadingPhase: "idle",
      loadingProgress: 0,
      loaded: false,
      accountSeries: [],
      accountReconciliationSeries: [],
      accountReconciliationAggregate: null,
      keyResults: [],
      accountError: "",
      accountReconciliationError: "",
      keysError: "",
      loadedAt: 0,
    },
    spendProtection: {
      active: false,
      tone: "none",
      actualSpend: 0,
      trackedSpend: 0,
      limit: 0,
      ratio: 0,
      remaining: 0,
    },
    logs: normalizeLogs(GM_getValue(STORAGE_LOGS, [])),
    positions: normalizeUiPositions(GM_getValue(STORAGE_POSITIONS, {})),
    activeView: normalizeActiveView(storedUi.activeView),
    settingsPage: ["routing", "protection", "spending", "appearance"].includes(storedUi.settingsPage)
 ? storedUi.settingsPage : "routing",
    settingsScroll: {},
    collapsed: false,
    update: {
      checking: false,
      availableVersion: "",
      lastCheckedAt: 0,
    },
    aihubSeriesDegraded: false,
    isolationUndo: {
      entries: [],
      expiresAt: 0,
    },
  };

  function addLog(message, tone) {
    state.logs.unshift({
      at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      message,
      tone: tone || "info",
    });
    state.logs = state.logs.slice(0, MAX_LOG_ENTRIES);
    GM_setValue(STORAGE_LOGS, state.logs);
  }

  function saveSpendGuardState(value) {
    GM_setValue(STORAGE_SPEND_GUARD, normalizeSpendGuard(value, localDateKey()));
  }

  function syncSpendProtection(options) {
    const request = options && typeof options === "object" ? options : {};
    const dateKey = localDateKey();
    const storedGuard = GM_getValue(STORAGE_SPEND_GUARD, {});
    const result = evaluateSpendProtection(state.todayUsage, config, storedGuard, dateKey);
    const guard = { ...result.guard };
    state.spendProtection = {
      active: result.active,
      tone: result.tone,
      actualSpend: result.actualSpend,
      trackedSpend: result.trackedSpend,
      limit: result.limit,
      ratio: result.ratio,
      remaining: result.remaining,
    };

    let notification = null;
    if (request.notify && result.tone === "reached" && !guard.warnedReached) {
      guard.warnedApproaching = true;
      guard.warnedReached = true;
      notification = {
        title: `${SITE_LABEL} 每日消费已达上限`,
        text: `提醒计数 ${formatSpendValue(result.trackedSpend, state.todayUsage.symbol)} / ${formatSpendValue(result.limit, state.todayUsage.symbol)}，仅提醒，不影响任务`,
        log: `消费提醒：已达到每日上限 ${formatSpendValue(result.limit, state.todayUsage.symbol)}`,
      };
    } else if (request.notify && result.tone === "approaching" && !guard.warnedApproaching) {
      guard.warnedApproaching = true;
      notification = {
        title: `${SITE_LABEL} 每日消费接近上限`,
        text: `提醒计数已使用 ${Math.round(result.ratio * 100)}%，剩余 ${formatSpendValue(result.remaining, state.todayUsage.symbol)}`,
        log: `消费提醒：已使用每日上限的 ${Math.round(result.ratio * 100)}%`,
      };
    }
    saveSpendGuardState(guard);
    if (notification) {
      addLog(notification.log, "warning");
      GM_notification({ title: notification.title, text: notification.text, timeout: 10000 });
    }
  }

  function resetSpendProtection() {
    const actualSpend = state.todayUsage.available
      ? Math.max(0, Number(state.todayUsage.spend) || 0)
      : 0;
    saveSpendGuardState({
      dateKey: localDateKey(),
      baselineSpend: actualSpend,
      warnedApproaching: false,
      warnedReached: false,
    });
    syncSpendProtection({ notify: false });
    addLog(`消费提醒计数已重置，当前基线 ${formatSpendValue(actualSpend, state.todayUsage.symbol)}`, "success");
    setStatus("消费提醒计数已从当前消费重新开始", "success");
  }

  function setStatus(message, tone) {
    state.status = message;
    state.tone = tone || "idle";
    render();
  }

  function requestRemoteScript() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `${SCRIPT_DOWNLOAD_URL}?update=${Date.now()}`,
        timeout: GET_REQUEST_TIMEOUT_MS,
        headers: { Accept: "text/plain" },
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(String(response.responseText || ""));
            return;
          }
          reject(new Error(`更新检查失败（HTTP ${response.status}）`));
        },
        onerror() {
          reject(new Error("更新检查网络错误"));
        },
        ontimeout() {
          reject(new Error("更新检查请求超时"));
        },
      });
    });
  }

  function notifyUpdateAvailable(remoteVersion) {
    const version = String(remoteVersion || "").trim();
    if (!version || GM_getValue(STORAGE_UPDATE_NOTICE, "") === version) return;
    GM_notification({
      title: "分组监控脚本有新版本",
      text: `可由 v${SCRIPT_VERSION} 升级到 v${version}，请打开插件设置完成更新`,
      timeout: 10000,
    });
    GM_setValue(STORAGE_UPDATE_NOTICE, version);
  }

  async function checkForUpdate(options) {
    const request = options && typeof options === "object" ? options : {};
    const silent = Boolean(request.silent);
    const force = Boolean(request.force);
    if (state.update.checking) return;
    if (
      silent
      && !force
      && state.update.lastCheckedAt > 0
      && Date.now() - state.update.lastCheckedAt < AUTO_UPDATE_CHECK_INTERVAL_MS
    ) return;

    state.update.checking = true;
    if (!silent) setStatus("正在检查脚本更新", "running");
    try {
      const remoteSource = await requestRemoteScript();
      const remoteVersion = extractUserscriptVersion(remoteSource);
      if (!remoteVersion) throw new Error("无法识别远端脚本版本");
      if (compareVersions(remoteVersion, SCRIPT_VERSION) > 0) {
        const isNewDiscovery = state.update.availableVersion !== remoteVersion;
        state.update.availableVersion = remoteVersion;
        if (isNewDiscovery) {
          addLog(`发现新版本 v${remoteVersion}`, "success");
          notifyUpdateAvailable(remoteVersion);
        }
        if (!silent) setStatus(`发现新版本 v${remoteVersion}，再次点击即可更新`, "success");
      } else if (!silent) {
        addLog(`当前已是最新版本 v${SCRIPT_VERSION}`, "success");
        setStatus(`当前已是最新版本 v${SCRIPT_VERSION}`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!silent) {
        addLog(message, "error");
        setStatus(message, "error");
      }
    } finally {
      state.update.lastCheckedAt = Date.now();
      state.update.checking = false;
      render();
    }
  }

  async function handleUpdateAction() {
    if (state.update.availableVersion) {
      GM_openInTab(SCRIPT_DOWNLOAD_URL, { active: true, insert: true, setParent: true });
      addLog(`已打开 v${state.update.availableVersion} 更新页面`, "success");
      setStatus("请在 Tampermonkey 安装页确认更新", "success");
      return;
    }
    await checkForUpdate({ force: true, silent: false });
  }

  function positionElement(element, kind, persist) {
    const saved = state.positions[kind];
    if (!element || !saved || element.hidden) return;
    const rect = element.getBoundingClientRect();
    const position = clampPosition(
      saved,
      window.innerWidth,
      window.innerHeight,
      rect.width,
      rect.height,
    );
    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
    state.positions[kind] = position;
    if (persist) GM_setValue(STORAGE_POSITIONS, state.positions);
  }

  function bindDrag(handle, element, kind) {
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      const interactiveChild = event.target !== handle && event.target.closest("button, input, select, a");
      if (event.button !== 0 || interactiveChild) return;
      const rect = element.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        elementX: rect.left,
        elementY: rect.top,
        moved: false,
      };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(deltaX, deltaY) < 10) return;
      if (!drag.moved) {
        drag.moved = true;
        element.dataset.dragging = "true";
      }
      const rect = element.getBoundingClientRect();
      const position = clampPosition(
        { x: drag.elementX + deltaX, y: drag.elementY + deltaY },
        window.innerWidth,
        window.innerHeight,
        rect.width,
        rect.height,
      );
      element.style.left = `${position.x}px`;
      element.style.top = `${position.y}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
      state.positions[kind] = position;
      event.preventDefault();
    });
    const finish = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.moved) {
        if (event.type === "pointerup") element.dataset.dragged = "true";
        GM_setValue(STORAGE_POSITIONS, state.positions);
      }
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      delete element.dataset.dragging;
      drag = null;
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function requestHeaders(hasBody, newApiAccessToken) {
    const headers = { Accept: "application/json" };
    if (IS_AIHUB_API) {
      const authToken = window.localStorage.getItem("auth_token");
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      headers["Accept-Language"] = "zh";
      if (IS_FLUXION) headers["X-User-UI-Request"] = "1";
    } else {
      if (newApiAccessToken) headers.Authorization = `Bearer ${newApiAccessToken}`;
      const uid = window.localStorage.getItem("uid");
      if (uid) headers["New-Api-User"] = uid;
    }
    if (hasBody) headers["Content-Type"] = "application/json";
    return headers;
  }

  function unwrapSiteResponse(payload) {
    if (!IS_AIHUB_API || !payload || typeof payload !== "object" || !("code" in payload)) {
      return payload;
    }
    if (Number(payload.code) !== 0) {
      throw new Error(payload.message || `${SITE_LABEL} 接口返回错误码 ${payload.code}`);
    }
    return payload.data;
  }

  function withFluxionTimezone(path, method) {
    const source = String(path || "");
    if (!IS_FLUXION || String(method || "GET").toUpperCase() !== "GET" || /[?&]timezone=/.test(source)) {
      return source;
    }
    const hashIndex = source.indexOf("#");
    const base = hashIndex >= 0 ? source.slice(0, hashIndex) : source;
    const hash = hashIndex >= 0 ? source.slice(hashIndex) : "";
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}timezone=${encodeURIComponent(aihubTimezone())}${hash}`;
  }

  async function fetchJson(path, options) {
    const request = options || {};
    const method = String(request.method || "GET").toUpperCase();
    const requestPath = withFluxionTimezone(path, method);
    const executeRequest = async (newApiAccessToken) => unwrapSiteResponse(await requestJsonWithRetry(requestPath, {
      ...request,
      method,
      headers: requestHeaders(request.body !== undefined, newApiAccessToken),
    }));
    const execute = async () => IS_AIHUB_API
      ? executeRequest("")
      : requestWithNewApiAuth(requestPath, newApiAuthManager, executeRequest);

    if (method !== "GET") return execute();
    if (inflightGetRequests.has(requestPath)) return inflightGetRequests.get(requestPath);

    const pending = execute().finally(() => inflightGetRequests.delete(requestPath));
    inflightGetRequests.set(requestPath, pending);
    return pending;
  }

  function normalizeTokenList(payload) {
    if (IS_AIHUB_API) {
      const items = Array.isArray(payload)
        ? payload
        : payload && Array.isArray(payload.items)
          ? payload.items
          : [];
      return items.map(normalizeAihubToken);
    }
    return normalizeNewApiTokenList(payload);
  }

  function normalizeNewApiTokenList(payload) {
    const data = payload && payload.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  }

  function normalizeAihubToken(token) {
    const source = token && typeof token === "object" ? token : {};
    const groupMeta = source.group && typeof source.group === "object" ? source.group : {};
    const groupId = Number(source.group_id ?? groupMeta.id ?? source.groupId);
    return {
      ...source,
      group: String(groupMeta.name || (typeof source.group === "string" ? source.group : "") || source.group_name || "未分组"),
      groupId: Number.isFinite(groupId) && groupId > 0 ? groupId : 0,
    };
  }

  async function refreshTodayUsage() {
    state.todayUsage.loading = true;
    state.todayUsage.error = "";
    render();
    try {
      let usage;
      if (IS_AIHUB_API) {
        const [usagePayload, account] = await Promise.all([
          fetchJson("/api/v1/usage/stats?period=today"),
          fetchJson("/api/v1/auth/me"),
        ]);
        usage = normalizeAihubTodayUsage(
          usagePayload,
          account,
        );
      } else {
        const range = todayTimestampRange();
        const query = new URLSearchParams({
          start_timestamp: String(range.start),
          end_timestamp: String(range.end),
          default_time: "hour",
        });
        const [payload, status, account] = await Promise.all([
          fetchJson(`/api/data/self?${query}`),
          fetchJson("/api/status"),
          fetchJson("/api/user/self"),
        ]);
        usage = normalizeNewApiTodayUsage(payload, status, account);
      }
      state.todayUsage = { ...usage, available: true, loading: false, error: "" };
      syncSpendProtection({ notify: true });
      render();
      return true;
    } catch (error) {
      state.todayUsage.loading = false;
      state.todayUsage.error = error instanceof Error ? error.message : String(error);
      render();
      return false;
    }
  }

  async function refreshStatistics(options) {
    if (!IS_AIHUB || state.statistics.loading) return false;
    const request = options && typeof options === "object" ? options : {};
    const requestedRange = normalizeAihubStatisticsRange(state.statistics.range);
    const previousMatchesRange = state.statistics.loaded && state.statistics.dataRange === requestedRange;
    state.statistics.loading = true;
    state.statistics.loadingPhase = "trend";
    state.statistics.loadingProgress = 0.1;
    state.statistics.accountError = "";
    state.statistics.keysError = "";
    render();
    try {
      const result = await loadAihubUsageStatistics(fetchJson, {
        range: requestedRange,
        timezone: aihubTimezone(),
        concurrency: 3,
        keys: tokensCache.length ? tokensCache : undefined,
        onProgress: ({ phase, progress }) => {
          state.statistics.loadingPhase = phase;
          state.statistics.loadingProgress = progress;
          render();
        },
      });
      const individualFailures = result.keyResults.filter((entry) => entry.status !== "success").length;
      const accountSeries = result.accountError && previousMatchesRange
        ? state.statistics.accountSeries
        : result.accountSeries;
      const accountReconciliationSeries = result.accountReconciliationError && previousMatchesRange
        ? state.statistics.accountReconciliationSeries
        : result.accountReconciliationSeries;
      const keyResults = result.keysError && previousMatchesRange
        ? state.statistics.keyResults
        : result.keyResults;
      state.statistics = {
        ...state.statistics,
        range: requestedRange,
        dataRange: result.range,
        dataDays: result.days,
        granularity: result.granularity,
        timezone: result.timezone,
        loading: false,
        loadingPhase: "idle",
        loadingProgress: 1,
        loaded: accountSeries.length > 0 || keyResults.length > 0,
        accountSeries,
        accountReconciliationSeries,
        accountReconciliationAggregate: result.accountReconciliationError && previousMatchesRange
          ? state.statistics.accountReconciliationAggregate
          : result.accountReconciliationAggregate,
        keyResults,
        accountError: result.accountError,
        accountReconciliationError: result.accountReconciliationError,
        keysError: result.keysError,
        loadedAt: result.accountError && previousMatchesRange ? state.statistics.loadedAt : result.loadedAt,
      };
      if (!request.silent) {
        if (result.accountError) {
          addLog(`AIHub 统计趋势读取失败：${result.accountError}`, "error");
        } else if (result.keysError) {
          addLog(`AIHub 密钥统计列表读取失败：${result.keysError}`, "warning");
        } else if (individualFailures > 0) {
          addLog(`AIHub 统计已刷新，${individualFailures} 个密钥读取失败`, "warning");
        } else {
          const rangeLabel = requestedRange === "today"
            ? "今天"
            : requestedRange === "yesterday"
              ? "昨天"
              : `最近 ${requestedRange} 天`;
          addLog(`AIHub ${rangeLabel}统计已刷新`, "success");
        }
      }
      render();
      return !result.accountError;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.statistics.loading = false;
      state.statistics.loadingPhase = "idle";
      state.statistics.loadingProgress = 0;
      state.statistics.accountError = message;
      if (!request.silent) addLog(`AIHub 统计读取失败：${message}`, "error");
      render();
      return false;
    }
  }

  async function refreshCatalogs() {
    if (IS_AIHUB_API) {
      const requests = [
        IS_AIHUB ? loadAllAihubKeys(fetchJson, 100) : fetchJson("/api/v1/keys?page=1&page_size=100"),
        fetchJson("/api/v1/groups/available"),
        fetchJson("/api/v1/groups/rates"),
      ];
      if (IS_FLUXION) requests.push(fetchJson("/api/v1/channel-monitors"));
      else requests.push(loadAihubProviderData(fetchJson));
      const [tokenList, groups, rates, monitorPayload] = await Promise.all(requests);
      tokensCache = normalizeTokenList(tokenList);
      if (IS_FLUXION) {
        fluxionGroupsCache = normalizeFluxionGroups(groups);
        fluxionRatesCache = normalizeAihubRates(rates);
        fluxionMonitorsCache = normalizeFluxionMonitors(monitorPayload);
        pricingCache = buildFluxionModelCatalog(monitorPayload, groups);
      } else {
        aihubGroupsCache = normalizeAihubGroups(groups);
        aihubPlatformMonitorsCache = monitorPayload.summary.apis || [];
        aihubRatesCache = normalizeAihubRates(rates);
        pricingCache = buildAihubModelCatalog(monitorPayload.summary);
        applyMonitorScopeMigration();
      }
      renderOptions();
      render();
      return;
    }
    const [pricing, tokenList, userGroups] = await Promise.all([
      fetchJson("/api/pricing"),
      fetchJson("/api/token/?p=1&size=100"),
      fetchJson("/api/user/self/groups"),
    ]);
    pricingCache = pricing;
    tokensCache = normalizeTokenList(tokenList);
    userGroupsCache = unwrapUserGroups(userGroups);
    renderOptions();
    render();
  }

  async function refreshTokenCatalog() {
    const payload = IS_AIHUB_API
      ? (IS_AIHUB ? await loadAllAihubKeys(fetchJson, 100) : await fetchJson("/api/v1/keys?page=1&page_size=100"))
      : await fetchJson("/api/token/?p=1&size=100");
    tokensCache = normalizeTokenList(payload);
    renderOptions(true);
    render();
  }

  async function getTokenDetail(tokenId) {
    if (IS_AIHUB_API) {
      try {
        const payload = await fetchJson(`/api/v1/keys/${tokenId}`);
        if (!payload || typeof payload !== "object") throw new Error("API 密钥详情为空");
        const detail = normalizeAihubToken(payload);
        if (IS_AIHUB) {
          const cached = tokensCache.find((token) => Number(token.id) === Number(tokenId));
          const groupState = { id: Number(tokenId), group: detail.group, groupId: detail.groupId };
          if (cached) Object.assign(cached, groupState);
          else tokensCache.push({ ...groupState, name: detail.name });
        }
        return detail;
      } catch (error) {
        if (IS_AIHUB) {
          const cached = tokensCache.find((token) => Number(token.id) === Number(tokenId));
          if (cached) Object.assign(cached, { group: "", groupId: 0 });
        }
        throw error;
      }
    }
    const payload = await fetchJson(`/api/token/${tokenId}`);
    if (!payload.data || typeof payload.data !== "object") {
      throw new Error("API 密钥详情为空");
    }
    return payload.data;
  }

  function getSwitchHistory() {
    return normalizeSwitchHistory(GM_getValue(STORAGE_LAST_SWITCH, {}));
  }

  function switchHoldState(history, tokenId, model, group, holdMinutes, now) {
    const last = normalizeSwitchHistory(history).byToken[Number(tokenId)] || null;
    const durationMs = Math.max(0, Number(holdMinutes) || 0) * 60000;
    const matches = Boolean(
      last
      && last.model === String(model || "")
      && last.group === String(group || ""),
    );
    if (!matches) return { tracked: false, remainingMs: 0, expired: false };
    const elapsedMs = Math.max(0, Number(now) - Number(last.at || 0));
    const remainingMs = Math.max(0, durationMs - elapsedMs);
    return {
      tracked: true,
      remainingMs,
      expired: durationMs > 0 && remainingMs === 0,
    };
  }

  function shouldKeepCurrentDuringHold(currentCandidate, holdState) {
    return Boolean(
      currentCandidate
      && currentCandidate.available
      && holdState
      && Number(holdState.remainingMs) > 0,
    );
  }

  function recordSwitchHoldStart(tokenId, candidate) {
    const history = getSwitchHistory();
    history.byToken[tokenId] = {
      model: tokenDecisionModel(config, tokenId),
      group: candidate.group,
      at: Date.now(),
    };
    GM_setValue(STORAGE_LAST_SWITCH, history);
  }

  function getSwitchGuardState(now) {
    return pruneSwitchGuardState(
      GM_getValue(STORAGE_SWITCH_GUARD, {}),
      now == null ? Date.now() : now,
    );
  }

  function saveSwitchGuardState(value) {
    GM_setValue(STORAGE_SWITCH_GUARD, normalizeSwitchGuardState(value));
  }

  function refreshCandidateIsolationState(updateRecommendation = true) {
    const now = Date.now();
    const candidates = state.candidates.map((candidate) => {
      const reasons = candidate.reasons.filter((reason) => reason !== "temporarily-blacklisted");
      return { ...candidate, reasons, available: reasons.length === 0 };
    });
    state.candidates = applyTemporaryBlacklist(candidates, getSwitchGuardState(now), targetModelIdentity(config), now);
    if (updateRecommendation) {
      refreshQualityRecommendation();
    }
  }

  function setIsolationUndo(entries) {
    if (isolationUndoScheduler) window.clearTimeout(isolationUndoScheduler);
    state.isolationUndo = {
      entries: entries.slice(),
      expiresAt: Date.now() + 8000,
    };
    isolationUndoScheduler = window.setTimeout(() => {
      state.isolationUndo = { entries: [], expiresAt: 0 };
      isolationUndoScheduler = null;
      render();
    }, 8000);
  }

  function clearIsolation(model, group, groupId) {
    const result = removeIsolation(getSwitchGuardState(), model, group, Date.now(), groupId);
    if (!result.removed.length) return;
    saveSwitchGuardState(result.state);
    refreshCandidateIsolationState();
    setIsolationUndo(result.removed);
    const label = groupId ? `${group} #${groupId}` : group;
    addLog(`已解除故障隔离：${label}`, "success");
    setStatus(`已解除 ${label} 的故障隔离`, "success");
  }

  function clearAllIsolations() {
    const result = removeAllIsolations(getSwitchGuardState(), Date.now());
    if (!result.removed.length) return;
    saveSwitchGuardState(result.state);
    refreshCandidateIsolationState();
    setIsolationUndo(result.removed);
    addLog(`已解除全部故障隔离（${result.removed.length} 个）`, "success");
    setStatus(`已解除 ${result.removed.length} 个故障隔离`, "success");
  }

  function undoIsolationClear() {
    const entries = state.isolationUndo.entries.slice();
    if (!entries.length || state.isolationUndo.expiresAt <= Date.now()) return;
    saveSwitchGuardState(restoreIsolations(getSwitchGuardState(), entries, Date.now()));
    state.isolationUndo = { entries: [], expiresAt: 0 };
    if (isolationUndoScheduler) window.clearTimeout(isolationUndoScheduler);
    isolationUndoScheduler = null;
    refreshCandidateIsolationState();
    addLog(`已撤销解除故障隔离（${entries.length} 个）`, "warning");
    setStatus("故障隔离已恢复", "warning");
  }

  function recordRollbackGuard(token, candidate) {
    const tokenId = Number(token.id);
    const state = getSwitchGuardState();
    const fromGroup = String(token.group || "").trim();
    const toGroup = String(candidate.group || "").trim();
    const [fromGroupId] = normalizeMonitorGroupIds([token.groupId]);
    const [toGroupId] = normalizeMonitorGroupIds([candidate.groupId]);
    if (
      config.rollbackChecks <= 0 ||
      !Number.isFinite(tokenId) ||
      tokenId <= 0 ||
      !fromGroup ||
      !toGroup ||
      (fromGroupId && toGroupId ? fromGroupId === toGroupId : fromGroup === toGroup)
    ) {
      delete state.byToken[tokenId];
      saveSwitchGuardState(state);
      return;
    }
    state.byToken[tokenId] = {
      model: tokenDecisionModel(config, tokenId),
      fromGroup,
      toGroup,
      ...(fromGroupId ? { fromGroupId } : {}),
      ...(toGroupId ? { toGroupId } : {}),
      remaining: config.rollbackChecks,
      at: Date.now(),
      switchAt: Date.now(),
      initialEvidence: candidateDecisionEvidence(candidate),
      seenEvidence: candidateHealthPublications(candidate, 0, Date.now()),
      lastEvidence: "",
    };
    saveSwitchGuardState(state);
  }

  function tokenLabel(token) {
    return String(token.name || `#${token.id}`);
  }

  function summarizeTokenGroups(results) {
    if (!results.length) return "-";
    const counts = new Map();
    results.forEach((result) => {
      const group = String(result.group || "未知");
      counts.set(group, (counts.get(group) || 0) + 1);
    });
    if (results.length === 1) return [...counts.keys()][0];
    const groups = [...counts.entries()]
      .map(([group, count]) => `${group} ${count}`)
      .join(" / ");
    return `${results.length} 个密钥 · ${groups}`;
  }

  async function switchTokenGroup(token, candidate, options) {
    const perform = async () => {
      const latest = await getTokenDetail(token.id);
      options?.beforeSwitch?.();
      if (!candidateMatchesToken({ group: latest.group, groupId: latest.groupId }, token)) {
        throw new Error("密钥分组已在其他操作中改变，本次取消切换");
      }
      return switchTokenGroupUnlocked(token, candidate, options);
    };
    if (globalThis.navigator?.locks) {
      return navigator.locks.request(STORAGE_PREFIX + ":switch:" + token.id, { ifAvailable: true }, (lock) => {
        if (!lock) throw new Error("该密钥正由其他页面切换，请稍后重试");
        return perform();
      });
    }
    return perform();
  }

  async function switchTokenGroupUnlocked(token, candidate, options) {
    const switchOptions = options || {};
    switchOptions.beforeSwitch?.();
    if (IS_AIHUB_API) {
      if (!Number.isFinite(Number(candidate.groupId)) || Number(candidate.groupId) <= 0) {
        throw new Error(`目标分组 ${candidate.group} 缺少有效 ID`);
      }
      await fetchJson(`/api/v1/keys/${token.id}`, {
        method: "PUT",
        body: { group_id: Number(candidate.groupId) },
      });
      const verified = await getTokenDetail(token.id);
      if (Number(verified.groupId) !== Number(candidate.groupId)) {
        throw new Error(`切换校验失败，服务端当前分组为 ${verified.group || "空"}`);
      }
      recordSwitchHoldStart(token.id, candidate);
      if (switchOptions.trackRollback !== false) recordRollbackGuard(token, candidate);
      pendingCandidates.delete(Number(token.id));
      addLog(
        switchOptions.logMessage || `${tokenLabel(token)} 已切换到 ${candidate.group} (${formatRatio(candidate.ratio)})`,
        switchOptions.logTone || "success",
      );
      return verified;
    }
    const payload = buildTokenUpdatePayload(token, candidate.group);
    await fetchJson("/api/token/", { method: "PUT", body: payload });
    const verified = await getTokenDetail(token.id);
    if (verified.group !== candidate.group) {
      throw new Error(`切换校验失败，服务端当前分组为 ${verified.group || "空"}`);
    }
    recordSwitchHoldStart(token.id, candidate);
    if (switchOptions.trackRollback !== false) recordRollbackGuard(token, candidate);
    pendingCandidates.delete(Number(token.id));
    addLog(
      switchOptions.logMessage || `${tokenLabel(token)} 已切换到 ${candidate.group} (${formatRatio(candidate.ratio)})`,
      switchOptions.logTone || "success",
    );
    return verified;
  }

  function validateToken(token) {
    if (IS_AIHUB_API) {
      if (token.status !== "active") throw new Error("选中的 API 密钥未启用");
      return;
    }
    if (token.status != null && Number(token.status) !== 1) {
      throw new Error("选中的 API 密钥未启用");
    }
    const unsupportedModels = targetModels(config).filter((model) => !tokenSupportsModel(token, model));
    if (unsupportedModels.length) {
      throw new Error(`选中的 API 密钥未允许模型 ${unsupportedModels.join("、")}`);
    }
  }

  function invalidateCheckDecisions() {
    state.checkCancelRevision = (state.checkCancelRevision || 0) + 1;
    pendingCandidates.clear();
  }

  function refreshOutOfScopeTokens(tokens = tokensCache) {
    state.outOfScopeTokens = tokens.filter((token) => config.tokenIds.includes(Number(token.id))
      && !monitorGroupInScope(config, token.groupId)).map((token) => ({
        id: Number(token.id), name: tokenLabel(token), group: token.group || "未知", groupId: Number(token.groupId) || 0,
      }));
  }

  function saveMonitorScope(mode, ids) {
    const next = sanitizeConfig({ ...config, monitorScopeMode: mode === "selected" ? "selected" : "all",
      monitorGroupIds: normalizeMonitorGroupIds(ids), monitorScopeMigrationPending: false, monitorScopeMigrationPlatform: "" });
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    config = next;
    invalidateCheckDecisions();
    GM_setValue(STORAGE_CONFIG, config);
    state.candidates = [];
    state.tokenResults = [];
    state.bestGroup = "-";
    refreshOutOfScopeTokens();
    syncForm();
    setStatus("监控范围已保存，下次检查生效", "success");
  }

  function refreshQualityRecommendation() {
    const selected = tokensCache.filter((token) => config.tokenIds.includes(Number(token.id)));
    const currentRows = selected.map((token) => state.candidates.find((row) => candidateMatchesToken(row, token)
      && qualityModel(row) === tokenDecisionModel(config, token.id)));
    const currentModels = [...new Set(selected.map((token) => tokenDecisionModel(config, token.id)))];
    const currentGroup = currentRows.length && currentRows.every(Boolean) && currentModels.length === 1 ? currentRows[0] : "";
    const best = selected.length && !currentGroup ? null : selectBestCandidate(state.candidates, currentGroup, config.selectionMode, config);
    state.bestGroup = best ? candidateRecommendationLabel(best)
      : state.candidates.some((row) => row.available && row.scopeEligible !== false) ? "按模型分别推荐" : "无合格分组";
  }

  async function manualSwitchToGroup(candidate, action) {
    if (!candidate || !["once", "add", "add-and-switch"].includes(action)) return;
    if (action !== "once" && !monitorGroupInScope(config, candidate.groupId)) {
      saveMonitorScope("selected", [...config.monitorGroupIds, candidate.groupId]);
    }
    return runCheck({ manual: true, forceSwitch: true, targetGroup: candidate.group, targetGroupId: candidate.groupId,
      allowUnavailable: candidate.available !== true });
  }

  function applyMonitorScopeMigration() {
    const migrated = migrateAihubMonitorScope(config, aihubGroupsCache, aihubPlatformMonitorsCache);
    if (migrated.changed) {
      config = migrated.config;
      GM_setValue(STORAGE_CONFIG, config);
      addLog("旧平台范围已映射到监控分组ID", "info");
    }
    refreshOutOfScopeTokens();
  }

  async function handleRollbackGuard(token, candidates, assertCurrent, observeHealth = true) {
    const tokenId = Number(token.id);
    const now = Date.now();
    const guardState = getSwitchGuardState(now);
    const guard = guardState.byToken[tokenId];
    if (!guard) return null;
    const model = tokenDecisionModel(config, tokenId);
    // Keep historical multi-model records without applying them to a new single-model binding.
    if (!model || guard.model !== model) return null;
    const destinationMatches = guard.toGroupId ? Number(guard.toGroupId) === Number(token.groupId)
      : guard.toGroup === token.group && candidates.filter((row) => row.group === guard.toGroup).length === 1;
    if (config.rollbackChecks <= 0 || !destinationMatches) {
      delete guardState.byToken[tokenId]; saveSwitchGuardState(guardState); return null;
    }
    const current = candidates.find((row) => candidateMatchesToken(row, token) && qualityModel(row) === model);
    if (!guard.switchAt) {
      guard.switchAt = now;
      guard.remaining = config.rollbackChecks;
      guard.seenEvidence = candidateHealthPublications(current, 0, now);
      guard.lastEvidence = "";
    }
    if (current?.available || (current && candidateEmergencySafe(current, config))) {
      const publications = candidateHealthPublications(current, guard.switchAt, now);
      const seen = new Set(guard.seenEvidence || []);
      const fresh = publications.filter((id) => !seen.has(id));
      if (observeHealth && fresh.length) {
        guard.remaining -= 1;
        guard.lastEvidence = fresh.join(" | ");
        guard.seenEvidence = [...seen, ...fresh].slice(-20);
      }
      if (guard.remaining <= 0) delete guardState.byToken[tokenId];
      saveSwitchGuardState(guardState);
      const timedOut = guard.remaining > 0 && now - guard.switchAt >= 600000;
      return { outcome: guard.remaining <= 0 ? "observed" : timedOut ? "observation-unverified" : "observing", group: token.group,
        tone: guard.remaining <= 0 ? "success" : "warning", message: guard.remaining <= 0 ? "平台分组新健康证据观察完成（非密钥实测）"
          : timedOut ? "观察未验证：已等待10分钟，暂停正常择优，继续故障恢复与健康观察"
            : "等待新健康证据，观察剩余 " + guard.remaining + " 次" };
    }
    if (!candidateHasExplicitHealthFailure(current, config)) {
      saveSwitchGuardState(guardState);
      return { outcome: now - guard.switchAt >= 600000 ? "observation-unverified" : "observing", group: token.group,
        tone: "warning", message: "等待新健康证据，数据不足或受配置限制；保持当前组，暂停正常择优并继续故障恢复" };
    }
    guardState.blacklist = guardState.blacklist.filter((entry) => entry.model !== model
      || (entry.groupId ? Number(entry.groupId) !== Number(current.groupId) : entry.group !== guard.toGroup));
    guardState.blacklist.push({ model, group: guard.toGroup,
      ...(Number(current.groupId) > 0 ? { groupId: Number(current.groupId) } : {}),
      until: now + config.blacklistMinutes * 60000, type: "health", reason: "切换后健康检查失败" });
    delete guardState.byToken[tokenId]; saveSwitchGuardState(guardState);
    const eligible = applyTemporaryBlacklist(candidates, guardState, model, now);
    const fallback = selectRecoveryCandidate(eligible, model, config, { groupId: guard.fromGroupId });
    if (!fallback || candidateMatchesToken(fallback, token)) return { outcome: "recovery-blocked", group: token.group, tone: "warning", message: "没有范围内合格回滚分组，保持当前组" };
    await switchTokenGroup(token, fallback, { beforeSwitch: assertCurrent,
      logTone: "warning", logMessage: tokenLabel(token) + " 观察失败，已回滚到 " + fallback.group });
    return { outcome: "rolled-back", group: fallback.group, tone: "warning", message: "观察失败，已回滚到 " + fallback.group
      + (fallback.recoveryTier === "emergency" ? "（仅应急，缓存/TPS数据不完整）" : "") };
  }

  async function processToken(token, candidates, options = {}) {
    const forceSwitch = Boolean(options.forceSwitch);
    const targetGroup = String(options.targetGroup || "").trim();
    const tokenId = Number(token.id);
    const key = JSON.stringify(config);
    const assertCurrent = options.assertCurrent || (() => {
      if (key !== JSON.stringify(config)) throw new Error("检查期间设置已变更，本轮取消切换");
    });
    assertCurrent();
    validateToken(token);
    if (!forceSwitch && !monitorGroupInScope(config, token.groupId)) {
      pendingCandidates.delete(tokenId);
      return { outcome: "scope-hold", group: token.group || "未知", tone: "warning", message: "当前组未纳入监控，自动检查/切换暂停；可在设置中加入或移除密钥勾选" };
    }
    const model = tokenDecisionModel(config, tokenId);
    if ((!forceSwitch || !targetGroup) && (!model || !tokenSupportsModel(token, model))) {
      pendingCandidates.delete(tokenId);
      return { outcome: "model-hold", group: token.group, tone: "warning", message: "请在设置中为该密钥绑定一个已启用且有权限的决策模型；自动处理已暂停" };
    }
    const eligible = applyTemporaryBlacklist((!forceSwitch || !targetGroup) ? candidates.filter((row) => qualityModel(row) === model) : candidates,
      getSwitchGuardState(), model, Date.now());
    const current = eligible.find((row) => candidateMatchesToken(row, token));
    if (!forceSwitch && !current) {
      pendingCandidates.delete(tokenId);
      return { outcome: "model-hold", group: token.group, tone: "warning", message: "缺少绑定模型的当前检测详情或当前组数据，自动处理暂停" };
    }
    if (config.enabled && !forceSwitch) {
      const rollback = await handleRollbackGuard(token, eligible, assertCurrent, options.observeHealth !== false);
      if (rollback) return rollback;
    }
    if (config.enabled && !forceSwitch && candidateHasExplicitHealthFailure(current, config)) {
      const recovery = selectRecoveryCandidate(eligible, model, config);
      pendingCandidates.delete(tokenId);
      if (!recovery || candidateMatchesToken(recovery, token)) return { outcome: "recovery-blocked", group: token.group, tone: "warning", message: "当前分组故障，没有同模型合格目标" };
      await switchTokenGroup(token, recovery, { beforeSwitch: assertCurrent });
      return { outcome: "switched", group: recovery.group, tone: "success", message: recovery.recoveryTier === "emergency"
        ? "故障恢复：仅应急接管，缓存/TPS数据不完整" : "故障恢复，已切换" };
    }
    if (!forceSwitch && (config.automaticSwitchMode === "failover" || options.mode === "health")) {
      if (config.automaticSwitchMode === "failover" || !current?.available) pendingCandidates.delete(tokenId);
      return { outcome: "healthy", group: token.group || "未设置", tone: current?.available ? "success" : "warning",
        message: current?.available ? "当前分组正常，保持不变" : "未发现明确故障，保持当前分组" };
    }
    const selected = selectSwitchCandidate(eligible, token, targetGroup, {
      mode: config.selectionMode, settings: config, allowUnavailable: options.allowUnavailable === true, targetGroupId: options.targetGroupId,
    });
    if (!selected) {
      pendingCandidates.delete(tokenId);
      return { outcome: "no-candidate", group: token.group || "未设置", tone: "warning", message: "没有同模型合格候选，保持当前分组" };
    }
    if (candidateMatchesToken(selected, token)) {
      pendingCandidates.delete(tokenId);
      return { outcome: "current", group: token.group, tone: "success", message: targetGroup ? "已是手动目标分组" : "当前已是综合质量推荐" };
    }
    if (forceSwitch) {
      await switchTokenGroup(token, selected, { beforeSwitch: assertCurrent });
      return { outcome: "switched", group: selected.group, tone: "success", message: "已手动切换" };
    }
    const scoredCurrent = scoreAihubQualityCandidates([current], config)[0];
    const gain = selected.qualityScore - scoredCurrent?.qualityScore;
    if (!Number.isFinite(gain) || gain <= 0 || gain < config.minQualityGain) {
      pendingCandidates.delete(tokenId);
      return { outcome: "quality-hold", group: token.group, tone: "warning", message: !Number.isFinite(gain)
        ? "当前数据不完整或受配置限制，无法同基准比较，保持当前组"
        : "保持当前组：质量增益 " + gain.toFixed(2) + " 分，未达到严格领先且至少 " + config.minQualityGain + " 分" };
    }
    if (!config.enabled) return { outcome: "suggested", group: token.group, tone: "warning", message: "建议切换到 " + selected.group };
    const evidence = candidateDecisionEvidence(current) + "|" + candidateDecisionEvidence(selected);
    const previous = pendingCandidates.get(tokenId);
    const sameDecision = previous?.groupId === selected.groupId && previous.model === model && previous.configKey === key;
    const seen = sameDecision ? previous.evidence || [] : [];
    const pending = { groupId: selected.groupId, group: selected.group, model, configKey: key,
      hits: (sameDecision ? previous.hits : 0) + (seen.includes(evidence) ? 0 : 1), evidence: [...new Set([...seen, evidence])] };
    pendingCandidates.set(tokenId, pending);
    if (pending.hits < config.confirmPolls) return { outcome: "pending", group: token.group, tone: "warning",
      message: selected.group + " · 新证据确认 " + pending.hits + "/" + config.confirmPolls };
    const hold = switchHoldState(getSwitchHistory(), tokenId, model, token.group, config.switchHoldMinutes, Date.now());
    if (shouldKeepCurrentDuringHold(current, hold)) return { outcome: "holding", group: token.group, tone: "success",
      message: "保持中，" + Math.ceil(hold.remainingMs / 60000) + " 分钟后择优" };
    await switchTokenGroup(token, selected, { beforeSwitch: assertCurrent });
    return { outcome: "switched", group: selected.group, tone: "success", message: "已自动切换" };
  }

  async function loadCheckCandidates(models, healthOnly = false, request = {}) {
    let monitorFallback = false;
    let candidates;
    if (IS_AIHUB) {
      const range = null;
      const { summary, series, seriesError, groups, rates } = healthOnly && aihubGroupsCache.length
        ? { ...await loadAihubProviderData(fetchJson, range), groups: aihubGroupsCache, rates: aihubRatesCache }
        : await loadAihubMonitorData(fetchJson, range);
      monitorFallback = Boolean(seriesError);
      if (seriesError && !state.aihubSeriesDegraded) {
        const message = seriesError instanceof Error ? seriesError.message : String(seriesError);
        addLog(`AIHub 近期柱状图暂不可用，已使用最新汇总状态：${message}`, "warning");
      } else if (!seriesError && state.aihubSeriesDegraded) {
        addLog("AIHub 近期柱状图接口已恢复", "success");
      }
      state.aihubSeriesDegraded = monitorFallback;
      aihubGroupsCache = normalizeAihubGroups(groups);
      aihubPlatformMonitorsCache = summary.apis || [];
      aihubRatesCache = normalizeAihubRates(rates);
      pricingCache = buildAihubModelCatalog(summary);
      applyMonitorScopeMigration();
      const scoped = scopeAihubMonitors(summary, aihubGroupsCache, config, models, { ...request, healthOnly });
      candidates = evaluateAihubCandidates(scoped.summary, series, aihubGroupsCache, aihubRatesCache,
        { ...config, models, model: models[0] || "" }, Date.now())
        .map((candidate) => ({ ...candidate, scopeEligible: scoped.eligibleIds.has(Number(candidate.groupId)) }));
    } else if (IS_FLUXION) {
      const [monitors, groups, rates] = await Promise.all([
        fetchJson("/api/v1/channel-monitors"),
        healthOnly && fluxionGroupsCache.length ? fluxionGroupsCache : fetchJson("/api/v1/groups/available"),
        healthOnly && fluxionGroupsCache.length ? fluxionRatesCache : fetchJson("/api/v1/groups/rates"),
      ]);
      fluxionMonitorsCache = normalizeFluxionMonitors(monitors);
      fluxionGroupsCache = normalizeFluxionGroups(groups);
      fluxionRatesCache = normalizeAihubRates(rates);
      pricingCache = buildFluxionModelCatalog(monitors, groups);
      candidates = mergeTargetModelCandidates(models.map((model) => ({
        model,
        candidates: evaluateFluxionCandidates(
          monitors,
          groups,
          rates,
          { ...config, models: [model], model },
          Date.now(),
        ),
      })));
    } else {
      const [pricing, userGroups, metricsByModel] = await Promise.all([
        fetchJson("/api/pricing"),
        fetchJson("/api/user/self/groups"),
        Promise.all(models.map((model) => fetchJson(
          `/api/perf-metrics?model=${encodeURIComponent(model)}&hours=${config.metricHours}`,
        ))),
      ]);
      pricingCache = pricing;
      userGroupsCache = unwrapUserGroups(userGroups);
      candidates = mergeTargetModelCandidates(models.map((model, index) => ({
        model,
        candidates: evaluateCandidates(
          pricing,
          metricsByModel[index],
          userGroups,
          { ...config, models: [model], model },
          Date.now() / 1000,
        ),
      })));
    }
    return { candidates, monitorFallback };
  }

  async function runCheck(options) {
    const manual = Boolean(options && options.manual);
    const healthOnly = options?.mode === "health" && !manual;
    let updateRecommendation = !healthOnly && !options?.targetGroup;
    const forceSwitch = Boolean(options && options.forceSwitch);
    const targetGroup = String((options && options.targetGroup) || "").trim();
    // A manual check must refresh account-level usage even when group checks cannot start yet.
    const manualUsageRefresh = manual ? refreshTodayUsage() : null;
    const models = targetModels(config);
    if (running) {
      if (manual) setStatus("已有检查正在进行", "warning");
      return;
    }
    if (!models.length) {
      setStatus("请先选择至少一个目标模型", "warning");
      return;
    }
    if (!config.tokenIds.length && requiresTokenSelection(SITE_ID, options)) {
      setStatus(`请先选择至少一个 API 密钥${IS_AIHUB || IS_FLUXION ? "" : "和目标模型"}`, "warning");
      return;
    }
    const selectedTokenIds = config.tokenIds.slice();
    let checkConfigKey = JSON.stringify(config);
    const checkCancelRevision = state.checkCancelRevision || 0;
    const assertCheckCurrent = () => {
      if (checkConfigKey !== JSON.stringify(config) || checkCancelRevision !== (state.checkCancelRevision || 0)) {
        throw new Error("检查期间设置已变更或任务已取消，本轮取消切换");
      }
    };

    running = true;
    const usageRefresh = manualUsageRefresh || (healthOnly ? Promise.resolve() : refreshTodayUsage());
    const tokenCatalogRefresh = manual
      ? refreshTokenCatalog()
        .then(() => true)
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          addLog(`API 密钥列表刷新失败：${message}`, "error");
          return false;
        })
      : Promise.resolve(true);
    setStatus(
      targetGroup
        ? `正在检查目标分组 ${targetGroup}...`
        : forceSwitch
          ? "正在检查并准备立即切换..."
          : healthOnly ? "正在检查当前分组故障..." : "正在检查分组状态...",
      "running",
    );
    let monitorFallback = false;
    let manualRiskCandidate = null;
    try {
      if (IS_AIHUB) await tokenCatalogRefresh;
      assertCheckCurrent();
      const details = await Promise.allSettled(selectedTokenIds.map((tokenId) => getTokenDetail(tokenId)));
      assertCheckCurrent();
      const candidateRequest = { targetGroup, targetGroupId: options?.targetGroupId,
        currentTokens: details.filter((detail) => detail.status === "fulfilled").map((detail) => detail.value) };
      let candidateRequestRevision = ++state.candidateRequestRevision;
      let { candidates, monitorFallback: degraded } = await loadCheckCandidates(models, healthOnly, candidateRequest);
      assertCheckCurrent();
      monitorFallback = degraded;
      const candidateTimestamp = Date.now();
      candidates = applyTemporaryBlacklist(
        candidates,
        getSwitchGuardState(candidateTimestamp),
        targetModelIdentity(config),
        candidateTimestamp,
      );
      if (manual) renderOptions(true);
      const recommendedCandidate = selectBestCandidate(candidates, "", config.selectionMode, config);
      const checkedAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      state.lastCheck = checkedAt;
      state.lastHealthCheck = checkedAt;
      state.candidateRevision = candidateRequestRevision;
      if (!targetGroup && (!healthOnly || !state.candidates.length)) {
        state.candidates = candidates;
        refreshQualityRecommendation();
        state.lastStrategyCheck = checkedAt;
      }
      if (targetGroup) {
        const target = selectSwitchCandidate(candidates, "", targetGroup, { allowUnavailable: true, targetGroupId: options?.targetGroupId });
        if (target.available !== true && options?.allowUnavailable !== true) {
          manualRiskCandidate = target;
          setStatus("目标分组状态已变化，请确认最新风险后再切换", "warning");
          return;
        }
      }
      if (!targetGroup && !recommendedCandidate && !selectedTokenIds.length) {
        const reasonSummary = summarizeFailures(candidates);
        throw new Error(`没有满足条件的分组${reasonSummary ? `：${reasonSummary}` : ""}`);
      }

      if (!selectedTokenIds.length) {
        const availableCount = candidates.filter((candidate) => candidate.available).length;
        state.tokenResults = [];
        state.currentGroup = "-";
        addLog(`分组状态已更新：${candidates.length} 个分组，${availableCount} 个可用`, "success");
        const fallbackSuffix = monitorFallback ? "，近期图表已降级" : "";
        setStatus(
          `已检查 ${candidates.length} 个分组，${availableCount} 个可用${fallbackSuffix}`,
          monitorFallback ? "warning" : "success",
        );
        return;
      }

      if (healthOnly) {
        const healthCandidates = candidates;
        const needsRecovery = details.some((detail) => detail.status === "fulfilled"
          && monitorGroupInScope(config, detail.value.groupId)
          && tokenDecisionModel(config, detail.value.id)
          && candidateHasExplicitHealthFailure(healthCandidates.find((row) => candidateMatchesToken(row, detail.value)
            && qualityModel(row) === tokenDecisionModel(config, detail.value.id)), config));
        if (needsRecovery) {
          updateRecommendation = true;
          // Recovery never waits for the next strategy tick and never writes using an old account catalog.
          candidateRequestRevision = ++state.candidateRequestRevision;
          const refreshed = await loadCheckCandidates(models, false, candidateRequest);
          assertCheckCurrent();
          candidates = applyTemporaryBlacklist(refreshed.candidates, getSwitchGuardState(), targetModelIdentity(config), Date.now());
          monitorFallback = refreshed.monitorFallback;
          state.candidates = candidates;
          state.candidateRevision = candidateRequestRevision;
          refreshQualityRecommendation();
        } else {
          const currentTokens = details.filter((detail) => detail.status === "fulfilled").map((detail) => detail.value);
          state.candidates = state.candidates.map((row) => currentTokens.some((token) => candidateMatchesToken(row, token))
            ? candidates.find((fresh) => candidateMatchesToken(fresh, { group: row.group, groupId: row.groupId })) || row : row);
        }
      }
      assertCheckCurrent();
      refreshOutOfScopeTokens(details.filter((detail) => detail.status === "fulfilled").map((detail) => detail.value));
      state.tokenResults = [];
      for (let index = 0; index < details.length; index += 1) {
        const tokenId = selectedTokenIds[index];
        const detail = details[index];
        const cached = tokensCache.find((token) => Number(token.id) === tokenId);
        const fallbackName = cached ? tokenLabel(cached) : `#${tokenId}`;
        setStatus(`正在处理 API 密钥 ${index + 1}/${details.length}...`, "running");
        if (detail.status === "rejected") {
          const message = detail.reason instanceof Error ? detail.reason.message : String(detail.reason);
          state.tokenResults.push({ id: tokenId, name: fallbackName, group: "未知", tone: "error", outcome: "error", message });
          addLog(`${fallbackName}：${message}`, "error");
          continue;
        }

        const token = detail.value;
        try {
          const result = await processToken(token, candidates, { forceSwitch, targetGroup, targetGroupId: options?.targetGroupId, allowUnavailable: options?.allowUnavailable === true, assertCurrent: assertCheckCurrent, mode: healthOnly ? "health" : "strategy", observeHealth: options?.observeHealth });
          state.tokenResults.push({ id: tokenId, name: tokenLabel(token), ...result });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pendingCandidates.delete(tokenId);
          state.tokenResults.push({
            id: tokenId,
            name: tokenLabel(token),
            group: token.group || "未设置",
            tone: "error",
            outcome: "error",
            message,
          });
          addLog(`${tokenLabel(token)}：${message}`, "error");
        }
        state.currentGroup = summarizeTokenGroups(state.tokenResults);
        render();
      }

      refreshOutOfScopeTokens();
      refreshCandidateIsolationState(updateRecommendation);
      state.currentGroup = summarizeTokenGroups(state.tokenResults);
      const failedCount = state.tokenResults.filter((result) => result.outcome === "error").length;
      const switchedCount = state.tokenResults.filter((result) => result.outcome === "switched").length;
      const rolledBackCount = state.tokenResults.filter((result) => result.outcome === "rolled-back").length;
      const warningCount = state.tokenResults.filter((result) => result.tone === "warning").length;
      if (switchedCount > 0) {
        GM_notification({
          title: `${SITE_LABEL} 分组已切换`,
          text: `${targetModelLabel(config)}: 已切换 ${switchedCount} 个 API 密钥`,
          timeout: 8000,
        });
      }
      if (rolledBackCount > 0) {
        GM_notification({
          title: `${SITE_LABEL} 分组已自动回滚`,
          text: `${targetModelLabel(config)}: 已回滚 ${rolledBackCount} 个 API 密钥`,
          timeout: 10000,
        });
      }
      const actionSummary = `切换 ${switchedCount} 个${rolledBackCount ? `，回滚 ${rolledBackCount} 个` : ""}`;
      if (failedCount === state.tokenResults.length) {
        setStatus(`${failedCount} 个 API 密钥处理失败`, "error");
      } else if (failedCount > 0) {
        setStatus(`处理完成：${actionSummary}，失败 ${failedCount} 个`, "warning");
      } else if (warningCount > 0 || monitorFallback) {
        const fallbackSuffix = monitorFallback ? "，近期图表已降级" : "";
        setStatus(`已检查 ${state.tokenResults.length} 个 API 密钥，${actionSummary}${fallbackSuffix}`, "warning");
      } else {
        setStatus(`已检查 ${state.tokenResults.length} 个 API 密钥，${actionSummary}`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(message, "error");
      setStatus(message, "error");
    } finally {
      await Promise.all([usageRefresh, tokenCatalogRefresh]);
      running = false;
      render();
      if (manualRiskCandidate) requestManualSwitch(manualRiskCandidate);
    }
  }

  function summarizeFailures(candidates) {
    const counts = new Map();
    candidates.forEach((candidate) => {
      candidate.reasons.forEach((reason) => counts.set(reason, (counts.get(reason) || 0) + 1));
    });
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([reason, count]) => `${reasonLabel(reason)} ${count}`)
      .join("，");
  }

  function armNextCheck() {
    if (scheduler !== null) window.clearTimeout(scheduler);
    scheduler = null;
    if (!config.enabled) return;
    const revision = checkSchedule.revision;
    const dueAt = Math.min(checkSchedule.healthAt, checkSchedule.strategyAt);
    scheduler = window.setTimeout(async () => {
      scheduler = null;
      if (!config.enabled || revision !== checkSchedule.revision) return;
      if (running) { armNextCheck(); return; }
      const now = Date.now();
      const healthDue = checkSchedule.healthAt <= now;
      const strategyDue = checkSchedule.strategyAt <= now;
      if (!healthDue && !strategyDue) { armNextCheck(); return; }
      const healthDeadline = healthDue ? now + config.pollSeconds * 1000 : checkSchedule.healthAt;
      const strategyDeadline = strategyDue ? now + config.strategySeconds * 1000 : checkSchedule.strategyAt;
      checkSchedule.healthAt = healthDeadline;
      checkSchedule.strategyAt = strategyDeadline;
      try {
        await runCheck({ manual: false, mode: strategyDue ? "strategy" : "health", observeHealth: healthDue });
      } finally {
        if (revision === checkSchedule.revision) {
          if (healthDue && checkSchedule.healthAt === healthDeadline) checkSchedule.healthAt = Date.now() + config.pollSeconds * 1000;
          if (strategyDue && checkSchedule.strategyAt === strategyDeadline) checkSchedule.strategyAt = Date.now() + config.strategySeconds * 1000;
          armNextCheck();
        }
      }
    }, Math.max(running ? 250 : 0, dueAt - Date.now()));
  }

  function scheduleNext(delayMs, { immediateStrategy = true } = {}) {
    checkSchedule.revision += 1;
    const at = Date.now() + (delayMs == null ? config.pollSeconds * 1000 : delayMs);
    checkSchedule.healthAt = at;
    checkSchedule.strategyAt = immediateStrategy ? at : Date.now() + config.strategySeconds * 1000;
    armNextCheck();
  }

  function requestHealthCheck(delayMs = 250) {
    if (!config.enabled) return;
    const at = Date.now() + delayMs;
    checkSchedule.healthAt = Math.min(checkSchedule.healthAt || at, at);
    armNextCheck();
  }

  function scheduleUpdateCheck(delayMs) {
    if (updateScheduler) window.clearTimeout(updateScheduler);
    updateScheduler = window.setTimeout(async () => {
      try {
        await checkForUpdate({ silent: true });
      } finally {
        scheduleUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS);
      }
    }, delayMs == null ? AUTO_UPDATE_CHECK_INTERVAL_MS : delayMs);
  }

  function scheduleStatisticsRefresh(delayMs) {
    if (statisticsScheduler) window.clearTimeout(statisticsScheduler);
    statisticsScheduler = null;
    if (!IS_AIHUB
      || state.activeView !== "statistics"
      || state.statistics.range !== "today"
      || document.visibilityState !== "visible") return;
    statisticsScheduler = window.setTimeout(async () => {
      statisticsScheduler = null;
      if (state.activeView !== "statistics" || state.statistics.range !== "today" || document.visibilityState !== "visible") return;
      await refreshStatistics({ silent: true });
      scheduleStatisticsRefresh(STATISTICS_REFRESH_INTERVAL_MS);
    }, delayMs == null ? STATISTICS_REFRESH_INTERVAL_MS : delayMs);
  }

  function formatRatio(value) {
    return Number.isFinite(value) ? `${Number(value.toFixed(4))}x` : "-";
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : "-";
  }

  function formatLatency(value) {
    if (!Number.isFinite(value) || value <= 0) return "-";
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
  }

  function formatAihubLatency(value) {
    if (!Number.isFinite(value) || value <= 0) return "-";
    return `${Math.round(value).toLocaleString("en-US")}ms`;
  }

  function formatSpend(usage) {
    if (!usage || !usage.available) return "-";
    return formatSpendValue(usage.spend, usage.symbol);
  }

  function formatSpendValue(value, symbol) {
    const amount = Math.max(0, Number(value) || 0);
    const digits = amount > 0 && amount < 0.0001 ? 6 : 4;
    return `${symbol || ""}${amount.toFixed(digits)}`;
  }

  function formatBalance(usage) {
    if (!usage || !usage.available) return "-";
    const value = Math.max(0, Number(usage.balance) || 0);
    if (!usage.symbol) return formatUsageCount(value, true);
    return `${usage.symbol}${value.toFixed(2)}`;
  }

  function formatUsageCount(value, available) {
    return available ? Math.max(0, Number(value) || 0).toLocaleString() : "-";
  }

  function renderOptions(preserveFormState) {
    if (!refs.tokenList || !refs.modelList) return;

    const selectedTokens = new Set(
      preserveFormState
        ? [...refs.tokenList.querySelectorAll('input[data-token-id]:checked')]
          .map((checkbox) => Number(checkbox.value))
        : config.tokenIds.map(Number),
    );
    const selectedModels = new Set(
      preserveFormState
        ? [...refs.modelList.querySelectorAll('input[data-model-name]:checked')]
          .map((checkbox) => checkbox.dataset.modelName)
        : targetModels(config),
    );
    refs.tokenList.replaceChildren();
    if (!tokensCache.length) {
      const empty = document.createElement("div");
      empty.className = "empty token-empty";
      empty.textContent = "暂无 API 密钥";
      refs.tokenList.appendChild(empty);
    }
    tokensCache.forEach((token) => {
      const option = document.createElement("label");
      option.className = "token-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(token.id);
      checkbox.checked = selectedTokens.has(Number(token.id));
      checkbox.dataset.tokenId = String(token.id);
      const name = document.createElement("span");
      name.textContent = `${token.name || `#${token.id}`} · ${token.group || "未分组"}`;
      option.append(checkbox, name);
      refs.tokenList.appendChild(option);
    });
    if (refs.tokenSearch) filterSelectorList(refs.tokenList, refs.tokenSearch, refs.tokenSearchStatus);
    renderTokenSelectionCount();

    refs.modelList.replaceChildren();
    const models = [...new Set([
      ...(pricingCache && Array.isArray(pricingCache.data)
        ? pricingCache.data.map((item) => item.model_name).filter(Boolean)
        : []),
      ...selectedModels,
    ])].sort();
    if (!models.length) {
      const empty = document.createElement("div");
      empty.className = "empty token-empty";
      empty.textContent = "暂无可选模型";
      refs.modelList.appendChild(empty);
    }
    models.forEach((model) => {
      const option = document.createElement("label");
      option.className = "token-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.modelName = model;
      checkbox.checked = selectedModels.has(model);
      const name = document.createElement("span");
      const platforms = [...new Set((pricingCache?.data || [])
        .filter((item) => item.model_name === model)
        .flatMap((item) => Array.isArray(item.platforms) ? item.platforms : []))].filter(Boolean);
      name.textContent = `${model}${platforms.length ? ` · ${platforms.join(" / ")}` : ""}`;
      name.title = name.textContent;
      option.append(checkbox, name);
      refs.modelList.appendChild(option);
    });
    if (refs.modelSearch) filterSelectorList(refs.modelList, refs.modelSearch, refs.modelSearchStatus);
    renderModelSelectionCount();
    renderGroupFilterOptions();
    renderTokenModelBindings();
  }

  function renderModelSelectionCount() {
    if (!refs.modelList || !refs.modelCount || !refs.modelSelectLabel) return;
    const selected = [...refs.modelList.querySelectorAll('input[data-model-name]:checked')]
      .map((checkbox) => checkbox.dataset.modelName);
    refs.modelCount.textContent = `已选 ${selected.length}`;
    refs.modelSelectLabel.textContent = selected.length === 0
      ? "请选择目标模型"
      : selected.length === 1
        ? selected[0]
        : `已选择 ${selected.length} 个模型`;
    refs.modelSelectLabel.title = selected.join("、");
  }

  function renderTokenSelectionCount() {
    if (!refs.tokenList || !refs.tokenCount) return;
    const selectedBoxes = [...refs.tokenList.querySelectorAll('input[data-token-id]:checked')];
    const selected = selectedBoxes.length;
    refs.tokenCount.textContent = `已选 ${selected}/${tokensCache.length}`;
    if (refs.tokenSelectLabel) {
      if (!selected) {
        refs.tokenSelectLabel.textContent = "请选择 API 密钥";
      } else if (selected === tokensCache.length) {
        refs.tokenSelectLabel.textContent = "全部 API 密钥";
      } else if (selected === 1) {
        const token = tokensCache.find((item) => Number(item.id) === Number(selectedBoxes[0].value));
        refs.tokenSelectLabel.textContent = token ? String(token.name || `#${token.id}`) : "已选择 1 个密钥";
      } else {
        refs.tokenSelectLabel.textContent = `已选择 ${selected} 个密钥`;
      }
    }
  }

  function groupFilterConfigKey(mode) {
    return mode === "blacklist" ? "groupBlacklist" : "groupWhitelist";
  }

  function availableGroupNames() {
    const names = new Set([
      ...config.groupWhitelist,
      ...config.groupBlacklist,
      ...state.candidates.map((candidate) => candidate.group),
    ]);
    if (IS_AIHUB) {
      aihubGroupsCache.forEach((group) => {
        if (group && group.name) names.add(String(group.name));
      });
    } else if (IS_FLUXION) {
      fluxionGroupsCache.forEach((group) => {
        if (group && group.name) names.add(String(group.name));
      });
    } else {
      Object.keys(userGroupsCache).forEach((group) => names.add(group));
      const selectedModels = new Set(targetModels(config));
      (pricingCache && Array.isArray(pricingCache.data) ? pricingCache.data : [])
        .filter((item) => item && selectedModels.has(item.model_name))
        .flatMap((item) => Array.isArray(item.enable_groups) ? item.enable_groups : [])
        .forEach((group) => names.add(String(group)));
    }
    return [...names].filter(Boolean).sort((left, right) => left.localeCompare(right, "zh-CN"));
  }

  function updateGroupFilterSummary() {
    if (!refs.groupFilterSelectLabel || !refs.groupFilterCount || !refs.groupFilterMode) return;
    const mode = refs.groupFilterMode.value === "blacklist" ? "blacklist" : "whitelist";
    const selected = refs.groupFilterList
      ? refs.groupFilterList.querySelectorAll('input[data-group-name]:checked').length
      : 0;
    refs.groupFilterSelectLabel.textContent = selected
      ? `${mode === "blacklist" ? "已排除" : "仅允许"} ${selected} 个分组`
      : "不限分组";
    refs.groupFilterCount.textContent = `${selected}/${availableGroupNames().length}`;
    if (refs.groupFilterLabel) refs.groupFilterLabel.textContent = mode === "blacklist" ? "黑名单分组" : "白名单分组";
  }

  function renderGroupFilterOptions() {
    if (!refs.groupFilterList || !refs.groupFilterMode) return;
    const mode = config.groupFilterMode === "blacklist" ? "blacklist" : "whitelist";
    const selected = new Set(config[groupFilterConfigKey(mode)]);
    refs.groupFilterMode.value = mode;
    refs.groupFilterList.replaceChildren();
    const groups = availableGroupNames();
    if (IS_AIHUB) refreshPlatformFilter(refs.groupFilterPlatform);
    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "empty token-empty";
      empty.textContent = "检查后显示可选分组";
      refs.groupFilterList.appendChild(empty);
    }
    groups.forEach((group) => {
      const option = document.createElement("label");
      option.className = "token-option";
      if (IS_AIHUB) option.dataset.platform = groupPlatformFor(
        aihubGroupsCache.find((item) => item.name === group) || { name: group }, aihubPlatformMonitorsCache, state.candidates);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.groupName = group;
      checkbox.checked = selected.has(group);
      const name = document.createElement("span");
      name.textContent = group;
      option.append(checkbox, name);
      refs.groupFilterList.appendChild(option);
    });
    if (refs.groupFilterSearch) filterSelectorList(refs.groupFilterList, refs.groupFilterSearch, refs.groupFilterSearchStatus, refs.groupFilterPlatform);
    updateGroupFilterSummary();
  }

  function createDetectionImageThumbnail(candidate) {
    const media = candidate.detectionMedia;
    const hasImage = media?.status === "successful" && Boolean(media.url);
    const thumbnail = document.createElement(hasImage ? "button" : "span");
    thumbnail.className = "candidate-pelican";
    if (!hasImage) {
      thumbnail.textContent = media?.status === "failed" ? "失败" : "暂无";
      thumbnail.title = media?.status === "failed" ? `鹈鹕图片生成失败${media.reason ? `：${media.reason}` : ""}` : "该分组暂无鹈鹕图片";
      thumbnail.setAttribute("aria-label", thumbnail.title);
      return thumbnail;
    }
    thumbnail.type = "button";
    thumbnail.title = `${candidate.group} · 点击放大查看${media.title}`;
    thumbnail.setAttribute("aria-label", thumbnail.title);
    thumbnail.dataset.detectionImage = media.url;
    thumbnail.dataset.groupId = String(candidate.groupId);
    const image = document.createElement("img");
    image.alt = media.title;
    image.width = 28;
    image.height = 28;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      thumbnail.textContent = "查看";
      thumbnail.title = `${candidate.group} · 预览加载失败，点击查看原图`;
      thumbnail.setAttribute("aria-label", thumbnail.title);
    }, { once: true });
    image.src = media.previewUrl || media.url;
    thumbnail.appendChild(image);
    thumbnail.addEventListener("click", () => openDetectionImage(candidate, thumbnail));
    return thumbnail;
  }

  function renderCandidates() {
    if (!refs.candidateRows) return;
    refreshPlatformFilter(refs.candidatePlatform);
    const rows = sortCandidateRowsForMode(state.candidates, config.selectionMode, config);
    if (!sectionNeedsRender(refs.candidateRows, [state.candidates, tokensCache, config.tokenIds.join(","),
      JSON.stringify(config.qualityWeights), config.minSuccessRate, running])) { applyCandidateDisplayControls(); return; }
    const openIds = new Set([...refs.candidateRows.querySelectorAll("details[open]")].map((node) => node.dataset.groupId));
    refs.candidateRows.replaceChildren();
    const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    if (!rows.length) {
      const empty = element("div", config.monitorScopeMode === "selected" && !config.monitorGroupIds.length ? "未选择监控分组。请在设置中配置范围。" : "暂无检查结果。请立即检查或调整监控范围。", "empty");
      const button = element("button", "设置监控范围");button.type = "button";button.addEventListener("click", () => { state.settingsPage = "routing"; setActiveView("settings"); });
      empty.appendChild(button);refs.candidateRows.appendChild(empty);applyCandidateDisplayControls();return;
    }
    rows.forEach((candidate) => {
      const entry = element("div", undefined, "candidate-entry");
      const reason = candidate.modelDetectionReason || "";
      const status = reason === "model-detection-model-mismatch" ? "notmatch" : !reason ? "pass" : reason.includes("failed") ? "fail" : reason.includes("expired") ? "stale" : candidate.modelDetection?.refreshing || reason.includes("incomplete") ? "pending" : "unknown";
      Object.assign(entry.dataset, { groupId: String(candidate.groupId), group: candidate.group, model: qualityModel(candidate), platform: normalizeGroupPlatform(candidate.platform), status, scope: candidate.inMonitorScope ? "in" : "out", available: String(candidate.available), searchText: [candidate.group, candidate.groupId, candidate.platform, candidate.aihubMetricModel].join(" ") });
      [["ratio", candidate.ratio], ["success", candidate.aggregateSuccess], ["cache", candidate.cacheHitRate], ["tps", candidate.outputTokensPerSecond], ["score", candidate.qualityScore]].forEach(([key, value]) => { entry.dataset[key] = Number.isFinite(value) ? String(value) : ""; });
      const row = element("div", undefined, "candidate-row-v2");const name = element("div");const title = element("strong", candidate.group);
      const currentTokens = candidateCurrentTokens(candidate, tokensCache, config.tokenIds);
      if (currentTokens.length) { entry.dataset.current = "true";title.textContent += " · 当前"; }
      name.append(title, element("small", "#" + candidate.groupId + " · " + (groupPlatforms[normalizeGroupPlatform(candidate.platform)] || "未知平台")));
      const detection = element("div");detection.append(element("span", {pass:"检测通过",fail:"检测未通过",stale:"检测过期",pending:"检测中",notmatch:"模型不匹配",unknown:"检测未知"}[status], "candidate-status"), element("small", candidate.aihubMetricModel || "未匹配启用模型"));
      const action = element("div");const button = element("button", "切换", "candidate-row-switch");button.type = "button";
      const allCurrent = config.tokenIds.length > 0 && currentTokens.length === config.tokenIds.length;
      if (allCurrent) button.textContent="使用中";
      button.disabled=running || !config.tokenIds.length || allCurrent || candidate.reasons.includes("not-user-selectable");
      button.setAttribute("aria-label", "手动切换到 " + candidate.group);button.addEventListener("click", () => requestManualSwitch(candidate));
      action.append(button, element("small", Number.isFinite(candidate.qualityScore) ? "质量 " + candidate.qualityScore.toFixed(1) : "不参与自动排序"));
      row.append(name, element("div", formatRatio(candidate.ratio), "mono"), detection, element("div", formatPercent(candidate.cacheHitRate), "mono"), element("div", formatPercent(candidate.aggregateSuccess), "mono"), element("div", Number.isFinite(candidate.outputTokensPerSecond) ? candidate.outputTokensPerSecond.toFixed(1) : "—", "mono"), action);
      const details = element("details", undefined, "candidate-inspection");details.dataset.groupId=String(candidate.groupId);details.open=openIds.has(String(candidate.groupId));
      const summary = element("summary", "检测详情 · " + (candidate.available ? "符合自动切换条件"
        : candidate.emergencyEligible ? "仅可故障应急（不参与正常评分）" : candidateIssueText(candidate)));details.appendChild(summary);
      const lines = ["检测模型：" + (candidate.modelDetection?.model || "未知"), "详情结果：" + (candidate.modelDetection?.presentationResult === true ? "通过" : candidate.modelDetection?.presentationResult === false ? "未通过" : "未知"), "完成时间：" + (candidate.modelDetection?.detectedAt || "未知"), "有效期：" + (candidate.modelDetection?.expiresAt || "按完成时间60分钟"), "模型样本：" + (Number.isFinite(candidate.aihubMetricSampleCount) ? candidate.aihubMetricSampleCount : "未知") + " · 缓存样本：" + (Number.isFinite(candidate.aihubCacheSampleCount) ? candidate.aihubCacheSampleCount : "未知")];
      (candidate.modelDetection?.stages || []).forEach((stage,index)=>lines.push((stage.name || "阶段" + (index+1)) + "：" + (stage.status || "未知") + (stage.executionComplete ? " · 已完成" : " · 未完成")));
      if (candidate.qualityComponents) {
        const { contributions: c, qModel, qCache } = candidate.qualityComponents;
        lines.push(`固定标尺分项贡献：成功 ${c.success.toFixed(2)} / 缓存 ${c.cache.toFixed(2)} / TPS ${c.tps.toFixed(2)} / 低倍率 ${c.ratio.toFixed(2)}`);
        lines.push(`样本保守系数（非统计置信度）：模型 ${qModel.toFixed(3)} / 缓存 ${qCache.toFixed(3)}；分数不是服务成功概率`);
        lines.push("固定尺度：成功余量分母至少5个百分点；TPS参考100 tokens/s；倍率参考1；样本参考100");
      }
      (candidate.modelCards || []).filter((card) => card.model === candidate.aihubMetricModel).forEach((card) => {
        lines.push(`上游短时健康卡（仅供参考，不触发故障）：${card.health || "未知"} / 探测 ${card.probe_state || "未知"} / 样本 ${card.sample_count ?? "未知"}`);
        lines.push(`评估 ${card.health_evaluated_at || "未知"} / 有效期 ${card.health_expires_at || "未知"}；字段语义待核实，证据不足`);
      });
      lines.forEach(text=>details.appendChild(element("p",text)));
      if (candidate.detectionMedia?.url) details.appendChild(createDetectionImageThumbnail(candidate));
      details.addEventListener("keydown", (event)=>{if(event.key==="Escape" && details.open){event.preventDefault();event.stopPropagation();details.open=false;summary.focus();}});
      entry.append(row,details);refs.candidateRows.appendChild(entry);
    });
    applyCandidateDisplayControls();
  }

  function manualGroupCatalog() {
    if (!IS_AIHUB) return state.candidates;
    const assessed = new Set(state.candidates.map((candidate) => Number(candidate.groupId)));
    return [...state.candidates, ...aihubGroupsCache.filter((group) => !assessed.has(Number(group.id))).map((group) => ({
      group: group.name, groupId: Number(group.id), ratio: Number(aihubRatesCache[group.id] ?? group.rate_multiplier),
      platform: group.platform || aihubPlatformMonitorsCache.find((monitor) => Number(monitor.group_id) === Number(group.id))?.platform,
      available: false, scopeEligible: false, catalogOnly: true, reasons: [], warnings: [],
    }))];
  }

  function renderManualGroups() {
    if (!refs.manualGroup) return;
    if (!sectionNeedsRender(refs.manualGroup, [state.candidates, state.tokenResults,
      state.tokenResults.length, running, IS_AIHUB ? aihubGroupsCache : null])) return;
    const selectedChoice = refs.manualGroup.querySelector('input[data-manual-group]:checked');
    const selectedGroup = selectedChoice?.value || "";
    const selectedId = Number(selectedChoice?.dataset.groupId);
    const catalog = manualGroupCatalog();
    if (IS_AIHUB) refreshPlatformFilter(refs.manualGroupPlatform);
    refs.manualGroup.replaceChildren();

    if (!catalog.length) {
      const empty = document.createElement("div");
      empty.className = "empty manual-group-empty";
      empty.textContent = "暂无检查结果";
      refs.manualGroup.appendChild(empty);
    }

    catalog
      .slice()
      .sort((left, right) => {
        if (left.available !== right.available) return left.available ? -1 : 1;
        return (left.ratio || Infinity) - (right.ratio || Infinity);
      })
      .forEach((candidate) => {
        const warningText = (Array.isArray(candidate.warnings) ? candidate.warnings : [])
          .map(reasonLabel)
          .join("、");
        const status = candidate.catalogOnly ? "尚未评估，选择后检查" : candidate.available
          ? (warningText ? `可用（警告：${warningText}）` : "可用")
          : candidate.reasons.map(reasonLabel).join("、") || "不可用";
        const currentCount = state.tokenResults.filter((result) => result.group === candidate.group).length;
        const current = currentCount ? ` · 当前 ${currentCount}` : "";
        const option = document.createElement("label");
        option.className = `manual-group-option${candidate.available ? "" : " manual-group-option-warning"}`;
        if (IS_AIHUB) option.dataset.platform = normalizeGroupPlatform(candidate.platform);
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "kf-manual-group";
        radio.value = candidate.group;
        radio.dataset.manualGroup = candidate.group;
        radio.dataset.groupId = String(candidate.groupId || "");
        radio.checked = selectedId > 0 ? Number(candidate.groupId) === selectedId : candidate.group === selectedGroup;
        const copy = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = `${candidate.group} · ${formatRatio(candidate.ratio)}`;
        const detail = document.createElement("small");
        const modelIssues = candidateIssueText(candidate);
        const modelDetails = Array.isArray(candidate.modelResults) && candidate.modelResults.length > 1 && modelIssues
          ? ` · ${modelIssues}`
          : "";
        detail.textContent = `状态：${status}${current}${modelDetails}`;
        copy.append(name, detail);
        option.append(radio, copy);
        refs.manualGroup.appendChild(option);
      });
    if (refs.manualGroupSearch) filterSelectorList(refs.manualGroup, refs.manualGroupSearch, refs.manualGroupSearchStatus, refs.manualGroupPlatform);
    if (refs.manualHint) {
      const availableCount = state.candidates.filter((candidate) => candidate.available && candidate.scopeEligible !== false).length;
      refs.manualHint.textContent = catalog.length
        ? `${catalog.length} 个分组均可人工选择，其中 ${availableCount} 个符合自动策略；未评估项将在选择后检查，账号权限由站点校验`
        : "请先执行一次立即检查";
    }
    if (refs.manualConfirm) {
      refs.manualConfirm.disabled = running || !refs.manualGroup.querySelector('input[data-manual-group]:checked');
    }
  }

  function renderLogs() {
    if (!refs.logs) return;
    if (!sectionNeedsRender(refs.logs, [state.logs])) return;
    refs.logs.replaceChildren();
    if (!state.logs.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无事件";
      refs.logs.appendChild(empty);
      return;
    }
    state.logs.forEach((entry) => {
      const row = document.createElement("div");
      row.className = `log log-${entry.tone}`;
      const time = document.createElement("span");
      time.className = "mono";
      time.textContent = entry.at;
      const message = document.createElement("span");
      message.textContent = entry.message;
      row.append(time, message);
      refs.logs.appendChild(row);
    });
  }

  function renderTokenResults() {
    if (!refs.tokenResultRows) return;
    if (!sectionNeedsRender(refs.tokenResultRows, [state.tokenResults, state.tokenResults.length])) return;
    refs.tokenResultRows.replaceChildren();
    if (!state.tokenResults.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无密钥检查结果";
      refs.tokenResultRows.appendChild(empty);
      return;
    }
    state.tokenResults.forEach((result) => {
      const row = document.createElement("div");
      row.className = `token-result token-result-${result.tone}`;
      const name = document.createElement("span");
      name.title = result.name;
      name.textContent = result.name;
      const group = document.createElement("span");
      group.className = "mono";
      group.textContent = result.group;
      const message = document.createElement("span");
      message.title = result.message;
      message.textContent = result.message;
      row.append(name, group, message);
      refs.tokenResultRows.appendChild(row);
    });
  }

  function formatIsolationRemaining(until, now) {
    const minutes = Math.max(1, Math.ceil((Number(until) - Number(now)) / 60000));
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
  }

  function renderIsolations() {
    if (!refs.isolationRows) return;
    const now = Date.now();
    const entries = listActiveIsolations(getSwitchGuardState(now), now);
    refs.isolationRows.replaceChildren();
    if (refs.isolationCount) refs.isolationCount.textContent = entries.length ? `${entries.length} 个生效中` : "当前无隔离";
    if (refs.clearAllIsolations) refs.clearAllIsolations.disabled = running || !entries.length;
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "isolation-empty";
      empty.textContent = "当前无健康故障的隔离分组";
      refs.isolationRows.appendChild(empty);
      return;
    }
    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "isolation-row";
      const copy = document.createElement("div");
      copy.className = "isolation-copy";
      const name = document.createElement("div");
      name.className = "isolation-name";
      const signal = document.createElement("span");
      signal.className = "candidate-signal isolation-signal";
      const strong = document.createElement("strong");
      const groupLabel = entry.groupId ? `${entry.group} #${entry.groupId}` : entry.group;
      strong.textContent = groupLabel;
      strong.title = groupLabel;
      name.append(signal, strong);
      const meta = document.createElement("div");
      meta.className = "isolation-meta";
      const model = document.createElement("span");
      model.textContent = modelIdentityLabel(entry.model);
      model.title = `模型：${modelIdentityLabel(entry.model)}`;
      const reason = document.createElement("span");
      reason.textContent = `健康 · ${entry.reason || "切换后健康检查失败"}`;
      reason.title = reason.textContent;
      const remaining = document.createElement("span");
      remaining.className = "isolation-remaining";
      remaining.textContent = `剩余 ${formatIsolationRemaining(entry.until, now)}`;
      meta.append(model, reason, remaining);
      copy.append(name, meta);
      const clear = document.createElement("button");
      clear.className = "isolation-unlock";
      clear.type = "button";
      clear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 9.5-2.1"></path><rect x="5" y="11" width="14" height="10" rx="2"></rect></svg><span>立即解除</span>';
      clear.setAttribute("aria-label", `立即解除 ${groupLabel} 的故障隔离`);
      clear.addEventListener("click", () => clearIsolation(entry.model, entry.group, entry.groupId));
      row.append(copy, clear);
      refs.isolationRows.appendChild(row);
    });
  }

  const searchableSelectOptions = new WeakMap();
  const groupPlatforms = Object.freeze({ openai: "OpenAI", deepseek: "DeepSeek", zhipu: "Zhipu GLM", kimi: "Kimi", grok: "Grok", unknown: "未知平台" });

  function normalizeGroupPlatform(value) {
    const key = normalizeSelectorQuery(value).replace(/[\s_-]+/g, "");
    if (["zhipu", "zhipuglm", "glm"].includes(key)) return "zhipu";
    return Object.hasOwn(groupPlatforms, key) ? key : "unknown";
  }

  function groupPlatformFor(group, monitors = [], candidates = []) {
    const id = Number(group?.id ?? group?.groupId);
    const name = String(group?.name ?? group?.group ?? "");
    const matches = (item) => id > 0
      ? Number(item.group_id ?? item.groupId ?? item.id) === id
      : name && String(item.code ?? item.name ?? item.group ?? "") === name;
    return normalizeGroupPlatform(group?.platform
      || monitors.find(matches)?.platform || candidates.find(matches)?.platform);
  }

  function refreshPlatformFilter(select) {
    if (!select) return;
    if (select.options.length === Object.keys(groupPlatforms).length + 1) return;
    const selected = select.value;
    select.replaceChildren(new Option("全部平台", ""),
      ...Object.entries(groupPlatforms).map(([value, label]) => new Option(label, value)));
    select.value = Object.hasOwn(groupPlatforms, selected) ? selected : "";
  }

  function matchesPlatform(option, platform) {
    return !platform?.value || normalizeGroupPlatform(option.dataset?.platform) === platform.value;
  }

  function normalizeSelectorQuery(value) {
    return String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
  }

  function filterSelectorList(list, input, status, platform) {
    if (!list || !input) return;
    const query = normalizeSelectorQuery(input.value);
    const options = [...list.children].filter((option) => !option.classList?.contains("empty"));
    let visible = 0;
    options.forEach((option) => {
      option.hidden = !matchesPlatform(option, platform)
        || Boolean(query) && !normalizeSelectorQuery(option.dataset?.searchText || option.textContent).includes(query);
      if (!option.hidden) visible++;
    });
    if (status) status.textContent = !query && !platform?.value ? `共 ${options.length} 项`
      : visible ? `找到 ${visible} / ${options.length} 项` : `无匹配项（共 ${options.length} 项）`;
  }

  function refreshSearchableSelect(select, input, status, platform) {
    if (!select || !input) return;
    searchableSelectOptions.set(select, [...select.options].map((option) => option.cloneNode(true)));
    filterSearchableSelect(select, input, status, platform);
  }

  function filterSearchableSelect(select, input, status, platform) {
    if (!select || !input) return;
    const options = searchableSelectOptions.get(select);
    if (!options) return;
    const query = normalizeSelectorQuery(input.value);
    const selected = select.value;
    let matches = 0;
    const filtered = options.filter((option) => {
      const match = matchesPlatform(option, platform) && (!query || normalizeSelectorQuery(option.textContent).includes(query));
      if (option.value !== "0" && match) matches++;
      // Keep the neutral and current options so filtering can never change a configured value.
      return match || option.value === "0" || option.value === selected;
    });
    select.replaceChildren(...filtered.map((option) => option.cloneNode(true)));
    select.value = selected;
    if (status) status.textContent = !query && !platform?.value ? `共 ${options.filter((option) => option.value !== "0").length} 项`
      : matches ? `找到 ${matches} 项；保留当前选择` : "无匹配项；保留当前选择";
  }

  function bindSelectorSearch(input, filter, target) {
    if (!input) return;
    input.addEventListener("input", filter);
    input.addEventListener("change", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && input.value) {
        input.value = "";
        filter();
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === "ArrowDown" && target) {
        const next = target.querySelector
          ? [...target.querySelectorAll("input")].find((choice) => !choice.closest("label")?.hidden && !choice.disabled)
          : null;
        (next || target).focus();
        event.preventDefault();
      }
    });
  }

  function bindPlatformFilter(select, filter) {
    select?.addEventListener("change", (event) => {
      event.stopPropagation();
      filter();
    });
  }

  function openDetectionImage(candidate, trigger) {
    const media = candidate.detectionMedia;
    if (!media?.url || !refs.detectionImageDialog) return;
    const dialog = refs.detectionImageDialog;
    dialog.imageTrigger = trigger;
    dialog.imageGroupId = String(candidate.groupId);
    refs.detectionImageTitle.textContent = `${candidate.group} · ${media.title}`;
    refs.detectionImageStatus.textContent = "正在加载原图…";
    refs.detectionImageStatus.hidden = false;
    refs.detectionImage.hidden = true;
    refs.detectionImage.alt = `${candidate.group} 的${media.title}`;
    refs.detectionImageOriginal.href = media.url;
    dialog.showModal();
    refs.detectionImageClose.focus();
    refs.detectionImage.src = media.url;
  }

  function statisticsMetricLabel(metric) {
    return {
      spend: "实际消费",
      requests: "请求数",
      tokens: "Token",
    }[normalizeAihubStatisticsMetric(metric)];
  }

  function statisticsRangeLabel(value) {
    const range = normalizeAihubStatisticsRange(value);
    if (range === "today") return "今天";
    if (range === "yesterday") return "昨天";
    return `最近 ${range} 天`;
  }

  function formatStatisticsValue(value, metric, compact) {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "-";
    const number = Math.max(0, Number(value));
    const key = normalizeAihubStatisticsMetric(metric);
    if (key === "spend") {
      const maximumFractionDigits = number > 0 && number < 0.01 ? 4 : 2;
      return `$${number.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits })}`;
    }
    if (key === "tokens" && compact) return formatTokenCount(number, true);
    return number.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  }

  function clearStatisticsVisuals() {
    if (refs.statisticsTrend) refs.statisticsTrend.replaceChildren();
    if (refs.statisticsKeyRows) refs.statisticsKeyRows.replaceChildren();
  }

  function appendStatisticsState(container, title, detail, tone) {
    if (!container) return;
    const box = document.createElement("div");
    box.className = `statistics-state statistics-state-${tone || "idle"}`;
    const strong = document.createElement("strong");
    strong.textContent = title;
    const copy = document.createElement("span");
    copy.textContent = detail;
    box.append(strong, copy);
    container.appendChild(box);
  }

  function statisticsTrendPointLabel(date, granularity) {
    const value = String(date || "");
    if (granularity === "hour" || value.includes("T")) {
      const match = value.match(/T(\d{2}):?(\d{2})?/);
      if (!match) return value;
      const hour = Number.parseInt(match[1], 10);
      if (!Number.isInteger(hour)) return value;
      return `${String(hour + 1).padStart(2, "0")}:${match[2] || "00"}`;
    }
    return value.slice(5) || value;
  }

  function statisticsTrendPointDetail(point, granularity) {
    const rawDate = String((point && point.date) || "");
    const pointDate = granularity === "hour"
      ? `${rawDate.slice(0, 10)} ${statisticsTrendPointLabel(rawDate, "hour")}`
      : rawDate;
    return `${pointDate} · 实际消费 ${formatStatisticsValue(point.spend, "spend", true)} · 请求 ${formatStatisticsValue(point.requests, "requests", true)} · Token ${formatStatisticsValue(point.tokens, "tokens", true)}`;
  }

  function statisticsTrendChartLayout(pointCount, viewportWidth, granularity) {
    const hourly = granularity === "hour";
    const visibleWidth = Math.max(1, Number(viewportWidth) || 432);
    const horizontalPadding = hourly ? 26 : 12;
    const step = Math.max(54, visibleWidth / 5.4);
    return {
      width: hourly ? Math.max(visibleWidth, horizontalPadding * 2 + Math.max(0, pointCount - 1) * step) : 432,
      height: 168,
      padding: { top: 18, right: horizontalPadding, bottom: 30, left: horizontalPadding },
    };
  }

  function statisticsTrendScrollLeft(previousLeft, previousWidth, previousViewport, sameRange, nextWidth, nextViewport) {
    const latest = Math.max(0, nextWidth - nextViewport);
    if (!sameRange || previousWidth - previousViewport - previousLeft <= 8) return latest;
    return Math.min(Math.max(0, previousLeft), latest);
  }

  function renderStatisticsTrend(series, metric) {
    if (!refs.statisticsTrend) return;
    const chart = refs.statisticsTrend;
    const previousLeft = chart.scrollLeft;
    const previousWidth = chart.scrollWidth;
    const previousViewport = chart.clientWidth;
    refs.statisticsTrend.replaceChildren();
    if (!series.length) {
      appendStatisticsState(refs.statisticsTrend, "暂无趋势数据", "当前还没有已完成的小时区间，请稍后刷新。", "idle");
      return;
    }
    const aggregate = sumAihubUsageMetric(series, metric);
    if (!aggregate.available) {
      appendStatisticsState(
        refs.statisticsTrend,
        `${statisticsMetricLabel(metric)}字段不可用`,
        "AIHub 返回了日期行，但缺少当前指标所需字段；未将其按 0 处理。",
        "error",
      );
      return;
    }
    const values = series.map((point) => Math.max(0, Number(point[metric]) || 0));
    const maximum = Math.max(...values, 0);
    const granularity = state.statistics.granularity === "hour" ? "hour" : "day";
    const range = `${state.statistics.dataRange}:${series[0].date.slice(0, 10)}`;
    const sameRange = chart.dataset.range === range && chart.dataset.granularity === granularity;
    const { width, height, padding } = statisticsTrendChartLayout(series.length, chart.clientWidth - 24, granularity);
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const x = (index) => padding.left + (series.length === 1 ? plotWidth / 2 : plotWidth * index / (series.length - 1));
    const y = (value) => padding.top + plotHeight - (maximum > 0 ? value / maximum * plotHeight : 0);
    const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    if (granularity === "hour") {
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
    }
    svg.setAttribute("role", "img");
    svg.setAttribute("tabindex", "0");
    svg.setAttribute(
      "aria-label",
      `AIHub ${granularity === "hour" ? `${statisticsRangeLabel(state.statistics.dataRange)}按小时` : `最近 ${series.length} 天按日期`}${statisticsMetricLabel(metric)}趋势，总计 ${formatStatisticsValue(aggregate.value, metric, true)}`,
    );
    const baseline = document.createElementNS(namespace, "line");
    baseline.setAttribute("class", "statistics-chart-baseline");
    baseline.setAttribute("x1", String(padding.left));
    baseline.setAttribute("x2", String(width - padding.right));
    baseline.setAttribute("y1", String(padding.top + plotHeight));
    baseline.setAttribute("y2", String(padding.top + plotHeight));
    const area = document.createElementNS(namespace, "path");
    area.setAttribute("class", "statistics-chart-area");
    const areaPoints = values.map((value, index) => `L ${x(index)} ${y(value)}`).join(" ");
    area.setAttribute(
      "d",
      `M ${x(0)} ${padding.top + plotHeight} ${areaPoints} L ${x(series.length - 1)} ${padding.top + plotHeight} Z`,
    );
    const line = document.createElementNS(namespace, "polyline");
    line.setAttribute("class", "statistics-chart-line");
    line.setAttribute("points", points);
    svg.append(baseline, area, line);
    series.forEach((point, index) => {
      const circle = document.createElementNS(namespace, "circle");
      circle.setAttribute("class", "statistics-chart-point");
      circle.setAttribute("cx", String(x(index)));
      circle.setAttribute("cy", String(y(values[index])));
      circle.setAttribute("r", "3");
      circle.setAttribute("tabindex", "0");
      circle.setAttribute("aria-label", statisticsTrendPointDetail(point, granularity));
      const title = document.createElementNS(namespace, "title");
      title.textContent = statisticsTrendPointDetail(point, granularity);
      circle.appendChild(title);
      svg.appendChild(circle);
    });
    (granularity === "hour"
      ? series.map((_, index) => index)
      : [0, Math.floor((series.length - 1) / 2), series.length - 1])
      .filter((index, position, source) => source.indexOf(index) === position)
      .forEach((index) => {
        const label = document.createElementNS(namespace, "text");
        label.setAttribute("class", "statistics-chart-label");
        label.setAttribute("x", String(x(index)));
        label.setAttribute("y", String(height - 8));
        label.setAttribute("text-anchor", granularity === "hour" ? "middle" : index === 0 ? "start" : index === series.length - 1 ? "end" : "middle");
        label.textContent = statisticsTrendPointLabel(series[index].date, granularity);
        svg.appendChild(label);
      });
    refs.statisticsTrend.appendChild(svg);
    chart.dataset.range = range;
    chart.dataset.granularity = granularity;
    if (granularity === "hour") {
      chart.tabIndex = 0;
      chart.setAttribute("role", "region");
      chart.setAttribute("aria-label", `${statisticsRangeLabel(state.statistics.dataRange)}按小时趋势，横向滚动可查看较早时段`);
      chart.scrollLeft = statisticsTrendScrollLeft(previousLeft, previousWidth, previousViewport, sameRange, chart.scrollWidth, chart.clientWidth);
    } else {
      chart.removeAttribute("tabindex");
      chart.removeAttribute("role");
      chart.removeAttribute("aria-label");
      chart.scrollLeft = 0;
    }
  }

  function renderStatisticsKeyRows(reconciliation, metric, exactCoverage) {
    if (!refs.statisticsKeyRows) return;
    refs.statisticsKeyRows.replaceChildren();
    const rows = reconciliation.keys.slice();
    if (exactCoverage && Number(reconciliation.remainder) > 1e-9) {
      rows.push({
        id: 0,
        name: "其他/已删除密钥",
        status: "success",
        value: reconciliation.remainder,
        derived: true,
      });
    }
    if (!rows.length) {
      appendStatisticsState(
        refs.statisticsKeyRows,
        reconciliation.empty ? "所选范围内没有用量" : "暂无当前密钥",
        reconciliation.empty ? "账户和当前密钥合计均为 0。" : "AIHub 未返回当前账户的 API 密钥。",
        "idle",
      );
      return;
    }
    const maximum = Math.max(...rows.map((row) => Number(row.value) || 0), 0);
    rows.forEach((entry) => {
      const row = document.createElement("div");
      row.className = `statistics-key-row${entry.status === "error" ? " statistics-key-row-error" : ""}${entry.derived ? " statistics-key-row-derived" : ""}`;
      const heading = document.createElement("div");
      heading.className = "statistics-key-heading";
      const name = document.createElement("strong");
      name.textContent = entry.name;
      name.title = entry.name;
      const value = document.createElement("span");
      value.className = "mono";
      value.textContent = entry.status === "success" ? formatStatisticsValue(entry.value, metric, true) : "读取失败";
      heading.append(name, value);
      const track = document.createElement("div");
      track.className = "statistics-key-track";
      track.setAttribute("role", "meter");
      track.setAttribute("aria-label", `${entry.name} ${statisticsMetricLabel(metric)}`);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", String(maximum || 1));
      track.setAttribute("aria-valuenow", String(entry.status === "success" ? entry.value : 0));
      const bar = document.createElement("span");
      const ratio = entry.status === "success" && maximum > 0 ? Math.max(0, Number(entry.value) || 0) / maximum : 0;
      bar.style.width = `${Math.max(entry.status === "success" && entry.value > 0 ? 2 : 0, ratio * 100)}%`;
      track.appendChild(bar);
      row.append(heading, track);
      if (entry.status === "error") {
        const error = document.createElement("small");
        error.textContent = entry.error || "接口请求失败";
        row.appendChild(error);
      }
      refs.statisticsKeyRows.appendChild(row);
    });
  }

  function renderStatistics() {
    if (!refs.statisticsMetric || !refs.statisticsDays) return;
    refs.statisticsMetric.value = state.statistics.metric;
    refs.statisticsDays.value = normalizeAihubStatisticsRange(state.statistics.range);
    if (refs.statisticsRefresh) refs.statisticsRefresh.disabled = state.statistics.loading || !IS_AIHUB;
    if (refs.statisticsSource) {
      refs.statisticsSource.textContent = IS_AIHUB
        ? `AIHub 账单 · USD · ${state.statistics.timezone || aihubTimezone()}`
        : `${SITE_LABEL} 暂无已验证统计接口`;
    }
    if (refs.statisticsUpdated) {
      refs.statisticsUpdated.textContent = state.statistics.loadedAt
        ? `更新 ${new Date(state.statistics.loadedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`
        : "尚未读取";
    }
    if (!IS_AIHUB) {
      clearStatisticsVisuals();
      if (refs.statisticsSummary) {
        refs.statisticsSummary.textContent = "当前站点尚未完成历史日用量与按密钥明细接口核验。";
        refs.statisticsSummary.dataset.tone = "unavailable";
      }
      appendStatisticsState(refs.statisticsTrend, "统计暂不可用", "不会套用 AIHub 的字段或估算当前站点数据。", "idle");
      appendStatisticsState(refs.statisticsKeyRows, "按密钥统计暂不可用", "供应商真实明细能力待单独核实。", "idle");
      if (refs.statisticsTotal) refs.statisticsTotal.textContent = "-";
      if (refs.statisticsCoverage) refs.statisticsCoverage.textContent = "-";
      if (refs.statisticsAssigned) refs.statisticsAssigned.textContent = "-";
      return;
    }
    if (state.statistics.loading) {
      if (!state.statistics.loaded) clearStatisticsVisuals();
      if (refs.statisticsSummary) {
        const phaseLabel = state.statistics.loadingPhase === "trend" ? "账户趋势" : "当前密钥日明细";
        const percentage = Math.round(Math.max(0, Math.min(1, state.statistics.loadingProgress || 0)) * 100);
        refs.statisticsSummary.textContent = state.statistics.loaded
          ? `正在刷新${phaseLabel}… ${percentage}%（保留上次数据）`
          : `正在读取${phaseLabel}… ${percentage}%`;
        refs.statisticsSummary.dataset.tone = "loading";
      }
      if (refs.statisticsLoading) {
        refs.statisticsLoading.hidden = false;
        refs.statisticsLoading.style.setProperty("--statistics-loading-progress", `${Math.round((state.statistics.loadingProgress || 0) * 100)}%`);
      }
      if (!state.statistics.loaded) {
        appendStatisticsState(refs.statisticsTrend, "正在加载趋势", "保持当前布局，数据返回后自动绘制。", "loading");
        appendStatisticsState(refs.statisticsKeyRows, "正在加载密钥分布", "按 3 个请求并发读取，避免冲击供应商限流。", "loading");
      }
      if (state.statistics.loaded) return;
      return;
    }
    if (refs.statisticsLoading) refs.statisticsLoading.hidden = true;
    if (!state.statistics.loaded) {
      clearStatisticsVisuals();
      const detail = state.statistics.accountError || "点击刷新读取 AIHub 真实账单统计。";
      if (refs.statisticsSummary) {
        refs.statisticsSummary.textContent = detail;
        refs.statisticsSummary.dataset.tone = state.statistics.accountError ? "error" : "idle";
      }
      appendStatisticsState(refs.statisticsTrend, state.statistics.accountError ? "趋势读取失败" : "等待读取", detail, state.statistics.accountError ? "error" : "idle");
      appendStatisticsState(refs.statisticsKeyRows, "等待密钥明细", "读取时不会发起模型请求或修改密钥分组。", "idle");
      return;
    }
    const metric = normalizeAihubStatisticsMetric(state.statistics.metric);
    const reconciliationSeries = state.statistics.granularity === "hour"
      ? state.statistics.accountReconciliationSeries
      : state.statistics.accountSeries;
    const reconciliationComparable = state.statistics.granularity !== "hour"
      || (Array.isArray(reconciliationSeries) && reconciliationSeries.length > 0 && !state.statistics.accountReconciliationError);
    const reconciliation = reconcileAihubUsage(
      reconciliationSeries,
      state.statistics.keyResults,
      metric,
    );
    const exactCoverage = reconciliationComparable && reconciliation.complete && !state.statistics.accountError && !state.statistics.accountReconciliationError && !state.statistics.keysError;
    const partialCount = reconciliation.failedCount;
    let summary = "数据完整";
    let tone = "success";
    if (state.statistics.accountError) {
      summary = state.statistics.accountSeries.length
        ? `趋势刷新失败，保留上次成功数据：${state.statistics.accountError}`
        : `趋势读取失败：${state.statistics.accountError}`;
      tone = "error";
    } else if (state.statistics.keysError) {
      summary = `密钥列表读取失败，无法给出精确覆盖率：${state.statistics.keysError}`;
      tone = "partial";
    } else if (!reconciliationComparable) {
      summary = state.statistics.accountReconciliationError
        ? `${statisticsRangeLabel(state.statistics.dataRange)}账户日汇总暂不可用，暂不与密钥明细对账：${state.statistics.accountReconciliationError}`
        : `${statisticsRangeLabel(state.statistics.dataRange)}账户趋势仍在聚合，暂不与密钥明细对账`;
      tone = "partial";
    } else if (partialCount > 0) {
      summary = `部分数据：${partialCount} 个密钥读取失败，不计算精确覆盖率或未分配量`;
      tone = "partial";
    } else if (!reconciliation.accountAvailable) {
      summary = `${statisticsMetricLabel(metric)}字段契约异常，未把缺失值按 0 计算`;
      tone = "error";
    } else if (reconciliation.anomaly) {
      summary = "对账异常：当前密钥合计高于账户趋势总量，请检查聚合延迟或接口口径";
      tone = "error";
    } else if (reconciliation.empty) {
      summary = "所选范围内没有用量";
      tone = "idle";
    } else if (Number(reconciliation.remainder) > 1e-9) {
      summary = "存在其他/已删除密钥用量，已按账户总量与当前密钥合计的差额展示";
      tone = "warning";
    }
    if (refs.statisticsSummary) {
      refs.statisticsSummary.textContent = summary;
      refs.statisticsSummary.dataset.tone = tone;
    }
    if (refs.statisticsTotal) refs.statisticsTotal.textContent = formatStatisticsValue(reconciliation.accountTotal, metric, true);
    if (refs.statisticsAssigned) refs.statisticsAssigned.textContent = formatStatisticsValue(reconciliation.assignedTotal, metric, true);
    if (refs.statisticsCoverage) {
      refs.statisticsCoverage.textContent = !reconciliationComparable
        ? "待对账"
        : exactCoverage && reconciliation.coverage !== null
        ? `${(reconciliation.coverage * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`
        : "部分数据";
      refs.statisticsCoverage.dataset.tone = reconciliation.anomaly ? "error" : exactCoverage ? "complete" : "partial";
    }
    if (refs.statisticsTrendSummary) {
      const total = sumAihubUsageMetric(state.statistics.accountSeries, metric);
      const summaryLabel = state.statistics.granularity === "hour"
        ? `${statisticsRangeLabel(state.statistics.dataRange)}合计`
        : `${state.statistics.dataDays} 天合计`;
      refs.statisticsTrendSummary.textContent = total.available
        ? `${summaryLabel} ${formatStatisticsValue(total.value, metric, true)}`
        : "当前指标不可用";
    }
    renderStatisticsTrend(state.statistics.accountSeries, metric);
    renderStatisticsKeyRows(reconciliation, metric, exactCoverage && !reconciliation.anomaly);
  }

  function sectionNeedsRender(element, dependencies) {
    if (!element) return false;
    const previous = renderedSections.get(element);
    if (previous && previous.length === dependencies.length
      && previous.every((value, index) => value === dependencies[index])) return false;
    renderedSections.set(element, dependencies);
    return true;
  }

  function render() {
    if (!root) return;
    if (refs.panel) refs.panel.hidden = state.collapsed;
    if (refs.launcher) refs.launcher.hidden = !state.collapsed;
    positionElement(state.collapsed ? refs.launcher : refs.panel, state.collapsed ? "launcher" : "panel", false);
    if (refs.status) refs.status.textContent = state.status;
    if (refs.status) refs.status.dataset.tone = state.tone;
    if (refs.statusDot) refs.statusDot.dataset.tone = state.tone;
    if (refs.settingsSave) {
      refs.settingsSave.textContent = state.settingsError || "已保存";
      refs.settingsSave.dataset.invalid = String(Boolean(state.settingsError));
    }
    if (refs.lastHealthCheck) refs.lastHealthCheck.textContent = state.lastHealthCheck;
    if (refs.lastStrategyCheck) refs.lastStrategyCheck.textContent = state.lastStrategyCheck;
    if (refs.confirmationHint) {
      const minutes = config.strategySeconds / 60;
      refs.confirmationHint.textContent = config.automaticSwitchMode === "failover"
        ? "仅故障转移：当前组健康时保持不动，原组恢复后不自动切回；切换观察只统计切换后的新健康证据。"
        : `每 ${minutes} 分钟轮询择优；连续确认只统计变化的有效证据，重复快照不累计。切换后等待新健康证据，未验证不等于已恢复。`;
    }
    if (refs.automaticSwitchHint) refs.automaticSwitchHint.textContent = config.automaticSwitchMode === "failover"
      ? "只在确认当前组故障时，按所选策略转移；健康时不切换，原组恢复后不自动切回。"
      : "正常时按 1h 综合质量择优；故障时优先恢复服务。";
    root.querySelectorAll("[data-settings-target]").forEach((button) => {
      const active = button.dataset.settingsTarget === state.settingsPage;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    root.querySelectorAll("[data-settings-page]").forEach((page) => {
      page.hidden = page.dataset.settingsPage !== state.settingsPage;
    });
    if (refs.version) {
      refs.version.title = state.update.availableVersion
        ? `当前版本 v${SCRIPT_VERSION}，可更新至 v${state.update.availableVersion}`
        : `当前插件版本 v${SCRIPT_VERSION}`;
    }
    if (refs.updateBadge) {
      refs.updateBadge.hidden = !state.update.availableVersion;
      const updateBadgeLabel = state.update.availableVersion
        ? `发现新版本 v${state.update.availableVersion}，请前往设置更新`
        : "";
      refs.updateBadge.title = updateBadgeLabel;
      refs.updateBadge.setAttribute("aria-label", updateBadgeLabel);
    }
    if (root) {
      root.querySelectorAll("[data-view-target]").forEach((button) => {
        const active = button.dataset.viewTarget === state.activeView;
        button.dataset.active = String(active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      });
      root.querySelectorAll("[data-view]").forEach((view) => {
        view.hidden = view.dataset.view !== state.activeView;
      });
    }
    if (refs.candidateSummary) {
      const availableCount = state.candidates.filter((candidate) => candidate.available).length;
      refs.candidateSummary.textContent = state.candidates.length
        ? `1h 综合质量 · ${availableCount} 可用 / ${state.candidates.length} 总计`
        : "等待检查";
    }
    if (refs.candidateCount) refs.candidateCount.textContent = String(state.candidates.length);
    if (refs.tokenResultCount) refs.tokenResultCount.textContent = String(state.tokenResults.length);
    if (refs.logCount) refs.logCount.textContent = String(state.logs.length);
    if (refs.currentGroup) {
      refs.currentGroup.textContent = state.currentGroup;
      refs.currentGroup.title = state.currentGroup;
    }
    if (refs.bestGroup) {
      const selected = tokensCache.filter((token) => config.tokenIds.includes(Number(token.id)));
      const currentRows = selected.map((token) => state.candidates.find((row) => candidateMatchesToken(row, token)
        && qualityModel(row) === tokenDecisionModel(config, token.id)));
      const currentModels = [...new Set(selected.map((token) => tokenDecisionModel(config, token.id)))];
      const current = currentRows.length && currentRows.every(Boolean) && currentModels.length === 1 ? currentRows[0] : "";
      const best = selected.length && !current ? null : selectBestCandidate(state.candidates, current, config.selectionMode, config);
      const detail = best
        ? `${qualityModel(best) || "模型未匹配"} · ${Number.isFinite(best.qualityScore) ? `同模型质量 ${best.qualityScore.toFixed(1)}` : "质量待评估"}`
        : state.candidates.length ? "按检测详情与同模型 1h 指标评估" : "等待检查";
      refs.bestGroup.textContent = best ? best.group : state.bestGroup;
      refs.bestGroup.title = best ? `${best.group} · ${detail}` : state.bestGroup;
      if (refs.bestGroupMeta) { refs.bestGroupMeta.textContent = detail; refs.bestGroupMeta.title = detail; }
    }
    if (refs.lastCheck) refs.lastCheck.textContent = state.lastCheck;
    const usageLoadingText = state.todayUsage.loading ? "..." : "";
    if (refs.balance) {
      refs.balance.textContent = usageLoadingText || formatBalance(state.todayUsage);
    }
    if (refs.todaySpend) {
      refs.todaySpend.textContent = usageLoadingText || formatSpend(state.todayUsage);
    }
    if (refs.todayRequests) {
      refs.todayRequests.textContent = usageLoadingText || formatUsageCount(
        state.todayUsage.requests,
        state.todayUsage.available,
      );
    }
    if (refs.todayTokens) {
      refs.todayTokens.textContent = usageLoadingText || formatTokenCount(
        state.todayUsage.tokens,
        state.todayUsage.available,
      );
    }
    [refs.balance, refs.todaySpend, refs.todayRequests, refs.todayTokens].filter(Boolean).forEach((element) => {
      element.title = state.todayUsage.error || (state.todayUsage.loading ? "正在刷新" : "");
    });
    if (refs.balance && state.todayUsage.available && !state.todayUsage.loading && !state.todayUsage.error) {
      const balanceValue = Math.max(0, Number(state.todayUsage.balance) || 0);
      refs.balance.title = state.todayUsage.symbol
        ? `${state.todayUsage.symbol}${balanceValue.toLocaleString("zh-CN", { maximumFractionDigits: 8 })}`
        : formatUsageCount(balanceValue, true);
    }
    if (refs.todayTokens && state.todayUsage.available && !state.todayUsage.loading && !state.todayUsage.error) {
      refs.todayTokens.title = `${formatUsageCount(state.todayUsage.tokens, true)} Token`;
    }
    if (refs.todaySpendItem) {
      refs.todaySpendItem.dataset.spendTone = state.spendProtection.tone;
      refs.todaySpendItem.style.setProperty(
        "--spend-progress",
        `${Math.min(100, Math.max(0, state.spendProtection.ratio * 100))}%`,
      );
    }
    if (refs.todaySpend && state.spendProtection.active) {
      refs.todaySpend.title = `消费提醒计数 ${formatSpendValue(state.spendProtection.trackedSpend, state.todayUsage.symbol)} / ${formatSpendValue(state.spendProtection.limit, state.todayUsage.symbol)}`;
    }
    if (refs.spendProtectionStatus) {
      refs.spendProtectionStatus.dataset.tone = state.spendProtection.tone;
      refs.spendProtectionStatus.textContent = !config.spendProtectionEnabled
        ? "未启用"
        : config.dailySpendLimit <= 0
          ? "请设置提醒额度"
          : !state.todayUsage.available
            ? "等待消费数据"
            : `${formatSpendValue(state.spendProtection.trackedSpend, state.todayUsage.symbol)} / ${formatSpendValue(state.spendProtection.limit, state.todayUsage.symbol)} · ${Math.round(state.spendProtection.ratio * 100)}%`;
    }
    if (refs.enabled) refs.enabled.checked = config.enabled;
    if (refs.monitorEnabled) {
      refs.monitorEnabled.checked = config.enabled;
      refs.monitorEnabled.disabled = running;
    }
    if (refs.monitorMode) refs.monitorMode.textContent = `${config.automaticSwitchMode === "failover" ? "仅故障转移 · " : ""}1h 综合质量`;
    if (refs.spendProtectionEnabled) refs.spendProtectionEnabled.checked = config.spendProtectionEnabled;
    if (refs.resetSpendProtection) refs.resetSpendProtection.disabled = running || !state.todayUsage.available;
    if (refs.check) refs.check.disabled = running;
    if (refs.switchNow) refs.switchNow.disabled = running;
    if (refs.checkUpdate) {
      refs.checkUpdate.disabled = state.update.checking || running;
      refs.checkUpdate.dataset.state = state.update.checking ? "checking" : "idle";
      refs.checkUpdate.dataset.update = state.update.availableVersion ? "available" : "none";
      const updateLabel = state.update.checking
        ? "正在检查更新"
        : (state.update.availableVersion ? `更新至 v${state.update.availableVersion}` : "检查更新");
      refs.checkUpdate.title = updateLabel;
      refs.checkUpdate.setAttribute("aria-label", updateLabel);
      if (refs.updateLabel) refs.updateLabel.textContent = updateLabel;
    }
    if (refs.selectAllTokens) refs.selectAllTokens.disabled = running;
    if (refs.clearTokens) refs.clearTokens.disabled = running;
    if (refs.selectAllModels) refs.selectAllModels.disabled = running;
    if (refs.clearModels) refs.clearModels.disabled = running;
    if (refs.modelSelectToggle) refs.modelSelectToggle.disabled = running;
    if (refs.tokenList) {
      refs.tokenList.querySelectorAll('input[data-token-id]').forEach((checkbox) => {
        checkbox.disabled = running;
      });
    }
    if (refs.modelList) {
      refs.modelList.querySelectorAll('input[data-model-name]').forEach((checkbox) => {
        checkbox.disabled = running;
      });
    }
    if (refs.manualDialog?.open) renderManualGroups();
    if (refs.manualGroup) {
      refs.manualGroup.querySelectorAll('input[data-manual-group]').forEach((radio) => {
        radio.disabled = running;
      });
    }
    if (refs.manualSwitch) refs.manualSwitch.disabled = running;
    if (!state.collapsed && state.activeView === "settings") {
      if (state.settingsPage === "protection") {
        const entries = listActiveIsolations(getSwitchGuardState(), Date.now());
        refs.isolationSummaryCount.textContent = `${entries.length}条`;
        if (refs.isolationRecords.open) renderIsolations();
      }
      if (state.settingsPage === "routing") {
        renderMonitorScope();
        renderQualitySettings();
        renderTokenModelBindings();
      }
    }
    if (refs.isolationToast) {
      const undoAvailable = state.isolationUndo.entries.length > 0 && state.isolationUndo.expiresAt > Date.now();
      refs.isolationToast.hidden = !undoAvailable;
      if (undoAvailable && refs.isolationToastMessage) {
        refs.isolationToastMessage.textContent = state.isolationUndo.entries.length === 1
          ? `已解除 ${state.isolationUndo.entries[0].group}`
          : `已解除 ${state.isolationUndo.entries.length} 个分组`;
      }
    }
    renderCurrentScopeWarning();
    if (!state.collapsed && state.activeView === "monitor") {
      renderCandidates();
      applyCandidateDisplayControls();
    }
    if (!state.collapsed && state.activeView === "statistics") renderStatistics();
    if (!state.collapsed && state.activeView === "diagnostics") {
      renderTokenResults();
      renderLogs();
    }
  }

  function applyTheme() {
    if (!root) return;
    const resolvedTheme = resolveThemeMode(config.theme, systemThemeQuery.matches);
    root.host.dataset.theme = config.theme;
    root.host.dataset.resolvedTheme = resolvedTheme;
    root.host.style.setProperty("--glass-transparency", `${config.glassTransparency}%`);
    root.host.style.setProperty("--panel-glass", resolvedTheme === "light" ? "#ffffff" : "#192324");
    if (refs.theme) {
      refs.theme.value = config.theme;
      const labels = { system: "跟随系统", light: "浅色", dark: "深色" };
      refs.theme.title = `皮肤：${labels[config.theme]}`;
    }
    if (refs.glassTransparency) refs.glassTransparency.value = String(config.glassTransparency);
    if (refs.glassTransparencyValue) refs.glassTransparencyValue.textContent = `${config.glassTransparency}%`;
  }

  const QUALITY_WEIGHT_CONTROLS = Object.freeze({ success: "qualityWeightSuccess", cache: "qualityWeightCache", tps: "qualityWeightTps", ratio: "qualityWeightRatio" });
  let qualitySettingsDraftKey = null;

  function qualitySettingsDraft() {
    const weights = Object.fromEntries(Object.entries(QUALITY_WEIGHT_CONTROLS)
      .map(([key, name]) => [key, refs[name]?.value ?? ""]));
    const gain = refs.minQualityGainDraft?.value ?? "";
    return { weights, gain: Number(gain), valid: validQualityWeights(weights)
      && gain !== "" && Number.isFinite(Number(gain)) && Number(gain) >= 0 && Number(gain) <= 100 };
  }

  function renderQualitySettings() {
    if (!refs.qualityWeightSuccess) return;
    const key = JSON.stringify([config.qualityWeights, config.minQualityGain]);
    if (qualitySettingsDraftKey !== key) {
      qualitySettingsDraftKey = key;
      Object.entries(QUALITY_WEIGHT_CONTROLS).forEach(([name, ref]) => {
        refs[ref].value = String(config.qualityWeights[name]);
      });
      refs.minQualityGainDraft.value = String(config.minQualityGain);
    }
    const draft = qualitySettingsDraft();
    const total = Object.values(draft.weights).reduce((sum, value) => sum + (value === "" ? NaN : Number(value)), 0);
    refs.qualityWeightTotal.textContent = `合计 ${Number.isFinite(total) ? total : "—"}% / 100%`;
    refs.qualityWeightTotal.dataset.invalid = String(!draft.valid);
    Object.entries(QUALITY_WEIGHT_CONTROLS).forEach(([name, ref]) => {
      const value = draft.weights[name];
      refs[ref].disabled = running;
      refs[ref].setAttribute("aria-invalid", String(value === "" || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 100));
    });
    refs.minQualityGainDraft.setAttribute("aria-invalid", String(!Number.isFinite(draft.gain) || refs.minQualityGainDraft.value === "" || draft.gain < 0 || draft.gain > 100));
    refs.minQualityGainDraft.disabled = running;
    const changed = JSON.stringify(normalizeQualityWeights(draft.weights)) !== JSON.stringify(config.qualityWeights)
      || draft.gain !== config.minQualityGain;
    refs.qualityWeightsStatus.textContent = !draft.valid ? "每项须为 0–100 的整数，合计必须为 100%；收益门槛须在 0–100 分。"
      : changed ? "有未保存的权重修改；预览仅使用当前快照，点击保存后下次检查生效。" : "已保存。只在下次检查时应用，不立即刷新或切组。";
    refs.qualityWeightsSave.disabled = running;
    refs.qualityWeightsReset.disabled = running;
    const warnings = Array.isArray(state.configWarnings) ? state.configWarnings : state.configWarnings ? [state.configWarnings] : [];
    refs.qualityConfigWarning.hidden = !warnings.length;
    refs.qualityConfigWarning.textContent = warnings.join("；");
    renderQualitySettingsPreview(draft);
  }

  function qualityPreviewDecision(current, best, settings) {
    if (!settings.enabled) return "保持当前组：自动切换已暂停，排名仅供查看。";
    if (settings.automaticSwitchMode === "failover") return "保持当前组：仅故障转移，当前组健康，排名不触发切换。";
    const score = scoreAihubQualityCandidates([current], settings)[0]?.qualityScore;
    const gain = best.qualityScore - score;
    if (!Number.isFinite(gain)) return "保持当前组：数据不足，无法按同一标尺比较。";
    if (gain <= 0) return "保持当前组：没有严格领先的候选，同分也不切换。";
    if (gain < settings.minQualityGain) return `保持当前组：分差 ${gain.toFixed(2)} 分，低于 ${settings.minQualityGain} 分门槛。`;
    return `分差 ${gain.toFixed(2)} 分达到 ${settings.minQualityGain} 分门槛；需在后续检查中取得新证据并完成 ${settings.confirmPolls} 次确认，且仍受保持期与观察等保护约束；预览不执行切换。`;
  }

  function renderQualitySettingsPreview(draft = qualitySettingsDraft()) {
    if (!refs.qualityPreview) return;
    if (!draft.valid) { refs.qualityPreview.textContent = "权重合法后显示本地预览。"; return; }
    const snapshot = state.candidates.slice();
    const previewSettings = { ...config, qualityWeights: normalizeQualityWeights(draft.weights), minQualityGain: draft.gain };
    const lines = [];
    config.tokenIds.forEach((id) => {
      const token = tokensCache.find((entry) => Number(entry.id) === Number(id));
      const name = token?.name || `密钥 #${id}`;
      const model = tokenDecisionModel(config, id);
      if (!model) { lines.push(`${name}：待绑定已启用的决策模型，自动处理暂停。`); return; }
      if (!token || !tokenSupportsModel(token, model)) { lines.push(`${name} · ${model}：密钥无权限使用绑定模型或密钥详情缺失，自动处理暂停。`); return; }
      const rows = snapshot.filter((row) => qualityModel(row) === model);
      const current = token && rows.find((row) => candidateMatchesToken(row, token));
      if (candidateHasExplicitHealthFailure(current, config)) {
        lines.push(`${name} · ${model}：当前快照存在明确故障，正常择优预览不适用；需在后续检查中按故障恢复准入选择安全目标，此处不执行恢复。`); return;
      }
      if (!current?.available || !Number.isFinite(scoreAihubQualityCandidates([current], config)[0]?.qualityScore)) {
        lines.push(`${name} · ${model}：当前组数据不足，无完整的同模型比较；保持当前组。`); return;
      }
      const before = selectBestCandidate(rows, token, "quality", config);
      const after = selectBestCandidate(rows, token, "quality", previewSettings);
      if (!Number.isFinite(before?.qualityScore) || !Number.isFinite(after?.qualityScore)) { lines.push(`${name} · ${model}：无完整合格候选，不生成推荐。`); return; }
      lines.push(`${name} · ${model}：已保存排名优胜 ${before.group}（${before.qualityScore.toFixed(2)}） → 草稿排名优胜 ${after.group}（${after.qualityScore.toFixed(2)}）`);
      lines.push(`已保存决策：${qualityPreviewDecision(current, before, config)}`);
      lines.push(`草稿决策：${qualityPreviewDecision(current, after, previewSettings)}`);
      [["已保存", before], ["草稿", after]].forEach(([label, winner]) => {
        const c = winner.qualityComponents.contributions;
        lines.push(`${label}分项贡献：成功 ${c.success.toFixed(2)} · 缓存 ${c.cache.toFixed(2)} · TPS ${c.tps.toFixed(2)} · 倍率 ${c.ratio.toFixed(2)}；样本保守系数：模型 ${winner.qualityComponents.qModel.toFixed(3)} / 缓存 ${winner.qualityComponents.qCache.toFixed(3)}`);
      });
    });
    refs.qualityPreview.textContent = lines.length ? lines.join("\n") : "请先选择密钥并绑定决策模型，再用已检查快照预览；此处不会刷新数据。";
  }

  function resetQualitySettingsDraft() {
    Object.entries(QUALITY_WEIGHT_CONTROLS).forEach(([name, ref]) => { refs[ref].value = String(DEFAULT_CONFIG.qualityWeights[name]); });
    refs.minQualityGainDraft.value = String(DEFAULT_CONFIG.minQualityGain);
    renderQualitySettings();
  }

  function saveQualitySettings() {
    if (running) return;
    const draft = qualitySettingsDraft();
    if (!draft.valid) { renderQualitySettings(); return; }
    const next = sanitizeConfig({ ...config, qualityWeights: draft.weights, minQualityGain: draft.gain });
    if (JSON.stringify([next.qualityWeights, next.minQualityGain]) !== JSON.stringify([config.qualityWeights, config.minQualityGain])) {
      config = next;
      invalidateCheckDecisions();
      pendingCandidates.clear();
      GM_setValue(STORAGE_CONFIG, config);
      refreshQualityRecommendation();
    }
    setStatus("质量权重已保存，下次检查生效", "success");
    renderQualitySettings();
    render();
  }

  function renderTokenModelBindings() {
    if (!refs.tokenModelBindings) return;
    const selected = config.tokenIds.map(Number);
    const models = targetModels(config);
    const key = JSON.stringify([selected, models, config.tokenModels, tokensCache.map((token) => [token.id, token.name]), running]);
    const unresolved = selected.filter((id) => !tokenDecisionModel(config, id));
    refs.tokenModelStatus.textContent = !selected.length ? "选择密钥后，为每个密钥绑定一个决策模型。"
      : unresolved.length ? `${unresolved.length} 个密钥待绑定或绑定模型未启用，自动处理暂停；其他已绑定密钥继续运行。`
        : `已绑定 ${selected.length} 个密钥；仅使用该模型的当前检测详情与 1h 指标。`;
    if (refs.tokenModelBindings.dataset.renderKey === key) return;
    const focusedId = root?.activeElement?.dataset?.tokenModelId;
    refs.tokenModelBindings.dataset.renderKey = key;
    refs.tokenModelBindings.replaceChildren();
    selected.forEach((id) => {
      const token = tokensCache.find((entry) => Number(entry.id) === id);
      const binding = String(config.tokenModels?.[id] || "");
      const field = document.createElement("div"); field.className = "token-model-field";
      const label = document.createElement("label"); label.htmlFor = `kf-token-model-${id}`;
      label.textContent = token?.name || `密钥 #${id}`;
      const select = document.createElement("select"); select.id = label.htmlFor; select.dataset.tokenModelId = String(id);
      select.disabled = running;
      const options = [["", "请选择决策模型"], ...models.map((model) => [model, model])];
      if (binding && !models.includes(binding)) options.push([binding, `${binding}（未启用，自动处理暂停）`]);
      options.forEach(([value, text]) => {
        const option = document.createElement("option"); option.value = value; option.textContent = text;
        option.disabled = Boolean(value && !models.includes(value)); select.appendChild(option);
      });
      select.value = binding;
      select.addEventListener("change", () => persistTokenModelBinding(id, select.value));
      const hint = document.createElement("small");
      hint.textContent = tokenDecisionModel(config, id) ? "不修改业务请求的 model，也不会调用模型。" : binding ? "绑定模型已取消启用；请重新勾选模型或另行绑定。" : "待绑定：此密钥的自动检查与切换暂停。";
      field.append(label, select, hint); refs.tokenModelBindings.appendChild(field);
    });
    if (focusedId && !running) refs.tokenModelBindings.querySelector(`[data-token-model-id="${focusedId}"]`)?.focus({ preventScroll: true });
  }

  function persistTokenModelBinding(id, model) {
    if (running || !config.tokenIds.includes(Number(id)) || (model && !targetModels(config).includes(model))) return;
    const bindings = { ...config.tokenModels };
    if (model) bindings[id] = model; else delete bindings[id];
    if (JSON.stringify(bindings) === JSON.stringify(config.tokenModels)) return;
    config = sanitizeConfig({ ...config, tokenModels: bindings });
    invalidateCheckDecisions();
    pendingCandidates.clear();
    GM_setValue(STORAGE_CONFIG, config);
    state.tokenResults = [];
    refreshQualityRecommendation();
    renderTokenModelBindings();
    renderQualitySettings();
    setStatus(model ? "决策模型已绑定，下次检查生效" : "已取消绑定，此密钥自动处理暂停", model ? "success" : "warning");
    render();
  }

  function readFormConfig() {
    return sanitizeConfig({
      theme: refs.theme.value,
      glassTransparency: refs.glassTransparency.value,
      enabled: refs.enabled.checked,
      tokenIds: [...refs.tokenList.querySelectorAll('input[data-token-id]:checked')]
        .map((checkbox) => checkbox.value),
      models: [...refs.modelList.querySelectorAll('input[data-model-name]:checked')]
        .map((checkbox) => checkbox.dataset.modelName),
      automaticSwitchMode: refs.automaticSwitchMode?.value || "strategy",
      businessPlatform: config.businessPlatform,
      selectionMode: "quality",
      qualityWeights: config.qualityWeights,
      minQualityGain: config.minQualityGain,
      tokenModels: config.tokenModels,
      monitorScopeMode: config.monitorScopeMode,
      monitorGroupIds: config.monitorGroupIds,
      monitorScopeMigrationPending: config.monitorScopeMigrationPending,
      monitorScopeMigrationPlatform: config.monitorScopeMigrationPlatform,
      groupFilterMode: config.groupFilterMode,
      groupWhitelist: config.groupWhitelist,
      groupBlacklist: config.groupBlacklist,
      requireModelDetection: true,
      spendProtectionEnabled: refs.spendProtectionEnabled.checked,
      dailySpendLimit: refs.dailySpendLimit.value,
      pollSeconds: refs.pollSeconds.value,
      strategySeconds: Number(refs.strategyMinutes.value) * 60,
      metricHours: config.metricHours,
      minSuccessRate: refs.minSuccessRate.value,
      minMetricSamples: refs.minMetricSamples.value,
      minCacheSamples: refs.minCacheSamples.value,
      minLatestSuccessRate: config.minLatestSuccessRate,
      maxMetricAgeMinutes: config.maxMetricAgeMinutes,
      maxFirstTokenLatencySeconds: config.maxFirstTokenLatencySeconds,
      maxOutputDurationSeconds: config.maxOutputDurationSeconds,
      maxGroupRatio: refs.maxGroupRatio.value,
      confirmPolls: refs.confirmPolls.value,
      switchHoldMinutes: refs.switchHoldMinutes.value,
      rollbackChecks: refs.rollbackChecks.value,
      blacklistMinutes: refs.blacklistMinutes.value,
    });
  }

  function syncForm() {
    if (refs.theme) refs.theme.value = config.theme;
    if (refs.glassTransparency) refs.glassTransparency.value = String(config.glassTransparency);
    if (refs.glassTransparencyValue) refs.glassTransparencyValue.textContent = `${config.glassTransparency}%`;
    refs.enabled.checked = config.enabled;
    if (refs.automaticSwitchMode) refs.automaticSwitchMode.value = config.automaticSwitchMode || "strategy";
    renderMonitorScope();
    refs.spendProtectionEnabled.checked = config.spendProtectionEnabled;
    refs.dailySpendLimit.value = String(config.dailySpendLimit);
    renderGroupFilterOptions();
    refs.pollSeconds.value = String(config.pollSeconds);
    refs.strategyMinutes.value = String(config.strategySeconds / 60);
    refs.minSuccessRate.value = String(config.minSuccessRate);
    refs.minMetricSamples.value = String(config.minMetricSamples);
    refs.minCacheSamples.value = String(config.minCacheSamples);
    refs.maxGroupRatio.value = String(config.maxGroupRatio);
    refs.confirmPolls.value = String(config.confirmPolls);
    refs.switchHoldMinutes.value = String(config.switchHoldMinutes);
    refs.rollbackChecks.value = String(config.rollbackChecks);
    refs.blacklistMinutes.value = String(config.blacklistMinutes);
    renderQualitySettings();
    renderTokenModelBindings();
  }

  function persistFormConfig() {
    const wasEnabled = config.enabled;
    // Pausing must work even when an unrelated field contains an invalid, unsaved draft.
    if (wasEnabled && !refs.enabled.checked) {
      config = { ...config, enabled: false };
      pendingCandidates.clear();
      invalidateCheckDecisions();
      GM_setValue(STORAGE_CONFIG, config);
      scheduleNext();
      setStatus("自动切换已暂停", "warning");
    }
    const invalid = [...refs.settingsSection.querySelectorAll("input,select")].filter((input) => {
      if (input.closest?.(".quality-settings-draft")) return false;
      const valid = input.checkValidity();
      input.setAttribute("aria-invalid", String(!valid));
      return !valid;
    })[0];
    if (invalid) {
      const label = invalid.closest(".field")?.querySelector("label")?.textContent || invalid.getAttribute("aria-label") || "设置值";
      state.settingsError = `${label}：${invalid.validationMessage}`;
      render();
      return;
    }
    state.settingsError = "";
    const previousConfigKey = JSON.stringify(config);
    const previousIdentity = `${config.tokenIds.join(",")}:${targetModelIdentity(config)}`;
    config = readFormConfig();
    if (previousConfigKey !== JSON.stringify(config)) {
      invalidateCheckDecisions();
      pendingCandidates.clear();
    }
    GM_setValue(STORAGE_CONFIG, config);
    renderTokenModelBindings();
    if (state.todayUsage.available) syncSpendProtection({ notify: true });
    if (`${config.tokenIds.join(",")}:${targetModelIdentity(config)}` !== previousIdentity) {
      pendingCandidates.clear();
      state.candidates = [];
      state.tokenResults = [];
      state.currentGroup = "-";
    }
    if (IS_AIHUB) {
      refreshQualityRecommendation();
    }
    if (config.enabled !== wasEnabled) {
      scheduleNext(config.enabled ? 250 : undefined);
      setStatus(config.enabled ? "自动切换已启用" : "自动切换已暂停", config.enabled ? "success" : "warning");
    } else {
      scheduleNext(config.enabled ? 250 : undefined, { immediateStrategy: false });
      setStatus("设置已自动保存", "success");
    }
    render();
  }

  function setTokenMenuOpen(open) {
    if (!refs.tokenMenu || !refs.tokenSelectToggle) return;
    refs.tokenMenu.hidden = !open;
    refs.tokenSelectToggle.setAttribute("aria-expanded", String(open));
    if (open) refs.tokenSearch?.focus();
  }

  function setModelMenuOpen(open) {
    if (!refs.modelMenu || !refs.modelSelectToggle) return;
    refs.modelMenu.hidden = !open;
    refs.modelSelectToggle.setAttribute("aria-expanded", String(open));
    if (open) refs.modelSearch?.focus();
  }

  function setGroupFilterMenuOpen(open) {
    if (!refs.groupFilterMenu || !refs.groupFilterSelectToggle) return;
    refs.groupFilterMenu.hidden = !open;
    refs.groupFilterSelectToggle.setAttribute("aria-expanded", String(open));
    if (open) refs.groupFilterSearch?.focus();
  }

  function setActiveView(view, options) {
    if (state.activeView === "settings" && refs.workspace) state.settingsScroll[state.settingsPage] = refs.workspace.scrollTop;
    state.activeView = normalizeActiveView(view);
    scheduleStatisticsRefresh();
    persistUiState();
    setTokenMenuOpen(false);
    setModelMenuOpen(false);
    setGroupFilterMenuOpen(false);
    render();
    if (refs.workspace) refs.workspace.scrollTop = state.activeView === "settings" ? state.settingsScroll[state.settingsPage] || 0 : 0;
    if (state.activeView === "statistics" && IS_AIHUB && !state.statistics.loaded && !state.statistics.loading) {
      void refreshStatistics({ silent: true });
    }
    if (options && options.focus) {
      const activeTab = root.querySelector(`[data-view-target="${state.activeView}"]`);
      if (activeTab) activeTab.focus();
    }
  }

  function persistUiState() {
    GM_setValue(STORAGE_UI, {
      activeView: state.activeView,
      settingsPage: state.settingsPage,
      statisticsMetric: state.statistics.metric,
      statisticsRange: state.statistics.range,
      statisticsDays: state.statistics.range === "today" ? 1 : state.statistics.range,
    });
  }

  let monitorScopeDraftKey = null;
  let monitorScopeDraftMode = "all";
  let monitorScopeDraftIds = new Set();
  let pendingManualScopeCandidate = null;
  const candidateDisplayOrder = new WeakMap();

  function monitorScopeCatalog() {
    const monitors = new Map((Array.isArray(aihubPlatformMonitorsCache) ? aihubPlatformMonitorsCache : [])
      .map((monitor) => [Number(monitor.group_id), monitor]));
    return (Array.isArray(aihubGroupsCache) ? aihubGroupsCache : [])
      .filter((group) => Number(group.id) > 0)
      .map((group) => {
        const monitor = monitors.get(Number(group.id));
        return { ...group, platform: group.platform || monitor?.platform || "",
          models: aihubGroupModelNames({ group_models: group.models }) ?? aihubGroupModelNames(monitor) ?? [] };
      })
      .slice().sort((left, right) => String(left.name).localeCompare(String(right.name), "zh-CN"));
  }

  function renderMonitorScope() {
    if (!refs.monitorScopeList) return;
    const configKey = JSON.stringify([config.monitorScopeMode, config.monitorGroupIds]);
    if (monitorScopeDraftKey !== configKey) {
      monitorScopeDraftKey = configKey;
      monitorScopeDraftMode = config.monitorScopeMode === "selected" ? "selected" : "all";
      monitorScopeDraftIds = new Set((config.monitorGroupIds || []).map(Number));
    }
    refs.monitorScopeMode.value = monitorScopeDraftMode;
    const catalog = monitorScopeCatalog();
    const listKey = JSON.stringify([catalog, [...monitorScopeDraftIds], monitorScopeDraftMode, running]);
    if (refs.monitorScopeList.dataset.renderKey !== listKey) {
      const focusedGroupId = Number(root?.activeElement?.dataset?.monitorGroupId);
      const scrollTop = refs.monitorScopeList.scrollTop;
      refs.monitorScopeList.dataset.renderKey = listKey;
      refs.monitorScopeList.replaceChildren();
      if (!catalog.length) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "尚未读取分组目录。请回到监控页执行立即检查。";
        refs.monitorScopeList.appendChild(empty);
      }
      catalog.forEach((group) => {
        const id = Number(group.id);
        const label = document.createElement("label");
        label.className = "monitor-scope-option";
        const models = Array.isArray(group.models) ? group.models.join(" · ") : String(group.models || "");
        label.dataset.searchText = `${group.name} ${id} ${models} ${group.platform || ""}`;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.dataset.monitorGroupId = String(id);
        input.checked = monitorScopeDraftMode === "all" || monitorScopeDraftIds.has(id);
        input.disabled = monitorScopeDraftMode === "all" || running;
        const copy = document.createElement("span");
        copy.textContent = group.name;
        const detail = document.createElement("small");
        detail.textContent = `#${id} · ${groupPlatforms[normalizeGroupPlatform(group.platform)]}${models ? ` · ${models}` : ""}`;
        copy.appendChild(detail);
        label.append(input, copy);
        refs.monitorScopeList.appendChild(label);
      });
      refs.monitorScopeList.scrollTop = scrollTop;
      if (focusedGroupId > 0 && !running) {
        refs.monitorScopeList.querySelector(`[data-monitor-group-id="${focusedGroupId}"]`)?.focus({ preventScroll: true });
      }
    }
    const selected = monitorScopeDraftMode === "all" ? catalog.length : monitorScopeDraftIds.size;
    refs.monitorScopeCount.textContent = monitorScopeDraftMode === "all" ? "全部分组" : `已选 ${selected} 个`;
    refs.monitorScopeCountDetail.textContent = `${selected} / ${catalog.length} 个分组`;
    refs.monitorScopeSelectAll.disabled = running;
    refs.monitorScopeClear.disabled = running;
    refs.monitorScopeSave.disabled = running;
    refs.monitorScopeMode.disabled = running;
    const changed = monitorScopeDraftMode !== config.monitorScopeMode
      || JSON.stringify([...monitorScopeDraftIds].sort((a, b) => a - b)) !== JSON.stringify([...(config.monitorGroupIds || [])].map(Number).sort((a, b) => a - b));
    refs.monitorScopeStatus.textContent = changed ? "有未保存的范围修改；点击保存后下次检查生效。"
      : monitorScopeDraftMode === "selected" && !selected ? "未选择分组：自动检查暂停，不会将空范围解释为全部。"
        : "已保存。立即检查和计划检查只处理此范围；公开目录接口仍可能返回全站目录。";
    filterSelectorList(refs.monitorScopeList, refs.monitorScopeSearch, refs.monitorScopeSearchStatus);
  }

  function removeTokenSelections(ids) {
    if (running) return;
    const removed = new Set(ids.map(Number));
    config = { ...config, tokenIds: config.tokenIds.filter((id) => !removed.has(Number(id))) };
    refs.tokenList.querySelectorAll("input[data-token-id]").forEach((input) => {
      if (removed.has(Number(input.value))) input.checked = false;
    });
    state.outOfScopeTokens = (state.outOfScopeTokens || []).filter((token) => !removed.has(Number(token.id)));
    pendingCandidates.clear();
    invalidateCheckDecisions();
    GM_setValue(STORAGE_CONFIG, config);
    renderTokenSelectionCount();
    setStatus("已从插件选择中移除密钥；AIHub 密钥和分组未修改", "success");
    render();
  }

  function renderCurrentScopeWarning() {
    if (!refs.currentScopeWarning) return;
    const tokens = state.outOfScopeTokens || [];
    refs.currentScopeWarning.hidden = !tokens.length;
    if (!tokens.length || !sectionNeedsRender(refs.outOfScopeTokenList, [tokens, config.tokenIds.join(","), running])) return;
    refs.outOfScopeTokenList.replaceChildren();
    tokens.forEach((token) => {
      const item = document.createElement("div");
      item.className = "scope-notice-item";
      const label = document.createElement("span");
      label.textContent = `${token.name || `密钥 #${token.id}`} · ${token.group || "未设置分组"}`;
      const add = document.createElement("button");
      add.type = "button";
      add.className = "text-button";
      add.textContent = "加入监控";
      add.disabled = !(Number(token.groupId) > 0) || running;
      add.addEventListener("click", () => saveMonitorScope("selected", [...new Set([...(config.monitorGroupIds || []), Number(token.groupId)])]));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-button";
      remove.textContent = "移除选择";
      remove.disabled = running;
      remove.addEventListener("click", () => removeTokenSelections([token.id]));
      item.append(label, add, remove);
      refs.outOfScopeTokenList.appendChild(item);
    });
    refs.removeOutOfScopeToken.disabled = running;
  }

  function applyCandidateDisplayControls() {
    if (!refs.candidateRows) return;
    const rows = [...refs.candidateRows.children].filter((row) => row.dataset.groupId);
    const query = normalizeSelectorQuery(refs.candidateSearch?.value);
    const status = refs.candidateStatus?.value || "";
    const availability = refs.candidateAvailabilityFilter?.value || "";
    let visible = 0;
    rows.forEach((row, index) => {
      if (!candidateDisplayOrder.has(row)) candidateDisplayOrder.set(row, index);
      row.hidden = !matchesPlatform(row, refs.candidatePlatform)
        || Boolean(query) && !normalizeSelectorQuery(row.dataset.searchText || row.textContent).includes(query)
        || Boolean(status) && row.dataset.status !== status
        || availability === "available" && row.dataset.available !== "true"
        || availability === "unavailable" && row.dataset.available === "true";
      if (!row.hidden) visible++;
    });
    const sort = refs.candidateSort?.value || "quality";
    const numeric = (row) => {
      const raw = row.dataset[sort === "quality" ? "score" : sort];
      return raw === undefined || raw === "" || !Number.isFinite(Number(raw)) ? null : Number(raw);
    };
    rows.sort((left, right) => {
      if (sort === "quality" && left.dataset.model !== right.dataset.model) {
        return String(left.dataset.model || "").localeCompare(String(right.dataset.model || ""));
      }
      const a = numeric(left);
      const b = numeric(right);
      if (a === null || b === null) {
        if (a !== b) return a === null ? 1 : -1;
      } else if (a !== b) return sort === "ratio" ? a - b : b - a;
      return candidateDisplayOrder.get(left) - candidateDisplayOrder.get(right);
    }).forEach((row) => refs.candidateRows.appendChild(row));
    if (refs.candidateSearchStatus) refs.candidateSearchStatus.textContent = rows.length
      ? `显示 ${visible} / ${rows.length} 个分组 · ${sort === "quality" ? "按模型分池推荐 · " : ""}排序和筛选仅影响显示` : "尚无检查结果";
    if (refs.candidateResetFilters) refs.candidateResetFilters.hidden = !rows.length || visible > 0;
    root?.querySelectorAll("[data-candidate-sort]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.candidateSort === sort));
      button.dataset.sortDirection = sort === "ratio" ? "ascending" : "descending";
    });
  }

  function requestManualSwitch(candidate) {
    if (!candidate || running) return;
    const inScope = monitorGroupInScope(config, candidate.groupId);
    if (inScope && candidate.available === true) {
      void manualSwitchToGroup(candidate, "once");
      return;
    }
    pendingManualScopeCandidate = candidate;
    const eligible = candidate.available === true;
    const issue = candidateIssueText(candidate) || (candidate.catalogOnly
      ? "仅有目录信息，尚未检查检测详情和 1h 指标" : "尚未通过本轮模型检测与质量门槛");
    refs.manualScopeTitle.textContent = inScope ? "确认切换到未准入分组" : "目标分组未纳入监控";
    refs.manualScopeTarget.textContent = `${candidate.group || "未命名分组"}${Number(candidate.groupId) > 0 ? ` · #${candidate.groupId}` : ""}`;
    refs.manualScopeRisk.hidden = eligible;
    refs.manualScopeRisk.textContent = eligible ? "" : `风险：${issue}。手动切换可能影响服务可用性，请确认后继续。`;
    refs.manualScopeHint.textContent = inScope
      ? "仅本次覆盖自动准入限制；后续自动检查仍遵守保存的监控范围和质量门槛。"
      : "请选择如何处理。仅本次切换不会修改保存的监控范围；后续自动检查不会包含此范围外分组。";
    refs.manualScopeAdd.hidden = inScope || !(Number(candidate.groupId) > 0);
    refs.manualScopeOnce.textContent = inScope ? "仍然切换一次" : "仅切换一次";
    refs.manualScopeDialog.showModal();
    refs.manualScopeCancel.focus();
  }

  function bindUi() {
    [
      [refs.tokenSearch, refs.tokenList, refs.tokenSearchStatus],
      [refs.modelSearch, refs.modelList, refs.modelSearchStatus],
      [refs.groupFilterSearch, refs.groupFilterList, refs.groupFilterSearchStatus, refs.groupFilterPlatform],
      [refs.manualGroupSearch, refs.manualGroup, refs.manualGroupSearchStatus, refs.manualGroupPlatform],
    ].forEach(([input, list, status, platform]) => {
      const filter = () => filterSelectorList(list, input, status, platform);
      bindSelectorSearch(input, filter, list);
      bindPlatformFilter(platform, filter);
    });
    bindSelectorSearch(refs.candidateSearch, applyCandidateDisplayControls, refs.candidateRows);
    [refs.candidatePlatform, refs.candidateSort, refs.candidateStatus, refs.candidateAvailabilityFilter].forEach((control) => {
      control.addEventListener("change", applyCandidateDisplayControls);
    });
    refs.candidateResetFilters.addEventListener("click", () => {
      [refs.candidateSearch, refs.candidatePlatform, refs.candidateStatus, refs.candidateAvailabilityFilter].forEach((control) => { control.value = ""; });
      applyCandidateDisplayControls();
      refs.candidateSearch.focus();
    });
    root.querySelectorAll("[data-candidate-sort]").forEach((button) => {
      button.addEventListener("click", () => {
        refs.candidateSort.value = button.dataset.candidateSort;
        applyCandidateDisplayControls();
      });
    });
    bindSelectorSearch(refs.monitorScopeSearch, renderMonitorScope, refs.monitorScopeList);
    refs.monitorScopeMode.addEventListener("change", () => { monitorScopeDraftMode = refs.monitorScopeMode.value; renderMonitorScope(); });
    refs.monitorScopeList.addEventListener("change", (event) => {
      const id = Number(event.target.dataset.monitorGroupId);
      if (!(id > 0)) return;
      if (event.target.checked) monitorScopeDraftIds.add(id); else monitorScopeDraftIds.delete(id);
      renderMonitorScope();
    });
    refs.monitorScopeSelectAll.addEventListener("click", () => {
      monitorScopeDraftMode = "selected";
      monitorScopeDraftIds = new Set(monitorScopeCatalog().map((group) => Number(group.id)));
      renderMonitorScope();
    });
    refs.monitorScopeClear.addEventListener("click", () => {
      monitorScopeDraftMode = "selected"; monitorScopeDraftIds.clear(); renderMonitorScope();
    });
    refs.monitorScopeSave.addEventListener("click", () => saveMonitorScope(monitorScopeDraftMode, [...monitorScopeDraftIds]));
    refs.removeOutOfScopeToken.addEventListener("click", () => removeTokenSelections((state.outOfScopeTokens || []).map((token) => token.id)));
    [[refs.manualScopeAdd, "add-and-switch"], [refs.manualScopeOnce, "once"], [refs.manualScopeCancel, "cancel"]].forEach(([button, action]) => {
      button.addEventListener("click", () => {
        const candidate = pendingManualScopeCandidate;
        pendingManualScopeCandidate = null;
        refs.manualScopeDialog.close();
        if (candidate) void manualSwitchToGroup(candidate, action);
      });
    });
    refs.manualScopeDialog.addEventListener("cancel", () => { pendingManualScopeCandidate = null; });
    bindDrag(refs.launcher, refs.launcher, "launcher");
    bindDrag(refs.header, refs.panel, "panel");
    root.querySelectorAll("[data-settings-target]").forEach((button) => {
      const activate = (target, focus) => {
        state.settingsScroll[state.settingsPage] = refs.workspace.scrollTop;
        state.settingsPage = target.dataset.settingsTarget;
        setTokenMenuOpen(false);
        setModelMenuOpen(false);
        setGroupFilterMenuOpen(false);
        persistUiState();
        render();
        refs.workspace.scrollTop = state.settingsScroll[state.settingsPage] || 0;
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
        if (focus) target.focus({ preventScroll: true });
      };
      button.addEventListener("click", () => activate(button));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = [...root.querySelectorAll("[data-settings-target]")].filter((tab) => !tab.hidden);
        const index = tabs.indexOf(button);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        activate(tabs[next], true);
      });
    });
    refs.isolationRecords.addEventListener("toggle", () => {
      if (refs.isolationRecords.open) renderIsolations();
    });
    refs.collapse.addEventListener("click", () => {
      state.collapsed = true;
      render();
    });
    refs.fullscreen.addEventListener("click", () => {
      const expanded = refs.panel.dataset.fullscreen !== "true";
      refs.panel.dataset.fullscreen = String(expanded);
      refs.fullscreen.setAttribute("aria-pressed", String(expanded));
      refs.fullscreen.setAttribute("aria-label", expanded ? "退出全屏工作台" : "全屏工作台");
      refs.fullscreen.title = expanded ? "退出全屏工作台" : "全屏工作台";
      positionElement(refs.panel, "panel", false);
    });
    refs.launcher.addEventListener("click", () => {
      if (refs.launcher.dataset.dragged === "true") {
        delete refs.launcher.dataset.dragged;
        return;
      }
      state.collapsed = false;
      render();
    });
    root.querySelectorAll("[data-view-target]").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveView(button.dataset.viewTarget);
      });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        const tabs = [...root.querySelectorAll("[data-view-target]")];
        const currentIndex = tabs.indexOf(button);
        const targetIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        setActiveView(tabs[targetIndex].dataset.viewTarget, { focus: true });
      });
    });
    refs.check.addEventListener("click", () => runCheck({ manual: true }));
    refs.statisticsMetric.addEventListener("change", () => {
      state.statistics.metric = normalizeAihubStatisticsMetric(refs.statisticsMetric.value);
      persistUiState();
      render();
    });
    refs.statisticsDays.addEventListener("change", () => {
      state.statistics.range = normalizeAihubStatisticsRange(refs.statisticsDays.value);
      scheduleStatisticsRefresh();
      persistUiState();
      void refreshStatistics();
    });
    refs.statisticsRefresh.addEventListener("click", () => refreshStatistics());
    refs.checkUpdate.addEventListener("click", handleUpdateAction);
    refs.switchNow.addEventListener("click", () => runCheck({ manual: true, forceSwitch: true }));
    refs.resetSpendProtection.addEventListener("click", resetSpendProtection);
    refs.clearAllIsolations.addEventListener("click", clearAllIsolations);
    refs.isolationToastUndo.addEventListener("click", undoIsolationClear);
    refs.monitorEnabled.addEventListener("change", () => {
      refs.enabled.checked = refs.monitorEnabled.checked;
      persistFormConfig();
    });
    refs.tokenSelectToggle.addEventListener("click", () => {
      setModelMenuOpen(false);
      setGroupFilterMenuOpen(false);
      setTokenMenuOpen(refs.tokenMenu.hidden);
    });
    refs.modelSelectToggle.addEventListener("click", () => {
      setTokenMenuOpen(false);
      setGroupFilterMenuOpen(false);
      setModelMenuOpen(refs.modelMenu.hidden);
    });
    refs.groupFilterSelectToggle.addEventListener("click", () => {
      setTokenMenuOpen(false);
      setModelMenuOpen(false);
      setGroupFilterMenuOpen(refs.groupFilterMenu.hidden);
    });
    root.addEventListener("click", (event) => {
      if (!refs.tokenSelect.contains(event.target)) setTokenMenuOpen(false);
      if (!refs.modelSelect.contains(event.target)) setModelMenuOpen(false);
      if (!refs.groupFilterSelect.contains(event.target)) setGroupFilterMenuOpen(false);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!event.composedPath().includes(root.host)) {
        setTokenMenuOpen(false);
        setModelMenuOpen(false);
        setGroupFilterMenuOpen(false);
      }
    });
    refs.manualSwitch.addEventListener("click", () => {
      setTokenMenuOpen(false);
      setModelMenuOpen(false);
      setGroupFilterMenuOpen(false);
      renderManualGroups();
      if (!manualGroupCatalog().length) {
        setStatus("请先执行一次立即检查，再选择手动目标分组", "warning");
      }
      refs.manualDialog.showModal();
      const firstChoice = refs.manualGroup.querySelector('input[data-manual-group]:checked')
        || refs.manualGroup.querySelector('input[data-manual-group]');
      (refs.manualGroupSearch || firstChoice || refs.manualClose).focus();
    });
    refs.detectionImageClose.addEventListener("click", () => refs.detectionImageDialog.close());
    refs.detectionImageDialog.addEventListener("click", (event) => {
      if (event.target !== refs.detectionImageDialog) return;
      const bounds = refs.detectionImageDialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) refs.detectionImageDialog.close();
    });
    refs.detectionImageDialog.addEventListener("close", () => {
      refs.detectionImage.removeAttribute("src");
      refs.detectionImage.hidden = true;
      const dialog = refs.detectionImageDialog;
      const trigger = dialog.imageTrigger?.isConnected ? dialog.imageTrigger
        : [...refs.candidateRows.querySelectorAll("button[data-detection-image]")]
          .find((button) => button.dataset.groupId === dialog.imageGroupId);
      (trigger || refs.check).focus({ preventScroll: true });
      dialog.imageTrigger = null;
    });
    refs.detectionImage.addEventListener("load", () => {
      if (!refs.detectionImageDialog.open) return;
      refs.detectionImageStatus.hidden = true;
      refs.detectionImage.hidden = false;
    });
    refs.detectionImage.addEventListener("error", () => {
      if (!refs.detectionImageDialog.open) return;
      refs.detectionImage.hidden = true;
      refs.detectionImageStatus.hidden = false;
      refs.detectionImageStatus.textContent = "图片加载失败，可在新标签页重试查看原图。";
    });
    refs.manualGroup.addEventListener("change", () => {
      refs.manualConfirm.disabled = running || !refs.manualGroup.querySelector('input[data-manual-group]:checked');
    });
    refs.manualConfirm.addEventListener("click", () => {
      const choice = refs.manualGroup.querySelector('input[data-manual-group]:checked');
      const targetGroup = choice?.value || "";
      if (!targetGroup) return;
      const candidate = manualGroupCatalog().find((group) => Number(group.groupId) === Number(choice.dataset.groupId))
        || { group: targetGroup, groupId: Number(choice.dataset.groupId) };
      refs.manualDialog.close();
      requestManualSwitch(candidate);
    });
    [refs.manualClose, refs.manualCancel].forEach((button) => {
      button.addEventListener("click", () => refs.manualDialog.close());
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || refs.manualDialog.open || refs.manualScopeDialog.open || refs.detectionImageDialog.open) return;
      const expanded = [...refs.candidateRows.querySelectorAll("details[open]")];
      if (expanded.length) {
        expanded.forEach((detail) => { detail.open = false; });
        expanded[0].querySelector("summary")?.focus();
        event.preventDefault();
        return;
      }
      const trigger = !refs.tokenMenu.hidden ? refs.tokenSelectToggle
        : !refs.modelMenu.hidden ? refs.modelSelectToggle
          : !refs.groupFilterMenu.hidden ? refs.groupFilterSelectToggle : null;
      setTokenMenuOpen(false);
      setModelMenuOpen(false);
      setGroupFilterMenuOpen(false);
      trigger?.focus();
      if (!trigger && refs.panel.dataset.fullscreen === "true") {
        event.preventDefault();
        refs.fullscreen.click();
        refs.fullscreen.focus({ preventScroll: true });
      }
    });
    refs.tokenList.addEventListener("change", () => {
      renderTokenSelectionCount();
      persistFormConfig();
    });
    refs.modelList.addEventListener("change", () => {
      renderModelSelectionCount();
      persistFormConfig();
    });
    refs.selectAllTokens.addEventListener("click", () => {
      refs.tokenList.querySelectorAll('input[data-token-id]').forEach((checkbox) => {
        checkbox.checked = true;
      });
      renderTokenSelectionCount();
      persistFormConfig();
    });
    refs.clearTokens.addEventListener("click", () => {
      refs.tokenList.querySelectorAll('input[data-token-id]').forEach((checkbox) => {
        checkbox.checked = false;
      });
      renderTokenSelectionCount();
      persistFormConfig();
    });
    refs.selectAllModels.addEventListener("click", () => {
      refs.modelList.querySelectorAll('input[data-model-name]').forEach((checkbox) => {
        checkbox.checked = true;
      });
      renderModelSelectionCount();
      persistFormConfig();
    });
    refs.clearModels.addEventListener("click", () => {
      refs.modelList.querySelectorAll('input[data-model-name]').forEach((checkbox) => {
        checkbox.checked = false;
      });
      renderModelSelectionCount();
      persistFormConfig();
    });
    refs.groupFilterMode.addEventListener("change", () => {
      config = {
        ...config,
        groupFilterMode: refs.groupFilterMode.value === "blacklist" ? "blacklist" : "whitelist",
      };
      pendingCandidates.clear();
      invalidateCheckDecisions();
      GM_setValue(STORAGE_CONFIG, config);
      renderGroupFilterOptions();
      scheduleNext(config.enabled ? 250 : undefined, { immediateStrategy: false });
      setStatus("分组名单模式已切换", "success");
    });
    refs.groupFilterList.addEventListener("change", () => {
      const key = groupFilterConfigKey(config.groupFilterMode);
      const groups = [...refs.groupFilterList.querySelectorAll('input[data-group-name]:checked')]
        .map((checkbox) => checkbox.dataset.groupName);
      config = { ...config, [key]: parseAllowedGroups(groups) };
      pendingCandidates.clear();
      invalidateCheckDecisions();
      GM_setValue(STORAGE_CONFIG, config);
      updateGroupFilterSummary();
      scheduleNext(config.enabled ? 250 : undefined, { immediateStrategy: false });
      setStatus(`${config.groupFilterMode === "blacklist" ? "黑名单" : "白名单"}已自动保存`, "success");
    });
    refs.clearGroupFilter.addEventListener("click", () => {
      refs.groupFilterList.querySelectorAll('input[data-group-name]').forEach((checkbox) => {
        checkbox.checked = false;
      });
      refs.groupFilterList.dispatchEvent(new Event("change", { bubbles: true }));
    });
    Object.values(QUALITY_WEIGHT_CONTROLS).forEach((name) => {
      refs[name]?.addEventListener("input", renderQualitySettings);
    });
    refs.minQualityGainDraft?.addEventListener("input", renderQualitySettings);
    refs.qualityWeightsReset?.addEventListener("click", resetQualitySettingsDraft);
    refs.qualityWeightsSave?.addEventListener("click", saveQualitySettings);
    refs.settingsSection.addEventListener("change", (event) => {
      if (event.target.matches("[data-selector-search], .selector-platform")) return;
      if (event.target.closest(".quality-settings-draft, .token-model-settings")) return;
      if (event.target === refs.monitorScopeMode || event.target.closest(".monitor-scope-panel")) return;
      if (event.target.closest(".token-list")) return;
      if (event.target === refs.groupFilterMode || event.target.closest(".group-filter-select")) return;
      if (event.target === refs.glassTransparency) return;
      persistFormConfig();
    });
    refs.theme.addEventListener("change", () => {
      config = { ...config, theme: normalizeThemeMode(refs.theme.value) };
      GM_setValue(STORAGE_CONFIG, config);
      applyTheme();
    });
    refs.glassTransparency.addEventListener("input", () => {
      config = { ...config, glassTransparency: normalizeGlassTransparency(refs.glassTransparency.value) };
      GM_setValue(STORAGE_CONFIG, config);
      applyTheme();
    });
    const handleSystemThemeChange = () => {
      if (config.theme === "system") applyTheme();
    };
    if (typeof systemThemeQuery.addEventListener === "function") {
      systemThemeQuery.addEventListener("change", handleSystemThemeChange);
    } else if (typeof systemThemeQuery.addListener === "function") {
      systemThemeQuery.addListener(handleSystemThemeChange);
    }
  }

  function mountUi() {
    if (document.getElementById(HOST_ID)) return;
    const host = document.createElement("div");
    host.id = HOST_ID;
    (document.body || document.documentElement).appendChild(host);
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          pointer-events: none;
          color-scheme: dark;
          --canvas: #101819;
          --surface: #192324;
          --surface-raised: #202d2e;
          --surface-active: #293738;
          --line: #344647;
          --line-soft: #2b3b3c;
          --line-strong: #4d6465;
          --text: #e5eeee;
          --text-soft: #c6d2d2;
          --muted: #a8b7b7;
          --accent: #73d2cb;
          --accent-ink: #102423;
          --accent-soft: #203d3c;
          --healthy: #58d69a;
          --healthy-soft: rgb(88 214 154 / 12%);
          --info: #79b9ff;
          --info-soft: rgb(91 169 255 / 12%);
          --warning: #f2b94b;
          --warning-soft: rgb(242 185 75 / 10%);
          --danger: #ff716f;
          --danger-soft: rgb(255 113 111 / 9%);
          --focus: rgb(115 210 203 / 40%);
          --toolbar: #192324;
          --control: #192324;
          --menu: #202d2e;
          --native-option-bg: #192324;
          --native-option-text: #e5eeee;
          --glass-transparency: 0%;
          --panel-glass: #192324;
          --shadow-panel: 0 24px 64px rgb(0 0 0 / 48%);
          --shadow-menu: 0 16px 38px rgb(0 0 0 / 38%), inset 0 1px 0 rgb(255 255 255 / 8%);
          --dialog-backdrop: rgb(0 0 0 / 62%);
        }
        :host([data-resolved-theme="light"]) {
          color-scheme: light;
          --canvas: #edf1f2;
          --surface: #ffffff;
          --surface-raised: #f6f8f8;
          --surface-active: #eef2f2;
          --line: #dce3e4;
          --line-soft: #e8eded;
          --line-strong: #a6b7b8;
          --text: #162426;
          --text-soft: #405456;
          --muted: #5d6e70;
          --accent: #066d72;
          --accent-ink: #ffffff;
          --accent-soft: #e2f3f1;
          --healthy: #0b7048;
          --healthy-soft: rgb(22 134 90 / 10%);
          --info: #1674d1;
          --info-soft: rgb(22 116 209 / 9%);
          --warning: #9a6500;
          --warning-soft: rgb(175 113 0 / 10%);
          --danger: #c63e3c;
          --danger-soft: rgb(198 62 60 / 9%);
          --focus: rgb(8 126 131 / 35%);
          --toolbar: #ffffff;
          --control: #ffffff;
          --menu: #ffffff;
          --native-option-bg: #ffffff;
          --native-option-text: #162426;
          --glass-transparency: 0%;
          --panel-glass: #ffffff;
          --shadow-panel: 0 24px 64px rgb(22 44 46 / 18%);
          --shadow-menu: 0 14px 34px rgb(31 44 54 / 20%), inset 0 1px 0 rgb(255 255 255 / 72%);
          --dialog-backdrop: rgb(28 36 32 / 38%);
        }
        :host([data-resolved-theme="light"]) .status::before { box-shadow: inset 0 0 0 7px rgb(255 255 255 / 78%); }
        :host([data-resolved-theme="light"]) .work-nav::before { background: rgb(255 255 255 / 24%); }
        :host([data-resolved-theme="light"]) .token-list { background: rgb(255 255 255 / 34%); }
        :host([data-resolved-theme="light"]) .isolation-row { background: rgb(255 255 255 / 38%); }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, select { font: inherit; letter-spacing: 0; }
        button { cursor: pointer; touch-action: manipulation; }
        .mono, .version, .token-count, .route-value, .route-best-value, .route-meta strong {
          font-family: SFMono-Regular, Consolas, "Liberation Mono", monospace;
          font-variant-numeric: tabular-nums slashed-zero;
        }
        .launcher, .panel, .manual-dialog, .scope-dialog {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei UI", sans-serif;
          font-optical-sizing: auto;
          color: var(--text);
          pointer-events: auto;
        }
        .launcher, .panel {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483000;
        }
        .panel[hidden], .launcher[hidden], .token-menu[hidden] { display: none; }
        .launcher {
          width: 44px;
          height: 44px;
          padding: 0;
          border: 1px solid var(--line-strong);
          border-radius: 13px;
          background: var(--panel-glass);
          color: var(--accent);
          box-shadow: var(--shadow-panel);
          -webkit-backdrop-filter: blur(20px) saturate(170%);
          backdrop-filter: blur(20px) saturate(170%);
          font-family: SFMono-Regular, Consolas, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0;
          cursor: grab;
          touch-action: none;
        }
        .launcher:hover { border-color: var(--accent); background: var(--surface-raised); }
        .launcher:active { cursor: grabbing; transform: scale(.96); }
        .panel {
          width: min(1080px, calc(100vw - 32px));
          height: min(84vh, 900px);
          max-height: calc(100vh - 24px);
          overflow: auto;
          border: 1px solid var(--line-strong);
          border-radius: 12px;
          background: var(--panel-glass);
          box-shadow: var(--shadow-panel);
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
          scrollbar-color: var(--line-strong) transparent;
          scrollbar-width: thin;
          transition: width 180ms cubic-bezier(.2, .8, .2, 1), height 180ms cubic-bezier(.2, .8, .2, 1), box-shadow 160ms ease;
        }
        .header {
          position: sticky;
          top: 0;
          z-index: 4;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 64px;
          padding: 10px 12px 10px 14px;
          border-bottom: 1px solid var(--line);
          background: var(--toolbar);
          cursor: grab;
          touch-action: none;
          user-select: none;
        }
        .header:active { cursor: grabbing; }
        .panel[data-dragging="true"] { box-shadow: 0 18px 44px rgb(0 0 0 / 34%); opacity: .96; }
        .header-copy { display: grid; gap: 3px; min-width: 0; flex: 1; }
        .header-title-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
        .title {
          overflow: hidden;
          color: var(--text);
          font-size: 15px;
          font-weight: 650;
          line-height: 1.2;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .brand-meta { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 10px; }
        .version { flex: 0 0 auto; color: inherit; font-size: 10px; font-weight: 500; }
        .update-badge {
          flex: 0 0 auto;
          border: 1px solid color-mix(in oklch, var(--accent) 58%, var(--line));
          border-radius: 5px;
          background: var(--accent-soft);
          color: var(--accent);
          padding: 1px 4px;
          font-size: 8px;
          font-weight: 750;
          line-height: 1.2;
        }
        .brand-mark {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          place-items: center;
          border: 1px solid var(--accent);
          background: var(--accent-soft);
          color: var(--accent);
          border-radius: 9px;
          font-family: SFMono-Regular, Consolas, monospace;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0;
        }
        .dot {
          width: 6px;
          height: 6px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: var(--muted);
        }
        .dot[data-tone="running"], .dot[data-tone="warning"] { background: var(--warning); }
        .dot[data-tone="running"] { animation: status-pulse 1.2s ease-in-out infinite; }
        .dot[data-tone="success"] { background: var(--healthy); box-shadow: 0 0 0 4px var(--healthy-soft); }
        .dot[data-tone="error"] { background: var(--danger); }
        @keyframes status-pulse { 50% { opacity: .35; transform: scale(.72); } }
        .theme-select {
          width: 64px;
          height: 32px;
          flex: 0 0 auto;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: var(--muted);
          padding: 0 5px;
          font-size: 10px;
          cursor: pointer;
        }
        .theme-select:hover { border-color: var(--line); color: var(--text-soft); }
        .icon-button {
          position: relative;
          display: inline-grid;
          place-items: center;
          width: 32px;
          height: 32px;
          flex: 0 0 auto;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: var(--muted);
          padding: 0;
          line-height: 1;
        }
        .icon-button:hover { border-color: var(--line); background: var(--surface-raised); color: var(--text); }
        .icon-button:active { transform: scale(.92); transition-duration: 80ms; }
        button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .icon-button svg, .button svg {
          width: 14px;
          height: 14px;
          fill: none;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 1.8;
        }
        .icon-button[data-update="available"]::after {
          position: absolute;
          top: 3px;
          right: 3px;
          width: 5px;
          height: 5px;
          border: 1px solid var(--surface);
          border-radius: 1px;
          background: var(--accent);
          content: "";
        }
        .icon-button[data-state="checking"] svg { animation: update-spin .8s linear infinite; }
        @keyframes update-spin { to { transform: rotate(360deg); } }
        .status {
          display: flex;
          align-items: center;
          min-height: 44px;
          gap: 9px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--line-soft);
          color: var(--text-soft);
          background: transparent;
          font-size: 11px;
          font-weight: 590;
          line-height: 1.4;
        }
        .status::before { width: 20px; height: 20px; flex: 0 0 auto; border-radius: 50%; background: currentColor; box-shadow: inset 0 0 0 7px rgb(9 12 15 / 76%); content: ""; }
        .status[data-tone="success"] { color: var(--healthy); background: transparent; }
        .status[data-tone="warning"], .status[data-tone="running"] { color: var(--warning); background: var(--warning-soft); }
        .status[data-tone="error"] { color: var(--danger); background: var(--danger-soft); }
        .overview {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          border-bottom: 1px solid var(--line);
          background: transparent;
        }
        .route-primary, .route-best {
          display: grid;
          grid-template-columns: 1fr;
          align-content: center;
          gap: 5px;
          min-width: 0;
          min-height: 78px;
          padding: 13px 16px;
        }
        .route-primary { border-right: 1px solid var(--line); }
        .route-node { position: relative; }
        .route-apply { position: absolute; top: 9px; right: 10px; width: 28px; height: 28px; color: var(--accent); }
        .metric-label {
          color: var(--muted);
          font-size: 9px;
          font-weight: 650;
          white-space: nowrap;
        }
        .route-value, .route-best-value {
          display: block;
          overflow: hidden;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .route-best-value { color: var(--healthy); padding-right: 24px; }
        .route-meta {
          grid-column: auto;
          display: flex;
          gap: 4px;
          color: var(--muted);
          font-size: 9px;
        }
        .route-meta strong { color: var(--text-soft); font-size: 10px; font-weight: 500; }
        .usage-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border-bottom: 1px solid var(--line);
          background: rgb(255 255 255 / 2%);
        }
        .usage-item { position: relative; min-width: 0; padding: 10px 11px 11px; }
        .usage-item + .usage-item { border-left: 1px solid var(--line-soft); }
        .usage-item small {
          display: block;
          margin-bottom: 3px;
          color: var(--muted);
          font-size: 8px;
          font-weight: 600;
        }
        .usage-item strong {
          display: block;
          overflow: hidden;
          color: var(--text);
          font-size: 12px;
          font-weight: 650;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .usage-item[data-spend-tone="approaching"] { background: var(--warning-soft); }
        .usage-item[data-spend-tone="approaching"] strong { color: var(--warning); }
        .usage-item[data-spend-tone="reached"] { background: var(--danger-soft); }
        .usage-item[data-spend-tone="reached"] strong { color: var(--danger); }
        .usage-item[data-spend-tone="approaching"]::after,
        .usage-item[data-spend-tone="reached"]::after {
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          width: var(--spend-progress);
          height: 1px;
          background: var(--warning);
          content: "";
        }
        .usage-item[data-spend-tone="reached"]::after { background: var(--danger); }
        .section { padding: 15px 16px; border-bottom: 1px solid var(--line); background: transparent; }
        .section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .section-title { margin: 0; color: var(--text); font-size: 11px; font-weight: 700; }
        .automation-bar, .protection-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 36px;
          border-top: 1px solid var(--line-soft);
        }
        .automation-bar { padding: 9px 0; flex-wrap: wrap; }
        .protection-bar { margin-bottom: 12px; padding: 9px 0; border-bottom: 1px solid var(--line-soft); }
        .automation-name { margin-right: auto; color: var(--text); font-size: 12px; font-weight: 600; }
        .strategy-select { width: 94px; height: 28px; flex: 0 0 auto; font-size: 10px; }
        .switch-mode-select { width: 118px; height: 28px; flex: 0 0 auto; font-size: 10px; }
        @media (max-width: 400px) {
          .automation-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
          .automation-bar select { width: 100%; min-width: 0; }
          .automation-bar .strategy-select { min-width: 106px; }
        }
        .toggle { display: inline-flex; align-items: center; margin: 0; cursor: pointer; }
        .toggle input { position: absolute; inline-size: 1px; block-size: 1px; opacity: 0; }
        .toggle-track {
          display: grid;
          align-items: center;
          width: 38px;
          height: 22px;
          padding: 2px;
          border: 1px solid var(--line-strong);
          border-radius: 11px;
          background: var(--surface-raised);
        }
        .toggle-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--muted); box-shadow: 0 2px 5px rgb(0 0 0 / 30%); transition: transform .2s cubic-bezier(.2, .8, .2, 1); }
        .toggle input:checked + .toggle-track { border-color: color-mix(in srgb, var(--healthy) 62%, transparent); background: color-mix(in srgb, var(--healthy) 78%, transparent); }
        .toggle input:checked + .toggle-track .toggle-thumb { transform: translateX(16px); background: #fff; }
        .toggle input:focus-visible + .toggle-track { outline: 2px solid var(--focus); outline-offset: 2px; }
        .protection-copy { display: grid; gap: 1px; min-width: 88px; margin-right: auto; }
        .protection-copy strong { color: var(--text-soft); font-size: 11px; font-weight: 600; }
        .protection-copy small { overflow: hidden; color: var(--muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
        .protection-copy small[data-tone="approaching"] { color: var(--warning); }
        .protection-copy small[data-tone="reached"] { color: var(--danger); }
        .spend-limit-field { display: flex; align-items: center; gap: 5px; margin: 0; white-space: nowrap; }
        .spend-limit-field span { color: var(--muted); font-size: 9px; }
        .spend-limit-field input { width: 76px; height: 28px; }
        .control-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.12fr) minmax(0, .88fr);
          gap: 9px;
        }
        .field { min-width: 0; }
        .field-wide { grid-column: 1 / -1; }
        label { display: block; margin-bottom: 4px; color: var(--muted); font-size: 10px; font-weight: 550; }
        .group-filter-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
        .group-filter-heading > label { margin: 0; }
        .filter-mode-select { width: 78px; height: 26px; font-size: 10px; }
        input[type="number"], input[type="text"], input[type="search"], select, .token-select-trigger {
          width: 100%;
          min-width: 0;
          height: 32px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--control);
          color: var(--text);
          padding: 0 8px;
          font-size: 11px;
          outline: none;
        }
        select option, select optgroup {
          background-color: var(--native-option-bg);
          color: var(--native-option-text);
        }
        input:hover, select:hover, .token-select-trigger:hover { border-color: var(--line-strong); }
        input:focus, select:focus, .token-select-trigger:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus); }
        input[type="checkbox"] { accent-color: var(--accent); }
        .token-select { position: relative; }
        .token-select-trigger {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 6px;
          text-align: left;
        }
        .token-select-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-count { color: var(--muted); font-size: 9px; }
        .chevron { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; transition: transform .14s ease; }
        .token-select-trigger[aria-expanded="true"] .chevron { transform: rotate(180deg); }
        .token-menu {
          position: absolute;
          z-index: 6;
          top: calc(100% + 4px);
          right: 0;
          left: 0;
          padding: 6px;
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: var(--menu);
          -webkit-backdrop-filter: blur(18px) saturate(145%);
          backdrop-filter: blur(18px) saturate(145%);
          box-shadow: var(--shadow-menu);
        }
        .model-select .token-menu { z-index: 6; }
        .group-filter-select .token-menu { z-index: 5; }
        .token-toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 5px; }
        .selector-search { width: 100%; min-width: 0; margin-bottom: 5px; }
        .selector-platform { width: 100%; min-width: 0; margin-bottom: 5px; }
        .candidate-filter-controls { display: grid; grid-template-columns: minmax(150px, 1.4fr) repeat(3, minmax(120px, .8fr)) minmax(120px, .8fr); gap: 7px; margin: 10px 12px; }
        .candidate-filter-controls > * { min-width: 0; }
        .candidate-filter-controls .selector-search, .candidate-filter-controls .selector-platform { margin-bottom: 0; }
        .selector-platform[hidden], .candidate-filter-controls[hidden], .selector-search[hidden], .selector-search-status[hidden] { display: none; }
        .selector-search-status { min-height: 14px; margin: 0 0 5px; color: var(--muted); font-size: 9px; line-height: 1.4; }
        .token-option[hidden], .manual-group-option[hidden], .candidate[hidden], .candidate.candidate-details[hidden] { display: none; }
        .text-button { border: 0; background: transparent; color: var(--accent); padding: 2px; font-size: 10px; }
        .text-button:hover { text-decoration: underline; text-underline-offset: 2px; }
        .text-button:disabled { cursor: wait; opacity: .45; text-decoration: none; }
        .token-list { max-height: 176px; overflow: auto; border: 1px solid var(--line-soft); border-radius: 7px; background: rgb(0 0 0 / 16%); }
        .token-option {
          display: flex;
          align-items: center;
          gap: 7px;
          min-height: 30px;
          margin: 0;
          padding: 5px 7px;
          border-bottom: 1px solid var(--line-soft);
          color: var(--text-soft);
          cursor: pointer;
        }
        .token-option:last-child { border-bottom: 0; }
        .token-option:hover { background: var(--surface-raised); color: var(--text); }
        .token-option span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-empty { padding: 7px; }
        details { margin-top: 12px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
        summary { min-height: 38px; padding: 10px 1px; color: var(--text-soft); font-size: 10px; font-weight: 650; cursor: pointer; }
        summary:hover { color: var(--text); }
        .grid { display: grid; }
        .advanced { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; padding: 0 0 9px; }
        .advanced label { display: flex; align-items: end; min-height: 23px; line-height: 1.25; }
        .actions { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 7px; margin-top: 10px; }
        .button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 34px;
          border: 1px solid var(--line-strong);
          border-radius: 8px;
          background: var(--control);
          color: var(--text-soft);
          padding: 6px 9px;
          font-size: 10px;
          font-weight: 600;
          transition: transform 100ms ease-out, background-color 140ms ease-out, border-color 140ms ease-out;
        }
        .button:hover { background: var(--surface-active); color: var(--text); }
        .button:active { transform: scale(.97); transition-duration: 80ms; }
        .button:disabled { cursor: wait; opacity: .45; transform: none; }
        .button-check { border-color: color-mix(in srgb, var(--accent) 50%, transparent); background: var(--accent-soft); color: color-mix(in srgb, var(--accent) 55%, var(--text)); }
        .button-check:hover { border-color: var(--text); background: var(--text); color: var(--canvas); }
        .button-route { border-color: var(--info); background: var(--info-soft); color: var(--info); }
        .button-route:hover { background: var(--accent); color: var(--accent-ink); }
        .button-manual { min-height: 28px; border-color: var(--line); background: transparent; color: var(--text-soft); }
        .button-primary { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); }
        .candidate-section { padding: 0 0 8px; }
        .candidate-section .section-head { margin: 0; padding: 12px 14px 10px; }
        .candidate-head, .candidate {
          display: grid;
          grid-template-columns: minmax(150px, 1.7fr) 70px minmax(130px, 1.3fr) 100px 100px 85px 84px;
          align-items: center;
          gap: 5px;
          min-height: 30px;
          font-size: 10px;
        }
        .candidate-head { padding: 0 12px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface-raised); color: var(--muted); font-size: 9px; font-weight: 650; }
        .candidate-head[hidden] { display: none; }
        .candidate { min-height: 44px; padding: 0 12px; border-bottom: 1px solid var(--line-soft); color: var(--text-soft); }
        .monitor-scope-panel { margin: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); }
        .monitor-scope-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; gap: 8px; margin: 10px 0; }
        .monitor-scope-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); max-height: min(380px, 45vh); overflow: auto; border: 1px solid var(--line); border-radius: 5px; background: var(--control); }
        .monitor-scope-option { display: flex; align-items: flex-start; gap: 9px; min-width: 0; padding: 9px 10px; border-bottom: 1px solid var(--line-soft); color: var(--text-soft); font-size: 11px; line-height: 1.4; }
        .monitor-scope-option input { flex: 0 0 auto; margin: 2px 0 0; accent-color: var(--accent); }
        .monitor-scope-option span { min-width: 0; overflow-wrap: anywhere; }
        .monitor-scope-option small { display: block; margin-top: 2px; color: var(--muted); font-size: 9px; }
        .scope-notice { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; align-items: center; margin: 10px 12px; padding: 12px; border: 1px solid var(--warning); border-radius: 6px; background: var(--warning-soft); color: var(--text-soft); font-size: 11px; line-height: 1.5; }
        .scope-notice[hidden] { display: none; }
        .scope-notice-list { grid-column: 1 / -1; display: grid; gap: 6px; }
        .scope-notice-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .scope-notice-item span { overflow-wrap: anywhere; }
        .scope-dialog { width: min(420px, calc(100vw - 28px)); max-height: min(560px, calc(100dvh - 28px)); padding: 0; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--panel-glass); color: var(--text); box-shadow: var(--shadow-panel); }
        .scope-dialog::backdrop { background: var(--dialog-backdrop); }
        .scope-dialog-content { display: grid; gap: 10px; padding: 18px; }
        .scope-dialog-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 7px; }
        .scope-dialog-actions > button[hidden] { display: none; }
        .scope-dialog-risk { margin: 0; padding: 10px; border: 1px solid var(--warning); border-radius: 5px; color: var(--warning); background: var(--warning-soft); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
        .scope-dialog-risk[hidden] { display: none; }
        .candidate-details-panel { padding: 0 12px 10px; border-bottom: 1px solid var(--line-soft); }
        .candidate-entry { min-width: 0; border-bottom: 1px solid var(--line-soft); }
        .candidate-entry[hidden], .monitor-scope-option[hidden] { display: none; }
        .candidate-row-v2 { display: grid; grid-template-columns: minmax(150px, 1.7fr) 70px minmax(130px, 1.3fr) 100px 100px 85px 84px; gap: 5px; align-items: center; min-height: 65px; padding: 10px 12px; font-size: 12px; }
        .candidate-row-v2 > * { min-width: 0; overflow-wrap: anywhere; }
        .candidate-row-v2 > :nth-child(n+2) { text-align: right; }
        .candidate-row-v2 small { display: block; margin-top: 3px; color: var(--muted); font-size: 10px; }
        .candidate-row-v2 strong { color: var(--text); font-weight: 650; }
        .candidate-row-v2 .candidate-row-switch { width: auto; height: 28px; padding: 0 9px; border-radius: 5px; }
        .candidate-row-v2 .candidate-status { display: inline-block; padding: 3px 6px; border: 1px solid var(--line); border-radius: 4px; font-size: 10px; }
        .candidate-entry[data-status="pass"] .candidate-status { color: var(--healthy); background: var(--healthy-soft); }
        .candidate-entry[data-status="fail"] .candidate-status { color: var(--danger); background: var(--danger-soft); }
        .candidate-entry[data-status="pending"] .candidate-status, .candidate-entry[data-status="stale"] .candidate-status { color: var(--warning); background: var(--warning-soft); }
        .candidate-inspection { margin: 0; border-top: 1px solid var(--line-soft); font-size: 11px; line-height: 1.6; }
        .candidate-inspection > summary { padding: 7px 12px; cursor: pointer; color: var(--muted); font-size: 10px; }
        .candidate-inspection[open] > summary { color: var(--accent); }
        .candidate-inspection > :not(summary) { margin: 0 12px 10px; overflow-wrap: anywhere; }
        .candidate-inspection dl { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 4px 12px; }
        .candidate-inspection dt { color: var(--muted); }
        .candidate-inspection dd { margin: 0; }
        .candidate-head button { border: 0; border-radius: 2px; background: transparent; padding: 8px 0; color: inherit; font: inherit; font-size: 10px; text-align: right; }
        .candidate-head > span:nth-child(n+2) { text-align: right; }
        .candidate-head button[aria-pressed="true"] { color: var(--accent); }
        .candidate-head button[aria-pressed="true"]::after { content: " ↓"; }
        .candidate-head button[aria-pressed="true"][data-sort-direction="ascending"]::after { content: " ↑"; }
        .algorithm-note { margin: 12px 0; padding: 12px 14px; border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 5px; background: var(--accent-soft); font-size: 12px; line-height: 1.6; }
        .algorithm-note p { margin: 4px 0 0; color: var(--text-soft); font-size: 11px; }
        .quality-settings-draft { margin: 16px 0; border: 1px solid var(--line); border-radius: 8px; padding: 16px; }
        .quality-weight-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .quality-settings-draft .settings-footer { flex-wrap: wrap; gap: 10px; }
        .quality-settings-draft .settings-footer > span { margin-right: auto; }
        .quality-settings-draft [data-invalid="true"] { color: var(--danger); }
        .quality-preview { white-space: pre-line; overflow-wrap: anywhere; margin: 12px 0; padding: 12px; border-radius: 6px; background: var(--surface); color: var(--text-soft); font-size: 12px; line-height: 1.75; }
        .quality-gain-field { margin-top: 14px; max-width: 280px; }
        .token-model-bindings { display: grid; gap: 12px; }
        .token-model-field { min-width: 0; padding: 12px; border: 1px solid var(--line-soft); border-radius: 6px; }
        .token-model-field label { overflow-wrap: anywhere; }
        .token-model-field small { display: block; margin-top: 6px; color: var(--muted); line-height: 1.6; }
        .quality-config-warning { padding: 10px 12px; color: var(--warning); border: 1px solid currentColor; border-radius: 6px; font-size: 12px; }
        @media (max-width: 640px) {
          .quality-weight-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .quality-settings-draft { padding: 12px; }
          .quality-gain-field { max-width: none; }
        }
        .panel[data-fullscreen="true"] { inset: 12px !important; width: calc(100vw - 24px); height: calc(100dvh - 24px); max-height: none; }
        .candidate-section > .selector-search-status { margin: 0 12px 10px; }
        .candidate-section > .text-button { margin: 10px 12px; }
        @media (max-width: 980px) and (min-width: 641px) {
          .candidate-filter-controls { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .candidate-head, .candidate-row-v2 { grid-template-columns: minmax(110px, 1.5fr) 54px minmax(90px, 1fr) 75px 75px 60px 68px; }
        }
        @media (max-width: 640px) {
          .candidate-head { display: none; }
          .candidate-filter-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .candidate-filter-controls > .selector-search { grid-column: 1 / -1; }
          .candidate-row-v2 { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; min-height: 0; padding: 12px; }
          .candidate-row-v2 > :nth-child(1) { grid-column: 1 / 3; }
          .candidate-row-v2 > :nth-child(3) { grid-column: 3 / 5; grid-row: 1; }
          .candidate-row-v2 > :nth-child(2) { grid-column: 1; grid-row: 2; text-align: left; }
          .candidate-row-v2 > :nth-child(4), .candidate-row-v2 > :nth-child(5), .candidate-row-v2 > :nth-child(6) { grid-row: 2; font-size: 11px; }
          .candidate-row-v2 > :nth-child(7) { grid-column: 1 / -1; text-align: right; }
          .candidate-row-v2 > :nth-child(2)::before { display: block; content: "倍率"; color: var(--muted); font-size: 9px; margin-bottom: 3px; }
          .candidate-row-v2 > :nth-child(4)::before { display: block; content: "1h 缓存"; color: var(--muted); font-size: 9px; margin-bottom: 3px; }
          .candidate-row-v2 > :nth-child(5)::before { display: block; content: "1h 成功率"; color: var(--muted); font-size: 9px; margin-bottom: 3px; }
          .candidate-row-v2 > :nth-child(6)::before { display: block; content: "1h TPS"; color: var(--muted); font-size: 9px; margin-bottom: 3px; }
          .candidate-inspection dl { grid-template-columns: 85px minmax(0, 1fr); }
          .panel[data-fullscreen="true"] { inset: 0 !important; width: 100vw; height: 100dvh; }
        }
        .candidate:last-child { border-bottom: 0; }
        .candidate:hover { background: var(--surface-raised); }
        .candidate > span:first-child { overflow: hidden; color: var(--text); text-overflow: ellipsis; white-space: nowrap; }
        .candidate-head > span:not(:first-child), .candidate > span:not(:first-child) { text-align: center; }
        .candidate-ok { background: transparent; }
        .candidate-off { color: var(--muted); }
        .candidate-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .candidate-name-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .candidate-name-with-media { gap: 6px; }
        .candidate-pelican {
          display: grid; place-items: center; flex: 0 0 28px; width: 28px; height: 28px;
          overflow: hidden; padding: 0; border: 1px solid var(--line-strong); border-radius: 4px;
          background: var(--surface-raised); color: var(--text-soft); font: inherit; font-size: 9px;
        }
        button.candidate-pelican { cursor: zoom-in; }
        button.candidate-pelican:hover { border-color: var(--accent); }
        button.candidate-pelican:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .candidate-pelican img { display: block; width: 100%; height: 100%; object-fit: contain; }
        .candidate-ratio { display: grid; justify-items: center; gap: 1px; line-height: 1.05; }
        .candidate-ratio small { color: var(--accent); font-size: 8px; font-weight: 650; }
        .candidate-ratio .candidate-price { color: var(--text-soft); font-size: 7px; font-weight: 550; }
        .candidate-off .candidate-ratio small { color: var(--muted); }
        .candidate-signal { width: 6px; height: 6px; flex: 0 0 auto; background: var(--warning); }
        .candidate-signal { border-radius: 50%; }
        .candidate-ok .candidate-signal { background: var(--healthy); }
        .candidate-warning .candidate-signal { background: var(--warning); }
        .health-value { position: relative; padding-bottom: 5px; }
        .health-value::after { position: absolute; right: 0; bottom: 1px; left: 0; width: var(--health); height: 1px; background: var(--healthy); content: ""; }
        .candidate-off .health-value::after { background: var(--warning); }
        .verdict { overflow: hidden; color: var(--warning); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .candidate-ok .verdict { color: var(--healthy); }
        .candidate-warning .verdict { color: var(--warning); }
        .secondary-details { margin: 0; border: 0; border-bottom: 1px solid var(--line); background: transparent; }
        .secondary-details > summary { padding: 9px 12px; }
        .secondary-details > div { padding: 0 12px 10px; }
        .token-result {
          display: grid;
          grid-template-columns: 6px minmax(80px, .8fr) minmax(58px, .6fr) minmax(110px, 1.2fr);
          align-items: center;
          gap: 7px;
          min-height: 30px;
          border-bottom: 1px solid var(--line-soft);
          color: var(--text-soft);
          font-size: 10px;
        }
        .token-result::before { width: 5px; height: 5px; background: var(--muted); content: ""; }
        .token-result-success::before { background: var(--healthy); }
        .token-result-warning::before { background: var(--warning); }
        .token-result-error::before { background: var(--danger); }
        .token-result:last-child { border-bottom: 0; }
        .token-result span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-result-success span:last-child { color: var(--healthy); }
        .token-result-warning span:last-child { color: var(--warning); }
        .token-result-error span:last-child { color: var(--danger); }
        .logs { display: grid; gap: 0; }
        .log { display: grid; grid-template-columns: 5px 56px 1fr; align-items: baseline; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line-soft); color: var(--muted); font-size: 10px; line-height: 1.4; }
        .log::before { width: 4px; height: 4px; background: currentColor; content: ""; }
        .log-success { color: var(--healthy); }
        .log-error { color: var(--danger); }
        .empty { padding: 8px 0; color: var(--muted); font-size: 10px; }
        .manual-dialog {
          width: min(380px, calc(100vw - 28px));
          max-height: min(680px, calc(100vh - 28px));
          border: 1px solid var(--line-strong);
          border-radius: 16px;
          background: var(--panel-glass);
          color: var(--text);
          padding: 0;
          box-shadow: var(--shadow-panel);
          -webkit-backdrop-filter: blur(24px) saturate(175%) contrast(108%);
          backdrop-filter: blur(24px) saturate(175%) contrast(108%);
        }
        .manual-dialog::backdrop { background: var(--dialog-backdrop); }
        .detection-image-dialog {
          width: min(1000px, calc(100vw - 24px)); max-height: calc(100dvh - 24px);
          padding: 16px; border: 1px solid var(--line-strong); border-radius: 12px;
          background: var(--menu); color: var(--text); pointer-events: auto;
          box-sizing: border-box; overflow: auto; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
        }
        .detection-image-dialog::backdrop { background: var(--dialog-backdrop); }
        .detection-image-dialog [hidden] { display: none; }
        .detection-image-dialog .dialog-header { align-items: flex-start; }
        .detection-image-dialog .dialog-title { min-width: 0; overflow-wrap: anywhere; }
        .detection-image-dialog .icon-button { flex: 0 0 32px; width: 32px; height: 32px; }
        .detection-image-body { display: grid; place-items: center; min-height: min(300px, 45vh); }
        .detection-image-body img { display: block; max-width: 100%; max-height: calc(100dvh - 160px); object-fit: contain; }
        .detection-image-status { color: var(--text-soft); }
        .detection-image-original { display: inline-block; margin-top: 12px; color: var(--accent); text-underline-offset: 3px; }
        .manual-group-list {
          display: grid;
          max-height: min(440px, calc(100vh - 190px));
          overflow: auto;
          border: 1px solid var(--line);
          border-radius: 9px;
          background: var(--control);
          scrollbar-color: var(--line-strong) transparent;
          scrollbar-width: thin;
        }
        .manual-group-option {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: start;
          gap: 8px;
          min-height: 44px;
          margin: 0;
          padding: 8px 9px;
          border-bottom: 1px solid var(--line-soft);
          color: var(--text);
          cursor: pointer;
        }
        .manual-group-option:last-child { border-bottom: 0; }
        .manual-group-option:hover { background: var(--surface-raised); }
        .manual-group-option:has(input:checked) { background: var(--accent-soft); }
        .manual-group-option input { margin: 3px 0 0; accent-color: var(--accent); }
        .manual-group-option span { display: grid; gap: 2px; min-width: 0; }
        .manual-group-option strong { overflow: hidden; font-size: 11px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
        .manual-group-option small { color: var(--muted); font-size: 9px; line-height: 1.45; }
        .manual-group-option-warning strong { color: var(--text-soft); }
        .manual-group-empty { padding: 18px 10px; text-align: center; }
        .settings-view .control-section { padding: 14px 16px; border-bottom: 0; }
        .settings-appearance {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 14px 0 0;
          padding: 12px 0;
          border-top: 1px solid var(--line-soft);
        }
        .settings-appearance-copy { display: grid; gap: 2px; min-width: 0; margin-right: auto; }
        .settings-appearance-copy strong { color: var(--text); font-size: 11px; font-weight: 650; }
        .settings-appearance-copy small { color: var(--muted); font-size: 9px; }
        .settings-appearance .theme-select { width: 104px; border-color: var(--line); background: var(--control); }
        .settings-appearance + .settings-appearance { margin-top: 0; }
        .model-detection-setting[hidden] { display: none; }
        .glass-transparency-control {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 36px;
          align-items: center;
          gap: 8px;
          width: 184px;
        }
        .glass-transparency-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--accent) 0 var(--glass-transparency), var(--line-strong) var(--glass-transparency) 100%);
          padding: 0;
          cursor: pointer;
        }
        .glass-transparency-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border: 2px solid var(--text);
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 2px 8px rgb(0 0 0 / 28%);
        }
        .glass-transparency-range::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border: 2px solid var(--text);
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 2px 8px rgb(0 0 0 / 28%);
        }
        .glass-transparency-range:focus-visible { outline: 2px solid var(--focus); outline-offset: 5px; box-shadow: none; }
        .glass-transparency-value { color: var(--text-soft); font-size: 10px; text-align: right; }
        .isolation-section { border-top: 1px solid var(--line); }
        .isolation-heading { align-items: flex-start; }
        .isolation-heading-copy { min-width: 0; }
        .isolation-heading .section-title { color: color-mix(in srgb, var(--warning) 78%, var(--text)); }
        .isolation-description { margin: 4px 0 0; color: var(--muted); font-size: 9px; line-height: 1.45; }
        .isolation-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        .isolation-list { display: grid; gap: 8px; }
        .isolation-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          min-height: 76px;
          padding: 11px 12px;
          border: 1px solid color-mix(in srgb, var(--warning) 24%, transparent);
          border-radius: 8px;
          background: rgb(3 5 7 / 30%);
          box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%);
        }
        .isolation-copy { min-width: 0; }
        .isolation-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .isolation-name strong { overflow: hidden; color: var(--text); font-size: 11px; font-weight: 630; text-overflow: ellipsis; white-space: nowrap; }
        .isolation-signal { background: var(--warning); }
        .isolation-meta { display: flex; align-items: center; gap: 7px; min-width: 0; margin-top: 7px; color: var(--muted); font-size: 9px; }
        .isolation-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .isolation-meta span + span { padding-left: 7px; border-left: 1px solid var(--line); }
        .isolation-meta .isolation-remaining { flex: 0 0 auto; color: var(--warning); }
        .isolation-unlock {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 32px;
          border: 1px solid color-mix(in srgb, var(--danger) 46%, transparent);
          border-radius: 7px;
          background: var(--danger-soft);
          color: color-mix(in srgb, var(--danger) 64%, var(--text));
          padding: 0 9px;
          font-size: 9px;
          font-weight: 650;
        }
        .isolation-unlock:hover { background: color-mix(in srgb, var(--danger) 17%, transparent); }
        .isolation-unlock:active { transform: scale(.96); }
        .isolation-unlock svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
        .isolation-empty { min-height: 58px; display: grid; place-items: center; border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); font-size: 9px; text-align: center; }
        .isolation-toast {
          position: absolute;
          z-index: 12;
          right: 14px;
          bottom: 14px;
          left: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 42px;
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: var(--menu);
          color: var(--text-soft);
          padding: 7px 9px 7px 12px;
          box-shadow: var(--shadow-menu);
          -webkit-backdrop-filter: blur(18px) saturate(170%);
          backdrop-filter: blur(18px) saturate(170%);
          font-size: 10px;
        }
        .isolation-toast[hidden] { display: none; }
        .isolation-toast::before { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: var(--healthy); content: ""; }
        .isolation-toast-message { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
        .isolation-toast button { border: 0; border-radius: 6px; background: var(--accent-soft); color: var(--accent); padding: 5px 8px; font-size: 10px; font-weight: 650; }
        .settings-footer {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 16px;
          border-top: 1px solid var(--line);
          background: var(--surface);
        }
        .settings-version { display: grid; gap: 2px; min-width: 0; margin-right: auto; }
        .settings-version strong { font-size: 10px; font-weight: 650; }
        .settings-version small { color: var(--muted); font-size: 9px; }
        .settings-update { min-width: 132px; }
        .dialog-form { padding: 13px; }
        .dialog-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .dialog-title { flex: 1; margin: 0; font-size: 12px; font-weight: 650; }
        .dialog-hint { min-height: 18px; margin: 6px 0 0; color: var(--muted); font-size: 10px; line-height: 1.45; }
        .dialog-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
        .panel {
          width: min(1160px, calc(100vw - 32px));
          height: min(790px, calc(100dvh - 32px));
          max-height: calc(100dvh - 24px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .work-nav { display: flex; flex-direction: column; gap: 4px; padding: 0 10px; }
        .work-nav button {
          border: 0;
          border-radius: 5px;
          background: transparent;
          color: var(--muted);
          font-size: 14px;
          font-weight: 550;
          transition: transform 100ms ease-out, background-color 140ms ease-out, color 140ms ease-out;
        }
        .work-nav { position: relative; isolation: isolate; }
        .work-nav button:hover { color: var(--text); background: var(--surface-raised); }
        .work-nav button:active { transform: scale(.97); transition-duration: 80ms; }
        .work-nav button[data-active="true"] { color: var(--accent); background: var(--accent-soft); font-weight: 650; }
        .nav-count { margin-left: 6px; color: inherit; font-size: 8px; font-variant-numeric: tabular-nums; opacity: .72; }
        .workspace { min-height: 0; flex: 1; overflow: auto; outline: none; scrollbar-color: var(--line-strong) transparent; scrollbar-width: thin; }
        .work-view[hidden] { display: none; }
        .work-view:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .work-view > .section:last-child { border-bottom: 0; }
        .view-intro { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 14px 10px; border-bottom: 1px solid var(--line-soft); }
        .view-intro h2 { margin: 0; color: var(--text); font-size: 13px; font-weight: 700; }
        .view-intro p { margin: 0; color: var(--muted); font-size: 9px; }
        .command-deck { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px 16px 10px; background: transparent; }
        .command-deck .button { min-height: 36px; }
        .command-deck .button-manual { background: transparent; }
        .monitor-auto-row { display: flex; align-items: center; gap: 9px; padding: 0 16px 12px; border-bottom: 1px solid var(--line); }
        .monitor-auto-copy { display: flex; align-items: baseline; gap: 9px; min-width: 0; margin-right: auto; }
        .monitor-auto-copy strong { color: var(--text); font-size: 11px; font-weight: 620; }
        .monitor-auto-copy span { overflow: hidden; color: var(--muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
        .route-summary { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); border-bottom: 1px solid var(--line); background: var(--surface); }
        .route-summary > div { display: grid; gap: 3px; padding: 10px 12px; min-width: 0; }
        .route-summary > div + div { border-left: 1px solid var(--line); }
        .route-summary small { color: var(--muted); font-size: 9px; font-weight: 600; }
        .route-summary strong { overflow: hidden; color: var(--text); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        .route-summary .recommendation strong { color: var(--accent); }
        .status { flex: 0 0 auto; }
        .monitor-candidates { padding-top: 0; }
        .section-meta { margin-left: auto; color: var(--muted); font-size: 9px; font-weight: 500; }
        .route-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0; border-bottom: 1px solid var(--line); }
        .route-grid > .section { border-bottom: 0; }
        .route-grid > .section + .section { border-left: 1px solid var(--line); }
        .route-grid .control-grid { grid-template-columns: 1fr; }
        .route-grid .protection-bar { margin-bottom: 0; }
        .diagnostics-grid { display: grid; grid-template-columns: 1fr; }
        .diagnostics-grid > .section { border-bottom: 0; }
        .diagnostics-grid > .section + .section { border-top: 1px solid var(--line); }
        .diagnostic-caption { margin: -3px 0 10px; color: var(--muted); font-size: 9px; }
        .diagnostic-list { min-height: 160px; max-height: 240px; overflow: auto; }
        .diagnostic-list .logs { padding-right: 2px; }
        .statistics-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
        .statistics-control { display: grid; gap: 5px; min-width: 0; }
        .statistics-control > span { color: var(--muted); font-size: 8px; font-weight: 650; }
        .statistics-control select { min-width: 0; height: 32px; padding: 0 28px 0 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--control); color: var(--text); font-size: 10px; }
        .statistics-refresh { min-width: 34px; min-height: 32px; align-self: end; }
        .statistics-source { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--line-soft); color: var(--muted); font-size: 8px; }
        .statistics-source strong { overflow: hidden; color: var(--text-soft); font-size: 9px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .statistics-summary { padding: 9px 14px; border-bottom: 1px solid var(--line-soft); color: var(--text-soft); font-size: 9px; line-height: 1.5; }
        .statistics-summary[data-tone="success"] { color: var(--healthy); background: var(--healthy-soft); }
        .statistics-summary[data-tone="warning"], .statistics-summary[data-tone="partial"] { color: var(--warning); background: var(--warning-soft); }
        .statistics-summary[data-tone="error"] { color: var(--danger); background: var(--danger-soft); }
        .statistics-summary[data-tone="unavailable"] { color: var(--muted); }
        .statistics-loading { height: 3px; overflow: hidden; background: var(--surface-raised); }
        .statistics-loading::before { display: block; width: var(--statistics-loading-progress, 0%); height: 100%; background: var(--accent); content: ""; }
        .statistics-overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--line); }
        .statistics-overview > div { display: grid; gap: 4px; min-width: 0; padding: 10px 12px; }
        .statistics-overview > div + div { border-left: 1px solid var(--line-soft); }
        .statistics-overview small { color: var(--muted); font-size: 8px; }
        .statistics-overview strong { overflow: hidden; color: var(--text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
        .statistics-overview strong[data-tone="error"] { color: var(--danger); }
        .statistics-overview strong[data-tone="partial"] { color: var(--warning); }
        .statistics-chart { min-height: 188px; padding: 4px 12px 10px; overflow-x: auto; scrollbar-color: var(--line-strong) transparent; scrollbar-width: thin; }
        .statistics-chart svg { display: block; width: 100%; height: auto; overflow: visible; }
        .statistics-chart:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .statistics-chart svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .statistics-chart-baseline { stroke: var(--line-strong); stroke-width: 1; }
        .statistics-chart-area { fill: var(--accent-soft); }
        .statistics-chart-line { fill: none; stroke: var(--accent); stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
        .statistics-chart-point { fill: var(--accent); stroke: var(--panel-glass); stroke-width: 1.5; }
        .statistics-chart-label { fill: var(--muted); font: 8px SFMono-Regular, Consolas, monospace; }
        .statistics-state { display: grid; align-content: center; justify-items: start; gap: 5px; min-height: 118px; padding: 18px; color: var(--muted); }
        .statistics-state strong { color: var(--text-soft); font-size: 10px; }
        .statistics-state span { font-size: 9px; line-height: 1.55; }
        .statistics-state-error strong { color: var(--danger); }
        .statistics-state-loading { animation: statistics-pulse 1.4s ease-in-out infinite alternate; }
        .statistics-key-list { min-height: 150px; max-height: 330px; overflow: auto; padding: 2px 14px 12px; scrollbar-color: var(--line-strong) transparent; scrollbar-width: thin; }
        .statistics-key-row { display: grid; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--line-soft); }
        .statistics-key-row:last-child { border-bottom: 0; }
        .statistics-key-heading { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
        .statistics-key-heading strong { overflow: hidden; color: var(--text); font-size: 9px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .statistics-key-heading span { margin-left: auto; color: var(--text-soft); font-size: 9px; }
        .statistics-key-track { height: 6px; overflow: hidden; border-radius: 999px; background: var(--surface-raised); box-shadow: inset 0 0 0 1px var(--line-soft); }
        .statistics-key-track > span { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
        .statistics-key-row-derived .statistics-key-track > span { background: var(--muted); }
        .statistics-key-row-derived .statistics-key-heading strong { color: var(--text-soft); }
        .statistics-key-row-error .statistics-key-track > span { background: var(--danger); }
        .statistics-key-row-error small { color: var(--danger); font-size: 8px; line-height: 1.4; }
        @keyframes statistics-pulse { from { opacity: .55; } to { opacity: 1; } }
        .settings-section { background: transparent; }
        .route-settings-advanced { min-width: 0; }
        @media (max-width: 520px) {
          .panel { inset: 0; width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; }
          .command-deck { grid-template-columns: 1fr 1fr; }
          .route-grid, .diagnostics-grid { grid-template-columns: 1fr; }
          .route-grid > .section + .section, .diagnostics-grid > .section + .section { border-top: 1px solid var(--line); border-left: 0; }
        }
        @media (max-width: 390px) {
          .work-nav button { font-size: 9px; }
          .candidate-filter-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .nav-count { display: none; }
          .statistics-toolbar { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
          .statistics-overview { grid-template-columns: 1fr; }
          .statistics-overview > div + div { border-top: 1px solid var(--line-soft); border-left: 0; }
          .route-summary { grid-template-columns: 1fr; }
          .route-summary > div + div { border-top: 1px solid var(--line); border-left: 0; }
        }
        @media (max-width: 520px) {
          .panel { inset: 0; width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; }
          .launcher { right: 10px; bottom: 10px; }
          .advanced { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .monitor-scope-list { grid-template-columns: 1fr; }
          .candidate-head { display: none; }
          .candidate { grid-template-columns: minmax(0, 1fr); gap: 6px; padding: 10px 12px; }
        }
        @media (max-width: 390px) {
          .header { gap: 6px; padding-inline: 9px; }
          .theme-select { width: 54px; padding-inline: 3px; }
          .glass-transparency-control { width: 156px; }
          .overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .route-primary { border-right: 1px solid var(--line); border-bottom: 0; }
          .route-node { min-height: 72px; padding: 11px 12px; }
          .usage-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .usage-item:nth-child(3) { border-left: 0; border-top: 1px solid var(--line-soft); }
          .usage-item:nth-child(4) { border-top: 1px solid var(--line-soft); }
          .protection-bar { flex-wrap: wrap; }
          .protection-copy { flex: 1 1 145px; }
          .control-grid { grid-template-columns: 1fr; }
          .field-wide { grid-column: auto; }
          .scope-notice { grid-template-columns: minmax(0, 1fr); }
          .scope-dialog-actions { grid-template-columns: 1fr; }
          .actions { grid-template-columns: 1fr; }
        }
        .candidate.candidate-details {
          display: grid; grid-template-columns: 26px minmax(0, 1fr); column-gap: 8px; row-gap: 3px;
          height: 48px; min-height: 48px; box-sizing: border-box;
          padding: 5px 10px; align-items: center;
        }
        .candidate-media { grid-column: 1; grid-row: 1 / span 2; min-width: 0; }
        .candidate-media .candidate-pelican { width: 26px; height: 26px; }
        .candidate-details[data-current="true"] { background: var(--accent-soft); }
        .candidate-heading { grid-column: 2; display: flex; align-items: center; gap: 5px; height: 17px; min-width: 0; }
        .candidate-heading .candidate-name { flex: 1; min-width: 0; color: var(--text); }
        .candidate-heading .candidate-name-label {
          display: block; max-width: 100%; padding: 0; border: 0; border-radius: 2px; background: transparent;
          color: inherit; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font: inherit; font-size: 12px; font-weight: 650; line-height: 17px; cursor: copy;
        }
        .candidate-heading .candidate-name-label:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .candidate-row-switch { flex: 0 0 34px; width: 34px; height: 20px; padding: 0; border: 1px solid var(--line); border-radius: 3px; background: var(--surface-raised); color: var(--accent); font: inherit; font-size: 10px; line-height: 18px; cursor: pointer; }
        .candidate-row-switch:hover:not(:disabled) { background: var(--accent-soft); }
        .candidate-row-switch:disabled { color: var(--text-soft); cursor: default; }
        .candidate-row-switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .candidate-current-tag { flex: 0 0 auto; padding: 1px 3px; border: 1px solid var(--accent); border-radius: 3px; color: var(--text); font-size: 8px; line-height: 1.2; }
        .candidate-heading .verdict { flex: 0 0 auto; max-width: 29%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; font-size: 10px; }
        .candidate-metrics, .candidate-column-labels {
          display: grid; grid-template-columns: 1.65fr 1fr 1fr 1.05fr .85fr 1fr;
          align-items: center; gap: 3px; margin: 0; font-variant-numeric: tabular-nums;
        }
        .candidate-metrics { grid-column: 2; min-width: 0; height: 15px; }
        .candidate-metric { min-width: 0; text-align: right; }
        .candidate-metric:first-child { text-align: left; }
        .candidate-metric dt { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
        .candidate-metric dd { margin: 0; overflow: hidden; text-overflow: ellipsis; font-size: 10px; line-height: 15px; white-space: nowrap; }
        .candidate-metrics .candidate-ratio { display: inline; color: var(--text-soft); font-size: 10px; }
        .candidate-metrics .health-value { display: inline; background: none; }
        .candidate-column-labels { padding: 5px 10px 5px 44px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); color: var(--text-soft); background: var(--surface-raised); font-size: 9px; line-height: 14px; }
        .candidate-column-labels > span { min-width: 0; text-align: right; white-space: nowrap; }
        .candidate-column-labels > span:first-child { text-align: left; }
        .settings-view > .section { padding: 16px; border-bottom: 1px solid var(--line); }
        .settings-view > .section:last-of-type { border-bottom: 0; }
        .settings-view .section-head { margin-bottom: 12px; }
        .settings-view .model-detection-setting { margin-top: 12px; padding-bottom: 0; }
        .settings-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
        .settings-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 20px; }
        .settings-label-row label { margin: 0; }
        .settings-label-row .text-button { flex-shrink: 0; padding: 0; font-size: 10px; }
        .settings-fields input, .settings-fields select { width: 100%; min-width: 0; }
        .settings-view .settings-billing-note { color: var(--text-soft); }
        .settings-disclosure { margin-top: 12px; border-top: 1px solid var(--line-soft); border-bottom: 0; }
        .settings-disclosure > summary { padding: 10px 0; color: var(--text-soft); cursor: pointer; font-size: 11px; }
        .settings-detail-content { display: grid; gap: 8px; padding-bottom: 4px; }
        .settings-protection .protection-bar { margin-bottom: 0; border-bottom: 0; }
        .settings-protection .route-settings-advanced { margin-top: 8px; border-bottom: 0; }
        .settings-protection .isolation-section { padding: 4px 0; border: 0; }
        .settings-secondary > .settings-appearance { margin: 0; border-top: 0; padding: 8px 0; }
        .settings-secondary .settings-footer { margin-top: 8px; padding: 12px 0 0; border-top: 1px solid var(--line-soft); }
        @media (max-width: 600px) { .settings-fields { grid-template-columns: minmax(0, 1fr); gap: 10px; } .monitor-scope-toolbar { grid-template-columns: minmax(0, 1fr) auto; } }
        .candidate-media-hint { margin: 0; padding: 6px 10px 0; border-top: 1px solid var(--line); color: var(--text-soft); font-size: 9px; }
        @media (max-width: 420px) {
          .candidate.candidate-details { padding-inline: 8px; column-gap: 6px; }
          .candidate-column-labels { padding-inline: 40px 8px; }
          .candidate-metrics, .candidate-column-labels { gap: 2px; }
          .candidate-heading .candidate-name-label { font-size: 11px; }
        }
        .settings-header { position: sticky; top: 0; z-index: 4; background: var(--native-option-bg); border-bottom: 1px solid var(--line); }
        .settings-heading { display: flex; align-items: center; gap: 12px; justify-content: space-between; padding: 14px 16px 8px; }
        .settings-heading h2 { margin: 0; font-size: 15px; }
        .settings-heading [role="status"] { min-width: 0; color: var(--muted); font-size: 10px; overflow-wrap: anywhere; text-align: right; }
        .settings-heading [data-invalid="true"] { color: var(--danger); }
        .settings-nav { display: flex; overflow-x: auto; padding: 0 12px; scrollbar-width: thin; }
        .settings-nav button { flex: 1 0 auto; min-height: 42px; padding: 8px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--text-soft); font-size: 11px; font-weight: 600; white-space: nowrap; }
        .settings-nav button[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
        :host([data-resolved-theme="light"]) .settings-nav button[aria-selected="true"] { color: var(--accent); }
        .settings-nav button:hover { background: var(--surface-active); }
        .settings-page[hidden], .settings-nav button[hidden] { display: none; }
        .settings-page > .section { padding: 16px; }
        .settings-page > .section > .section-head { margin-bottom: 14px; }
        .settings-page[data-settings-page="protection"] .settings-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .settings-subheading { margin: 24px 0 12px; font-size: 12px; }
        .settings-hint { margin: 10px 0; color: var(--text-soft); font-size: 11px; line-height: 1.6; }
        .settings-check-times { display: flex; flex-wrap: wrap; gap: 6px 18px; color: var(--muted); font-size: 10px; }
        .settings-check-times b { color: var(--text-soft); font-weight: 500; font-variant-numeric: tabular-nums; }
        .settings-count { margin-left: 8px; color: var(--muted); font-size: 10px; font-weight: 500; }
        .settings-page .field { min-width: 0; }
        .settings-page label { line-height: 1.5; }
        .settings-page input[aria-invalid="true"] { border-color: var(--danger); }
        .settings-page .settings-disclosure > summary { min-height: 42px; }
        .settings-page :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .status[data-tone="running"]::before { animation: status-breathe 2s ease-in-out infinite; }
        @keyframes status-breathe { 0%, 100% { opacity: .65; transform: scale(.92); outline: 0 solid var(--warning-soft); } 50% { opacity: 1; transform: scale(1.08); outline: 4px solid var(--warning-soft); } }
        /* The approved workbench keeps navigation fixed beside one scrolling content area. */
        .panel { width: min(1160px, calc(100vw - 32px)); height: min(790px, calc(100dvh - 32px)); font-size: 14px; line-height: 1.45; }
        .header { position: relative; flex: 0 0 auto; min-height: 60px; gap: 12px; padding: 10px 20px; background: var(--surface); }
        .header-copy { display: flex; align-items: center; gap: 16px; }
        .title { font-size: 16px; font-weight: 700; }
        .brand-meta { gap: 8px; border-left: 1px solid var(--line); padding-left: 16px; }
        .brand-mark { border: 0; border-radius: 7px; background: var(--accent-soft); color: var(--accent); }
        .launcher, .token-menu, .manual-dialog, .isolation-toast { -webkit-backdrop-filter: none; backdrop-filter: none; }
        .workbench-body { display: grid; grid-template-columns: 186px minmax(0, 1fr); flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
        .work-sidebar { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; padding: 22px 0 14px; border-right: 1px solid var(--line); background: var(--surface-raised); }
        .sidebar-heading { display: grid; gap: 14px; padding: 0 19px; }
        .sidebar-heading strong { font-size: 12px; font-weight: 650; }
        .sidebar-heading > span { color: var(--muted); font-size: 11px; }
        .work-nav button { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; min-height: 42px; padding: 9px 10px; text-align: left; }
        .nav-icon { display: inline-grid; place-items: center; width: 18px; flex: 0 0 18px; font-size: 17px; line-height: 1; }
        .nav-text { min-width: 0; }
        .nav-count { margin-left: auto; font-size: 11px; opacity: 1; }
        .sidebar-caption { margin: auto 18px 0; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; line-height: 1.7; overflow-wrap: anywhere; }
        .work-content { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; background: var(--surface); }
        .status { min-width: 0; min-height: 34px; padding: 7px 24px; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
        .status::before { width: 6px; height: 6px; box-shadow: none; }
        :host([data-resolved-theme="light"]) .status::before { box-shadow: none; }
        .workspace { min-width: 0; width: 100%; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
        .work-view { min-width: 0; }
        .view-heading, .view-intro { display: flex; align-items: flex-start; gap: 16px; padding: 17px 24px 13px; border: 0; }
        .heading-copy { min-width: 0; }
        .eyebrow { margin: 0 0 4px; color: var(--muted); font-size: 11px; font-weight: 600; }
        .view-heading h2, .view-intro h2, .settings-heading h2 { margin: 0; color: var(--text); font-size: 24px; font-weight: 720; line-height: 1.25; letter-spacing: -.5px; }
        .subhead, .view-intro p { max-width: 65ch; margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
        .view-intro { flex-direction: column; gap: 0; }
        .monitor-overview { display: grid; grid-template-columns: minmax(0, 1fr) 244px; align-items: stretch; gap: 16px; margin: 0 24px 16px; }
        .overview { min-width: 0; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-raised); overflow: hidden; }
        .route-node { min-height: 88px; padding: 12px 14px; align-content: center; gap: 5px; }
        .metric-label { font-size: 12px; font-weight: 500; }
        .route-value, .route-best-value { font-family: inherit; font-size: 18px; font-weight: 650; line-height: 1.4; }
        .route-best-value { color: var(--accent); }
        .route-recommendation-meta { min-width: 0; overflow: hidden; color: var(--muted); font-size: 11px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .route-apply { top: 10px; right: 10px; }
        .monitor-controls { display: grid; align-content: space-between; gap: 9px; min-width: 0; padding: 1px 0; }
        .route-meta { gap: 6px; font-size: 11px; }
        .route-meta strong { font-size: 11px; }
        .command-deck { gap: 7px; padding: 0; }
        .command-deck .button { min-height: 34px; border-radius: 5px; font-size: 12px; }
        .command-deck .button-check { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); }
        .command-deck .button-manual { border-color: var(--line-strong); background: var(--surface); color: var(--text); }
        .monitor-auto-row { gap: 8px; padding: 0; border: 0; }
        .monitor-auto-copy { flex-direction: column; align-items: flex-start; gap: 1px; }
        .monitor-auto-copy strong { font-size: 12px; }
        .monitor-auto-copy span { max-width: 185px; font-size: 11px; }
        .usage-strip { margin: 0 24px 18px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); overflow: hidden; }
        .usage-item { padding: 11px 15px 12px; }
        .usage-item small { margin-bottom: 5px; font-size: 12px; font-weight: 500; }
        .usage-item strong { font-size: 20px; line-height: 1.2; font-weight: 650; }
        .section { padding: 18px 24px; }
        .section-title { font-size: 15px; font-weight: 650; }
        .section-meta { font-size: 11px; }
        .monitor-candidates { padding-top: 0; }
        .monitor-candidates .section-head { min-height: 24px; margin-bottom: 10px; padding: 0; }
        .candidate-filter-controls { grid-template-columns: minmax(145px, 1.55fr) repeat(4, minmax(0, 1fr)); gap: 7px; margin: 0 0 8px; }
        .candidate-filter-controls input, .candidate-filter-controls select { min-width: 0; width: 100%; height: 34px; border-radius: 5px; font-size: 11px; }
        .candidate-section > .selector-search-status { margin: 0 0 10px; font-size: 11px; line-height: 1.5; }
        .candidate-head, .candidate-row-v2 { grid-template-columns: minmax(140px, 1.7fr) 58px minmax(110px, 1.3fr) 78px 80px 60px 78px; gap: 7px; }
        .candidate-head { min-height: 35px; padding: 0 10px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface-raised); font-size: 11px; }
        .candidate-head button { font-size: 11px; }
        .candidate-row-v2 { min-height: 58px; padding: 9px 10px 5px; font-size: 12px; }
        .candidate-row-v2 strong { font-size: 13px; }
        .candidate-row-v2 small { font-size: 10px; line-height: 1.35; }
        .candidate-entry[data-current="true"] { background: color-mix(in srgb, var(--accent-soft) 45%, var(--surface)); }
        .candidate-entry:hover { background: var(--surface-raised); }
        .candidate-inspection { border-top: 0; }
        .candidate-inspection > summary { min-height: 0; padding: 2px 10px 7px; font-size: 10px; line-height: 1.4; }
        .candidate-inspection[open] > summary { padding-bottom: 10px; }
        .candidate-inspection > :not(summary) { font-size: 12px; }
        .scope-notice { margin: 0 24px 16px; font-size: 12px; }
        .scope-notice-item { flex-wrap: wrap; }
        .settings-header { background: var(--surface); }
        .settings-heading { align-items: flex-start; padding: 21px 24px 16px; }
        .settings-heading [role="status"] { padding-top: 8px; font-size: 12px; }
        .settings-nav { padding: 0 16px; gap: 5px; }
        .settings-nav button { flex: 0 0 auto; min-height: 43px; padding: 8px 12px; font-size: 13px; }
        .settings-page > .section { padding: 20px 24px; }
        .settings-page label, .settings-label-row label { font-size: 13px; }
        .settings-page input, .settings-page select, .token-select-trigger { min-width: 0; font-size: 13px; }
        .settings-hint, .algorithm-note p, .settings-detail-content, .settings-disclosure > summary { font-size: 12px; line-height: 1.65; }
        .settings-subheading, .automation-name { font-size: 14px; }
        .settings-fields, .control-grid { gap: 16px; }
        .monitor-scope-panel { margin: 12px 0 0; padding: 14px; background: var(--surface-raised); }
        .monitor-scope-option { font-size: 12px; }
        .monitor-scope-option small { font-size: 11px; }
        .settings-page .button, .settings-update { font-size: 12px; }
        .statistics-toolbar, .statistics-source, .statistics-summary { padding-inline: 24px; }
        .statistics-control > span, .statistics-source, .statistics-source strong, .statistics-summary, .statistics-overview small { font-size: 12px; }
        .statistics-control select { height: 36px; font-size: 13px; border-radius: 5px; }
        .statistics-overview { margin: 16px 24px 0; border: 1px solid var(--line); border-radius: 7px; }
        .statistics-overview > div { padding: 13px 16px; }
        .statistics-overview strong { font-size: 20px; }
        .statistics-chart { min-height: 210px; }
        .statistics-key-heading strong, .statistics-key-heading span, .diagnostic-caption { font-size: 12px; }
        .diagnostic-list { min-height: 180px; max-height: none; }
        .empty { padding: 28px 16px; font-size: 13px; line-height: 1.7; }
        @media (max-width: 1050px) and (min-width: 701px) {
          .workbench-body { grid-template-columns: 166px minmax(0, 1fr); }
          .monitor-overview { grid-template-columns: minmax(0, 1fr) 218px; gap: 12px; }
          .route-node { padding-inline: 12px; }
          .route-value, .route-best-value { font-size: 16px; }
          .candidate-head, .candidate-row-v2 { grid-template-columns: minmax(110px, 1.5fr) 48px minmax(90px, 1.2fr) 65px 65px 50px 65px; gap: 5px; }
          .candidate-head, .candidate-head button { font-size: 10px; }
        }
        @media (max-width: 900px) {
          .monitor-overview { grid-template-columns: minmax(0, 1fr); }
          .monitor-controls { grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; align-items: center; }
          .monitor-controls > .route-meta { grid-column: 1; }
          .monitor-controls > .command-deck { grid-column: 2; grid-row: 1 / span 2; }
          .monitor-controls > .monitor-auto-row { grid-column: 1; }
          .monitor-auto-copy span { max-width: 155px; }
          .candidate-filter-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .candidate-filter-controls > .selector-search { grid-column: 1 / -1; }
          .candidate-head { display: none; }
          .candidate-row-v2 { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 6px; padding: 12px 10px 8px; }
          .candidate-row-v2 > :nth-child(1) { grid-column: 1 / 3; }
          .candidate-row-v2 > :nth-child(3) { grid-column: 3 / 5; grid-row: 1; }
          .candidate-row-v2 > :nth-child(2) { grid-column: 1; grid-row: 2; text-align: left; }
          .candidate-row-v2 > :nth-child(4), .candidate-row-v2 > :nth-child(5), .candidate-row-v2 > :nth-child(6) { grid-row: 2; font-size: 12px; }
          .candidate-row-v2 > :nth-child(7) { grid-column: 1 / -1; text-align: right; }
          .candidate-row-v2 > :nth-child(2)::before, .candidate-row-v2 > :nth-child(4)::before, .candidate-row-v2 > :nth-child(5)::before, .candidate-row-v2 > :nth-child(6)::before { display: block; margin-bottom: 3px; color: var(--muted); font-size: 10px; }
          .candidate-row-v2 > :nth-child(2)::before { content: "倍率"; }
          .candidate-row-v2 > :nth-child(4)::before { content: "1h 缓存"; }
          .candidate-row-v2 > :nth-child(5)::before { content: "1h 成功率"; }
          .candidate-row-v2 > :nth-child(6)::before { content: "1h TPS"; }
        }
        @media (max-width: 700px) {
          .panel { inset: 0; width: 100vw; height: 100dvh; max-height: 100dvh; border: 0; border-radius: 0; }
          .header { min-height: 56px; gap: 8px; padding: 9px 12px; }
          .header-copy { display: grid; gap: 2px; }
          .title { font-size: 14px; }
          .brand-meta { padding: 0; border: 0; }
          .version { font-size: 10px; }
          .brand-mark { width: 31px; height: 31px; }
          .workbench-body { grid-template-columns: 56px minmax(0, 1fr); }
          .work-sidebar { padding-block: 12px; gap: 0; }
          .sidebar-heading, .sidebar-caption, .nav-text, .nav-count { display: none; }
          .work-nav { padding: 0 6px; gap: 8px; }
          .work-nav button { min-height: 42px; justify-content: center; padding: 8px 0; }
          .nav-icon { font-size: 20px; }
          .status { padding: 7px 14px; font-size: 11px; }
          .view-heading, .view-intro { padding: 18px 14px 15px; }
          .view-heading h2, .view-intro h2, .settings-heading h2 { font-size: 22px; }
          .subhead, .view-intro p { font-size: 12px; }
          .monitor-overview { margin: 0 14px 14px; gap: 12px; }
          .overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .route-node { min-height: 72px; padding: 12px; gap: 5px; }
          .route-primary { border-right: 0; border-bottom: 1px solid var(--line); }
          .route-value, .route-best-value { font-size: 16px; }
          .monitor-controls { grid-template-columns: minmax(0, 1fr); gap: 10px; }
          .monitor-controls > .route-meta, .monitor-controls > .command-deck, .monitor-controls > .monitor-auto-row { grid-column: 1; grid-row: auto; }
          .monitor-auto-copy { flex-direction: row; align-items: baseline; gap: 6px; }
          .monitor-auto-copy span { max-width: 118px; font-size: 10px; }
          .usage-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0 14px 18px; }
          .usage-item { padding: 11px 12px; }
          .usage-item strong { font-size: 18px; }
          .usage-item:nth-child(3) { border-left: 0; border-top: 1px solid var(--line-soft); }
          .usage-item:nth-child(4) { border-top: 1px solid var(--line-soft); }
          .section, .settings-page > .section { padding: 17px 14px; }
          .monitor-candidates { padding-top: 0; }
          .section-head { flex-wrap: wrap; gap: 5px 8px; }
          .section-title { font-size: 14px; }
          .section-meta { font-size: 10px; }
          .candidate-row-v2 .candidate-status { max-width: 100%; font-size: 10px; }
          .candidate-inspection > summary { overflow-wrap: anywhere; }
          .candidate-inspection dl { grid-template-columns: minmax(0, 1fr); }
          .scope-notice { grid-template-columns: minmax(0, 1fr); margin: 0 14px 14px; }
          .settings-heading { gap: 8px; padding: 18px 14px 14px; }
          .settings-heading [role="status"] { max-width: 75px; font-size: 11px; }
          .settings-nav { padding: 0 6px; }
          .settings-nav button { padding: 8px 10px; font-size: 12px; }
          .settings-fields, .control-grid, .settings-page[data-settings-page="protection"] .settings-fields { grid-template-columns: minmax(0, 1fr); }
          .monitor-scope-panel { padding: 10px; }
          .monitor-scope-list { grid-template-columns: minmax(0, 1fr); }
          .monitor-scope-toolbar { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
          .monitor-scope-toolbar > input { grid-column: 1 / -1; }
          .settings-footer { flex-wrap: wrap; gap: 10px; }
          .settings-update { min-width: 0; }
          .statistics-toolbar, .statistics-source, .statistics-summary { padding-inline: 14px; }
          .statistics-toolbar { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
          .statistics-source { flex-wrap: wrap; }
          .statistics-overview { grid-template-columns: minmax(0, 1fr); margin-inline: 14px; }
          .statistics-overview > div + div { border-left: 0; border-top: 1px solid var(--line-soft); }
          .statistics-chart { min-height: 150px; padding-inline: 0; }
          .statistics-key-list { padding-inline: 0; }
          .diagnostic-list { min-height: 140px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dot, .status[data-tone="running"]::before { animation: none !important; }
          *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation-duration: .001ms !important; }
        }
        @media (prefers-reduced-transparency: reduce) {
          .panel, .launcher, .header, .work-nav, .token-menu, .manual-dialog, .isolation-toast {
            -webkit-backdrop-filter: none;
            backdrop-filter: none;
          }
          .panel, .launcher, .manual-dialog, .isolation-toast, .token-menu {
            background: #171a1f;
          }
          :host([data-resolved-theme="light"]) .panel,
          :host([data-resolved-theme="light"]) .launcher,
          :host([data-resolved-theme="light"]) .manual-dialog,
          :host([data-resolved-theme="light"]) .isolation-toast,
          :host([data-resolved-theme="light"]) .token-menu { background: #f1f4f6; }
        }
        @media (prefers-contrast: more) {
          .panel, .manual-dialog { border-color: var(--text-soft); }
          .work-nav button[data-active="true"], input, select, .token-select-trigger { border-color: var(--line-strong); }
          .header, .work-nav { background: var(--surface); }
        }
        @media (forced-colors: active) {
          .panel, .launcher, .manual-dialog, .token-menu, .manual-group-list { background: Canvas; color: CanvasText; forced-color-adjust: auto; }
          select option, select optgroup { background-color: Canvas; color: CanvasText; }
          .token-option, .manual-group-option, .manual-group-option small { color: CanvasText; }
          .manual-group-option:has(input:checked) { outline: 2px solid Highlight; outline-offset: -2px; }
        }
      </style>

      <button class="launcher" type="button" title="打开 ${SITE_LABEL} 分组监控" hidden>${SITE_SHORT_LABEL}</button>
      <section class="panel" aria-label="${SITE_LABEL} 分组工作台">
        <header class="header" data-ref="header">
          <span class="brand-mark" aria-hidden="true">${SITE_SHORT_LABEL}</span>
          <span class="header-copy">
            <span class="header-title-row">
              <span class="title">${SITE_LABEL} 分组工作台</span>
              <span class="update-badge" data-ref="updateBadge" role="status" aria-live="polite" title="" hidden>NEW</span>
            </span>
            <span class="brand-meta"><span class="dot" data-ref="statusDot" title="监控状态"></span><span class="version" data-ref="version" title="当前插件版本">v${SCRIPT_VERSION}</span></span>
          </span>
          <button class="icon-button" data-ref="fullscreen" type="button" title="全屏工作台" aria-label="全屏工作台" aria-pressed="false">⛶</button>
          <button class="icon-button" data-ref="collapse" type="button" title="收起" aria-label="收起">−</button>
        </header>
        <div class="workbench-body">
        <aside class="work-sidebar" aria-label="分组工作台导航">
          <div class="sidebar-heading"><strong>${SITE_LABEL} 分组工作台</strong><span>工作区</span></div>
          <nav class="work-nav" aria-label="插件工作区" role="tablist" aria-orientation="vertical">
            <button id="kf-tab-monitor" data-view-target="monitor" data-active="true" role="tab" aria-label="监控" aria-controls="kf-view-monitor" aria-selected="true" type="button"><span class="nav-icon" aria-hidden="true">▤</span><span class="nav-text">分组监控</span><span class="nav-count" data-ref="candidateCount">0</span></button>
            <button id="kf-tab-statistics" data-view-target="statistics" data-active="false" role="tab" aria-label="统计" aria-controls="kf-view-statistics" aria-selected="false" type="button"><span class="nav-icon" aria-hidden="true">▥</span><span class="nav-text">用量统计</span></button>
            <button id="kf-tab-diagnostics" data-view-target="diagnostics" data-active="false" role="tab" aria-label="诊断" aria-controls="kf-view-diagnostics" aria-selected="false" type="button"><span class="nav-icon" aria-hidden="true">⌁</span><span class="nav-text">诊断记录</span><span class="nav-count" data-ref="logCount">0</span></button>
            <button id="kf-tab-settings" data-view-target="settings" data-active="false" role="tab" aria-label="设置" aria-controls="kf-view-settings" aria-selected="false" type="button"><span class="nav-icon" aria-hidden="true">⚙</span><span class="nav-text">偏好设置</span></button>
          </nav>
          <p class="sidebar-caption">监控范围决定参与检查的分组；列表筛选只改变显示。</p>
        </aside>
        <div class="work-content">
        <div class="status" data-ref="status" role="status" aria-live="polite"></div>
        <main class="workspace" data-ref="workspace">
        <section class="work-view" id="kf-view-monitor" data-view="monitor" role="tabpanel" aria-labelledby="kf-tab-monitor" tabindex="0">
        <div class="view-heading"><div class="heading-copy"><p class="eyebrow">分组监控</p><h2>运行概览</h2><p class="subhead">按所选目标模型的检测详情查看 1h 指标和自动切换准入。</p></div></div>
        <div class="monitor-overview">
        <section class="overview" aria-label="当前分组概览">
          <div class="route-primary route-node">
            <span class="metric-label">当前分组</span>
            <strong class="route-value" data-ref="currentGroup">-</strong>
          </div>
          <div class="route-best route-node">
            <span class="metric-label">策略推荐</span>
            <strong class="route-best-value" data-ref="bestGroup">-</strong>
            <span class="route-recommendation-meta" data-ref="bestGroupMeta">等待检查</span>
            <button class="icon-button route-apply" data-ref="switchNow" type="button" title="立即切到策略推荐分组" aria-label="立即切到策略推荐分组">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"></path><path d="M4 20 21 3"></path><path d="M21 16v5h-5"></path><path d="m15 15 6 6"></path><path d="M4 4l5 5"></path></svg>
            </button>
          </div>
        </section>
        <div class="monitor-controls">
        <span class="route-meta">上次检查 <strong data-ref="lastCheck">-</strong></span>
        <div class="command-deck" aria-label="常用操作">
          <button class="button button-check" data-ref="check" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>
            立即检查
          </button>
          <button class="button button-manual" data-ref="manualSwitch" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 3-4 4 4 4"></path><path d="M4 7h16"></path><path d="m16 21 4-4-4-4"></path><path d="M20 17H4"></path></svg>
            手动切换
          </button>
        </div>
        <div class="monitor-auto-row">
          <span class="monitor-auto-copy"><strong>自动切换</strong><span data-ref="monitorMode">1h 综合质量</span></span>
          <label class="toggle" for="kf-monitor-enabled" title="自动切换">
            <input id="kf-monitor-enabled" data-ref="monitorEnabled" type="checkbox" aria-label="自动切换">
            <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
          </label>
        </div>
        </div>
        </div>
        <section class="scope-notice" data-ref="currentScopeWarning" role="status" aria-live="polite" hidden>
          <span>当前分组未纳入监控。该密钥的自动检查和切换已暂停；可加入监控范围，或从插件选择中移除密钥。</span>
          <button class="text-button" type="button" data-ref="removeOutOfScopeToken">移除密钥选择</button>
          <div class="scope-notice-list" data-ref="outOfScopeTokenList"></div>
        </section>
        <section class="usage-strip" aria-label="账户与今日用量">
          <div class="usage-item"><small>余额</small><strong class="mono" data-ref="balance">-</strong></div>
          <div class="usage-item" data-ref="todaySpendItem" data-spend-tone="none"><small>今日消费</small><strong class="mono" data-ref="todaySpend">-</strong></div>
          <div class="usage-item"><small>今日请求</small><strong class="mono" data-ref="todayRequests">-</strong></div>
          <div class="usage-item"><small>今日 Token</small><strong class="mono" data-ref="todayTokens">-</strong></div>
        </section>
        <section class="section candidate-section monitor-candidates">
          <div class="section-head"><h2 class="section-title">分组状态</h2><span class="section-meta" data-ref="candidateSummary">等待检查</span></div>
          <div class="candidate-filter-controls" ${IS_AIHUB ? "" : "hidden"}>
            <input class="selector-search" data-ref="candidateSearch" data-selector-search type="search" placeholder="搜索分组或模型" aria-label="搜索分组或模型" autocomplete="off" ${IS_AIHUB ? "" : "hidden"}>
            <select class="selector-platform" data-ref="candidatePlatform" aria-label="按平台筛选" ${IS_AIHUB ? "" : "hidden"}><option value="">全部平台</option></select>
            <select data-ref="candidateAvailabilityFilter" aria-label="按可用状态筛选"><option value="">全部可用状态</option><option value="available">可用</option><option value="unavailable">不可用</option></select>
            <select data-ref="candidateStatus" aria-label="检测状态筛选"><option value="">全部检测状态</option><option value="pass">检测通过</option><option value="fail">检测失败</option><option value="pending">检测中</option><option value="stale">数据过期</option><option value="notmatch">本轮不参与</option><option value="unknown">未知</option><option value="outscope">未纳入监控</option></select>
            <select data-ref="candidateSort" aria-label="分组列表排序"><option value="quality">综合推荐</option><option value="ratio">倍率：低到高</option><option value="success">1h 成功率：高到低</option><option value="cache">1h 缓存命中：高到低</option><option value="tps">1h TPS：高到低</option></select>
          </div>
          <p class="selector-search-status" data-ref="candidateSearchStatus" role="status" ${IS_AIHUB ? "" : "hidden"}></p>
          <div class="candidate-head" ${IS_AIHUB ? "" : "hidden"}>
            <span>分组 / 平台</span><button type="button" data-candidate-sort="ratio">倍率</button><span>模型检测详情</span><button type="button" data-candidate-sort="cache">1h 缓存命中</button><button type="button" data-candidate-sort="success">1h 成功率</button><button type="button" data-candidate-sort="tps">1h TPS</button><span>操作</span>
          </div>
          <div data-ref="candidateRows"></div>
          <button class="text-button" data-ref="candidateResetFilters" type="button" hidden>清除筛选</button>
        </section>
        </section>
        <section class="work-view" id="kf-view-statistics" data-view="statistics" role="tabpanel" aria-labelledby="kf-tab-statistics" tabindex="0" hidden>
          <div class="view-intro">
            <h2>用量统计</h2>
            <p>当前站点的真实账单趋势</p>
          </div>
          <div class="statistics-toolbar">
            <label class="statistics-control">
              <span>指标</span>
              <select data-ref="statisticsMetric" aria-label="统计指标">
                <option value="spend">实际消费</option>
                <option value="requests">请求数</option>
                <option value="tokens">Token</option>
              </select>
            </label>
            <label class="statistics-control">
              <span>范围</span>
              <select data-ref="statisticsDays" aria-label="统计日期范围">
                <option value="today">今天</option>
                <option value="yesterday">昨天</option>
                <option value="7">最近 7 天</option>
                <option value="14">最近 14 天</option>
                <option value="30">最近 30 天</option>
              </select>
            </label>
            <button class="icon-button statistics-refresh" data-ref="statisticsRefresh" type="button" title="刷新统计" aria-label="刷新统计">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>
            </button>
          </div>
          <div class="statistics-source"><strong data-ref="statisticsSource">AIHub 账单 · USD</strong><span data-ref="statisticsUpdated">尚未读取</span></div>
          <div class="statistics-loading" data-ref="statisticsLoading" hidden aria-hidden="true"></div>
          <div class="statistics-summary" data-ref="statisticsSummary" data-tone="idle" role="status" aria-live="polite">点击刷新读取统计</div>
          <section class="statistics-overview" aria-label="统计对账概览">
            <div><small>账户总量</small><strong class="mono" data-ref="statisticsTotal">-</strong></div>
            <div><small>当前密钥合计</small><strong class="mono" data-ref="statisticsAssigned">-</strong></div>
            <div><small>密钥覆盖率</small><strong class="mono" data-ref="statisticsCoverage">-</strong></div>
          </section>
          <section class="section">
            <div class="section-head"><h3 class="section-title">每日趋势</h3><span class="section-meta" data-ref="statisticsTrendSummary">等待数据</span></div>
            <div class="statistics-chart" data-ref="statisticsTrend"></div>
          </section>
          <section class="section">
            <div class="section-head"><h3 class="section-title">每个密钥使用度</h3><span class="section-meta">全部当前密钥</span></div>
            <div class="statistics-key-list" data-ref="statisticsKeyRows"></div>
          </section>
        </section>
        <section class="work-view settings-view" id="kf-view-settings" data-ref="settingsSection" data-view="settings" role="tabpanel" aria-labelledby="kf-tab-settings" tabindex="0" hidden>
          <div class="settings-header">
            <div class="settings-heading"><div class="heading-copy"><p class="eyebrow">偏好设置</p><h2>设置</h2><p class="subhead">管理监控范围、自动切换、检测保护与界面偏好。</p></div><span data-ref="settingsSave" role="status">已保存</span></div>
            <nav class="settings-nav" role="tablist" aria-label="设置分类">
              <button id="kf-settings-routing" data-settings-target="routing" role="tab" aria-controls="kf-settings-page-routing" aria-selected="false" tabindex="-1" type="button">自动切换</button>
              <button id="kf-settings-protection" data-settings-target="protection" role="tab" aria-controls="kf-settings-page-protection" aria-selected="false" tabindex="-1" type="button">检测保护</button>
              <button id="kf-settings-spending" data-settings-target="spending" role="tab" aria-controls="kf-settings-page-spending" aria-selected="false" tabindex="-1" type="button">消费提醒</button>
              <button id="kf-settings-appearance" data-settings-target="appearance" role="tab" aria-controls="kf-settings-page-appearance" aria-selected="false" tabindex="-1" type="button">界面更新</button>
            </nav>
          </div>
          <div class="settings-page" id="kf-settings-page-routing" data-settings-page="routing" role="tabpanel" aria-labelledby="kf-settings-routing" tabindex="0" hidden>
            <section class="section settings-group">
              <div class="section-head"><h2 class="section-title">监控分组</h2><span class="section-meta" data-ref="monitorScopeCount">全部分组</span></div>
              <p class="settings-hint">自动检查、健康判断和候选排序只处理已纳入的分组。页面筛选和排序只改变显示结果。</p>
              <div class="field">
                <label for="kf-monitor-scope-mode">监控范围</label>
                <select id="kf-monitor-scope-mode" data-ref="monitorScopeMode" aria-describedby="kf-monitor-scope-help">
                  <option value="all">全部分组</option>
                  <option value="selected">仅选择的分组</option>
                </select>
                <p class="settings-hint" id="kf-monitor-scope-help" data-ref="monitorScopeStatus" role="status">保存后下次检查生效；选择模式下空列表表示不监控任何分组。</p>
              </div>
              <div class="monitor-scope-panel" data-ref="monitorScopePanel">
                <div class="monitor-scope-toolbar">
                  <input class="selector-search" data-ref="monitorScopeSearch" data-selector-search type="search" placeholder="搜索分组名称、模型或 ID" aria-label="搜索监控范围分组" autocomplete="off">
                  <span class="section-meta" data-ref="monitorScopeCountDetail">0 个分组</span>
                  <button class="text-button" data-ref="monitorScopeSelectAll" type="button">全选</button>
                  <button class="text-button" data-ref="monitorScopeClear" type="button">清空</button>
                </div>
                <div class="monitor-scope-list" data-ref="monitorScopeList" role="group" aria-label="监控范围分组"></div>
                <div class="settings-footer">
                  <span data-ref="monitorScopeSearchStatus" class="selector-search-status" role="status"></span>
                  <button class="button button-primary" data-ref="monitorScopeSave" type="button">保存监控范围</button>
                </div>
              </div>
            </section>
        <section class="section control-section settings-section">
          <div class="section-head"><h2 class="section-title">自动路由</h2><span class="section-meta">密钥、模型与分组</span></div>
          <div class="automation-bar">
            <span class="automation-name">自动切换</span>
            <label class="toggle" for="kf-enabled" title="自动切换">
              <input id="kf-enabled" data-ref="enabled" type="checkbox" aria-label="自动切换">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </label>
            <select class="switch-mode-select" data-ref="automaticSwitchMode" aria-label="自动切换模式" aria-describedby="kf-automatic-mode-help" title="自动切换模式">
              <option value="strategy">正常择优与恢复</option>
              <option value="failover">仅故障转移</option>
            </select>
          </div>
          <p id="kf-automatic-mode-help" class="settings-hint" data-ref="automaticSwitchHint">正常切换按 AIHub 1 小时质量指标排序；故障转移模式仅在当前组故障时切换。</p>
          <div class="algorithm-note"><strong>1h 固定标尺质量评分</strong><p>仅比较同一绑定模型、检测详情明确通过且指标完整新鲜的候选。分数用于排序，不代表实际服务成功概率；零权重不关闭检测、成功率或样本硬门槛。</p></div>
          <section class="quality-settings-draft" aria-labelledby="kf-quality-weights-title">
            <div class="section-head"><h3 class="section-title" id="kf-quality-weights-title">质量权重</h3><span class="section-meta" data-ref="qualityWeightTotal">合计 100% / 100%</span></div>
            <p class="quality-config-warning" data-ref="qualityConfigWarning" role="status" hidden></p>
            <div class="quality-weight-grid">
              <div class="field"><label for="kf-quality-success">1h 成功率（%）</label><input id="kf-quality-success" data-ref="qualityWeightSuccess" type="number" min="0" max="100" step="1" required></div>
              <div class="field"><label for="kf-quality-cache">1h 缓存命中（%）</label><input id="kf-quality-cache" data-ref="qualityWeightCache" type="number" min="0" max="100" step="1" required></div>
              <div class="field"><label for="kf-quality-tps">1h TPS（%）</label><input id="kf-quality-tps" data-ref="qualityWeightTps" type="number" min="0" max="100" step="1" required></div>
              <div class="field"><label for="kf-quality-ratio">低倍率（%）</label><input id="kf-quality-ratio" data-ref="qualityWeightRatio" type="number" min="0" max="100" step="1" required></div>
            </div>
            <div class="field quality-gain-field"><label for="kf-quality-gain">正常切换最小分差</label><input id="kf-quality-gain" data-ref="minQualityGainDraft" type="number" min="0" max="100" step="any" required><p class="settings-hint">默认 5 分；同分始终保持当前组。分差不是质量改善百分比。</p></div>
            <details class="settings-disclosure"><summary>评分标尺与样本保守系数</summary><p class="settings-hint">成功率按超过最低门槛的余量计分，分母至少为 5 个百分点；TPS 参考值 100，名义倍率参考值 1，样本参考值 100。模型与缓存分别使用样本数 ÷（样本数＋100）修正，低倍率项不作样本修正。这是样本保守系数，不是统计置信度；会更偏向高样本组。</p></details>
            <p class="settings-hint" data-ref="qualityWeightsStatus" role="status">编辑和预览只使用当前快照，保存后下次检查生效。</p>
            <div class="quality-preview" data-ref="qualityPreview" aria-label="已保存权重与草稿权重推荐对比"></div>
            <div class="settings-footer"><span class="settings-hint">不刷新接口，不调用模型，不立即切组。</span><button class="button" data-ref="qualityWeightsReset" type="button">恢复默认</button><button class="button button-primary" data-ref="qualityWeightsSave" type="button">保存权重</button></div>
          </section>
          <div class="control-grid">
            <div class="field">
              <label id="kf-token-label">API 密钥（可多选）</label>
              <div class="token-select" data-ref="tokenSelect">
                <button class="token-select-trigger" data-ref="tokenSelectToggle" type="button" aria-labelledby="kf-token-label" aria-expanded="false">
                  <span class="token-select-label" data-ref="tokenSelectLabel">请选择 API 密钥</span>
                  <span class="token-count" data-ref="tokenCount">已选 0/0</span>
                  <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
                <div class="token-menu" data-ref="tokenMenu" hidden>
                  <input class="selector-search" data-ref="tokenSearch" data-selector-search type="search" placeholder="搜索密钥名称或分组" aria-label="搜索 API 密钥" autocomplete="off">
                  <p class="selector-search-status" data-ref="tokenSearchStatus" role="status"></p>
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="selectAllTokens" type="button">全选全部</button>
                    <button class="text-button" data-ref="clearTokens" type="button">清空全部</button>
                  </div>
                  <div class="token-list" data-ref="tokenList"></div>
                </div>
              </div>
            </div>
            <div class="field">
              <label id="kf-model-label">启用模型目录（可多选）</label>
              <div class="token-select model-select" data-ref="modelSelect">
                <button class="token-select-trigger" data-ref="modelSelectToggle" type="button" aria-labelledby="kf-model-label" aria-expanded="false">
                  <span class="token-select-label" data-ref="modelSelectLabel">请选择目标模型</span>
                  <span class="token-count" data-ref="modelCount">已选 0</span>
                  <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
                <div class="token-menu" data-ref="modelMenu" hidden>
                  <input class="selector-search" data-ref="modelSearch" data-selector-search type="search" placeholder="搜索模型或平台" aria-label="搜索目标模型或平台" autocomplete="off">
                  <p class="selector-search-status" data-ref="modelSearchStatus" role="status"></p>
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="selectAllModels" type="button">全选全部</button>
                    <button class="text-button" data-ref="clearModels" type="button">清空全部</button>
                  </div>
                  <div class="token-list" data-ref="modelList"></div>
                </div>
              </div>
            </div>
            <div class="field field-wide token-model-settings">
              <h3 class="settings-subheading">每个密钥的决策模型</h3>
              <p class="settings-hint" data-ref="tokenModelStatus" role="status">选择密钥后，为每个密钥绑定一个决策模型。</p>
              <div class="token-model-bindings" data-ref="tokenModelBindings"></div>
            </div>
            <div class="field field-wide group-filter-field">
              <div class="group-filter-heading">
                <label id="kf-group-filter-label" data-ref="groupFilterLabel">白名单分组</label>
                <select class="filter-mode-select" data-ref="groupFilterMode" aria-label="分组名单模式">
                  <option value="whitelist">白名单</option>
                  <option value="blacklist">黑名单</option>
                </select>
              </div>
              <div class="token-select group-filter-select" data-ref="groupFilterSelect">
                <button class="token-select-trigger" data-ref="groupFilterSelectToggle" type="button" aria-labelledby="kf-group-filter-label" aria-expanded="false">
                  <span class="token-select-label" data-ref="groupFilterSelectLabel">不限分组</span>
                  <span class="token-count" data-ref="groupFilterCount">0/0</span>
                  <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
                <div class="token-menu" data-ref="groupFilterMenu" hidden>
                  <select class="selector-platform" data-ref="groupFilterPlatform" aria-label="名单分组平台分类" ${IS_AIHUB ? "" : "hidden"}><option value="">全部平台</option></select>
                  <input class="selector-search" data-ref="groupFilterSearch" data-selector-search type="search" placeholder="搜索分组" aria-label="搜索名单分组" autocomplete="off">
                  <p class="selector-search-status" data-ref="groupFilterSearchStatus" role="status"></p>
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="clearGroupFilter" type="button">清空当前名单</button>
                  </div>
                  <div class="token-list" data-ref="groupFilterList"></div>
                </div>
              </div>
            </div>
          </div>
        </section>
          </div>
          <div class="settings-page" id="kf-settings-page-protection" data-settings-page="protection" role="tabpanel" aria-labelledby="kf-settings-protection" tabindex="0" hidden>
        <section class="section settings-group settings-protection">
          <div class="section-head"><h2 class="section-title">检测间隔</h2></div>
          <div class="settings-fields">
            <div class="field"><label for="kf-health-interval">故障检测间隔（秒）</label><input id="kf-health-interval" data-ref="pollSeconds" type="number" min="15" max="3600" step="any" required></div>
            <div class="field"><label for="kf-strategy-interval">分组择优间隔（分钟）</label><input id="kf-strategy-interval" data-ref="strategyMinutes" type="number" min="0.25" max="60" step="any" required></div>
          </div>
          <p class="settings-hint">30 秒为默认轮询间隔，不保证 30 秒发现故障；故障发现依赖上游发布。确认当前组故障后寻找安全目标，不等待择优周期。</p>
          <div class="settings-check-times"><span>故障检查 <b data-ref="lastHealthCheck">—</b></span><span>分组择优 <b data-ref="lastStrategyCheck">—</b></span></div>
          <h3 class="settings-subheading">切换保护</h3>
          <div class="settings-fields">
            <div class="field"><label for="kf-confirm">连续确认次数</label><input id="kf-confirm" data-ref="confirmPolls" type="number" min="1" max="10" step="1" required></div>
            <div class="field"><label for="kf-hold">正常切换后保持（分钟）</label><input id="kf-hold" data-ref="switchHoldMinutes" type="number" step="any" min="0" max="1440" required></div>
            <div class="field"><label for="kf-rollback">回滚观察次数（0关闭）</label><input id="kf-rollback" data-ref="rollbackChecks" type="number" min="0" max="10" step="1" required></div>
            <div class="field"><label for="kf-isolation">故障隔离时长（分钟）</label><input id="kf-isolation" data-ref="blacklistMinutes" type="number" step="any" min="1" max="1440" required></div>
          </div>
          <p class="settings-hint" data-ref="confirmationHint">连续确认和切换观察只统计新证据，重复轮询不累计。</p>
          <details class="settings-disclosure">
            <summary>健康判定与候选限制</summary>
            <div class="grid advanced">
              <div class="field"><label for="kf-min-success">1h 最低成功率（%）</label><input id="kf-min-success" data-ref="minSuccessRate" type="number" min="0" max="100" step="0.1" required></div>
              <div class="field"><label for="kf-min-metric-samples">模型最少样本数</label><input id="kf-min-metric-samples" data-ref="minMetricSamples" type="number" min="1" max="1000000" step="1" required></div>
              <div class="field"><label for="kf-min-cache-samples">缓存最少记录数</label><input id="kf-min-cache-samples" data-ref="minCacheSamples" type="number" min="1" max="1000000" step="1" required></div>
              <div class="field"><label>最大倍率（0 不限制）</label><input data-ref="maxGroupRatio" type="number" max="100000" min="0" step="0.01" required></div>
            </div>
            <p class="settings-hint">模型检测详情必须明确通过，并与目标模型精确匹配。1h 指标和缓存最多保留 60 分钟有效期；缺失或过期时暂停自动候选。</p>
          </details>
          <details class="settings-disclosure isolation-disclosure" data-ref="isolationRecords">
            <summary>故障隔离 <span class="settings-count" data-ref="isolationSummaryCount">0条</span></summary>
          <section class="section isolation-section" aria-labelledby="kf-isolation-title">
            <div class="section-head isolation-heading">
              <div class="isolation-heading-copy">
                <h2 class="section-title" id="kf-isolation-title">故障隔离</h2>
                <p class="isolation-description">明确故障时隔离，到期重新检查；不修改用户黑白名单</p>
              </div>
              <span class="isolation-actions">
                <span class="section-meta" data-ref="isolationCount">当前无隔离</span>
                <button class="text-button" data-ref="clearAllIsolations" type="button">清除全部</button>
              </span>
            </div>
            <div class="isolation-list" data-ref="isolationRows"></div>
        </section>
          </details>
        </section>
          </div>
          <div class="settings-page" id="kf-settings-page-spending" data-settings-page="spending" role="tabpanel" aria-labelledby="kf-settings-spending" tabindex="0" hidden>
        <section class="section settings-group settings-protection">
          <div class="section-head"><h2 class="section-title">每日消费提醒</h2></div>
          <p class="settings-hint">达到提醒额度时通知，不停止请求或自动切换。</p>
          <div class="protection-bar">
            <span class="protection-copy">
              <strong>消费提醒</strong>
              <small data-ref="spendProtectionStatus" data-tone="none">未启用</small>
            </span>
            <label class="toggle" for="kf-spend-protection" title="消费提醒仅提醒，不影响任务">
              <input id="kf-spend-protection" data-ref="spendProtectionEnabled" type="checkbox" aria-label="启用消费提醒">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </label>
            <label class="spend-limit-field">
              <span>提醒额度</span>
              <input data-ref="dailySpendLimit" type="number" max="1000000000" min="0" step="0.01" aria-label="每日消费上限" required>
            </label>
            <button class="icon-button" data-ref="resetSpendProtection" type="button" title="从当前消费重新计数" aria-label="重新计数">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path></svg>
            </button>
          </div>
        </section>
          </div>
          <div class="settings-page" id="kf-settings-page-appearance" data-settings-page="appearance" role="tabpanel" aria-labelledby="kf-settings-appearance" tabindex="0" hidden>
        <section class="section settings-secondary settings-group" aria-labelledby="kf-appearance-title">
          <div class="section-head"><h2 class="section-title" id="kf-appearance-title">界面与更新</h2></div>
          <div class="settings-appearance">
            <span class="settings-appearance-copy"><strong>界面主题</strong><small>可跟随系统自动切换</small></span>
            <select class="theme-select" data-ref="theme" aria-label="插件皮肤">
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
          <div class="settings-appearance">
            <span class="settings-appearance-copy"><strong id="kf-glass-transparency-label">界面透明度（兼容保留）</strong><small>2.0 工作台使用高对比不透明表面</small></span>
            <span class="glass-transparency-control">
              <input id="kf-glass-transparency" class="glass-transparency-range" data-ref="glassTransparency" type="range" min="0" max="100" step="1" aria-labelledby="kf-glass-transparency-label">
              <output class="glass-transparency-value mono" data-ref="glassTransparencyValue" for="kf-glass-transparency">0%</output>
            </span>
          </div>
          <div class="settings-footer">
            <span class="settings-version"><strong>脚本更新</strong><small>当前版本 v${SCRIPT_VERSION}</small></span>
            <button class="button settings-update" data-ref="checkUpdate" data-state="idle" data-update="none" type="button" title="检查更新" aria-label="检查更新">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.2 6.2L3 15"></path><path d="M3 21v-6h6"></path><path d="M3 12a9 9 0 0 1 15.2-6.2L21 9"></path><path d="M21 3v6h-6"></path></svg>
              <span data-ref="updateLabel">检查更新</span>
            </button>
          </div>
        </section>
          </div>
        </section>
        <section class="work-view" id="kf-view-diagnostics" data-view="diagnostics" role="tabpanel" aria-labelledby="kf-tab-diagnostics" tabindex="0" hidden>
          <div class="view-intro">
            <h2>诊断历史</h2>
            <p>检查每个密钥的结果与最近事件</p>
          </div>
          <div class="diagnostics-grid">
            <section class="section">
              <div class="section-head"><h3 class="section-title">密钥结果</h3><span class="section-meta"><span data-ref="tokenResultCount">0</span> 条</span></div>
              <p class="diagnostic-caption">最近一次检查的逐密钥处理结果</p>
              <div class="diagnostic-list" data-ref="tokenResultRows"></div>
            </section>
            <section class="section">
              <div class="section-head"><h3 class="section-title">最近事件</h3><span class="section-meta">保留 10 条</span></div>
              <p class="diagnostic-caption">切换、告警、更新与接口异常记录</p>
              <div class="diagnostic-list"><div class="logs" data-ref="logs"></div></div>
            </section>
          </div>
        </section>
        </main>
        </div>
        </div>
        <div class="isolation-toast" data-ref="isolationToast" role="status" aria-live="polite" hidden>
          <span class="isolation-toast-message" data-ref="isolationToastMessage"></span>
          <button data-ref="isolationToastUndo" type="button">撤销</button>
        </div>
      </section>
      <dialog class="manual-dialog" data-ref="manualDialog" aria-labelledby="kf-manual-title">
        <form class="dialog-form" method="dialog">
          <div class="dialog-header">
            <h2 class="dialog-title" id="kf-manual-title">手动切换分组</h2>
            <button class="icon-button" data-ref="manualClose" type="button" title="关闭" aria-label="关闭">×</button>
          </div>
          <div class="field">
            <label id="kf-manual-group-label">目标分组</label>
            <select class="selector-platform" data-ref="manualGroupPlatform" aria-label="手动目标分组平台分类" ${IS_AIHUB ? "" : "hidden"}><option value="">全部平台</option></select>
            <input class="selector-search" data-ref="manualGroupSearch" data-selector-search type="search" placeholder="搜索目标分组" aria-label="搜索手动目标分组" autocomplete="off">
            <p class="selector-search-status" data-ref="manualGroupSearchStatus" role="status"></p>
            <div class="manual-group-list" data-ref="manualGroup" role="radiogroup" aria-labelledby="kf-manual-group-label"></div>
            <p class="dialog-hint" data-ref="manualHint"></p>
          </div>
          <div class="dialog-actions">
            <button class="button" data-ref="manualCancel" type="button">取消</button>
            <button class="button button-primary" data-ref="manualConfirm" type="button">确认切换</button>
          </div>
        </form>
      </dialog>
      <dialog class="scope-dialog" data-ref="manualScopeDialog" aria-labelledby="kf-manual-scope-title" aria-describedby="kf-manual-scope-target kf-manual-scope-risk kf-manual-scope-hint">
        <div class="scope-dialog-content">
          <h2 class="dialog-title" id="kf-manual-scope-title" data-ref="manualScopeTitle">目标分组未纳入监控</h2>
          <p class="dialog-hint" id="kf-manual-scope-target" data-ref="manualScopeTarget"></p>
          <p class="scope-dialog-risk" id="kf-manual-scope-risk" data-ref="manualScopeRisk"></p>
          <p class="dialog-hint" id="kf-manual-scope-hint" data-ref="manualScopeHint">请选择如何处理。仅本次切换不会修改保存的监控范围。</p>
          <div class="scope-dialog-actions">
            <button class="button button-primary" data-ref="manualScopeAdd" data-manual-scope="add" type="button">加入范围并切换</button>
            <button class="button" data-ref="manualScopeOnce" data-manual-scope="once" type="button">仅切换一次</button>
            <button class="button" data-ref="manualScopeCancel" data-manual-scope="cancel" type="button">取消</button>
          </div>
        </div>
      </dialog>
      <dialog class="detection-image-dialog" data-ref="detectionImageDialog" aria-labelledby="kf-detection-image-title">
        <div class="dialog-header">
          <h2 class="dialog-title" id="kf-detection-image-title" data-ref="detectionImageTitle">鹈鹕图片</h2>
          <button class="icon-button" data-ref="detectionImageClose" type="button" aria-label="关闭图片" title="关闭图片">×</button>
        </div>
        <div class="detection-image-body">
          <p class="detection-image-status" data-ref="detectionImageStatus" role="status"></p>
          <img data-ref="detectionImage" alt="" referrerpolicy="no-referrer" hidden>
        </div>
        <a class="detection-image-original" data-ref="detectionImageOriginal" target="_blank" rel="noopener noreferrer">在新标签页查看原图</a>
      </dialog>
    `;

    const refNames = [
      "candidatePlatform", "candidateSearch", "candidateSearchStatus", "candidateAvailabilityFilter", "candidateStatus", "candidateSort", "candidateResetFilters", "groupFilterPlatform", "manualGroupPlatform",
      "monitorScopeMode", "monitorScopeSearch", "monitorScopeList", "monitorScopeCount", "monitorScopeCountDetail", "monitorScopeSave", "monitorScopeSelectAll", "monitorScopeClear", "monitorScopeStatus", "monitorScopeSearchStatus", "monitorScopePanel", "currentScopeWarning", "outOfScopeTokenList", "removeOutOfScopeToken", "manualScopeDialog", "manualScopeTitle", "manualScopeTarget", "manualScopeRisk", "manualScopeHint", "manualScopeAdd", "manualScopeOnce", "manualScopeCancel",
      "automaticSwitchMode", "automaticSwitchHint", "tokenSearch", "tokenSearchStatus", "modelSearch", "modelSearchStatus", "groupFilterSearch", "groupFilterSearchStatus", "manualGroupSearch", "manualGroupSearchStatus",
      "qualityWeightSuccess", "qualityWeightCache", "qualityWeightTps", "qualityWeightRatio", "minQualityGainDraft", "qualityWeightTotal", "qualityWeightsStatus", "qualityWeightsSave", "qualityWeightsReset", "qualityPreview", "qualityConfigWarning", "tokenModelBindings", "tokenModelStatus",
      "detectionImageDialog", "detectionImageTitle", "detectionImageClose", "detectionImageStatus", "detectionImage", "detectionImageOriginal",
      "launcher", "panel", "header", "workspace", "statusDot", "version", "updateBadge", "theme", "glassTransparency", "glassTransparencyValue", "collapse", "fullscreen", "status", "currentGroup", "bestGroup",
      "lastCheck", "bestGroupMeta", "balance", "todaySpendItem", "todaySpend", "todayRequests", "todayTokens", "candidateCount", "candidateSummary", "tokenResultCount", "logCount", "settingsSection", "settingsSave", "strategyMinutes", "lastHealthCheck", "lastStrategyCheck", "confirmationHint", "enabled", "monitorEnabled", "monitorMode", "spendProtectionEnabled", "dailySpendLimit", "spendProtectionStatus", "resetSpendProtection",
      "statisticsMetric", "statisticsDays", "statisticsRefresh", "statisticsSource", "statisticsUpdated", "statisticsSummary", "statisticsLoading", "statisticsTotal", "statisticsAssigned", "statisticsCoverage", "statisticsTrendSummary", "statisticsTrend", "statisticsKeyRows",
      "tokenSelect", "tokenSelectToggle", "tokenSelectLabel", "tokenMenu", "tokenList", "tokenCount", "selectAllTokens", "clearTokens", "modelSelect", "modelSelectToggle", "modelSelectLabel", "modelCount", "modelMenu", "modelList", "selectAllModels", "clearModels", "groupFilterLabel", "groupFilterMode", "groupFilterSelect", "groupFilterSelectToggle", "groupFilterSelectLabel", "groupFilterCount", "groupFilterMenu", "groupFilterList", "clearGroupFilter", "pollSeconds",
      "minSuccessRate", "minMetricSamples", "minCacheSamples", "maxGroupRatio",
      "confirmPolls", "switchHoldMinutes", "rollbackChecks", "blacklistMinutes", "isolationRecords", "isolationSummaryCount",
      "check", "switchNow", "checkUpdate", "updateLabel", "manualDialog", "manualGroup", "manualHint", "manualSwitch", "manualConfirm", "manualClose", "manualCancel", "isolationCount", "isolationRows", "clearAllIsolations", "isolationToast", "isolationToastMessage", "isolationToastUndo",
      "tokenResultRows", "candidateRows", "logs",
    ];
    refs = Object.fromEntries(
      refNames.map((name) => [name, root.querySelector(`[data-ref="${name}"]`) || root.querySelector(`.${name}`)]),
    );
    applyTheme();
    syncForm();
    renderOptions();
    bindUi();
    render();
  }

  function registerMenus() {
    GM_registerMenuCommand("打开/收起监控面板", () => {
      state.collapsed = !state.collapsed;
      render();
    });
    GM_registerMenuCommand("立即检查分组", () => runCheck({ manual: true }));
    GM_registerMenuCommand("检查脚本更新", handleUpdateAction);
    GM_registerMenuCommand("切换自动运行状态", () => {
      config = { ...config, enabled: !config.enabled };
      GM_setValue(STORAGE_CONFIG, config);
      syncForm();
      scheduleNext(config.enabled ? 250 : undefined);
      setStatus(config.enabled ? "自动切换已启用" : "自动切换已暂停", config.enabled ? "success" : "warning");
    });
  }

  document.addEventListener("visibilitychange", () => {
    scheduleStatisticsRefresh(document.visibilityState === "visible" ? 250 : undefined);
    if (config.enabled && document.visibilityState === "visible") {
      requestHealthCheck(250);
    }
  });

  mountUi();
  window.addEventListener("focus", () => {
    if (IS_AIHUB && !state.collapsed) render();
  });
  window.addEventListener("resize", () => {
    positionElement(state.collapsed ? refs.launcher : refs.panel, state.collapsed ? "launcher" : "panel", true);
    if (state.activeView === "statistics" && state.statistics.loaded && !state.statistics.loading) {
      const redraw = () => renderStatisticsTrend(
        state.statistics.accountSeries,
        normalizeAihubStatisticsMetric(state.statistics.metric),
      );
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(redraw);
      else setTimeout(redraw, 0);
    }
  });
  registerMenus();
  scheduleUpdateCheck(0);
  Promise.all([refreshCatalogs(), refreshTodayUsage()])
    .then(([, usageLoaded]) => {
      const suffix = usageLoaded ? "" : "，今日用量读取失败";
      setStatus(
        config.enabled ? `列表已加载${suffix}，等待检查` : `自动切换已暂停${suffix}`,
        config.enabled ? "idle" : "warning",
      );
      scheduleNext(config.enabled ? 500 : undefined);
    })
    .catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    })
    .finally(() => {
      if (state.activeView === "statistics" && IS_AIHUB && !state.statistics.loaded) {
        void refreshStatistics({ silent: true });
      }
      scheduleStatisticsRefresh();
    });
})();
