  const SITE_METADATA = Object.freeze({
    kfcoding: Object.freeze({
      id: "kfcoding",
      hostname: "kfcoding.codes",
      label: "KFCoding",
      shortLabel: "KF",
      storagePrefix: "kfcoding-group-switcher",
      apiFamily: "new-api",
    }),
    aihub: Object.freeze({
      id: "aihub",
      hostname: "aihub.top",
      label: "AIHub",
      shortLabel: "AH",
      storagePrefix: "aihub-group-switcher",
      apiFamily: "aihub",
    }),
    ooioo: Object.freeze({
      id: "ooioo",
      hostname: "ooioo.work",
      label: "ooioo",
      shortLabel: "OO",
      storagePrefix: "ooioo-group-switcher",
      apiFamily: "new-api",
    }),
    fluxionai: Object.freeze({
      id: "fluxionai",
      hostname: "fluxionai.space",
      label: "FluxionAI",
      shortLabel: "FX",
      storagePrefix: "fluxionai-group-switcher",
      apiFamily: "aihub",
    }),
  });

  function detectSiteId(value) {
    const normalized = String(value || "").trim().toLowerCase();
    const matched = Object.values(SITE_METADATA).find((site) => site.hostname === normalized);
    return matched ? matched.id : "kfcoding";
  }

  function storagePrefixForSite(siteId) {
    return (SITE_METADATA[siteId] || SITE_METADATA.kfcoding).storagePrefix;
  }

  const hostname = String((globalThis.location && globalThis.location.hostname) || "").toLowerCase();
  const previewSiteId = globalThis.__KFCODING_GROUP_SWITCHER_PREVIEW__ === true
    ? String(globalThis.__KFCODING_GROUP_SWITCHER_PREVIEW_SITE_ID__ || "")
    : "";
  const SITE_ID = SITE_METADATA[previewSiteId] ? previewSiteId : detectSiteId(hostname);
  const SITE = SITE_METADATA[SITE_ID];
  const IS_AIHUB = SITE_ID === "aihub";
  const IS_FLUXION = SITE_ID === "fluxionai";
  const IS_AIHUB_API = SITE.apiFamily === "aihub";
  const IS_NEW_API_SITE = SITE.apiFamily === "new-api";
  const SITE_LABEL = SITE.label;
  const SITE_SHORT_LABEL = SITE.shortLabel;
  const AIHUB_LEGACY_MONITOR_MODEL = "AIHub 公共渠道监测";
  const MODEL_IDENTITY_SEPARATOR = "\u001f";
  const AIHUB_MODEL_NAMES = Object.freeze({
    sol: "gpt-5.6-sol",
    terra: "gpt-5.6-terra",
    luna: "gpt-5.6-luna",
    astra: "gpt-6-astra",
  });
  const SCRIPT_VERSION = "0.15.4";
  const SCRIPT_DOWNLOAD_URL = "https://raw.githubusercontent.com/sj930211/kfcoding-aihub-group-switcher/main/kfcoding-group-switcher.user.js";
  /*
  const AIHUB_CACHE_PRICING = Object.freeze({
    baselineHitRate: 97,
    hitUnitPrice: 0.5,
    missUnitPrice: 5,
  });
  */

  const DEFAULT_CONFIG = Object.freeze({
    theme: "system",
    glassTransparency: 0,
    enabled: false,
    tokenIds: [],
    models: [],
    model: "",
    selectionMode: "saving",
    groupFilterMode: "whitelist",
    groupWhitelist: [],
    groupBlacklist: [],
    requireModelDetection: false,
    spendProtectionEnabled: false,
    dailySpendLimit: 0,
    pollSeconds: 30,
    metricHours: 24,
    minSuccessRate: 95,
    minLatestSuccessRate: 95,
    maxMetricAgeMinutes: 180,
    maxFirstTokenLatencySeconds: 120,
    maxOutputDurationSeconds: 0,
    maxGroupRatio: 0,
    confirmPolls: 2,
    switchHoldMinutes: 10,
    rollbackChecks: 2,
    blacklistMinutes: 60,
  });

  const STORAGE_PREFIX = storagePrefixForSite(SITE_ID);
  const STORAGE_CONFIG = `${STORAGE_PREFIX}:config:v1`;
  const STORAGE_LAST_SWITCH = `${STORAGE_PREFIX}:last-switch:v1`;
  const STORAGE_LOGS = `${STORAGE_PREFIX}:logs:v1`;
  const STORAGE_POSITIONS = `${STORAGE_PREFIX}:positions:v1`;
  const STORAGE_UI = `${STORAGE_PREFIX}:ui:v1`;
  const STORAGE_SWITCH_GUARD = `${STORAGE_PREFIX}:switch-guard:v1`;
  const STORAGE_SPEND_GUARD = `${STORAGE_PREFIX}:spend-guard:v1`;
  const STORAGE_UPDATE_NOTICE = "kfcoding-aihub-group-switcher:update-notice:v1";
  const MAX_LOG_ENTRIES = 10;
  const VIEWPORT_MARGIN = 8;
  const HOST_ID = `${STORAGE_PREFIX}-host`;
  const GET_REQUEST_TIMEOUT_MS = 25000;
  const MUTATION_REQUEST_TIMEOUT_MS = 30000;
  const GET_MAX_ATTEMPTS = 3;
  const AUTO_UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const STATISTICS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const SPEND_WARNING_RATIO = 0.8;
  const NEW_API_PUBLIC_API_PATHS = new Set([
    "/api/pricing",
    "/api/perf-metrics",
    "/api/status",
  ]);
  const NEW_API_AUTH_REFRESH_DELAYS_MS = [0, 80, 200, 500];
