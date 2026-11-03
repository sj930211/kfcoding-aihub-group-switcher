import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
class Element {
  constructor(tag = "div") { this.tagName = tag; this.children = []; this.dataset = {}; this.value = ""; this.textContent = ""; this.attributes = {}; this.listeners = {}; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const nodes = this.children.flatMap(child => [child, ...child.querySelectorAll("*")]);
    if (selector === "*") return nodes;
    const id = selector.match(/data-token-model-id="(\d+)"/)?.[1];
    return nodes.filter(child => id ? child.dataset.tokenModelId === id : selector.includes("data-token-model-id") ? child.dataset.tokenModelId : false);
  }
  focus() { this.focused = true; }
}
const refs = Object.fromEntries(["qualityWeightSuccess", "qualityWeightCache", "qualityWeightTps", "qualityWeightRatio", "minQualityGainDraft", "qualityWeightTotal", "qualityWeightsStatus", "qualityPreview", "qualityWeightsSave", "qualityWeightsReset", "qualityConfigWarning", "tokenModelBindings", "tokenModelStatus"].map(name => [name, new Element()]));
const writes = [], cancellations = [], recommendations = [];
const context = vm.createContext({
  console, refs, state: { candidates: [], configWarnings: [] }, root: null, running: false,
  STORAGE_CONFIG: "config", pendingCandidates: new Map([[1, { hits: 1 }]]),
  tokensCache: [{ id: 1, name: "Business", groupId: 1, group: "current" }],
  document: { createElement: tag => new Element(tag) },
  GM_setValue(key, value) { writes.push({ key, value }); },
  invalidateCheckDecisions() { cancellations.push(true); },
  refreshQualityRecommendation() { recommendations.push(true); },
  scheduleNext() { throw Error("settings edit/save must not schedule a check"); },
  fetch() { throw Error("settings edit/save must not request network"); },
  runCheck() { throw Error("settings edit/save must not start a check"); },
  setStatus() {},
});
vm.runInContext(read("src/runtime/site-config.js") + "\n" + read("src/core/config.js") + "\n" + read("src/core/selection.js") + "\n" + read("src/ui/render.js") + "\nconfig = sanitizeConfig({ tokenIds: [1], models: ['model-a', 'model-b'], tokenModels: {1:'model-a'} });", context);
assert.equal(typeof context.renderQualitySettings, "function", "quality settings must expose an editable local draft");
context.render = () => { context.renderQualitySettings(); context.renderTokenModelBindings(); };
context.renderQualitySettings();
assert.equal(refs.qualityWeightSuccess.value, "40");
assert.equal(refs.minQualityGainDraft.value, "5");
assert.equal(writes.length, 0, "initial rendering does not persist defaults again");

refs.qualityWeightSuccess.value = "35";
context.renderQualitySettings();
assert.equal(refs.qualityWeightSuccess.value, "35", "a rerender retains an unsaved weight draft");
assert.match(refs.qualityWeightTotal.textContent, /95/);
context.saveQualitySettings();
assert.equal(writes.length, 0, "an invalid total is rejected instead of normalized");
assert.match(refs.qualityWeightsStatus.textContent, /100/);
refs.qualityWeightRatio.value = "15";
refs.minQualityGainDraft.value = "7";
context.saveQualitySettings();
assert.equal(writes.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(writes[0].value.qualityWeights)), { success: 35, cache: 30, tps: 20, ratio: 15 });
assert.equal(writes[0].value.minQualityGain, 7);
assert.equal(context.pendingCandidates.size, 0, "saving a changed formula retires its old confirmations");
assert.equal(cancellations.length, 1, "in-flight decisions are canceled after a formula save");
context.saveQualitySettings();
assert.equal(writes.length, 1, "saving an unchanged formula does not write or cancel again");

const savedConfig = JSON.stringify(context.config);
context.resetQualitySettingsDraft();
refs.minQualityGainDraft.value = "101";
context.saveQualitySettings();
assert.equal(writes.length, 1, "an out of range gain threshold is rejected");
context.resetQualitySettingsDraft();
const originalRefs = context.refs;
context.refs = new Proxy(refs, { get: (target, key) => target[key] || { value: "", checked: false, querySelectorAll: () => [] } });
const unrelatedForm = context.readFormConfig();
assert.deepEqual(JSON.parse(JSON.stringify(unrelatedForm.qualityWeights)), { success: 35, cache: 30, tps: 20, ratio: 15 }, "ordinary form saves use the saved formula, not an unsaved weight draft");
assert.equal(unrelatedForm.minQualityGain, 7);
context.refs = originalRefs;
assert.equal(refs.qualityWeightSuccess.value, "40");
assert.equal(refs.minQualityGainDraft.value, "5");
assert.equal(JSON.stringify(context.config), savedConfig, "restore defaults edits only the draft until saved");
refs.qualityWeightSuccess.value = "-1";
context.saveQualitySettings();
assert.equal(writes.length, 1, "out of range values are rejected");
refs.qualityWeightSuccess.value = "40.5";
context.saveQualitySettings();
assert.equal(writes.length, 1, "fractional weights are rejected");
refs.qualityWeightSuccess.value = "";
context.saveQualitySettings();
assert.equal(writes.length, 1, "empty weight input is not silently interpreted as zero");
context.resetQualitySettingsDraft();

const candidate = (groupId, group, aggregateSuccess, cacheHitRate, tps, ratio) => ({ groupId, group, aihubMetricModel: "model-a", available: true, scopeEligible: true, aggregateSuccess, cacheHitRate, outputTokensPerSecond: tps, ratio, aihubMetricSampleCount: 100, aihubCacheSampleCount: 100 });
context.state.candidates = [candidate(1, "current", 98, 40, 50, .2), candidate(2, "fast", 99, 90, 200, 2)];
refs.qualityWeightSuccess.value = "0"; refs.qualityWeightCache.value = "0"; refs.qualityWeightTps.value = "0"; refs.qualityWeightRatio.value = "100";
context.renderQualitySettings();
assert.match(refs.qualityPreview.textContent, /fast/);
assert.match(refs.qualityPreview.textContent, /current/);
assert.match(refs.qualityPreview.textContent, /成功.*缓存.*TPS.*倍率/s, "the recommendation explains all contribution terms");
assert.equal(writes.length, 1, "preview calculation does not save or fetch");
context.config.enabled = true;
context.config.minQualityGain = 5;
context.renderQualitySettings();
context.resetQualitySettingsDraft();
refs.minQualityGainDraft.value = "100";
context.renderQualitySettings();
assert.match(refs.qualityPreview.textContent, /草稿决策：保持当前组.*100/, "the draft gain threshold can reject the same ranking winner");
assert.match(refs.qualityPreview.textContent, /排名优胜.*fast/, "a ranking winner is not presented as an automatic switch decision");
assert.match(refs.qualityPreview.textContent, /已保存决策：.*新证据/, "the saved threshold can allow confirmation without promising a switch");
assert.match(refs.qualityPreview.textContent, /已保存分项贡献：.*成功.*缓存.*TPS.*倍率/, "the comparison preserves the saved ranking winner contribution terms");
assert.match(refs.qualityPreview.textContent, /草稿分项贡献：.*成功.*缓存.*TPS.*倍率/, "the comparison also explains the draft ranking winner terms");
context.config.automaticSwitchMode = "failover";
refs.minQualityGainDraft.value = "0";
context.renderQualitySettings();
assert.match(refs.qualityPreview.textContent, /草稿决策：保持当前组.*仅故障转移/, "healthy failover mode ignores a superior ranking");
assert.doesNotMatch(refs.qualityPreview.textContent, /决策：.*需.*新证据/, "healthy failover mode must not imply optimization is pending");
context.config.automaticSwitchMode = "strategy";
const unequalRows = context.state.candidates;
context.state.candidates = [candidate(1, "current", 99, 90, 200, 2), candidate(2, "fast", 99, 90, 200, 2)];
context.renderQualitySettings();
assert.match(refs.qualityPreview.textContent, /草稿决策：保持当前组.*同分/, "a zero gain threshold cannot turn a tie into a switch");
context.state.candidates = unequalRows;
context.tokensCache[0].model_limits_enabled = true;
context.tokensCache[0].model_limits = ["model-b"];
context.renderQualitySettings();
assert.match(refs.qualityPreview.textContent, /无权限.*暂停/, "a binding outside the key model limits pauses the preview decision");
assert.doesNotMatch(refs.qualityPreview.textContent, /排名优胜/, "a key without permission receives no misleading ranking recommendation");
delete context.tokensCache[0].model_limits_enabled;
delete context.tokensCache[0].model_limits;
assert.equal(writes.length, 1, "all conditional previews remain local and do not persist settings");
const healthyCurrent = context.state.candidates[0];
context.state.candidates[0] = { ...healthyCurrent, providerId: "aihub", available: false, healthEvidence: {
  providerVersionValid: true, supported: true, monitoringActive: true, model: "model-a", modelDetectionFresh: true, modelDetectionFailed: true,
} };
context.renderQualitySettings();
assert.match(refs.qualityPreview.textContent, /明确故障.*恢复准入/, "normal optimization preview must not tell a confirmed failing key to hold as if it were merely unknown");
assert.doesNotMatch(refs.qualityPreview.textContent, /决策：保持当前组/);
context.state.candidates[0] = healthyCurrent;
context.state.candidates[1].available = false;
context.state.candidates[0].available = false;
context.renderQualitySettings();
assert.match(refs.qualityPreview.textContent, /无完整|数据不足/);

context.renderTokenModelBindings();
let select = refs.tokenModelBindings.querySelector('[data-token-model-id="1"]');
assert.ok(select);
assert.equal(select.value, "model-a");
context.persistTokenModelBinding(1, "model-b");
assert.equal(context.config.tokenModels[1], "model-b");
assert.equal(writes.length, 2);
assert.equal(cancellations.length, 2);
context.persistTokenModelBinding(99, "model-a");
assert.equal(writes.length, 2, "unselected key IDs cannot be rebound through the settings action");
context.config.models = ["model-a"];
context.renderTokenModelBindings();
select = refs.tokenModelBindings.querySelector('[data-token-model-id="1"]');
assert.equal(select.value, "model-b", "removing a catalog model retains its existing binding");
assert.match(refs.tokenModelStatus.textContent, /暂停|未启用/);
context.persistTokenModelBinding(1, "");
assert.equal(context.config.tokenModels[1] || "", "", "explicitly clearing a binding stays unbound");
assert.equal(writes.length, 3);
assert.match(refs.tokenModelStatus.textContent, /暂停|待绑定/);
context.state.configWarnings = ["已存权重损坏，已恢复默认值"];
context.renderQualitySettings();
assert.equal(refs.qualityConfigWarning.hidden, false);
assert.match(refs.qualityConfigWarning.textContent, /恢复默认/);
console.log("PASS 2.1 settings local drafts, invalid weight rejection, preview consistency and per-key model bindings (source VM, no network)");
