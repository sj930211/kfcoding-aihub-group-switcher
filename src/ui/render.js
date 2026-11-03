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
