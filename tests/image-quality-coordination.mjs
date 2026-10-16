import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { qualityCriteria, fullQualityCriteria } from "./fixtures/image-quality.mjs";

const sandbox = { __KFCODING_GROUP_SWITCHER_TEST__: true, AbortController, DOMException, console, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync(new URL("../kfcoding-group-switcher.user.js", import.meta.url), "utf8"), sandbox);
const api = sandbox.__KFCODING_GROUP_SWITCHER_API__;
assert.equal(api.imageQualityScores(qualityCriteria())?.harmony, 20, "coordination needs its own 25-point dimension");
assert.deepEqual(JSON.parse(JSON.stringify(api.imageQualityScores(qualityCriteria()))), {
  task:20, structure:30, harmony:20, finish:15, score:85, rawScore:85, capReason:"",
});
assert.equal(api.imageQualityScores(fullQualityCriteria()).score,100);
const payload = criteria => ({status:"completed",output:[{type:"message",role:"assistant",content:[{type:"output_text",text:JSON.stringify({unable_to_assess:false,criteria,confidence:"high",reasons:["测试可见依据"]})}]}]});
const change = (key, values) => {const c=fullQualityCriteria();Object.assign(c[key],values);return c;};
for (const [key,max] of [["support",5],["pedal",10],["control",10]]) {
  assert.equal(api.imageQualityScores(change(key,{connection:"verified",score:0})),null,"verified contact cannot simultaneously be absent");
  assert.equal(api.imageQualityScores(change(key,{connection:"unclear",score:max})),null,"uncertain contact cannot be full marks");
  assert.equal(api.parseImageQualityResponse(payload(change(key,{connection:"unclear",score:max*0.4}))).confidence,"low");
  assert.equal(api.parseImageQualityResponse(payload(change(key,{connection:"occluded",score:max*0.6}))).confidence,"medium");
  const broken=api.imageQualityScores(change(key,{connection:"broken",score:max*0.2}));
  assert.equal(broken.score,69);assert.match(broken.capReason,/接触/);
  assert.equal(api.imageQualityScores(change(key,{from:""})),null);
  assert.equal(api.imageQualityScores(change(key,{connection:"toString"})),null);
  assert.equal(api.imageQualityScores(change(key,{connection:"unclear",score:0})).score,69,"a zero contact must not bypass the severe-defect ceiling");
}
assert.equal(api.imageQualityScores(change("proportion",{score:8})).score,98);
assert.equal(api.imageQualityScores(change("proportion",{score:6})).score,96);
assert.equal(api.imageQualityScores(change("proportion",{score:9})),null,"must use one of six anchors");
// Illustrative observations based on the user's comparison, not an actual AI image assessment.
const awkward=fullQualityCriteria();
Object.assign(awkward.pedal,{connection:"broken",score:2,evidence:"脚与曲柄踏板没有成立的传力连接"});
Object.assign(awkward.control,{connection:"broken",score:2,evidence:"可见翅膀未接触车把"});
awkward.proportion.score=6;awkward.posture.score=4;awkward.integration.score=3;
const coordinated=fullQualityCriteria();coordinated.proportion.score=8;coordinated.posture.score=8;
assert(api.imageQualityScores(awkward).score<api.imageQualityScores(coordinated).score);
assert.equal(api.imageQualityScores(awkward).score,69);assert.equal(api.imageQualityScores(coordinated).score,96);
const settings={imageQualityModel:"vision",imageQualityTask:"鹈鹕骑自行车"};
const key=api.imageQualityContentKey("a".repeat(32),100,settings);
assert.equal(JSON.parse(key)[0],"pelican-v3-coordination");
const entry={...api.parseImageQualityResponse(payload(qualityCriteria())),assessedAt:Date.now()};
assert.equal(Object.keys(api.normalizeImageQualityCache({[key]:entry})).length,1);
assert.equal(Object.keys(api.normalizeImageQualityCache({[key.replace("pelican-v3-coordination","pelican-v2-strict")]:entry})).length,0);
const req=api.buildImageQualityRequest({detectionMedia:{status:"successful",url:"https://aihub.top/api/v1/public/model-detection-artifacts/fixture-1"}},settings,"data:image/png;base64,iVBORw0KGgo=");
assert.equal(req.stream,true);assert(req.input[0].content[0].text.includes("整体协调25"));
assert(req.input[0].content[0].text.includes("不能把靠近"));
assert(req.input[0].content[0].text.includes("不比较分组身份"));
console.log("PASS coordination weights, six anchors, contact evidence gates, confidence, caps and old-cache isolation; illustrative observations only");
