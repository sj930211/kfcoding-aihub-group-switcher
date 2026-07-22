// ==UserScript==
// @name         KFCoding 智能低倍率分组切换
// @namespace    https://kfcoding.codes/
// @version      0.4.8
// @description  在 KFCoding 和 AIHub 监控分组倍率与可用性，并切换一个或多个 API 密钥。
// @author       sj930211
// @license      MIT
// @homepageURL  https://github.com/sj930211/kfcoding-aihub-group-switcher
// @supportURL   https://github.com/sj930211/kfcoding-aihub-group-switcher/issues
// @downloadURL  https://raw.githubusercontent.com/sj930211/kfcoding-aihub-group-switcher/main/kfcoding-group-switcher.user.js
// @updateURL    https://raw.githubusercontent.com/sj930211/kfcoding-aihub-group-switcher/main/kfcoding-group-switcher.user.js
// @match        https://kfcoding.codes/*
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

  const hostname = String((globalThis.location && globalThis.location.hostname) || "").toLowerCase();
  const SITE_ID = hostname === "aihub.top" ? "aihub" : "kfcoding";
  const IS_AIHUB = SITE_ID === "aihub";
  const SITE_LABEL = IS_AIHUB ? "AIHub" : "KFCoding";
  const AIHUB_MONITOR_MODEL = "AIHub 公共渠道监测";
  const SCRIPT_VERSION = "0.4.8";
  const SCRIPT_DOWNLOAD_URL = "https://raw.githubusercontent.com/sj930211/kfcoding-aihub-group-switcher/main/kfcoding-group-switcher.user.js";

  const DEFAULT_CONFIG = Object.freeze({
    enabled: false,
    tokenIds: [],
    model: "",
    allowedGroups: [],
    pollSeconds: 30,
    metricHours: 24,
    minSuccessRate: 95,
    minLatestSuccessRate: 95,
    maxMetricAgeMinutes: 180,
    maxLatencySeconds: 120,
    minThroughput: 0,
    maxGroupRatio: 0,
    confirmPolls: 2,
    cooldownMinutes: 10,
    rollbackChecks: 2,
    blacklistMinutes: 60,
  });

  const STORAGE_PREFIX = IS_AIHUB ? "aihub-group-switcher" : "kfcoding-group-switcher";
  const STORAGE_CONFIG = `${STORAGE_PREFIX}:config:v1`;
  const STORAGE_LAST_SWITCH = `${STORAGE_PREFIX}:last-switch:v1`;
  const STORAGE_LOGS = `${STORAGE_PREFIX}:logs:v1`;
  const STORAGE_POSITIONS = `${STORAGE_PREFIX}:positions:v1`;
  const STORAGE_SWITCH_GUARD = `${STORAGE_PREFIX}:switch-guard:v1`;
  const MAX_LOG_ENTRIES = 10;
  const VIEWPORT_MARGIN = 8;
  const HOST_ID = `${STORAGE_PREFIX}-host`;
  const GET_REQUEST_TIMEOUT_MS = 25000;
  const MUTATION_REQUEST_TIMEOUT_MS = 30000;
  const GET_MAX_ATTEMPTS = 3;
  const AUTO_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

  function clampNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
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

  function requiresTokenSelection(siteId, options) {
    const request = options && typeof options === "object" ? options : {};
    const isAihubMonitorOnly = siteId === "aihub"
      && Boolean(request.manual)
      && !Boolean(request.forceSwitch)
      && !String(request.targetGroup || "").trim();
    return !isAihubMonitorOnly;
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
      "latency-high",
      "throughput-low",
      "monitor-disabled",
      "latest-unavailable",
    ]);
    return candidate.reasons.some((reason) => healthReasons.has(reason));
  }

  function selectRollbackCandidate(candidates, previousGroup) {
    const previous = candidates.find(
      (candidate) => candidate.group === previousGroup && candidate.available,
    );
    return {
      candidate: previous || selectBestCandidate(candidates, ""),
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
    return {
      enabled: Boolean(source.enabled),
      tokenIds: parseTokenIds(source.tokenIds, source.tokenId),
      model: String(source.model || "").trim(),
      allowedGroups: parseAllowedGroups(source.allowedGroups),
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
      maxLatencySeconds: clampNumber(
        source.maxLatencySeconds,
        DEFAULT_CONFIG.maxLatencySeconds,
        0,
        3600,
      ),
      minThroughput: clampNumber(source.minThroughput, DEFAULT_CONFIG.minThroughput, 0, 100000),
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
      "not-allowed": "不在允许名单",
      "ratio-unknown": "倍率未知",
      "ratio-too-high": "超过倍率上限",
      "metrics-missing": "无性能数据",
      "metrics-stale": "指标已过期",
      "success-low": "总成功率不足",
      "latest-success-low": "最新成功率不足",
      "latency-high": "延迟过高",
      "throughput-low": "吞吐量不足",
      "monitor-disabled": "监测已停用",
      "latest-unavailable": "最新监测不可用",
      "temporarily-blacklisted": "临时拉黑",
    };
    return labels[reason] || reason;
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
    const allowed = new Set(config.allowedGroups || []);
    const enforceAllowList = allowed.size > 0;
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
      const latencyMs = Number(metric && metric.avg_latency_ms);
      const throughput = Number(metric && metric.avg_tps);
      const ageMinutes = latest ? Math.max(0, now - Number(latest.ts)) / 60 : Infinity;

      if (!userGroupNames.has(group)) reasons.push("not-user-selectable");
      if (enforceAllowList && !allowed.has(group)) reasons.push("not-allowed");
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
        config.maxLatencySeconds > 0 &&
        (!Number.isFinite(latencyMs) || latencyMs <= 0 || latencyMs > config.maxLatencySeconds * 1000)
      ) {
        reasons.push("latency-high");
      }
      if (
        config.minThroughput > 0 &&
        (!Number.isFinite(throughput) || throughput < config.minThroughput)
      ) {
        reasons.push("throughput-low");
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
        latencyMs,
        throughput,
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

  function evaluateAihubCandidates(summaryPayload, seriesPayload, groupsPayload, ratesPayload, config, nowMs) {
    const summary = summaryPayload && typeof summaryPayload === "object" ? summaryPayload : {};
    const seriesByApiId = seriesPayload && seriesPayload.seriesByApiId && typeof seriesPayload.seriesByApiId === "object"
      ? seriesPayload.seriesByApiId
      : {};
    const groups = normalizeAihubGroups(groupsPayload);
    const groupMap = new Map(groups.map((group) => [Number(group.id), group]));
    const rates = normalizeAihubRates(ratesPayload);
    const allowed = new Set(config.allowedGroups || []);
    const enforceAllowList = allowed.size > 0;
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
        const successKey = aihubMonitorRange(config.metricHours);
        const summarySuccess = Number(
          monitor.successRates && (monitor.successRates[successKey] ?? monitor.successRates["24h"]),
        );
        const aggregateSuccess = Number.isFinite(summarySuccess) ? summarySuccess * 100 : NaN;
        const latestSuccess = latestPoint ? (latestPoint.available ? 100 : 0) : NaN;
        const checkedAtMs = Date.parse(monitor.checkedAt || summary.generatedAt || "");
        const ageMinutes = Number.isFinite(checkedAtMs)
          ? Math.max(0, now - checkedAtMs) / 60000
          : Infinity;
        const latencyMs = Number(monitor.firstTokenLatencyMs);
        const throughput = Number(monitor.outputTokensPerSecond);

        if (!groupMeta) reasons.push("not-user-selectable");
        if (enforceAllowList && !allowed.has(group)) reasons.push("not-allowed");
        if (!Number.isFinite(ratio) || ratio <= 0) reasons.push("ratio-unknown");
        if (config.maxGroupRatio > 0 && Number.isFinite(ratio) && ratio > config.maxGroupRatio) {
          reasons.push("ratio-too-high");
        }
        if (summary.monitoringActive === false || monitor.enabled === false) reasons.push("monitor-disabled");
        if (monitor.available !== true) reasons.push("latest-unavailable");
        if (ageMinutes > config.maxMetricAgeMinutes) reasons.push("metrics-stale");
        if (!Number.isFinite(aggregateSuccess) || aggregateSuccess < config.minSuccessRate) {
          reasons.push("success-low");
        }
        if (!Number.isFinite(latestSuccess) || latestSuccess < config.minLatestSuccessRate) {
          reasons.push("latest-success-low");
        }
        if (
          config.maxLatencySeconds > 0 &&
          (!Number.isFinite(latencyMs) || latencyMs <= 0 || latencyMs > config.maxLatencySeconds * 1000)
        ) reasons.push("latency-high");
        if (
          config.minThroughput > 0 &&
          (!Number.isFinite(throughput) || throughput < config.minThroughput)
        ) reasons.push("throughput-low");

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
          latencyMs,
          throughput,
          ageMinutes,
        };
      });
  }

  function selectBestCandidate(candidates, currentGroup) {
    const available = candidates
      .filter((candidate) => candidate.available)
      .slice()
      .sort((left, right) => {
        if (left.ratio !== right.ratio) return left.ratio - right.ratio;
        if (left.aggregateSuccess !== right.aggregateSuccess) {
          return right.aggregateSuccess - left.aggregateSuccess;
        }
        const leftLatency = Number.isFinite(left.latencyMs) ? left.latencyMs : Infinity;
        const rightLatency = Number.isFinite(right.latencyMs) ? right.latencyMs : Infinity;
        return leftLatency - rightLatency;
      });

    if (!available.length) return null;
    const current = available.find((candidate) => candidate.group === currentGroup);
    if (current && current.ratio === available[0].ratio) return current;
    return available[0];
  }

  function selectSwitchCandidate(candidates, currentGroup, targetGroup) {
    const target = String(targetGroup || "").trim();
    if (!target) return selectBestCandidate(candidates, currentGroup);

    const candidate = candidates.find((item) => item.group === target);
    if (!candidate) {
      throw new Error(`目标分组 ${target} 不在当前模型的可选范围内`);
    }
    if (!candidate.available) {
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

  function normalizeKfcodingTodayUsage(payload, statusPayload, accountPayload) {
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
      // KFCoding's own dashboard extends the end boundary by one hour so the
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
    aihubMonitorRange,
    buildTokenUpdatePayload,
    clampPosition,
    evaluateAihubCandidates,
    evaluateCandidates,
    extractUserscriptVersion,
    formatBalance,
    formatTokenCount,
    compareVersions,
    applyTemporaryBlacklist,
    candidateHasHealthFailure,
    normalizeLogs,
    normalizeAihubTodayUsage,
    normalizeAihubToken,
    normalizeKfcodingTodayUsage,
    normalizeSwitchHistory,
    normalizeSwitchGuardState,
    normalizeUiPositions,
    parseAllowedGroups,
    parseTokenIds,
    pruneSwitchGuardState,
    requestJsonWithRetry,
    requiresTokenSelection,
    sanitizeConfig,
    selectBestCandidate,
    selectRollbackCandidate,
    selectSwitchCandidate,
    shouldSwitchCandidate,
    summarizeTokenGroups,
    tokenSupportsModel,
    todayTimestampRange,
  });

  if (globalThis.__KFCODING_GROUP_SWITCHER_TEST__) {
    globalThis.__KFCODING_GROUP_SWITCHER_API__ = TEST_API;
    return;
  }

  let config = sanitizeConfig({ ...DEFAULT_CONFIG, ...GM_getValue(STORAGE_CONFIG, {}) });
  if (IS_AIHUB) config = { ...config, model: AIHUB_MONITOR_MODEL };
  let scheduler = null;
  let root = null;
  let refs = {};
  let running = false;
  let pricingCache = null;
  let tokensCache = [];
  let userGroupsCache = {};
  let aihubGroupsCache = [];
  let aihubRatesCache = {};
  const inflightGetRequests = new Map();
  const pendingCandidates = new Map();
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
    logs: normalizeLogs(GM_getValue(STORAGE_LOGS, [])),
    positions: normalizeUiPositions(GM_getValue(STORAGE_POSITIONS, {})),
    collapsed: false,
    update: {
      checking: false,
      availableVersion: "",
      lastCheckedAt: 0,
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
        if (isNewDiscovery) addLog(`发现新版本 v${remoteVersion}`, "success");
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
      if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
      drag.moved = true;
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
      drag = null;
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function requestHeaders(hasBody) {
    const headers = { Accept: "application/json" };
    if (IS_AIHUB) {
      const authToken = window.localStorage.getItem("auth_token");
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      headers["Accept-Language"] = "zh";
    } else {
      const uid = window.localStorage.getItem("uid");
      if (uid) headers["New-Api-User"] = uid;
    }
    if (hasBody) headers["Content-Type"] = "application/json";
    return headers;
  }

  function unwrapSiteResponse(payload) {
    if (!IS_AIHUB || !payload || typeof payload !== "object" || !("code" in payload)) {
      return payload;
    }
    if (Number(payload.code) !== 0) {
      throw new Error(payload.message || `AIHub 接口返回错误码 ${payload.code}`);
    }
    return payload.data;
  }

  async function fetchJson(path, options) {
    const request = options || {};
    const method = String(request.method || "GET").toUpperCase();
    const execute = async () => unwrapSiteResponse(await requestJsonWithRetry(path, {
      ...request,
      method,
      headers: requestHeaders(request.body !== undefined),
    }));

    if (method !== "GET") return execute();
    if (inflightGetRequests.has(path)) return inflightGetRequests.get(path);

    const pending = execute().finally(() => inflightGetRequests.delete(path));
    inflightGetRequests.set(path, pending);
    return pending;
  }

  function normalizeTokenList(payload) {
    if (IS_AIHUB) {
      const items = payload && Array.isArray(payload.items) ? payload.items : [];
      return items.map(normalizeAihubToken);
    }
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
      if (IS_AIHUB) {
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
        usage = normalizeKfcodingTodayUsage(payload, status, account);
      }
      state.todayUsage = { ...usage, available: true, loading: false, error: "" };
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
    if (IS_AIHUB) {
      const [tokenList, groups, rates] = await Promise.all([
        fetchJson("/api/v1/keys?page=1&page_size=100"),
        fetchJson("/api/v1/groups/available"),
        fetchJson("/api/v1/groups/rates"),
      ]);
      tokensCache = normalizeTokenList(tokenList);
      aihubGroupsCache = normalizeAihubGroups(groups);
      aihubRatesCache = normalizeAihubRates(rates);
      pricingCache = { data: [{ model_name: AIHUB_MONITOR_MODEL }] };
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
    const payload = IS_AIHUB
      ? await fetchJson("/api/v1/keys?page=1&page_size=100")
      : await fetchJson("/api/token/?p=1&size=100");
    tokensCache = normalizeTokenList(payload);
    renderOptions(true);
    render();
  }

  async function getTokenDetail(tokenId) {
    if (IS_AIHUB) {
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
    if (IS_AIHUB) {
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
    if (IS_AIHUB) {
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
    const rollbackTarget = selectRollbackCandidate(eligible, guard.fromGroup);
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
    const selected = selectSwitchCandidate(candidates, token.group, targetGroup);
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
        message: targetGroup ? "已是手动目标分组" : "已是最低可用倍率",
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
      setStatus(`请先选择至少一个 API 密钥${IS_AIHUB ? "" : "和目标模型"}`, "warning");
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
    try {
      let candidates;
      if (IS_AIHUB) {
        const range = aihubMonitorRange(config.metricHours);
        const [summary, series, groups, rates] = await Promise.all([
          fetchJson("/api/v1/public/monitor/summary"),
          fetchJson(`/api/v1/public/monitor/series/${range}`),
          fetchJson("/api/v1/groups/available"),
          fetchJson("/api/v1/groups/rates"),
        ]);
        aihubGroupsCache = normalizeAihubGroups(groups);
        aihubRatesCache = normalizeAihubRates(rates);
        pricingCache = { data: [{ model_name: AIHUB_MONITOR_MODEL }] };
        candidates = evaluateAihubCandidates(
          summary,
          series,
          aihubGroupsCache,
          aihubRatesCache,
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
      const lowestAvailable = selectBestCandidate(candidates, "");
      state.candidates = candidates;
      state.bestGroup = lowestAvailable
        ? `${lowestAvailable.group} ${formatRatio(lowestAvailable.ratio)}`
        : "无可用分组";
      state.lastCheck = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      if (targetGroup) selectSwitchCandidate(candidates, "", targetGroup);
      if (!targetGroup && !lowestAvailable && !selectedTokenIds.length) {
        const reasonSummary = summarizeFailures(candidates);
        throw new Error(`没有满足条件的分组${reasonSummary ? `：${reasonSummary}` : ""}`);
      }

      if (!selectedTokenIds.length) {
        const availableCount = candidates.filter((candidate) => candidate.available).length;
        state.tokenResults = [];
        state.currentGroup = "-";
        addLog(`分组状态已更新：${candidates.length} 个分组，${availableCount} 个可用`, "success");
        setStatus(`已检查 ${candidates.length} 个分组，${availableCount} 个可用`, "success");
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
      } else if (warningCount > 0) {
        setStatus(`已检查 ${state.tokenResults.length} 个 API 密钥，${actionSummary}`, "warning");
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
      await Promise.all([
        runCheck({ manual: false }),
        checkForUpdate({ silent: true }),
      ]);
      scheduleNext(config.pollSeconds * 1000);
    }, delayMs == null ? config.pollSeconds * 1000 : delayMs);
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
    const value = Number(usage.spend) || 0;
    const digits = value > 0 && value < 0.0001 ? 6 : 4;
    return `${usage.symbol || ""}${value.toFixed(digits)}`;
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
      name.textContent = candidate.group;
      const ratio = document.createElement("span");
      ratio.className = "mono";
      ratio.textContent = formatRatio(candidate.ratio);
      const success = document.createElement("span");
      success.className = "mono";
      success.textContent = formatPercent(candidate.aggregateSuccess);
      const recentSuccess = document.createElement("span");
      recentSuccess.className = "mono";
      recentSuccess.textContent = formatPercent(candidate.recentMinSuccess);
      recentSuccess.title = "最近一次成功率";
      const latency = document.createElement("span");
      latency.className = "mono";
      latency.textContent = formatLatency(candidate.latencyMs);
      const verdict = document.createElement("span");
      verdict.className = "verdict";
      verdict.textContent = candidate.available
        ? "可用"
        : reasonLabel(candidate.reasons[0] || "不可用");
      row.append(name, ratio, success, recentSuccess, latency, verdict);
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
          : reasonLabel(candidate.reasons[0] || "不可用");
        const currentCount = state.tokenResults.filter((result) => result.group === candidate.group).length;
        const current = currentCount ? ` · 当前 ${currentCount}` : "";
        const option = createOption(
          candidate.group,
          `${candidate.group} · ${formatRatio(candidate.ratio)} · ${status}${current}`,
        );
        option.disabled = !candidate.available;
        refs.manualGroup.appendChild(option);
      });

    const preserved = [...refs.manualGroup.options].some(
      (option) => option.value === selectedGroup && !option.disabled,
    );
    refs.manualGroup.value = preserved ? selectedGroup : "";
    if (refs.manualHint) {
      const availableCount = state.candidates.filter((candidate) => candidate.available).length;
      refs.manualHint.textContent = state.candidates.length
        ? `最近检查有 ${availableCount} 个可用分组，确认时会再次校验`
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

  function render() {
    if (!root) return;
    if (refs.panel) refs.panel.hidden = state.collapsed;
    if (refs.launcher) refs.launcher.hidden = !state.collapsed;
    positionElement(state.collapsed ? refs.launcher : refs.panel, state.collapsed ? "launcher" : "panel", false);
    if (refs.status) refs.status.textContent = state.status;
    if (refs.statusDot) refs.statusDot.dataset.tone = state.tone;
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
    if (refs.enabled) refs.enabled.checked = config.enabled;
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
    }
    if (refs.selectAllTokens) refs.selectAllTokens.disabled = running;
    if (refs.clearTokens) refs.clearTokens.disabled = running;
    if (refs.model) refs.model.disabled = running || IS_AIHUB;
    if (refs.tokenList) {
      refs.tokenList.querySelectorAll('input[data-token-id]').forEach((checkbox) => {
        checkbox.disabled = running;
      });
    }
    renderManualGroups();
    if (refs.manualGroup) refs.manualGroup.disabled = running || !state.candidates.length;
    if (refs.manualSwitch) refs.manualSwitch.disabled = running;
    renderCandidates();
    renderTokenResults();
    renderLogs();
  }

  function readFormConfig() {
    return sanitizeConfig({
      enabled: refs.enabled.checked,
      tokenIds: [...refs.tokenList.querySelectorAll('input[data-token-id]:checked')]
        .map((checkbox) => checkbox.value),
      model: refs.model.value,
      allowedGroups: refs.allowedGroups.value,
      pollSeconds: refs.pollSeconds.value,
      metricHours: refs.metricHours.value,
      minSuccessRate: refs.minSuccessRate.value,
      minLatestSuccessRate: refs.minLatestSuccessRate.value,
      maxMetricAgeMinutes: refs.maxMetricAgeMinutes.value,
      maxLatencySeconds: refs.maxLatencySeconds.value,
      minThroughput: refs.minThroughput.value,
      maxGroupRatio: refs.maxGroupRatio.value,
      confirmPolls: refs.confirmPolls.value,
      cooldownMinutes: refs.cooldownMinutes.value,
      rollbackChecks: refs.rollbackChecks.value,
      blacklistMinutes: refs.blacklistMinutes.value,
    });
  }

  function syncForm() {
    refs.enabled.checked = config.enabled;
    refs.allowedGroups.value = config.allowedGroups.join(", ");
    refs.pollSeconds.value = String(config.pollSeconds);
    refs.metricHours.value = String(config.metricHours);
    refs.minSuccessRate.value = String(config.minSuccessRate);
    refs.minLatestSuccessRate.value = String(config.minLatestSuccessRate);
    refs.maxMetricAgeMinutes.value = String(config.maxMetricAgeMinutes);
    refs.maxLatencySeconds.value = String(config.maxLatencySeconds);
    refs.minThroughput.value = String(config.minThroughput);
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
    refs.check.addEventListener("click", () => runCheck({ manual: true }));
    refs.checkUpdate.addEventListener("click", handleUpdateAction);
    refs.switchNow.addEventListener("click", () => runCheck({ manual: true, forceSwitch: true }));
    refs.tokenSelectToggle.addEventListener("click", () => {
      setTokenMenuOpen(refs.tokenMenu.hidden);
    });
    root.addEventListener("click", (event) => {
      if (!refs.tokenSelect.contains(event.target)) setTokenMenuOpen(false);
    });
    document.addEventListener("pointerdown", (event) => {
      if (!event.composedPath().includes(root.host)) setTokenMenuOpen(false);
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
    refs.settingsSection.addEventListener("change", (event) => {
      if (event.target.closest(".token-list")) return;
      persistFormConfig();
    });
  }

  function mountUi() {
    if (document.getElementById(HOST_ID)) return;
    const host = document.createElement("div");
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { all: initial; position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, select { font: inherit; letter-spacing: 0; }
        button { cursor: pointer; }
        .launcher, .panel {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 2147483000;
          font-family: "Avenir Next", "Helvetica Neue", ui-sans-serif, sans-serif;
          color: oklch(92% .018 250);
          pointer-events: auto;
        }
        .launcher {
          width: 50px;
          height: 50px;
          border: 1px solid oklch(48% .035 250);
          border-radius: 15px;
          background: oklch(20% .035 250);
          color: oklch(86% .16 145);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: .08em;
          box-shadow: 0 16px 34px oklch(8% .04 250 / .5), 0 0 0 1px oklch(82% .15 145 / .08);
          cursor: grab;
          touch-action: none;
        }
        .panel {
          width: min(460px, calc(100vw - 24px));
          max-height: min(800px, calc(100vh - 24px));
          overflow: auto;
          border: 1px solid oklch(36% .035 250);
          border-radius: 18px;
          background: oklch(15% .028 250);
          box-shadow: 0 24px 70px oklch(5% .04 250 / .62), 0 0 0 1px oklch(82% .15 145 / .06);
        }
        .panel[hidden], .launcher[hidden] { display: none; }
        .header {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 64px;
          padding: 13px 15px;
          border-bottom: 1px solid oklch(30% .03 250);
          background: oklch(18% .035 250);
          cursor: grab;
          touch-action: none;
          user-select: none;
        }
        .header-copy { display: grid; gap: 2px; min-width: 0; flex: 1; }
        .eyebrow { color: oklch(70% .035 250); font-size: 9px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
        .title { font-size: 15px; font-weight: 750; letter-spacing: 0; }
        .dot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: oklch(62% .025 250); box-shadow: 0 0 0 4px oklch(62% .025 250 / .12); }
        .dot[data-tone="running"] { background: oklch(74% .15 85); box-shadow: 0 0 0 4px oklch(74% .15 85 / .12); }
        .dot[data-tone="success"] { background: oklch(78% .16 145); box-shadow: 0 0 0 4px oklch(78% .16 145 / .12); }
        .dot[data-tone="warning"] { background: oklch(78% .14 78); box-shadow: 0 0 0 4px oklch(78% .14 78 / .12); }
        .dot[data-tone="error"] { background: oklch(69% .19 25); box-shadow: 0 0 0 4px oklch(69% .19 25 / .12); }
        .icon-button {
          position: relative;
          display: inline-grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: oklch(72% .025 250);
          padding: 0;
          line-height: 1;
        }
        .icon-button:hover { background: oklch(28% .035 250); color: oklch(95% .02 250); }
        .icon-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
        .icon-button[data-update="available"]::after {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 6px;
          height: 6px;
          border: 1px solid oklch(18% .035 250);
          border-radius: 50%;
          background: oklch(78% .16 145);
          content: "";
        }
        .icon-button[data-state="checking"] svg { animation: update-spin .8s linear infinite; }
        @keyframes update-spin { to { transform: rotate(360deg); } }
        .status { padding: 11px 15px 12px; font-size: 11px; line-height: 1.45; color: oklch(70% .03 250); }
        .summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1px;
          border-top: 1px solid oklch(29% .03 250);
          border-bottom: 1px solid oklch(29% .03 250);
          background: oklch(29% .03 250);
        }
        .summary > div { min-width: 0; padding: 11px 12px; background: oklch(20% .035 250); }
        .summary small { display: block; margin-bottom: 4px; color: oklch(64% .03 250); font-size: 9px; letter-spacing: .04em; text-transform: uppercase; }
        .summary strong { display: block; overflow: hidden; text-overflow: ellipsis; color: oklch(94% .02 250); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; white-space: nowrap; }
        .summary > div:nth-child(2) strong { color: oklch(82% .16 145); }
        .today-summary { border-top: 0; }
        .today-summary > div { background: oklch(18% .03 250); }
        .today-summary strong { color: oklch(83% .13 85); }
        .section { padding: 15px; border-bottom: 1px solid oklch(29% .03 250); }
        .section:last-child { border-bottom: 0; }
        .section-title { margin: 0 0 10px; font-size: 11px; font-weight: 750; color: oklch(84% .02 250); letter-spacing: .05em; text-transform: uppercase; }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .selector-grid {
          display: grid;
          grid-template-columns: minmax(190px, 1.15fr) minmax(150px, .85fr);
          align-items: end;
          gap: 10px;
        }
        .field { min-width: 0; }
        .field-wide { grid-column: 1 / -1; }
        label { display: block; margin-bottom: 5px; color: oklch(69% .025 250); font-size: 10px; font-weight: 600; }
        input[type="number"], input[type="text"], select {
          width: 100%;
          min-width: 0;
          height: 36px;
          border: 1px solid oklch(36% .035 250);
          border-radius: 9px;
          background: oklch(20% .035 250);
          color: oklch(93% .02 250);
          padding: 0 10px;
          font-size: 12px;
          outline: none;
        }
        input:focus, select:focus { border-color: oklch(76% .16 145); box-shadow: 0 0 0 3px oklch(76% .16 145 / .14); }
        .control-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .switch-row { display: flex; min-height: 36px; align-items: center; justify-content: space-between; gap: 12px; flex: 1; }
        .switch-row label { margin: 0; color: oklch(91% .02 250); font-size: 12px; font-weight: 700; }
        input[type="checkbox"] { width: 18px; height: 18px; accent-color: oklch(76% .16 145); }
        details { margin-top: 12px; border: 1px solid oklch(32% .03 250); border-radius: 10px; overflow: hidden; }
        summary { cursor: pointer; padding: 9px 10px; color: oklch(77% .025 250); font-size: 10px; font-weight: 700; list-style-position: inside; }
        summary:hover { color: oklch(90% .02 250); background: oklch(24% .035 250); }
        .advanced { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 0 10px 10px; }
        .advanced label { display: flex; align-items: end; min-height: 24px; }
        .token-select { position: relative; }
        .token-select-trigger {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 8px;
          width: 100%;
          height: 36px;
          border: 1px solid oklch(36% .035 250);
          border-radius: 9px;
          background: oklch(20% .035 250);
          color: oklch(93% .02 250);
          padding: 0 10px;
          text-align: left;
        }
        .token-select-trigger:hover { border-color: oklch(48% .035 250); background: oklch(23% .035 250); }
        .token-select-trigger:focus { border-color: oklch(76% .16 145); box-shadow: 0 0 0 3px oklch(76% .16 145 / .14); outline: none; }
        .token-select-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-count { color: oklch(68% .025 250); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; }
        .chevron { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; transition: transform .16s ease; }
        .token-select-trigger[aria-expanded="true"] .chevron { transform: rotate(180deg); }
        .token-menu {
          position: absolute;
          z-index: 6;
          top: calc(100% + 6px);
          right: 0;
          left: 0;
          padding: 8px;
          border: 1px solid oklch(39% .035 250);
          border-radius: 10px;
          background: oklch(17% .032 250);
          box-shadow: 0 16px 34px oklch(6% .04 250 / .58);
        }
        .token-menu[hidden] { display: none; }
        .token-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-bottom: 6px; }
        .text-button { border: 0; background: transparent; color: oklch(77% .14 145); padding: 2px; font-size: 10px; }
        .text-button:hover { color: oklch(88% .15 145); text-decoration: underline; }
        .text-button:disabled { cursor: wait; opacity: .5; text-decoration: none; }
        .token-list { max-height: 184px; overflow: auto; border: 1px solid oklch(32% .03 250); border-radius: 8px; background: oklch(19% .03 250); }
        .token-option { display: flex; align-items: center; gap: 8px; min-height: 34px; margin: 0; padding: 6px 9px; border-bottom: 1px solid oklch(29% .03 250); color: oklch(88% .02 250); cursor: pointer; }
        .token-option:last-child { border-bottom: 0; }
        .token-option:hover { background: oklch(24% .035 250); }
        .token-option span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-empty { padding: 8px; }
        .actions { display: flex; gap: 8px; margin-top: 13px; flex-wrap: wrap; }
        .button {
          min-height: 36px;
          border: 1px solid oklch(40% .035 250);
          border-radius: 9px;
          background: oklch(22% .035 250);
          color: oklch(88% .02 250);
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 700;
        }
        .button:hover { background: oklch(28% .035 250); border-color: oklch(48% .035 250); }
        .button:disabled { cursor: wait; opacity: .55; }
        .button-primary { border-color: oklch(71% .16 145); background: oklch(72% .16 145); color: oklch(15% .04 145); }
        .button-primary:hover { background: oklch(79% .16 145); }
        .button-switch { border-color: oklch(58% .13 75); background: oklch(31% .07 75); color: oklch(88% .13 85); }
        .button-switch:hover { background: oklch(38% .09 75); }
        .manual-dialog {
          width: min(380px, calc(100vw - 32px));
          border: 1px solid oklch(39% .035 250);
          border-radius: 16px;
          background: oklch(17% .032 250);
          color: oklch(92% .018 250);
          padding: 0;
          box-shadow: 0 24px 70px oklch(5% .04 250 / .72);
          font-family: "Avenir Next", "Helvetica Neue", ui-sans-serif, sans-serif;
          pointer-events: auto;
        }
        .manual-dialog::backdrop { background: oklch(5% .025 250 / .72); }
        .dialog-form { padding: 16px; }
        .dialog-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
        .dialog-title { flex: 1; margin: 0; font-size: 15px; letter-spacing: 0; }
        .dialog-hint { min-height: 18px; margin: 7px 0 0; color: oklch(68% .025 250); font-size: 10px; line-height: 1.5; }
        .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
        .candidate-head, .candidate {
          display: grid;
          grid-template-columns: minmax(78px, 1fr) 46px 52px 52px 48px minmax(62px, auto);
          align-items: center;
          gap: 6px;
          min-height: 28px;
          font-size: 10px;
        }
        .candidate-head { color: oklch(61% .025 250); border-bottom: 1px solid oklch(31% .03 250); }
        .candidate { border-bottom: 1px solid oklch(28% .03 250); }
        .candidate:last-child { border-bottom: 0; }
        .candidate > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .candidate-ok .verdict { color: oklch(78% .16 145); }
        .candidate-off { color: oklch(61% .025 250); }
        .candidate-off .verdict { color: oklch(78% .14 78); }
        .token-result { display: grid; grid-template-columns: minmax(80px, .8fr) minmax(58px, .6fr) minmax(110px, 1.2fr); align-items: center; gap: 7px; min-height: 31px; border-bottom: 1px solid oklch(28% .03 250); font-size: 10px; }
        .token-result:last-child { border-bottom: 0; }
        .token-result span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-result-success span:last-child { color: oklch(78% .16 145); }
        .token-result-warning span:last-child { color: oklch(78% .14 78); }
        .token-result-error span:last-child { color: oklch(70% .19 25); }
        .mono { font-variant-numeric: tabular-nums; }
        .logs { display: grid; gap: 6px; }
        .log { display: grid; grid-template-columns: 58px 1fr; gap: 8px; font-size: 10px; line-height: 1.4; color: oklch(68% .025 250); }
        .log-error { color: oklch(70% .19 25); }
        .log-success { color: oklch(78% .16 145); }
        .empty { padding: 8px 0; color: oklch(59% .025 250); font-size: 10px; }
        .secondary-details { margin: 0; border: 0; border-top: 1px solid oklch(29% .03 250); border-radius: 0; }
        .secondary-details > summary { padding: 13px 15px; }
        .secondary-details > div { padding: 0 15px 15px; }
        .secondary-details .section-title { margin-top: 2px; }
        @media (max-width: 520px) {
          .panel { right: 12px; bottom: 12px; max-height: calc(100vh - 24px); }
          .launcher { right: 12px; bottom: 12px; }
          .grid { grid-template-columns: 1fr; }
          .advanced { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .selector-grid { grid-template-columns: minmax(0, 1fr) minmax(128px, .72fr); }
          .field-wide { grid-column: auto; }
          .candidate-head, .candidate { grid-template-columns: minmax(78px, 1fr) 44px 50px 50px minmax(58px, auto); }
          .candidate-head span:nth-child(5), .candidate span:nth-child(5) { display: none; }
        }
        @media (max-width: 380px) {
          .selector-grid { grid-template-columns: 1fr; }
          .control-row { align-items: stretch; flex-direction: column; }
          .candidate-head, .candidate { grid-template-columns: minmax(72px, 1fr) 40px 48px minmax(48px, auto); gap: 5px; }
          .candidate-head span:nth-child(3), .candidate span:nth-child(3) { display: none; }
        }

        /* Monitoring console redesign */
        :host {
          --surface-0: #0b0d0e;
          --surface-1: #111516;
          --surface-2: #181d1e;
          --surface-3: #202728;
          --line: #303839;
          --line-soft: #232a2b;
          --text: #f2f5f3;
          --muted: #a5afaa;
          --muted-strong: #c8cfcb;
          --green: #8bd697;
          --green-deep: #1e492b;
          --amber: #f0bf62;
          --amber-deep: #5b4217;
          --red: #ff8278;
        }
        .launcher, .panel {
          font-family: Inter, "Avenir Next", "Helvetica Neue", Arial, sans-serif;
          color: var(--text);
        }
        .launcher {
          width: 46px;
          height: 46px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--surface-2);
          color: var(--green);
          box-shadow: 0 16px 34px rgb(0 0 0 / 42%);
          font-size: 12px;
          letter-spacing: 0;
        }
        .panel {
          width: min(488px, calc(100vw - 24px));
          max-height: min(840px, calc(100vh - 24px));
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--surface-0);
          box-shadow: 0 26px 72px rgb(0 0 0 / 56%);
        }
        .header {
          min-height: 58px;
          padding: 11px 14px;
          gap: 9px;
          border-bottom-color: var(--line-soft);
          background: var(--surface-1);
        }
        .header-copy { gap: 1px; }
        .eyebrow {
          color: var(--muted);
          font-size: 9px;
          letter-spacing: 0;
        }
        .title { font-size: 14px; font-weight: 750; }
        .dot { width: 8px; height: 8px; background: var(--muted); box-shadow: 0 0 0 3px rgb(165 175 170 / 14%); }
        .dot[data-tone="running"] { background: var(--amber); box-shadow: 0 0 0 3px rgb(240 191 98 / 14%); }
        .dot[data-tone="success"] { background: var(--green); box-shadow: 0 0 0 3px rgb(139 214 151 / 14%); }
        .dot[data-tone="warning"] { background: var(--amber); box-shadow: 0 0 0 3px rgb(240 191 98 / 14%); }
        .dot[data-tone="error"] { background: var(--red); box-shadow: 0 0 0 3px rgb(255 130 120 / 14%); }
        .icon-button {
          width: 30px;
          height: 30px;
          border: 1px solid transparent;
          border-radius: 6px;
          color: var(--muted);
        }
        .icon-button:hover { border-color: var(--line); background: var(--surface-2); color: var(--text); }
        .icon-button[data-update="available"]::after { border-color: var(--surface-1); background: var(--green); }
        .status {
          display: flex;
          align-items: center;
          min-height: 34px;
          padding: 7px 14px;
          border-bottom: 1px solid var(--line-soft);
          color: var(--muted-strong);
          font-size: 11px;
        }
        .overview {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(0, .95fr);
          gap: 14px;
          padding: 14px;
          border-bottom: 1px solid var(--line-soft);
          background: var(--surface-1);
        }
        .route-primary, .route-best { min-width: 0; }
        .route-primary { padding-right: 14px; border-right: 1px solid var(--line); }
        .metric-label {
          display: block;
          margin-bottom: 6px;
          color: var(--muted);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0;
        }
        .route-value, .route-best-value {
          display: block;
          overflow: hidden;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-variant-numeric: tabular-nums;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .route-value { color: var(--text); font-size: 18px; line-height: 1.2; }
        .route-best-value { color: var(--green); font-size: 14px; line-height: 1.45; }
        .route-meta { display: flex; align-items: center; gap: 5px; margin-top: 7px; color: var(--muted); font-size: 10px; }
        .route-meta strong { color: var(--muted-strong); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-weight: 650; }
        .usage-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border-bottom: 1px solid var(--line-soft);
          background: var(--surface-0);
        }
        .usage-item { min-width: 0; padding: 10px 11px 11px; }
        .usage-item + .usage-item { border-left: 1px solid var(--line-soft); }
        .usage-item small { display: block; margin-bottom: 5px; color: var(--muted); font-size: 9px; font-weight: 700; letter-spacing: 0; }
        .usage-item strong { display: block; overflow: hidden; color: var(--text); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
        .usage-item:first-child strong { color: var(--amber); }
        .section { padding: 14px; border-bottom-color: var(--line-soft); }
        .section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 11px; }
        .section-title { margin: 0; color: var(--text); font-size: 12px; font-weight: 750; letter-spacing: 0; }
        .automation-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 44px;
          margin-bottom: 12px;
          padding: 8px 9px 8px 11px;
          border: 1px solid var(--line);
          border-radius: 7px;
          background: var(--surface-2);
        }
        .automation-name { margin-right: auto; color: var(--text); font-size: 12px; font-weight: 720; }
        .toggle { display: inline-flex; align-items: center; cursor: pointer; }
        .toggle input { position: absolute; inline-size: 1px; block-size: 1px; opacity: 0; }
        .toggle-track { display: grid; align-items: center; width: 34px; height: 20px; padding: 2px; border: 1px solid #52605b; border-radius: 999px; background: #303836; transition: background .16s ease, border-color .16s ease; }
        .toggle-thumb { width: 14px; height: 14px; border-radius: 50%; background: #d9dfdc; transition: transform .16s ease; }
        .toggle input:checked + .toggle-track { border-color: var(--green); background: var(--green-deep); }
        .toggle input:checked + .toggle-track .toggle-thumb { transform: translateX(14px); background: var(--green); }
        .toggle input:focus-visible + .toggle-track { outline: 2px solid var(--green); outline-offset: 2px; }
        .control-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
          gap: 10px;
        }
        .field-wide { grid-column: 1 / -1; }
        label { margin-bottom: 5px; color: var(--muted); font-size: 10px; font-weight: 650; }
        input[type="number"], input[type="text"], select {
          height: 35px;
          border-color: var(--line);
          border-radius: 6px;
          background: var(--surface-2);
          color: var(--text);
          font-size: 12px;
        }
        input:focus, select:focus { border-color: var(--green); box-shadow: 0 0 0 2px rgb(139 214 151 / 18%); }
        .token-select-trigger {
          height: 35px;
          border-color: var(--line);
          border-radius: 6px;
          background: var(--surface-2);
          color: var(--text);
          font-size: 12px;
        }
        .token-select-trigger:hover { border-color: #53615c; background: var(--surface-3); }
        .token-select-trigger:focus { border-color: var(--green); box-shadow: 0 0 0 2px rgb(139 214 151 / 18%); }
        .token-count { color: var(--muted); font-size: 9px; }
        .token-menu { border-color: var(--line); border-radius: 7px; background: var(--surface-1); box-shadow: 0 18px 36px rgb(0 0 0 / 52%); }
        .token-list { border-color: var(--line-soft); border-radius: 5px; background: var(--surface-0); }
        .token-option { min-height: 35px; border-bottom-color: var(--line-soft); color: var(--muted-strong); }
        .token-option:hover { background: var(--surface-2); }
        .text-button { color: var(--green); font-size: 10px; }
        .text-button:hover { color: #b6edbe; }
        details { margin-top: 12px; border-color: var(--line); border-radius: 7px; background: var(--surface-1); }
        summary { padding: 10px 11px; color: var(--muted-strong); font-size: 11px; letter-spacing: 0; }
        summary:hover { color: var(--text); background: var(--surface-2); }
        .advanced { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding: 0 10px 10px; }
        .advanced label { min-height: 25px; line-height: 1.25; }
        .actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 8px; margin-top: 12px; }
        .button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 37px;
          border-color: var(--line);
          border-radius: 6px;
          background: var(--surface-2);
          color: var(--text);
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 720;
        }
        .button:hover { border-color: #52605a; background: var(--surface-3); }
        .button svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
        .button-check { border-color: #dce4df; background: #eef3f0; color: #111614; }
        .button-check:hover { border-color: #ffffff; background: #ffffff; }
        .button-route { border-color: var(--green); background: var(--green-deep); color: #c7f3ce; }
        .button-route:hover { border-color: #a4e9ad; background: #285d35; }
        .button-manual { min-height: 30px; padding: 5px 8px; border-color: #74531f; background: var(--amber-deep); color: #ffe1a7; font-size: 11px; }
        .button-manual:hover { border-color: var(--amber); background: #6b4c1b; }
        .button-primary { border-color: var(--green); background: var(--green); color: #102014; }
        .button-primary:hover { border-color: #b6edbe; background: #b6edbe; }
        .candidate-section { padding-bottom: 10px; }
        .candidate-head, .candidate {
          grid-template-columns: minmax(86px, 1fr) 46px 46px 46px 48px minmax(62px, auto);
          gap: 6px;
          font-size: 10px;
        }
        .candidate-head { min-height: 27px; color: var(--muted); border-bottom-color: var(--line); }
        .candidate { min-height: 35px; padding-left: 7px; border-bottom-color: var(--line-soft); border-left: 2px solid transparent; }
        .candidate-ok { border-left-color: var(--green); background: rgb(139 214 151 / 5%); }
        .candidate-ok .verdict { color: #c2f0c9; }
        .candidate-off { color: var(--muted); }
        .candidate-off .verdict { color: #ffd88f; }
        .verdict { overflow: hidden; font-size: 10px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .secondary-details { margin: 0; border: 0; border-top: 1px solid var(--line-soft); border-radius: 0; background: var(--surface-0); }
        .secondary-details > summary { padding: 12px 14px; }
        .secondary-details > div { padding: 0 14px 14px; }
        .token-result { min-height: 34px; border-bottom-color: var(--line-soft); font-size: 10px; }
        .token-result-success span:last-child { color: var(--green); }
        .token-result-warning span:last-child { color: var(--amber); }
        .token-result-error span:last-child { color: var(--red); }
        .logs { gap: 8px; }
        .log { grid-template-columns: 54px 1fr; color: var(--muted); font-size: 10px; }
        .log-success { color: var(--green); }
        .log-error { color: var(--red); }
        .empty { color: var(--muted); }
        .manual-dialog { border-color: var(--line); border-radius: 8px; background: var(--surface-1); color: var(--text); box-shadow: 0 26px 72px rgb(0 0 0 / 62%); }
        .manual-dialog::backdrop { background: rgb(0 0 0 / 68%); }
        .dialog-form { padding: 15px; }
        .dialog-header { margin-bottom: 14px; }
        .dialog-title { font-size: 14px; }
        .dialog-hint { color: var(--muted); font-size: 10px; }
        @media (max-width: 520px) {
          .panel { width: calc(100vw - 20px); right: 10px; bottom: 10px; max-height: calc(100vh - 20px); }
          .launcher { right: 10px; bottom: 10px; }
          .advanced { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .candidate-head, .candidate { grid-template-columns: minmax(80px, 1fr) 44px 44px 44px minmax(56px, auto); }
          .candidate-head span:nth-child(5), .candidate span:nth-child(5) { display: none; }
        }
        @media (max-width: 390px) {
          .overview { grid-template-columns: 1fr; gap: 10px; }
          .route-primary { padding-right: 0; padding-bottom: 10px; border-right: 0; border-bottom: 1px solid var(--line); }
          .control-grid { grid-template-columns: 1fr; }
          .field-wide { grid-column: auto; }
          .candidate-head, .candidate { grid-template-columns: minmax(76px, 1fr) 42px 44px minmax(52px, auto); gap: 5px; }
          .candidate-head span:nth-child(3), .candidate span:nth-child(3) { display: none; }
          .candidate-head span:nth-child(5), .candidate span:nth-child(5) { display: none; }
          .button { font-size: 11px; }
        }
      </style>
      <button class="launcher" type="button" title="打开 ${SITE_LABEL} 分组监控" hidden>${IS_AIHUB ? "AH" : "KF"}</button>
      <section class="panel" aria-label="${SITE_LABEL} 分组监控">
        <header class="header" data-ref="header">
          <span class="dot" data-ref="statusDot"></span>
          <span class="header-copy">
            <span class="eyebrow">GROUP CONTROL</span>
            <span class="title">${SITE_LABEL} 分组监控</span>
          </span>
          <button class="icon-button" data-ref="checkUpdate" data-state="idle" data-update="none" type="button" title="检查更新" aria-label="检查更新">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.2 6.2L3 15"></path><path d="M3 21v-6h6"></path><path d="M3 12a9 9 0 0 1 15.2-6.2L21 9"></path><path d="M21 3v6h-6"></path></svg>
          </button>
          <button class="icon-button" data-ref="collapse" type="button" title="收起" aria-label="收起">−</button>
        </header>
        <div class="status" data-ref="status" role="status" aria-live="polite"></div>
        <section class="overview" aria-label="当前分组概览">
          <div class="route-primary">
            <span class="metric-label">当前密钥分组</span>
            <strong class="route-value" data-ref="currentGroup">-</strong>
          </div>
          <div class="route-best">
            <span class="metric-label">最低可用</span>
            <strong class="route-best-value" data-ref="bestGroup">-</strong>
            <span class="route-meta">检查于 <strong data-ref="lastCheck">-</strong></span>
          </div>
        </section>
        <section class="usage-strip" aria-label="账户与今日用量">
          <div class="usage-item"><small>余额</small><strong class="mono" data-ref="balance">-</strong></div>
          <div class="usage-item"><small>今日消费</small><strong class="mono" data-ref="todaySpend">-</strong></div>
          <div class="usage-item"><small>今日请求</small><strong class="mono" data-ref="todayRequests">-</strong></div>
          <div class="usage-item"><small>今日 Token</small><strong class="mono" data-ref="todayTokens">-</strong></div>
        </section>
        <section class="section control-section" data-ref="settingsSection">
          <div class="section-head"><h2 class="section-title">切换控制</h2></div>
          <div class="automation-bar">
            <span class="automation-name">自动切换</span>
            <label class="toggle" for="kf-enabled" title="自动切换">
              <input id="kf-enabled" data-ref="enabled" type="checkbox" aria-label="自动切换">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </label>
            <button class="button button-manual" data-ref="manualSwitch" type="button">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 3-4 4 4 4"></path><path d="M4 7h16"></path><path d="m16 21 4-4-4-4"></path><path d="M20 17H4"></path></svg>
              手动切换
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
              <label for="kf-model">${IS_AIHUB ? "监测来源（站点未提供模型维度）" : "目标模型"}</label>
              <select id="kf-model" data-ref="model"></select>
            </div>
            <div class="field field-wide">
              <label for="kf-groups">允许分组（留空为全部）</label>
              <input id="kf-groups" data-ref="allowedGroups" type="text" placeholder="gpt低价, gpt均衡">
            </div>
          </div>
          <details>
            <summary>判定与保护参数</summary>
            <div class="grid advanced">
              <div class="field"><label>轮询（秒）</label><input data-ref="pollSeconds" type="number" min="15"></div>
              <div class="field"><label>统计窗口（小时）</label><input data-ref="metricHours" type="number" min="1"></div>
              <div class="field"><label>总成功率（%）</label><input data-ref="minSuccessRate" type="number" min="0" max="100" step="0.1"></div>
              <div class="field"><label>最新成功率（%）</label><input data-ref="minLatestSuccessRate" type="number" min="0" max="100" step="0.1"></div>
              <div class="field"><label>指标时效（分钟）</label><input data-ref="maxMetricAgeMinutes" type="number" min="5"></div>
              <div class="field"><label>最大延迟（秒）</label><input data-ref="maxLatencySeconds" type="number" min="0"></div>
              <div class="field"><label>最低吞吐（t/s）</label><input data-ref="minThroughput" type="number" min="0" step="0.1"></div>
              <div class="field"><label>最大倍率（0 不限制）</label><input data-ref="maxGroupRatio" type="number" min="0" step="0.01"></div>
              <div class="field"><label>切换确认次数</label><input data-ref="confirmPolls" type="number" min="1" max="10"></div>
              <div class="field"><label>切换冷却（分钟）</label><input data-ref="cooldownMinutes" type="number" min="0"></div>
              <div class="field"><label>回滚观察次数（0 关闭）</label><input data-ref="rollbackChecks" type="number" min="0" max="10"></div>
              <div class="field"><label>故障拉黑（分钟）</label><input data-ref="blacklistMinutes" type="number" min="1"></div>
            </div>
          </details>
          <div class="actions">
            <button class="button button-check" data-ref="check" type="button">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>
              立即检查
            </button>
            <button class="button button-route" data-ref="switchNow" type="button">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v13"></path><path d="m7 11 5 5 5-5"></path><path d="M5 21h14"></path></svg>
              切到最低可用
            </button>
          </div>
        </section>
        <section class="section candidate-section">
          <div class="section-head"><h2 class="section-title">分组状态</h2></div>
          <div class="candidate-head"><span>分组</span><span>倍率</span><span>整体</span><span>近期</span><span>延迟</span><span>判定</span></div>
          <div data-ref="candidateRows"></div>
        </section>
        <details class="secondary-details">
          <summary>密钥状态</summary>
          <div>
          <div data-ref="tokenResultRows"></div>
          </div>
        </details>
        <details class="secondary-details">
          <summary>最近事件</summary>
          <div>
            <div class="logs" data-ref="logs"></div>
          </div>
        </details>
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
      "launcher", "panel", "header", "statusDot", "collapse", "status", "currentGroup", "bestGroup",
      "lastCheck", "balance", "todaySpend", "todayRequests", "todayTokens", "settingsSection", "enabled",
      "tokenSelect", "tokenSelectToggle", "tokenSelectLabel", "tokenMenu", "tokenList", "tokenCount", "selectAllTokens", "clearTokens", "model", "allowedGroups", "pollSeconds", "metricHours",
      "minSuccessRate", "minLatestSuccessRate", "maxMetricAgeMinutes",
      "maxLatencySeconds", "minThroughput", "maxGroupRatio",
      "confirmPolls", "cooldownMinutes", "rollbackChecks", "blacklistMinutes",
      "check", "switchNow", "checkUpdate", "manualDialog", "manualGroup", "manualHint", "manualSwitch", "manualConfirm", "manualClose", "manualCancel",
      "tokenResultRows", "candidateRows", "logs",
    ];
    refs = Object.fromEntries(
      refNames.map((name) => [name, root.querySelector(`[data-ref="${name}"]`) || root.querySelector(`.${name}`)]),
    );
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
