// All model/group operations below are simulated in memory.
const v2Params = new URLSearchParams(location.search);
const v2ConfigKey = "aihub-group-switcher:config:v1";
const v2Saved = v2Params.has("persist") ? sessionStorage.getItem("aihub-v2-fixture-config") : null;
values.set(v2ConfigKey, v2Saved ? JSON.parse(v2Saved) : {
  enabled: false, theme: v2Params.get("theme") || "dark", tokenIds: [1],
  models: v2Params.has("single") ? ["deepseek-v3.2"] : ["gpt-6.1-sol", "deepseek-v3.2"], selectionMode: "quality", automaticSwitchMode: "failover",
  monitorScopeMode: v2Params.has("selected") ? "selected" : "all", monitorGroupIds: v2Params.has("selected") ? [2, 3] : [],
  pollSeconds: 30, strategySeconds: 300, minSuccessRate: 95, minMetricSamples: 10, minCacheSamples: 10,
  rollbackChecks: v2Params.has("observe") ? 2 : 0, switchHoldMinutes: 0,
});
values.set("aihub-group-switcher:ui:v1", { activeView: "monitor", settingsPage: "routing" });
window.v2Evidence = { requests: [], configWrites: 0, modelCalls: 0, groupWrites: [], current: 1, fail: false, slow: false };
const v2BaseSet = window.GM_setValue;
window.GM_setValue = (key, value) => {
  if (key === v2ConfigKey) {
    v2Evidence.configWrites++;
    v2Evidence.config = structuredClone(value);
    if (v2Params.has("persist")) sessionStorage.setItem("aihub-v2-fixture-config", JSON.stringify(value));
  }
  v2BaseSet(key, value);
};
window.GM_xmlhttpRequest = ({ onerror }) => {
  v2Evidence.requests.push({ path: "blocked-update-check", method: "GET" });
  onerror?.({ error: "模拟环境不访问远端更新" });
};
const v2Platforms = ["openai", "deepseek", "zhipu", "kimi", "grok", "unknown"];
const v2Groups = Array.from({ length: 24 }, (_, index) => ({
  id: index + 1, name: (index < 5 ? "OpenAI" : v2Platforms[index % 6]) + "-" + String(index + 1).padStart(2, "0") + (index === 3 ? "-高并发长名称模型专线" : ""),
  platform: index < 5 ? "openai" : v2Platforms[index % 6], rate_multiplier: .1 + index * .025,
  models: index % 3 ? ["gpt-6.1-sol"] : ["gpt-6.1-sol", "deepseek-v3.2"],
}));
const v2Key = (id) => ({ id, name: "模拟业务密钥 " + id, status: "active", group_id: id === 1 ? v2Evidence.current : 2,
  group: v2Groups.find((group) => group.id === (id === 1 ? v2Evidence.current : 2)) });
const v2Json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
const v2BaseFetch = window.fetch;
window.fetch = async (input, options = {}) => {
  const url = new URL(String(input), location.origin);
  const method = String(options.method || "GET").toUpperCase();
  v2Evidence.requests.push({ path: url.pathname, method });
  if (url.pathname === "/v1/responses" || url.pathname === "/v1/chat/completions") {
    v2Evidence.modelCalls++; return v2Json({ message: "模型请求被本地夹具阻止" }, 403);
  }
  if (v2Evidence.fail && /^\/api\/v[12]\/public\/(?:providers|monitor)(?:\/|$)/.test(url.pathname)) {
    return v2Json({ message: "模拟监控刷新失败" }, 503);
  }
  if (url.pathname === "/api/v1/keys") return v2Json({ items: [v2Key(1), v2Key(2)], total: 2, page: 1, page_size: 100 });
  const key = url.pathname.match(/^\/api\/v1\/keys\/(\d+)$/);
  if (key) {
    const id = Number(key[1]);
    if (method === "PUT") {
      const groupId = Number(JSON.parse(options.body).group_id);
      v2Evidence.groupWrites.push({ id, groupId });
      if (id === 1) v2Evidence.current = groupId;
    }
    return v2Json(v2Key(id));
  }
  if (url.pathname === "/api/v1/groups/available") return v2Json(v2Groups);
  if (url.pathname === "/api/v1/groups/rates") return v2Json(Object.fromEntries(v2Groups.map((group) => [group.id, group.rate_multiplier])));
  if (/^\/api\/v[12]\/public\/providers$/.test(url.pathname)) {
    if (v2Evidence.slow) await new Promise((resolve) => setTimeout(resolve, 800));
    const now = new Date();
    const fresh = new Date(v2Evidence.publicationAt || now).toISOString();
    return v2Json({ version: 2, summary_range: "1h", generated_at: fresh, platform_tabs: v2Platforms, items: v2Groups.map((group, index) => {
      const model = index % 6 === 5 ? "other-model" : index % 3 === 0 ? "deepseek-v3.2" : "gpt-6.1-sol";
      const status = Number(v2Evidence.badTargetId) === group.id || index % 6 === 3 ? "failed" : index % 6 === 4 ? "pending" : "passed";
      const cacheTime = index % 6 === 2 ? new Date(now.getTime() - 70 * 60000).toISOString() : fresh;
      const item = {
        group_id: group.id, code: group.name, platform: group.platform, rate_multiplier: group.rate_multiplier, summary_range: "1h",
        group_models: group.models.map((name) => ({ model: name })), enabled: true, available: true, last_probed_at: fresh,
        summary_models: { [model]: { success_rate: .96 + (index % 5) * .009, tps: 10 + index * 3, sample_count: 50 + index,
          range_cache: { cache_hit_rate: .25 + (index % 7) * .1, ready: true, stale: false, refreshed_at: cacheTime, usage_records: 35 } } },
        model_detection: { applicable: true, model, status, refreshing: status === "pending", execution_complete: status !== "pending", presentation: { text: { result: status === "passed" } },
          detected_at: fresh, expires_at: new Date(now.getTime() + 3600000).toISOString(), stage_enabled: { text: true, image: false },
          stages: { text: { published_state: status === "passed" ? "completed" : status, state: status === "passed" ? "completed" : status }, image: { published_state: "disabled", state: "disabled" } } },
      };
      if (v2Evidence.emergencyOnly && group.id !== v2Evidence.current) {
        item.summary_models[model].tps = null;
        item.summary_models[model].range_cache = null;
      }
      return { ...item, ...(v2Evidence.providerOverrides?.[group.id] || {}) };
    }) });
  }
  if (/^\/api\/v[12]\/public\/providers\/series$/.test(url.pathname)) return v2Json({ items: [] });
  // ui-preview owns local mock account/usage responses; it never delegates to native fetch.
  return v2BaseFetch(input, options);
};
