import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../kfcoding-group-switcher.user.js", import.meta.url), "utf8");
for (const retired of ["imageQuality", "ImageQuality", "ImageAdmission", "/v1/responses", "withImageQualityKeyLock", "createImageQualityScore"]) {
  assert.equal(source.includes(retired), false, "retired runtime must not contain " + retired);
}
assert.deepEqual([...source.matchAll(/^\/\/ @match\s+(.*)$/gm)].map(match => match[1]), ["https://aihub.top/*"]);
for (const hostname of ["kfcoding.codes", "ooioo.work", "fluxionai.space", "example.test"]) {
  let storageReads = 0, requests = 0;
  const context = { location: { hostname }, GM_getValue: () => { storageReads++; throw Error("storage access forbidden"); }, fetch: () => { requests++; throw Error("network forbidden"); } };
  vm.runInNewContext(source, context);
  assert.equal(storageReads, 0, hostname + " legacy storage remains untouched");
  assert.equal(requests, 0, hostname + " cannot start network work");
}
const context = { __KFCODING_GROUP_SWITCHER_TEST__: true };
vm.runInNewContext(source, context);
const api = context.__KFCODING_GROUP_SWITCHER_API__;
const migrated = api.sanitizeConfig({ tokenIds: [1, 2], models: ["fixture"], theme: "dark", imageQualityKeyId: 9, imageQualityModel: "retired", imageQualityMinScore: 99 });
assert.deepEqual(Array.from(migrated.tokenIds), [1,2]);
assert.deepEqual(Array.from(migrated.models), ["fixture"]);
assert.equal(migrated.theme, "dark");
assert.equal(Object.keys(migrated).some(key => key.startsWith("imageQuality")), false);
console.log("PASS image inference retirement, AIHub-only runtime isolation and non-destructive settings migration");
