  const storedConfig = GM_getValue(STORAGE_CONFIG, {});
  let config = sanitizeConfig(storedConfig);
  if (IS_AIHUB) {
    const migrated = migrateAihubStoredModelAliases(
      storedConfig,
      GM_getValue(STORAGE_LAST_SWITCH, {}),
      GM_getValue(STORAGE_SWITCH_GUARD, {}),
    );
    config = migrated.config;
    if (migrated.changed) {
      GM_setValue(STORAGE_CONFIG, migrated.config);
      GM_setValue(STORAGE_LAST_SWITCH, migrated.history);
      GM_setValue(STORAGE_SWITCH_GUARD, migrated.guard);
    }
  }
  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let scheduler = null;
  let updateScheduler = null;
  let statisticsScheduler = null;
  let isolationUndoScheduler = null;
  let root = null;
  let refs = {};
  let running = false;
  let pricingCache = null;
  let tokensCache = [];
  let userGroupsCache = {};
  let aihubGroupsCache = [];
  let aihubRatesCache = {};
  let fluxionGroupsCache = [];
  let fluxionRatesCache = {};
  let fluxionMonitorsCache = [];
  const inflightGetRequests = new Map();
  const newApiAuthManager = IS_NEW_API_SITE ? createNewApiAuthManager({
    providerLabel: SITE_LABEL,
    requestRefresh: (headers) => requestJsonWithRetry("/api/user/auth/refresh", {
      method: "POST",
      headers,
      maxAttempts: 1,
    }),
  }) : null;
  const pendingCandidates = new Map();
  const storedUi = GM_getValue(STORAGE_UI, {}) || {};
  const state = {
    tone: "idle",
    status: config.enabled ? "等待首次检查" : "自动切换已暂停",
    currentGroup: "-",
    bestGroup: "-",
    lastCheck: "-",
    candidates: [],
    tokenResults: [],
    todayUsage: {
      balance: 0,
      spend: 0,
      requests: 0,
      tokens: 0,
      symbol: "$",
      available: false,
      loading: true,
      error: "",
    },
    statistics: {
      metric: normalizeAihubStatisticsMetric(storedUi.statisticsMetric),
      range: normalizeAihubStatisticsRange(storedUi.statisticsRange ?? storedUi.statisticsDays),
      dataRange: "",
      dataDays: 0,
      granularity: "day",
      timezone: "",
      loading: false,
      loadingPhase: "idle",
      loadingProgress: 0,
      loaded: false,
      accountSeries: [],
      accountReconciliationSeries: [],
      accountReconciliationAggregate: null,
      keyResults: [],
      accountError: "",
      accountReconciliationError: "",
      keysError: "",
      loadedAt: 0,
    },
    spendProtection: {
      active: false,
      tone: "none",
      actualSpend: 0,
      trackedSpend: 0,
      limit: 0,
      ratio: 0,
      remaining: 0,
    },
    logs: normalizeLogs(GM_getValue(STORAGE_LOGS, [])),
    positions: normalizeUiPositions(GM_getValue(STORAGE_POSITIONS, {})),
    activeView: normalizeActiveView(storedUi.activeView),
    collapsed: false,
    update: {
      checking: false,
      availableVersion: "",
      lastCheckedAt: 0,
    },
    aihubSeriesDegraded: false,
    isolationUndo: {
      entries: [],
      expiresAt: 0,
    },
  };
