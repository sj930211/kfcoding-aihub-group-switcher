import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { qualityCriteria, fullQualityCriteria } from './fixtures/image-quality.mjs';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const test = { __KFCODING_GROUP_SWITCHER_TEST__: true, AbortController, DOMException, console, setTimeout, clearTimeout };
vm.runInNewContext(read('kfcoding-group-switcher.user.js'), test);
const api = test.__KFCODING_GROUP_SWITCHER_API__;
const entry = (criteria = qualityCriteria(), confidence = 'high') => ({ ...api.imageQualityScores(criteria), criteria, confidence, reasons: ['模拟可见依据'], assessedAt: Date.now() });
assert.equal(api.sanitizeConfig({}).imageQualityMinScore, 80);
assert.equal(api.sanitizeConfig({ imageQualityMinScore: -1 }).imageQualityMinScore, 0);
assert.equal(api.sanitizeConfig({ imageQualityMinScore: 200 }).imageQualityMinScore, 100);
for (const [value, minimum, pass] of [[entry(),84,true],[entry(),85,false],[entry(),86,false],[entry(fullQualityCriteria()),100,false],[entry(qualityCriteria(),'low'),80,false],[null,0,false],[{score:100},80,false]]) {
  assert.equal(api.imageQualityAdmissionVerdict(value,minimum).pass,pass);
}
const rows = ['A','B','C'].map((group,i) => ({group,groupId:i+1,available:true,reasons:[],warnings:[],ratio:i+1,providerId:'aihub',effectiveRatioReady:true,effectiveRatio:i+1,
  recentMinSuccess:100-i,aggregateSuccess:100,firstTokenLatencyMs:1000,outputLatencyMs:1000,cacheHitRate:90,
  detectionMedia:{status:'successful',url:'https://aihub.top/api/v1/public/model-detection-artifacts/'+group}}));
for (const mode of ['saving','stable','balanced']) {
  assert.deepEqual(Array.from(api.sortRowsWithImageQuality(rows,mode,()=>{throw Error('score must never be read for sorting');}),r=>r.group),
    Array.from(api.sortCandidateRowsForMode(rows,mode),r=>r.group));
  const rejected = [], checked = [];
  const chosen = await api.selectImageQualifiedCandidate(rows,'outside',{mode,preferred:rows[0],assertCurrent(){},eligible:rs=>rs,
    async check(row){checked.push(row.group);return {pass:row.group==='C',reason:'fixture'};},isolate(row){rejected.push(row.group);}});
  assert.equal(chosen.group,'C');assert.deepEqual(checked,['A','B','C']);assert.deepEqual(rejected,['A','B']);
}
let paid=0;
const kept = await api.selectImageQualifiedCandidate(rows,'A',{mode:'saving',assertCurrent(){},eligible:rs=>rs,async check(){paid++;},isolate(){}});
assert.equal(kept.group,'A');assert.equal(paid,0);

// Exercise actual processToken / rollback / image gate orchestration with deterministic boundaries.
function runtime(overrides = {}) {
  const storage = {}, switched = [], checked = [], isolated = [];
  const ctx = { console, AbortController, DOMException, setTimeout, clearTimeout, Date, Map, Set, Promise,
    IS_AIHUB:true,IS_AIHUB_API:true,config:api.sanitizeConfig({enabled:true,tokenIds:[1],models:['fixture'],confirmPolls:1,switchHoldMinutes:0,rollbackChecks:0,imageQualityKeyId:1,imageQualityModel:'fixture-vision',...overrides}),
    state:{candidates:rows.map(row=>({...row})),logs:[]},imageQuality:{cancelRevision:0,catalogRevision:1,catalogAt:1},pendingCandidates:new Map(),
    STORAGE_IMAGE_QUALITY_CATALOG_AT:'catalog-at',STORAGE_SWITCH_GUARD:'guard',STORAGE_LAST_SWITCH:'history',STORAGE_LOGS:'logs',MAX_LOG_ENTRIES:50,
    GM_getValue:(key,fallback)=>storage[key]??fallback,GM_setValue:(key,value)=>storage[key]=value,
    render(){},formatRatio:value=>String(value),refs:{},
    ...Object.fromEntries(['targetModelIdentity','targetModels','normalizeSwitchHistory','switchHoldState','normalizeSwitchGuardState','pruneSwitchGuardState','applyTemporaryBlacklist','selectRollbackCandidate','selectSwitchCandidate','selectBestCandidate','selectImageQualifiedCandidate','imageQualityAdmissionVerdict','shouldSwitchCandidate','shouldKeepCurrentDuringHold','candidateHasHealthFailure','candidateRecommendationLabel','tokenSupportsModel'].map(name=>[name,api[name]])),
    validImageQuality:value=>!!api.imageQualityAdmissionVerdict(value,-1).pass,
    imageQualityEnabled:settings=>settings.imageQualityKeyId>0&&!!settings.imageQualityModel,
    imageQualityIdentity:api.imageQualityIdentity,
    syncImageQualityStore(){},candidateImageQuality:row=>ctx.scores[row.group]||null,
    scores:{},runImageQuality:async({candidate,budget})=>{checked.push(candidate.group);if(budget.remaining<=0)throw Object.assign(Error('cap'),{code:'IMAGE_ADMISSION_BUDGET'});budget.remaining--;ctx.scores[candidate.group]=entry();},
    summarizeFailures:()=>'',
  };
  vm.createContext(ctx);vm.runInContext(read('src/runtime/operations.js'),ctx);
  vm.runInContext(`setStatus=()=>{};globalThis.process=processToken;globalThis.context=createImageAdmissionContext;globalThis.guard=getSwitchGuardState;
    switchTokenGroup=async(token,candidate)=>{globalThis.onSwitch(token,candidate);};
    getTokenDetail=async id=>({id,group:globalThis.actualGroup??'outside',status:'active'});
    const originalIsolation=isolateImageCandidate;isolateImageCandidate=(row,reason)=>{globalThis.onIsolate(row,reason);originalIsolation(row,reason);};`,ctx);
  ctx.onSwitch=(token,candidate)=>switched.push(candidate.group);ctx.onIsolate=(row,reason)=>isolated.push([row.group,reason]);
  ctx.token={id:1,group:'outside',status:'active'};
  return {ctx,storage,switched,checked,isolated};
}
{
  const {ctx,switched,checked,isolated}=runtime();ctx.scores.A=entry();
  assert.equal((await ctx.process(ctx.token,rows,{})).outcome,'switched');assert.deepEqual(switched,['A']);assert.deepEqual(checked,[]);assert.equal(isolated.length,0);
}
{
  const {ctx,checked,switched}=runtime();await ctx.process(ctx.token,rows,{});assert.deepEqual(checked,['A']);assert.deepEqual(switched,['A']);
}
{
  const {ctx,isolated,switched,storage}=runtime({blacklistMinutes:7});ctx.scores.A=entry(qualityCriteria(),'low');ctx.scores.B=entry();
  const before=Date.now();await ctx.process(ctx.token,rows,{});assert.deepEqual(switched,['B']);assert.equal(isolated[0][0],'A');
  assert.equal(storage.guard.blacklist[0].model,'fixture');assert.ok(storage.guard.blacklist[0].until>=before+7*60000);
  await ctx.process({...ctx.token,id:2},rows,{});assert.deepEqual(switched,['B','B']);assert.equal(isolated.length,1,'later tokens skip a newly isolated candidate');
  storage.guard.blacklist[0].until=Date.now()-1;ctx.scores.A=entry();await ctx.process(ctx.token,rows,{});assert.equal(switched.at(-1),'A','expired isolation participates again');
}
{
  const {ctx,isolated,switched}=runtime({imageQualityMinScore:85});ctx.scores.A=entry();ctx.scores.B=entry(fullQualityCriteria());
  await ctx.process(ctx.token,rows,{});assert.equal(isolated[0][0],'A');assert.deepEqual(switched,['B']);
}
{
  const {ctx,isolated,checked,switched}=runtime();ctx.runImageQuality=async()=>{throw Error('HTTP 400 private upstream');};
  assert.equal((await ctx.process(ctx.token,rows,{})).outcome,'image-blocked');assert.equal(isolated.length,3);assert.equal(switched.length,0);
  assert(!JSON.stringify(ctx.state.logs).includes('private upstream'));
}
{
  const {ctx,isolated,checked}=runtime({imageQualityKeyId:0});await ctx.process(ctx.token,rows,{});assert.equal(isolated.length,3);assert.equal(checked.length,0);
}
{
  const {ctx,isolated,checked,switched}=runtime();const noImage=rows.map(row=>({...row,detectionMedia:null}));await ctx.process(ctx.token,noImage,{});assert.equal(isolated.length,3);assert.equal(checked.length,0);assert.equal(switched.length,0);
}
{
  const {ctx,checked,switched,isolated}=runtime({imageQualityKeyId:0});await ctx.process(ctx.token,rows,{forceSwitch:true,targetGroup:'B'});
  assert.deepEqual(switched,['B']);assert.equal(checked.length,0);assert.equal(isolated.length,0);
}
{
  const {ctx,checked}=runtime({enabled:false});assert.equal((await ctx.process(ctx.token,rows,{})).outcome,'suggested');assert.equal(checked.length,0);
}
{
  const {ctx,checked,switched}=runtime({confirmPolls:2});ctx.token.group='C';ctx.actualGroup='C';
  assert.equal((await ctx.process(ctx.token,rows,{})).outcome,'pending');assert.equal(checked.length,0);await ctx.process(ctx.token,rows,{});assert.deepEqual(checked,['A']);assert.deepEqual(switched,['A']);
}
{
  const {ctx,storage,checked}=runtime({switchHoldMinutes:10});ctx.token.group='C';ctx.actualGroup='C';storage.history={byToken:{1:{model:'fixture',group:'C',at:Date.now()}}};
  assert.equal((await ctx.process(ctx.token,rows,{})).outcome,'holding');assert.equal(checked.length,0);
}
for(const invalidate of [ctx=>{ctx.config={...ctx.config,imageQualityMinScore:90};},ctx=>{ctx.imageQuality.cancelRevision++;},ctx=>{ctx.imageQuality.catalogRevision++;},ctx=>{ctx.actualGroup='changed-in-other-tab';}]) {
  const {ctx,isolated,switched}=runtime();ctx.runImageQuality=async({candidate})=>{ctx.scores[candidate.group]=entry();invalidate(ctx);};
  await assert.rejects(()=>ctx.process(ctx.token,rows,{}),/取消切换/);assert.equal(isolated.length,0);assert.equal(switched.length,0);
}
{
  const {ctx,checked,isolated,switched}=runtime();const budget=ctx.context();budget.remaining=0;
  await assert.rejects(()=>ctx.process(ctx.token,rows,{admission:budget}),/10次/);assert.equal(isolated.length,0);assert.equal(switched.length,0);
}
{
  const {ctx,storage,isolated,switched}=runtime({rollbackChecks:2});ctx.token.group='C';ctx.actualGroup='C';
  storage.guard={byToken:{1:{model:'fixture',fromGroup:'A',toGroup:'C',remaining:2,at:Date.now()}},blacklist:[]};
  ctx.scores.A=entry(qualityCriteria(),'low');ctx.scores.B=entry();
  const failed=rows.map(row=>row.group==='C'?{...row,available:false,reasons:['recent-success-low']}:row);
  assert.equal((await ctx.process(ctx.token,failed,{})).outcome,'rolled-back');assert.deepEqual(switched,['B']);assert.equal(isolated[0][0],'A');
}
console.log('image admission: strict thresholds, all strategies, cache, fallback, isolation/expiry, manual bypass, hold/confirmation, rollback, cancellation and shared budget passed');

{
 const {ctx,isolated,switched,storage}=runtime();ctx.runImageQuality=async()=>{storage['catalog-at']=2;throw Object.assign(Error('stale'),{code:'IMAGE_CATALOG_STALE'});};
 await assert.rejects(()=>ctx.process(ctx.token,rows,{}),/取消切换/);assert.equal(isolated.length,0);assert.equal(switched.length,0);
}
{
 const {ctx,isolated,switched}=runtime();ctx.runImageQuality=async()=>{throw Object.assign(Error('stale'),{code:'IMAGE_CATALOG_STALE'});};
 await assert.rejects(()=>ctx.process(ctx.token,rows,{}),/取消切换/);assert.equal(isolated.length,0);assert.equal(switched.length,0);
}
{
 const {ctx,switched}=runtime();const admission=ctx.context();ctx.config={...ctx.config,tokenIds:[]};
 await assert.rejects(()=>ctx.process(ctx.token,rows,{forceSwitch:true,targetGroup:'B',admission}),/设置已变更/);assert.equal(switched.length,0);
}
console.log('PASS shared directory watermark, stale-source errors and manual settings snapshot cancellation');
{
 const {ctx,isolated,switched}=runtime();let calls=0;
 ctx.runImageQuality=async({budget})=>{if(budget.remaining<=0)throw Object.assign(Error('cap'),{code:'IMAGE_ADMISSION_BUDGET'});budget.remaining--;calls++;throw Error('HTTP 400');};
 const many=Array.from({length:14},(_,i)=>({...rows[0],group:'group-'+i,groupId:i+1,ratio:i+1,effectiveRatio:i+1}));
 await assert.rejects(()=>ctx.process(ctx.token,many,{}),/10次/);
 assert.equal(calls,10);assert.equal(isolated.length,10,'the tenth failed request still isolates its group; unanalysed groups do not');assert.equal(switched.length,0);
}
console.log('PASS automatic candidate loop makes at most10 paid attempts and never isolates an unanalysed budget-blocked candidate');
