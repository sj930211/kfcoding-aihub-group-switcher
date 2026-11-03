import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = new URL("../src/ui/search.js", import.meta.url);
const ctx = vm.createContext({});
if (fs.existsSync(source)) vm.runInContext(fs.readFileSync(source, "utf8"), ctx);
assert.equal(typeof ctx.filterSelectorList, "function", "selectors provide a local filter without removing their options");

{
  const chosen = { textContent: "主密钥 · OpenAI 日常组", dataset: {}, hidden: false, checked: true };
  const other = { textContent: "测试密钥 · Kimi 备用组", dataset: {}, hidden: false, checked: false };
  const list = { children: [chosen, other] };
  const status = {};
  ctx.filterSelectorList(list, { value: "kimi" }, status);
  assert.equal(chosen.hidden, true);
  assert.equal(chosen.checked, true, "a hidden checked option remains selected");
  assert.equal(other.hidden, false);
  assert.equal(list.children.length, 2);
  assert.equal(status.textContent, "找到 1 / 2 项");
  ctx.filterSelectorList(list, { value: "  ＯＰＥＮＡＩ  " }, status);
  assert.equal(chosen.hidden, false, "search normalizes full-width names and case");
  assert.equal(other.hidden, true);
  ctx.filterSelectorList(list, { value: "DeepSeek" }, status);
  assert.equal(status.textContent, "无匹配项（共 2 项）");
  ctx.filterSelectorList(list, { value: "" }, status);
  assert.equal(chosen.hidden, false);
  assert.equal(other.hidden, false);
}

{
  const platform = { textContent: "model-a", dataset: { searchText: "model-a 智谱 Zhipu" }, hidden: false };
  ctx.filterSelectorList({ children: [platform] }, { value: "智谱" }, {});
  assert.equal(platform.hidden, false, "platform metadata participates in model search");
}

class Option {
  constructor(text, value) { this.textContent = text; this.value = value; }
  cloneNode() { return new Option(this.textContent, this.value); }
}
{
  const select = {
    options: [new Option("自动选择", "0"), new Option("OpenAI 常用", "1"), new Option("Kimi 备用", "2")],
    value: "1",
    replaceChildren(...options) { this.options = options; this.value = options[0]?.value || ""; },
  };
  const input = { value: "kimi" }, status = {};
  ctx.refreshSearchableSelect(select, input, status);
  assert.deepEqual(select.options.map(o => o.value), ["0", "1", "2"]);
  assert.equal(select.value, "1", "search never changes the configured choice");
  input.value = "missing";
  ctx.filterSearchableSelect(select, input, status);
  assert.deepEqual(select.options.map(o => o.value), ["0", "1"]);
  assert.equal(status.textContent, "无匹配项；保留当前选择");
  input.value = "";
  ctx.filterSearchableSelect(select, input, status);
  assert.deepEqual(select.options.map(o => o.value), ["0", "1", "2"]);
  select.value = "2";
  input.value = "openai";
  ctx.filterSearchableSelect(select, input, status);
  assert.equal(select.value, "2", "later selections also survive filtering");
}

{
  const listeners = new Map();
  const input = { value: "needle", addEventListener: (name, fn) => listeners.set(name, fn) };
  let filters = 0, focused = 0, stopped = 0;
  ctx.bindSelectorSearch(input, () => { filters++; }, { focus: () => { focused++; } });
  listeners.get("input")();
  assert.equal(filters, 1);
  listeners.get("change")({ stopPropagation() { stopped++; } });
  assert.equal(stopped, 1, "search change does not bubble into autosave");
  listeners.get("keydown")({ key: "Escape", preventDefault() {}, stopPropagation() { stopped++; } });
  assert.equal(input.value, "");
  assert.equal(filters, 2);
  listeners.get("keydown")({ key: "ArrowDown", preventDefault() {} });
  assert.equal(focused, 1);
}

{
  const refs = new Proxy({ automaticSwitchMode: { value: "failover" } }, {
    get(target, key) { return target[key] || { value: "", checked: false, querySelectorAll: () => [] }; },
  });
  const form = vm.createContext({ refs, config: {}, IS_AIHUB: true, sanitizeConfig: value => value });
  vm.runInContext(fs.readFileSync(new URL("../src/ui/render.js", import.meta.url), "utf8"), form);
  const result = form.readFormConfig();
  assert.equal(result.automaticSwitchMode, "failover", "form persistence keeps the chosen automatic mode independent from the ranking strategy");
  assert.equal(result.selectionMode, "quality", "form persistence uses the sole 1h quality algorithm");
}

{
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.hidden = false; this.copy = ""; }
    set textContent(value) { this.copy = value; }
    get textContent() { return this.copy + this.children.map(child => child.textContent).join(""); }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
    querySelectorAll(selector) {
      const key = selector.includes("data-token-id") ? "tokenId" : "modelName";
      const result = [];
      const visit = element => {
        if (element.dataset[key] && (!selector.includes(":checked") || element.checked)) result.push(element);
        element.children.forEach(visit);
      };
      this.children.forEach(visit);
      return result;
    }
  }
  const refs = { tokenList: new Element(), modelList: new Element(), tokenCount: {}, tokenSelectLabel: {}, modelCount: {}, modelSelectLabel: {},
    tokenSearch: { value: "Kimi" }, tokenSearchStatus: {}, modelSearch: { value: "智谱" }, modelSearchStatus: {} };
  const app = vm.createContext({ refs, document: { createElement: () => new Element() },
    config: { tokenIds: [1], models: ["model-a"] }, targetModels: value => value.models,
    tokensCache: [{ id: 1, name: "主密钥", group: "OpenAI" }, { id: 2, name: "备用密钥", group: "Kimi" }],
    pricingCache: { data: [{ model_name: "model-a", platforms: ["OpenAI"] }, { model_name: "model-b", platforms: ["智谱"] }] },
  });
  vm.runInContext(fs.readFileSync(source, "utf8"), app);
  vm.runInContext(fs.readFileSync(new URL("../src/runtime/operations.js", import.meta.url), "utf8"), app);
  vm.runInContext("renderGroupFilterOptions = () => {}; renderTokenModelBindings = () => {};", app);
  app.renderOptions();
  assert.equal(refs.modelList.children[0].hidden, true, "model filtering uses platform labels from the catalog");
  assert.equal(refs.modelList.children[1].hidden, false);
  assert.match(refs.modelList.children[1].textContent, /智谱/);
  assert.equal(refs.tokenList.children[0].hidden, true);
  assert.equal(refs.tokenList.children[0].children[0].checked, true);
  assert.equal(refs.tokenCount.textContent, "已选 1/2", "filtered choices do not change the full-list count");
  app.renderOptions(true);
  assert.equal(refs.modelList.children[0].children[0].checked, true, "refresh preserves hidden checked models");
}

console.log("selector search: local matching, retained choices, keyboard behavior and automatic mode passed");
