  function addLog(message, tone) {
    state.logs.unshift({
      at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      message,
      tone: tone || "info",
    });
    state.logs = state.logs.slice(0, MAX_LOG_ENTRIES);
    GM_setValue(STORAGE_LOGS, state.logs);
  }

  function saveSpendGuardState(value) {
    GM_setValue(STORAGE_SPEND_GUARD, normalizeSpendGuard(value, localDateKey()));
  }

  function syncSpendProtection(options) {
    const request = options && typeof options === "object" ? options : {};
    const dateKey = localDateKey();
    const storedGuard = GM_getValue(STORAGE_SPEND_GUARD, {});
    const result = evaluateSpendProtection(state.todayUsage, config, storedGuard, dateKey);
    const guard = { ...result.guard };
    state.spendProtection = {
      active: result.active,
      tone: result.tone,
      actualSpend: result.actualSpend,
      trackedSpend: result.trackedSpend,
      limit: result.limit,
      ratio: result.ratio,
      remaining: result.remaining,
    };

    let notification = null;
    if (request.notify && result.tone === "reached" && !guard.warnedReached) {
      guard.warnedApproaching = true;
      guard.warnedReached = true;
      notification = {
        title: `${SITE_LABEL} 每日消费已达上限`,
        text: `提醒计数 ${formatSpendValue(result.trackedSpend, state.todayUsage.symbol)} / ${formatSpendValue(result.limit, state.todayUsage.symbol)}，仅提醒，不影响任务`,
        log: `消费提醒：已达到每日上限 ${formatSpendValue(result.limit, state.todayUsage.symbol)}`,
      };
    } else if (request.notify && result.tone === "approaching" && !guard.warnedApproaching) {
      guard.warnedApproaching = true;
      notification = {
        title: `${SITE_LABEL} 每日消费接近上限`,
        text: `提醒计数已使用 ${Math.round(result.ratio * 100)}%，剩余 ${formatSpendValue(result.remaining, state.todayUsage.symbol)}`,
        log: `消费提醒：已使用每日上限的 ${Math.round(result.ratio * 100)}%`,
      };
    }
    saveSpendGuardState(guard);
    if (notification) {
      addLog(notification.log, "warning");
      GM_notification({ title: notification.title, text: notification.text, timeout: 10000 });
    }
  }

  function resetSpendProtection() {
    const actualSpend = state.todayUsage.available
      ? Math.max(0, Number(state.todayUsage.spend) || 0)
      : 0;
    saveSpendGuardState({
      dateKey: localDateKey(),
      baselineSpend: actualSpend,
      warnedApproaching: false,
      warnedReached: false,
    });
    syncSpendProtection({ notify: false });
    addLog(`消费提醒计数已重置，当前基线 ${formatSpendValue(actualSpend, state.todayUsage.symbol)}`, "success");
    setStatus("消费提醒计数已从当前消费重新开始", "success");
  }

  function setStatus(message, tone) {
    state.status = message;
    state.tone = tone || "idle";
    render();
  }

  function requestRemoteScript() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `${SCRIPT_DOWNLOAD_URL}?update=${Date.now()}`,
        timeout: GET_REQUEST_TIMEOUT_MS,
        headers: { Accept: "text/plain" },
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(String(response.responseText || ""));
            return;
          }
          reject(new Error(`更新检查失败（HTTP ${response.status}）`));
        },
        onerror() {
          reject(new Error("更新检查网络错误"));
        },
        ontimeout() {
          reject(new Error("更新检查请求超时"));
        },
      });
    });
  }

  function notifyUpdateAvailable(remoteVersion) {
    const version = String(remoteVersion || "").trim();
    if (!version || GM_getValue(STORAGE_UPDATE_NOTICE, "") === version) return;
    GM_notification({
      title: "分组监控脚本有新版本",
      text: `可由 v${SCRIPT_VERSION} 升级到 v${version}，请打开插件设置完成更新`,
      timeout: 10000,
    });
    GM_setValue(STORAGE_UPDATE_NOTICE, version);
  }

  async function checkForUpdate(options) {
    const request = options && typeof options === "object" ? options : {};
    const silent = Boolean(request.silent);
    const force = Boolean(request.force);
    if (state.update.checking) return;
    if (
      silent
      && !force
      && state.update.lastCheckedAt > 0
      && Date.now() - state.update.lastCheckedAt < AUTO_UPDATE_CHECK_INTERVAL_MS
    ) return;

    state.update.checking = true;
    if (!silent) setStatus("正在检查脚本更新", "running");
    try {
      const remoteSource = await requestRemoteScript();
      const remoteVersion = extractUserscriptVersion(remoteSource);
      if (!remoteVersion) throw new Error("无法识别远端脚本版本");
      if (compareVersions(remoteVersion, SCRIPT_VERSION) > 0) {
        const isNewDiscovery = state.update.availableVersion !== remoteVersion;
        state.update.availableVersion = remoteVersion;
        if (isNewDiscovery) {
          addLog(`发现新版本 v${remoteVersion}`, "success");
          notifyUpdateAvailable(remoteVersion);
        }
        if (!silent) setStatus(`发现新版本 v${remoteVersion}，再次点击即可更新`, "success");
      } else if (!silent) {
        addLog(`当前已是最新版本 v${SCRIPT_VERSION}`, "success");
        setStatus(`当前已是最新版本 v${SCRIPT_VERSION}`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!silent) {
        addLog(message, "error");
        setStatus(message, "error");
      }
    } finally {
      state.update.lastCheckedAt = Date.now();
      state.update.checking = false;
      render();
    }
  }

  async function handleUpdateAction() {
    if (state.update.availableVersion) {
      GM_openInTab(SCRIPT_DOWNLOAD_URL, { active: true, insert: true, setParent: true });
      addLog(`已打开 v${state.update.availableVersion} 更新页面`, "success");
      setStatus("请在 Tampermonkey 安装页确认更新", "success");
      return;
    }
    await checkForUpdate({ force: true, silent: false });
  }

  function positionElement(element, kind, persist) {
    const saved = state.positions[kind];
    if (!element || !saved || element.hidden) return;
    const rect = element.getBoundingClientRect();
    const position = clampPosition(
      saved,
      window.innerWidth,
      window.innerHeight,
      rect.width,
      rect.height,
    );
    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
    state.positions[kind] = position;
    if (persist) GM_setValue(STORAGE_POSITIONS, state.positions);
  }

  function bindDrag(handle, element, kind) {
    let drag = null;
    handle.addEventListener("pointerdown", (event) => {
      const interactiveChild = event.target !== handle && event.target.closest("button, input, select, a");
      if (event.button !== 0 || interactiveChild) return;
      const rect = element.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        elementX: rect.left,
        elementY: rect.top,
        moved: false,
      };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(deltaX, deltaY) < 10) return;
      if (!drag.moved) {
        drag.moved = true;
        element.dataset.dragging = "true";
      }
      const rect = element.getBoundingClientRect();
      const position = clampPosition(
        { x: drag.elementX + deltaX, y: drag.elementY + deltaY },
        window.innerWidth,
        window.innerHeight,
        rect.width,
        rect.height,
      );
      element.style.left = `${position.x}px`;
      element.style.top = `${position.y}px`;
      element.style.right = "auto";
      element.style.bottom = "auto";
      state.positions[kind] = position;
      event.preventDefault();
    });
    const finish = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.moved) {
        if (event.type === "pointerup") element.dataset.dragged = "true";
        GM_setValue(STORAGE_POSITIONS, state.positions);
      }
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      delete element.dataset.dragging;
      drag = null;
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function requestHeaders(hasBody, newApiAccessToken) {
    const headers = { Accept: "application/json" };
    if (IS_AIHUB_API) {
      const authToken = window.localStorage.getItem("auth_token");
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      headers["Accept-Language"] = "zh";
      if (IS_FLUXION) headers["X-User-UI-Request"] = "1";
    } else {
      if (newApiAccessToken) headers.Authorization = `Bearer ${newApiAccessToken}`;
      const uid = window.localStorage.getItem("uid");
      if (uid) headers["New-Api-User"] = uid;
    }
    if (hasBody) headers["Content-Type"] = "application/json";
    return headers;
  }

  function unwrapSiteResponse(payload) {
    if (!IS_AIHUB_API || !payload || typeof payload !== "object" || !("code" in payload)) {
      return payload;
    }
    if (Number(payload.code) !== 0) {
      throw new Error(payload.message || `${SITE_LABEL} 接口返回错误码 ${payload.code}`);
    }
    return payload.data;
  }

  function withFluxionTimezone(path, method) {
    const source = String(path || "");
    if (!IS_FLUXION || String(method || "GET").toUpperCase() !== "GET" || /[?&]timezone=/.test(source)) {
      return source;
    }
    const hashIndex = source.indexOf("#");
    const base = hashIndex >= 0 ? source.slice(0, hashIndex) : source;
    const hash = hashIndex >= 0 ? source.slice(hashIndex) : "";
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}timezone=${encodeURIComponent(aihubTimezone())}${hash}`;
  }

  async function fetchJson(path, options) {
    const request = options || {};
    const method = String(request.method || "GET").toUpperCase();
    const requestPath = withFluxionTimezone(path, method);
    const executeRequest = async (newApiAccessToken) => unwrapSiteResponse(await requestJsonWithRetry(requestPath, {
      ...request,
      method,
      headers: requestHeaders(request.body !== undefined, newApiAccessToken),
    }));
    const execute = async () => IS_AIHUB_API
      ? executeRequest("")
      : requestWithNewApiAuth(requestPath, newApiAuthManager, executeRequest);

    if (method !== "GET") return execute();
    if (inflightGetRequests.has(requestPath)) return inflightGetRequests.get(requestPath);

    const pending = execute().finally(() => inflightGetRequests.delete(requestPath));
    inflightGetRequests.set(requestPath, pending);
    return pending;
  }

  function normalizeTokenList(payload) {
    if (IS_AIHUB_API) {
      const items = Array.isArray(payload)
        ? payload
        : payload && Array.isArray(payload.items)
          ? payload.items
          : [];
      return items.map(normalizeAihubToken);
    }
    return normalizeNewApiTokenList(payload);
  }

  function normalizeNewApiTokenList(payload) {
    const data = payload && payload.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  }

  function normalizeAihubToken(token) {
    const source = token && typeof token === "object" ? token : {};
    const groupMeta = source.group && typeof source.group === "object" ? source.group : {};
    const groupId = Number(source.group_id ?? groupMeta.id);
    return {
      ...source,
      group: String(groupMeta.name || source.group_name || "未分组"),
      groupId: Number.isFinite(groupId) && groupId > 0 ? groupId : 0,
    };
  }

  async function refreshTodayUsage() {
    state.todayUsage.loading = true;
    state.todayUsage.error = "";
    render();
    try {
      let usage;
      if (IS_AIHUB_API) {
        const [usagePayload, account] = await Promise.all([
          fetchJson("/api/v1/usage/stats?period=today"),
          fetchJson("/api/v1/auth/me"),
        ]);
        usage = normalizeAihubTodayUsage(
          usagePayload,
          account,
        );
      } else {
        const range = todayTimestampRange();
        const query = new URLSearchParams({
          start_timestamp: String(range.start),
          end_timestamp: String(range.end),
          default_time: "hour",
        });
        const [payload, status, account] = await Promise.all([
          fetchJson(`/api/data/self?${query}`),
          fetchJson("/api/status"),
          fetchJson("/api/user/self"),
        ]);
        usage = normalizeNewApiTodayUsage(payload, status, account);
      }
      state.todayUsage = { ...usage, available: true, loading: false, error: "" };
      syncSpendProtection({ notify: true });
      render();
      return true;
    } catch (error) {
      state.todayUsage.loading = false;
      state.todayUsage.error = error instanceof Error ? error.message : String(error);
      render();
      return false;
    }
  }

  async function refreshStatistics(options) {
    if (!IS_AIHUB || state.statistics.loading) return false;
    const request = options && typeof options === "object" ? options : {};
    const requestedRange = normalizeAihubStatisticsRange(state.statistics.range);
    const previousMatchesRange = state.statistics.loaded && state.statistics.dataRange === requestedRange;
    state.statistics.loading = true;
    state.statistics.loadingPhase = "trend";
    state.statistics.loadingProgress = 0.1;
    state.statistics.accountError = "";
    state.statistics.keysError = "";
    render();
    try {
      const result = await loadAihubUsageStatistics(fetchJson, {
        range: requestedRange,
        timezone: aihubTimezone(),
        concurrency: 3,
        keys: tokensCache.length ? tokensCache : undefined,
        onProgress: ({ phase, progress }) => {
          state.statistics.loadingPhase = phase;
          state.statistics.loadingProgress = progress;
          render();
        },
      });
      const individualFailures = result.keyResults.filter((entry) => entry.status !== "success").length;
      const accountSeries = result.accountError && previousMatchesRange
        ? state.statistics.accountSeries
        : result.accountSeries;
      const accountReconciliationSeries = result.accountReconciliationError && previousMatchesRange
        ? state.statistics.accountReconciliationSeries
        : result.accountReconciliationSeries;
      const keyResults = result.keysError && previousMatchesRange
        ? state.statistics.keyResults
        : result.keyResults;
      state.statistics = {
        ...state.statistics,
        range: requestedRange,
        dataRange: result.range,
        dataDays: result.days,
        granularity: result.granularity,
        timezone: result.timezone,
        loading: false,
        loadingPhase: "idle",
        loadingProgress: 1,
        loaded: accountSeries.length > 0 || keyResults.length > 0,
        accountSeries,
        accountReconciliationSeries,
        accountReconciliationAggregate: result.accountReconciliationError && previousMatchesRange
          ? state.statistics.accountReconciliationAggregate
          : result.accountReconciliationAggregate,
        keyResults,
        accountError: result.accountError,
        accountReconciliationError: result.accountReconciliationError,
        keysError: result.keysError,
        loadedAt: result.accountError && previousMatchesRange ? state.statistics.loadedAt : result.loadedAt,
      };
      if (!request.silent) {
        if (result.accountError) {
          addLog(`AIHub 统计趋势读取失败：${result.accountError}`, "error");
        } else if (result.keysError) {
          addLog(`AIHub 密钥统计列表读取失败：${result.keysError}`, "warning");
        } else if (individualFailures > 0) {
          addLog(`AIHub 统计已刷新，${individualFailures} 个密钥读取失败`, "warning");
        } else {
          const rangeLabel = requestedRange === "today"
            ? "今天"
            : requestedRange === "yesterday"
              ? "昨天"
              : `最近 ${requestedRange} 天`;
          addLog(`AIHub ${rangeLabel}统计已刷新`, "success");
        }
      }
      render();
      return !result.accountError;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.statistics.loading = false;
      state.statistics.loadingPhase = "idle";
      state.statistics.loadingProgress = 0;
      state.statistics.accountError = message;
      if (!request.silent) addLog(`AIHub 统计读取失败：${message}`, "error");
      render();
      return false;
    }
  }

  async function refreshCatalogs() {
    if (IS_AIHUB_API) {
      const requests = [
        IS_AIHUB ? loadAllAihubKeys(fetchJson, 100) : fetchJson("/api/v1/keys?page=1&page_size=100"),
        fetchJson("/api/v1/groups/available"),
        fetchJson("/api/v1/groups/rates"),
      ];
      if (IS_FLUXION) requests.push(fetchJson("/api/v1/channel-monitors"));
      else requests.push(loadAihubProviderData(fetchJson));
      const [tokenList, groups, rates, monitorPayload] = await Promise.all(requests);
      tokensCache = normalizeTokenList(tokenList);
      if (IS_FLUXION) {
        fluxionGroupsCache = normalizeFluxionGroups(groups);
        fluxionRatesCache = normalizeAihubRates(rates);
        fluxionMonitorsCache = normalizeFluxionMonitors(monitorPayload);
        pricingCache = buildFluxionModelCatalog(monitorPayload, groups);
      } else {
        aihubGroupsCache = normalizeAihubGroups(groups);
        aihubRatesCache = normalizeAihubRates(rates);
        pricingCache = buildAihubModelCatalog(monitorPayload.summary);
        updateImageQualityCatalog(monitorPayload.summary);
      }
      renderOptions();
      render();
      return;
    }
    const [pricing, tokenList, userGroups] = await Promise.all([
      fetchJson("/api/pricing"),
      fetchJson("/api/token/?p=1&size=100"),
      fetchJson("/api/user/self/groups"),
    ]);
    pricingCache = pricing;
    tokensCache = normalizeTokenList(tokenList);
    userGroupsCache = unwrapUserGroups(userGroups);
    renderOptions();
    render();
  }

  async function refreshTokenCatalog() {
    const payload = IS_AIHUB_API
      ? (IS_AIHUB ? await loadAllAihubKeys(fetchJson, 100) : await fetchJson("/api/v1/keys?page=1&page_size=100"))
      : await fetchJson("/api/token/?p=1&size=100");
    tokensCache = normalizeTokenList(payload);
    renderOptions(true);
    render();
  }

  async function getTokenDetail(tokenId) {
    if (IS_AIHUB_API) {
      try {
        const payload = await fetchJson(`/api/v1/keys/${tokenId}`);
        if (!payload || typeof payload !== "object") throw new Error("API 密钥详情为空");
        const detail = normalizeAihubToken(payload);
        if (IS_AIHUB) {
          const cached = tokensCache.find((token) => Number(token.id) === Number(tokenId));
          const groupState = { id: Number(tokenId), group: detail.group, groupId: detail.groupId };
          if (cached) Object.assign(cached, groupState);
          else tokensCache.push({ ...groupState, name: detail.name });
        }
        return detail;
      } catch (error) {
        if (IS_AIHUB) {
          const cached = tokensCache.find((token) => Number(token.id) === Number(tokenId));
          if (cached) Object.assign(cached, { group: "", groupId: 0 });
        }
        throw error;
      }
    }
    const payload = await fetchJson(`/api/token/${tokenId}`);
    if (!payload.data || typeof payload.data !== "object") {
      throw new Error("API 密钥详情为空");
    }
    return payload.data;
  }

  function getSwitchHistory() {
    return normalizeSwitchHistory(GM_getValue(STORAGE_LAST_SWITCH, {}));
  }

  function switchHoldState(history, tokenId, model, group, holdMinutes, now) {
    const last = normalizeSwitchHistory(history).byToken[Number(tokenId)] || null;
    const durationMs = Math.max(0, Number(holdMinutes) || 0) * 60000;
    const matches = Boolean(
      last
      && last.model === String(model || "")
      && last.group === String(group || ""),
    );
    if (!matches) return { tracked: false, remainingMs: 0, expired: false };
    const elapsedMs = Math.max(0, Number(now) - Number(last.at || 0));
    const remainingMs = Math.max(0, durationMs - elapsedMs);
    return {
      tracked: true,
      remainingMs,
      expired: durationMs > 0 && remainingMs === 0,
    };
  }

  function shouldKeepCurrentDuringHold(currentCandidate, holdState) {
    return Boolean(
      currentCandidate
      && currentCandidate.available
      && holdState
      && Number(holdState.remainingMs) > 0,
    );
  }

  function recordSwitchHoldStart(tokenId, candidate) {
    const history = getSwitchHistory();
    history.byToken[tokenId] = {
      model: targetModelIdentity(config),
      group: candidate.group,
      at: Date.now(),
    };
    GM_setValue(STORAGE_LAST_SWITCH, history);
  }

  function getSwitchGuardState(now) {
    return pruneSwitchGuardState(
      GM_getValue(STORAGE_SWITCH_GUARD, {}),
      now == null ? Date.now() : now,
    );
  }

  function saveSwitchGuardState(value) {
    GM_setValue(STORAGE_SWITCH_GUARD, normalizeSwitchGuardState(value));
  }

  function refreshCandidateIsolationState(updateRecommendation = true) {
    const now = Date.now();
    const candidates = state.candidates.map((candidate) => {
      const reasons = candidate.reasons.filter((reason) => reason !== "temporarily-blacklisted");
      return { ...candidate, reasons, available: reasons.length === 0 };
    });
    state.candidates = applyTemporaryBlacklist(candidates, getSwitchGuardState(now), targetModelIdentity(config), now);
    if (updateRecommendation) {
      const recommended = selectBestCandidate(state.candidates, "", config.selectionMode);
      state.bestGroup = candidateRecommendationLabel(recommended);
    }
  }

  function setIsolationUndo(entries) {
    if (isolationUndoScheduler) window.clearTimeout(isolationUndoScheduler);
    state.isolationUndo = {
      entries: entries.slice(),
      expiresAt: Date.now() + 8000,
    };
    isolationUndoScheduler = window.setTimeout(() => {
      state.isolationUndo = { entries: [], expiresAt: 0 };
      isolationUndoScheduler = null;
      render();
    }, 8000);
  }

  function clearIsolation(model, group) {
    const result = removeIsolation(getSwitchGuardState(), model, group, Date.now());
    if (!result.removed.length) return;
    saveSwitchGuardState(result.state);
    refreshCandidateIsolationState();
    setIsolationUndo(result.removed);
    addLog(`已解除故障隔离：${group}`, "success");
    setStatus(`已解除 ${group} 的故障隔离`, "success");
  }

  function clearAllIsolations() {
    const result = removeAllIsolations(getSwitchGuardState(), Date.now());
    if (!result.removed.length) return;
    saveSwitchGuardState(result.state);
    refreshCandidateIsolationState();
    setIsolationUndo(result.removed);
    addLog(`已解除全部故障隔离（${result.removed.length} 个）`, "success");
    setStatus(`已解除 ${result.removed.length} 个故障隔离`, "success");
  }

  function undoIsolationClear() {
    const entries = state.isolationUndo.entries.slice();
    if (!entries.length || state.isolationUndo.expiresAt <= Date.now()) return;
    saveSwitchGuardState(restoreIsolations(getSwitchGuardState(), entries, Date.now()));
    state.isolationUndo = { entries: [], expiresAt: 0 };
    if (isolationUndoScheduler) window.clearTimeout(isolationUndoScheduler);
    isolationUndoScheduler = null;
    refreshCandidateIsolationState();
    addLog(`已撤销解除故障隔离（${entries.length} 个）`, "warning");
    setStatus("故障隔离已恢复", "warning");
  }

  function recordRollbackGuard(token, candidate) {
    const tokenId = Number(token.id);
    const state = getSwitchGuardState();
    const fromGroup = String(token.group || "").trim();
    const toGroup = String(candidate.group || "").trim();
    if (
      config.rollbackChecks <= 0 ||
      !Number.isFinite(tokenId) ||
      tokenId <= 0 ||
      !fromGroup ||
      !toGroup ||
      fromGroup === toGroup
    ) {
      delete state.byToken[tokenId];
      saveSwitchGuardState(state);
      return;
    }
    state.byToken[tokenId] = {
      model: targetModelIdentity(config),
      fromGroup,
      toGroup,
      remaining: config.rollbackChecks,
      at: Date.now(),
    };
    saveSwitchGuardState(state);
  }

  function tokenLabel(token) {
    return String(token.name || `#${token.id}`);
  }

  function summarizeTokenGroups(results) {
    if (!results.length) return "-";
    const counts = new Map();
    results.forEach((result) => {
      const group = String(result.group || "未知");
      counts.set(group, (counts.get(group) || 0) + 1);
    });
    if (results.length === 1) return [...counts.keys()][0];
    const groups = [...counts.entries()]
      .map(([group, count]) => `${group} ${count}`)
      .join(" / ");
    return `${results.length} 个密钥 · ${groups}`;
  }

  async function switchTokenGroup(token, candidate, options) {
    if (IS_AIHUB) {
      return withImageQualityKeyLock(token.id, false, async () => {
        const latest = await getTokenDetail(token.id);
        if (Number(latest.groupId) !== Number(token.groupId)) throw new Error("密钥分组已在其他操作中改变，本次取消切换");
        return switchTokenGroupUnlocked(token, candidate, options);
      });
    }
    return switchTokenGroupUnlocked(token, candidate, options);
  }

  async function switchTokenGroupUnlocked(token, candidate, options) {
    const switchOptions = options || {};
    switchOptions.beforeSwitch?.();
    if (imageQuality.recoveryError) throw new Error(imageQuality.recoveryError);
    if (IS_AIHUB_API) {
      if (!Number.isFinite(Number(candidate.groupId)) || Number(candidate.groupId) <= 0) {
        throw new Error(`目标分组 ${candidate.group} 缺少有效 ID`);
      }
      await fetchJson(`/api/v1/keys/${token.id}`, {
        method: "PUT",
        body: { group_id: Number(candidate.groupId) },
      });
      const verified = await getTokenDetail(token.id);
      if (Number(verified.groupId) !== Number(candidate.groupId)) {
        throw new Error(`切换校验失败，服务端当前分组为 ${verified.group || "空"}`);
      }
      recordSwitchHoldStart(token.id, candidate);
      if (switchOptions.trackRollback !== false) recordRollbackGuard(token, candidate);
      pendingCandidates.delete(Number(token.id));
      addLog(
        switchOptions.logMessage || `${tokenLabel(token)} 已切换到 ${candidate.group} (${formatRatio(candidate.ratio)})`,
        switchOptions.logTone || "success",
      );
      return verified;
    }
    const payload = buildTokenUpdatePayload(token, candidate.group);
    await fetchJson("/api/token/", { method: "PUT", body: payload });
    const verified = await getTokenDetail(token.id);
    if (verified.group !== candidate.group) {
      throw new Error(`切换校验失败，服务端当前分组为 ${verified.group || "空"}`);
    }
    recordSwitchHoldStart(token.id, candidate);
    if (switchOptions.trackRollback !== false) recordRollbackGuard(token, candidate);
    pendingCandidates.delete(Number(token.id));
    addLog(
      switchOptions.logMessage || `${tokenLabel(token)} 已切换到 ${candidate.group} (${formatRatio(candidate.ratio)})`,
      switchOptions.logTone || "success",
    );
    return verified;
  }

  function validateToken(token) {
    if (IS_AIHUB_API) {
      if (token.status !== "active") throw new Error("选中的 API 密钥未启用");
      return;
    }
    if (token.status != null && Number(token.status) !== 1) {
      throw new Error("选中的 API 密钥未启用");
    }
    const unsupportedModels = targetModels(config).filter((model) => !tokenSupportsModel(token, model));
    if (unsupportedModels.length) {
      throw new Error(`选中的 API 密钥未允许模型 ${unsupportedModels.join("、")}`);
    }
  }

  // Only a pending decision owns these results. Display records never grant admission.
  function automaticImageAdmissionStatus(candidate) {
    const job = [...automaticImageAdmission.jobs.values()].find((item) => !item.invalid
      && item.candidate.group === candidate.group && item.source === imageQualityIdentity(candidate));
    if (!job) return "";
    if (job.error) return "服务异常";
    if (!job.verdict) return automaticImageAdmission.active === job ? "评价中" : "待评价";
    return job.verdict.pass ? "" : "未通过";
  }

  function detachAutomaticImageAdmission(tokenId) {
    const binding = automaticImageAdmission.bindings.get(Number(tokenId));
    if (!binding) return;
    automaticImageAdmission.bindings.delete(Number(tokenId));
    const job = binding.job;
    if (![...automaticImageAdmission.bindings.values()].some((item) => item.job === job)) {
      job.invalid = true;
      automaticImageAdmission.jobs.delete(job.key);
      if (automaticImageAdmission.active === job) job.controller?.abort();
    }
  }

  function invalidateAutomaticImageAdmission() {
    for (const job of automaticImageAdmission.jobs.values()) job.invalid = true;
    automaticImageAdmission.active?.controller?.abort();
    automaticImageAdmission.context = null;
    automaticImageAdmission.jobs.clear();
    automaticImageAdmission.bindings.clear();
  }

  async function stopAutomaticImageAdmission() {
    invalidateAutomaticImageAdmission();
    // Restoration runs inside the scorer's finally block, even on abort.
    await automaticImageAdmission.draining;
    if (imageQuality.recoveryError) throw new Error(imageQuality.recoveryError);
  }

  function startAutomaticImageAdmissionQueue() {
    if (automaticImageAdmission.draining) return;
    const drain = async () => {
      for (;;) {
        const job = [...automaticImageAdmission.jobs.values()].find((item) => !item.invalid && !item.started);
        if (!job) return;
        job.started = true;
        automaticImageAdmission.active = job;
        try {
          if (job.context.scorerFailure) throw job.context.scorerFailure;
          job.verdict = await checkCandidateImageAdmission(job.candidate, job.context, () => {
            if (job.invalid) throw new Error("候选已改变，本次评价已失效");
          }, (controller) => { job.controller = controller; });
          // A late result must not affect a business decision abandoned outside this page.
          for (const [tokenId, binding] of [...automaticImageAdmission.bindings]) {
            if (binding.job !== job) continue;
            const latest = Number(imageQuality.scoringToken?.id) === tokenId
              ? imageQuality.scoringToken : await getTokenDetail(tokenId);
            if (latest.group !== binding.token.group) detachAutomaticImageAdmission(tokenId);
          }
          if (job.invalid) continue;
          assertImageAdmissionCurrent(job.context);
          job.completedRevision = state.candidateRequestRevision;
          if (!job.verdict.pass) isolateImageCandidate(job.candidate, job.verdict.reason);
          imageQuality.status = `${job.candidate.group} · ${job.verdict.pass ? "图片通过，等待最新健康检查" : job.verdict.reason + "，已故障隔离"}`;
        } catch (error) {
          if (!job.invalid) {
            job.error = error instanceof Error ? error.message : String(error);
            imageQuality.status = job.error;
          }
        } finally {
          automaticImageAdmission.active = null;
          render();
        }
      }
    };
    automaticImageAdmission.draining = drain().finally(() => {
      automaticImageAdmission.draining = null;
      if ([...automaticImageAdmission.jobs.values()].some((job) => !job.invalid && !job.started)) startAutomaticImageAdmissionQueue();
      if (config.enabled) requestHealthCheck(250);
    });
  }

  function prepareAutomaticImageAdmission(token, candidate) {
    let context = automaticImageAdmission.context;
    if (context) {
      try { assertImageAdmissionCurrent(context); }
      catch { invalidateAutomaticImageAdmission(); context = null; }
    }
    if (!context) automaticImageAdmission.context = context = createImageAdmissionContext();
    const tokenId = Number(token.id);
    const previous = automaticImageAdmission.bindings.get(tokenId);
    const key = JSON.stringify([candidate.groupId, candidate.group, imageQualityIdentity(candidate)]);
    if (previous && (previous.job.key !== key || previous.token.group !== token.group)) detachAutomaticImageAdmission(tokenId);
    let job = automaticImageAdmission.jobs.get(key);
    if (!job) {
      job = { key, candidate, source: imageQualityIdentity(candidate), context,
        verdict: null, error: "", invalid: false, started: false };
      automaticImageAdmission.jobs.set(key, job);
    }
    automaticImageAdmission.bindings.set(tokenId, { job, token: { ...token } });
    startAutomaticImageAdmissionQueue();
    return job;
  }

  function createImageAdmissionContext() {
    return { remaining: 10, unavailableGroups: new Set(), scorerFailure: null, configKey: JSON.stringify(config), catalogRevision: imageQuality.catalogRevision,
      cancelRevision: imageQuality.cancelRevision || 0 };
  }

  function assertImageAdmissionCurrent(context) {
    if (imageQuality.recoveryError) throw new Error(imageQuality.recoveryError);
    if (context.configKey !== JSON.stringify(config) || context.catalogRevision !== imageQuality.catalogRevision
      || context.cancelRevision !== (imageQuality.cancelRevision || 0)
      || Number(GM_getValue(STORAGE_IMAGE_QUALITY_CATALOG_AT, 0)) > imageQuality.catalogAt) {
      throw new Error("设置、图片目录已变更或评分已停止，本轮取消切换；未继续隔离");
    }
  }

  async function waitForImageAdmissionIdle(context, assertJob) {
    const deadline = Date.now() + 90000;
    while (imageQuality.controller || imageQuality.modelsController) {
      assertJob();
      assertImageAdmissionCurrent(context);
      if (Date.now() >= deadline) throw new Error("图片评分任务忙，本轮保持当前分组；未隔离");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assertImageAdmissionCurrent(context);
  }

  async function checkCandidateImageAdmission(candidate, context, assertJob = () => {}, onController) {
    assertJob();
    assertImageAdmissionCurrent(context);
    if (!imageQualityIdentity(candidate)) return { pass: false, reason: "没有可用图片" };
    if (!imageQualityEnabled(config)) throw new Error("请配置评分密钥和模型；正常择优已暂停，故障恢复仍可执行");
    await waitForImageAdmissionIdle(context, assertJob);
    if (context.scorerFailure) throw context.scorerFailure;
    assertJob();
    let entry;
    try {
      entry = await runImageQuality({ candidate, budget: context, onController });
    } catch (error) {
      assertJob();
      assertImageAdmissionCurrent(context);
      if (error?.code === "IMAGE_CATALOG_STALE") throw new Error("图片目录已在其他页面更新，本轮取消切换；未继续隔离");
      if (error?.code === "IMAGE_ADMISSION_BUDGET") throw new Error("本轮已达10次请求上限，保持当前分组；未继续隔离");
      if (error?.code === "IMAGE_SCORER_UNAVAILABLE") {
        context.scorerFailure = new Error(imageQualityFailureMessage(error, new AbortController()));
        throw context.scorerFailure;
      }
      if (error?.code === "IMAGE_READ_FAILED") return { pass: false, reason: "图片读取失败，没有有效评价" };
      if (error?.code === "IMAGE_UNASSESSABLE") return { pass: false, reason: "图片无法识别，没有有效评价" };
      context.scorerFailure = new Error("图片读取或评价失败，本次决策停止；未隔离业务分组");
      throw context.scorerFailure;
    }
    assertJob();
    assertImageAdmissionCurrent(context);
    return imageQualityAdmissionVerdict(entry, config.imageQualityMinScore);
  }

  function isolateImageCandidate(candidate, reason) {
    const now = Date.now();
    const model = targetModelIdentity(config);
    const guard = getSwitchGuardState(now);
    guard.blacklist = guard.blacklist.filter((entry) => entry.model !== model || entry.group !== candidate.group || entry.type !== "image");
    guard.blacklist.push({ model, group: candidate.group, type: "image", reason,
      until: now + config.blacklistMinutes * 60000 });
    saveSwitchGuardState(guard);
    refreshCandidateIsolationState();
    addLog(`${candidate.group}：${reason}，故障隔离 ${config.blacklistMinutes} 分钟`, "warning");
    render();
  }

  async function admittedSwitchCandidate(token, candidates, preferred, context) {
    if (!IS_AIHUB) return preferred;
    if (context.scorerFailure) throw context.scorerFailure;
    const candidate = await selectImageQualifiedCandidate(candidates, token.group, {
      mode: config.selectionMode, preferred,
      assertCurrent: () => assertImageAdmissionCurrent(context),
      eligible: (rows) => applyTemporaryBlacklist(rows, getSwitchGuardState(), targetModelIdentity(config), Date.now())
        .filter((row) => row.available),
      check: (row) => checkCandidateImageAdmission(row, context),
      isolate: isolateImageCandidate,
    });
    assertImageAdmissionCurrent(context);
    if (candidate && candidate.group !== token.group) {
      const latest = await getTokenDetail(token.id);
      assertImageAdmissionCurrent(context);
      if (latest.group !== token.group) throw new Error("密钥分组已在其他页面改变，本轮取消切换");
    }
    return candidate;
  }

  function imageAdmissionHoldResult(token) {
    pendingCandidates.delete(Number(token.id));
    detachAutomaticImageAdmission(token.id);
    return { outcome: "image-blocked", group: token.group || "未设置", tone: "warning",
      message: "没有需要切换且通过图片准入的分组，保持当前分组" };
  }

  async function handleRollbackGuard(token, candidates, admission, observeHealth = true) {
    const tokenId = Number(token.id);
    const now = Date.now();
    const guardState = getSwitchGuardState(now);
    const guard = guardState.byToken[tokenId];
    if (!guard) return null;
    if (
      config.rollbackChecks <= 0 ||
      guard.model !== targetModelIdentity(config) ||
      guard.toGroup !== String(token.group || "")
    ) {
      delete guardState.byToken[tokenId];
      saveSwitchGuardState(guardState);
      return null;
    }

    const current = candidates.find((candidate) => candidate.group === guard.toGroup);
    if (current && current.available) {
      if (observeHealth) guard.remaining -= 1;
      if (guard.remaining <= 0) {
        delete guardState.byToken[tokenId];
        addLog(`${tokenLabel(token)} 的 ${guard.toGroup} 已通过切换观察`, "success");
        saveSwitchGuardState(guardState);
        return {
          outcome: "observed",
          group: guard.toGroup,
          tone: "success",
          message: "切换观察完成",
        };
      }
      guardState.byToken[tokenId] = guard;
      saveSwitchGuardState(guardState);
      return {
        outcome: "observing",
        group: guard.toGroup,
        tone: "warning",
        message: `切换观察中，剩余 ${guard.remaining} 次`,
      };
    }

    if (candidateHasHealthFailure(current)) {
      guardState.blacklist = guardState.blacklist.filter(
        (entry) => entry.model !== targetModelIdentity(config) || entry.group !== guard.toGroup || entry.type === "image",
      );
      guardState.blacklist.push({
        model: targetModelIdentity(config),
        group: guard.toGroup,
        until: now + config.blacklistMinutes * 60000,
        type: "health", reason: "切换后健康检查失败",
      });
    }
    delete guardState.byToken[tokenId];
    saveSwitchGuardState(guardState);

    const eligible = applyTemporaryBlacklist(candidates, guardState, targetModelIdentity(config), now, { ignoreImage: true });
    const rollbackTarget = selectRollbackCandidate(eligible, guard.fromGroup, config.selectionMode);
    let fallback = rollbackTarget.candidate;
    if (!fallback) return IS_AIHUB ? imageAdmissionHoldResult(token) : null;
    await stopAutomaticImageAdmission();
    assertImageAdmissionCurrent(admission);
    if (!fallback || fallback.group === token.group) return imageAdmissionHoldResult(token);

    const destination = fallback.group === guard.fromGroup ? "原分组" : "其他可用分组";
    await switchTokenGroup(token, fallback, {
      trackRollback: false,
      beforeSwitch: () => assertImageAdmissionCurrent(admission),
      logTone: "warning",
      logMessage: `${tokenLabel(token)} 的 ${guard.toGroup} 观察失败，已回滚到${destination} ${fallback.group}`,
    });
    return {
      outcome: "rolled-back",
      group: fallback.group,
      tone: "warning",
      message: `观察失败，已回滚到 ${fallback.group}`,
    };
  }

  async function processToken(token, candidates, options) {
    const forceSwitch = Boolean(options && options.forceSwitch);
    const healthOnly = options?.mode === "health";
    const targetGroup = String((options && options.targetGroup) || "").trim();
    const tokenId = Number(token.id);
    const admission = options?.admission || createImageAdmissionContext();
    if (admission.configKey !== JSON.stringify(config)) throw new Error("检查期间设置已变更，本轮取消切换");
    validateToken(token);
    const binding = automaticImageAdmission.bindings.get(tokenId);
    if (binding && (binding.token.group !== token.group || Number(binding.token.groupId) !== Number(token.groupId))) {
      detachAutomaticImageAdmission(tokenId);
      pendingCandidates.delete(tokenId);
    }
    const recoveryCandidates = applyTemporaryBlacklist(candidates, getSwitchGuardState(), targetModelIdentity(config), Date.now(), { ignoreImage: true });
    if (config.enabled && !forceSwitch) {
      const rollback = await handleRollbackGuard(token, recoveryCandidates, admission, options?.observeHealth !== false);
      if (rollback) return rollback;
    }
    const healthyCurrent = recoveryCandidates.find((candidate) => candidate.group === token.group);
    if (config.enabled && !forceSwitch && (!healthyCurrent || !healthyCurrent.available)) {
      const recovery = selectSwitchCandidate(recoveryCandidates, token.group, "", { mode: config.selectionMode });
      await stopAutomaticImageAdmission();
      assertImageAdmissionCurrent(admission);
      pendingCandidates.delete(tokenId);
      if (!recovery || recovery.group === token.group) return { outcome: "recovery-blocked", group: token.group || "未设置",
        tone: "warning", message: "当前分组不可用，没有可恢复的健康分组" };
      await switchTokenGroup(token, recovery, { beforeSwitch: () => assertImageAdmissionCurrent(admission) });
      return { outcome: "switched", group: recovery.group, tone: "success", message: "故障恢复，已跳过图片检查" };
    }
    // Health ticks may finish an already confirmed decision, but never create one or add confirmations.
    if (healthOnly && !forceSwitch) {
      const pending = pendingCandidates.get(tokenId);
      const bound = automaticImageAdmission.bindings.get(tokenId)?.job;
      if (!IS_AIHUB || !bound?.verdict?.pass || bound.invalid || !pending || pending.hits < config.confirmPolls) {
        return { outcome: "healthy", group: token.group || "未设置", tone: bound?.error ? "warning" : "success",
          message: bound?.error || (bound && !bound.verdict ? "当前分组正常，图片后台评价中" : "当前分组正常，等待择优周期") };
      }
    }
    // Previous tokens in this check may already have isolated an image candidate.
    candidates = applyTemporaryBlacklist(candidates, getSwitchGuardState(), targetModelIdentity(config), Date.now());
    let selected = selectSwitchCandidate(candidates, token.group, targetGroup, {
      mode: config.selectionMode,
      allowUnavailable: Boolean(targetGroup),
    });
    const current = candidates.find((candidate) => candidate.group === token.group);
    const holdState = switchHoldState(
      getSwitchHistory(),
      tokenId,
      targetModelIdentity(config),
      token.group,
      config.switchHoldMinutes,
      Date.now(),
    );

    if (!selected) {
      detachAutomaticImageAdmission(tokenId);
      if (IS_AIHUB && !targetGroup) return imageAdmissionHoldResult(token);
      const reasonSummary = summarizeFailures(candidates);
      throw new Error(`没有满足条件的分组${reasonSummary ? `：${reasonSummary}` : ""}`);
    }
    if (!shouldSwitchCandidate(selected, token.group)) {
      pendingCandidates.delete(tokenId);
      detachAutomaticImageAdmission(tokenId);
      if (config.enabled && !forceSwitch && !healthOnly && !targetGroup && holdState.expired) {
        recordSwitchHoldStart(tokenId, selected);
        return {
          outcome: "holding",
          group: token.group || "未设置",
          tone: "success",
          message: "当前仍是策略推荐，已开始下一保持周期",
        };
      }
      return {
        outcome: "current",
        group: token.group || "未设置",
        tone: "success",
        message: targetGroup ? "已是手动目标分组" : "已是策略推荐分组",
      };
    }
    if (forceSwitch) {
      // An explicit manual destination bypasses image admission, including list buttons.
      if (!targetGroup) selected = await admittedSwitchCandidate(token, candidates, selected, admission);
      if (!selected || selected.group === token.group) return imageAdmissionHoldResult(token);
      await switchTokenGroup(token, selected, { beforeSwitch: () => assertImageAdmissionCurrent(admission) });
      return {
        outcome: "switched",
        group: selected.group,
        tone: "success",
        message: targetGroup ? "已手动切换" : "已立即切换",
      };
    }
    if (healthOnly) {
      const binding = automaticImageAdmission.bindings.get(tokenId);
      if (!binding || binding.job.candidate.group !== selected.group || binding.job.source !== imageQualityIdentity(selected)) {
        detachAutomaticImageAdmission(tokenId);
        pendingCandidates.delete(tokenId);
        return { outcome: "healthy", group: token.group || "未设置", tone: "success", message: "候选已变化，等待下次择优" };
      }
    }
    if (!config.enabled) {
      pendingCandidates.delete(tokenId);
      detachAutomaticImageAdmission(tokenId);
      return {
        outcome: "suggested",
        group: token.group || "未设置",
        tone: "warning",
        message: `建议切换到 ${selected.group}`,
      };
    }
    const oldBinding = automaticImageAdmission.bindings.get(tokenId);
    if (oldBinding && (oldBinding.job.candidate.group !== selected.group
      || oldBinding.job.source !== imageQualityIdentity(selected))) detachAutomaticImageAdmission(tokenId);
    const pending = pendingCandidates.get(tokenId);
    const nextPending = healthOnly ? pending : pending && pending.group === selected.group
      ? { group: selected.group, hits: pending.hits + 1 }
      : { group: selected.group, hits: 1 };
    pendingCandidates.set(tokenId, nextPending);
    // Start near the decision, never throughout a long hold or for a transient first hit.
    const nearHoldEnd = !shouldKeepCurrentDuringHold(current, holdState)
      || holdState.remainingMs <= config.strategySeconds * 1000;
    const nearConfirmation = nextPending.hits >= Math.max(1, config.confirmPolls - 1);
    const job = healthOnly ? automaticImageAdmission.bindings.get(tokenId)?.job
      : IS_AIHUB && nearHoldEnd && nearConfirmation ? prepareAutomaticImageAdmission(token, selected) : null;
    if (!nearHoldEnd) detachAutomaticImageAdmission(tokenId);
    if (nextPending.hits < config.confirmPolls) {
      return { outcome: "pending", group: token.group || "未设置", tone: "warning",
        message: `${selected.group} · 确认 ${nextPending.hits}/${config.confirmPolls}${job ? " · " + (job.verdict?.pass ? "图片已通过" : "后台评价中") : ""}` };
    }
    if (shouldKeepCurrentDuringHold(current, holdState)) {
      return { outcome: "holding", group: token.group || "未设置", tone: "success",
        message: `保持中，${Math.ceil(holdState.remainingMs / 60000)} 分钟后择优${job ? " · 图片预评价中" : ""}` };
    }
    if (IS_AIHUB) {
      if (job?.error) return { outcome: "image-error", group: token.group || "未设置", tone: "warning", message: job.error };
      if (!job?.verdict?.pass) return { outcome: "image-pending", group: token.group || "未设置", tone: "warning",
        message: `${selected.group} · ${job?.verdict ? "图片未通过，已故障隔离" : "等待后台图片评价，继续监控"}` };
      assertImageAdmissionCurrent(job.context);
      if (Number(imageQuality.scoringToken?.id) === tokenId) return { outcome: "image-pending", group: token.group || "未设置", tone: "warning",
        message: `${selected.group} · 图片通过，等待评分密钥恢复` };
      if (!(state.candidateRevision > job.completedRevision)) return { outcome: "image-pending", group: token.group || "未设置", tone: "warning",
        message: `${selected.group} · 图片通过，等待最新健康检查` };
    }
    await switchTokenGroup(token, selected, { beforeSwitch: () => {
      if (IS_AIHUB) {
        assertImageAdmissionCurrent(job.context);
        if (job.invalid || job.source !== imageQualityIdentity(selected)) throw new Error("待切换评价已失效，本轮取消切换");
      }
    } });
    detachAutomaticImageAdmission(tokenId);
    return { outcome: "switched", group: selected.group, tone: "success", message: "已自动切换" };
  }

  async function loadCheckCandidates(models, healthOnly = false) {
    let monitorFallback = false;
    let candidates;
    if (IS_AIHUB) {
      const range = aihubMonitorRange(config.metricHours);
      const { summary, series, seriesError, groups, rates } = healthOnly && aihubGroupsCache.length
        ? { ...await loadAihubProviderData(fetchJson, range), groups: aihubGroupsCache, rates: aihubRatesCache }
        : await loadAihubMonitorData(fetchJson, range);
      monitorFallback = Boolean(seriesError);
      if (seriesError && !state.aihubSeriesDegraded) {
        const message = seriesError instanceof Error ? seriesError.message : String(seriesError);
        addLog(`AIHub 近期柱状图暂不可用，已使用最新汇总状态：${message}`, "warning");
      } else if (!seriesError && state.aihubSeriesDegraded) {
        addLog("AIHub 近期柱状图接口已恢复", "success");
      }
      state.aihubSeriesDegraded = monitorFallback;
      aihubGroupsCache = normalizeAihubGroups(groups);
      aihubRatesCache = normalizeAihubRates(rates);
      pricingCache = buildAihubModelCatalog(summary);
      updateImageQualityCatalog(summary);
      candidates = mergeTargetModelCandidates(models.map((model) => ({
        model,
        candidates: evaluateAihubCandidates(
          summary,
          series,
          aihubGroupsCache,
          aihubRatesCache,
          { ...config, models: [model], model },
          Date.now(),
        ),
      })));
    } else if (IS_FLUXION) {
      const [monitors, groups, rates] = await Promise.all([
        fetchJson("/api/v1/channel-monitors"),
        healthOnly && fluxionGroupsCache.length ? fluxionGroupsCache : fetchJson("/api/v1/groups/available"),
        healthOnly && fluxionGroupsCache.length ? fluxionRatesCache : fetchJson("/api/v1/groups/rates"),
      ]);
      fluxionMonitorsCache = normalizeFluxionMonitors(monitors);
      fluxionGroupsCache = normalizeFluxionGroups(groups);
      fluxionRatesCache = normalizeAihubRates(rates);
      pricingCache = buildFluxionModelCatalog(monitors, groups);
      candidates = mergeTargetModelCandidates(models.map((model) => ({
        model,
        candidates: evaluateFluxionCandidates(
          monitors,
          groups,
          rates,
          { ...config, models: [model], model },
          Date.now(),
        ),
      })));
    } else {
      const [pricing, userGroups, metricsByModel] = await Promise.all([
        fetchJson("/api/pricing"),
        fetchJson("/api/user/self/groups"),
        Promise.all(models.map((model) => fetchJson(
          `/api/perf-metrics?model=${encodeURIComponent(model)}&hours=${config.metricHours}`,
        ))),
      ]);
      pricingCache = pricing;
      userGroupsCache = unwrapUserGroups(userGroups);
      candidates = mergeTargetModelCandidates(models.map((model, index) => ({
        model,
        candidates: evaluateCandidates(
          pricing,
          metricsByModel[index],
          userGroups,
          { ...config, models: [model], model },
          Date.now() / 1000,
        ),
      })));
    }
    return { candidates, monitorFallback };
  }

  async function runCheck(options) {
    const manual = Boolean(options && options.manual);
    const healthOnly = options?.mode === "health" && !manual;
    let updateRecommendation = !healthOnly;
    const forceSwitch = Boolean(options && options.forceSwitch);
    const targetGroup = String((options && options.targetGroup) || "").trim();
    // A manual check must refresh account-level usage even when group checks cannot start yet.
    const manualUsageRefresh = manual ? refreshTodayUsage() : null;
    const models = targetModels(config);
    if (running) {
      if (manual) setStatus("已有检查正在进行", "warning");
      return;
    }
    if (!models.length) {
      setStatus("请先选择至少一个目标模型", "warning");
      return;
    }
    if (!config.tokenIds.length && requiresTokenSelection(SITE_ID, options)) {
      setStatus(`请先选择至少一个 API 密钥${IS_AIHUB || IS_FLUXION ? "" : "和目标模型"}`, "warning");
      return;
    }
    const selectedTokenIds = config.tokenIds.slice();
    const checkConfigKey = JSON.stringify(config);
    const checkCancelRevision = imageQuality.cancelRevision || 0;

    running = true;
    const usageRefresh = manualUsageRefresh || (healthOnly ? Promise.resolve() : refreshTodayUsage());
    const tokenCatalogRefresh = manual
      ? refreshTokenCatalog()
        .then(() => true)
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          addLog(`API 密钥列表刷新失败：${message}`, "error");
          return false;
        })
      : Promise.resolve(true);
    setStatus(
      targetGroup
        ? `正在检查目标分组 ${targetGroup}...`
        : forceSwitch
          ? "正在检查并准备立即切换..."
          : healthOnly ? "正在检查当前分组故障..." : "正在检查分组状态...",
      "running",
    );
    let monitorFallback = false;
    try {
      if (forceSwitch) await stopAutomaticImageAdmission();
      let candidateRequestRevision = ++state.candidateRequestRevision;
      let { candidates, monitorFallback: degraded } = await loadCheckCandidates(models, healthOnly);
      monitorFallback = degraded;
      const candidateTimestamp = Date.now();
      candidates = applyTemporaryBlacklist(
        candidates,
        getSwitchGuardState(candidateTimestamp),
        targetModelIdentity(config),
        candidateTimestamp,
      );
      if (manual) renderOptions(true);
      const recommendedCandidate = selectBestCandidate(candidates, "", config.selectionMode);
      const checkedAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      state.lastCheck = checkedAt;
      state.lastHealthCheck = checkedAt;
      state.candidateRevision = candidateRequestRevision;
      if (!healthOnly || !state.candidates.length) {
        state.candidates = candidates;
        state.bestGroup = candidateRecommendationLabel(recommendedCandidate);
        state.lastStrategyCheck = checkedAt;
      }
      if (targetGroup) {
        selectSwitchCandidate(candidates, "", targetGroup, { allowUnavailable: true });
      }
      if (!targetGroup && !recommendedCandidate && !selectedTokenIds.length) {
        const reasonSummary = summarizeFailures(candidates);
        throw new Error(`没有满足条件的分组${reasonSummary ? `：${reasonSummary}` : ""}`);
      }

      if (!selectedTokenIds.length) {
        const availableCount = candidates.filter((candidate) => candidate.available).length;
        state.tokenResults = [];
        state.currentGroup = "-";
        addLog(`分组状态已更新：${candidates.length} 个分组，${availableCount} 个可用`, "success");
        const fallbackSuffix = monitorFallback ? "，近期图表已降级" : "";
        setStatus(
          `已检查 ${candidates.length} 个分组，${availableCount} 个可用${fallbackSuffix}`,
          monitorFallback ? "warning" : "success",
        );
        return;
      }

      if (IS_AIHUB) await tokenCatalogRefresh;
      if (checkConfigKey !== JSON.stringify(config)) throw new Error("检查期间设置已变更，本轮取消切换");
      const details = await Promise.allSettled(selectedTokenIds.map((tokenId) => {
        // Do not mistake the scorer's temporary route for a business-key change.
        const scoringToken = imageQuality.scoringToken;
        return scoringToken && Number(scoringToken.id) === Number(tokenId)
          ? Promise.resolve({ ...scoringToken }) : getTokenDetail(tokenId);
      }));
      if (healthOnly) {
        const healthCandidates = applyTemporaryBlacklist(candidates, getSwitchGuardState(), targetModelIdentity(config), Date.now(), { ignoreImage: true });
        const needsRecovery = details.some((detail) => detail.status === "fulfilled"
          && !healthCandidates.some((row) => row.group === detail.value.group && row.available));
        const readyForAdmission = details.some((detail) => {
          if (detail.status !== "fulfilled") return false;
          const token = detail.value;
          const job = automaticImageAdmission.bindings.get(Number(token.id))?.job;
          const pending = pendingCandidates.get(Number(token.id));
          const current = healthCandidates.find((row) => row.group === token.group);
          const hold = switchHoldState(getSwitchHistory(), token.id, targetModelIdentity(config), token.group, config.switchHoldMinutes, Date.now());
          return job?.verdict?.pass && !job.invalid && pending?.hits >= config.confirmPolls
            && state.candidateRevision > job.completedRevision && !shouldKeepCurrentDuringHold(current, hold);
        });
        if (needsRecovery || readyForAdmission) {
          updateRecommendation = true;
          // Recovery never waits for the next strategy tick and never writes using an old account catalog.
          candidateRequestRevision = ++state.candidateRequestRevision;
          const refreshed = await loadCheckCandidates(models);
          candidates = applyTemporaryBlacklist(refreshed.candidates, getSwitchGuardState(), targetModelIdentity(config), Date.now());
          monitorFallback = refreshed.monitorFallback;
          state.candidates = candidates;
          state.candidateRevision = candidateRequestRevision;
          state.bestGroup = candidateRecommendationLabel(selectBestCandidate(candidates, "", config.selectionMode));
        } else {
          const currentGroups = new Set(details.filter((detail) => detail.status === "fulfilled").map((detail) => detail.value.group));
          state.candidates = state.candidates.map((row) => currentGroups.has(row.group)
            ? candidates.find((fresh) => fresh.group === row.group) || row : row);
        }
      }
      if (checkConfigKey !== JSON.stringify(config)) throw new Error("检查期间设置已变更，本轮取消切换");
      const admission = { ...createImageAdmissionContext(), cancelRevision: checkCancelRevision };
      state.tokenResults = [];
      for (let index = 0; index < details.length; index += 1) {
        const tokenId = selectedTokenIds[index];
        const detail = details[index];
        const cached = tokensCache.find((token) => Number(token.id) === tokenId);
        const fallbackName = cached ? tokenLabel(cached) : `#${tokenId}`;
        setStatus(`正在处理 API 密钥 ${index + 1}/${details.length}...`, "running");
        if (detail.status === "rejected") {
          const message = detail.reason instanceof Error ? detail.reason.message : String(detail.reason);
          state.tokenResults.push({ id: tokenId, name: fallbackName, group: "未知", tone: "error", outcome: "error", message });
          addLog(`${fallbackName}：${message}`, "error");
          detachAutomaticImageAdmission(tokenId);
          continue;
        }

        const token = detail.value;
        try {
          const result = await processToken(token, candidates, { forceSwitch, targetGroup, admission, mode: healthOnly ? "health" : "strategy", observeHealth: options?.observeHealth });
          state.tokenResults.push({ id: tokenId, name: tokenLabel(token), ...result });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pendingCandidates.delete(tokenId);
          detachAutomaticImageAdmission(tokenId);
          state.tokenResults.push({
            id: tokenId,
            name: tokenLabel(token),
            group: token.group || "未设置",
            tone: "error",
            outcome: "error",
            message,
          });
          addLog(`${tokenLabel(token)}：${message}`, "error");
        }
        state.currentGroup = summarizeTokenGroups(state.tokenResults);
        render();
      }

      if (!automaticImageAdmission.bindings.size && !automaticImageAdmission.active) automaticImageAdmission.context = null;
      refreshCandidateIsolationState(updateRecommendation);
      state.currentGroup = summarizeTokenGroups(state.tokenResults);
      const failedCount = state.tokenResults.filter((result) => result.outcome === "error").length;
      const switchedCount = state.tokenResults.filter((result) => result.outcome === "switched").length;
      const rolledBackCount = state.tokenResults.filter((result) => result.outcome === "rolled-back").length;
      const warningCount = state.tokenResults.filter((result) => result.tone === "warning").length;
      if (switchedCount > 0) {
        GM_notification({
          title: `${SITE_LABEL} 分组已切换`,
          text: `${targetModelLabel(config)}: 已切换 ${switchedCount} 个 API 密钥`,
          timeout: 8000,
        });
      }
      if (rolledBackCount > 0) {
        GM_notification({
          title: `${SITE_LABEL} 分组已自动回滚`,
          text: `${targetModelLabel(config)}: 已回滚 ${rolledBackCount} 个 API 密钥`,
          timeout: 10000,
        });
      }
      const actionSummary = `切换 ${switchedCount} 个${rolledBackCount ? `，回滚 ${rolledBackCount} 个` : ""}`;
      if (failedCount === state.tokenResults.length) {
        setStatus(`${failedCount} 个 API 密钥处理失败`, "error");
      } else if (failedCount > 0) {
        setStatus(`处理完成：${actionSummary}，失败 ${failedCount} 个`, "warning");
      } else if (warningCount > 0 || monitorFallback) {
        const fallbackSuffix = monitorFallback ? "，近期图表已降级" : "";
        setStatus(`已检查 ${state.tokenResults.length} 个 API 密钥，${actionSummary}${fallbackSuffix}`, "warning");
      } else {
        setStatus(`已检查 ${state.tokenResults.length} 个 API 密钥，${actionSummary}`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(message, "error");
      setStatus(message, "error");
    } finally {
      await Promise.all([usageRefresh, tokenCatalogRefresh]);
      running = false;
      render();
    }
  }

  function summarizeFailures(candidates) {
    const counts = new Map();
    candidates.forEach((candidate) => {
      candidate.reasons.forEach((reason) => counts.set(reason, (counts.get(reason) || 0) + 1));
    });
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([reason, count]) => `${reasonLabel(reason)} ${count}`)
      .join("，");
  }

  function armNextCheck() {
    if (scheduler !== null) window.clearTimeout(scheduler);
    scheduler = null;
    if (!config.enabled) return;
    const revision = checkSchedule.revision;
    const dueAt = Math.min(checkSchedule.healthAt, checkSchedule.strategyAt);
    scheduler = window.setTimeout(async () => {
      scheduler = null;
      if (!config.enabled || revision !== checkSchedule.revision) return;
      if (running) { armNextCheck(); return; }
      const now = Date.now();
      const healthDue = checkSchedule.healthAt <= now;
      const strategyDue = checkSchedule.strategyAt <= now;
      if (!healthDue && !strategyDue) { armNextCheck(); return; }
      const healthDeadline = healthDue ? now + config.pollSeconds * 1000 : checkSchedule.healthAt;
      const strategyDeadline = strategyDue ? now + config.strategySeconds * 1000 : checkSchedule.strategyAt;
      checkSchedule.healthAt = healthDeadline;
      checkSchedule.strategyAt = strategyDeadline;
      try {
        await runCheck({ manual: false, mode: strategyDue ? "strategy" : "health", observeHealth: healthDue });
      } finally {
        if (revision === checkSchedule.revision) {
          if (healthDue && checkSchedule.healthAt === healthDeadline) checkSchedule.healthAt = Date.now() + config.pollSeconds * 1000;
          if (strategyDue && checkSchedule.strategyAt === strategyDeadline) checkSchedule.strategyAt = Date.now() + config.strategySeconds * 1000;
          armNextCheck();
        }
      }
    }, Math.max(running ? 250 : 0, dueAt - Date.now()));
  }

  function scheduleNext(delayMs, { immediateStrategy = true } = {}) {
    checkSchedule.revision += 1;
    const at = Date.now() + (delayMs == null ? config.pollSeconds * 1000 : delayMs);
    checkSchedule.healthAt = at;
    checkSchedule.strategyAt = immediateStrategy ? at : Date.now() + config.strategySeconds * 1000;
    armNextCheck();
  }

  function requestHealthCheck(delayMs = 250) {
    if (!config.enabled) return;
    const at = Date.now() + delayMs;
    checkSchedule.healthAt = Math.min(checkSchedule.healthAt || at, at);
    armNextCheck();
  }

  function scheduleUpdateCheck(delayMs) {
    if (updateScheduler) window.clearTimeout(updateScheduler);
    updateScheduler = window.setTimeout(async () => {
      try {
        await checkForUpdate({ silent: true });
      } finally {
        scheduleUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS);
      }
    }, delayMs == null ? AUTO_UPDATE_CHECK_INTERVAL_MS : delayMs);
  }

  function scheduleStatisticsRefresh(delayMs) {
    if (statisticsScheduler) window.clearTimeout(statisticsScheduler);
    statisticsScheduler = null;
    if (!IS_AIHUB
      || state.activeView !== "statistics"
      || state.statistics.range !== "today"
      || document.visibilityState !== "visible") return;
    statisticsScheduler = window.setTimeout(async () => {
      statisticsScheduler = null;
      if (state.activeView !== "statistics" || state.statistics.range !== "today" || document.visibilityState !== "visible") return;
      await refreshStatistics({ silent: true });
      scheduleStatisticsRefresh(STATISTICS_REFRESH_INTERVAL_MS);
    }, delayMs == null ? STATISTICS_REFRESH_INTERVAL_MS : delayMs);
  }

  function formatRatio(value) {
    return Number.isFinite(value) ? `${Number(value.toFixed(4))}x` : "-";
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : "-";
  }

  function formatLatency(value) {
    if (!Number.isFinite(value) || value <= 0) return "-";
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
  }

  function formatAihubLatency(value) {
    if (!Number.isFinite(value) || value <= 0) return "-";
    return `${Math.round(value).toLocaleString("en-US")}ms`;
  }

  function formatSpend(usage) {
    if (!usage || !usage.available) return "-";
    return formatSpendValue(usage.spend, usage.symbol);
  }

  function formatSpendValue(value, symbol) {
    const amount = Math.max(0, Number(value) || 0);
    const digits = amount > 0 && amount < 0.0001 ? 6 : 4;
    return `${symbol || ""}${amount.toFixed(digits)}`;
  }

  function formatBalance(usage) {
    if (!usage || !usage.available) return "-";
    const value = Math.max(0, Number(usage.balance) || 0);
    if (!usage.symbol) return formatUsageCount(value, true);
    return `${usage.symbol}${value.toFixed(2)}`;
  }

  function formatUsageCount(value, available) {
    return available ? Math.max(0, Number(value) || 0).toLocaleString() : "-";
  }

  function renderOptions(preserveFormState) {
    if (!refs.tokenList || !refs.modelList) return;

    const selectedTokens = new Set(
      preserveFormState
        ? [...refs.tokenList.querySelectorAll('input[data-token-id]:checked')]
          .map((checkbox) => Number(checkbox.value))
        : config.tokenIds.map(Number),
    );
    const selectedModels = new Set(
      preserveFormState
        ? [...refs.modelList.querySelectorAll('input[data-model-name]:checked')]
          .map((checkbox) => checkbox.dataset.modelName)
        : targetModels(config),
    );
    refs.tokenList.replaceChildren();
    if (!tokensCache.length) {
      const empty = document.createElement("div");
      empty.className = "empty token-empty";
      empty.textContent = "暂无 API 密钥";
      refs.tokenList.appendChild(empty);
    }
    tokensCache.forEach((token) => {
      const option = document.createElement("label");
      option.className = "token-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(token.id);
      checkbox.checked = selectedTokens.has(Number(token.id));
      checkbox.dataset.tokenId = String(token.id);
      const name = document.createElement("span");
      name.textContent = `${token.name || `#${token.id}`} · ${token.group || "未分组"}`;
      option.append(checkbox, name);
      refs.tokenList.appendChild(option);
    });
    renderTokenSelectionCount();
    renderImageQualityKeyOptions();
    renderImageQualityGroupOptions();

    refs.modelList.replaceChildren();
    const models = [...new Set([
      ...(pricingCache && Array.isArray(pricingCache.data)
        ? pricingCache.data.map((item) => item.model_name).filter(Boolean)
        : []),
      ...selectedModels,
    ])].sort();
    if (!models.length) {
      const empty = document.createElement("div");
      empty.className = "empty token-empty";
      empty.textContent = "暂无可选模型";
      refs.modelList.appendChild(empty);
    }
    models.forEach((model) => {
      const option = document.createElement("label");
      option.className = "token-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.modelName = model;
      checkbox.checked = selectedModels.has(model);
      const name = document.createElement("span");
      name.textContent = model;
      option.append(checkbox, name);
      refs.modelList.appendChild(option);
    });
    renderModelSelectionCount();
    renderGroupFilterOptions();
  }

  function renderModelSelectionCount() {
    if (!refs.modelList || !refs.modelCount || !refs.modelSelectLabel) return;
    const selected = [...refs.modelList.querySelectorAll('input[data-model-name]:checked')]
      .map((checkbox) => checkbox.dataset.modelName);
    refs.modelCount.textContent = `已选 ${selected.length}`;
    refs.modelSelectLabel.textContent = selected.length === 0
      ? "请选择目标模型"
      : selected.length === 1
        ? selected[0]
        : `已选择 ${selected.length} 个模型`;
    refs.modelSelectLabel.title = selected.join("、");
  }

  function renderTokenSelectionCount() {
    if (!refs.tokenList || !refs.tokenCount) return;
    const selectedBoxes = [...refs.tokenList.querySelectorAll('input[data-token-id]:checked')];
    const selected = selectedBoxes.length;
    refs.tokenCount.textContent = `已选 ${selected}/${tokensCache.length}`;
    if (refs.tokenSelectLabel) {
      if (!selected) {
        refs.tokenSelectLabel.textContent = "请选择 API 密钥";
      } else if (selected === tokensCache.length) {
        refs.tokenSelectLabel.textContent = "全部 API 密钥";
      } else if (selected === 1) {
        const token = tokensCache.find((item) => Number(item.id) === Number(selectedBoxes[0].value));
        refs.tokenSelectLabel.textContent = token ? String(token.name || `#${token.id}`) : "已选择 1 个密钥";
      } else {
        refs.tokenSelectLabel.textContent = `已选择 ${selected} 个密钥`;
      }
    }
  }

  function groupFilterConfigKey(mode) {
    return mode === "blacklist" ? "groupBlacklist" : "groupWhitelist";
  }

  function availableGroupNames() {
    const names = new Set([
      ...config.groupWhitelist,
      ...config.groupBlacklist,
      ...state.candidates.map((candidate) => candidate.group),
    ]);
    if (IS_AIHUB) {
      aihubGroupsCache.forEach((group) => {
        if (group && group.name) names.add(String(group.name));
      });
    } else if (IS_FLUXION) {
      fluxionGroupsCache.forEach((group) => {
        if (group && group.name) names.add(String(group.name));
      });
    } else {
      Object.keys(userGroupsCache).forEach((group) => names.add(group));
      const selectedModels = new Set(targetModels(config));
      (pricingCache && Array.isArray(pricingCache.data) ? pricingCache.data : [])
        .filter((item) => item && selectedModels.has(item.model_name))
        .flatMap((item) => Array.isArray(item.enable_groups) ? item.enable_groups : [])
        .forEach((group) => names.add(String(group)));
    }
    return [...names].filter(Boolean).sort((left, right) => left.localeCompare(right, "zh-CN"));
  }

  function updateGroupFilterSummary() {
    if (!refs.groupFilterSelectLabel || !refs.groupFilterCount || !refs.groupFilterMode) return;
    const mode = refs.groupFilterMode.value === "blacklist" ? "blacklist" : "whitelist";
    const selected = refs.groupFilterList
      ? refs.groupFilterList.querySelectorAll('input[data-group-name]:checked').length
      : 0;
    refs.groupFilterSelectLabel.textContent = selected
      ? `${mode === "blacklist" ? "已排除" : "仅允许"} ${selected} 个分组`
      : "不限分组";
    refs.groupFilterCount.textContent = `${selected}/${availableGroupNames().length}`;
    if (refs.groupFilterLabel) refs.groupFilterLabel.textContent = mode === "blacklist" ? "黑名单分组" : "白名单分组";
  }

  function renderGroupFilterOptions() {
    if (!refs.groupFilterList || !refs.groupFilterMode) return;
    const mode = config.groupFilterMode === "blacklist" ? "blacklist" : "whitelist";
    const selected = new Set(config[groupFilterConfigKey(mode)]);
    refs.groupFilterMode.value = mode;
    refs.groupFilterList.replaceChildren();
    const groups = availableGroupNames();
    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "empty token-empty";
      empty.textContent = "检查后显示可选分组";
      refs.groupFilterList.appendChild(empty);
    }
    groups.forEach((group) => {
      const option = document.createElement("label");
      option.className = "token-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.groupName = group;
      checkbox.checked = selected.has(group);
      const name = document.createElement("span");
      name.textContent = group;
      option.append(checkbox, name);
      refs.groupFilterList.appendChild(option);
    });
    updateGroupFilterSummary();
  }

  function createDetectionImageThumbnail(candidate) {
    const media = candidate.detectionMedia;
    const hasImage = media?.status === "successful" && Boolean(media.url);
    const thumbnail = document.createElement(hasImage ? "button" : "span");
    thumbnail.className = "candidate-pelican";
    if (!hasImage) {
      thumbnail.textContent = media?.status === "failed" ? "失败" : "暂无";
      thumbnail.title = media?.status === "failed" ? `鹈鹕图片生成失败${media.reason ? `：${media.reason}` : ""}` : "该分组暂无鹈鹕图片";
      thumbnail.setAttribute("aria-label", thumbnail.title);
      return thumbnail;
    }
    thumbnail.type = "button";
    thumbnail.title = `${candidate.group} · 点击放大查看${media.title}`;
    thumbnail.setAttribute("aria-label", thumbnail.title);
    thumbnail.dataset.detectionImage = media.url;
    thumbnail.dataset.groupId = String(candidate.groupId);
    const image = document.createElement("img");
    image.alt = media.title;
    image.width = 28;
    image.height = 28;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      thumbnail.textContent = "查看";
      thumbnail.title = `${candidate.group} · 预览加载失败，点击查看原图`;
      thumbnail.setAttribute("aria-label", thumbnail.title);
    }, { once: true });
    image.src = media.previewUrl || media.url;
    thumbnail.appendChild(image);
    thumbnail.addEventListener("click", () => openDetectionImage(candidate, thumbnail));
    return thumbnail;
  }

  function renderCandidates() {
    if (!refs.candidateRows) return;
    const qualityEnabled = imageQualityEnabled(config);
    const scoringToken = imageQuality.scoringToken;
    const displayedTokens = tokensCache.map((token) => scoringToken && Number(scoringToken.id) === Number(token.id)
      ? { ...token, ...scoringToken } : token);
    if (!sectionNeedsRender(refs.candidateRows, [state.candidates, config.selectionMode,
      tokensCache, ...displayedTokens.map((token) => JSON.stringify([token.id, token.groupId, token.group, token.name])),
      config.tokenIds.join(","), running, qualityEnabled, config.imageQualityModel, config.imageQualityTask,
      ...(qualityEnabled ? state.candidates.flatMap((candidate) => [candidateImageQuality(candidate), automaticImageAdmissionStatus(candidate)]) : [])])) return;
    refs.candidateRows.replaceChildren();
    const rows = IS_AIHUB ? sortCandidateRowsForMode(state.candidates, config.selectionMode) : state.candidates
      .slice()
      .sort((left, right) => {
        if (left.available !== right.available) return left.available ? -1 : 1;
        return (left.ratio || Infinity) - (right.ratio || Infinity);
      });

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无检查结果";
      refs.candidateRows.appendChild(empty);
      return;
    }

    rows.forEach((candidate) => {
      const row = document.createElement("div");
      const warnings = Array.isArray(candidate.warnings) ? candidate.warnings : [];
      const warningText = warnings.map(reasonLabel).join("、");
      row.className = `candidate ${candidate.available ? "candidate-ok" : "candidate-off"}${candidate.available && warningText ? " candidate-warning" : ""}`;
      row.dataset.group = candidate.group;
      const name = document.createElement("span");
      name.className = "candidate-name";
      const signal = document.createElement("span");
      signal.className = "candidate-signal";
      signal.setAttribute("aria-hidden", "true");
      const nameLabel = document.createElement(IS_AIHUB ? "button" : "span");
      nameLabel.className = "candidate-name-label";
      nameLabel.textContent = candidate.group;
      nameLabel.title = candidate.group;
      if (IS_AIHUB) {
        nameLabel.type = "button";
        nameLabel.title = `${candidate.group} · 点击复制完整名称`;
        nameLabel.setAttribute("aria-label", `复制完整分组名称：${candidate.group}`);
        nameLabel.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(candidate.group);
            setStatus(`已复制完整分组名称：${candidate.group}`, "success");
          } catch { setStatus("复制失败，可在图片弹窗标题查看完整名称", "warning"); }
        });
        name.classList.add("candidate-name-with-media");
        name.append(createDetectionImageThumbnail(candidate), nameLabel);
      } else {
        name.append(signal, nameLabel);
      }
      const ratio = document.createElement("span");
      ratio.className = "candidate-ratio mono";
      const nominalRatio = document.createElement("span");
      nominalRatio.textContent = formatRatio(candidate.ratio);
      const effectiveInputPrice = document.createElement("small");
      const hasEffectiveInputPrice = Number.isFinite(candidate.effectiveInputPricePerMillion)
        && candidate.effectiveInputPricePerMillion >= 0;
      effectiveInputPrice.textContent = IS_AIHUB && hasEffectiveInputPrice
        ? `￥${candidate.effectiveInputPricePerMillion.toFixed(2)}/M`
        : "";
      effectiveInputPrice.className = "candidate-price";
      const effectiveRatio = document.createElement("small");
      const hasEffectiveEstimate = hasEffectiveRatioEstimate(candidate);
      const hasPublicRatio = Number.isFinite(candidate.publicRatio) && candidate.publicRatio > 0;
      const routeRatioLabel = candidate.ratioSource === "account" ? "账号倍率" : "页面倍率";
      const multiModelPrefix = Array.isArray(candidate.targetModels) && candidate.targetModels.length > 1
        ? "全部目标模型最不利值；"
        : "";
      effectiveRatio.textContent = hasEffectiveEstimate
        ? `≈${formatRatio(candidateEffectiveRatio(candidate))}`
        : "≈-";
      ratio.append(nominalRatio);
      if (IS_AIHUB) ratio.append(effectiveInputPrice);
      ratio.append(effectiveRatio);
      ratio.title = hasEffectiveEstimate
        ? `${multiModelPrefix}${routeRatioLabel} ${formatRatio(candidate.ratio)}${hasPublicRatio && candidate.ratio !== candidate.publicRatio ? `；页面倍率 ${formatRatio(candidate.publicRatio)}` : ""}；真实输入价格 ${hasEffectiveInputPrice ? `${candidate.effectiveInputPricePerMillion.toFixed(4)}/M` : "暂无"}；平台预测倍率 ${formatRatio(candidateEffectiveRatio(candidate))}`
        : `${multiModelPrefix}${routeRatioLabel} ${formatRatio(candidate.ratio)}${hasPublicRatio && candidate.ratio !== candidate.publicRatio ? `；页面倍率 ${formatRatio(candidate.publicRatio)}` : ""}；平台预测倍率暂不可用（${effectiveRatioReasonLabel(candidate.effectiveRatioReason)}）`;
      ratio.setAttribute(
        "aria-label",
        hasEffectiveEstimate
          ? `${routeRatioLabel} ${formatRatio(candidate.ratio)}${hasPublicRatio && candidate.ratio !== candidate.publicRatio ? `，页面倍率 ${formatRatio(candidate.publicRatio)}` : ""}，真实输入价格 ${hasEffectiveInputPrice ? `${candidate.effectiveInputPricePerMillion.toFixed(2)}/M` : "暂无"}，平台预测倍率 ${formatRatio(candidateEffectiveRatio(candidate))}`
          : `${routeRatioLabel} ${formatRatio(candidate.ratio)}${hasPublicRatio && candidate.ratio !== candidate.publicRatio ? `，页面倍率 ${formatRatio(candidate.publicRatio)}` : ""}，平台预测倍率待统计`,
      );
      const success = document.createElement("span");
      success.className = "mono";
      success.textContent = formatPercent(candidate.aggregateSuccess);
      success.title = candidateAggregateSuccessTitle(candidate);
      const recentSuccess = document.createElement("span");
      recentSuccess.className = "mono health-value";
      recentSuccess.textContent = formatPercent(candidate.recentMinSuccess);
      recentSuccess.title = "最近一次成功率";
      recentSuccess.style.setProperty(
        "--health",
        `${Math.max(0, Math.min(100, Number(candidate.recentMinSuccess) || 0))}%`,
      );
      const firstTokenLatency = document.createElement("span");
      firstTokenLatency.className = "mono";
      firstTokenLatency.textContent = candidate.providerId === "aihub"
        ? formatAihubLatency(candidate.firstTokenLatencyMs)
        : formatLatency(candidate.firstTokenLatencyMs);
      firstTokenLatency.title = candidateFirstTokenLatencyTitle(candidate);
      const outputLatency = document.createElement("span");
      outputLatency.className = "mono";
      outputLatency.textContent = formatLatency(candidate.outputLatencyMs);
      const outputDetails = [];
      if (Number.isFinite(candidate.outputTokens)) {
        outputDetails.push(`${candidate.outputTokens.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 输出 Token`);
      }
      if (Number.isFinite(candidate.outputTokensPerSecond)) {
        outputDetails.push(`${candidate.outputTokensPerSecond.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} Token/s`);
      }
      outputLatency.title = outputDetails.length
        ? `完整输出耗时 · ${outputDetails.join(" / ")}`
        : "完整输出耗时";
      const cacheHitRate = document.createElement("span");
      cacheHitRate.className = "mono";
      cacheHitRate.textContent = formatPercent(candidate.cacheHitRate);
      cacheHitRate.title = Number.isFinite(candidate.cacheHitRate)
        ? `${Array.isArray(candidate.targetModels) && candidate.targetModels.length > 1 ? "全部目标模型最低 · " : ""}缓存命中率`
        : `${SITE_LABEL} 当前分组指标未提供缓存命中率`;
      const verdict = document.createElement("span");
      verdict.className = "verdict";
      const issueText = candidateIssueText(candidate);
      verdict.textContent = candidate.available
        ? (warningText ? "可用·检测警告" : "可用")
        : reasonLabel(candidate.reasons[0] || "不可用");
      verdict.title = candidate.available
        ? (issueText ? `不阻断切换：${issueText}` : "符合全部目标模型的自动切换条件")
        : issueText || candidate.reasons.map(reasonLabel).join("、") || "不可用";
      if (IS_AIHUB) {
        row.classList.add("candidate-details");
        const heading = document.createElement("div");
        heading.className = "candidate-heading";
        const currentTokens = candidateCurrentTokens(candidate, displayedTokens, config.tokenIds);
        if (currentTokens.length) {
          row.dataset.current = "true";
          const currentTag = document.createElement("span");
          currentTag.className = "candidate-current-tag";
          currentTag.textContent = currentTokens.length > 1 ? `当前×${currentTokens.length}` : "当前";
          currentTag.title = `当前使用：${currentTokens.map(tokenLabel).join("、")}`;
          currentTag.setAttribute("aria-label", currentTag.title);
          heading.append(currentTag);
        }
        heading.prepend(name);
        heading.append(verdict);
        const switchButton = document.createElement("button");
        switchButton.type = "button";
        switchButton.className = "candidate-row-switch";
        const allCurrent = config.tokenIds.length > 0 && currentTokens.length === config.tokenIds.length;
        switchButton.textContent = allCurrent ? "使用中" : "切换";
        switchButton.disabled = running || !config.tokenIds.length || allCurrent || candidate.reasons.includes("not-user-selectable");
        switchButton.title = allCurrent ? "全部已选密钥正在使用此分组" : !config.tokenIds.length ? "请先选择需要切换的 API 密钥"
          : `将已选密钥手动切换到 ${candidate.group}；跳过图片检查`;
        switchButton.setAttribute("aria-label", switchButton.title);
        switchButton.addEventListener("click", () => runCheck({ manual: true, forceSwitch: true, targetGroup: candidate.group }));
        heading.append(switchButton);
        const metrics = document.createElement("dl");
        metrics.className = "candidate-metrics";
        ratio.textContent = `${formatRatio(candidate.ratio).replace(/x$/, "")}/${hasEffectiveEstimate ? formatRatio(candidateEffectiveRatio(candidate)) : "—"}`;
        firstTokenLatency.textContent = formatLatency(candidate.firstTokenLatencyMs);
        firstTokenLatency.title = `${candidateFirstTokenLatencyTitle(candidate)} · ${formatAihubLatency(candidate.firstTokenLatencyMs)}`;
        [
          ["倍率", ratio], ["整体", success], ["近期", recentSuccess],
          ["首字", firstTokenLatency], ["输出", outputLatency], ["缓存", cacheHitRate],
        ].forEach(([label, value]) => {
          const metric = document.createElement("div");
          metric.className = "candidate-metric";
          const term = document.createElement("dt");
          term.textContent = label;
          const definition = document.createElement("dd");
          definition.append(value);
          metric.append(term, definition);
          metrics.appendChild(metric);
        });
        const thumbnail = name.querySelector(".candidate-pelican");
        const media = document.createElement("div");
        media.className = "candidate-media";
        media.append(thumbnail);
        if (imageQualityEnabled(config)) {
          heading.insertBefore(createImageQualityScore(candidate), verdict);
        }
        row.append(media, heading, metrics);
      } else {
        row.append(name, ratio, success, recentSuccess, firstTokenLatency, outputLatency, cacheHitRate, verdict);
      }
      refs.candidateRows.appendChild(row);
    });
  }

  function renderManualGroups() {
    if (!refs.manualGroup) return;
    if (!sectionNeedsRender(refs.manualGroup, [state.candidates, state.tokenResults,
      state.tokenResults.length, running])) return;
    const selectedGroup = refs.manualGroup.querySelector('input[data-manual-group]:checked')?.value || "";
    refs.manualGroup.replaceChildren();

    if (!state.candidates.length) {
      const empty = document.createElement("div");
      empty.className = "empty manual-group-empty";
      empty.textContent = "暂无检查结果";
      refs.manualGroup.appendChild(empty);
    }

    state.candidates
      .slice()
      .sort((left, right) => {
        if (left.available !== right.available) return left.available ? -1 : 1;
        return (left.ratio || Infinity) - (right.ratio || Infinity);
      })
      .forEach((candidate) => {
        const warningText = (Array.isArray(candidate.warnings) ? candidate.warnings : [])
          .map(reasonLabel)
          .join("、");
        const status = candidate.available
          ? (warningText ? `可用（警告：${warningText}）` : "可用")
          : candidate.reasons.map(reasonLabel).join("、") || "不可用";
        const currentCount = state.tokenResults.filter((result) => result.group === candidate.group).length;
        const current = currentCount ? ` · 当前 ${currentCount}` : "";
        const option = document.createElement("label");
        option.className = `manual-group-option${candidate.available ? "" : " manual-group-option-warning"}`;
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "kf-manual-group";
        radio.value = candidate.group;
        radio.dataset.manualGroup = candidate.group;
        radio.checked = candidate.group === selectedGroup;
        const copy = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = `${candidate.group} · ${formatRatio(candidate.ratio)}`;
        const detail = document.createElement("small");
        const modelIssues = candidateIssueText(candidate);
        const modelDetails = Array.isArray(candidate.modelResults) && candidate.modelResults.length > 1 && modelIssues
          ? ` · ${modelIssues}`
          : "";
        detail.textContent = `状态：${status}${current}${modelDetails}`;
        copy.append(name, detail);
        option.append(radio, copy);
        refs.manualGroup.appendChild(option);
      });
    if (refs.manualHint) {
      const availableCount = state.candidates.filter((candidate) => candidate.available).length;
      refs.manualHint.textContent = state.candidates.length
        ? `${state.candidates.length} 个分组均可人工选择，其中 ${availableCount} 个符合自动策略；账号权限仍由站点接口校验`
        : "请先执行一次立即检查";
    }
    if (refs.manualConfirm) {
      refs.manualConfirm.disabled = running || !refs.manualGroup.querySelector('input[data-manual-group]:checked');
    }
  }

  function renderLogs() {
    if (!refs.logs) return;
    if (!sectionNeedsRender(refs.logs, [state.logs])) return;
    refs.logs.replaceChildren();
    if (!state.logs.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无事件";
      refs.logs.appendChild(empty);
      return;
    }
    state.logs.forEach((entry) => {
      const row = document.createElement("div");
      row.className = `log log-${entry.tone}`;
      const time = document.createElement("span");
      time.className = "mono";
      time.textContent = entry.at;
      const message = document.createElement("span");
      message.textContent = entry.message;
      row.append(time, message);
      refs.logs.appendChild(row);
    });
  }

  function renderTokenResults() {
    if (!refs.tokenResultRows) return;
    if (!sectionNeedsRender(refs.tokenResultRows, [state.tokenResults, state.tokenResults.length])) return;
    refs.tokenResultRows.replaceChildren();
    if (!state.tokenResults.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无密钥检查结果";
      refs.tokenResultRows.appendChild(empty);
      return;
    }
    state.tokenResults.forEach((result) => {
      const row = document.createElement("div");
      row.className = `token-result token-result-${result.tone}`;
      const name = document.createElement("span");
      name.title = result.name;
      name.textContent = result.name;
      const group = document.createElement("span");
      group.className = "mono";
      group.textContent = result.group;
      const message = document.createElement("span");
      message.title = result.message;
      message.textContent = result.message;
      row.append(name, group, message);
      refs.tokenResultRows.appendChild(row);
    });
  }

  function formatIsolationRemaining(until, now) {
    const minutes = Math.max(1, Math.ceil((Number(until) - Number(now)) / 60000));
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
  }

  function renderIsolations() {
    if (!refs.isolationRows) return;
    const now = Date.now();
    const entries = listActiveIsolations(getSwitchGuardState(now), now);
    refs.isolationRows.replaceChildren();
    if (refs.isolationCount) refs.isolationCount.textContent = entries.length ? `${entries.length} 个生效中` : "当前无隔离";
    if (refs.clearAllIsolations) refs.clearAllIsolations.disabled = running || !entries.length;
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "isolation-empty";
      empty.textContent = "当前无健康故障或图片未通过的隔离分组";
      refs.isolationRows.appendChild(empty);
      return;
    }
    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "isolation-row";
      const copy = document.createElement("div");
      copy.className = "isolation-copy";
      const name = document.createElement("div");
      name.className = "isolation-name";
      const signal = document.createElement("span");
      signal.className = "candidate-signal isolation-signal";
      const strong = document.createElement("strong");
      strong.textContent = entry.group;
      strong.title = entry.group;
      name.append(signal, strong);
      const meta = document.createElement("div");
      meta.className = "isolation-meta";
      const model = document.createElement("span");
      model.textContent = modelIdentityLabel(entry.model);
      model.title = `模型：${modelIdentityLabel(entry.model)}`;
      const reason = document.createElement("span");
      reason.textContent = `${entry.type === "image" ? "图片" : "健康"} · ${entry.reason || "切换后健康检查失败"}`;
      reason.title = reason.textContent;
      const remaining = document.createElement("span");
      remaining.className = "isolation-remaining";
      remaining.textContent = `剩余 ${formatIsolationRemaining(entry.until, now)}`;
      meta.append(model, reason, remaining);
      copy.append(name, meta);
      const clear = document.createElement("button");
      clear.className = "isolation-unlock";
      clear.type = "button";
      clear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 9.5-2.1"></path><rect x="5" y="11" width="14" height="10" rx="2"></rect></svg><span>立即解除</span>';
      clear.setAttribute("aria-label", `立即解除 ${entry.group} 的故障隔离`);
      clear.addEventListener("click", () => clearIsolation(entry.model, entry.group));
      row.append(copy, clear);
      refs.isolationRows.appendChild(row);
    });
  }
