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
