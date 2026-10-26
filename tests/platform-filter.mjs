import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL("../src/ui/search.js", import.meta.url), "utf8"), ctx);
const chosen = { textContent: "共享分组", dataset: { platform: "openai" }, checked: true };
const kimi = { textContent: "共享分组", dataset: { platform: "kimi" } };
const unknown = { textContent: "OpenAI 命名但无元数据", dataset: { platform: "unknown" } };
const list = { children: [chosen, kimi, unknown] }, status = {};
ctx.filterSelectorList(list, { value: "共享" }, status, { value: "kimi" });
assert.equal(chosen.hidden, true, "platform and search are combined without changing selected values");
assert.equal(chosen.checked, true);
assert.equal(kimi.hidden, false);
assert.equal(unknown.hidden, true);
ctx.filterSelectorList(list, { value: "" }, status, { value: "unknown" });
assert.equal(unknown.hidden, false, "unknown platform is independent of group naming");
assert.equal(chosen.hidden, true);
ctx.filterSelectorList(list, { value: "" }, status, { value: "" });
assert.equal(list.children.every(item => !item.hidden), true);
assert.equal(ctx.normalizeGroupPlatform("Zhipu GLM"), "zhipu");
assert.equal(ctx.normalizeGroupPlatform("DEEPSEEK"), "deepseek");
assert.equal(ctx.normalizeGroupPlatform("unrecognized"), "unknown");
assert.equal(ctx.normalizeGroupPlatform(""), "unknown");
assert.equal(ctx.groupPlatformFor({ id: 2, name: "OpenAI 同名" }, [{ group_id: 2, platform: "kimi" }]), "kimi", "site metadata wins over names");
assert.equal(ctx.groupPlatformFor({ name: "离线分组" }), "unknown");
assert.equal(ctx.groupPlatformFor({ id: 3 }, [], [{ groupId: 3, platform: "deepseek" }]), "deepseek");
class Option {
  constructor(text, value, platform = "") { this.textContent = text; this.value = value; this.dataset = { platform }; }
  cloneNode() { return new Option(this.textContent, this.value, this.dataset.platform); }
}
const select = { options: [new Option("不使用", "0"), new Option("同名 A", "1", "openai"), new Option("同名 B", "2", "kimi")], value: "1",
  replaceChildren(...items) { this.options = items; this.value = items[0]?.value || ""; } };
const input = { value: "" }, platform = { value: "kimi" };
ctx.refreshSearchableSelect(select, input, status, platform);
assert.deepEqual(select.options.map(o => o.value), ["0", "1", "2"], "current choice outside platform stays selectable");
assert.equal(select.value, "1");
input.value = "missing";
ctx.filterSearchableSelect(select, input, status, platform);
assert.deepEqual(select.options.map(o => o.value), ["0", "1"]);
input.value = ""; platform.value = "";
ctx.filterSearchableSelect(select, input, status, platform);
assert.deepEqual(select.options.map(o => o.value), ["0", "1", "2"]);
const listeners = {}; let calls = 0, stopped = 0;
ctx.bindPlatformFilter({ addEventListener(name, fn) { listeners[name] = fn; } }, () => calls++);
listeners.change({ stopPropagation() { stopped++; } });
assert.equal(calls, 1); assert.equal(stopped, 1, "display filter must not bubble into configuration autosave");
console.log("platform filters: metadata, combined search, retained choices and isolated events passed");
