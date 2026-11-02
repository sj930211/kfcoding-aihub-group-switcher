import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

class Element {
  constructor(tag = "div") { this.tagName = tag; this.children = []; this.dataset = {}; this.value = ""; this.textContent = ""; this.className = ""; this.listeners = {}; this.classList = { contains: (name) => this.className.split(/\s+/).includes(name) }; }
  append(...elements) { elements.forEach((element) => this.appendChild(element)); }
  appendChild(element) { this.children = this.children.filter((child) => child !== element); this.children.push(element); return element; }
  replaceChildren(...elements) { this.children = [...elements]; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  querySelector(selector) {
    const id = selector.match(/data-monitor-group-id="(\d+)"/)?.[1];
    return this.children.flatMap((child) => [child, ...child.children]).find((child) => child.dataset.monitorGroupId === id) || null;
  }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
}
const read = (name) => fs.readFileSync(new URL("../src/ui/" + name + ".js", import.meta.url), "utf8");
const migrationContext = vm.createContext({
  config: {monitorScopeMode: "selected", monitorGroupIds: [], monitorScopeMigrationPending: true, monitorScopeMigrationPlatform: "kimi"},
  refs: new Proxy({}, {get: () => ({value: "", checked: false, querySelectorAll: () => []})}),
  sanitizeConfig: (value) => value,
});
vm.runInContext(read("render"), migrationContext);
const pendingMigrationForm = migrationContext.readFormConfig();
assert.equal(pendingMigrationForm.monitorScopeMigrationPending, true, "ordinary form changes preserve pending scope migration");
assert.equal(pendingMigrationForm.monitorScopeMigrationPlatform, "kimi");
const refs = Object.fromEntries(["candidateRows", "candidateSearch", "candidatePlatform", "candidateSort", "candidateStatus", "candidateAvailabilityFilter", "candidateSearchStatus", "candidateResetFilters", "manualScopeDialog", "manualScopeCancel", "manualScopeTitle", "manualScopeTarget", "manualScopeRisk", "manualScopeHint", "manualScopeAdd", "manualScopeOnce", "monitorScopeList", "monitorScopeMode", "monitorScopeCount", "monitorScopeCountDetail", "monitorScopeSelectAll", "monitorScopeClear", "monitorScopeSave", "monitorScopeStatus", "monitorScopeSearch", "monitorScopeSearchStatus"].map((name) => [name, new Element()]));
const config = { monitorScopeMode: "selected", monitorGroupIds: [2], tokenIds: [1], models: ["gpt-demo"], businessPlatform: "kimi" };
const manualCalls = [];
const context = vm.createContext({
  refs, config, state: {}, running: false, root: null,
  aihubGroupsCache: [{ id: 1, name: "OpenAI One" }, { id: 2, name: "Kimi Two", platform: "kimi", models: ["kimi-demo"] }],
  aihubPlatformMonitorsCache: [{ group_id: 1, platform: "openai", group_models: ["gpt-demo"] }],
  aihubGroupModelNames(monitor) { return Array.isArray(monitor?.group_models) ? monitor.group_models : null; },
  document: { createElement: (tag) => new Element(tag) },
  manualSwitchToGroup(candidate, action) { manualCalls.push({ candidate, action }); },
  monitorGroupInScope(current, id) { return current.monitorScopeMode !== "selected" || current.monitorGroupIds.includes(Number(id)); },
  candidateIssueText(candidate) { return candidate.issue || ""; },
});
vm.runInContext(read("search") + "\n" + read("render"), context);
const row = (id, platform, available, status, ratio, success, cache, tps, score) => {
  const element = new Element();
  element.dataset = { groupId: String(id), platform, available: String(available), status, ratio: String(ratio), success: String(success), cache: String(cache), tps: String(tps), score: String(score), searchText: "group " + id + " gpt-demo" };
  return element;
};
const a = row(1, "openai", true, "pass", 3, 99, 50, 20, 70);
const b = row(2, "kimi", false, "fail", 1, 95, 60, 30, 40);
const c = row(3, "openai", false, "unknown", "", "", "", "", "");
refs.candidateRows.replaceChildren(a, b, c);
const before = JSON.stringify(config);
refs.candidateSort.value = "ratio"; context.applyCandidateDisplayControls();
assert.deepEqual(refs.candidateRows.children.map((entry) => entry.dataset.groupId), ["2", "1", "3"], "ratio sorts ascending with missing values last");
refs.candidateSort.value = "success"; context.applyCandidateDisplayControls();
assert.deepEqual(refs.candidateRows.children.map((entry) => entry.dataset.groupId), ["1", "2", "3"], "success sorts descending with missing values last");
refs.candidatePlatform.value = "openai"; refs.candidateStatus.value = "pass"; context.applyCandidateDisplayControls();
assert.equal(a.hidden, false); assert.equal(b.hidden, true); assert.equal(c.hidden, true);
refs.candidateStatus.value = ""; refs.candidateAvailabilityFilter.value = "unavailable"; context.applyCandidateDisplayControls();
assert.equal(a.hidden, true); assert.equal(c.hidden, false);
refs.candidateSearch.value = "no such group"; context.applyCandidateDisplayControls();
assert.equal(refs.candidateRows.children.every((entry) => entry.hidden), true);
assert.equal(refs.candidateResetFilters.hidden, false, "empty filter result provides a reset action");
assert.equal(JSON.stringify(config), before, "display controls never change monitor scope or algorithm configuration");
refs.candidateSort.value = "quality"; a.dataset.model = "a"; b.dataset.model = "b"; b.dataset.score = "100"; a.dataset.score = "20";
context.applyCandidateDisplayControls();
assert.ok(refs.candidateRows.children.indexOf(a) < refs.candidateRows.children.indexOf(b), "quality ordering groups independent models before comparing relative scores");
context.renderMonitorScope();
assert.equal(refs.monitorScopeList.children.length, 2);
const byId = (id) => refs.monitorScopeList.children.find((entry) => entry.children[0].dataset.monitorGroupId === String(id));
assert.equal(byId(1).children[0].checked, false);
assert.equal(byId(2).children[0].checked, true);
refs.monitorScopeSearch.value = "1"; context.renderMonitorScope();
assert.equal(byId(1).hidden, false, "scope search supports ID text");
assert.equal(byId(2).hidden, true);
refs.monitorScopeSearch.value = "gpt-demo"; context.renderMonitorScope();
assert.equal(byId(1).hidden, false, "scope model search uses public model catalog when groups response lacks models");
assert.equal(byId(2).hidden, true);
assert.equal(JSON.stringify(config), before, "editing or searching scope does not persist automatically");
refs.monitorScopeSearch.value = "";
const focusedGroup = byId(2).children[0];
context.root = { activeElement: focusedGroup };
vm.runInContext("monitorScopeDraftIds.add(1)", context);
context.renderMonitorScope();
assert.equal(byId(2).children[0].focused, true, "scope list redraw preserves the active checkbox for keyboard navigation");
context.running = true; context.renderMonitorScope();
assert.equal(byId(2).children[0].disabled, true, "scope controls become disabled when a check starts");
context.running = false; context.renderMonitorScope();
assert.equal(byId(2).children[0].disabled, false, "scope controls are restored when a check ends");
context.root = null;
context.requestManualSwitch({ groupId: 2, group: "Kimi Two", available: true });
assert.equal(manualCalls.length, 1); assert.equal(manualCalls[0].action, "once");
context.requestManualSwitch({ groupId: 2, group: "Kimi Two", available: false, issue: "检测详情失败" });
assert.equal(manualCalls.length, 1, "in-scope failed target waits for explicit risk confirmation");
assert.match(refs.manualScopeRisk.textContent, /检测详情失败/);
assert.equal(refs.manualScopeAdd.hidden, true, "already monitored target cannot be redundantly added");
context.requestManualSwitch({ groupId: 1, group: "OpenAI One" });
assert.equal(manualCalls.length, 1, "out of scope manual target waits for explicit decision");
assert.equal(refs.manualScopeDialog.open, true); assert.equal(refs.manualScopeCancel.focused, true);
assert.match(refs.manualScopeTarget.textContent, /OpenAI One/);
assert.match(refs.manualScopeRisk.textContent, /尚未/);
assert.equal(refs.manualScopeAdd.hidden, false, "out of scope target can be added to monitoring");
assert.equal(JSON.stringify(config), before);
console.log("AIHub 2.0 UI behavior tests passed");
