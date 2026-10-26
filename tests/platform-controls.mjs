import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../src/ui/mount.js", import.meta.url), "utf8");
const platformRefs = [
  "candidatePlatform", "groupFilterPlatform", "manualGroupPlatform",
  "imageQualityFallback1Platform", "imageQualityFallback2Platform",
];

function mountedTemplate(isAihub) {
  const shadow = { innerHTML: "", querySelector: () => ({}) };
  const ctx = vm.createContext({
    document: {
      getElementById: () => null,
      createElement: () => ({ attachShadow: () => shadow }),
      documentElement: { appendChild() {} },
    },
    HOST_ID: "test-host", root: null, refs: {}, IS_AIHUB: isAihub,
    SITE_LABEL: isAihub ? "AIHub" : "KFCoding", SITE_SHORT_LABEL: "KF", SCRIPT_VERSION: "1.0.0",
    applyTheme() {}, syncForm() {}, renderOptions() {}, bindUi() {}, render() {},
  });
  vm.runInContext(source, ctx);
  ctx.mountUi();
  return { html: shadow.innerHTML, refs: ctx.refs };
}

for (const isAihub of [true, false]) {
  const { html, refs } = mountedTemplate(isAihub);
  for (const name of platformRefs) {
    const select = html.match(new RegExp(String.raw`<select\b([^>]*data-ref="${name}"[^>]*)>([\s\S]*?)<\/select>`));
    assert.ok(select, `${name} has a native select control`);
    assert.match(select[1], /aria-label="[^"]+平台[^"]*"/, `${name} has an accessible platform label`);
    assert.match(select[2], /^\s*<option value="">全部平台<\/option>\s*$/, `${name} starts with all platforms only; runtime supplies platform options`);
    assert.equal(/(?:^|\s)hidden(?:\s|$)/.test(select[1]), !isAihub, `${name} is visible only for AIHub`);
    assert.ok(Object.hasOwn(refs, name), `${name} is included in the mounted refs contract`);
    assert.doesNotMatch(select[1], /\bon(?:change|input)=/, `${name} has no inline side effects`);
  }
  const search = html.match(/<input\b([^>]*data-ref="candidateSearch"[^>]*)>/);
  assert.ok(search, "monitoring list has its own search control");
  assert.match(search[1], /type="search"/);
  assert.match(search[1], /aria-label="搜索监控分组"/);
  assert.equal(/(?:^|\s)hidden(?:\s|$)/.test(search[1]), !isAihub);
  assert.match(html, /<p[^>]*data-ref="candidateSearchStatus"[^>]*role="status"/);
  assert.ok(Object.hasOwn(refs, "candidateSearch"));
  assert.ok(Object.hasOwn(refs, "candidateSearchStatus"));
}

console.log("platform controls: AIHub-only selects, all-platform defaults, accessible search and refs passed");
