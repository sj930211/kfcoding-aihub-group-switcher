import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const test = { __KFCODING_GROUP_SWITCHER_TEST__: true };
vm.runInNewContext(read('kfcoding-group-switcher.user.js'), test);
const api = test.__KFCODING_GROUP_SWITCHER_API__;
assert.equal(api.sanitizeConfig({}).automaticSwitchMode, 'strategy', 'old settings retain strategy behavior');
assert.equal(api.sanitizeConfig({ automaticSwitchMode: 'failover' }).automaticSwitchMode, 'failover');
assert.equal(api.sanitizeConfig({ automaticSwitchMode: 'invalid' }).automaticSwitchMode, 'strategy');

// Real provider evaluators must not turn absent or unknown observations into a measured zero.
{
  const now = Date.now();
  const cfg = api.sanitizeConfig({ model: 'fixture' });
  const missing = api.evaluateCandidates({ data: [{ model_name: 'fixture', enable_groups: ['a'] }], group_ratio: { a: 1 } },
    { data: { groups: [{ group: 'a', series: [{ ts: now / 1000, success_rate: null }], success_rate: null }] } }, { a: {} }, cfg, now / 1000)[0];
  assert.equal(api.candidateHasExplicitHealthFailure(missing, cfg), false, 'missing metrics are unknown on KFCoding/ooioo');
  const fluxion = (status, extra = {}) => api.evaluateFluxionCandidates([{ id: 1, name: 'Route', provider: 'openai', primary_model: 'fixture',
    primary_status: status, availability_7d: 100, timeline: [{ checked_at: new Date(now).toISOString(), status, latency_ms: 100 }], ...extra }],
  [{ id: 1, name: 'Route', platform: 'openai', status: 'active', rate_multiplier: 1 }], { 1: 1 }, cfg, now)[0];
  assert.equal(api.candidateHasExplicitHealthFailure(fluxion('unknown'), cfg), false, 'unknown FluxionAI status is not failure');
  assert.equal(api.candidateHasExplicitHealthFailure(fluxion('down'), cfg), true);
  for (const invalidRate of ['', '   ', false, true, null, undefined]) {
    const candidate = fluxion('healthy', { availability_7d: invalidRate });
    assert.ok(Number.isNaN(candidate.aggregateSuccess), 'invalid FluxionAI rate remains unknown: ' + String(invalidRate));
    assert.equal(api.candidateHasExplicitHealthFailure(candidate, cfg), false, 'invalid rate must not trigger recovery');
  }
  for (const validZero of [0, '0']) {
    assert.equal(api.candidateHasExplicitHealthFailure(fluxion('healthy', { availability_7d: validZero }), cfg), true, 'measured zero still triggers recovery');
  }
  assert.equal(api.candidateHasExplicitHealthFailure(fluxion('healthy', { availability_7d: '100' }), cfg), false, 'numeric strings retain compatibility');
}

const settings = api.sanitizeConfig({ enabled: true, automaticSwitchMode: 'failover', models: ['fixture'], tokenIds: [1], rollbackChecks: 0, switchHoldMinutes: 0 });
const row = (group, ratio, extra = {}) => ({ group, groupId: ratio, ratio, available: true, reasons: [], aggregateSuccess: 100,
  latestSuccess: 100, recentMinSuccess: 100, firstTokenLatencyMs: 1000, outputLatencyMs: 1000, ageMinutes: 0,
  healthEvidence: { model: 'fixture', monitoringActive: true, supported: true, metricsMatchModel: true, ageMinutes: 0, latestAgeMinutes: 0 }, ...extra });
function runtime(overrides = {}) {
  const writes = [], imageCalls = [];
  const token = { id: 1, group: 'current', name: 'fixture', status: 'active' };
  const ctx = { ...api, console, IS_AIHUB: true, config: { ...settings, ...overrides },
    state: { logs: [] }, pendingCandidates: new Map([[1, { group: 'cheap', hits: 5 }]]),
    automaticImageAdmission: { bindings: new Map([[1, { token, job: { verdict: { pass: true } } }]]) },
    createImageAdmissionContext: () => ({ configKey: JSON.stringify(ctx.config) }),
    assertImageAdmissionCurrent: () => {}, validateToken: () => {},
    stopAutomaticImageAdmission: async () => { ctx.automaticImageAdmission.bindings.clear(); },
    detachAutomaticImageAdmission: id => ctx.automaticImageAdmission.bindings.delete(Number(id)),
    prepareAutomaticImageAdmission: () => { imageCalls.push('prepare'); throw Error('image evaluation forbidden'); },
    admittedSwitchCandidate: () => { imageCalls.push('admit'); throw Error('image evaluation forbidden'); },
    getSwitchGuardState: () => ctx.guard, saveSwitchGuardState: guard => { ctx.guard = guard; },
    guard: { byToken: {}, blacklist: [] },
    getSwitchHistory: () => ({}), addLog: () => {},
    switchTokenGroup: async (_token, candidate, options) => { options?.beforeSwitch?.(); writes.push(candidate.group); token.group = candidate.group; },
  };
  vm.createContext(ctx);
  vm.runInContext(read('src/runtime/operations.js'), ctx);
  // Keep the real decision functions; replace only IO/lifecycle boundaries.
  vm.runInContext('createImageAdmissionContext = () => ({configKey: JSON.stringify(config)}); assertImageAdmissionCurrent = () => {}; validateToken = () => {}; getSwitchGuardState = () => guard; saveSwitchGuardState = next => {guard = next;}; getSwitchHistory = () => ({}); addLog = () => {}; stopAutomaticImageAdmission = async () => {automaticImageAdmission.bindings.clear();}; detachAutomaticImageAdmission = id => automaticImageAdmission.bindings.delete(Number(id)); switchTokenGroup = async (_token, candidate, options) => {options?.beforeSwitch?.(); onSwitch(candidate);}; prepareAutomaticImageAdmission = () => onImage(); admittedSwitchCandidate = () => onImage();', ctx);
  ctx.onSwitch = candidate => { writes.push(candidate.group); token.group = candidate.group; };
  ctx.onImage = () => { imageCalls.push('image'); throw Error('image evaluation forbidden'); };
  return { ctx, token, writes, imageCalls, poll: (rows, options = {}) => ctx.processToken(token, rows, options) };
}
for (const mode of ['health', 'strategy']) {
  const r = runtime();
  assert.equal((await r.poll([row('current', 4), row('cheap', 1)], { mode })).outcome, 'healthy');
  assert.deepEqual(r.writes, []);
  assert.equal(r.ctx.pendingCandidates.size, 0);
  assert.equal(r.ctx.automaticImageAdmission.bindings.size, 0, 'old image decision retired');
  assert.deepEqual(r.imageCalls, []);
}
for (const extra of [
  { reasons: ['metrics-missing', 'success-low'], aggregateSuccess: NaN },
  { reasons: ['metrics-stale', 'latest-success-low'], latestSuccess: 0, healthEvidence: { ...row('', 1).healthEvidence, ageMinutes: 10000, latestAgeMinutes: 10000 } },
  { reasons: ['blocked-group'] }, { reasons: ['not-whitelisted'] }, { reasons: ['ratio-too-high'] },
  { reasons: ['monitor-disabled'], latestSuccess: 0, healthEvidence: { ...row('', 1).healthEvidence, monitoringActive: false } },
  { reasons: ['latest-unavailable'], latestSuccess: 0, healthEvidence: { ...row('', 1).healthEvidence, metricsMatchModel: false } },
]) {
  const r = runtime();
  const result = await r.poll([row('current', 4, { available: false, ...extra }), row('cheap', 1)]);
  assert.equal(result.outcome, 'healthy', JSON.stringify(extra));
  assert.deepEqual(r.writes, []);
}
{
  const r = runtime();
  assert.equal((await r.poll([row('cheap', 1)])).outcome, 'healthy', 'missing current group is unknown');
}
for (const selectionMode of ['saving', 'stable', 'balanced']) {
  const r = runtime({ selectionMode });
  const broken = row('current', 4, { available: false, reasons: ['latest-success-low'], latestSuccess: 0 });
  const alternatives = [row('cheap', 1, { firstTokenLatencyMs: 12000, recentMinSuccess: 98 }), row('fast', 2)];
  const expected = api.selectBestCandidate(alternatives, 'current', selectionMode).group;
  const result = await r.poll([broken, ...alternatives], { mode: 'health' });
  assert.equal(result.outcome, 'switched'); assert.deepEqual(r.writes, [expected]);
  assert.deepEqual(r.imageCalls, [], 'recovery skips images');
  assert.equal((await r.poll([row('current', .1), ...alternatives])).outcome, 'healthy');
  assert.deepEqual(r.writes, [expected], 'no automatic return after recovery');
}
for (const hasFailure of [false, true]) {
  const r = runtime({ rollbackChecks: 2, selectionMode: 'saving' });
  r.ctx.guard.byToken[1] = { model: 'fixture', fromGroup: 'previous', toGroup: 'current', remaining: 2 };
  const current = row('current', 4, { available: false, reasons: [hasFailure ? 'latest-success-low' : 'model-status-unknown'], latestSuccess: hasFailure ? 0 : 100 });
  await r.poll([current, row('previous', 3), row('cheap', 1)]);
  assert.deepEqual(r.writes, hasFailure ? ['cheap'] : [], 'observation uses explicit failure and configured strategy');
  assert.deepEqual(r.imageCalls, []);
}
{
  const r = runtime();
  assert.equal((await r.poll([row('current', 4), row('manual', 1, { available: false, reasons: ['blocked-group'] })], { forceSwitch: true, targetGroup: 'manual' })).outcome, 'switched');
  assert.deepEqual(r.writes, ['manual']); assert.deepEqual(r.imageCalls, []);
}
console.log('PASS failover configuration, healthy/unknown hold, explicit failures, strategies, observation, no failback and manual bypass (simulated IO)');
