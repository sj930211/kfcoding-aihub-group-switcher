  function normalizeAihubTodayUsage(payload, accountPayload) {
    const source = payload && payload.data && typeof payload.data === "object"
      ? payload.data
      : payload && typeof payload === "object"
        ? payload
        : {};
    const firstNumber = (...values) => {
      const found = values
        .filter((value) => value !== null && value !== undefined && value !== "")
        .map(Number)
        .find(Number.isFinite);
      return found === undefined ? NaN : found;
    };
    const tokenParts = [
      source.input_tokens,
      source.output_tokens,
      source.cache_read_tokens,
      source.cache_creation_tokens,
    ];
    const tokenFallback = tokenParts.some(
      (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)),
    )
      ? tokenParts.reduce((total, value) => total + (Number(value) || 0), 0)
      : (Number(source.prompt_tokens) || 0) + (Number(source.completion_tokens) || 0);
    const account = accountPayload && accountPayload.data && typeof accountPayload.data === "object"
      ? accountPayload.data
      : accountPayload && typeof accountPayload === "object"
        ? accountPayload
        : {};
    return {
      balance: Math.max(0, firstNumber(account.balance, account.available_balance) || 0),
      spend: Math.max(0, firstNumber(
        source.actual_cost,
        source.total_actual_cost,
        source.total_cost,
        source.cost,
      ) || 0),
      requests: Math.max(0, firstNumber(
        source.total_requests,
        source.request_count,
        source.requests,
      ) || 0),
      tokens: Math.max(0, firstNumber(source.total_tokens, tokenFallback) || 0),
      symbol: "$",
    };
  }

  function normalizeAihubStatisticsDays(value) {
    const days = Number(value);
    if (days === 1) return 1;
    if (days === 7) return 7;
    if (days === 14) return 14;
    if (days === 30) return 30;
    return 1;
  }

  function normalizeAihubStatisticsRange(value) {
    if (value === "today" || Number(value) === 1) return "today";
    if (value === "yesterday") return "yesterday";
    if ([7, 14, 30].includes(Number(value))) return String(Number(value));
    return "today";
  }

  function normalizeAihubStatisticsMetric(value) {
    return ["spend", "requests", "tokens"].includes(value) ? value : "spend";
  }

  function aihubUsageDateDomain(days, now) {
    const length = normalizeAihubStatisticsDays(days);
    const end = now instanceof Date ? new Date(now.getTime()) : new Date(now == null ? Date.now() : now);
    if (!Number.isFinite(end.getTime())) return [];
    end.setHours(12, 0, 0, 0);
    return Array.from({ length }, (_, index) => {
      const date = new Date(end.getTime());
      date.setDate(end.getDate() - (length - index - 1));
      return localDateKey(date);
    });
  }

  function aihubUsageHourDomain(now, range) {
    const end = now instanceof Date ? new Date(now.getTime()) : new Date(now == null ? Date.now() : now);
    if (!Number.isFinite(end.getTime())) return [];
    const normalizedRange = normalizeAihubStatisticsRange(range);
    const yesterday = normalizedRange === "yesterday";
    const currentHour = end.getHours();
    const length = yesterday ? 24 : currentHour === 0 ? 1 : currentHour;
    if (yesterday) end.setDate(end.getDate() - 1);
    end.setHours(0, 0, 0, 0);
    return Array.from({ length }, (_, index) => {
      const hour = new Date(end.getTime());
      hour.setHours(index, 0, 0, 0);
      return `${localDateKey(hour)}T${String(index).padStart(2, "0")}:00`;
    });
  }

  function aihubUsageRange(value, now) {
    const range = normalizeAihubStatisticsRange(value);
    if (range === "yesterday") {
      const today = aihubUsageDateDomain(1, now)[0];
      const yesterdayDate = new Date(`${today}T12:00:00`);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const keyDomain = [localDateKey(yesterdayDate)];
      return {
        range,
        days: 1,
        keyApiDays: 2,
        hourly: true,
        domain: aihubUsageHourDomain(now, range),
        keyDomain,
      };
    }
    if (range === "today") {
      const keyDomain = aihubUsageDateDomain(1, now);
      return {
        range,
        days: 1,
        keyApiDays: 1,
        hourly: true,
        domain: aihubUsageHourDomain(now, range),
        keyDomain,
      };
    }
    const days = normalizeAihubStatisticsDays(range);
    const keyDomain = aihubUsageDateDomain(days, now);
    return { range, days, keyApiDays: days, hourly: false, domain: keyDomain, keyDomain };
  }

  function aihubUsageRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.trend)) return payload.trend;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && typeof payload.data === "object") {
      if (Array.isArray(payload.data.items)) return payload.data.items;
      if (Array.isArray(payload.data.trend)) return payload.data.trend;
    }
    return [];
  }

  function hasAihubUsageRows(payload) {
    return Array.isArray(payload)
      || Boolean(payload && typeof payload === "object" && (
        Array.isArray(payload.items)
        || Array.isArray(payload.trend)
        || Array.isArray(payload.data)
        || (payload.data && typeof payload.data === "object" && (
          Array.isArray(payload.data.items)
          || Array.isArray(payload.data.trend)
        ))
      ));
  }

  function aihubUsageNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function aihubUsagePointKey(row, granularity) {
    if (!row || typeof row !== "object") return "";
    const raw = String(row.date ?? row.datetime ?? row.hour ?? row.timestamp ?? "");
    const dateMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (!dateMatch) return "";
    if (granularity !== "hour") return dateMatch[0];
    const hourValue = row.hour ?? row.hour_of_day ?? row.hourOfDay;
    const rawHour = hourValue !== undefined && hourValue !== null && /^\d{1,2}(?::\d{2})?$/.test(String(hourValue))
      ? Number.parseInt(String(hourValue), 10)
      : Number((raw.match(/[T\s](\d{1,2})(?::\d{2})?/) || [])[1]);
    if (!Number.isInteger(rawHour) || rawHour < 0 || rawHour > 23) return "";
    return `${dateMatch[0]}T${String(rawHour).padStart(2, "0")}:00`;
  }

  function normalizeAihubUsageSeries(payload, domain, granularity) {
    const dates = Array.isArray(domain) ? domain.map(String) : [];
    const pointGranularity = granularity === "hour" ? "hour" : "day";
    if (!hasAihubUsageRows(payload)) {
      return dates.map((date) => ({ date, present: true, spend: null, requests: null, tokens: null }));
    }
    const requestedDates = new Set(dates);
    const rowsByDate = new Map();
    aihubUsageRows(payload).forEach((row) => {
      if (!row || typeof row !== "object") return;
      const date = aihubUsagePointKey(row, pointGranularity);
      if (!date || !requestedDates.has(date)) return;
      rowsByDate.set(date, row);
    });
    return dates.map((date) => {
      const row = rowsByDate.get(date);
      if (!row) return { date, present: false, spend: 0, requests: 0, tokens: 0 };
      return {
        date,
        present: true,
        spend: aihubUsageNumber(row.actual_cost),
        requests: aihubUsageNumber(row.requests),
        tokens: aihubUsageNumber(row.total_tokens),
      };
    });
  }

  function sumAihubUsageMetric(series, metric) {
    const key = normalizeAihubStatisticsMetric(metric);
    const points = Array.isArray(series) ? series : [];
    if (!points.length) return { available: false, value: 0, invalidDates: [] };
    const invalidDates = points
      .filter((point) => !Number.isFinite(point && point[key]))
      .map((point) => String((point && point.date) || ""))
      .filter(Boolean);
    if (invalidDates.length) return { available: false, value: 0, invalidDates };
    return {
      available: true,
      value: points.reduce((total, point) => total + Math.max(0, Number(point && point[key]) || 0), 0),
      invalidDates: [],
    };
  }

  function reconcileAihubUsage(accountSeries, keyResults, metric) {
    const key = normalizeAihubStatisticsMetric(metric);
    const account = sumAihubUsageMetric(accountSeries, key);
    let failedCount = 0;
    const keys = (Array.isArray(keyResults) ? keyResults : []).map((entry) => {
      const source = entry && typeof entry === "object" ? entry : {};
      const aggregate = source.status === "success"
        ? sumAihubUsageMetric(source.series, key)
        : { available: false, value: 0 };
      const available = source.status === "success" && aggregate.available;
      if (!available) failedCount += 1;
      return {
        id: Number(source.id) || 0,
        name: String(source.name || `密钥 ${source.id || "-"}`),
        status: available ? "success" : "error",
        value: available ? aggregate.value : null,
        error: available ? "" : String(source.error || (source.status === "success" ? "统计字段不完整" : "读取失败")),
      };
    }).sort((left, right) => {
      if (left.status !== right.status) return left.status === "success" ? -1 : 1;
      if (left.status === "success" && right.value !== left.value) return right.value - left.value;
      return left.name.localeCompare(right.name, "zh-CN");
    });
    const assignedTotal = keys.reduce(
      (total, entry) => total + (entry.status === "success" ? Math.max(0, Number(entry.value) || 0) : 0),
      0,
    );
    const complete = account.available && failedCount === 0;
    const accountTotal = account.available ? account.value : null;
    const coverage = complete && accountTotal > 0 ? assignedTotal / accountTotal : complete && assignedTotal === 0 ? 0 : null;
    const remainder = complete ? accountTotal - assignedTotal : null;
    const tolerance = complete ? Math.max(1e-9, accountTotal * 1e-9) : 0;
    const anomaly = complete && assignedTotal - accountTotal > tolerance;
    return {
      metric: key,
      accountAvailable: account.available,
      accountTotal,
      assignedTotal,
      remainder,
      coverage,
      complete,
      failedCount,
      anomaly,
      empty: complete && accountTotal === 0 && assignedTotal === 0,
      keys,
    };
  }

  async function loadAllAihubKeys(fetcher, pageSize) {
    const size = Math.max(1, Math.min(100, Math.trunc(Number(pageSize) || 100)));
    const keys = [];
    const seenIds = new Set();
    for (let page = 1; page <= 100; page += 1) {
      const payload = await fetcher(`/api/v1/keys?page=${page}&page_size=${size}`);
      const items = payload && Array.isArray(payload.items) ? payload.items : [];
      items.forEach((item) => {
        const token = normalizeAihubToken(item);
        if (!token.id || seenIds.has(token.id)) return;
        seenIds.add(token.id);
        keys.push(token);
      });
      const total = Number(payload && (payload.total ?? payload.total_count));
      const hasMore = payload && typeof payload.has_more === "boolean" ? payload.has_more : null;
      if (hasMore === false || items.length === 0 || (Number.isFinite(total) && keys.length >= total)) break;
      if (items.length < size && hasMore !== true) break;
    }
    return keys;
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const source = Array.isArray(items) ? items : [];
    const results = new Array(source.length);
    const workerCount = Math.min(source.length, Math.max(1, Math.trunc(Number(limit) || 1)));
    let nextIndex = 0;
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (nextIndex < source.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(source[index], index);
      }
    }));
    return results;
  }

  async function loadAihubUsageStatistics(fetcher, options) {
    const request = options && typeof options === "object" ? options : {};
    const reportProgress = (phase, progress) => {
      if (typeof request.onProgress !== "function") return;
      request.onProgress({ phase, progress: Math.max(0, Math.min(1, Number(progress) || 0)) });
    };
    const usageRange = aihubUsageRange(request.range ?? request.days, request.now);
    const { range, days, keyApiDays, hourly, domain, keyDomain } = usageRange;
    const timezone = String(request.timezone || aihubTimezone());
    const startDate = keyDomain[0] || "";
    const endDate = keyDomain[keyDomain.length - 1] || "";
    const trendPath = `/api/v1/usage/dashboard/trend?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&granularity=${hourly ? "hour" : "day"}&timezone=${encodeURIComponent(timezone)}`;
    const reconciliationTrendPath = `/api/v1/usage/dashboard/trend?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&granularity=day&timezone=${encodeURIComponent(timezone)}`;
    const cachedKeys = Array.isArray(request.keys) ? request.keys : null;
    reportProgress("trend", 0.12);
    const [accountResult, reconciliationAccountResult, keysResult] = await Promise.allSettled([
      fetcher(trendPath),
      hourly && reconciliationTrendPath !== trendPath ? fetcher(reconciliationTrendPath) : Promise.resolve(null),
      cachedKeys ? Promise.resolve(cachedKeys) : loadAllAihubKeys(fetcher, 100),
    ]);
    reportProgress("keys", 0.28);
    const accountSeries = accountResult.status === "fulfilled"
      ? normalizeAihubUsageSeries(accountResult.value, domain, hourly ? "hour" : "day")
      : [];
    const accountReconciliationSeries = !hourly
      ? accountSeries
      : reconciliationAccountResult.status === "fulfilled"
        ? normalizeAihubUsageSeries(reconciliationAccountResult.value, keyDomain, "day")
        : [];
    const keys = keysResult.status === "fulfilled" ? keysResult.value : [];
    const completedKeys = { count: 0 };
    const keyResults = await mapWithConcurrency(keys, request.concurrency || 3, async (token) => {
      try {
        const payload = await fetcher(`/api/v1/user/api-keys/${encodeURIComponent(token.id)}/usage/daily?days=${keyApiDays}&timezone=${encodeURIComponent(timezone)}`);
        return {
          id: token.id,
          name: String(token.name || `密钥 ${token.id}`),
          status: "success",
          series: normalizeAihubUsageSeries(payload, keyDomain, "day"),
        };
      } catch (error) {
        return {
          id: token.id,
          name: String(token.name || `密钥 ${token.id}`),
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        completedKeys.count += 1;
        reportProgress("keys", 0.28 + (keys.length ? completedKeys.count / keys.length * 0.67 : 0.67));
      }
    });
    reportProgress("complete", 1);
    return {
      range,
      days,
      granularity: hourly ? "hour" : "day",
      timezone,
      domain,
      keyDomain,
      accountSeries,
      accountReconciliationSeries,
      accountReconciliationAggregate: sumAihubUsageMetric(accountReconciliationSeries, "spend"),
      accountError: accountResult.status === "rejected"
        ? (accountResult.reason instanceof Error ? accountResult.reason.message : String(accountResult.reason))
        : "",
      accountReconciliationError: hourly && reconciliationAccountResult.status === "rejected"
        ? (reconciliationAccountResult.reason instanceof Error ? reconciliationAccountResult.reason.message : String(reconciliationAccountResult.reason))
        : "",
      keyResults,
      keysError: keysResult.status === "rejected"
        ? (keysResult.reason instanceof Error ? keysResult.reason.message : String(keysResult.reason))
        : "",
      loadedAt: Date.now(),
    };
  }

  function normalizeNewApiTodayUsage(payload, statusPayload, accountPayload) {
    const rows = payload && Array.isArray(payload.data)
      ? payload.data
      : payload && payload.data && Array.isArray(payload.data.items)
        ? payload.data.items
      : Array.isArray(payload)
        ? payload
        : [];
    const status = statusPayload && statusPayload.data && typeof statusPayload.data === "object"
      ? statusPayload.data
      : statusPayload && typeof statusPayload === "object"
        ? statusPayload
        : {};
    const totals = rows.reduce((result, row) => {
      result.quota += Math.max(0, Number(row && row.quota) || 0);
      result.requests += Math.max(0, Number(row && row.count) || 0);
      result.tokens += Math.max(0, Number(row && row.token_used) || 0);
      return result;
    }, { quota: 0, requests: 0, tokens: 0 });
    const currency = status.currency && typeof status.currency === "object" ? status.currency : {};
    const displayInCurrency = (status.display_in_currency ?? status.displayInCurrency
      ?? currency.displayInCurrency) !== false;
    const quotaPerUnit = Math.max(
      1,
      Number(status.quota_per_unit ?? status.quotaPerUnit ?? currency.quotaPerUnit) || 500000,
    );
    const quotaDisplayType = String(
      status.quota_display_type ?? status.quotaDisplayType ?? currency.quotaDisplayType ?? "USD",
    ).toUpperCase();
    const symbol = quotaDisplayType === "CNY"
      ? "¥"
      : quotaDisplayType === "USD"
        ? "$"
        : String(
            status.custom_currency_symbol
            ?? status.customCurrencySymbol
            ?? currency.customCurrencySymbol
            ?? "",
          );
    const account = accountPayload && accountPayload.data && typeof accountPayload.data === "object"
      ? accountPayload.data
      : accountPayload && typeof accountPayload === "object"
        ? accountPayload
        : {};
    const balanceQuota = Math.max(0, Number(account.quota) || 0);
    return {
      balance: displayInCurrency ? balanceQuota / quotaPerUnit : balanceQuota,
      spend: displayInCurrency ? totals.quota / quotaPerUnit : totals.quota,
      requests: totals.requests,
      tokens: totals.tokens,
      symbol: displayInCurrency ? symbol : "",
    };
  }

  function todayTimestampRange(now) {
    const end = now instanceof Date ? new Date(now.getTime()) : new Date(now == null ? Date.now() : now);
    const start = new Date(end.getTime());
    start.setHours(0, 0, 0, 0);
    return {
      start: Math.floor(start.getTime() / 1000),
      // New API dashboards extend the end boundary by one hour so the
      // still-open current aggregation bucket is included.
      end: Math.floor((end.getTime() + 60 * 60 * 1000) / 1000),
    };
  }

  function formatTokenCount(value, available) {

    if (!available) return "-";
    const count = Math.max(0, Number(value) || 0);
    if (count >= 100_000_000) {
      return `${Number((count / 100_000_000).toFixed(2))}亿`;
    }
    if (count >= 1_000_000) {
      return `${Number((count / 1_000_000).toFixed(2))}M`;
    }
    return count.toLocaleString("zh-CN");
  }
