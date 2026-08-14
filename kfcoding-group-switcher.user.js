// ==UserScript==
// @name         KFCoding 智能低倍率分组切换
// @namespace    https://kfcoding.codes/
// @version      0.14.4
// @description  在 KFCoding、AIHub、ooioo 和 FluxionAI 监控分组倍率与可用性，并切换一个或多个 API 密钥。
// @author       sj930211
// @license      MIT
// @homepageURL  https://github.com/sj930211/kfcoding-aihub-group-switcher
// @supportURL   https://github.com/sj930211/kfcoding-aihub-group-switcher/issues
// @downloadURL  https://raw.githubusercontent.com/sj930211/kfcoding-aihub-group-switcher/main/kfcoding-group-switcher.user.js
// @updateURL    https://raw.githubusercontent.com/sj930211/kfcoding-aihub-group-switcher/main/kfcoding-group-switcher.user.js
// @match        https://kfcoding.codes/*
// @match        https://aihub.top/*
// @match        https://ooioo.work/*
// @match        https://fluxionai.space/*
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
  const SITE_ID = detectSiteId(hostname);
  const SITE = SITE_METADATA[SITE_ID];
  const IS_AIHUB = SITE_ID === "aihub";
  const IS_FLUXION = SITE_ID === "fluxionai";
  const IS_AIHUB_API = SITE.apiFamily === "aihub";
  const IS_NEW_API_SITE = SITE.apiFamily === "new-api";
  const SITE_LABEL = SITE.label;
  const SITE_SHORT_LABEL = SITE.shortLabel;
  const AIHUB_LEGACY_MONITOR_MODEL = "AIHub 公共渠道监测";
  const SCRIPT_VERSION = "0.14.4";
  const SCRIPT_DOWNLOAD_URL = "https://raw.githubusercontent.com/sj930211/kfcoding-aihub-group-switcher/main/kfcoding-group-switcher.user.js";
  const AIHUB_CACHE_PRICING = Object.freeze({
    baselineHitRate: 97,
    hitUnitPrice: 0.5,
    missUnitPrice: 5,
  });

  const DEFAULT_CONFIG = Object.freeze({
    theme: "system",
    glassTransparency: 0,
    enabled: false,
    tokenIds: [],
    model: "",
    selectionMode: "saving",
    groupFilterMode: "whitelist",
    groupWhitelist: [],
    groupBlacklist: [],
    spendProtectionEnabled: false,
    dailySpendLimit: 0,
    pollSeconds: 30,
    metricHours: 24,
    minSuccessRate: 95,
    minLatestSuccessRate: 95,
    maxMetricAgeMinutes: 180,
    maxFirstTokenLatencySeconds: 120,
    maxOutputDurationSeconds: 0,
    maxGroupRatio: 0,
    confirmPolls: 2,
    cooldownMinutes: 10,
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
    return ["monitor", "diagnostics", "settings"].includes(value) ? value : "monitor";
  }

  function normalizeSelectionMode(value) {
    return ["saving", "stable", "balanced"].includes(value) ? value : DEFAULT_CONFIG.selectionMode;
  }

  function selectionModeLabel(value) {
    return { saving: "省钱优先", stable: "稳定优先", balanced: "均衡推荐" }[normalizeSelectionMode(value)];
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
      const remaining = Math.trunc(clampNumber(entry.remaining, 0, 0, 10));
      if (!fromGroup || !toGroup || fromGroup === toGroup || remaining <= 0) return;
      byToken[id] = {
        model: String(entry.model || ""),
        fromGroup,
        toGroup,
        remaining,
        at: Math.max(0, Number(entry.at) || 0),
      };
    });
    const blacklist = (Array.isArray(source.blacklist) ? source.blacklist : [])
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        model: String(entry.model || ""),
        group: String(entry.group || "").trim(),
        until: Math.max(0, Number(entry.until) || 0),
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

  function removeIsolation(value, model, group, now) {
    const state = pruneSwitchGuardState(value, Number.isFinite(Number(now)) ? Number(now) : Date.now());
    const targetModel = String(model || "");
    const targetGroup = String(group || "").trim();
    const removed = state.blacklist.filter(
      (entry) => entry.model === targetModel && entry.group === targetGroup,
    );
    state.blacklist = state.blacklist.filter(
      (entry) => entry.model !== targetModel || entry.group !== targetGroup,
    );
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
      state.blacklist.map((entry) => [`${entry.model}\u0000${entry.group}`, entry]),
    );
    restored.forEach((entry) => {
      const key = `${entry.model}\u0000${entry.group}`;
      const current = byKey.get(key);
      if (!current || current.until < entry.until) byKey.set(key, entry);
    });
    state.blacklist = [...byKey.values()].slice(0, 100);
    return state;
  }

  function applyTemporaryBlacklist(candidates, guardState, model, now) {
    const blocked = new Set(
      normalizeSwitchGuardState(guardState).blacklist
        .filter((entry) => entry.model === model && entry.until > now)
        .map((entry) => entry.group),
    );
    return candidates.map((candidate) => {
      if (!blocked.has(candidate.group)) return candidate;
      return {
        ...candidate,
        available: false,
        reasons: [
          "temporarily-blacklisted",
          ...candidate.reasons.filter((reason) => reason !== "temporarily-blacklisted"),
        ],
      };
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
    ]);
    return candidate.reasons.some((reason) => healthReasons.has(reason));
  }

  function selectRollbackCandidate(candidates, previousGroup, mode) {
    const previous = candidates.find(
      (candidate) => candidate.group === previousGroup && candidate.available,
    );
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
    return {
      theme: normalizeThemeMode(source.theme),
      glassTransparency: normalizeGlassTransparency(source.glassTransparency),
      enabled: Boolean(source.enabled),
      tokenIds: parseTokenIds(source.tokenIds, source.tokenId),
      model: String(source.model || "").trim(),
      selectionMode: normalizeSelectionMode(source.selectionMode),
      groupFilterMode,
      groupWhitelist,
      groupBlacklist,
      spendProtectionEnabled: Boolean(source.spendProtectionEnabled),
      dailySpendLimit: clampNumber(source.dailySpendLimit, DEFAULT_CONFIG.dailySpendLimit, 0, 1000000000),
      pollSeconds: clampNumber(source.pollSeconds, DEFAULT_CONFIG.pollSeconds, 15, 3600),
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
      cooldownMinutes: clampNumber(
        source.cooldownMinutes,
        DEFAULT_CONFIG.cooldownMinutes,
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
      "metrics-stale": "指标已过期",
      "success-low": "总成功率不足",
      "latest-success-low": "最新成功率不足",
      "first-token-latency-high": "首字延迟过高",
      "output-latency-high": "输出延迟过高",
      "monitor-disabled": "监测已停用",
      "latest-unavailable": "最新监测不可用",
      "model-unavailable": "目标模型不可用",
      "model-status-unknown": "模型状态未知",
      "temporarily-blacklisted": "故障隔离",
    };
    return labels[reason] || reason;
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
      const aggregateSuccess = Number(metric && metric.success_rate);
      const latestSuccess = Number(latest && latest.success_rate);
      const firstTokenLatencyMs = Number(metric && metric.avg_ttft_ms);
      const outputTokensPerSecond = Number(metric && metric.avg_tps);
      const outputLatencyMs = Number(metric && metric.avg_latency_ms);
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
    const prefixed = normalized.match(/^gpt-5\.6-(sol|terra|luna)$/);
    return prefixed ? prefixed[1] : normalized;
  }

  function aihubModelName(value) {
    const key = normalizeAihubModelKey(value);
    return ["sol", "terra", "luna"].includes(key) ? `gpt-5.6-${key}` : key;
  }

  function normalizeAihubModelHealth(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.fromEntries(
      Object.entries(source)
        .map(([model, status]) => [normalizeAihubModelKey(model), String(status || "").trim().toLowerCase()])
        .filter(([model]) => Boolean(model)),
    );
  }

  function buildAihubModelCatalog(summaryPayload) {
    const summary = summaryPayload && typeof summaryPayload === "object" ? summaryPayload : {};
    const keys = new Set();
    (Array.isArray(summary.apis) ? summary.apis : []).forEach((monitor) => {
      Object.keys(normalizeAihubModelHealth(monitor && (monitor.modelHealth ?? monitor.model_health)))
        .forEach((model) => keys.add(model));
    });
    const order = new Map(["sol", "terra", "luna"].map((model, index) => [model, index]));
    return {
      data: [...keys]
        .sort((left, right) => (order.get(left) ?? 99) - (order.get(right) ?? 99) || left.localeCompare(right))
        .map((model) => ({ model_name: aihubModelName(model) })),
    };
  }

  function aihubModelHealthStatus(monitor, model) {
    const key = normalizeAihubModelKey(model);
    if (!key) return "";
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
        availability7d: Number(item.availability_7d ?? item.availability7d),
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
        const latestSuccess = latestStatus ? (fluxionStatusOperational(latestStatus) ? 100 : 0) : NaN;
        const aggregateSuccess = Number(monitor && monitor.availability7d);
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
        generatedAt: providers.generated_at || providers.generatedAt || "",
        monitoringActive: true,
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
          successRates: item.success_rates,
          enabled: item.enabled !== false,
        })),
      },
      series: { seriesByApiId },
    };
  }

  function aihubSeriesPoint(point) {
    if (!Array.isArray(point)) return null;
    const timestampMs = Number(point[0]);
    if (!Number.isFinite(timestampMs)) return null;
    return {
      timestampMs,
      available: Number(point[1]) === 1,
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

  async function loadAihubMonitorData(fetcher, range, timezone) {
    const zone = encodeURIComponent(String(timezone || aihubTimezone()));
    const providerSummaryPath = `/api/v1/public/providers?timezone=${zone}`;
    const providerSeriesPath = `/api/v1/public/providers/series?range=${range}&timezone=${zone}`;
    const catalogsRequest = Promise.all([
      fetcher("/api/v1/groups/available"),
      fetcher("/api/v1/groups/rates"),
    ]);
    let monitorResult;
    try {
      const providers = await fetcher(providerSummaryPath);
      let providerSeries = {};
      let seriesError = null;
      try {
        providerSeries = await fetcher(providerSeriesPath);
      } catch (error) {
        seriesError = error;
      }
      const normalized = normalizeAihubProviderData(providers, providerSeries);
      monitorResult = { ...normalized, seriesError, source: "providers" };
    } catch (providerError) {
      const summary = await fetcher("/api/v1/public/monitor/summary");
      let series = {};
      let seriesError = null;
      try {
        series = await fetcher(`/api/v1/public/monitor/series/${range}`);
      } catch (error) {
        seriesError = error;
      }
      monitorResult = { summary, series, seriesError, source: "legacy", providerError };
    }
    const [groups, rates] = await catalogsRequest;
    return { ...monitorResult, groups, rates };
  }

  function evaluateAihubCandidates(summaryPayload, seriesPayload, groupsPayload, ratesPayload, config, nowMs) {
    const summary = summaryPayload && typeof summaryPayload === "object" ? summaryPayload : {};
    const seriesByApiId = seriesPayload && seriesPayload.seriesByApiId && typeof seriesPayload.seriesByApiId === "object"
      ? seriesPayload.seriesByApiId
      : {};
    const groups = normalizeAihubGroups(groupsPayload);
    const groupMap = new Map(groups.map((group) => [Number(group.id), group]));
    const rates = normalizeAihubRates(ratesPayload);
    const filteredGroups = new Set(activeGroupFilter(config));
    const enforceGroupFilter = filteredGroups.size > 0;
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const seenGroups = new Set();

    return (Array.isArray(summary.apis) ? summary.apis : [])
      .filter((monitor) => {
        const groupId = Number(monitor && monitor.group_id);
        if (!Number.isFinite(groupId) || groupId <= 0 || seenGroups.has(groupId)) return false;
        seenGroups.add(groupId);
        return true;
      })
      .map((monitor) => {
        const reasons = [];
        const groupId = Number(monitor.group_id);
        const groupMeta = groupMap.get(groupId);
        const group = String((groupMeta && groupMeta.name) || monitor.planType || `#${groupId}`);
        const userRatio = Number(rates[groupId]);
        const groupRatio = Number(groupMeta && groupMeta.rate_multiplier);
        const publicRatio = Number(monitor.priceMultiplier);
        const ratio = Number.isFinite(userRatio) && userRatio > 0
          ? userRatio
          : Number.isFinite(groupRatio) && groupRatio > 0
            ? groupRatio
            : publicRatio;
        const rawSeries = Array.isArray(seriesByApiId[monitor.id]) ? seriesByApiId[monitor.id] : [];
        const parsedSeries = rawSeries
          .map(aihubSeriesPoint)
          .filter(Boolean)
          .sort((left, right) => left.timestampMs - right.timestampMs);
        const latestPoint = parsedSeries.length ? parsedSeries[parsedSeries.length - 1] : null;
        const modelHealthStatus = aihubModelHealthStatus(monitor, config.model);
        const selectedModelKey = normalizeAihubModelKey(config.model);
        const probeModelKey = normalizeAihubModelKey(
          (groupMeta && (groupMeta.probe_model ?? groupMeta.probeModel))
            ?? monitor.probe_model
            ?? monitor.probeModel,
        );
        const modelHealthKnown = modelHealthStatus === "healthy" || modelHealthStatus === "failed";
        const seriesMatchesSelectedModel = Boolean(
          selectedModelKey && probeModelKey && selectedModelKey === probeModelKey,
        );
        const useSelectedModelHealth = modelHealthKnown && !seriesMatchesSelectedModel;
        const successKey = aihubMonitorRange(config.metricHours);
        const summarySuccess = Number(
          monitor.successRates && (monitor.successRates[successKey] ?? monitor.successRates["24h"]),
        );
        const aggregateSuccess = Number.isFinite(summarySuccess) ? summarySuccess * 100 : NaN;
        const latestSuccess = useSelectedModelHealth
          ? (modelHealthStatus === "healthy" ? 100 : 0)
          : latestPoint
            ? (latestPoint.available ? 100 : 0)
            : monitor.available === true
              ? 100
              : monitor.available === false
                ? 0
                : NaN;
        const checkedAtMs = Date.parse(monitor.checkedAt || summary.generatedAt || "");
        const ageMinutes = Number.isFinite(checkedAtMs)
          ? Math.max(0, now - checkedAtMs) / 60000
          : Infinity;
        const firstTokenLatencyMs = Number(
          monitor.probe_e2e_ttft_ms
            ?? monitor.probeE2eTtftMs
            ?? monitor.firstTokenLatencyMs
            ?? monitor.probe_ttft_ms,
        );
        const outputTokensPerSecond = Number(monitor.outputTokensPerSecond);
        const outputTokens = Number(monitor.outputTokens);
        const outputLatencyMs = Number.isFinite(outputTokens)
          && outputTokens > 0
          && Number.isFinite(outputTokensPerSecond)
          && outputTokensPerSecond > 0
          ? outputTokens / outputTokensPerSecond * 1000
          : NaN;
        const cacheHitRate = parsePercentValue(monitor.cacheHitRate);

        if (!groupMeta) reasons.push("not-user-selectable");
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
        if (summary.monitoringActive === false || monitor.enabled === false) reasons.push("monitor-disabled");
        if (latestSuccess !== 100) reasons.push("latest-unavailable");
        if (modelHealthStatus === "failed") reasons.push("model-unavailable");
        else if (modelHealthStatus !== "healthy") reasons.push("model-status-unknown");
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
        ) reasons.push("first-token-latency-high");
        if (
          config.maxOutputDurationSeconds > 0 &&
          (!Number.isFinite(outputLatencyMs)
            || outputLatencyMs <= 0
            || outputLatencyMs > config.maxOutputDurationSeconds * 1000)
        ) reasons.push("output-latency-high");
        return {
          group,
          groupId,
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
          outputTokens,
          cacheHitRate,
          cachePricingModel: AIHUB_CACHE_PRICING,
          modelHealthStatus,
          probeModelKey,
          ageMinutes,
        };
      });
  }

  function boundedPercent(value, fallback) {
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : fallback;
  }

  function inverseLatencyScore(value, referenceMs) {
    if (!Number.isFinite(value) || value <= 0) return 25;
    return 100 / (1 + value / referenceMs);
  }

  function candidateHealthScore(candidate) {
    if (!candidate) return 0;
    const recent = boundedPercent(candidate.recentMinSuccess, 0);
    const aggregate = boundedPercent(candidate.aggregateSuccess, 0);
    const firstToken = inverseLatencyScore(candidate.firstTokenLatencyMs, 2000);
    const output = inverseLatencyScore(candidate.outputLatencyMs, 10000);
    const cache = boundedPercent(candidate.cacheHitRate, 50);
    return recent * 0.35 + aggregate * 0.15 + firstToken * 0.2 + output * 0.2 + cache * 0.1;
  }

  function candidatePriceScore(candidate, candidates) {
    const ratios = candidates
      .map((item) => Number(item.ratio))
      .filter((ratio) => Number.isFinite(ratio) && ratio > 0);
    const minimum = ratios.length ? Math.min(...ratios) : NaN;
    const ratio = Number(candidate && candidate.ratio);
    if (!Number.isFinite(minimum) || !Number.isFinite(ratio) || ratio <= 0) return 0;
    return Math.min(100, minimum / ratio * 100);
  }

  function hasValidCacheHitRate(candidate) {
    const cacheHitRate = candidate && candidate.cacheHitRate;
    return Number.isFinite(cacheHitRate) && cacheHitRate >= 0 && cacheHitRate <= 100;
  }

  function normalizeCachePricingModel(value) {
    if (!value || typeof value !== "object") return null;
    const baselineHitRate = Number(value.baselineHitRate);
    const hitUnitPrice = Number(value.hitUnitPrice);
    const missUnitPrice = Number(value.missUnitPrice);
    if (
      !Number.isFinite(baselineHitRate)
      || baselineHitRate < 0
      || baselineHitRate > 100
      || !Number.isFinite(hitUnitPrice)
      || hitUnitPrice < 0
      || !Number.isFinite(missUnitPrice)
      || missUnitPrice < 0
      || hitUnitPrice >= missUnitPrice
    ) return null;
    return { baselineHitRate, hitUnitPrice, missUnitPrice };
  }

  function hasEffectiveRatioEstimate(candidate) {
    return hasValidCacheHitRate(candidate)
      && Boolean(normalizeCachePricingModel(candidate && candidate.cachePricingModel));
  }

  function cacheUnitCost(cacheHitRate, pricingModel = AIHUB_CACHE_PRICING) {
    const model = normalizeCachePricingModel(pricingModel) || AIHUB_CACHE_PRICING;
    const hitRatio = boundedPercent(cacheHitRate, model.baselineHitRate) / 100;
    return hitRatio * model.hitUnitPrice + (1 - hitRatio) * model.missUnitPrice;
  }

  function candidateEffectiveRatio(candidate) {
    const nominalRatio = Number(candidate && candidate.ratio);
    if (!Number.isFinite(nominalRatio) || nominalRatio <= 0) return NaN;
    const pricingModel = normalizeCachePricingModel(candidate && candidate.cachePricingModel);
    if (!hasValidCacheHitRate(candidate) || !pricingModel) return nominalRatio;
    const baselineCost = cacheUnitCost(pricingModel.baselineHitRate, pricingModel);
    return nominalRatio * cacheUnitCost(candidate.cacheHitRate, pricingModel) / baselineCost;
  }

  function candidateSavingScore(candidate, candidates) {
    const population = Array.isArray(candidates) ? candidates : [];
    const effectiveRatios = population
      .map(candidateEffectiveRatio)
      .filter((ratio) => Number.isFinite(ratio) && ratio > 0);
    const minimum = effectiveRatios.length ? Math.min(...effectiveRatios) : NaN;
    const effectiveRatio = candidateEffectiveRatio(candidate);
    if (!Number.isFinite(minimum) || !Number.isFinite(effectiveRatio) || effectiveRatio <= 0) return 0;
    return Math.min(100, minimum / effectiveRatio * 100);
  }

  function candidateStrategyScore(candidate, candidates, mode) {
    const selectionMode = normalizeSelectionMode(mode);
    const health = candidateHealthScore(candidate);
    const price = candidatePriceScore(candidate, candidates);
    if (selectionMode === "stable") return health;
    if (selectionMode === "balanced") return health * 0.7 + price * 0.3;
    return candidateSavingScore(candidate, candidates);
  }

  function sortCandidatesForMode(candidates, mode) {
    const selectionMode = normalizeSelectionMode(mode);
    const population = candidates.slice();
    return population.sort((left, right) => {
      const scoreDifference = candidateStrategyScore(right, population, selectionMode)
        - candidateStrategyScore(left, population, selectionMode);
      if (Math.abs(scoreDifference) > 0.0001) return scoreDifference;
      const healthDifference = candidateHealthScore(right) - candidateHealthScore(left);
      if (Math.abs(healthDifference) > 0.0001) return healthDifference;
      return left.ratio - right.ratio;
    });
  }

  function selectBestCandidate(candidates, currentGroup, mode) {
    const available = sortCandidatesForMode(
      candidates.filter((candidate) => candidate.available),
      mode,
    );

    if (!available.length) return null;
    const current = available.find((candidate) => candidate.group === currentGroup);
    if (normalizeSelectionMode(mode) === "saving" && current) {
      const scoreDifference = candidateSavingScore(available[0], available)
        - candidateSavingScore(current, available);
      if (Math.abs(scoreDifference) <= 0.0001) return current;
    }
    return available[0];
  }

  function selectSwitchCandidate(candidates, currentGroup, targetGroup, options) {
    const target = String(targetGroup || "").trim();
    const request = options && typeof options === "object" ? options : {};
    if (!target) return selectBestCandidate(candidates, currentGroup, request.mode);

    const candidate = candidates.find((item) => item.group === target);
    if (!candidate) {
      throw new Error(`目标分组 ${target} 不在当前模型的可选范围内`);
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
    return match ? match[1].trim() : "";
  }

  function compareVersions(left, right) {
    const leftParts = String(left || "").replace(/^v/i, "").split(".");
    const rightParts = String(right || "").replace(/^v/i, "").split(".");
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
    AIHUB_CACHE_PRICING,
    SITE_METADATA,
    activeGroupFilter,
    aihubMonitorRange,
    buildTokenUpdatePayload,
    buildFluxionModelCatalog,
    clampPosition,
    evaluateAihubCandidates,
    evaluateCandidates,
    evaluateFluxionCandidates,
    extractUserscriptVersion,
    formatBalance,
    formatTokenCount,
    fluxionEffectiveGroupRatio,
    fluxionGroupSupportsModel,
    fluxionMonitorMatchScore,
    parsePercentValue,
    compareVersions,
    applyTemporaryBlacklist,
    aihubModelHealthStatus,
    aihubModelName,
    buildAihubModelCatalog,
    normalizeAihubModelHealth,
    normalizeAihubModelKey,
    cacheUnitCost,
    hasEffectiveRatioEstimate,
    candidateHasHealthFailure,
    candidateEffectiveRatio,
    candidateHealthScore,
    candidateSavingScore,
    candidateStrategyScore,
    evaluateSpendProtection,
    localDateKey,
    loadAihubMonitorData,
    normalizeLogs,
    normalizeActiveView,
    normalizeAihubTodayUsage,
    normalizeAihubProviderData,
    normalizeAihubToken,
    normalizeFluxionMonitors,
    normalizeNewApiTodayUsage,
    normalizeNewApiTokenList,
    normalizeSwitchHistory,
    normalizeSwitchGuardState,
    normalizeSpendGuard,
    normalizeGlassTransparency,
    normalizeSelectionMode,
    normalizeThemeMode,
    normalizeUiPositions,
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
    summarizeTokenGroups,
    tokenSupportsModel,
    todayTimestampRange,
    unwrapUserGroups,
  });

  if (globalThis.__KFCODING_GROUP_SWITCHER_TEST__) {
    globalThis.__KFCODING_GROUP_SWITCHER_API__ = TEST_API;
    return;
  }

  let config = sanitizeConfig(GM_getValue(STORAGE_CONFIG, {}));
  if (IS_AIHUB && config.model === AIHUB_LEGACY_MONITOR_MODEL) {
    config = { ...config, model: "" };
  }
  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let scheduler = null;
  let updateScheduler = null;
  let isolationUndoScheduler = null;
  let root = null;
  let refs = {};
  let running = false;
  let pricingCache = null;
  let tokensCache = [];
  let userGroupsCache = {};
  let aihubGroupsCache = [];
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
    tone: "idle",
    status: config.enabled ? "等待首次检查" : "自动切换已暂停",
    currentGroup: "-",
    bestGroup: "-",
    lastCheck: "-",
    candidates: [],
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
        text: `保护计数 ${formatSpendValue(result.trackedSpend, state.todayUsage.symbol)} / ${formatSpendValue(result.limit, state.todayUsage.symbol)}，仅提醒，不影响任务`,
        log: `消费保护：已达到每日上限 ${formatSpendValue(result.limit, state.todayUsage.symbol)}`,
      };
    } else if (request.notify && result.tone === "approaching" && !guard.warnedApproaching) {
      guard.warnedApproaching = true;
      notification = {
        title: `${SITE_LABEL} 每日消费接近上限`,
        text: `保护计数已使用 ${Math.round(result.ratio * 100)}%，剩余 ${formatSpendValue(result.remaining, state.todayUsage.symbol)}`,
        log: `消费保护：已使用每日上限的 ${Math.round(result.ratio * 100)}%`,
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
    addLog(`消费保护计数已重置，当前基线 ${formatSpendValue(actualSpend, state.todayUsage.symbol)}`, "success");
    setStatus("消费保护计数已从当前消费重新开始", "success");
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
      const items = payload && Array.isArray(payload.items) ? payload.items : [];
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
    const groupId = Number(source.group_id ?? groupMeta.id);
    return {
      ...source,
      group: String(groupMeta.name || source.group_name || "未分组"),
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

  async function refreshCatalogs() {
    if (IS_AIHUB_API) {
      const requests = [
        fetchJson("/api/v1/keys?page=1&page_size=100"),
        fetchJson("/api/v1/groups/available"),
        fetchJson("/api/v1/groups/rates"),
      ];
      if (IS_FLUXION) requests.push(fetchJson("/api/v1/channel-monitors"));
      else requests.push(fetchJson(`/api/v1/public/providers?timezone=${encodeURIComponent(aihubTimezone())}`));
      const [tokenList, groups, rates, monitorPayload] = await Promise.all(requests);
      tokensCache = normalizeTokenList(tokenList);
      if (IS_FLUXION) {
        fluxionGroupsCache = normalizeFluxionGroups(groups);
        fluxionRatesCache = normalizeAihubRates(rates);
        fluxionMonitorsCache = normalizeFluxionMonitors(monitorPayload);
        pricingCache = buildFluxionModelCatalog(monitorPayload, groups);
      } else {
        aihubGroupsCache = normalizeAihubGroups(groups);
        aihubRatesCache = normalizeAihubRates(rates);
        pricingCache = buildAihubModelCatalog(
          normalizeAihubProviderData(monitorPayload, {}).summary,
        );
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
      ? await fetchJson("/api/v1/keys?page=1&page_size=100")
      : await fetchJson("/api/token/?p=1&size=100");
    tokensCache = normalizeTokenList(payload);
    renderOptions(true);
    render();
  }

  async function getTokenDetail(tokenId) {
    if (IS_AIHUB_API) {
      const payload = await fetchJson(`/api/v1/keys/${tokenId}`);
      if (!payload || typeof payload !== "object") throw new Error("API 密钥详情为空");
      return normalizeAihubToken(payload);
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

  function cooldownRemainingMs(tokenId, now) {
    const last = getSwitchHistory().byToken[tokenId] || {};
    if (last.model !== config.model) return 0;
    const elapsed = now - Number(last.at || 0);
    return Math.max(0, config.cooldownMinutes * 60000 - elapsed);
  }

  function recordSwitch(tokenId, candidate) {
    const history = getSwitchHistory();
    history.byToken[tokenId] = {
      model: config.model,
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

  function refreshCandidateIsolationState() {
    const now = Date.now();
    const candidates = state.candidates.map((candidate) => {
      const reasons = candidate.reasons.filter((reason) => reason !== "temporarily-blacklisted");
      return { ...candidate, reasons, available: reasons.length === 0 };
    });
    state.candidates = applyTemporaryBlacklist(candidates, getSwitchGuardState(now), config.model, now);
    const recommended = selectBestCandidate(state.candidates, "", config.selectionMode);
    state.bestGroup = recommended
      ? `${recommended.group} ${formatRatio(candidateEffectiveRatio(recommended))}`
      : "无可用分组";
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

  function clearIsolation(model, group) {
    const result = removeIsolation(getSwitchGuardState(), model, group, Date.now());
    if (!result.removed.length) return;
    saveSwitchGuardState(result.state);
    refreshCandidateIsolationState();
    setIsolationUndo(result.removed);
    addLog(`已解除故障隔离：${group}`, "success");
    setStatus(`已解除 ${group} 的故障隔离`, "success");
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
    if (
      config.rollbackChecks <= 0 ||
      !Number.isFinite(tokenId) ||
      tokenId <= 0 ||
      !fromGroup ||
      !toGroup ||
      fromGroup === toGroup
    ) {
      delete state.byToken[tokenId];
      saveSwitchGuardState(state);
      return;
    }
    state.byToken[tokenId] = {
      model: config.model,
      fromGroup,
      toGroup,
      remaining: config.rollbackChecks,
      at: Date.now(),
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
    const switchOptions = options || {};
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
      recordSwitch(token.id, candidate);
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
    recordSwitch(token.id, candidate);
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
    if (!tokenSupportsModel(token, config.model)) {
      throw new Error(`选中的 API 密钥未允许模型 ${config.model}`);
    }
  }

  async function handleRollbackGuard(token, candidates) {
    const tokenId = Number(token.id);
    const now = Date.now();
    const guardState = getSwitchGuardState(now);
    const guard = guardState.byToken[tokenId];
    if (!guard) return null;
    if (
      config.rollbackChecks <= 0 ||
      guard.model !== config.model ||
      guard.toGroup !== String(token.group || "")
    ) {
      delete guardState.byToken[tokenId];
      saveSwitchGuardState(guardState);
      return null;
    }

    const current = candidates.find((candidate) => candidate.group === guard.toGroup);
    if (current && current.available) {
      guard.remaining -= 1;
      if (guard.remaining <= 0) {
        delete guardState.byToken[tokenId];
        addLog(`${tokenLabel(token)} 的 ${guard.toGroup} 已通过切换观察`, "success");
        saveSwitchGuardState(guardState);
        return {
          outcome: "observed",
          group: guard.toGroup,
          tone: "success",
          message: "切换观察完成",
        };
      }
      guardState.byToken[tokenId] = guard;
      saveSwitchGuardState(guardState);
      return {
        outcome: "observing",
        group: guard.toGroup,
        tone: "warning",
        message: `切换观察中，剩余 ${guard.remaining} 次`,
      };
    }

    if (candidateHasHealthFailure(current)) {
      guardState.blacklist = guardState.blacklist.filter(
        (entry) => entry.model !== config.model || entry.group !== guard.toGroup,
      );
      guardState.blacklist.push({
        model: config.model,
        group: guard.toGroup,
        until: now + config.blacklistMinutes * 60000,
      });
    }
    delete guardState.byToken[tokenId];
    saveSwitchGuardState(guardState);

    const eligible = applyTemporaryBlacklist(candidates, guardState, config.model, now);
    const rollbackTarget = selectRollbackCandidate(eligible, guard.fromGroup, config.selectionMode);
    const fallback = rollbackTarget.candidate;
    if (!fallback) return null;

    const destination = rollbackTarget.usedPrevious ? "原分组" : "其他可用分组";
    await switchTokenGroup(token, fallback, {
      trackRollback: false,
      logTone: "warning",
      logMessage: `${tokenLabel(token)} 的 ${guard.toGroup} 观察失败，已回滚到${destination} ${fallback.group}`,
    });
    return {
      outcome: "rolled-back",
      group: fallback.group,
      tone: "warning",
      message: `观察失败，已回滚到 ${fallback.group}`,
    };
  }

  async function processToken(token, candidates, options) {
    const forceSwitch = Boolean(options && options.forceSwitch);
    const targetGroup = String((options && options.targetGroup) || "").trim();
    const tokenId = Number(token.id);
    validateToken(token);
    if (config.enabled && !forceSwitch) {
      const rollback = await handleRollbackGuard(token, candidates);
      if (rollback) return rollback;
    }
    const selected = selectSwitchCandidate(candidates, token.group, targetGroup, {
      mode: config.selectionMode,
      allowUnavailable: Boolean(targetGroup),
    });
    const current = candidates.find((candidate) => candidate.group === token.group);

    if (!selected) {
      const reasonSummary = summarizeFailures(candidates);
      throw new Error(`没有满足条件的分组${reasonSummary ? `：${reasonSummary}` : ""}`);
    }
    if (!shouldSwitchCandidate(selected, token.group)) {
      pendingCandidates.delete(tokenId);
      return {
        outcome: "current",
        group: token.group || "未设置",
        tone: "success",
        message: targetGroup ? "已是手动目标分组" : "已是策略推荐分组",
      };
    }
    if (forceSwitch) {
      await switchTokenGroup(token, selected);
      return {
        outcome: "switched",
        group: selected.group,
        tone: "success",
        message: targetGroup ? "已手动切换" : "已立即切换",
      };
    }
    if (!config.enabled) {
      pendingCandidates.delete(tokenId);
      return {
        outcome: "suggested",
        group: token.group || "未设置",
        tone: "warning",
        message: `建议切换到 ${selected.group}`,
      };
    }
    if (!current || !current.available) {
      await switchTokenGroup(token, selected);
      return {
        outcome: "switched",
        group: selected.group,
        tone: "success",
        message: "当前分组不可用，已回退",
      };
    }

    const pending = pendingCandidates.get(tokenId);
    const nextPending = pending && pending.group === selected.group
      ? { group: selected.group, hits: pending.hits + 1 }
      : { group: selected.group, hits: 1 };
    pendingCandidates.set(tokenId, nextPending);
    if (nextPending.hits < config.confirmPolls) {
      return {
        outcome: "pending",
        group: token.group || "未设置",
        tone: "warning",
        message: `${selected.group} 待确认 ${nextPending.hits}/${config.confirmPolls}`,
      };
    }

    const remaining = cooldownRemainingMs(tokenId, Date.now());
    if (remaining > 0) {
      return {
        outcome: "cooldown",
        group: token.group || "未设置",
        tone: "warning",
        message: `冷却中，${Math.ceil(remaining / 60000)} 分钟后可切换`,
      };
    }

    await switchTokenGroup(token, selected);
    return {
      outcome: "switched",
      group: selected.group,
      tone: "success",
      message: "已自动切换",
    };
  }

  async function runCheck(options) {
    const manual = Boolean(options && options.manual);
    const forceSwitch = Boolean(options && options.forceSwitch);
    const targetGroup = String((options && options.targetGroup) || "").trim();
    // A manual check must refresh account-level usage even when group checks cannot start yet.
    const manualUsageRefresh = manual ? refreshTodayUsage() : null;
    if (running) {
      if (manual) setStatus("已有检查正在进行", "warning");
      return;
    }
    if (!config.model) {
      setStatus("请先选择目标模型", "warning");
      return;
    }
    if (!config.tokenIds.length && requiresTokenSelection(SITE_ID, options)) {
      setStatus(`请先选择至少一个 API 密钥${IS_AIHUB || IS_FLUXION ? "" : "和目标模型"}`, "warning");
      return;
    }
    const selectedTokenIds = config.tokenIds.slice();

    running = true;
    const usageRefresh = manualUsageRefresh || refreshTodayUsage();
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
          : "正在检查分组状态...",
      "running",
    );
    let monitorFallback = false;
    try {
      let candidates;
      if (IS_AIHUB) {
        const range = aihubMonitorRange(config.metricHours);
        const { summary, series, seriesError, groups, rates } = await loadAihubMonitorData(fetchJson, range);
        monitorFallback = Boolean(seriesError);
        if (seriesError && !state.aihubSeriesDegraded) {
          const message = seriesError instanceof Error ? seriesError.message : String(seriesError);
          addLog(`AIHub 近期柱状图暂不可用，已使用最新汇总状态：${message}`, "warning");
        } else if (!seriesError && state.aihubSeriesDegraded) {
          addLog("AIHub 近期柱状图接口已恢复", "success");
        }
        state.aihubSeriesDegraded = monitorFallback;
        aihubGroupsCache = normalizeAihubGroups(groups);
        aihubRatesCache = normalizeAihubRates(rates);
        pricingCache = buildAihubModelCatalog(summary);
        candidates = evaluateAihubCandidates(
          summary,
          series,
          aihubGroupsCache,
          aihubRatesCache,
          config,
          Date.now(),
        );
      } else if (IS_FLUXION) {
        const [monitors, groups, rates] = await Promise.all([
          fetchJson("/api/v1/channel-monitors"),
          fetchJson("/api/v1/groups/available"),
          fetchJson("/api/v1/groups/rates"),
        ]);
        fluxionMonitorsCache = normalizeFluxionMonitors(monitors);
        fluxionGroupsCache = normalizeFluxionGroups(groups);
        fluxionRatesCache = normalizeAihubRates(rates);
        pricingCache = buildFluxionModelCatalog(monitors, groups);
        candidates = evaluateFluxionCandidates(
          monitors,
          groups,
          rates,
          config,
          Date.now(),
        );
      } else {
        const [pricing, metrics, userGroups] = await Promise.all([
          fetchJson("/api/pricing"),
          fetchJson(`/api/perf-metrics?model=${encodeURIComponent(config.model)}&hours=${config.metricHours}`),
          fetchJson("/api/user/self/groups"),
        ]);
        pricingCache = pricing;
        userGroupsCache = unwrapUserGroups(userGroups);
        candidates = evaluateCandidates(pricing, metrics, userGroups, config, Date.now() / 1000);
      }
      const candidateTimestamp = Date.now();
      candidates = applyTemporaryBlacklist(
        candidates,
        getSwitchGuardState(candidateTimestamp),
        config.model,
        candidateTimestamp,
      );
      if (manual) renderOptions(true);
      const recommendedCandidate = selectBestCandidate(candidates, "", config.selectionMode);
      state.candidates = candidates;
      state.bestGroup = recommendedCandidate
        ? `${recommendedCandidate.group} ${formatRatio(candidateEffectiveRatio(recommendedCandidate))}`
        : "无可用分组";
      state.lastCheck = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      if (targetGroup) {
        selectSwitchCandidate(candidates, "", targetGroup, { allowUnavailable: true });
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

      const details = await Promise.allSettled(selectedTokenIds.map((tokenId) => getTokenDetail(tokenId)));
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
          const result = await processToken(token, candidates, { forceSwitch, targetGroup });
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

      refreshCandidateIsolationState();
      state.currentGroup = summarizeTokenGroups(state.tokenResults);
      const failedCount = state.tokenResults.filter((result) => result.outcome === "error").length;
      const switchedCount = state.tokenResults.filter((result) => result.outcome === "switched").length;
      const rolledBackCount = state.tokenResults.filter((result) => result.outcome === "rolled-back").length;
      const warningCount = state.tokenResults.filter((result) => result.tone === "warning").length;
      if (switchedCount > 0) {
        GM_notification({
          title: `${SITE_LABEL} 分组已切换`,
          text: `${config.model}: 已切换 ${switchedCount} 个 API 密钥`,
          timeout: 8000,
        });
      }
      if (rolledBackCount > 0) {
        GM_notification({
          title: `${SITE_LABEL} 分组已自动回滚`,
          text: `${config.model}: 已回滚 ${rolledBackCount} 个 API 密钥`,
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

  function scheduleNext(delayMs) {
    if (scheduler) window.clearTimeout(scheduler);
    scheduler = null;
    if (!config.enabled) return;
    scheduler = window.setTimeout(async () => {
      await runCheck({ manual: false });
      scheduleNext(config.pollSeconds * 1000);
    }, delayMs == null ? config.pollSeconds * 1000 : delayMs);
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

  function createOption(value, label) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    return option;
  }

  function renderOptions(preserveFormState) {
    if (!refs.tokenList || !refs.model) return;

    const selectedTokens = new Set(
      preserveFormState
        ? [...refs.tokenList.querySelectorAll('input[data-token-id]:checked')]
          .map((checkbox) => Number(checkbox.value))
        : config.tokenIds.map(Number),
    );
    const selectedModel = preserveFormState ? refs.model.value : config.model;
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
    renderTokenSelectionCount();

    refs.model.replaceChildren(createOption("", "请选择模型"));
    const models = pricingCache && Array.isArray(pricingCache.data)
      ? pricingCache.data.map((item) => item.model_name).filter(Boolean).sort()
      : [];
    models.forEach((model) => refs.model.appendChild(createOption(model, model)));
    refs.model.value = selectedModel;
    renderGroupFilterOptions();
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
      const selectedModel = pricingCache && Array.isArray(pricingCache.data)
        ? pricingCache.data.find((item) => item && item.model_name === config.model)
        : null;
      (selectedModel && Array.isArray(selectedModel.enable_groups) ? selectedModel.enable_groups : [])
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
    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "empty token-empty";
      empty.textContent = "检查后显示可选分组";
      refs.groupFilterList.appendChild(empty);
    }
    groups.forEach((group) => {
      const option = document.createElement("label");
      option.className = "token-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.groupName = group;
      checkbox.checked = selected.has(group);
      const name = document.createElement("span");
      name.textContent = group;
      option.append(checkbox, name);
      refs.groupFilterList.appendChild(option);
    });
    updateGroupFilterSummary();
  }

  function renderCandidates() {
    if (!refs.candidateRows) return;
    refs.candidateRows.replaceChildren();
    const rows = state.candidates
      .slice()
      .sort((left, right) => {
        if (left.available !== right.available) return left.available ? -1 : 1;
        return (left.ratio || Infinity) - (right.ratio || Infinity);
      })
      .slice(0, 8);

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无检查结果";
      refs.candidateRows.appendChild(empty);
      return;
    }

    rows.forEach((candidate) => {
      const row = document.createElement("div");
      row.className = `candidate ${candidate.available ? "candidate-ok" : "candidate-off"}`;
      const name = document.createElement("span");
      name.className = "candidate-name";
      const signal = document.createElement("span");
      signal.className = "candidate-signal";
      signal.setAttribute("aria-hidden", "true");
      const nameLabel = document.createElement("span");
      nameLabel.className = "candidate-name-label";
      nameLabel.textContent = candidate.group;
      name.append(signal, nameLabel);
      const ratio = document.createElement("span");
      ratio.className = "candidate-ratio mono";
      const nominalRatio = document.createElement("span");
      nominalRatio.textContent = formatRatio(candidate.ratio);
      const effectiveRatio = document.createElement("small");
      const pricingModel = normalizeCachePricingModel(candidate && candidate.cachePricingModel);
      const hasEffectiveEstimate = hasEffectiveRatioEstimate(candidate);
      effectiveRatio.textContent = hasEffectiveEstimate
        ? `≈${formatRatio(candidateEffectiveRatio(candidate))}`
        : "≈-";
      ratio.append(nominalRatio, effectiveRatio);
      ratio.title = hasEffectiveEstimate
        ? `实际倍率 = 标称倍率 × 当前缓存成本 ÷ ${pricingModel.baselineHitRate}% 基线缓存成本；命中 $${pricingModel.hitUnitPrice}/M，未命中 $${pricingModel.missUnitPrice}/M`
        : `标称倍率 ${formatRatio(candidate.ratio)}；当前站点没有可确认的缓存计费模型，无法计算实际倍率`;
      ratio.setAttribute(
        "aria-label",
        hasEffectiveEstimate
          ? `标称倍率 ${formatRatio(candidate.ratio)}，实际倍率 ${formatRatio(candidateEffectiveRatio(candidate))}`
          : `标称倍率 ${formatRatio(candidate.ratio)}，实际倍率无法计算`,
      );
      const success = document.createElement("span");
      success.className = "mono";
      success.textContent = formatPercent(candidate.aggregateSuccess);
      const recentSuccess = document.createElement("span");
      recentSuccess.className = "mono health-value";
      recentSuccess.textContent = formatPercent(candidate.recentMinSuccess);
      recentSuccess.title = "最近一次成功率";
      recentSuccess.style.setProperty(
        "--health",
        `${Math.max(0, Math.min(100, Number(candidate.recentMinSuccess) || 0))}%`,
      );
      const firstTokenLatency = document.createElement("span");
      firstTokenLatency.className = "mono";
      firstTokenLatency.textContent = formatLatency(candidate.firstTokenLatencyMs);
      firstTokenLatency.title = "首字延迟";
      const outputLatency = document.createElement("span");
      outputLatency.className = "mono";
      outputLatency.textContent = formatLatency(candidate.outputLatencyMs);
      const outputDetails = [];
      if (Number.isFinite(candidate.outputTokens)) {
        outputDetails.push(`${candidate.outputTokens.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 输出 Token`);
      }
      if (Number.isFinite(candidate.outputTokensPerSecond)) {
        outputDetails.push(`${candidate.outputTokensPerSecond.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} Token/s`);
      }
      outputLatency.title = outputDetails.length
        ? `完整输出耗时 · ${outputDetails.join(" / ")}`
        : "完整输出耗时";
      const cacheHitRate = document.createElement("span");
      cacheHitRate.className = "mono";
      cacheHitRate.textContent = formatPercent(candidate.cacheHitRate);
      cacheHitRate.title = Number.isFinite(candidate.cacheHitRate)
        ? "缓存命中率"
        : `${SITE_LABEL} 当前分组指标未提供缓存命中率`;
      const verdict = document.createElement("span");
      verdict.className = "verdict";
      verdict.textContent = candidate.available
        ? "可用"
        : reasonLabel(candidate.reasons[0] || "不可用");
      row.append(name, ratio, success, recentSuccess, firstTokenLatency, outputLatency, cacheHitRate, verdict);
      refs.candidateRows.appendChild(row);
    });
  }

  function renderManualGroups() {
    if (!refs.manualGroup) return;
    const selectedGroup = refs.manualGroup.value;
    refs.manualGroup.replaceChildren(createOption("", state.candidates.length ? "请选择目标分组" : "暂无检查结果"));

    state.candidates
      .slice()
      .sort((left, right) => {
        if (left.available !== right.available) return left.available ? -1 : 1;
        return (left.ratio || Infinity) - (right.ratio || Infinity);
      })
      .forEach((candidate) => {
        const status = candidate.available
          ? "可用"
          : candidate.reasons.map(reasonLabel).join("、") || "不可用";
        const currentCount = state.tokenResults.filter((result) => result.group === candidate.group).length;
        const current = currentCount ? ` · 当前 ${currentCount}` : "";
        const option = createOption(
          candidate.group,
          `${candidate.group} · ${formatRatio(candidate.ratio)} · 状态：${status}${current}`,
        );
        refs.manualGroup.appendChild(option);
      });

    const preserved = [...refs.manualGroup.options].some(
      (option) => option.value === selectedGroup,
    );
    refs.manualGroup.value = preserved ? selectedGroup : "";
    if (refs.manualHint) {
      const availableCount = state.candidates.filter((candidate) => candidate.available).length;
      refs.manualHint.textContent = state.candidates.length
        ? `${state.candidates.length} 个分组均可人工选择，其中 ${availableCount} 个符合自动策略；账号权限仍由站点接口校验`
        : "请先执行一次立即检查";
    }
    if (refs.manualConfirm) refs.manualConfirm.disabled = running || !refs.manualGroup.value;
  }

  function renderLogs() {
    if (!refs.logs) return;
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
      empty.textContent = "切换后的健康检查未发现需要隔离的分组";
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
      strong.textContent = entry.group;
      strong.title = entry.group;
      name.append(signal, strong);
      const meta = document.createElement("div");
      meta.className = "isolation-meta";
      const model = document.createElement("span");
      model.textContent = entry.model;
      model.title = `模型：${entry.model}`;
      const reason = document.createElement("span");
      reason.textContent = "切换后健康检查失败";
      const remaining = document.createElement("span");
      remaining.className = "isolation-remaining";
      remaining.textContent = `剩余 ${formatIsolationRemaining(entry.until, now)}`;
      meta.append(model, reason, remaining);
      copy.append(name, meta);
      const clear = document.createElement("button");
      clear.className = "isolation-unlock";
      clear.type = "button";
      clear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 9.5-2.1"></path><rect x="5" y="11" width="14" height="10" rx="2"></rect></svg><span>立即解除</span>';
      clear.setAttribute("aria-label", `立即解除 ${entry.group} 的故障隔离`);
      clear.addEventListener("click", () => clearIsolation(entry.model, entry.group));
      row.append(copy, clear);
      refs.isolationRows.appendChild(row);
    });
  }

  function render() {
    if (!root) return;
    if (refs.panel) refs.panel.hidden = state.collapsed;
    if (refs.launcher) refs.launcher.hidden = !state.collapsed;
    positionElement(state.collapsed ? refs.launcher : refs.panel, state.collapsed ? "launcher" : "panel", false);
    if (refs.status) refs.status.textContent = state.status;
    if (refs.status) refs.status.dataset.tone = state.tone;
    if (refs.statusDot) refs.statusDot.dataset.tone = state.tone;
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
        ? `${availableCount} 可用 / ${state.candidates.length} 总计`
        : "等待检查";
    }
    if (refs.candidateCount) refs.candidateCount.textContent = String(state.candidates.length);
    if (refs.tokenResultCount) refs.tokenResultCount.textContent = String(state.tokenResults.length);
    if (refs.logCount) refs.logCount.textContent = String(state.logs.length);
    if (refs.currentGroup) {
      refs.currentGroup.textContent = state.currentGroup;
      refs.currentGroup.title = state.currentGroup;
    }
    if (refs.bestGroup) refs.bestGroup.textContent = state.bestGroup;
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
      refs.todaySpend.title = `消费保护计数 ${formatSpendValue(state.spendProtection.trackedSpend, state.todayUsage.symbol)} / ${formatSpendValue(state.spendProtection.limit, state.todayUsage.symbol)}`;
    }
    if (refs.spendProtectionStatus) {
      refs.spendProtectionStatus.dataset.tone = state.spendProtection.tone;
      refs.spendProtectionStatus.textContent = !config.spendProtectionEnabled
        ? "未启用"
        : config.dailySpendLimit <= 0
          ? "请设置每日上限"
          : !state.todayUsage.available
            ? "等待消费数据"
            : `${formatSpendValue(state.spendProtection.trackedSpend, state.todayUsage.symbol)} / ${formatSpendValue(state.spendProtection.limit, state.todayUsage.symbol)} · ${Math.round(state.spendProtection.ratio * 100)}%`;
    }
    if (refs.enabled) refs.enabled.checked = config.enabled;
    if (refs.monitorEnabled) {
      refs.monitorEnabled.checked = config.enabled;
      refs.monitorEnabled.disabled = running;
    }
    if (refs.monitorMode) refs.monitorMode.textContent = selectionModeLabel(config.selectionMode);
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
    if (refs.model) refs.model.disabled = running;
    if (refs.tokenList) {
      refs.tokenList.querySelectorAll('input[data-token-id]').forEach((checkbox) => {
        checkbox.disabled = running;
      });
    }
    renderManualGroups();
    if (refs.manualGroup) refs.manualGroup.disabled = running || !state.candidates.length;
    if (refs.manualSwitch) refs.manualSwitch.disabled = running;
    renderIsolations();
    if (refs.isolationToast) {
      const undoAvailable = state.isolationUndo.entries.length > 0 && state.isolationUndo.expiresAt > Date.now();
      refs.isolationToast.hidden = !undoAvailable;
      if (undoAvailable && refs.isolationToastMessage) {
        refs.isolationToastMessage.textContent = state.isolationUndo.entries.length === 1
          ? `已解除 ${state.isolationUndo.entries[0].group}`
          : `已解除 ${state.isolationUndo.entries.length} 个分组`;
      }
    }
    renderCandidates();
    renderTokenResults();
    renderLogs();
  }

  function applyTheme() {
    if (!root) return;
    const resolvedTheme = resolveThemeMode(config.theme, systemThemeQuery.matches);
    root.host.dataset.theme = config.theme;
    root.host.dataset.resolvedTheme = resolvedTheme;
    root.host.style.setProperty("--glass-transparency", `${config.glassTransparency}%`);
    root.host.style.setProperty("--panel-glass", resolveGlassMaterial(resolvedTheme, config.glassTransparency));
    if (refs.theme) {
      refs.theme.value = config.theme;
      const labels = { system: "跟随系统", light: "浅色", dark: "深色" };
      refs.theme.title = `皮肤：${labels[config.theme]}`;
    }
    if (refs.glassTransparency) refs.glassTransparency.value = String(config.glassTransparency);
    if (refs.glassTransparencyValue) refs.glassTransparencyValue.textContent = `${config.glassTransparency}%`;
  }

  function readFormConfig() {
    return sanitizeConfig({
      theme: refs.theme.value,
      glassTransparency: refs.glassTransparency.value,
      enabled: refs.enabled.checked,
      tokenIds: [...refs.tokenList.querySelectorAll('input[data-token-id]:checked')]
        .map((checkbox) => checkbox.value),
      model: refs.model.value,
      selectionMode: refs.selectionMode.value,
      groupFilterMode: config.groupFilterMode,
      groupWhitelist: config.groupWhitelist,
      groupBlacklist: config.groupBlacklist,
      spendProtectionEnabled: refs.spendProtectionEnabled.checked,
      dailySpendLimit: refs.dailySpendLimit.value,
      pollSeconds: refs.pollSeconds.value,
      metricHours: refs.metricHours.value,
      minSuccessRate: refs.minSuccessRate.value,
      minLatestSuccessRate: refs.minLatestSuccessRate.value,
      maxMetricAgeMinutes: refs.maxMetricAgeMinutes.value,
      maxFirstTokenLatencySeconds: refs.maxFirstTokenLatencySeconds.value,
      maxOutputDurationSeconds: refs.maxOutputDurationSeconds.value,
      maxGroupRatio: refs.maxGroupRatio.value,
      confirmPolls: refs.confirmPolls.value,
      cooldownMinutes: refs.cooldownMinutes.value,
      rollbackChecks: refs.rollbackChecks.value,
      blacklistMinutes: refs.blacklistMinutes.value,
    });
  }

  function syncForm() {
    if (refs.theme) refs.theme.value = config.theme;
    if (refs.glassTransparency) refs.glassTransparency.value = String(config.glassTransparency);
    if (refs.glassTransparencyValue) refs.glassTransparencyValue.textContent = `${config.glassTransparency}%`;
    refs.enabled.checked = config.enabled;
    refs.selectionMode.value = config.selectionMode;
    refs.spendProtectionEnabled.checked = config.spendProtectionEnabled;
    refs.dailySpendLimit.value = String(config.dailySpendLimit);
    renderGroupFilterOptions();
    refs.pollSeconds.value = String(config.pollSeconds);
    refs.metricHours.value = String(config.metricHours);
    refs.minSuccessRate.value = String(config.minSuccessRate);
    refs.minLatestSuccessRate.value = String(config.minLatestSuccessRate);
    refs.maxMetricAgeMinutes.value = String(config.maxMetricAgeMinutes);
    refs.maxFirstTokenLatencySeconds.value = String(config.maxFirstTokenLatencySeconds);
    refs.maxOutputDurationSeconds.value = String(config.maxOutputDurationSeconds);
    refs.maxGroupRatio.value = String(config.maxGroupRatio);
    refs.confirmPolls.value = String(config.confirmPolls);
    refs.cooldownMinutes.value = String(config.cooldownMinutes);
    refs.rollbackChecks.value = String(config.rollbackChecks);
    refs.blacklistMinutes.value = String(config.blacklistMinutes);
  }

  function persistFormConfig() {
    const previousIdentity = `${config.tokenIds.join(",")}:${config.model}`;
    const wasEnabled = config.enabled;
    config = readFormConfig();
    GM_setValue(STORAGE_CONFIG, config);
    if (state.todayUsage.available) syncSpendProtection({ notify: true });
    if (`${config.tokenIds.join(",")}:${config.model}` !== previousIdentity) {
      pendingCandidates.clear();
      state.candidates = [];
      state.tokenResults = [];
      state.currentGroup = "-";
    }
    if (config.enabled !== wasEnabled) {
      scheduleNext(config.enabled ? 250 : undefined);
      setStatus(config.enabled ? "自动切换已启用" : "自动切换已暂停", config.enabled ? "success" : "warning");
    } else {
      scheduleNext(config.enabled ? 250 : undefined);
      setStatus("设置已自动保存", "success");
    }
    render();
  }

  function setTokenMenuOpen(open) {
    if (!refs.tokenMenu || !refs.tokenSelectToggle) return;
    refs.tokenMenu.hidden = !open;
    refs.tokenSelectToggle.setAttribute("aria-expanded", String(open));
  }

  function setGroupFilterMenuOpen(open) {
    if (!refs.groupFilterMenu || !refs.groupFilterSelectToggle) return;
    refs.groupFilterMenu.hidden = !open;
    refs.groupFilterSelectToggle.setAttribute("aria-expanded", String(open));
  }

  function setActiveView(view, options) {
    state.activeView = normalizeActiveView(view);
    persistUiState();
    setTokenMenuOpen(false);
    setGroupFilterMenuOpen(false);
    if (refs.workspace) refs.workspace.scrollTop = 0;
    render();
    if (options && options.focus) {
      const activeTab = root.querySelector(`[data-view-target="${state.activeView}"]`);
      if (activeTab) activeTab.focus();
    }
  }

  function persistUiState() {
    GM_setValue(STORAGE_UI, {
      activeView: state.activeView,
    });
  }

  function bindUi() {
    bindDrag(refs.launcher, refs.launcher, "launcher");
    bindDrag(refs.header, refs.panel, "panel");
    refs.collapse.addEventListener("click", () => {
      state.collapsed = true;
      render();
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
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = [...root.querySelectorAll("[data-view-target]")];
        const currentIndex = tabs.indexOf(button);
        const targetIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        setActiveView(tabs[targetIndex].dataset.viewTarget, { focus: true });
      });
    });
    refs.check.addEventListener("click", () => runCheck({ manual: true }));
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
      setTokenMenuOpen(refs.tokenMenu.hidden);
    });
    refs.groupFilterSelectToggle.addEventListener("click", () => {
      setGroupFilterMenuOpen(refs.groupFilterMenu.hidden);
    });
    root.addEventListener("click", (event) => {
      if (!refs.tokenSelect.contains(event.target)) setTokenMenuOpen(false);
      if (!refs.groupFilterSelect.contains(event.target)) setGroupFilterMenuOpen(false);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!event.composedPath().includes(root.host)) {
        setTokenMenuOpen(false);
        setGroupFilterMenuOpen(false);
      }
    });
    refs.manualSwitch.addEventListener("click", () => {
      renderManualGroups();
      if (!state.candidates.length) {
        setStatus("请先执行一次立即检查，再选择手动目标分组", "warning");
      }
      refs.manualDialog.showModal();
    });
    refs.manualGroup.addEventListener("change", () => {
      refs.manualConfirm.disabled = running || !refs.manualGroup.value;
    });
    refs.manualConfirm.addEventListener("click", () => {
      const targetGroup = refs.manualGroup.value;
      if (!targetGroup) return;
      refs.manualDialog.close();
      runCheck({ manual: true, forceSwitch: true, targetGroup });
    });
    [refs.manualClose, refs.manualCancel].forEach((button) => {
      button.addEventListener("click", () => refs.manualDialog.close());
    });
    refs.tokenList.addEventListener("change", () => {
      renderTokenSelectionCount();
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
    refs.groupFilterMode.addEventListener("change", () => {
      config = {
        ...config,
        groupFilterMode: refs.groupFilterMode.value === "blacklist" ? "blacklist" : "whitelist",
      };
      pendingCandidates.clear();
      GM_setValue(STORAGE_CONFIG, config);
      renderGroupFilterOptions();
      scheduleNext(config.enabled ? 250 : undefined);
      setStatus("分组名单模式已切换", "success");
    });
    refs.groupFilterList.addEventListener("change", () => {
      const key = groupFilterConfigKey(config.groupFilterMode);
      const groups = [...refs.groupFilterList.querySelectorAll('input[data-group-name]:checked')]
        .map((checkbox) => checkbox.dataset.groupName);
      config = { ...config, [key]: parseAllowedGroups(groups) };
      pendingCandidates.clear();
      GM_setValue(STORAGE_CONFIG, config);
      updateGroupFilterSummary();
      scheduleNext(config.enabled ? 250 : undefined);
      setStatus(`${config.groupFilterMode === "blacklist" ? "黑名单" : "白名单"}已自动保存`, "success");
    });
    refs.clearGroupFilter.addEventListener("click", () => {
      refs.groupFilterList.querySelectorAll('input[data-group-name]').forEach((checkbox) => {
        checkbox.checked = false;
      });
      refs.groupFilterList.dispatchEvent(new Event("change", { bubbles: true }));
    });
    refs.settingsSection.addEventListener("change", (event) => {
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
    document.documentElement.appendChild(host);
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
          --canvas: rgb(10 13 16 / 18%);
          --surface: rgb(255 255 255 / 3.5%);
          --surface-raised: rgb(255 255 255 / 6.5%);
          --surface-active: rgb(255 255 255 / 11.5%);
          --line: rgb(255 255 255 / 9%);
          --line-soft: rgb(255 255 255 / 5.5%);
          --line-strong: rgb(255 255 255 / 16%);
          --text: #f5f7f8;
          --text-soft: #c5cbd1;
          --muted: #89919a;
          --accent: #5ba9ff;
          --accent-ink: #081827;
          --accent-soft: rgb(91 169 255 / 14%);
          --healthy: #58d69a;
          --healthy-soft: rgb(88 214 154 / 12%);
          --info: #79b9ff;
          --info-soft: rgb(91 169 255 / 12%);
          --warning: #f2b94b;
          --warning-soft: rgb(242 185 75 / 10%);
          --danger: #ff716f;
          --danger-soft: rgb(255 113 111 / 9%);
          --focus: rgb(91 169 255 / 34%);
          --toolbar: rgb(28 31 36 / 20%);
          --control: rgb(255 255 255 / 7%);
          --menu: rgb(22 26 31 / 82%);
          --glass-transparency: 0%;
          --panel-glass: linear-gradient(135deg, rgb(31 37 45 / 49%), rgb(13 17 22 / 38%));
          --shadow-panel: 0 34px 90px rgb(0 0 0 / 46%), inset 1px 1px 0 rgb(255 255 255 / 24%), inset -1px -1px 0 rgb(255 255 255 / 4.5%);
          --shadow-menu: 0 16px 38px rgb(0 0 0 / 38%), inset 0 1px 0 rgb(255 255 255 / 8%);
          --dialog-backdrop: rgb(0 0 0 / 62%);
        }
        :host([data-resolved-theme="light"]) {
          color-scheme: light;
          --canvas: rgb(255 255 255 / 15%);
          --surface: rgb(255 255 255 / 28%);
          --surface-raised: rgb(255 255 255 / 46%);
          --surface-active: rgb(255 255 255 / 68%);
          --line: rgb(26 36 44 / 12%);
          --line-soft: rgb(26 36 44 / 7%);
          --line-strong: rgb(26 36 44 / 20%);
          --text: #17212a;
          --text-soft: #2e3942;
          --muted: #4f5b66;
          --accent: #1674d1;
          --accent-ink: #f7fbff;
          --accent-soft: rgb(22 116 209 / 11%);
          --healthy: #16865a;
          --healthy-soft: rgb(22 134 90 / 10%);
          --info: #1674d1;
          --info-soft: rgb(22 116 209 / 9%);
          --warning: #9a6500;
          --warning-soft: rgb(175 113 0 / 10%);
          --danger: #c63e3c;
          --danger-soft: rgb(198 62 60 / 9%);
          --focus: rgb(22 116 209 / 25%);
          --toolbar: rgb(255 255 255 / 20%);
          --control: rgb(255 255 255 / 48%);
          --menu: rgb(244 247 249 / 88%);
          --glass-transparency: 0%;
          --panel-glass: linear-gradient(135deg, rgb(255 255 255 / 62%), rgb(235 240 244 / 48%));
          --shadow-panel: 0 28px 72px rgb(31 44 54 / 22%), inset 1px 1px 0 rgb(255 255 255 / 72%), inset -1px -1px 0 rgb(255 255 255 / 18%);
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
        .launcher, .panel, .manual-dialog {
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
          width: min(480px, calc(100vw - 24px));
          max-height: min(848px, calc(100vh - 24px));
          overflow: auto;
          border: 1px solid var(--line-strong);
          border-radius: 20px;
          background: var(--panel-glass);
          box-shadow: var(--shadow-panel);
          -webkit-backdrop-filter: blur(22px) saturate(175%) contrast(108%);
          backdrop-filter: blur(22px) saturate(175%) contrast(108%);
          scrollbar-color: var(--line-strong) transparent;
          scrollbar-width: thin;
          transition: width 180ms cubic-bezier(.2, .8, .2, 1), height 180ms cubic-bezier(.2, .8, .2, 1), box-shadow 160ms ease;
        }
        .panel::before {
          position: absolute;
          z-index: 8;
          inset: 0 0 auto;
          height: 92px;
          border-radius: 20px 20px 0 0;
          background: linear-gradient(180deg, rgb(255 255 255 / 9%), transparent);
          pointer-events: none;
          content: "";
        }
        .panel::after {
          position: absolute;
          z-index: 8;
          inset: 16px auto 16px 0;
          width: 1px;
          background: linear-gradient(180deg, rgb(255 255 255 / 32%), rgb(255 255 255 / 2%));
          pointer-events: none;
          content: "";
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
        .automation-bar { padding: 9px 0; }
        .protection-bar { margin-bottom: 12px; padding: 9px 0; border-bottom: 1px solid var(--line-soft); }
        .automation-name { margin-right: auto; color: var(--text); font-size: 12px; font-weight: 600; }
        .strategy-select { width: 94px; height: 28px; flex: 0 0 auto; font-size: 10px; }
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
        input[type="number"], input[type="text"], select, .token-select-trigger {
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
        .group-filter-select .token-menu { z-index: 5; }
        .token-toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 5px; }
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
          grid-template-columns: minmax(72px, 1fr) 40px 40px 40px 43px 43px 43px 70px;
          align-items: center;
          gap: 5px;
          min-height: 30px;
          font-size: 10px;
        }
        .candidate-head { padding: 0 12px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface-raised); color: var(--muted); font-size: 8px; font-weight: 650; }
        .candidate { min-height: 39px; padding: 0 12px; border-bottom: 1px solid var(--line-soft); color: var(--text-soft); }
        .candidate:last-child { border-bottom: 0; }
        .candidate:hover { background: var(--surface-raised); }
        .candidate > span:first-child { overflow: hidden; color: var(--text); text-overflow: ellipsis; white-space: nowrap; }
        .candidate-head > span:not(:first-child), .candidate > span:not(:first-child) { text-align: center; }
        .candidate-ok { background: transparent; }
        .candidate-off { color: var(--muted); }
        .candidate-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .candidate-name-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .candidate-ratio { display: grid; justify-items: center; gap: 1px; line-height: 1.05; }
        .candidate-ratio small { color: var(--accent); font-size: 8px; font-weight: 650; }
        .candidate-off .candidate-ratio small { color: var(--muted); }
        .candidate-signal { width: 6px; height: 6px; flex: 0 0 auto; background: var(--warning); }
        .candidate-signal { border-radius: 50%; }
        .candidate-ok .candidate-signal { background: var(--healthy); }
        .health-value { position: relative; padding-bottom: 5px; }
        .health-value::after { position: absolute; right: 0; bottom: 1px; left: 0; width: var(--health); height: 1px; background: var(--healthy); content: ""; }
        .candidate-off .health-value::after { background: var(--warning); }
        .verdict { overflow: hidden; color: var(--warning); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .candidate-ok .verdict { color: var(--healthy); }
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
          width: min(480px, calc(100vw - 24px));
          height: min(760px, calc(100vh - 24px));
          max-height: none;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .work-nav {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          min-height: 52px;
          gap: 3px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line);
          background: rgb(17 19 23 / 12%);
        }
        .work-nav button {
          border: 0;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: var(--muted);
          font-size: 9px;
          font-weight: 650;
          transition: transform 100ms ease-out, background-color 140ms ease-out, color 140ms ease-out;
        }
        .work-nav::before { position: absolute; inset: 10px 14px; z-index: -1; border-radius: 9px; background: rgb(3 5 7 / 28%); box-shadow: inset 0 0 0 1px var(--line-soft); content: ""; }
        .work-nav { position: relative; isolation: isolate; }
        .work-nav button:hover { color: var(--text); background: var(--surface-raised); }
        .work-nav button:active { transform: scale(.97); transition-duration: 80ms; }
        .work-nav button[data-active="true"] { color: var(--text); background: var(--surface-active); box-shadow: 0 1px 4px rgb(0 0 0 / 26%), inset 0 1px 0 rgb(255 255 255 / 8%); }
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
        .settings-section { background: transparent; }
        .route-settings-advanced { min-width: 0; }
        @media (max-width: 520px) {
          .panel { right: 8px; bottom: 8px; width: calc(100vw - 16px); height: calc(100vh - 16px); }
          .command-deck { grid-template-columns: 1fr 1fr; }
          .route-grid, .diagnostics-grid { grid-template-columns: 1fr; }
          .route-grid > .section + .section, .diagnostics-grid > .section + .section { border-top: 1px solid var(--line); border-left: 0; }
        }
        @media (max-width: 390px) {
          .work-nav button { font-size: 9px; }
          .nav-count { display: none; }
          .route-summary { grid-template-columns: 1fr; }
          .route-summary > div + div { border-top: 1px solid var(--line); border-left: 0; }
        }
        @media (max-width: 520px) {
          .panel { right: 8px; bottom: 8px; width: calc(100vw - 16px); max-height: calc(100vh - 16px); }
          .launcher { right: 10px; bottom: 10px; }
          .advanced { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .candidate-head, .candidate { grid-template-columns: minmax(76px, 1fr) 40px 40px 43px 43px 52px; }
          .candidate-head span:nth-child(3), .candidate span:nth-child(3),
          .candidate-head span:nth-child(7), .candidate span:nth-child(7) { display: none; }
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
          .candidate-head, .candidate { grid-template-columns: minmax(70px, 1fr) 39px 41px 41px 48px; gap: 4px; }
          .candidate-head span:nth-child(4), .candidate span:nth-child(4) { display: none; }
          .actions { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
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
      </style>

      <button class="launcher" type="button" title="打开 ${SITE_LABEL} 分组监控" hidden>${SITE_SHORT_LABEL}</button>
      <section class="panel" aria-label="${SITE_LABEL} 分组监控">
        <header class="header" data-ref="header">
          <span class="brand-mark" aria-hidden="true">${SITE_SHORT_LABEL}</span>
          <span class="header-copy">
            <span class="header-title-row">
              <span class="title">${SITE_LABEL} 分组监控</span>
              <span class="update-badge" data-ref="updateBadge" role="status" aria-live="polite" title="" hidden>NEW</span>
            </span>
            <span class="brand-meta"><span class="dot" data-ref="statusDot" title="监控状态"></span><span class="version" data-ref="version" title="当前插件版本">v${SCRIPT_VERSION}</span></span>
          </span>
          <button class="icon-button" data-ref="collapse" type="button" title="收起" aria-label="收起">−</button>
        </header>
        <nav class="work-nav" aria-label="插件工作区" role="tablist">
          <button id="kf-tab-monitor" data-view-target="monitor" data-active="true" role="tab" aria-controls="kf-view-monitor" aria-selected="true" type="button">监控 <span class="nav-count" data-ref="candidateCount">0</span></button>
          <button id="kf-tab-diagnostics" data-view-target="diagnostics" data-active="false" role="tab" aria-controls="kf-view-diagnostics" aria-selected="false" type="button">诊断 <span class="nav-count" data-ref="logCount">0</span></button>
          <button id="kf-tab-settings" data-view-target="settings" data-active="false" role="tab" aria-controls="kf-view-settings" aria-selected="false" type="button">设置</button>
        </nav>
        <div class="status" data-ref="status" role="status" aria-live="polite"></div>
        <main class="workspace" data-ref="workspace">
        <section class="work-view" id="kf-view-monitor" data-view="monitor" role="tabpanel" aria-labelledby="kf-tab-monitor" tabindex="0">
        <section class="overview" aria-label="当前分组概览">
          <div class="route-primary route-node">
            <span class="metric-label">当前分组</span>
            <strong class="route-value" data-ref="currentGroup">-</strong>
          </div>
          <div class="route-best route-node">
            <span class="metric-label">策略推荐</span>
            <strong class="route-best-value" data-ref="bestGroup">-</strong>
            <span class="route-meta">检查 <strong data-ref="lastCheck">-</strong></span>
            <button class="icon-button route-apply" data-ref="switchNow" type="button" title="立即切到策略推荐分组" aria-label="立即切到策略推荐分组">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"></path><path d="M4 20 21 3"></path><path d="M21 16v5h-5"></path><path d="m15 15 6 6"></path><path d="M4 4l5 5"></path></svg>
            </button>
          </div>
        </section>
        <section class="usage-strip" aria-label="账户与今日用量">
          <div class="usage-item"><small>余额</small><strong class="mono" data-ref="balance">-</strong></div>
          <div class="usage-item" data-ref="todaySpendItem" data-spend-tone="none"><small>今日消费</small><strong class="mono" data-ref="todaySpend">-</strong></div>
          <div class="usage-item"><small>今日请求</small><strong class="mono" data-ref="todayRequests">-</strong></div>
          <div class="usage-item"><small>今日 Token</small><strong class="mono" data-ref="todayTokens">-</strong></div>
        </section>
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
          <span class="monitor-auto-copy"><strong>自动切换</strong><span data-ref="monitorMode">省钱优先</span></span>
          <label class="toggle" for="kf-monitor-enabled" title="自动切换">
            <input id="kf-monitor-enabled" data-ref="monitorEnabled" type="checkbox" aria-label="自动切换">
            <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
          </label>
        </div>
        <section class="section candidate-section monitor-candidates">
          <div class="section-head"><h2 class="section-title">分组状态</h2><span class="section-meta" data-ref="candidateSummary">等待检查</span></div>
          <div class="candidate-head"><span>分组</span><span title="上方标称倍率；仅有已确认缓存计费模型时下方显示实际倍率">标/实</span><span>整体</span><span>近期</span><span>首字</span><span>输出</span><span>缓存</span><span>判定</span></div>
          <div data-ref="candidateRows"></div>
        </section>
        </section>
        <section class="work-view settings-view" id="kf-view-settings" data-ref="settingsSection" data-view="settings" role="tabpanel" aria-labelledby="kf-tab-settings" tabindex="0" hidden>
          <div class="view-intro">
            <h2>设置</h2>
            <p>所有更改自动保存</p>
          </div>
        <section class="section control-section settings-section">
          <div class="section-head"><h2 class="section-title">自动路由</h2><span class="section-meta">运行策略与保护</span></div>
          <div class="automation-bar">
            <span class="automation-name">自动切换</span>
            <label class="toggle" for="kf-enabled" title="自动切换">
              <input id="kf-enabled" data-ref="enabled" type="checkbox" aria-label="自动切换">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </label>
            <select class="strategy-select" data-ref="selectionMode" aria-label="分组选择策略" title="分组选择策略">
              <option value="saving">省钱优先</option>
              <option value="stable">稳定优先</option>
              <option value="balanced">均衡推荐</option>
            </select>
          </div>
          <div class="protection-bar">
            <span class="protection-copy">
              <strong>消费保护</strong>
              <small data-ref="spendProtectionStatus" data-tone="none">未启用</small>
            </span>
            <label class="toggle" for="kf-spend-protection" title="消费保护仅提醒，不影响任务">
              <input id="kf-spend-protection" data-ref="spendProtectionEnabled" type="checkbox" aria-label="启用消费保护">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </label>
            <label class="spend-limit-field">
              <span>每日上限</span>
              <input data-ref="dailySpendLimit" type="number" min="0" step="0.01" aria-label="每日消费上限">
            </label>
            <button class="icon-button" data-ref="resetSpendProtection" type="button" title="从当前消费重新计数" aria-label="重置消费保护计数">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path></svg>
            </button>
          </div>
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
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="selectAllTokens" type="button">全选</button>
                    <button class="text-button" data-ref="clearTokens" type="button">清空</button>
                  </div>
                  <div class="token-list" data-ref="tokenList"></div>
                </div>
              </div>
            </div>
            <div class="field">
              <label for="kf-model">${IS_AIHUB ? "目标模型（站点探测）" : "目标模型"}</label>
              <select id="kf-model" data-ref="model"></select>
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
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="clearGroupFilter" type="button">清空当前名单</button>
                  </div>
                  <div class="token-list" data-ref="groupFilterList"></div>
                </div>
              </div>
            </div>
          </div>
        </section>
          <section class="section isolation-section" aria-labelledby="kf-isolation-title">
            <div class="section-head isolation-heading">
              <div class="isolation-heading-copy">
                <h2 class="section-title" id="kf-isolation-title">故障隔离</h2>
                <p class="isolation-description">切换后的健康检查失败时自动隔离，不影响用户黑白名单</p>
              </div>
              <span class="isolation-actions">
                <span class="section-meta" data-ref="isolationCount">当前无隔离</span>
                <button class="text-button" data-ref="clearAllIsolations" type="button">清除全部</button>
              </span>
            </div>
            <div class="isolation-list" data-ref="isolationRows"></div>
          </section>
        <section class="section settings-secondary">
          <details class="route-settings-advanced">
            <summary>判定与保护参数</summary>
            <div class="grid advanced">
              <div class="field"><label>轮询（秒）</label><input data-ref="pollSeconds" type="number" min="15"></div>
              <div class="field"><label>统计窗口（小时）</label><input data-ref="metricHours" type="number" min="1"></div>
              <div class="field"><label>总成功率（%）</label><input data-ref="minSuccessRate" type="number" min="0" max="100" step="0.1"></div>
              <div class="field"><label>最新成功率（%）</label><input data-ref="minLatestSuccessRate" type="number" min="0" max="100" step="0.1"></div>
              <div class="field"><label>指标时效（分钟）</label><input data-ref="maxMetricAgeMinutes" type="number" min="5"></div>
              <div class="field"><label>最大首字延迟（秒）</label><input data-ref="maxFirstTokenLatencySeconds" type="number" min="0" step="0.1"></div>
              <div class="field"><label>最大输出耗时（秒）</label><input data-ref="maxOutputDurationSeconds" type="number" min="0" step="0.1"></div>
              <div class="field"><label>最大倍率（0 不限制）</label><input data-ref="maxGroupRatio" type="number" min="0" step="0.01"></div>
              <div class="field"><label>切换确认次数</label><input data-ref="confirmPolls" type="number" min="1" max="10"></div>
              <div class="field"><label>切换冷却（分钟）</label><input data-ref="cooldownMinutes" type="number" min="0"></div>
              <div class="field"><label>回滚观察次数（0 关闭）</label><input data-ref="rollbackChecks" type="number" min="0" max="10"></div>
              <div class="field"><label>故障拉黑（分钟）</label><input data-ref="blacklistMinutes" type="number" min="1"></div>
            </div>
          </details>
          <div class="settings-appearance">
            <span class="settings-appearance-copy"><strong>界面主题</strong><small>可跟随系统自动切换</small></span>
            <select class="theme-select" data-ref="theme" aria-label="插件皮肤">
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
          <div class="settings-appearance">
            <span class="settings-appearance-copy"><strong id="kf-glass-transparency-label">毛玻璃透明度</strong></span>
            <span class="glass-transparency-control">
              <input id="kf-glass-transparency" class="glass-transparency-range" data-ref="glassTransparency" type="range" min="0" max="100" step="1" aria-labelledby="kf-glass-transparency-label">
              <output class="glass-transparency-value mono" data-ref="glassTransparencyValue" for="kf-glass-transparency">0%</output>
            </span>
          </div>
        </section>
          <div class="settings-footer">
            <span class="settings-version"><strong>脚本更新</strong><small>当前版本 v${SCRIPT_VERSION}</small></span>
            <button class="button settings-update" data-ref="checkUpdate" data-state="idle" data-update="none" type="button" title="检查更新" aria-label="检查更新">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.2 6.2L3 15"></path><path d="M3 21v-6h6"></path><path d="M3 12a9 9 0 0 1 15.2-6.2L21 9"></path><path d="M21 3v6h-6"></path></svg>
              <span data-ref="updateLabel">检查更新</span>
            </button>
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
            <label for="kf-manual-group">目标分组</label>
            <select id="kf-manual-group" data-ref="manualGroup"></select>
            <p class="dialog-hint" data-ref="manualHint"></p>
          </div>
          <div class="dialog-actions">
            <button class="button" data-ref="manualCancel" type="button">取消</button>
            <button class="button button-primary" data-ref="manualConfirm" type="button">确认切换</button>
          </div>
        </form>
      </dialog>
    `;

    const refNames = [
      "launcher", "panel", "header", "workspace", "statusDot", "version", "updateBadge", "theme", "glassTransparency", "glassTransparencyValue", "collapse", "status", "currentGroup", "bestGroup",
      "lastCheck", "balance", "todaySpendItem", "todaySpend", "todayRequests", "todayTokens", "candidateCount", "candidateSummary", "tokenResultCount", "logCount", "settingsSection", "enabled", "monitorEnabled", "monitorMode", "selectionMode", "spendProtectionEnabled", "dailySpendLimit", "spendProtectionStatus", "resetSpendProtection",
      "tokenSelect", "tokenSelectToggle", "tokenSelectLabel", "tokenMenu", "tokenList", "tokenCount", "selectAllTokens", "clearTokens", "model", "groupFilterLabel", "groupFilterMode", "groupFilterSelect", "groupFilterSelectToggle", "groupFilterSelectLabel", "groupFilterCount", "groupFilterMenu", "groupFilterList", "clearGroupFilter", "pollSeconds", "metricHours",
      "minSuccessRate", "minLatestSuccessRate", "maxMetricAgeMinutes",
      "maxFirstTokenLatencySeconds", "maxOutputDurationSeconds", "maxGroupRatio",
      "confirmPolls", "cooldownMinutes", "rollbackChecks", "blacklistMinutes",
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
    if (config.enabled && document.visibilityState === "visible") {
      scheduleNext(250);
    }
  });

  mountUi();
  window.addEventListener("resize", () => {
    positionElement(state.collapsed ? refs.launcher : refs.panel, state.collapsed ? "launcher" : "panel", true);
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
    });
})();
