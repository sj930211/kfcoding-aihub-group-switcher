import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const mountSource = fs.readFileSync(new URL("../src/ui/mount.js", import.meta.url), "utf8");
const renderSource = fs.readFileSync(new URL("../src/ui/render.js", import.meta.url), "utf8");
const shadow = { innerHTML: "", querySelector: () => ({}) };
let mountedInBody = false;
const context = vm.createContext({
  document: {
    getElementById: () => null,
    createElement: () => ({ attachShadow: () => shadow }),
    body: { appendChild() { mountedInBody = true; } },
    documentElement: { appendChild() {} },
  },
  HOST_ID: "aihub-v2-test", root: null, refs: {}, IS_AIHUB: true,
  SITE_LABEL: "AIHub", SITE_SHORT_LABEL: "AI", SCRIPT_VERSION: "2.0.0",
  applyTheme() {}, syncForm() {}, renderOptions() {}, bindUi() {}, render() {},
});
vm.runInContext(mountSource, context);
context.mountUi();
assert.equal(mountedInBody, true, "mount in body so the workspace is available to browser accessibility and keyboard tools");

const { innerHTML: html } = shadow;
const { refs } = context;
for (const name of [
  "monitorScopeMode", "monitorScopeSearch", "monitorScopeList", "monitorScopeCount",
  "monitorScopeSave", "monitorScopeSelectAll", "monitorScopeClear", "monitorScopeStatus",
  "candidateSearch", "candidateSort", "candidateStatus", "candidateAvailabilityFilter", "currentScopeWarning",
  "removeOutOfScopeToken", "manualScopeDialog", "manualScopeAdd", "manualScopeOnce",
  "manualScopeCancel", "manualScopeTitle", "manualScopeTarget", "manualScopeRisk", "manualScopeHint", "candidateRows",
]) {
  assert.ok(Object.hasOwn(refs, name), `${name} is exposed in the mounted ref contract`);
}

for (const label of ["1h 成功率", "1h 缓存命中", "1h TPS", "模型检测详情"]) {
  assert.ok(html.includes(label), `monitor view exposes ${label}`);
}
// The approved HTML is a workspace with independent navigation/content, not the legacy stacked panel.
assert.ok(/AIHub 分组工作台/.test(html), "the shell identifies itself as a workspace");
assert.ok(/<nav[^>]*aria-orientation="vertical"/.test(html), "desktop navigation exposes its vertical orientation");
assert.ok(/运行概览/.test(html), "the monitor page has its own visible heading");
assert.ok(/按.*检测详情.*1h/.test(html), "the page explains the model-specific monitoring context");
// Small labels need the normal-text AA threshold even when bold.
const lightTheme = html.match(/:host\(\[data-resolved-theme="light"\]\)\s*\{([^}]+)\}/)[1];
const token = (name) => lightTheme.match(new RegExp("--" + name + ":\\s*([^;]+)"))[1].trim();
const rgb = (hex) => hex.slice(1).match(/../g).map((part) => parseInt(part, 16));
const blend = (fg, bg, opacity) => fg.map((v, i) => v * opacity + bg[i] * (1 - opacity));
const luminance = (color) => color.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const navRule = [...html.matchAll(/\.nav-count\s*\{([^}]+)\}/g)].at(-1)[1];
const navOpacity = Number(navRule.match(/opacity:\s*([.\d]+)/)?.[1] ?? 1);
const navBackground = rgb(token("accent-soft"));
assert.ok(contrast(rgb(token("accent")), navBackground) >= 4.5, "selected navigation text meets AA contrast");
assert.ok(contrast(blend(rgb(token("accent")), navBackground, navOpacity), navBackground) >= 4.5, "small selected navigation count meets AA contrast");
const healthyBackground = token("healthy-soft").match(/rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/).slice(1).map(Number);
for (const surface of ["surface", "surface-raised", "accent-soft"]) {
  assert.ok(contrast(rgb(token("healthy")), blend(healthyBackground.slice(0, 3), rgb(token(surface)), healthyBackground[3] / 100)) >= 4.5, "small health badge meets AA on " + surface);
}
for (const label of ["图片评价", "省钱优先", "稳定优先", "均衡推荐"]) {
  assert.ok(!html.includes(label), `legacy control ${label} is absent from the UI`);
}
assert.match(html, /aria-label="搜索监控范围分组"/);
assert.match(html, /aria-label="分组列表排序"/);
assert.match(html, /aria-label="检测状态筛选"/);
assert.match(html, /data-manual-scope="add"/);
assert.match(html, /data-manual-scope="once"/);
assert.match(html, /data-manual-scope="cancel"/);
assert.match(renderSource, /monitorScopeMode/);
assert.match(renderSource, /monitorGroupIds/);
assert.match(renderSource, /candidateSort/);
assert.doesNotMatch(renderSource, /imageQuality|selectionModeLabel/);
assert.doesNotMatch(mountSource, /image-quality|candidate-image-score|detection-image-quality/);
assert.match(renderSource, /refs.panel.dataset.fullscreen === "true"/);
assert.ok(renderSource.includes("refs.fullscreen.focus("));

console.log("AIHub 2.0 UI contract tests passed");
