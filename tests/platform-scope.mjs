import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const sandbox={__KFCODING_GROUP_SWITCHER_TEST__:true};vm.runInNewContext(read('kfcoding-group-switcher.user.js'),sandbox);const api=sandbox.__KFCODING_GROUP_SWITCHER_API__;
const now=Date.now(),fresh=new Date(now).toISOString();
const modelStats={success_rate:1,tps:60,sample_count:100,range_cache:{cache_hit_rate:.8,usage_records:100,ready:true,stale:false,refreshed_at:fresh}};
const monitors=Array.from({length:40},(_,index)=>({id:String(index+1),group_id:index+1,platform:index%2?'kimi':'openai',planType:'g'+(index+1),group_models:['fixture'],priceMultiplier:index+1,enabled:true,model_detection:{applicable:true,status:'passed',model:'fixture',execution_complete:true,detected_at:fresh,presentation:{text:{result:true}}},summary_models:{fixture:modelStats}}));
const groups=monitors.map(m=>({id:m.group_id,name:m.planType,platform:m.platform}));
const summary={apis:monitors,providerVersion:2,summaryRange:'1h',generatedAt:fresh};
const base=api.sanitizeConfig({models:['fixture'],tokenIds:[1],enabled:true,monitorScopeMode:'selected',monitorGroupIds:[2,6,8],businessPlatform:'openai',rollbackChecks:0,confirmPolls:1,switchHoldMinutes:0});
assert.equal(api.sanitizeConfig({}).monitorScopeMode,'all','old unscoped config defaults to all');
assert.deepEqual(Array.from(base.monitorGroupIds),[2,6,8]);
const selectedScope=api.scopeAihubMonitors(summary,groups,base,['fixture'],{currentTokens:[{id:1,groupId:1,group:'g1'}]});
assert.deepEqual(Array.from(selectedScope.summary.apis,m=>m.group_id),[2,6,8],'explicit monitored IDs replace legacy platform and current-group exception');
const evaluated=[],writes=[],configWrites=[];let token={id:1,name:'fixture-key',status:'active',groupId:1,group:'g1'};
const ctx=vm.createContext({...api,console,MODEL_IDENTITY_SEPARATOR:'\u001f',config:base,IS_AIHUB:true,IS_FLUXION:false,IS_AIHUB_API:true,SITE_ID:'aihub',SITE_LABEL:'AIHub',
 state:{candidates:[],candidateRequestRevision:0,candidateRevision:0,checkRevision:0,logs:[],tokenResults:[],outOfScopeTokens:[],todayUsage:{available:false}},checkRevision:0,
 pendingCandidates:new Map(),aihubGroupsCache:[],aihubRatesCache:{},aihubPlatformMonitorsCache:[],pricingCache:{},tokensCache:[token],running:false,
 guard:{byToken:{},blacklist:[]},fetchJson:async()=>{throw Error('unexpected network')},
 loadAihubMonitorData:async()=>({summary,series:{},groups,rates:{}}),loadAihubProviderData:async()=>({summary,series:{}}),
 STORAGE_CONFIG:'config',GM_getValue:()=>({}),GM_setValue:(key,value)=>configWrites.push({key,value}),GM_notification:()=>{},refs:{},
});
vm.runInContext(read('src/core/config.js'),ctx);
vm.runInContext(read('src/runtime/operations.js'),ctx);
Object.assign(ctx,{evaluateAihubCandidates:(s,...args)=>{evaluated.push(...s.apis.map(m=>m.group_id));return api.evaluateAihubCandidates(s,...args);},
 getSwitchGuardState:()=>ctx.guard,saveSwitchGuardState:value=>{ctx.guard=value;},getSwitchHistory:()=>({}),addLog:()=>{},
 switchTokenGroup:async(_token,candidate,options)=>{options?.beforeSwitch?.();writes.push(candidate.groupId);},
 getTokenDetail:async()=>({...token}),refreshTodayUsage:async()=>{},refreshTokenCatalog:async()=>{},render:()=>{},renderOptions:()=>{},syncForm:()=>{},setStatus:()=>{},scheduleNext:()=>{},
});
const load=async(request={},health=false)=>{evaluated.length=0;return(await ctx.loadCheckCandidates(['fixture'],health,{currentTokens:[token],...request})).candidates;};
let rows=await load();
assert.deepEqual(evaluated,[2,6,8],'deep evaluation happens only for selected IDs, not all 40 or the out-of-scope current group');
assert.equal(rows.length,3);assert.equal(ctx.aihubPlatformMonitorsCache.length,40,'catalog can remain complete without processing it as health results');
assert.equal(rows.every(row=>row.inMonitorScope),true);
assert.equal(api.selectBestCandidate(rows,'','quality').groupId,2,'legacy businessPlatform cannot narrow explicit group IDs');
rows=await load({},true);assert.deepEqual(evaluated,[],'health cycle does not implicitly inspect out-of-scope current group');
token={...token,groupId:2,group:'g2'};rows=await load({},true);assert.deepEqual(evaluated,[2],'health cycle only checks the in-scope current group');
token={...token,groupId:1,group:'g1'};rows=await load({targetGroup:'g7',targetGroupId:7});assert.deepEqual(evaluated,[1,7],'manual destination checks exactly current and target once');
assert.equal(rows.every(row=>row.scopeEligible===false),true,'manual out-of-scope rows cannot become automatic recommendations');
assert.equal(api.selectBestCandidate(rows,'','quality'),null);
assert.equal(api.selectSwitchCandidate(rows,'g1','g7',{targetGroupId:7,allowUnavailable:true}).groupId,7);
ctx.config={...base,monitorGroupIds:[]};rows=await load();assert.deepEqual(evaluated,[]);assert.equal(rows.length,0,'selected empty range never means all');
ctx.config=base;
for(const automaticSwitchMode of ['strategy','failover']){
 ctx.config={...base,automaticSwitchMode};
 const result=await ctx.processToken(token,await load());
 assert.equal(result.outcome,'scope-hold','outside current group pauses both automatic modes');
 assert.deepEqual(writes,[],'outside current group cannot recover through an implicit exception');
}
const migrated=api.migrateAihubMonitorScope(api.sanitizeConfig({businessPlatform:'kimi',models:['fixture'],tokenIds:[1]}),groups,monitors);
assert.equal(migrated.config.monitorScopeMode,'selected');assert.equal(migrated.config.monitorScopeMigrationPending,false);
assert.deepEqual(Array.from(migrated.config.monitorGroupIds),groups.filter(g=>g.platform==='kimi').map(g=>g.id));
const waiting=api.migrateAihubMonitorScope(api.sanitizeConfig({businessPlatform:'kimi'}),[],[]);
assert.equal(waiting.config.monitorScopeMode,'selected');assert.equal(waiting.config.monitorScopeMigrationPending,true);assert.equal(waiting.config.monitorGroupIds.length,0,'unresolved migration never expands scope');
const partial=api.migrateAihubMonitorScope(api.sanitizeConfig({businessPlatform:'kimi'}),[{id:1,name:'known',platform:'kimi'},{id:2,name:'unknown'}],[]);
assert.equal(partial.config.monitorScopeMigrationPending,true,'partial platform metadata must not freeze an incomplete migration');
assert.equal(partial.config.monitorGroupIds.length,0,'unresolved migration cannot silently omit unknown catalog groups');
assert.equal(api.migrateAihubMonitorScope(base,groups,monitors).changed,false,'explicit IDs take precedence over legacy platform');
// Duplicate display names never merge group IDs or allow target confusion.
const twins=monitors.slice(0,2).map(m=>({...m,planType:'shared'}));const twinGroups=twins.map(m=>({id:m.group_id,name:'shared'}));
const twinScope=api.scopeAihubMonitors({apis:twins},twinGroups,{...base,monitorGroupIds:[2]},['fixture']);
assert.deepEqual(Array.from(twinScope.summary.apis,m=>m.group_id),[2]);
assert.equal(api.candidateMatchesToken({groupId:2,group:'shared'},{groupId:1,group:'shared'}),false);
assert.equal(api.selectSwitchCandidate([{groupId:1,group:'shared',available:true},{groupId:2,group:'shared',available:true}],'shared','shared',{targetGroupId:2}).groupId,2);
// Scope saving is local-only and retires old confirmations without checking or switching.
ctx.config=base;ctx.pendingCandidates.set(1,{group:'g2',hits:3});ctx.state.candidates=await load();evaluated.length=0;
ctx.saveMonitorScope('selected',[2]);
assert.equal(ctx.pendingCandidates.size,0);assert.equal(ctx.state.candidates.length,0);assert.deepEqual(Array.from(ctx.config.monitorGroupIds),[2]);assert.deepEqual(evaluated,[]);assert.deepEqual(writes,[]);assert.ok(configWrites.length>0);
const count=configWrites.length;ctx.saveMonitorScope('selected',[2]);assert.equal(configWrites.length,count,'unchanged scope is a no-op');
// A scoped one-off manual check cannot replace the monitored dashboard or its recommendation.
ctx.config={...base,enabled:false};ctx.state.candidates=await load();
const dashboardIds=Array.from(ctx.state.candidates,row=>row.groupId);ctx.state.bestGroup='dashboard recommendation';writes.length=0;
const manualMessages=[];ctx.addLog=(message)=>manualMessages.push(message);ctx.setStatus=(message)=>manualMessages.push(message);
await ctx.runCheck({manual:true,forceSwitch:true,targetGroup:'g7',targetGroupId:7,allowUnavailable:true});
assert.deepEqual(writes,[7],'manual destination executes: '+manualMessages.join(' | '));
assert.deepEqual(Array.from(ctx.state.candidates,row=>row.groupId),dashboardIds,'manual destination results stay separate from monitored results');
assert.equal(ctx.state.bestGroup,'dashboard recommendation','one-off target cannot replace the full-pool recommendation');
assert.deepEqual(writes,[7],'manual target remains explicitly selectable even outside the monitoring range');
console.log('PASS monitored ID preselection, exact evaluation counts, empty range, migration, out-of-scope pause, manual-only scope and local save invalidation (simulated IO)');
