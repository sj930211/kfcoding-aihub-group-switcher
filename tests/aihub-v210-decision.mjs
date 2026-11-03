import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const modules = ['runtime/site-config', 'core/config', 'providers/catalog', 'providers/monitor', 'core/selection', 'core/http', 'statistics/usage', 'runtime/version', 'runtime/test-api', 'runtime/state', 'runtime/operations', 'ui/search', 'ui/render', 'ui/mount', 'entry'];
const sandbox = { __KFCODING_GROUP_SWITCHER_TEST__: true };
vm.runInNewContext('(function(){' + modules.map(file => read('src/' + file + '.js')).join('\n') + '\n})();', sandbox);
const api = sandbox.__KFCODING_GROUP_SWITCHER_API__;
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const clock = Date.parse('2026-11-03T10:00:00Z');
class ClockDate extends Date { static now() { return clock; } }
const fresh = new Date(clock - 60000).toISOString();
const base = { enabled: true, models: ['a'], tokenIds: [1], confirmPolls: 2, rollbackChecks: 0, switchHoldMinutes: 0 };
function rows(overrides = {}, config = api.sanitizeConfig(base), extra = {}) {
  const items = [1, 2, 3].map(id => ({ group_id: id, code: 'g' + id, rate_multiplier: 1, group_models: ['a', 'b'],
    summary_models: { a: { success_rate: id === 1 ? .96 : .99, tps: 100, sample_count: 100,
      range_cache: { cache_hit_rate: id === 1 ? .3 : .8, usage_records: 100, ready: true, stale: false, refreshed_at: fresh } } },
    model_detection: { applicable: true, model: 'a', status: 'passed', execution_complete: true, detected_at: fresh, presentation: { text: { result: true } } }, ...overrides[id] }));
  const normalized = api.normalizeAihubProviderData({ version: 2, generated_at: fresh, summary_range: '1h', items, ...extra }, {});
  return api.evaluateAihubCandidates(normalized.summary, {}, items.map(item => ({ id: item.group_id, name: item.code })), {}, config, clock);
}
function runtime(overrides = {}) {
  const writes = [], token = { id: 1, groupId: 1, group: 'g1', name: 'local', status: 'active' };
  const ctx = vm.createContext({ ...api, Date: ClockDate, console, MODEL_IDENTITY_SEPARATOR: '\u001f', IS_AIHUB: true, IS_AIHUB_API: true,
    config: api.sanitizeConfig({ ...base, ...overrides }), state: { logs: [], outOfScopeTokens: [] }, pendingCandidates: new Map(), guard: { byToken: {}, blacklist: [] }, tokensCache: [token] });
  vm.runInContext(read('src/core/config.js') + read('src/core/selection.js') + read('src/runtime/operations.js'), ctx);
  Object.assign(ctx, { getSwitchGuardState: () => api.pruneSwitchGuardState(ctx.guard, clock), saveSwitchGuardState: value => { ctx.guard = api.normalizeSwitchGuardState(value); },
    getSwitchHistory: () => ({}), validateToken() {}, addLog() {},
    switchTokenGroup: async (_token, candidate, options) => { options?.beforeSwitch?.(); writes.push(candidate.groupId); Object.assign(token, { groupId: candidate.groupId, group: candidate.group }); } });
  return { ctx, token, writes, poll: (candidates, options = {}) => ctx.processToken(token, candidates, options) };
}
function useLocalSwitchIO(r) {
  const stubs = Object.fromEntries(['getSwitchGuardState', 'saveSwitchGuardState', 'getSwitchHistory', 'validateToken', 'addLog']
    .map(name => [name, r.ctx[name]]));
  vm.runInContext(read('src/runtime/operations.js'), r.ctx);
  let groupId = r.token.groupId;
  Object.assign(r.ctx, stubs, { getTokenDetail: async () => ({ ...r.token, groupId, group: 'g' + groupId }),
    fetchJson: async (_path, options) => { groupId = options.body.group_id; r.writes.push(groupId); },
    recordSwitchHoldStart() {}, formatRatio: String });
}
const tests = [];
const test = (name, run) => tests.push({ name, run });
test('single legacy model binds selected key IDs, explicit empty bindings remain empty, multiple models never guessed', () => {
  assert.deepEqual(plain(api.sanitizeConfig(base).tokenModels), { 1: 'a' });
  assert.deepEqual(plain(api.sanitizeConfig({ ...base, models: ['a', 'b'] }).tokenModels), {});
  assert.deepEqual(plain(api.sanitizeConfig({ ...base, tokenModels: {} }).tokenModels), {});
  const disabled = api.sanitizeConfig({ ...base, tokenModels: { 1: 'b', bad: 'a', 2: '' } });
  assert.equal(disabled.tokenModels[1], 'b');
  assert.equal(api.tokenDecisionModel(disabled, 1), '', 'disabled model bindings are preserved but inactive');
});
test('normal choice keeps ties and gains below five, missing current data cannot trigger optimization', async () => {
  for (const candidates of [rows().map(row => ({ ...row, aggregateSuccess: 99, cacheHitRate: 80 })), rows().map(row => ({ ...row, aggregateSuccess: row.groupId === 1 ? 98.9 : 99, cacheHitRate: 80 })), rows().filter(row => row.groupId !== 1), rows().map(row => row.groupId === 1 ? { ...row, available: false, reasons: ['cache-metrics-missing'] } : row)]) {
    const r = runtime({ confirmPolls: 1 }); await r.poll(candidates); assert.deepEqual(r.writes, []);
    assert.equal(r.ctx.pendingCandidates.size, 0);
  }
});
test('same metrics and global refresh never accumulate confirmation; a changed sample does', async () => {
  const r = runtime(), initial = rows();
  assert.equal((await r.poll(initial)).outcome, 'pending');
  await r.poll(rows({}, r.ctx.config, { generated_at: new Date(clock).toISOString() }));
  assert.equal(r.ctx.pendingCandidates.get(1).hits, 1);
  await r.poll(initial, { mode: 'health' });
  assert.equal(r.ctx.pendingCandidates.get(1).hits, 1);
  assert.deepEqual(r.writes, []);
  const changed = initial.map(row => row.groupId === 2 ? { ...row, aihubMetricSampleCount: 101 } : row);
  assert.equal((await r.poll(changed)).outcome, 'switched'); assert.deepEqual(r.writes, [2]);
});
test('unknown current evidence in a health poll clears prior optimization confirmations', async () => {
  const r = runtime(), initial = rows();
  await r.poll(initial);
  assert.equal(r.ctx.pendingCandidates.get(1).hits, 1);
  const unknown = initial.map(row => row.groupId === 1
    ? { ...row, aggregateSuccess: NaN, available: false, reasons: ['metrics-missing', 'success-low'] } : row);
  assert.equal((await r.poll(unknown, { mode: 'health' })).outcome, 'healthy');
  assert.equal(r.ctx.pendingCandidates.has(1), false);
  const changed = initial.map(row => row.groupId === 2 ? { ...row, aihubMetricSampleCount: 101 } : row);
  assert.equal((await r.poll(changed)).outcome, 'pending');
  assert.equal(r.ctx.pendingCandidates.get(1).hits, 1);
  assert.deepEqual(r.writes, []);
});
test('rollback observation ignores same-group publications belonging to a different model', async () => {
  const r = runtime({ rollbackChecks: 2 }); Object.assign(r.token, { groupId: 2, group: 'g2' });
  r.ctx.guard.byToken[1] = { model: 'a', fromGroup: 'g1', fromGroupId: 1, toGroup: 'g2', toGroupId: 2,
    remaining: 2, switchAt: clock - 30000, at: clock - 30000 };
  const wrong = { ...rows()[1], aihubMetricModel: 'b', targetModels: ['b'],
    aihubMetricWindowEnd: new Date(clock - 1000).toISOString() };
  assert.equal((await r.ctx.handleRollbackGuard(r.token, [wrong], () => {})).outcome, 'observing');
  assert.equal(r.ctx.guard.byToken[1].remaining, 2);
  assert.deepEqual(r.writes, []);
});
test('unbound key pauses and detection of another model cannot change its binding or cause recovery', async () => {
  const unbound = runtime({ models: ['a', 'b'] });
  assert.equal((await unbound.poll(rows())).outcome, 'model-hold'); assert.deepEqual(unbound.writes, []);
  const bound = runtime({ models: ['a', 'b'], tokenModels: { 1: 'b' } });
  assert.equal((await bound.poll(rows())).outcome, 'model-hold'); assert.deepEqual(bound.writes, []);
  assert.equal(bound.ctx.config.tokenModels[1], 'b');
});
test('only cache or TPS gaps enter emergency layer; complete candidates always take precedence', async () => {
  const currentFailure = { model_detection: { applicable: true, model: 'a', status: 'failed', execution_complete: true, detected_at: fresh, presentation: { text: { result: false } } } };
  const all = rows({ 1: currentFailure });
  const emergency = { ...all[1], available: false, outputTokensPerSecond: NaN, cacheHitRate: NaN, reasons: ['tps-missing', 'cache-metrics-missing', 'cache-stale'], emergencyEligible: true };
  const r = runtime(); assert.equal((await r.poll([all[0], emergency, all[2]])).group, 'g3'); assert.deepEqual(r.writes, [3]);
  const e = runtime(); assert.equal((await e.poll([all[0], emergency])).outcome, 'switched'); assert.deepEqual(e.writes, [2]);
  for (const reason of ['metrics-missing', 'success-low', 'model-detection-failed', 'ratio-unknown', 'outside-monitor-scope', 'temporarily-blacklisted']) {
    const unsafe = runtime();
    if (reason === 'temporarily-blacklisted') unsafe.ctx.guard.blacklist.push({ model: 'a', group: 'g2', groupId: 2, until: clock + 60000 });
    await unsafe.poll([all[0], { ...emergency, reasons: [...emergency.reasons, reason] }]); assert.deepEqual(unsafe.writes, [], reason + ' cannot be relaxed by recovery');
  }
});
test('real candidate evaluation distinguishes emergency gaps from unknown success or sample count', () => {
  const first = rows()[1];
  const metric = { success_rate: .99, sample_count: 100, tps: null, range_cache: {} };
  const candidate = rows({ 2: { summary_models: { a: metric } } })[1];
  assert.equal(candidate.available, false); assert.equal(candidate.emergencyEligible, true);
  assert.ok(candidate.reasons.includes('tps-missing'));
  for (const data of [{ ...metric, success_rate: null }, { ...metric, sample_count: null }, { ...metric, success_rate: .7 }]) {
    assert.equal(rows({ 2: { summary_models: { a: data } } })[1].emergencyEligible, false);
  }
  assert.equal(first.available, true);
});
test('observation needs a new post-switch health publication; cache/global timestamps do not count', async () => {
  const r = runtime({ rollbackChecks: 2 }); Object.assign(r.token, { groupId: 2, group: 'g2' });
  const initial = rows();
  r.ctx.guard.byToken[1] = { model: 'a', fromGroup: 'g1', fromGroupId: 1, toGroup: 'g2', toGroupId: 2, remaining: 2, at: clock - 30000, switchAt: clock - 30000 };
  assert.equal((await r.poll(initial, { mode: 'health' })).outcome, 'observing'); assert.equal(r.ctx.guard.byToken[1].remaining, 2);
  const after = initial.map(row => row.groupId === 2 ? { ...row, modelDetection: { ...row.modelDetection, detectedAt: new Date(clock - 1000).toISOString(), detectedAtMs: clock - 1000 } } : row);
  await r.poll(after, { mode: 'health' }); assert.equal(r.ctx.guard.byToken[1].remaining, 1);
  await r.poll(after, { mode: 'health' }); assert.equal(r.ctx.guard.byToken[1].remaining, 1, 'same health publication is counted once');
  const persisted = api.normalizeSwitchGuardState(r.ctx.guard); assert.equal(persisted.byToken[1].remaining, 1); assert.ok(persisted.byToken[1].lastEvidence);
  const next = after.map(row => row.groupId === 2 ? { ...row, modelDetection: { ...row.modelDetection, detectedAtMs: clock, detectedAt: new Date(clock).toISOString() } } : row);
  assert.equal((await r.poll(next, { mode: 'health' })).outcome, 'observed'); assert.equal(r.ctx.guard.byToken[1], undefined);
});
test('observation timeout remains unverified and keeps recovery enabled', async () => {
  const r = runtime({ rollbackChecks: 2 }); Object.assign(r.token, { groupId: 2, group: 'g2' });
  r.ctx.guard.byToken[1] = { model: 'a', fromGroup: 'g1', fromGroupId: 1, toGroup: 'g2', toGroupId: 2, remaining: 2, switchAt: clock - 601000, at: clock - 601000 };
  const result = await r.poll(rows(), { mode: 'strategy' }); assert.equal(result.outcome, 'observation-unverified'); assert.deepEqual(r.writes, []);
});
test('emergency order uses model sample penalty, and rollback cannot downgrade a complete layer', () => {
  const r = runtime(), all = rows();
  const emergency = (row, p, n) => ({ ...row, available: false, emergencyEligible: true, reasons: ['tps-missing'], outputTokensPerSecond: NaN, aggregateSuccess: p, aihubMetricSampleCount: n });
  const low = emergency(all[1], 100, 10), high = emergency(all[2], 99, 1000);
  assert.equal(r.ctx.selectRecoveryCandidate([low, high], 'a', r.ctx.config).groupId, 3);
  assert.equal(r.ctx.selectRecoveryCandidate([low, all[2]], 'a', r.ctx.config, { groupId: 2 }).groupId, 3);
  assert.equal(r.ctx.selectRecoveryCandidate([low, high], 'a', r.ctx.config, { groupId: 2 }).groupId, 2, 'exact previous ID preferred within the chosen tier');
});
test('observation failure prefers the safe exact original group in either automatic mode', async () => {
  const failed = rows({ 2: { model_detection: { applicable: true, model: 'a', status: 'failed',
    execution_complete: true, detected_at: fresh, presentation: { text: { result: false } } } } });
  for (const automaticSwitchMode of ['strategy', 'failover']) {
    const r = runtime({ automaticSwitchMode, rollbackChecks: 2 });
    Object.assign(r.token, { groupId: 2, group: 'g2' });
    r.ctx.guard.byToken[1] = { model: 'a', fromGroup: 'g1', fromGroupId: 1, toGroup: 'g2', toGroupId: 2,
      remaining: 2, switchAt: clock - 30000, at: clock - 30000 };
    assert.equal((await r.poll(failed, { mode: 'health' })).outcome, 'rolled-back');
    assert.deepEqual(r.writes, [1], automaticSwitchMode + ' rollback uses exact original ID within complete candidates');
  }
});
test('an emergency rollback starts a fresh persisted observation of its destination', async () => {
  const r = runtime({ automaticSwitchMode: 'failover', rollbackChecks: 2 });
  Object.assign(r.token, { groupId: 2, group: 'g2' });
  useLocalSwitchIO(r);
  r.ctx.guard.byToken[1] = { model: 'a', fromGroup: 'g1', fromGroupId: 1, toGroup: 'g2', toGroupId: 2,
    remaining: 2, switchAt: clock - 30000, at: clock - 30000 };
  const candidates = rows({ 2: { model_detection: { applicable: true, model: 'a', status: 'failed',
    execution_complete: true, detected_at: fresh, presentation: { text: { result: false } } } } }).slice(0, 2);
  candidates[0] = { ...candidates[0], available: false, emergencyEligible: true,
    outputTokensPerSecond: NaN, reasons: ['tps-missing'] };
  assert.equal((await r.poll(candidates, { mode: 'health' })).outcome, 'rolled-back');
  assert.deepEqual(r.writes, [1]);
  assert.equal(r.ctx.guard.byToken[1]?.toGroupId, 1);
  assert.equal(r.ctx.guard.byToken[1]?.model, 'a');
  assert.equal(r.ctx.guard.byToken[1]?.switchAt, clock);
  assert.equal(r.ctx.guard.byToken[1]?.remaining, 2);
  Object.assign(r.token, { groupId: 1, group: 'g1' });
  assert.equal((await r.poll(candidates, { mode: 'health' })).outcome, 'observing');
  assert.equal(r.ctx.guard.byToken[1].remaining, 2);
});
test('global multi-model history is retained but never applied to single-model binding', async () => {
  const r = runtime({ models: ['a', 'b'], tokenModels: { 1: 'a' } });
  r.ctx.guard = { byToken: { 1: { model: 'a\u001fb', fromGroup: 'g3', toGroup: 'g1', remaining: 2, at: clock - 1000 } },
    blacklist: [{ model: 'a\u001fb', group: 'g2', groupId: 2, until: clock + 60000 }] };
  await r.poll(rows());
  assert.equal(r.ctx.guard.byToken[1].model, 'a\u001fb');
  assert.equal(r.ctx.pendingCandidates.get(1).groupId, 2, 'old cross-model isolation cannot exclude the bound-model candidate');
  assert.deepEqual(r.writes, []);
});
test('legacy observation restarts unverified, and key model permission blocks automatic changes', async () => {
  const r = runtime({ rollbackChecks: 2 }); Object.assign(r.token, { groupId: 2, group: 'g2' });
  r.ctx.guard.byToken[1] = { model: 'a', fromGroup: 'g1', toGroup: 'g2', remaining: 1, at: clock - 10000 };
  await r.poll(rows(), { mode: 'health' });
  assert.equal(r.ctx.guard.byToken[1].remaining, 2); assert.equal(r.ctx.guard.byToken[1].switchAt, clock);
  const noPermission = runtime(); Object.assign(noPermission.token, { model_limits_enabled: true, model_limits: ['b'] });
  assert.equal((await noPermission.poll(rows())).outcome, 'model-hold'); assert.deepEqual(noPermission.writes, []);
});
test('minimum gain zero still keeps an exactly tied current group, replayed evidence cannot reach three hits', async () => {
  const tie = runtime({ minQualityGain: 0, confirmPolls: 1 }); Object.assign(tie.token, { groupId: 3, group: 'g3' });
  const equal = rows().map(row => ({ ...row, aggregateSuccess: 99, cacheHitRate: 80 }));
  await tie.poll(equal); assert.deepEqual(tie.writes, []);
  const r = runtime({ confirmPolls: 3 }), first = rows();
  const second = first.map(row => row.groupId === 2 ? { ...row, aihubMetricSampleCount: 101 } : row);
  await r.poll(first); await r.poll(second); await r.poll(first);
  assert.equal(r.ctx.pendingCandidates.get(1).hits, 2); assert.deepEqual(r.writes, []);
});
test('saving scoring settings redraws candidate scores from the same snapshot without a request', () => {
  class Node {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); return node; }
    replaceChildren(...nodes) { this.children = nodes; }
    querySelectorAll() { return []; }
    addEventListener() {}
    setAttribute() {}
  }
  const r = runtime();
  vm.runInContext(read('src/ui/render.js'), r.ctx);
  const container = new Node('div');
  Object.assign(r.ctx, { running: false, renderedSections: new WeakMap(), refs: { candidateRows: container },
    document: { createElement: tag => new Node(tag) }, refreshPlatformFilter() {}, applyCandidateDisplayControls() {},
    normalizeGroupPlatform: String, groupPlatforms: {}, formatRatio: String, formatPercent: String,
    candidateIssueText: () => '', fetch() { throw Error('redraw must not request network'); } });
  r.ctx.state.candidates = rows();
  r.ctx.renderCandidates();
  const first = container.children.find(node => node.dataset.groupId === '1');
  const before = first.dataset.score;
  r.ctx.config.qualityWeights = { success: 0, cache: 0, tps: 0, ratio: 100 };
  r.ctx.renderCandidates();
  const second = container.children.find(node => node.dataset.groupId === '1');
  assert.notEqual(second.dataset.score, before);
  assert.equal(Number(second.dataset.score), 50);
  r.ctx.config.minSuccessRate = 100;
  r.ctx.renderCandidates();
  assert.equal(container.children.every(node => node.dataset.score === ''), true, 'success threshold changes retire old scores too');
});
let failures = 0;
for (const { name, run } of tests) { try { await run(); console.log('PASS ' + name); } catch (error) { failures++; console.error('FAIL ' + name + '\n' + error.stack); } }
assert.equal(failures, 0, 'all decision regression cases must pass');
console.log('PASS 2.1 decision safety: local source VM and simulated IO only');
