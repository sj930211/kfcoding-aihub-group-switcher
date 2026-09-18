  function requestError(message, retryable, status) {

    const error = new Error(message);
    error.kfcodingRequestError = true;
    error.retryable = Boolean(retryable);
    error.status = Number(status) || 0;
    return error;
  }

  function isRetryableStatus(status) {
    return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
  }

  async function requestJsonWithRetry(path, options, runtime) {
    const request = options || {};
    const environment = runtime || {};
    const method = String(request.method || "GET").toUpperCase();
    const isGet = method === "GET";
    const maxAttempts = Math.max(
      1,
      Math.trunc(Number(request.maxAttempts) || (isGet ? GET_MAX_ATTEMPTS : 1)),
    );
    const timeoutMs = Math.max(
      1,
      Number(request.timeoutMs) || (isGet ? GET_REQUEST_TIMEOUT_MS : MUTATION_REQUEST_TIMEOUT_MS),
    );
    const fetchImpl = environment.fetchImpl || globalThis.fetch.bind(globalThis);
    const AbortControllerImpl = environment.AbortControllerImpl || globalThis.AbortController;
    const setTimer = environment.setTimeoutImpl || globalThis.setTimeout.bind(globalThis);
    const clearTimer = environment.clearTimeoutImpl || globalThis.clearTimeout.bind(globalThis);
    const sleepImpl = environment.sleepImpl || ((delay) => new Promise((resolve) => setTimer(resolve, delay)));
    let lastError = null;
    let attemptsMade = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attemptsMade = attempt;
      const controller = new AbortControllerImpl();
      const timeout = setTimer(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(path, {
          method,
          body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
          credentials: "include",
          cache: "no-store",
          headers: request.headers || {},
          signal: controller.signal,
        });
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw requestError(
            `接口 ${path} 返回了非 JSON 数据`,
            isGet && (isRetryableStatus(response.status) || response.status === 200),
            response.status,
          );
        }
        if (!response.ok || payload.success === false) {
          throw requestError(
            payload.message || `接口 ${path} 请求失败 (${response.status})`,
            isGet && isRetryableStatus(response.status),
            response.status,
          );
        }
        return payload;
      } catch (error) {
        if (error && error.kfcodingRequestError) {
          lastError = error;
        } else if (error && error.name === "AbortError") {
          lastError = requestError(`接口 ${path} 请求超时`, isGet, 0);
        } else {
          const detail = error && error.message ? `：${error.message}` : "";
          lastError = requestError(`接口 ${path} 网络请求失败${detail}`, isGet, 0);
        }
      } finally {
        clearTimer(timeout);
      }

      if (!lastError.retryable || attempt >= maxAttempts) break;
      await sleepImpl(750 * 2 ** (attempt - 1));
    }

    if (attemptsMade > 1) {
      lastError.message = `${lastError.message}（已重试 ${attemptsMade - 1} 次）`;
    }
    throw lastError;
  }

  function requiresNewApiAccessToken(path) {
    const apiPath = String(path || "").split("?", 1)[0];
    return apiPath.startsWith("/api/") && !NEW_API_PUBLIC_API_PATHS.has(apiPath);
  }

  function normalizeNewApiAuthBundle(payload, providerLabel) {
    const label = String(providerLabel || "KFCoding");
    const source = payload && payload.data && typeof payload.data === "object"
      ? payload.data
      : null;
    const accessToken = source && typeof source.access_token === "string"
      ? source.access_token.trim()
      : "";
    const accessExpiresAt = Number(source && source.access_expires_at);
    const tokenType = String((source && source.token_type) || "");
    const sessionId = String((source && source.session && source.session.sid) || "");
    if (
      !accessToken
      || tokenType !== "Bearer"
      || !Number.isFinite(accessExpiresAt)
      || accessExpiresAt <= 0
      || !sessionId
    ) {
      throw requestError(`${label} 鉴权刷新响应无效，请刷新页面或重新登录`, false, 0);
    }
    return { accessToken, accessExpiresAt, sessionId };
  }

  function createNewApiAuthManager(options) {
    const runtime = options || {};
    const providerLabel = String(runtime.providerLabel || "KFCoding");
    const requestRefresh = runtime.requestRefresh;
    const nowSeconds = runtime.nowSeconds || (() => Math.floor(Date.now() / 1000));
    const sleep = runtime.sleep || ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
    const runExclusive = runtime.runExclusive || ((task) => {
      const locks = globalThis.navigator && globalThis.navigator.locks;
      return locks
        ? locks.request("new-api:auth-refresh", { mode: "exclusive" }, task)
        : task();
    });
    let accessToken = "";
    let accessExpiresAt = 0;
    let sessionId = "";
    let refreshPromise = null;

    const invalidateAccessToken = () => {
      accessToken = "";
      accessExpiresAt = 0;
    };

    const getAccessToken = async (forceRefresh) => {
      if (!forceRefresh && accessToken && accessExpiresAt > nowSeconds() + 60) {
        return accessToken;
      }
      if (refreshPromise) return refreshPromise;

      refreshPromise = runExclusive(async () => {
        let lastError = null;
        for (let attempt = 0; attempt < NEW_API_AUTH_REFRESH_DELAYS_MS.length; attempt += 1) {
          const delay = NEW_API_AUTH_REFRESH_DELAYS_MS[attempt];
          if (delay > 0) await sleep(delay);
          try {
            const headers = {
              Accept: "application/json",
              "Cache-Control": "no-store",
            };
            if (sessionId) headers["X-Auth-Session"] = sessionId;
            const payload = await requestRefresh(headers);
            const bundle = normalizeNewApiAuthBundle(payload, providerLabel);
            accessToken = bundle.accessToken;
            accessExpiresAt = bundle.accessExpiresAt;
            sessionId = bundle.sessionId;
            return accessToken;
          } catch (error) {
            lastError = error;
            if (Number(error && error.status) === 401) {
              invalidateAccessToken();
              sessionId = "";
              throw requestError(`${providerLabel} 登录已失效，请重新登录后再试`, false, 401);
            }
            if (Number(error && error.status) !== 409) throw error;
            sessionId = "";
          }
        }
        throw requestError(
          `${providerLabel} 登录状态正在同步，请稍后重试`,
          false,
          Number(lastError && lastError.status) || 409,
        );
      }).finally(() => {
        refreshPromise = null;
      });
      return refreshPromise;
    };

    return Object.freeze({ getAccessToken, invalidateAccessToken });
  }

  async function requestWithNewApiAuth(path, authManager, execute) {
    if (!requiresNewApiAccessToken(path)) return execute("");
    let accessToken = await authManager.getAccessToken(false);
    try {
      return await execute(accessToken);
    } catch (error) {
      if (Number(error && error.status) !== 401) throw error;
      authManager.invalidateAccessToken();
      accessToken = await authManager.getAccessToken(true);
      return execute(accessToken);
    }
  }
