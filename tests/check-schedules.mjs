import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const apiContext = { __KFCODING_GROUP_SWITCHER_TEST__: true };
vm.runInNewContext(read('kfcoding-group-switcher.user.js'), apiContext);
const { sanitizeConfig } = apiContext.__KFCODING_GROUP_SWITCHER_API__;
assert.equal(sanitizeConfig({}).strategySeconds, 300);
assert.equal(sanitizeConfig({ pollSeconds: 45 }).pollSeconds, 45);
assert.equal(sanitizeConfig({ pollSeconds: 45 }).strategySeconds, 300);
assert.equal(sanitizeConfig({ strategySeconds: 0 }).strategySeconds, 15);
assert.equal(sanitizeConfig({ strategySeconds: 9999 }).strategySeconds, 3600);
function runtime(overrides = {}) {
  let now = 1000000, sequence = 0;
  const timers = new Map(), checks = [];
  const ctx = { console, config: sanitizeConfig({ enabled: true, ...overrides }), scheduler: null,
    checkSchedule: { healthAt: 0, strategyAt: 0, revision: 0 }, running: false,
    Date: class extends Date { static now() { return now; } },
    window: {
      setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    onCheck: async options => { checks.push({ at: now, ...options }); },
  };
  vm.createContext(ctx);vm.runInContext(read('src/runtime/operations.js'), ctx);
  vm.runInContext('runCheck = options => onCheck(options);', ctx);
  async function advance(ms) {
    const until = now + ms;
    for (;;) {
      const next = [...timers].sort((a,b) => a[1].at-b[1].at)[0];
      if (!next || next[1].at > until) break;
      now = next[1].at; timers.delete(next[0]); await next[1].callback();
    }
    now = until;
  }
  return { ctx, checks, timers, advance, now: () => now };
}
{
  const r=runtime();r.ctx.scheduleNext(0);await r.advance(0);
  assert.equal(r.checks[0].mode,'strategy');assert.equal(r.checks[0].observeHealth,true);
  await r.advance(300000);
  assert.equal(r.checks.length,11);assert.equal(r.checks.filter(c=>c.mode==='strategy').length,2);
  assert.equal(r.checks.at(-1).at-r.checks[0].at,300000);
  assert.equal(r.timers.size,1,'coincident deadlines share one run and one timer');
}
{
  const r=runtime({ pollSeconds:60,strategySeconds:15 });r.ctx.scheduleNext(0);await r.advance(60000);
  assert.deepEqual(r.checks.map(c=>[c.mode,c.observeHealth]),[['strategy',true],['strategy',false],['strategy',false],['strategy',false],['strategy',true]]);
}
{
  const r=runtime();r.ctx.scheduleNext(0);await r.advance(0);const strategyAt=r.ctx.checkSchedule.strategyAt;
  r.ctx.requestHealthCheck(250);await r.advance(250);
  assert.equal(r.checks.at(-1).mode,'health');assert.equal(r.ctx.checkSchedule.strategyAt,strategyAt);
  r.ctx.running=true;await r.advance(60000);const count=r.checks.length;
  r.ctx.running=false;await r.advance(250);assert.equal(r.checks.length,count+1,'busy checks defer without overlap');
  r.ctx.config.enabled=false;r.ctx.scheduleNext();assert.equal(r.timers.size,0);await r.advance(400000);assert.equal(r.checks.length,count+1);
}
{
  const r=runtime();r.ctx.scheduleNext(250,{immediateStrategy:false});await r.advance(250);
  assert.equal(r.checks[0].mode,'health');assert.equal(r.ctx.checkSchedule.strategyAt,r.now()+299750,'settings changes do not immediately evaluate');
}
{
  const r=runtime();let release;
  r.ctx.onCheck=()=>new Promise(resolve=>{ release=resolve; });r.ctx.scheduleNext(0);
  const first=[...r.timers][0];r.timers.delete(first[0]);const oldRun=first[1].callback();
  r.ctx.config.strategySeconds=600;r.ctx.scheduleNext(250,{immediateStrategy:false});const strategyAt=r.ctx.checkSchedule.strategyAt;
  release();await oldRun;assert.equal(r.ctx.checkSchedule.strategyAt,strategyAt);assert.equal(r.timers.size,1,'old callback does not overwrite newly configured schedule');
}
console.log('Independent health/strategy schedule tests passed');

// Invalid drafts never prevent pausing, and material settings changes retire old confirmations.
for (const invalidDraft of [true, false]) {
  const writes = [], pending = new Map([[1, { group: 'next', hits: 3 }]]);
  let invalidated = 0;
  const ctx = { console, config: sanitizeConfig({ enabled: true, tokenIds: [1], models: ['fixture'] }),
    state: { todayUsage: { available: false }, candidates: [], tokenResults: [] },
    refs: { enabled: { checked: !invalidDraft }, settingsSection: { querySelectorAll: () => invalidDraft
      ? [{ checkValidity: () => false, setAttribute() {}, closest: () => null, getAttribute: () => '故障检测间隔', validationMessage: 'too small' }] : [] } },
    pendingCandidates: pending, IS_AIHUB: true,
    GM_setValue: (key, value) => writes.push(value), STORAGE_CONFIG: 'config',
    invalidateAutomaticImageAdmission: () => { invalidated++; }, targetModelIdentity: () => 'fixture', imageQualitySettingsKey: () => 'same',
    selectBestCandidate: () => null, candidateRecommendationLabel: () => '-',
  };
  vm.createContext(ctx); vm.runInContext(read('src/ui/render.js'), ctx);
  vm.runInContext('render=()=>{};scheduleNext=()=>{};setStatus=()=>{};readFormConfig=()=>({...config,strategySeconds:600});', ctx);
  ctx.persistFormConfig();
  assert.equal(pending.size, 0);assert.equal(invalidated,1);
  if (invalidDraft) {
    assert.equal(ctx.config.enabled,false);assert.equal(writes.at(-1).enabled,false);
    assert.equal(ctx.config.pollSeconds,30);assert.match(ctx.state.settingsError,/故障检测间隔/);
  } else assert.equal(ctx.config.strategySeconds,600);
}
{
  const r=runtime();Object.assign(r.ctx, { state: { candidates: [{group:'new', reasons:[]}], bestGroup:'previous' },
    applyTemporaryBlacklist: rows=>rows, targetModelIdentity: ()=>'fixture',
    selectBestCandidate: rows=>rows[0], candidateRecommendationLabel: row=>row.group });
  vm.runInContext('getSwitchGuardState=()=>({blacklist:[],byToken:{}});',r.ctx);
  r.ctx.refreshCandidateIsolationState(false);assert.equal(r.ctx.state.bestGroup,'previous');
  r.ctx.refreshCandidateIsolationState();assert.equal(r.ctx.state.bestGroup,'new');
}
console.log('Invalid-draft pause, confirmation retirement and health recommendation boundaries passed');
