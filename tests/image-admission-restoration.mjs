import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {qualityRuntime,response} from './fixtures/image-quality-runtime.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const test={__KFCODING_GROUP_SWITCHER_TEST__:true};vm.runInNewContext(read('kfcoding-group-switcher.user.js'),test);
const api=test.__KFCODING_GROUP_SWITCHER_API__;
function setup(){
  const r=qualityRuntime();const {ctx}=r;
  ctx.config=api.sanitizeConfig({...ctx.config,enabled:true,models:['fixture'],tokenIds:[1],confirmPolls:1,switchHoldMinutes:0,rollbackChecks:0});
  const rows=r.rows.map((row,i)=>({...row,group:'Route-'+(i+1),available:true,reasons:[],warnings:[],ratio:3-i,effectiveRatio:3-i,effectiveRatioReady:true,providerId:'aihub',recentMinSuccess:100,aggregateSuccess:100}));
  r.catalog(rows);Object.assign(ctx,{
    IS_AIHUB_API:true,IS_FLUXION:false,window:{localStorage:{getItem:()=>null}},state:{candidates:rows,candidateRevision:0,candidateRequestRevision:0,logs:[]},refs:{},tokensCache:[],
    pendingCandidates:new Map(),automaticImageAdmission:{context:null,jobs:new Map(),bindings:new Map(),active:null,draining:null},
    STORAGE_SWITCH_GUARD:'guard',STORAGE_LAST_SWITCH:'history',STORAGE_LOGS:'logs',MAX_LOG_ENTRIES:50,
    ...Object.fromEntries(['targetModelIdentity','targetModels','normalizeSwitchHistory','normalizeSwitchGuardState','pruneSwitchGuardState','applyTemporaryBlacklist','selectRollbackCandidate','selectSwitchCandidate','selectBestCandidate','selectImageQualifiedCandidate','imageQualityAdmissionVerdict','shouldSwitchCandidate','candidateHasHealthFailure','candidateRecommendationLabel','tokenSupportsModel'].map(name=>[name,api[name]])),
    fetchJson:async(path,options={})=>ctx.unwrapSiteResponse(await(await ctx.fetch(path,{...options,body:options.body?JSON.stringify(options.body):undefined})).json()),
  });
  vm.runInContext(read('src/runtime/operations.js'),ctx);vm.runInContext('scheduleNext=()=>{};',ctx);
  ctx.fetchJson=async(path,options={})=>ctx.unwrapSiteResponse(await(await ctx.fetch(path,{...options,body:options.body?JSON.stringify(options.body):undefined})).json());
  const token={id:1,name:'fixture',status:'active',group:'Route-1',groupId:1};
  const poll=async(candidates=rows,options={})=>{ctx.state.candidates=candidates;ctx.state.candidateRevision=++ctx.state.candidateRequestRevision;return ctx.processToken(token,candidates,options);};
  return {...r,rows,token,poll};
}
{
 const r=setup();r.ctx.respond=async(model,options,id)=>id===1?new Response('{}',{status:503}):new Response(JSON.stringify(response()));
 assert.equal((await r.poll()).outcome,'image-pending');await r.ctx.automaticImageAdmission.draining;
 assert.deepEqual(r.groupWrites,[2,1]);assert.equal(r.groupState.id,1);
 assert.equal((await r.poll()).outcome,'switched');assert.deepEqual(r.groupWrites,[2,1,3]);assert(r.calls.every(model=>model==='primary'));
}
for(const action of ['recovery','manual']){
 const r=setup();let entered;const active=new Promise(resolve=>entered=resolve);
 r.ctx.respond=async(model,options,id)=>{if(id===1)return new Response('{}',{status:503});entered();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));};
 await r.poll();await active;assert.equal(r.groupState.id,2);assert.equal(r.ctx.imageQuality.scoringToken.group,'Route-1');
 r.ctx.tokensCache.push({id:1,groupId:2,group:'Route-2'});
 r.ctx.onGroupPut=async id=>{
   if(id===3)assert.equal(r.ctx.tokensCache[0].groupId,1,'restoration updates the display cache before business switching');
   r.groupState.id=id;return new Response('{}');
 };
 const candidates=action==='recovery'?r.rows.map(row=>row.groupId===1?{...row,available:false,reasons:['latest-success-low']}:row):r.rows;
 if(action==='manual')await r.ctx.stopAutomaticImageAdmission();
 assert.equal((await r.poll(candidates,action==='manual'?{forceSwitch:true,targetGroup:'Route-3'}:{})).outcome,'switched');
 assert.deepEqual(r.groupWrites,[2,1,3],action+' cancels scoring, verifies restoration, then changes business group');
 assert.equal(r.groupState.id,3);assert.equal(r.ctx.imageQuality.records.size,0);assert.equal(r.stored.guard.blacklist.length,0);
 assert.equal(r.ctx.tokensCache[0].groupId,3,'business switching refreshes the current group after restoration');
}
{
 const r=setup();r.ctx.respond=async(model,options,id)=>id===1?new Response('{}',{status:503}):new Response(JSON.stringify(response()));
 r.ctx.onGroupPut=async id=>{if(id===1)return new Response('{}',{status:503});r.groupState.id=id;return new Response('{}');};
 r.ctx.tokensCache.push({id:1,groupId:2,group:'Route-2'});
 await r.poll();await r.ctx.automaticImageAdmission.draining;assert.match(r.ctx.imageQuality.recoveryError,/恢复原分组/);
 assert.equal(r.ctx.tokensCache[0].groupId,0,'unconfirmed restoration removes the cached current marker');
 await assert.rejects(r.poll(r.rows.map(row=>row.groupId===1?{...row,available:false,reasons:['latest-success-low']}:row)),/恢复原分组/);
 assert.deepEqual(r.groupWrites,[2,1]);assert.equal(r.ctx.imageQuality.records.size,0);
}
for(const rollback of [false,true]){
 const r=setup();let entered;const active=new Promise(resolve=>entered=resolve);
 r.ctx.respond=async(model,options,id)=>{if(id===1)return new Response('{}',{status:503});entered();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));};
 await r.poll();await active;
 if(rollback){r.ctx.config.rollbackChecks=2;r.stored.guard={byToken:{1:{model:'fixture',fromGroup:'Route-3',toGroup:'Route-1',remaining:2,at:Date.now()}},blacklist:[]};}
 r.ctx.onGroupPut=async id=>{r.groupState.id=id;if(id===1)r.ctx.config.enabled=false;return new Response('{}');};
 await assert.rejects(r.poll(r.rows.map(row=>row.groupId===1?{...row,available:false,reasons:['latest-success-low']}:row)),/设置/);
 assert.deepEqual(r.groupWrites,[2,1],'pause during restoration prevents obsolete '+(rollback?'rollback':'recovery'));
}
console.log('PASS actual scorer/runtime integration: fixed-model fallback, normal/recovery/manual restore-before-business-write and sticky restoration failure');
