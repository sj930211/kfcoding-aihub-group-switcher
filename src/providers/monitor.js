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
