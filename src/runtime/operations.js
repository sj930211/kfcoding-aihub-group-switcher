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
    const groupId = Number(source.group_id ?? groupMeta.id ?? source.groupId);
    return {
      ...source,
      group: String(groupMeta.name || (typeof source.group === "string" ? source.group : "") || source.group_name || "未分组"),
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
        aihubPlatformMonitorsCache = monitorPayload.summary.apis || [];
        aihubRatesCache = normalizeAihubRates(rates);
        pricingCache = buildAihubModelCatalog(monitorPayload.summary);
        applyMonitorScopeMigration();
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
      refreshQualityRecommendation();
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

  function clearIsolation(model, group, groupId) {
    const result = removeIsolation(getSwitchGuardState(), model, group, Date.now(), groupId);
    if (!result.removed.length) return;
    saveSwitchGuardState(result.state);
    refreshCandidateIsolationState();
    setIsolationUndo(result.removed);
    const label = groupId ? `${group} #${groupId}` : group;
    addLog(`已解除故障隔离：${label}`, "success");
    setStatus(`已解除 ${label} 的故障隔离`, "success");
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
    const [fromGroupId] = normalizeMonitorGroupIds([token.groupId]);
    const [toGroupId] = normalizeMonitorGroupIds([candidate.groupId]);
    if (
      config.rollbackChecks <= 0 ||
      !Number.isFinite(tokenId) ||
      tokenId <= 0 ||
      !fromGroup ||
      !toGroup ||
      (fromGroupId && toGroupId ? fromGroupId === toGroupId : fromGroup === toGroup)
    ) {
      delete state.byToken[tokenId];
      saveSwitchGuardState(state);
      return;
    }
    state.byToken[tokenId] = {
      model: targetModelIdentity(config),
      fromGroup,
      toGroup,
      ...(fromGroupId ? { fromGroupId } : {}),
      ...(toGroupId ? { toGroupId } : {}),
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
    const perform = async () => {
      const latest = await getTokenDetail(token.id);
      options?.beforeSwitch?.();
      if (!candidateMatchesToken({ group: latest.group, groupId: latest.groupId }, token)) {
        throw new Error("密钥分组已在其他操作中改变，本次取消切换");
      }
      return switchTokenGroupUnlocked(token, candidate, options);
    };
    if (globalThis.navigator?.locks) {
      return navigator.locks.request(STORAGE_PREFIX + ":switch:" + token.id, { ifAvailable: true }, (lock) => {
        if (!lock) throw new Error("该密钥正由其他页面切换，请稍后重试");
        return perform();
      });
    }
    return perform();
  }

  async function switchTokenGroupUnlocked(token, candidate, options) {
    const switchOptions = options || {};
    switchOptions.beforeSwitch?.();
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

  function invalidateCheckDecisions() {
    state.checkCancelRevision = (state.checkCancelRevision || 0) + 1;
    pendingCandidates.clear();
  }

  function refreshOutOfScopeTokens(tokens = tokensCache) {
    state.outOfScopeTokens = tokens.filter((token) => config.tokenIds.includes(Number(token.id))
      && !monitorGroupInScope(config, token.groupId)).map((token) => ({
        id: Number(token.id), name: tokenLabel(token), group: token.group || "未知", groupId: Number(token.groupId) || 0,
      }));
  }

  function saveMonitorScope(mode, ids) {
    const next = sanitizeConfig({ ...config, monitorScopeMode: mode === "selected" ? "selected" : "all",
      monitorGroupIds: normalizeMonitorGroupIds(ids), monitorScopeMigrationPending: false, monitorScopeMigrationPlatform: "" });
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    config = next;
    invalidateCheckDecisions();
    GM_setValue(STORAGE_CONFIG, config);
    state.candidates = [];
    state.tokenResults = [];
    state.bestGroup = "-";
    refreshOutOfScopeTokens();
    syncForm();
    setStatus("监控范围已保存，下次检查生效", "success");
  }

  function refreshQualityRecommendation() {
    const selected = tokensCache.filter((token) => config.tokenIds.includes(Number(token.id)));
    const currentRows = selected.map((token) => state.candidates.find((row) => candidateMatchesToken(row, token)));
    const currentModels = [...new Set(currentRows.filter(Boolean).map(qualityModel))];
    const currentGroup = currentRows.length && currentRows.every(Boolean) && currentModels.length === 1 ? currentRows[0] : "";
    const best = selectBestCandidate(state.candidates, currentGroup, config.selectionMode);
    state.bestGroup = best ? candidateRecommendationLabel(best)
      : state.candidates.some((row) => row.available && row.scopeEligible !== false) ? "按模型分别推荐" : "无合格分组";
  }

  async function manualSwitchToGroup(candidate, action) {
    if (!candidate || !["once", "add", "add-and-switch"].includes(action)) return;
    if (action !== "once" && !monitorGroupInScope(config, candidate.groupId)) {
      saveMonitorScope("selected", [...config.monitorGroupIds, candidate.groupId]);
    }
    return runCheck({ manual: true, forceSwitch: true, targetGroup: candidate.group, targetGroupId: candidate.groupId,
      allowUnavailable: candidate.available !== true });
  }

  function applyMonitorScopeMigration() {
    const migrated = migrateAihubMonitorScope(config, aihubGroupsCache, aihubPlatformMonitorsCache);
    if (migrated.changed) {
      config = migrated.config;
      GM_setValue(STORAGE_CONFIG, config);
      addLog("旧平台范围已映射到监控分组ID", "info");
    }
    refreshOutOfScopeTokens();
  }

  async function handleRollbackGuard(token, candidates, assertCurrent, observeHealth = true) {
    const tokenId = Number(token.id);
    const now = Date.now();
    const guardState = getSwitchGuardState(now);
    const guard = guardState.byToken[tokenId];
    if (!guard) return null;
    const destinationMatches = guard.toGroupId ? Number(guard.toGroupId) === Number(token.groupId)
      : guard.toGroup === token.group && candidates.filter((row) => row.group === guard.toGroup).length === 1;
    if (config.rollbackChecks <= 0 || guard.model !== targetModelIdentity(config) || !destinationMatches) {
      delete guardState.byToken[tokenId]; saveSwitchGuardState(guardState); return null;
    }
    const current = candidates.find((row) => candidateMatchesToken(row, token));
    if (current?.available) {
      if (observeHealth) guard.remaining -= 1;
      if (guard.remaining <= 0) delete guardState.byToken[tokenId];
      saveSwitchGuardState(guardState);
      return { outcome: guard.remaining <= 0 ? "observed" : "observing", group: token.group,
        tone: guard.remaining <= 0 ? "success" : "warning", message: guard.remaining <= 0 ? "切换观察完成" : "切换观察中，剩余 " + guard.remaining + " 次" };
    }
    if (!candidateHasExplicitHealthFailure(current, config)) return { outcome: "observing", group: token.group,
      tone: "warning", message: "观察数据不足或受配置限制，保持当前分组" };
    guardState.blacklist = guardState.blacklist.filter((entry) => entry.model !== targetModelIdentity(config)
      || (entry.groupId ? Number(entry.groupId) !== Number(current.groupId) : entry.group !== guard.toGroup));
    guardState.blacklist.push({ model: targetModelIdentity(config), group: guard.toGroup,
      ...(Number(current.groupId) > 0 ? { groupId: Number(current.groupId) } : {}),
      until: now + config.blacklistMinutes * 60000, type: "health", reason: "切换后健康检查失败" });
    delete guardState.byToken[tokenId]; saveSwitchGuardState(guardState);
    const eligible = applyTemporaryBlacklist(candidates, guardState, targetModelIdentity(config), now);
    const modelRows = eligible.filter((row) => qualityModel(row) === qualityModel(current));
    const fallback = config.automaticSwitchMode === "failover"
      ? selectBestCandidate(modelRows, token, config.selectionMode)
      : selectRollbackCandidate(modelRows, { group: guard.fromGroup, groupId: guard.fromGroupId }, config.selectionMode).candidate;
    if (!fallback || candidateMatchesToken(fallback, token)) return { outcome: "recovery-blocked", group: token.group, tone: "warning", message: "没有范围内合格回滚分组，保持当前组" };
    await switchTokenGroup(token, fallback, { trackRollback: false, beforeSwitch: assertCurrent,
      logTone: "warning", logMessage: tokenLabel(token) + " 观察失败，已回滚到 " + fallback.group });
    return { outcome: "rolled-back", group: fallback.group, tone: "warning", message: "观察失败，已回滚到 " + fallback.group };
  }

  async function processToken(token, candidates, options = {}) {
    const forceSwitch = Boolean(options.forceSwitch);
    const targetGroup = String(options.targetGroup || "").trim();
    const tokenId = Number(token.id);
    const key = JSON.stringify(config);
    const assertCurrent = options.assertCurrent || (() => {
      if (key !== JSON.stringify(config)) throw new Error("检查期间设置已变更，本轮取消切换");
    });
    assertCurrent();
    validateToken(token);
    if (!forceSwitch && !monitorGroupInScope(config, token.groupId)) {
      pendingCandidates.delete(tokenId);
      return { outcome: "scope-hold", group: token.group || "未知", tone: "warning", message: "当前组未纳入监控，自动检查/切换暂停；可在设置中加入或移除密钥勾选" };
    }
    const eligible = applyTemporaryBlacklist(candidates, getSwitchGuardState(), targetModelIdentity(config), Date.now());
    const current = eligible.find((row) => candidateMatchesToken(row, token));
    if (config.enabled && !forceSwitch) {
      const rollback = await handleRollbackGuard(token, eligible, assertCurrent, options.observeHealth !== false);
      if (rollback) return rollback;
    }
    if (config.enabled && !forceSwitch && candidateHasExplicitHealthFailure(current, config)) {
      const recovery = selectBestCandidate(eligible, token, config.selectionMode);
      pendingCandidates.delete(tokenId);
      if (!recovery || candidateMatchesToken(recovery, token)) return { outcome: "recovery-blocked", group: token.group, tone: "warning", message: "当前分组故障，没有同模型合格目标" };
      await switchTokenGroup(token, recovery, { beforeSwitch: assertCurrent });
      return { outcome: "switched", group: recovery.group, tone: "success", message: "故障恢复，已切换" };
    }
    if (!forceSwitch && (config.automaticSwitchMode === "failover" || options.mode === "health")) {
      if (config.automaticSwitchMode === "failover") pendingCandidates.delete(tokenId);
      return { outcome: "healthy", group: token.group || "未设置", tone: current?.available ? "success" : "warning",
        message: current?.available ? "当前分组正常，保持不变" : "未发现明确故障，保持当前分组" };
    }
    const selected = selectSwitchCandidate(eligible, token, targetGroup, {
      mode: config.selectionMode, allowUnavailable: options.allowUnavailable === true, targetGroupId: options.targetGroupId,
    });
    if (!selected) {
      pendingCandidates.delete(tokenId);
      return { outcome: "no-candidate", group: token.group || "未设置", tone: "warning", message: "没有同模型合格候选，保持当前分组" };
    }
    if (candidateMatchesToken(selected, token)) {
      pendingCandidates.delete(tokenId);
      return { outcome: "current", group: token.group, tone: "success", message: targetGroup ? "已是手动目标分组" : "当前已是综合质量推荐" };
    }
    if (forceSwitch) {
      await switchTokenGroup(token, selected, { beforeSwitch: assertCurrent });
      return { outcome: "switched", group: selected.group, tone: "success", message: "已手动切换" };
    }
    if (!config.enabled) return { outcome: "suggested", group: token.group, tone: "warning", message: "建议切换到 " + selected.group };
    const previous = pendingCandidates.get(tokenId);
    const pending = previous?.groupId === selected.groupId ? { ...previous, hits: previous.hits + 1 }
      : { groupId: selected.groupId, group: selected.group, hits: 1 };
    pendingCandidates.set(tokenId, pending);
    if (pending.hits < config.confirmPolls) return { outcome: "pending", group: token.group, tone: "warning",
      message: selected.group + " · 确认 " + pending.hits + "/" + config.confirmPolls };
    const hold = switchHoldState(getSwitchHistory(), tokenId, targetModelIdentity(config), token.group, config.switchHoldMinutes, Date.now());
    if (shouldKeepCurrentDuringHold(current, hold)) return { outcome: "holding", group: token.group, tone: "success",
      message: "保持中，" + Math.ceil(hold.remainingMs / 60000) + " 分钟后择优" };
    await switchTokenGroup(token, selected, { beforeSwitch: assertCurrent });
    return { outcome: "switched", group: selected.group, tone: "success", message: "已自动切换" };
  }

  async function loadCheckCandidates(models, healthOnly = false, request = {}) {
    let monitorFallback = false;
    let candidates;
    if (IS_AIHUB) {
      const range = null;
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
      aihubPlatformMonitorsCache = summary.apis || [];
      aihubRatesCache = normalizeAihubRates(rates);
      pricingCache = buildAihubModelCatalog(summary);
      applyMonitorScopeMigration();
      const scoped = scopeAihubMonitors(summary, aihubGroupsCache, config, models, { ...request, healthOnly });
      candidates = evaluateAihubCandidates(scoped.summary, series, aihubGroupsCache, aihubRatesCache,
        { ...config, models, model: models[0] || "" }, Date.now())
        .map((candidate) => ({ ...candidate, scopeEligible: scoped.eligibleIds.has(Number(candidate.groupId)) }));
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
    let updateRecommendation = !healthOnly && !options?.targetGroup;
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
    let checkConfigKey = JSON.stringify(config);
    const checkCancelRevision = state.checkCancelRevision || 0;
    const assertCheckCurrent = () => {
      if (checkConfigKey !== JSON.stringify(config) || checkCancelRevision !== (state.checkCancelRevision || 0)) {
        throw new Error("检查期间设置已变更或任务已取消，本轮取消切换");
      }
    };

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
    let manualRiskCandidate = null;
    try {
      if (IS_AIHUB) await tokenCatalogRefresh;
      assertCheckCurrent();
      const details = await Promise.allSettled(selectedTokenIds.map((tokenId) => getTokenDetail(tokenId)));
      assertCheckCurrent();
      const candidateRequest = { targetGroup, targetGroupId: options?.targetGroupId,
        currentTokens: details.filter((detail) => detail.status === "fulfilled").map((detail) => detail.value) };
      let candidateRequestRevision = ++state.candidateRequestRevision;
      let { candidates, monitorFallback: degraded } = await loadCheckCandidates(models, healthOnly, candidateRequest);
      assertCheckCurrent();
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
      if (!targetGroup && (!healthOnly || !state.candidates.length)) {
        state.candidates = candidates;
        refreshQualityRecommendation();
        state.lastStrategyCheck = checkedAt;
      }
      if (targetGroup) {
        const target = selectSwitchCandidate(candidates, "", targetGroup, { allowUnavailable: true, targetGroupId: options?.targetGroupId });
        if (target.available !== true && options?.allowUnavailable !== true) {
          manualRiskCandidate = target;
          setStatus("目标分组状态已变化，请确认最新风险后再切换", "warning");
          return;
        }
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

      if (healthOnly) {
        const healthCandidates = candidates;
        const needsRecovery = details.some((detail) => detail.status === "fulfilled"
          && monitorGroupInScope(config, detail.value.groupId)
          && candidateHasExplicitHealthFailure(healthCandidates.find((row) => candidateMatchesToken(row, detail.value)), config));
        if (needsRecovery) {
          updateRecommendation = true;
          // Recovery never waits for the next strategy tick and never writes using an old account catalog.
          candidateRequestRevision = ++state.candidateRequestRevision;
          const refreshed = await loadCheckCandidates(models, false, candidateRequest);
          assertCheckCurrent();
          candidates = applyTemporaryBlacklist(refreshed.candidates, getSwitchGuardState(), targetModelIdentity(config), Date.now());
          monitorFallback = refreshed.monitorFallback;
          state.candidates = candidates;
          state.candidateRevision = candidateRequestRevision;
          refreshQualityRecommendation();
        } else {
          const currentTokens = details.filter((detail) => detail.status === "fulfilled").map((detail) => detail.value);
          state.candidates = state.candidates.map((row) => currentTokens.some((token) => candidateMatchesToken(row, token))
            ? candidates.find((fresh) => candidateMatchesToken(fresh, { group: row.group, groupId: row.groupId })) || row : row);
        }
      }
      assertCheckCurrent();
      refreshOutOfScopeTokens(details.filter((detail) => detail.status === "fulfilled").map((detail) => detail.value));
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
          continue;
        }

        const token = detail.value;
        try {
          const result = await processToken(token, candidates, { forceSwitch, targetGroup, targetGroupId: options?.targetGroupId, allowUnavailable: options?.allowUnavailable === true, assertCurrent: assertCheckCurrent, mode: healthOnly ? "health" : "strategy", observeHealth: options?.observeHealth });
          state.tokenResults.push({ id: tokenId, name: tokenLabel(token), ...result });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pendingCandidates.delete(tokenId);
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

      refreshOutOfScopeTokens();
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
      if (manualRiskCandidate) requestManualSwitch(manualRiskCandidate);
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
    if (refs.tokenSearch) filterSelectorList(refs.tokenList, refs.tokenSearch, refs.tokenSearchStatus);
    renderTokenSelectionCount();

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
      const platforms = [...new Set((pricingCache?.data || [])
        .filter((item) => item.model_name === model)
        .flatMap((item) => Array.isArray(item.platforms) ? item.platforms : []))].filter(Boolean);
      name.textContent = `${model}${platforms.length ? ` · ${platforms.join(" / ")}` : ""}`;
      name.title = name.textContent;
      option.append(checkbox, name);
      refs.modelList.appendChild(option);
    });
    if (refs.modelSearch) filterSelectorList(refs.modelList, refs.modelSearch, refs.modelSearchStatus);
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
    if (IS_AIHUB) refreshPlatformFilter(refs.groupFilterPlatform);
    if (!groups.length) {
      const empty = document.createElement("div");
      empty.className = "empty token-empty";
      empty.textContent = "检查后显示可选分组";
      refs.groupFilterList.appendChild(empty);
    }
    groups.forEach((group) => {
      const option = document.createElement("label");
      option.className = "token-option";
      if (IS_AIHUB) option.dataset.platform = groupPlatformFor(
        aihubGroupsCache.find((item) => item.name === group) || { name: group }, aihubPlatformMonitorsCache, state.candidates);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.groupName = group;
      checkbox.checked = selected.has(group);
      const name = document.createElement("span");
      name.textContent = group;
      option.append(checkbox, name);
      refs.groupFilterList.appendChild(option);
    });
    if (refs.groupFilterSearch) filterSelectorList(refs.groupFilterList, refs.groupFilterSearch, refs.groupFilterSearchStatus, refs.groupFilterPlatform);
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
    refreshPlatformFilter(refs.candidatePlatform);
    const rows = sortCandidateRowsForMode(state.candidates, config.selectionMode);
    if (!sectionNeedsRender(refs.candidateRows, [state.candidates, tokensCache, config.tokenIds.join(","), running])) { applyCandidateDisplayControls(); return; }
    const openIds = new Set([...refs.candidateRows.querySelectorAll("details[open]")].map((node) => node.dataset.groupId));
    refs.candidateRows.replaceChildren();
    const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    if (!rows.length) {
      const empty = element("div", config.monitorScopeMode === "selected" && !config.monitorGroupIds.length ? "未选择监控分组。请在设置中配置范围。" : "暂无检查结果。请立即检查或调整监控范围。", "empty");
      const button = element("button", "设置监控范围");button.type = "button";button.addEventListener("click", () => { state.settingsPage = "routing"; setActiveView("settings"); });
      empty.appendChild(button);refs.candidateRows.appendChild(empty);applyCandidateDisplayControls();return;
    }
    rows.forEach((candidate) => {
      const entry = element("div", undefined, "candidate-entry");
      const reason = candidate.modelDetectionReason || "";
      const status = reason === "model-detection-model-mismatch" ? "notmatch" : !reason ? "pass" : reason.includes("failed") ? "fail" : reason.includes("expired") ? "stale" : candidate.modelDetection?.refreshing || reason.includes("incomplete") ? "pending" : "unknown";
      Object.assign(entry.dataset, { groupId: String(candidate.groupId), group: candidate.group, model: qualityModel(candidate), platform: normalizeGroupPlatform(candidate.platform), status, scope: candidate.inMonitorScope ? "in" : "out", available: String(candidate.available), searchText: [candidate.group, candidate.groupId, candidate.platform, candidate.aihubMetricModel].join(" ") });
      [["ratio", candidate.ratio], ["success", candidate.aggregateSuccess], ["cache", candidate.cacheHitRate], ["tps", candidate.outputTokensPerSecond], ["score", candidate.qualityScore]].forEach(([key, value]) => { entry.dataset[key] = Number.isFinite(value) ? String(value) : ""; });
      const row = element("div", undefined, "candidate-row-v2");const name = element("div");const title = element("strong", candidate.group);
      const currentTokens = candidateCurrentTokens(candidate, tokensCache, config.tokenIds);
      if (currentTokens.length) { entry.dataset.current = "true";title.textContent += " · 当前"; }
      name.append(title, element("small", "#" + candidate.groupId + " · " + (groupPlatforms[normalizeGroupPlatform(candidate.platform)] || "未知平台")));
      const detection = element("div");detection.append(element("span", {pass:"检测通过",fail:"检测未通过",stale:"检测过期",pending:"检测中",notmatch:"模型不匹配",unknown:"检测未知"}[status], "candidate-status"), element("small", candidate.aihubMetricModel || "未匹配启用模型"));
      const action = element("div");const button = element("button", "切换", "candidate-row-switch");button.type = "button";
      const allCurrent = config.tokenIds.length > 0 && currentTokens.length === config.tokenIds.length;
      if (allCurrent) button.textContent="使用中";
      button.disabled=running || !config.tokenIds.length || allCurrent || candidate.reasons.includes("not-user-selectable");
      button.setAttribute("aria-label", "手动切换到 " + candidate.group);button.addEventListener("click", () => requestManualSwitch(candidate));
      action.append(button, element("small", Number.isFinite(candidate.qualityScore) ? "质量 " + candidate.qualityScore.toFixed(1) : "不参与自动排序"));
      row.append(name, element("div", formatRatio(candidate.ratio), "mono"), detection, element("div", formatPercent(candidate.cacheHitRate), "mono"), element("div", formatPercent(candidate.aggregateSuccess), "mono"), element("div", Number.isFinite(candidate.outputTokensPerSecond) ? candidate.outputTokensPerSecond.toFixed(1) : "—", "mono"), action);
      const details = element("details", undefined, "candidate-inspection");details.dataset.groupId=String(candidate.groupId);details.open=openIds.has(String(candidate.groupId));
      const summary = element("summary", "检测详情 · " + (candidate.available ? "符合自动切换条件" : candidateIssueText(candidate)));details.appendChild(summary);
      const lines = ["检测模型：" + (candidate.modelDetection?.model || "未知"), "详情结果：" + (candidate.modelDetection?.presentationResult === true ? "通过" : candidate.modelDetection?.presentationResult === false ? "未通过" : "未知"), "完成时间：" + (candidate.modelDetection?.detectedAt || "未知"), "有效期：" + (candidate.modelDetection?.expiresAt || "按完成时间60分钟"), "模型样本：" + (Number.isFinite(candidate.aihubMetricSampleCount) ? candidate.aihubMetricSampleCount : "未知") + " · 缓存样本：" + (Number.isFinite(candidate.aihubCacheSampleCount) ? candidate.aihubCacheSampleCount : "未知")];
      (candidate.modelDetection?.stages || []).forEach((stage,index)=>lines.push((stage.name || "阶段" + (index+1)) + "：" + (stage.status || "未知") + (stage.executionComplete ? " · 已完成" : " · 未完成")));
      if (candidate.qualityPercentiles) lines.push("同模型池分位：成功 " + candidate.qualityPercentiles.success.toFixed(1) + " / 缓存 " + candidate.qualityPercentiles.cache.toFixed(1) + " / TPS " + candidate.qualityPercentiles.tps.toFixed(1) + " / 成本 " + candidate.qualityPercentiles.cost.toFixed(1));
      lines.forEach(text=>details.appendChild(element("p",text)));
      if (candidate.detectionMedia?.url) details.appendChild(createDetectionImageThumbnail(candidate));
      details.addEventListener("keydown", (event)=>{if(event.key==="Escape" && details.open){event.preventDefault();event.stopPropagation();details.open=false;summary.focus();}});
      entry.append(row,details);refs.candidateRows.appendChild(entry);
    });
    applyCandidateDisplayControls();
  }

  function manualGroupCatalog() {
    if (!IS_AIHUB) return state.candidates;
    const assessed = new Set(state.candidates.map((candidate) => Number(candidate.groupId)));
    return [...state.candidates, ...aihubGroupsCache.filter((group) => !assessed.has(Number(group.id))).map((group) => ({
      group: group.name, groupId: Number(group.id), ratio: Number(aihubRatesCache[group.id] ?? group.rate_multiplier),
      platform: group.platform || aihubPlatformMonitorsCache.find((monitor) => Number(monitor.group_id) === Number(group.id))?.platform,
      available: false, scopeEligible: false, catalogOnly: true, reasons: [], warnings: [],
    }))];
  }

  function renderManualGroups() {
    if (!refs.manualGroup) return;
    if (!sectionNeedsRender(refs.manualGroup, [state.candidates, state.tokenResults,
      state.tokenResults.length, running, IS_AIHUB ? aihubGroupsCache : null])) return;
    const selectedChoice = refs.manualGroup.querySelector('input[data-manual-group]:checked');
    const selectedGroup = selectedChoice?.value || "";
    const selectedId = Number(selectedChoice?.dataset.groupId);
    const catalog = manualGroupCatalog();
    if (IS_AIHUB) refreshPlatformFilter(refs.manualGroupPlatform);
    refs.manualGroup.replaceChildren();

    if (!catalog.length) {
      const empty = document.createElement("div");
      empty.className = "empty manual-group-empty";
      empty.textContent = "暂无检查结果";
      refs.manualGroup.appendChild(empty);
    }

    catalog
      .slice()
      .sort((left, right) => {
        if (left.available !== right.available) return left.available ? -1 : 1;
        return (left.ratio || Infinity) - (right.ratio || Infinity);
      })
      .forEach((candidate) => {
        const warningText = (Array.isArray(candidate.warnings) ? candidate.warnings : [])
          .map(reasonLabel)
          .join("、");
        const status = candidate.catalogOnly ? "尚未评估，选择后检查" : candidate.available
          ? (warningText ? `可用（警告：${warningText}）` : "可用")
          : candidate.reasons.map(reasonLabel).join("、") || "不可用";
        const currentCount = state.tokenResults.filter((result) => result.group === candidate.group).length;
        const current = currentCount ? ` · 当前 ${currentCount}` : "";
        const option = document.createElement("label");
        option.className = `manual-group-option${candidate.available ? "" : " manual-group-option-warning"}`;
        if (IS_AIHUB) option.dataset.platform = normalizeGroupPlatform(candidate.platform);
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "kf-manual-group";
        radio.value = candidate.group;
        radio.dataset.manualGroup = candidate.group;
        radio.dataset.groupId = String(candidate.groupId || "");
        radio.checked = selectedId > 0 ? Number(candidate.groupId) === selectedId : candidate.group === selectedGroup;
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
    if (refs.manualGroupSearch) filterSelectorList(refs.manualGroup, refs.manualGroupSearch, refs.manualGroupSearchStatus, refs.manualGroupPlatform);
    if (refs.manualHint) {
      const availableCount = state.candidates.filter((candidate) => candidate.available && candidate.scopeEligible !== false).length;
      refs.manualHint.textContent = catalog.length
        ? `${catalog.length} 个分组均可人工选择，其中 ${availableCount} 个符合自动策略；未评估项将在选择后检查，账号权限由站点校验`
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
      empty.textContent = "当前无健康故障的隔离分组";
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
      const groupLabel = entry.groupId ? `${entry.group} #${entry.groupId}` : entry.group;
      strong.textContent = groupLabel;
      strong.title = groupLabel;
      name.append(signal, strong);
      const meta = document.createElement("div");
      meta.className = "isolation-meta";
      const model = document.createElement("span");
      model.textContent = modelIdentityLabel(entry.model);
      model.title = `模型：${modelIdentityLabel(entry.model)}`;
      const reason = document.createElement("span");
      reason.textContent = `健康 · ${entry.reason || "切换后健康检查失败"}`;
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
      clear.setAttribute("aria-label", `立即解除 ${groupLabel} 的故障隔离`);
      clear.addEventListener("click", () => clearIsolation(entry.model, entry.group, entry.groupId));
      row.append(copy, clear);
      refs.isolationRows.appendChild(row);
    });
  }
