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
    return {
      theme: normalizeThemeMode(source.theme),
      glassTransparency: normalizeGlassTransparency(source.glassTransparency),
      enabled: Boolean(source.enabled),
      tokenIds: parseTokenIds(source.tokenIds, source.tokenId),
      models,
      model: models[0] || "",
      selectionMode: normalizeSelectionMode(source.selectionMode),
      groupFilterMode,
      groupWhitelist,
      groupBlacklist,
      requireModelDetection: Boolean(source.requireModelDetection),
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
      "metrics-stale": "指标已过期",
      "success-low": "总成功率不足",
      "latest-success-low": "最新成功率不足",
      "first-token-latency-high": "首字延迟过高",
      "output-latency-high": "输出延迟过高",
      "monitor-disabled": "监测已停用",
      "latest-unavailable": "最新监测不可用",
      "model-unavailable": "目标模型不可用",
      "model-status-unknown": "模型状态未知",
      "model-detection-suspected": "模型检测疑似",
      "model-detection-insufficient": "模型检测证据不足",
      "model-detection-failed": "模型检测未通过",
      "model-detection-expired": "模型检测已过期",
      "model-detection-incomplete": "模型检测未完成",
      "model-detection-unknown": "模型检测状态未知",
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
