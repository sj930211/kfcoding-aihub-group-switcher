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

  function normalizeAihubModelDetection(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const model = aihubModelName(value.model ?? value.model_name ?? value.target_model);
    const expiresAt = String(value.expires_at ?? value.expiresAt ?? "").trim();
    const expiresAtMs = Date.parse(expiresAt);
    return {
      applicable: value.applicable === true,
      status: String(value.status || "").trim().toLowerCase(),
      model,
      modelKey: normalizeAihubModelKey(model),
      confidence: String(value.confidence || "").trim().toLowerCase(),
      executionComplete: value.execution_complete === undefined && value.executionComplete === undefined
        ? null
        : Boolean(value.execution_complete ?? value.executionComplete),
      allTargetsPassed: value.all_targets_passed === undefined && value.allTargetsPassed === undefined
        ? null
        : Boolean(value.all_targets_passed ?? value.allTargetsPassed),
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
    const detection = aihubScopedModelDetection(monitor, model);
    if (!detection) return "";
    const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    if (Number.isFinite(detection.expiresAtMs) && detection.expiresAtMs <= now) {
      return "model-detection-expired";
    }
    if (detection.status === "passed") {
      if (!Number.isFinite(detection.expiresAtMs)) return "model-detection-unknown";
      return detection.executionComplete === true && detection.allTargetsPassed === true
        ? ""
        : "model-detection-incomplete";
    }
    if (detection.status === "suspected") return "model-detection-suspected";
    if (detection.status === "insufficient_evidence") return "model-detection-insufficient";
    if (["detection_failed", "failed"].includes(detection.status)) return "model-detection-failed";
    return "model-detection-unknown";
  }

  function aihubRequiredModelDetectionReason(monitor, model, nowMs) {
    const detection = aihubScopedModelDetection(monitor, model);
    if (!detection) return "";
    const reason = aihubModelDetectionReason(monitor, model, nowMs);
    if (reason) return reason;
    if (!Number.isFinite(detection.expiresAtMs)) return "model-detection-unknown";
    return detection.executionComplete === true && detection.allTargetsPassed === true
      ? ""
      : "model-detection-incomplete";
  }

  function buildAihubModelCatalog(summaryPayload) {
    const summary = summaryPayload && typeof summaryPayload === "object" ? summaryPayload : {};
    const keys = new Set();
    (Array.isArray(summary.apis) ? summary.apis : []).forEach((monitor) => {
      Object.keys(normalizeAihubModelHealth(monitor && (monitor.modelHealth ?? monitor.model_health)))
        .forEach((model) => keys.add(model));
    });
    const order = new Map(Object.keys(AIHUB_MODEL_NAMES).map((model, index) => [model, index]));
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
