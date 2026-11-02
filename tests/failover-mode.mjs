import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const test={__KFCODING_GROUP_SWITCHER_TEST__:true};vm.runInNewContext(read('kfcoding-group-switcher.user.js'),test);const api=test.__KFCODING_GROUP_SWITCHER_API__;
assert.equal(api.sanitizeConfig({}).automaticSwitchMode,'strategy');assert.equal(api.sanitizeConfig({automaticSwitchMode:'failover'}).automaticSwitchMode,'failover');assert.equal(api.sanitizeConfig({automaticSwitchMode:'invalid'}).automaticSwitchMode,'strategy');
const settings=api.sanitizeConfig({enabled:true,automaticSwitchMode:'failover',models:['fixture'],tokenIds:[1],rollbackChecks:0,switchHoldMinutes:0,confirmPolls:2});
const now=Date.now(),fresh=new Date(now).toISOString();
const data=[['current',1,4,1,.8,60],['cheap',2,.1,.98,.5,40],['fast',3,1,.99,.9,90],['previous',4,3,.98,.6,55],['manual',5,1,.99,.8,60]];
const groups=data.map(([name,id])=>({id,name}));
const candidateRows=(overrides={},cfg=settings,providerOverrides={})=>{
 const items=data.map(([name,id,ratio,success,cache,tps])=>({group_id:id,code:name,rate_multiplier:ratio,group_models:['fixture'],model_detection:{applicable:true,status:'passed',model:'fixture',execution_complete:true,detected_at:fresh,presentation:{text:{result:true}}},summary_models:{fixture:{success_rate:success,tps,sample_count:100,range_cache:{cache_hit_rate:cache,usage_records:100,ready:true,stale:false,refreshed_at:fresh}}},...(overrides[name]||{})}));
 const normalized=api.normalizeAihubProviderData({version:2,generated_at:fresh,summary_range:'1h',items,...providerOverrides},{});
 return api.evaluateAihubCandidates(normalized.summary,{},groups,{},cfg,now);
};
const broken=()=>candidateRows({current:{model_detection:{applicable:true,status:'failed',model:'fixture',execution_complete:true,detected_at:fresh,presentation:{text:{result:false}}}}});
function runtime(overrides={}){
 const writes=[],token={id:1,groupId:1,group:'current',name:'fixture-key',status:'active'};
 const ctx=vm.createContext({...api,console,IS_AIHUB:true,IS_AIHUB_API:true,config:{...settings,...overrides},state:{logs:[],outOfScopeTokens:[]},pendingCandidates:new Map(),guard:{byToken:{},blacklist:[]},tokensCache:[token],checkRevision:0});
 vm.runInContext(read('src/core/selection.js'),ctx);
 vm.runInContext(read('src/runtime/operations.js'),ctx);
 Object.assign(ctx,{getSwitchGuardState:()=>ctx.guard,saveSwitchGuardState:next=>{ctx.guard=next;},getSwitchHistory:()=>({}),addLog:()=>{},validateToken:()=>{},getTokenDetail:async()=>({...token}),
  switchTokenGroup:async(_token,candidate,options)=>{options?.beforeSwitch?.();writes.push(candidate.group);Object.assign(token,{group:candidate.group,groupId:candidate.groupId});},
 });
 return {ctx,token,writes,poll:(rows,options={})=>ctx.processToken(token,rows,options)};
}
for(const mode of ['health','strategy']){
 const r=runtime();r.ctx.pendingCandidates.set(1,{group:'fast',hits:5});
 assert.equal((await r.poll(candidateRows(),{mode})).outcome,'healthy');assert.deepEqual(r.writes,[]);assert.equal(r.ctx.pendingCandidates.size,0,'only-failover mode retires optimization confirmations');
}
for(const current of [
 {summary_models:{fixture:{success_rate:null,tps:50,sample_count:100,range_cache:{cache_hit_rate:.8,usage_records:100,ready:true,stale:false,refreshed_at:fresh}}}},
 {model_detection:null},{model_detection:{applicable:true,status:'refreshing',model:'fixture',detected_at:fresh}},
 {enabled:false},{group_models:['other']},
]){
 const r=runtime();const result=await r.poll(candidateRows({current}));assert.equal(result.outcome,'healthy','unknown/disabled/unsupported is not explicit failure');assert.deepEqual(r.writes,[]);
}
{
 const r=runtime();assert.equal((await r.poll(candidateRows().filter(row=>row.group!=='current'))).outcome,'healthy','missing current data stays unknown');assert.deepEqual(r.writes,[]);
}
for(const mode of ['health','strategy']){
 const r=runtime();const result=await r.poll(broken(),{mode});assert.equal(result.outcome,'switched');assert.deepEqual(r.writes,['fast'],'recovery picks the highest 1h quality in the same model pool');
 assert.equal((await r.poll(candidateRows(),{mode})).outcome,'healthy');assert.deepEqual(r.writes,['fast'],'healthy recovered route does not auto-failback');
}
{
 const r=runtime();const rows=broken().map(row=>row.group==='fast'?{...row,available:false,reasons:['blocked-group']}:row);
 assert.equal((await r.poll(rows)).group,'manual','blocked high-quality target is excluded and the next quality candidate wins');
}
{
 const r=runtime();const rows=broken().map(row=>row.group==='current'?row:{...row,available:false,reasons:['metrics-stale']});assert.equal((await r.poll(rows)).outcome,'recovery-blocked');assert.deepEqual(r.writes,[]);
}
for(const failure of [false,true]){
 const r=runtime({rollbackChecks:2});r.ctx.guard.byToken[1]={model:'fixture',fromGroup:'previous',toGroup:'current',remaining:2,at:now};
 await r.poll(failure?broken():candidateRows({current:{model_detection:null}}),{mode:'health'});
 assert.deepEqual(r.writes,failure?['fast']:[],'observation only recovers for explicit failure and uses the new quality order');
}
{
 const r=runtime();const rows=candidateRows().map(row=>row.group==='manual'?{...row,available:false,reasons:['blocked-group']}:row);
 assert.equal((await r.poll(rows,{forceSwitch:true,targetGroup:'manual',targetGroupId:5,allowUnavailable:true})).outcome,'switched');assert.deepEqual(r.writes,['manual'],'explicit manual risk confirmation bypasses automatic admission');
}
{
 const r=runtime({automaticSwitchMode:'strategy'});const rows=candidateRows({current:{summary_models:{fixture:{success_rate:.96,tps:20,sample_count:100,range_cache:{cache_hit_rate:.4,usage_records:100,ready:true,stale:false,refreshed_at:fresh}}}}},r.ctx.config);
 assert.equal((await r.poll(rows,{mode:'strategy'})).outcome,'pending');assert.equal(r.ctx.pendingCandidates.get(1).hits,1);
 await r.poll(rows,{mode:'health'});assert.equal(r.ctx.pendingCandidates.get(1).hits,1,'health cycle never accumulates quality confirmations');assert.deepEqual(r.writes,[]);
 assert.equal((await r.poll(rows,{mode:'strategy'})).outcome,'switched');assert.deepEqual(r.writes,['fast']);
}
{
 const r=runtime();let called=0;await assert.rejects(r.poll(broken(),{assertCurrent:()=>{called++;throw Error('fixture cancellation');}}),/fixture cancellation/);assert.ok(called>0);assert.deepEqual(r.writes,[],'cancelled decision never writes a group');
}
assert.equal(read('src/runtime/operations.js').includes('prepareAutomaticImageAdmission'),false,'no image admission scheduling remains in runtime');
console.log('PASS 1h failover healthy/unknown hold, explicit failure, quality destination, observation, no failback, manual override, independent confirmations and cancellation (simulated IO)');
