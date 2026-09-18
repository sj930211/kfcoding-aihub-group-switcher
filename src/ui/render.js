  function statisticsMetricLabel(metric) {
    return {
      spend: "实际消费",
      requests: "请求数",
      tokens: "Token",
    }[normalizeAihubStatisticsMetric(metric)];
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
      return `${String((hour + 1) % 24).padStart(2, "0")}:${match[2] || "00"}`;
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
    const range = `${state.statistics.days}:${series[0].date.slice(0, 10)}`;
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
      `AIHub ${granularity === "hour" ? "今天按小时" : `最近 ${series.length} 天按日期`}${statisticsMetricLabel(metric)}趋势，总计 ${formatStatisticsValue(aggregate.value, metric, true)}`,
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
      chart.setAttribute("aria-label", "今天按小时趋势，横向滚动可查看较早时段");
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
    refs.statisticsDays.value = String(state.statistics.days);
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
        ? `今日账户日汇总暂不可用，暂不与密钥明细对账：${state.statistics.accountReconciliationError}`
        : "今日账户趋势仍在聚合，暂不与密钥明细对账";
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
        ? "今天合计"
        : `${state.statistics.dataDays} 天合计`;
      refs.statisticsTrendSummary.textContent = total.available
        ? `${summaryLabel} ${formatStatisticsValue(total.value, metric, true)}`
        : "当前指标不可用";
    }
    renderStatisticsTrend(state.statistics.accountSeries, metric);
    renderStatisticsKeyRows(reconciliation, metric, exactCoverage && !reconciliation.anomaly);
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
    if (refs.requireModelDetection) refs.requireModelDetection.checked = config.requireModelDetection;
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
    renderManualGroups();
    if (refs.manualGroup) {
      refs.manualGroup.querySelectorAll('input[data-manual-group]').forEach((radio) => {
        radio.disabled = running;
      });
    }
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
    renderStatistics();
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
      models: [...refs.modelList.querySelectorAll('input[data-model-name]:checked')]
        .map((checkbox) => checkbox.dataset.modelName),
      selectionMode: refs.selectionMode.value,
      groupFilterMode: config.groupFilterMode,
      groupWhitelist: config.groupWhitelist,
      groupBlacklist: config.groupBlacklist,
      requireModelDetection: IS_AIHUB && refs.requireModelDetection.checked,
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
    refs.selectionMode.value = config.selectionMode;
    refs.requireModelDetection.checked = config.requireModelDetection;
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
    refs.switchHoldMinutes.value = String(config.switchHoldMinutes);
    refs.rollbackChecks.value = String(config.rollbackChecks);
    refs.blacklistMinutes.value = String(config.blacklistMinutes);
  }

  function persistFormConfig() {
    const previousIdentity = `${config.tokenIds.join(",")}:${targetModelIdentity(config)}`;
    const wasEnabled = config.enabled;
    config = readFormConfig();
    GM_setValue(STORAGE_CONFIG, config);
    if (state.todayUsage.available) syncSpendProtection({ notify: true });
    if (`${config.tokenIds.join(",")}:${targetModelIdentity(config)}` !== previousIdentity) {
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

  function setModelMenuOpen(open) {
    if (!refs.modelMenu || !refs.modelSelectToggle) return;
    refs.modelMenu.hidden = !open;
    refs.modelSelectToggle.setAttribute("aria-expanded", String(open));
  }

  function setGroupFilterMenuOpen(open) {
    if (!refs.groupFilterMenu || !refs.groupFilterSelectToggle) return;
    refs.groupFilterMenu.hidden = !open;
    refs.groupFilterSelectToggle.setAttribute("aria-expanded", String(open));
  }

  function setActiveView(view, options) {
    state.activeView = normalizeActiveView(view);
    scheduleStatisticsRefresh();
    persistUiState();
    setTokenMenuOpen(false);
    setModelMenuOpen(false);
    setGroupFilterMenuOpen(false);
    if (refs.workspace) refs.workspace.scrollTop = 0;
    render();
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
      statisticsMetric: state.statistics.metric,
      statisticsDays: state.statistics.days,
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
    refs.statisticsMetric.addEventListener("change", () => {
      state.statistics.metric = normalizeAihubStatisticsMetric(refs.statisticsMetric.value);
      persistUiState();
      render();
    });
    refs.statisticsDays.addEventListener("change", () => {
      state.statistics.days = normalizeAihubStatisticsDays(refs.statisticsDays.value);
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
      if (!state.candidates.length) {
        setStatus("请先执行一次立即检查，再选择手动目标分组", "warning");
      }
      refs.manualDialog.showModal();
      const firstChoice = refs.manualGroup.querySelector('input[data-manual-group]:checked')
        || refs.manualGroup.querySelector('input[data-manual-group]');
      (firstChoice || refs.manualClose).focus();
    });
    refs.manualGroup.addEventListener("change", () => {
      refs.manualConfirm.disabled = running || !refs.manualGroup.querySelector('input[data-manual-group]:checked');
    });
    refs.manualConfirm.addEventListener("click", () => {
      const targetGroup = refs.manualGroup.querySelector('input[data-manual-group]:checked')?.value || "";
      if (!targetGroup) return;
      refs.manualDialog.close();
      runCheck({ manual: true, forceSwitch: true, targetGroup });
    });
    [refs.manualClose, refs.manualCancel].forEach((button) => {
      button.addEventListener("click", () => refs.manualDialog.close());
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || refs.manualDialog.open) return;
      setTokenMenuOpen(false);
      setModelMenuOpen(false);
      setGroupFilterMenuOpen(false);
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
