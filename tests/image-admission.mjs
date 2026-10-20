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
assert.deepEqual(Array.from(api.sanitizeConfig({ imageQualityFallbackGroupIds: ['2',2,0,-1,3,4] }).imageQualityFallbackGroupIds),[2,3]);
assert.deepEqual(Array.from(api.sanitizeConfig({ imageQualityFallbackModels: ['old-model'] }).imageQualityFallbackGroupIds),[],'old model names must not migrate to group IDs');
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

// Exercise actual background orchestration with controllable asynchronous model results.
function runtime(overrides = {}) {
  const storage = {}, switched = [], checked = [], isolated = [];
  const ctx = { console, AbortController, DOMException, setTimeout, clearTimeout, Date, Map, Set, Promise,
    IS_AIHUB:true, IS_AIHUB_API:true,
    config:api.sanitizeConfig({enabled:true,tokenIds:[1],models:['fixture'],confirmPolls:1,switchHoldMinutes:0,rollbackChecks:0,imageQualityKeyId:1,imageQualityModel:'fixture-vision',...overrides}),
    state:{candidates:rows,candidateRevision:0,candidateRequestRevision:0,logs:[]}, imageQuality:{cancelRevision:0,catalogRevision:1,catalogAt:1},
    automaticImageAdmission:{context:null,jobs:new Map(),bindings:new Map(),active:null,draining:null},pendingCandidates:new Map(),
    STORAGE_IMAGE_QUALITY_CATALOG_AT:'catalog-at',STORAGE_SWITCH_GUARD:'guard',STORAGE_LAST_SWITCH:'history',STORAGE_LOGS:'logs',MAX_LOG_ENTRIES:50,
    GM_getValue:(key,fallback)=>storage[key]??fallback,GM_setValue:(key,value)=>storage[key]=value,
    render(){},refs:{},
    ...Object.fromEntries(['targetModelIdentity','targetModels','normalizeSwitchHistory','normalizeSwitchGuardState','pruneSwitchGuardState','applyTemporaryBlacklist','selectRollbackCandidate','selectSwitchCandidate','selectBestCandidate','selectImageQualifiedCandidate','imageQualityAdmissionVerdict','shouldSwitchCandidate','candidateHasHealthFailure','candidateRecommendationLabel','tokenSupportsModel'].map(name=>[name,api[name]])),
    imageQualityEnabled:settings=>settings.imageQualityKeyId>0&&!!settings.imageQualityModel,
    imageQualityIdentity:api.imageQualityIdentity,
    imageQualityFailureMessage:()=> '评价服务不可用，本次择优暂停',
    scores:{},runImageQuality:async({candidate,budget})=>{checked.push(candidate.group);if(budget.remaining<=0)throw Object.assign(Error('cap'),{code:'IMAGE_ADMISSION_BUDGET'});budget.remaining--;return ctx.scores[candidate.group]||entry();},
  };
  vm.createContext(ctx);vm.runInContext(read('src/runtime/operations.js'),ctx);
  vm.runInContext(`scheduleNext=()=>{};requestHealthCheck=()=>{};globalThis.process=processToken;globalThis.stop=stopAutomaticImageAdmission;
    switchTokenGroup=async(token,candidate,options)=>{options?.beforeSwitch?.();if(imageQuality.recoveryError)throw Error(imageQuality.recoveryError);if(globalThis.actualGroup!==token.group)throw Error('外部分组改变，取消切换');globalThis.onSwitch(token,candidate);pendingCandidates.delete(Number(token.id));};
    getTokenDetail=async id=>({id,group:globalThis.actualGroup,status:'active'});
    const originalIsolation=isolateImageCandidate;isolateImageCandidate=(row,reason)=>{globalThis.onIsolate(row,reason);originalIsolation(row,reason);};`,ctx);
  ctx.onSwitch=(token,candidate)=>switched.push(candidate.group);ctx.onIsolate=(row,reason)=>isolated.push([row.group,reason]);
  ctx.token={id:1,group:'C',groupId:3,status:'active'};ctx.actualGroup='C';
  const poll=async(token=ctx.token,candidates=rows,options={})=>{ctx.state.candidateRevision=++ctx.state.candidateRequestRevision;ctx.state.candidates=candidates;return ctx.process(token,candidates,options);};
  const settle=async()=>{await ctx.automaticImageAdmission.draining;};
  return {ctx,storage,switched,checked,isolated,poll,settle};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
{
  const r=runtime();const wait=deferred();r.ctx.runImageQuality=async()=>{r.checked.push('A');return wait.promise;};
  assert.equal((await r.poll()).outcome,'image-pending');assert.equal((await r.poll()).outcome,'image-pending');
  assert.deepEqual(r.switched,[],'health polling returns while model is still pending');
  wait.resolve(entry());await r.settle();assert.deepEqual(r.switched,[],'model completion itself never switches');
  assert.equal((await r.poll()).outcome,'switched');assert.deepEqual(r.checked,['A']);
  await r.poll();await r.settle();await r.poll();assert.deepEqual(r.checked,['A','A'],'a later independent decision evaluates afresh');
}
{
  const r=runtime({confirmPolls:3});assert.equal((await r.poll()).outcome,'pending');assert.equal(r.checked.length,0);
  assert.equal((await r.poll()).outcome,'pending');await r.settle();assert.deepEqual(r.checked,['A']);
  assert.equal((await r.poll()).outcome,'switched');
}
{
  const r=runtime({switchHoldMinutes:10,pollSeconds:30});r.storage.history={byToken:{1:{model:'fixture',group:'C',at:Date.now()}}};
  assert.equal((await r.poll()).outcome,'holding');assert.equal(r.checked.length,0);
  r.storage.history.byToken[1].at=Date.now()-10*60000+20000;
  assert.equal((await r.poll()).outcome,'holding');await r.settle();assert.deepEqual(r.checked,['A']);
  r.storage.history.byToken[1].at=Date.now()-11*60000;
  assert.equal((await r.poll()).outcome,'switched');assert.equal(r.checked.length,1);
}
{
  const r=runtime({blacklistMinutes:7});r.ctx.scores.A=entry(qualityCriteria(),'low');
  const before=Date.now();await r.poll();await r.settle();assert.equal(r.isolated[0][0],'A');
  const isolated=r.storage.guard.blacklist[0];assert.equal(isolated.type,'image');assert.ok(isolated.until>=before+7*60000);
  assert.equal(r.ctx.config.groupBlacklist.length,0,'user blacklist is untouched');
  await r.poll();await r.settle();await r.poll();assert.deepEqual(r.switched,['B']);
}
for(const code of ['IMAGE_READ_FAILED','IMAGE_UNASSESSABLE']) {
  const r=runtime();r.ctx.runImageQuality=async()=>{throw Object.assign(Error('fixture'),{code});};
  await r.poll();await r.settle();assert.equal(r.isolated.length,1);assert.equal(r.isolated[0][0],'A');
}
for(const code of ['IMAGE_SCORER_UNAVAILABLE','UNKNOWN']) {
  const r=runtime();r.ctx.runImageQuality=async()=>{r.checked.push('failure');throw Object.assign(Error('private upstream'),{code});};
  await r.poll();await r.settle();assert.equal((await r.poll()).outcome,'image-error');
  await r.poll();assert.equal(r.checked.length,1,'polls never automatically retry service failure');assert.equal(r.isolated.length,0);
  assert(!r.ctx.imageQuality.status.includes('private upstream'));
}
{
  const r=runtime({imageQualityKeyId:0});await r.poll();await r.settle();assert.equal((await r.poll()).outcome,'image-error');assert.equal(r.isolated.length,0);assert.equal(r.checked.length,0);
}
{
  const r=runtime();await r.poll(r.ctx.token,rows.map(row=>({...row,detectionMedia:null})));await r.settle();assert.equal(r.isolated[0][0],'A');assert.equal(r.checked.length,0);
}
for(const healthIsolation of [false,true]) {
  const r=runtime();r.storage.guard={byToken:{},blacklist:[{model:'fixture',group:'A',type:healthIsolation?'health':'image',reason:'fixture',until:Date.now()+60000}]};
  const failed=rows.map(row=>row.group==='C'?{...row,available:false,reasons:['latest-success-low']}:row);
  assert.equal((await r.poll(r.ctx.token,failed)).outcome,'switched');assert.deepEqual(r.switched,[healthIsolation?'B':'A']);assert.equal(r.checked.length,0,'recovery bypasses model and image isolation only');
}
{
  const r=runtime({rollbackChecks:2});r.storage.guard={byToken:{1:{model:'fixture',fromGroup:'A',toGroup:'C',remaining:2,at:Date.now()}},blacklist:[{model:'fixture',group:'C',type:'image',reason:'earlier image',until:Date.now()+60000}]};
  const failed=rows.map(row=>row.group==='C'?{...row,available:false,reasons:['latest-success-low']}:row);
  assert.equal((await r.poll(r.ctx.token,failed)).outcome,'rolled-back');assert.deepEqual(r.switched,['A']);assert.equal(r.checked.length,0);assert.deepEqual(Array.from(r.storage.guard.blacklist,e=>e.type).sort(),['health','image']);
}
{
  const r=runtime({imageQualityKeyId:0});await r.poll(r.ctx.token,rows,{forceSwitch:true,targetGroup:'B'});assert.deepEqual(r.switched,['B']);assert.equal(r.checked.length,0);
}
{
  const r=runtime({enabled:false});assert.equal((await r.poll()).outcome,'suggested');assert.equal(r.checked.length,0);
}
for(const invalidate of [r=>{r.ctx.config={...r.ctx.config,imageQualityMinScore:90};},r=>{r.ctx.imageQuality.cancelRevision++;},r=>{r.ctx.imageQuality.catalogRevision++;},r=>{r.storage['catalog-at']=2;}]) {
  const r=runtime();const wait=deferred();r.ctx.runImageQuality=async()=>wait.promise;await r.poll();invalidate(r);wait.resolve(entry());await r.settle();
  assert.equal(r.switched.length,0);assert.equal(r.isolated.length,0);
}
{
  const r=runtime();const wait=deferred();r.ctx.runImageQuality=async()=>wait.promise;await r.poll();
  // Strategy changes back to current; a late failed score must not isolate old target A.
  await r.poll(r.ctx.token,rows.map(row=>({...row,ratio:row.group==='C'?0.1:row.ratio,effectiveRatio:row.group==='C'?0.1:row.ratio})));
  wait.resolve(entry(qualityCriteria(),'low'));await r.settle();assert.equal(r.isolated.length,0);assert.equal(r.ctx.automaticImageAdmission.bindings.size,0);
}
{
  const r=runtime();await r.poll();await r.settle();r.ctx.actualGroup='external';
  await assert.rejects(r.poll(),/取消切换/);assert.equal(r.switched.length,0);
}
{
  const r=runtime();r.ctx.runImageQuality=async({budget})=>{if(!budget.remaining)throw Object.assign(Error('cap'),{code:'IMAGE_ADMISSION_BUDGET'});budget.remaining--;r.checked.push('paid');return entry(qualityCriteria(),'low');};
  const many=Array.from({length:14},(_,i)=>({...rows[0],group:'group-'+i,groupId:i+1,ratio:i+1,effectiveRatio:i+1}));
  const token={...r.ctx.token,group:'current',groupId:99};const all=[...many,{...rows[2],group:'current',groupId:99,ratio:100,effectiveRatio:100}];r.ctx.actualGroup='current';
  for(let i=0;i<15;i++){await r.poll(token,all);await r.settle();}
  assert.equal(r.checked.length,10);assert.equal(r.isolated.length,10);assert.equal(r.switched.length,0);
  assert.equal((await r.poll(token,all)).outcome,'image-error','budget remains exhausted across health polls');
}
{
  const r=runtime();let aborted=false;const wait=deferred();r.ctx.imageQuality.controller={abort(){aborted=true;}};
  await r.poll();await r.ctx.stop();assert.equal(aborted,false,'canceling a queued automatic job must not abort unrelated manual evaluation');
  r.ctx.imageQuality.controller=null;wait.resolve();
}
{
  const r=runtime();const wait=deferred();r.ctx.runImageQuality=async()=>wait.promise;await r.poll();
  const inflightRevision=++r.ctx.state.candidateRequestRevision;
  wait.resolve(entry());await r.settle();
  r.ctx.state.candidateRevision=inflightRevision;
  assert.equal((await r.ctx.process(r.ctx.token,rows)).outcome,'image-pending','health request started before score completion cannot authorize write');
  assert.equal(r.switched.length,0);assert.equal((await r.poll()).outcome,'switched');
}
{
  const r=runtime();const wait=deferred();r.ctx.runImageQuality=async()=>wait.promise;await r.poll();
  r.ctx.actualGroup='external';wait.resolve(entry(qualityCriteria(),'low'));await r.settle();
  assert.equal(r.isolated.length,0,'external business-key change retires late rejected image');
  assert.equal(r.ctx.automaticImageAdmission.bindings.size,0);
}
console.log('PASS background polling, confirmation/hold pre-evaluation, fresh decision scores, fault isolation, emergency/rollback/manual bypass, stale cancellation, service pause, shared ten-request budget and owned cancellation');

// Independent health ticks never advance normal confirmation or start paid work.
{
  const r=runtime({confirmPolls:2});
  for(let i=0;i<4;i++) assert.equal((await r.poll(r.ctx.token,rows,{mode:'health'})).outcome,'healthy');
  assert.equal(r.checked.length,0);assert.equal(r.ctx.pendingCandidates.size,0);
  assert.equal((await r.poll()).outcome,'pending');await r.settle();
  assert.equal(r.checked.length,1);assert.equal(r.ctx.pendingCandidates.get(1).hits,1);
  for(let i=0;i<4;i++) await r.poll(r.ctx.token,rows,{mode:'health'});
  assert.equal(r.ctx.pendingCandidates.get(1).hits,1);assert.equal(r.switched.length,0);
  assert.equal((await r.poll()).outcome,'switched');
}
{
  const r=runtime();await r.poll();await r.settle();
  assert.equal((await r.poll(r.ctx.token,rows,{mode:'health'})).outcome,'switched','fresh health tick may finish already confirmed scored decision');
}
{
  const r=runtime({confirmPolls:3});
  const broken=rows.map(row=>row.group==='C'?{...row,available:false,reasons:['latest-success-low']}:row);
  assert.equal((await r.poll(r.ctx.token,broken,{mode:'health'})).outcome,'switched');
  assert.equal(r.checked.length,0,'emergency recovery skips inference');
}
{
  const r=runtime({rollbackChecks:2});r.storage.guard={byToken:{1:{model:'fixture',fromGroup:'B',toGroup:'C',remaining:2}},blacklist:[]};
  assert.equal((await r.poll(r.ctx.token,rows,{observeHealth:false})).outcome,'observing');
  assert.equal(r.storage.guard.byToken[1].remaining,2,'strategy-only ticks cannot consume rollback observations');
  await r.poll(r.ctx.token,rows,{mode:'health'});assert.equal(r.storage.guard.byToken[1].remaining,1);
}
{
  const r=runtime({switchHoldMinutes:10,strategySeconds:300,pollSeconds:30});
  r.storage.history={byToken:{1:{model:'fixture',group:'C',at:Date.now()-6*60000}}};
  assert.equal((await r.poll()).outcome,'holding');await r.settle();assert.equal(r.checked.length,1,'pre-evaluation window follows strategy interval');
}
