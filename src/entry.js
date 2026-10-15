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
    scheduleStatisticsRefresh(document.visibilityState === "visible" ? 250 : undefined);
    if (config.enabled && document.visibilityState === "visible") {
      scheduleNext(250);
    }
  });

  mountUi();
  window.addEventListener("resize", () => {
    positionElement(state.collapsed ? refs.launcher : refs.panel, state.collapsed ? "launcher" : "panel", true);
    if (state.activeView === "statistics" && state.statistics.loaded && !state.statistics.loading) {
      const redraw = () => renderStatisticsTrend(
        state.statistics.accountSeries,
        normalizeAihubStatisticsMetric(state.statistics.metric),
      );
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(redraw);
      else setTimeout(redraw, 0);
    }
  });
  registerMenus();
  scheduleUpdateCheck(0);
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
    })
    .finally(() => {
      if (state.activeView === "statistics" && IS_AIHUB && !state.statistics.loaded) {
        void refreshStatistics({ silent: true });
      }
      scheduleStatisticsRefresh();
    });
