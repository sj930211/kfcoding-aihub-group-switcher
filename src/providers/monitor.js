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
        providerVersion: Number(providers.version) || 0,
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
          modelDetection: normalizeAihubModelDetection(item.model_detection ?? item.modelDetection),
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
        normalized.summary.providerVersion = version;
        return { ...normalized, seriesError, source: "providers", providerVersion: version };
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
        const warnings = [];
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
        const ratioSource = Number.isFinite(userRatio) && userRatio > 0
          ? "account"
          : Number.isFinite(groupRatio) && groupRatio > 0
            ? "group"
            : "public";
        const rawSeries = Array.isArray(seriesByApiId[monitor.id]) ? seriesByApiId[monitor.id] : [];
        const parsedSeries = rawSeries
          .map(aihubSeriesPoint)
          .filter(Boolean)
          .sort((left, right) => left.timestampMs - right.timestampMs);
        const latestPoint = parsedSeries.length ? parsedSeries[parsedSeries.length - 1] : null;
        const modelHealthStatus = aihubModelHealthStatus(monitor, config.model);
        const modelDetection = normalizeAihubModelDetection(
          monitor && (monitor.modelDetection ?? monitor.model_detection),
        );
        const scopedModelDetection = aihubScopedModelDetection(monitor, config.model);
        const modelDetectionWarning = aihubModelDetectionReason(monitor, config.model, now);
        const modelDetectionFailure = config.requireModelDetection
          ? aihubRequiredModelDetectionReason(monitor, config.model, now)
          : "";
        const modelHealthBackedByDetection = modelHealthStatus === "stale"
          && config.requireModelDetection
          && Boolean(scopedModelDetection)
          && !modelDetectionFailure;
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
        const successRates = monitor.successRates || {};
        const hasSuccessWindow = (key) => Object.prototype.hasOwnProperty.call(successRates, key);
        const aggregateSuccessWindow = Number(summary.providerVersion) >= 2
          ? "1h"
          : hasSuccessWindow(successKey) ? successKey
            : hasSuccessWindow("24h") ? "24h" : "1h";
        const successValue = successRates[aggregateSuccessWindow];
        const summarySuccess = typeof successValue === "number"
          || (typeof successValue === "string" && successValue.trim() !== "")
          ? Number(successValue)
          : NaN;
        const aggregateSuccess = Number.isFinite(summarySuccess) && summarySuccess >= 0 && summarySuccess <= 1
          ? summarySuccess * 100
          : NaN;
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
        const firstTokenMetric = aihubFirstTokenMetric(monitor);
        const firstTokenLatencyMs = firstTokenMetric.value;
        const outputTokensPerSecond = Number(monitor.outputTokensPerSecond);
        const outputTokens = Number(monitor.outputTokens);
        const outputLatencyMs = Number.isFinite(outputTokens)
          && outputTokens > 0
          && Number.isFinite(outputTokensPerSecond)
          && outputTokensPerSecond > 0
          ? outputTokens / outputTokensPerSecond * 1000
          : NaN;
        const cacheHitRate = parsePercentValue(monitor.cacheHitRate);
        const effectiveRatioReady = (
          monitor.effective_multiplier_ready
            ?? monitor.effectiveMultiplierReady
        ) === true;
        const rawEffectiveRatio = Number(
          monitor.effective_multiplier
            ?? monitor.effectiveMultiplier,
        );
        const effectiveInputPriceValue = (
          monitor.effective_input_price_per_million_1h
            ?? monitor.effectiveInputPricePerMillion1h
        );
        const rawEffectiveInputPrice = (
          effectiveInputPriceValue !== null
          && effectiveInputPriceValue !== undefined
          && String(effectiveInputPriceValue).trim() !== ""
        )
          ? Number(effectiveInputPriceValue)
          : NaN;
        const effectiveRatio = effectiveRatioReady
          && Number.isFinite(rawEffectiveRatio)
          && rawEffectiveRatio > 0
          ? rawEffectiveRatio
          : NaN;
        const effectiveInputPricePerMillion = effectiveRatioReady
          && Number.isFinite(rawEffectiveInputPrice)
          && rawEffectiveInputPrice >= 0
          ? rawEffectiveInputPrice
          : NaN;
        const effectiveRatioReason = String(
          monitor.effective_multiplier_reason
            ?? monitor.effectiveMultiplierReason
            ?? "",
        ).trim();

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
        else if (modelHealthStatus !== "healthy" && !modelHealthBackedByDetection) {
          reasons.push("model-status-unknown");
        }
        if (modelDetectionFailure) reasons.push(modelDetectionFailure);
        else if (modelDetectionWarning) warnings.push(modelDetectionWarning);
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
          publicRatio,
          ratioSource,
          available: reasons.length === 0,
          reasons,
          warnings,
          aggregateSuccess,
          aggregateSuccessWindow,
          latestSuccess,
          recentSuccess: latestSuccess,
          recentMinSuccess: latestSuccess,
          recentSampleCount: Number.isFinite(latestSuccess) ? 1 : 0,
          firstTokenLatencyMs,
          firstTokenLatencySource: firstTokenMetric.source,
          probeFirstTokenLatencyMs: firstTokenMetric.probeLatencyMs,
          outputLatencyMs,
          outputTokensPerSecond,
          outputTokens,
          cacheHitRate,
          effectiveRatio,
          effectiveInputPricePerMillion,
          effectiveRatioReady: Number.isFinite(effectiveRatio),
          effectiveRatioReason,
          providerId: "aihub",
          modelHealthStatus,
          modelHealthBackedByDetection,
          modelDetectionStatus: modelDetection ? modelDetection.status : "",
          modelDetectionModelKey: modelDetection ? modelDetection.modelKey : "",
          probeModelKey,
          ageMinutes,
        };
      });
  }
