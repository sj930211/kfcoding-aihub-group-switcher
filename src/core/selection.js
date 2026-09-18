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
    const groups = [...new Set(sets.flatMap((entry) => entry.candidates.map((candidate) => candidate.group).filter(Boolean)))];

    return groups.map((group) => {
      const modelResults = sets.map((entry) => {
        const candidate = entry.candidates.find((item) => item.group === group) || null;
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
      const representative = candidates[0] || { group };
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
        group,
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
    if (candidate && candidate.providerId === "aihub") {
      return candidateSavingScore(candidate, candidates.filter((item) => item.providerId === "aihub"));
    }
    const ratios = candidates
      .map((item) => Number(item.ratio))
      .filter((ratio) => Number.isFinite(ratio) && ratio > 0);
    const minimum = ratios.length ? Math.min(...ratios) : NaN;
    const ratio = Number(candidate && candidate.ratio);
    if (!Number.isFinite(minimum) || !Number.isFinite(ratio) || ratio <= 0) return 0;
    return Math.min(100, minimum / ratio * 100);
  }

  /*
   * Legacy local effective-ratio estimator retained for reference.
   * AIHub now returns its own runtime-window estimate, so this formula is no longer executed.
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
  */

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

  function candidateSavingRatio(candidate, candidates) {
    const population = Array.isArray(candidates) ? candidates : [];
    const hasReadyEstimate = population.some(hasEffectiveRatioEstimate);
    if (hasReadyEstimate && !hasEffectiveRatioEstimate(candidate)) return Infinity;
    return candidateEffectiveRatio(candidate);
  }

  function candidateSavingScore(candidate, candidates) {
    const population = Array.isArray(candidates) ? candidates : [];
    const effectiveRatios = population
      .map((item) => candidateSavingRatio(item, population))
      .filter((ratio) => Number.isFinite(ratio) && ratio > 0);
    const minimum = effectiveRatios.length ? Math.min(...effectiveRatios) : NaN;
    const effectiveRatio = candidateSavingRatio(candidate, population);
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
