// ==UserScript==
// @name         KFCoding 智能低倍率分组切换
// @namespace    https://kfcoding.codes/
// @version      0.4.0
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
// ==/UserScript==

(function () {
  "use strict";

  const hostname = String((globalThis.location && globalThis.location.hostname) || "").toLowerCase();
  const SITE_ID = hostname === "aihub.top" ? "aihub" : "kfcoding";
  const IS_AIHUB = SITE_ID === "aihub";
  const SITE_LABEL = IS_AIHUB ? "AIHub" : "KFCoding";
  const AIHUB_MONITOR_MODEL = "AIHub 公共渠道监测";

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
  });

  const STORAGE_PREFIX = IS_AIHUB ? "aihub-group-switcher" : "kfcoding-group-switcher";
  const STORAGE_CONFIG = `${STORAGE_PREFIX}:config:v1`;
  const STORAGE_LAST_SWITCH = `${STORAGE_PREFIX}:last-switch:v1`;
  const STORAGE_LOGS = `${STORAGE_PREFIX}:logs:v1`;
  const STORAGE_POSITIONS = `${STORAGE_PREFIX}:positions:v1`;
  const MAX_LOG_ENTRIES = 10;
  const VIEWPORT_MARGIN = 8;
  const HOST_ID = `${STORAGE_PREFIX}-host`;
  const GET_REQUEST_TIMEOUT_MS = 25000;
  const MUTATION_REQUEST_TIMEOUT_MS = 30000;
  const GET_MAX_ATTEMPTS = 3;

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

  function normalizeAihubTodayUsage(payload) {
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
    return {
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

  function normalizeKfcodingTodayUsage(payload, statusPayload) {
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
    return {
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

  const TEST_API = Object.freeze({
    DEFAULT_CONFIG,
    aihubMonitorRange,
    buildTokenUpdatePayload,
    clampPosition,
    evaluateAihubCandidates,
    evaluateCandidates,
    normalizeLogs,
    normalizeAihubTodayUsage,
    normalizeAihubToken,
    normalizeKfcodingTodayUsage,
    normalizeSwitchHistory,
    normalizeUiPositions,
    parseAllowedGroups,
    parseTokenIds,
    requestJsonWithRetry,
    requiresTokenSelection,
    sanitizeConfig,
    selectBestCandidate,
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
        usage = normalizeAihubTodayUsage(
          await fetchJson("/api/v1/usage/stats?period=today"),
        );
      } else {
        const range = todayTimestampRange();
        const query = new URLSearchParams({
          start_timestamp: String(range.start),
          end_timestamp: String(range.end),
          default_time: "hour",
        });
        const [payload, status] = await Promise.all([
          fetchJson(`/api/data/self?${query}`),
          fetchJson("/api/status"),
        ]);
        usage = normalizeKfcodingTodayUsage(payload, status);
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

  async function switchTokenGroup(token, candidate) {
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
      pendingCandidates.delete(Number(token.id));
      addLog(`${tokenLabel(token)} 已切换到 ${candidate.group} (${formatRatio(candidate.ratio)})`, "success");
      return verified;
    }
    const payload = buildTokenUpdatePayload(token, candidate.group);
    await fetchJson("/api/token/", { method: "PUT", body: payload });
    const verified = await getTokenDetail(token.id);
    if (verified.group !== candidate.group) {
      throw new Error(`切换校验失败，服务端当前分组为 ${verified.group || "空"}`);
    }
    recordSwitch(token.id, candidate);
    pendingCandidates.delete(Number(token.id));
    addLog(`${tokenLabel(token)} 已切换到 ${candidate.group} (${formatRatio(candidate.ratio)})`, "success");
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

  async function processToken(token, candidates, options) {
    const forceSwitch = Boolean(options && options.forceSwitch);
    const targetGroup = String((options && options.targetGroup) || "").trim();
    const tokenId = Number(token.id);
    validateToken(token);
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
    const usageRefresh = refreshTodayUsage();
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
      const lowestAvailable = selectBestCandidate(candidates, "");
      state.candidates = candidates;
      state.bestGroup = lowestAvailable
        ? `${lowestAvailable.group} ${formatRatio(lowestAvailable.ratio)}`
        : "无可用分组";
      state.lastCheck = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      if (targetGroup) selectSwitchCandidate(candidates, "", targetGroup);
      if (!targetGroup && !lowestAvailable) {
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
      const warningCount = state.tokenResults.filter((result) => result.tone === "warning").length;
      if (switchedCount > 0) {
        GM_notification({
          title: `${SITE_LABEL} 分组已切换`,
          text: `${config.model}: 已切换 ${switchedCount} 个 API 密钥`,
          timeout: 8000,
        });
      }
      if (failedCount === state.tokenResults.length) {
        setStatus(`${failedCount} 个 API 密钥处理失败`, "error");
      } else if (failedCount > 0) {
        setStatus(`处理完成：切换 ${switchedCount} 个，失败 ${failedCount} 个`, "warning");
      } else if (warningCount > 0) {
        setStatus(`已检查 ${state.tokenResults.length} 个 API 密钥，切换 ${switchedCount} 个`, "warning");
      } else {
        setStatus(`已检查 ${state.tokenResults.length} 个 API 密钥，切换 ${switchedCount} 个`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(message, "error");
      setStatus(message, "error");
    } finally {
      await usageRefresh;
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

  function formatUsageCount(value, available) {
    return available ? Math.max(0, Number(value) || 0).toLocaleString() : "-";
  }

  function createOption(value, label) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    return option;
  }

  function renderOptions() {
    if (!refs.tokenList || !refs.model) return;

    const selectedTokens = new Set(config.tokenIds.map(Number));
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

    const selectedModel = config.model;
    refs.model.replaceChildren(createOption("", "请选择模型"));
    const models = pricingCache && Array.isArray(pricingCache.data)
      ? pricingCache.data.map((item) => item.model_name).filter(Boolean).sort()
      : [];
    models.forEach((model) => refs.model.appendChild(createOption(model, model)));
    refs.model.value = selectedModel;
  }

  function renderTokenSelectionCount() {
    if (!refs.tokenList || !refs.tokenCount) return;
    const selected = refs.tokenList.querySelectorAll('input[data-token-id]:checked').length;
    refs.tokenCount.textContent = `已选 ${selected}/${tokensCache.length}`;
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
    refs.manualGroup.replaceChildren(createOption("", "请选择目标分组"));

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
    if (refs.todaySpend) refs.todaySpend.textContent = formatSpend(state.todayUsage);
    if (refs.todayRequests) {
      refs.todayRequests.textContent = formatUsageCount(
        state.todayUsage.requests,
        state.todayUsage.available,
      );
    }
    if (refs.todayTokens) {
      refs.todayTokens.textContent = formatUsageCount(
        state.todayUsage.tokens,
        state.todayUsage.available,
      );
    }
    [refs.todaySpend, refs.todayRequests, refs.todayTokens].filter(Boolean).forEach((element) => {
      element.title = state.todayUsage.error || (state.todayUsage.loading ? "正在刷新" : "");
    });
    if (refs.enabled) refs.enabled.checked = config.enabled;
    if (refs.check) refs.check.disabled = running;
    if (refs.switchNow) refs.switchNow.disabled = running;
    if (refs.save) refs.save.disabled = running;
    if (refs.refresh) refs.refresh.disabled = running;
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
    if (refs.manualSwitch) refs.manualSwitch.disabled = running || !refs.manualGroup.value;
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
    refs.switchNow.addEventListener("click", () => runCheck({ manual: true, forceSwitch: true }));
    refs.manualGroup.addEventListener("change", render);
    refs.manualSwitch.addEventListener("click", () => {
      const targetGroup = refs.manualGroup.value;
      if (!targetGroup) {
        setStatus("请先选择要手动切换的目标分组", "warning");
        return;
      }
      runCheck({ manual: true, forceSwitch: true, targetGroup });
    });
    refs.tokenList.addEventListener("change", renderTokenSelectionCount);
    refs.selectAllTokens.addEventListener("click", () => {
      refs.tokenList.querySelectorAll('input[data-token-id]').forEach((checkbox) => {
        checkbox.checked = true;
      });
      renderTokenSelectionCount();
    });
    refs.clearTokens.addEventListener("click", () => {
      refs.tokenList.querySelectorAll('input[data-token-id]').forEach((checkbox) => {
        checkbox.checked = false;
      });
      renderTokenSelectionCount();
    });
    refs.refresh.addEventListener("click", async () => {
      setStatus("正在刷新列表...", "running");
      try {
        const [, usageLoaded] = await Promise.all([refreshCatalogs(), refreshTodayUsage()]);
        setStatus(
          usageLoaded ? "列表和今日用量已刷新" : "列表已刷新，今日用量读取失败",
          usageLoaded ? "success" : "warning",
        );
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), "error");
      }
    });
    refs.save.addEventListener("click", () => {
      const previousIdentity = `${config.tokenIds.join(",")}:${config.model}`;
      config = readFormConfig();
      GM_setValue(STORAGE_CONFIG, config);
      if (`${config.tokenIds.join(",")}:${config.model}` !== previousIdentity) {
        pendingCandidates.clear();
        state.candidates = [];
        state.tokenResults = [];
        state.currentGroup = "-";
      }
      addLog("配置已保存", "success");
      setStatus(config.enabled ? "配置已保存，准备检查" : "配置已保存，自动切换已暂停", "success");
      scheduleNext(config.enabled ? 250 : undefined);
      renderOptions();
      render();
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
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, select { font: inherit; letter-spacing: 0; }
        button { cursor: pointer; }
        .launcher, .panel {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 2147483000;
          font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #1f2937;
        }
        .launcher {
          width: 46px;
          height: 46px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #ffffff;
          color: #111827;
          font-weight: 800;
          box-shadow: 0 8px 24px rgba(15, 23, 42, .16);
          cursor: grab;
          touch-action: none;
        }
        .panel {
          width: min(430px, calc(100vw - 24px));
          max-height: min(760px, calc(100vh - 24px));
          overflow: auto;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #ffffff;
          box-shadow: 0 14px 38px rgba(15, 23, 42, .2);
        }
        .panel[hidden], .launcher[hidden] { display: none; }
        .header {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 48px;
          padding: 10px 12px;
          border-bottom: 1px solid #e5e7eb;
          background: #ffffff;
          cursor: grab;
          touch-action: none;
          user-select: none;
        }
        .title { flex: 1; font-size: 14px; font-weight: 750; }
        .dot { width: 9px; height: 9px; border-radius: 50%; background: #9ca3af; }
        .dot[data-tone="running"] { background: #2563eb; }
        .dot[data-tone="success"] { background: #059669; }
        .dot[data-tone="warning"] { background: #d97706; }
        .dot[data-tone="error"] { background: #dc2626; }
        .icon-button {
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #4b5563;
          font-size: 20px;
          line-height: 1;
        }
        .icon-button:hover { background: #f3f4f6; color: #111827; }
        .status { padding: 10px 12px; font-size: 12px; line-height: 1.5; color: #4b5563; }
        .summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1px;
          border-top: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
          background: #e5e7eb;
        }
        .summary > div { min-width: 0; padding: 9px 10px; background: #f9fafb; }
        .summary small { display: block; margin-bottom: 3px; color: #6b7280; font-size: 10px; }
        .summary strong { display: block; overflow: hidden; text-overflow: ellipsis; font-size: 12px; white-space: nowrap; }
        .today-summary { border-top: 0; }
        .section { padding: 12px; border-bottom: 1px solid #e5e7eb; }
        .section:last-child { border-bottom: 0; }
        .section-title { margin: 0 0 9px; font-size: 12px; font-weight: 750; color: #374151; }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
        .field { min-width: 0; }
        .field-wide { grid-column: 1 / -1; }
        label { display: block; margin-bottom: 4px; color: #4b5563; font-size: 11px; }
        input[type="number"], input[type="text"], select {
          width: 100%;
          min-width: 0;
          height: 34px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: #ffffff;
          color: #111827;
          padding: 0 9px;
          font-size: 12px;
          outline: none;
        }
        input:focus, select:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, .12); }
        .switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .switch-row label { margin: 0; color: #111827; font-size: 12px; font-weight: 650; }
        input[type="checkbox"] { width: 18px; height: 18px; accent-color: #059669; }
        details { margin-top: 10px; }
        summary { cursor: pointer; color: #374151; font-size: 11px; font-weight: 650; }
        .advanced { margin-top: 10px; }
        .token-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
        .token-toolbar label { margin: 0; flex: 1; }
        .token-count { color: #6b7280; font-size: 10px; }
        .text-button { border: 0; background: transparent; color: #0369a1; padding: 2px; font-size: 10px; }
        .text-button:hover { color: #075985; text-decoration: underline; }
        .text-button:disabled { cursor: wait; opacity: .5; text-decoration: none; }
        .token-list { max-height: 116px; overflow: auto; border: 1px solid #d1d5db; border-radius: 6px; background: #ffffff; }
        .token-option { display: flex; align-items: center; gap: 8px; min-height: 32px; margin: 0; padding: 5px 8px; border-bottom: 1px solid #f3f4f6; color: #1f2937; cursor: pointer; }
        .token-option:last-child { border-bottom: 0; }
        .token-option:hover { background: #f9fafb; }
        .token-option span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-empty { padding: 8px; }
        .actions { display: flex; gap: 8px; margin-top: 11px; }
        .manual-switch { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px; margin-top: 11px; }
        .button {
          min-height: 34px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: #ffffff;
          color: #1f2937;
          padding: 7px 11px;
          font-size: 12px;
          font-weight: 650;
        }
        .button:hover { background: #f3f4f6; }
        .button:disabled { cursor: wait; opacity: .55; }
        .button-primary { border-color: #047857; background: #047857; color: #ffffff; }
        .button-primary:hover { background: #065f46; }
        .button-switch { border-color: #0369a1; background: #0369a1; color: #ffffff; }
        .button-switch:hover { background: #075985; }
        .button-spacer { margin-left: auto; }
        .candidate-head, .candidate {
          display: grid;
          grid-template-columns: minmax(78px, 1fr) 46px 52px 52px 48px minmax(62px, auto);
          align-items: center;
          gap: 6px;
          min-height: 28px;
          font-size: 10px;
        }
        .candidate-head { color: #6b7280; border-bottom: 1px solid #e5e7eb; }
        .candidate { border-bottom: 1px solid #f3f4f6; }
        .candidate:last-child { border-bottom: 0; }
        .candidate > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .candidate-ok .verdict { color: #047857; }
        .candidate-off { color: #6b7280; }
        .candidate-off .verdict { color: #b45309; }
        .token-result { display: grid; grid-template-columns: minmax(80px, .8fr) minmax(58px, .6fr) minmax(110px, 1.2fr); align-items: center; gap: 7px; min-height: 29px; border-bottom: 1px solid #f3f4f6; font-size: 10px; }
        .token-result:last-child { border-bottom: 0; }
        .token-result span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-result-success span:last-child { color: #047857; }
        .token-result-warning span:last-child { color: #b45309; }
        .token-result-error span:last-child { color: #b91c1c; }
        .mono { font-variant-numeric: tabular-nums; }
        .logs { display: grid; gap: 6px; }
        .log { display: grid; grid-template-columns: 58px 1fr; gap: 8px; font-size: 10px; line-height: 1.4; color: #4b5563; }
        .log-error { color: #b91c1c; }
        .log-success { color: #047857; }
        .empty { padding: 8px 0; color: #9ca3af; font-size: 10px; }
        @media (prefers-color-scheme: dark) {
          .panel, .launcher, .header { background: #171717; color: #f3f4f6; border-color: #404040; }
          .header, .section, .summary { border-color: #404040; }
          .summary { background: #404040; }
          .summary > div { background: #202020; }
          .summary small, .status, label, summary, .section-title, .candidate-head, .log { color: #a3a3a3; }
          .switch-row label, .title { color: #f5f5f5; }
          input[type="number"], input[type="text"], select, .button, .token-list { background: #202020; border-color: #525252; color: #f5f5f5; }
          .token-option { border-color: #333333; color: #f5f5f5; }
          .token-option:hover { background: #2a2a2a; }
          .token-count { color: #a3a3a3; }
          .button-primary { background: #059669; border-color: #059669; color: #ffffff; }
          .icon-button { color: #d4d4d4; }
          .icon-button:hover, .button:hover { background: #2a2a2a; }
          .candidate, .candidate-head { border-color: #333333; }
        }
        @media (max-width: 520px) {
          .panel { right: 12px; bottom: 12px; max-height: calc(100vh - 24px); }
          .launcher { right: 12px; bottom: 12px; }
          .grid { grid-template-columns: 1fr; }
          .field-wide { grid-column: auto; }
          .candidate-head, .candidate { grid-template-columns: minmax(78px, 1fr) 44px 50px 50px minmax(58px, auto); }
          .candidate-head span:nth-child(5), .candidate span:nth-child(5) { display: none; }
        }
      </style>
      <button class="launcher" type="button" title="打开 ${SITE_LABEL} 分组监控" hidden>${IS_AIHUB ? "AH" : "KF"}</button>
      <section class="panel" aria-label="${SITE_LABEL} 分组监控">
        <header class="header" data-ref="header">
          <span class="dot" data-ref="statusDot"></span>
          <span class="title">${SITE_LABEL} 分组监控</span>
          <button class="icon-button" data-ref="collapse" type="button" title="收起" aria-label="收起">−</button>
        </header>
        <div class="status" data-ref="status"></div>
        <div class="summary">
          <div><small>密钥分组</small><strong data-ref="currentGroup">-</strong></div>
          <div><small>最低可用</small><strong data-ref="bestGroup">-</strong></div>
          <div><small>检查时间</small><strong data-ref="lastCheck">-</strong></div>
        </div>
        <div class="summary today-summary">
          <div><small>今日消费</small><strong class="mono" data-ref="todaySpend">-</strong></div>
          <div><small>今日请求</small><strong class="mono" data-ref="todayRequests">-</strong></div>
          <div><small>今日 Token</small><strong class="mono" data-ref="todayTokens">-</strong></div>
        </div>
        <section class="section">
          <div class="switch-row">
            <label for="kf-enabled">自动切换</label>
            <input id="kf-enabled" data-ref="enabled" type="checkbox">
          </div>
          <div class="grid" style="margin-top: 10px">
            <div class="field field-wide">
              <div class="token-toolbar">
                <label>API 密钥（可多选）</label>
                <span class="token-count" data-ref="tokenCount">已选 0/0</span>
                <button class="text-button" data-ref="selectAllTokens" type="button">全选</button>
                <button class="text-button" data-ref="clearTokens" type="button">清空</button>
              </div>
              <div class="token-list" data-ref="tokenList"></div>
            </div>
            <div class="field field-wide">
              <label for="kf-model">${IS_AIHUB ? "监测来源（站点未提供模型维度）" : "目标模型"}</label>
              <select id="kf-model" data-ref="model"></select>
            </div>
            <div class="field field-wide">
              <label for="kf-groups">允许分组（留空为全部）</label>
              <input id="kf-groups" data-ref="allowedGroups" type="text" placeholder="gpt低价, gpt均衡">
            </div>
          </div>
          <details>
            <summary>判定参数</summary>
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
            </div>
          </details>
          <div class="actions">
            <button class="button button-primary" data-ref="save" type="button">保存</button>
            <button class="button" data-ref="check" type="button">立即检查</button>
            <button class="button button-switch" data-ref="switchNow" type="button">立即切换</button>
            <button class="button button-spacer" data-ref="refresh" type="button">刷新</button>
          </div>
          <div class="manual-switch">
            <div class="field">
              <label for="kf-manual-group">手动选择分组</label>
              <select id="kf-manual-group" data-ref="manualGroup"></select>
            </div>
            <button class="button button-switch" data-ref="manualSwitch" type="button">手动切换</button>
          </div>
        </section>
        <section class="section">
          <h2 class="section-title">密钥状态</h2>
          <div data-ref="tokenResultRows"></div>
        </section>
        <section class="section">
          <h2 class="section-title">分组状态</h2>
          <div class="candidate-head"><span>分组</span><span>倍率</span><span>整体</span><span>近期</span><span>延迟</span><span>判定</span></div>
          <div data-ref="candidateRows"></div>
        </section>
        <section class="section">
          <h2 class="section-title">事件</h2>
          <div class="logs" data-ref="logs"></div>
        </section>
      </section>
    `;

    const refNames = [
      "launcher", "panel", "header", "statusDot", "collapse", "status", "currentGroup", "bestGroup",
      "lastCheck", "todaySpend", "todayRequests", "todayTokens", "enabled", "tokenList", "tokenCount", "selectAllTokens", "clearTokens", "model", "allowedGroups", "pollSeconds", "metricHours",
      "minSuccessRate", "minLatestSuccessRate", "maxMetricAgeMinutes",
      "maxLatencySeconds", "minThroughput", "maxGroupRatio",
      "confirmPolls", "cooldownMinutes", "save", "check", "switchNow", "manualGroup", "manualSwitch",
      "refresh", "tokenResultRows", "candidateRows", "logs",
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
