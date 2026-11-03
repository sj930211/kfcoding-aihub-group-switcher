import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const modules = ['runtime/site-config', 'core/config', 'providers/catalog', 'providers/monitor', 'core/selection', 'core/http',
  'statistics/usage', 'runtime/version', 'runtime/test-api', 'runtime/state', 'runtime/operations', 'ui/search', 'ui/render', 'ui/mount', 'entry'];
const sandbox = { __KFCODING_GROUP_SWITCHER_TEST__: true };
vm.runInNewContext('(function(){' + modules.map(file => read('src/' + file + '.js')).join('\n') + '\n})();', sandbox);
const api = sandbox.__KFCODING_GROUP_SWITCHER_API__;
const settings = api.sanitizeConfig({ enabled: false, models: ['fixture'], tokenIds: [1], rollbackChecks: 2, switchHoldMinutes: 0, confirmPolls: 1 });
const candidate = (groupId, group = 'shared', overrides = {}) => ({ groupId, group, providerId: 'aihub', available: true, reasons: [],
  aihubMetricModel: 'fixture', ratio: 1, aggregateSuccess: 99, cacheHitRate: 80, outputTokensPerSecond: 60,
  aihubMetricSampleCount: 100, aihubCacheSampleCount: 100, scopeEligible: true, ...overrides });
const failed = (groupId, group = 'shared') => candidate(groupId, group, { available: false, reasons: ['model-detection-failed'],
  healthEvidence: { providerVersionValid: true, supported: true, monitoringActive: true, model: 'fixture', modelDetectionFresh: true, modelDetectionFailed: true } });

function runtime(rows, overrides = {}) {
  const writes = [], messages = [];
  const token = { id: 1, name: 'fixture-key', status: 'active', groupId: 1, group: 'current' };
  const refs = Object.fromEntries(['manualScopeDialog', 'manualScopeCancel', 'manualScopeTitle', 'manualScopeTarget', 'manualScopeRisk',
    'manualScopeHint', 'manualScopeAdd', 'manualScopeOnce'].map(name => [name, { focus() {}, showModal() { this.open = true; } }]));
  const ctx = vm.createContext({ ...api, console, MODEL_IDENTITY_SEPARATOR: '\u001f', config: { ...settings, ...overrides }, token, refs, running: false,
    IS_AIHUB: true, IS_AIHUB_API: true, IS_FLUXION: false, SITE_ID: 'aihub', SITE_LABEL: 'AIHub', checkRevision: 0,
    state: { candidates: [], tokenResults: [], logs: [], outOfScopeTokens: [], candidateRequestRevision: 0, candidateRevision: 0 },
    pendingCandidates: new Map(), tokensCache: [token], guard: { byToken: {}, blacklist: [] },
    GM_notification() {}, fetchJson: async () => { throw Error('unexpected network'); },
  });
  vm.runInContext(read('src/core/config.js') + '\n' + read('src/core/selection.js') + '\n' + read('src/runtime/operations.js') + '\n' + read('src/ui/render.js'), ctx);
  Object.assign(ctx, { getSwitchGuardState: () => api.pruneSwitchGuardState(ctx.guard, Date.now()),
    saveSwitchGuardState: value => { ctx.guard = api.normalizeSwitchGuardState(value); }, getSwitchHistory: () => ({}),
    getTokenDetail: async () => ({ ...token }), loadCheckCandidates: async () => ({ candidates: rows, monitorFallback: false }),
    refreshTodayUsage: async () => {}, refreshTokenCatalog: async () => {}, render() {}, renderOptions() {},
    addLog: message => messages.push(message), setStatus: message => messages.push(message),
    switchTokenGroup: async (_token, selected, options) => { options?.beforeSwitch?.(); writes.push(selected.groupId); },
  });
  return { ctx, token, writes, messages, refs };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });
test('single isolation removal uses its exact ID and undo retains other same-name entries', () => {
  const now = Date.now(), guard = { blacklist: [1, 2].map(groupId => ({ model: 'fixture', group: 'shared', groupId, until: now + 10000 })) };
  const result = api.removeIsolation(guard, 'fixture', 'shared', now, 1);
  assert.deepEqual(Array.from(result.removed, entry => entry.groupId), [1]);
  assert.deepEqual(Array.from(result.state.blacklist, entry => entry.groupId), [2]);
  assert.deepEqual(Array.from(api.restoreIsolations(result.state, result.removed, now).blacklist, entry => entry.groupId).sort(), [1, 2]);
  assert.equal(api.removeIsolation(guard, 'other-model', 'shared', now, 1).removed.length, 0);
  assert.equal(api.removeIsolation(guard, 'fixture', 'shared', now, 99).removed.length, 0);
});
test('legacy isolation names are removable only when unambiguous', () => {
  const now = Date.now(), guard = { blacklist: [1, 2].map(groupId => ({ model: 'fixture', group: 'shared', groupId, until: now + 10000 })) };
  assert.equal(api.removeIsolation(guard, 'fixture', 'shared', now).removed.length, 0);
  assert.equal(api.removeIsolation({ blacklist: [{ model: 'fixture', group: 'legacy', until: now + 10000 }] }, 'fixture', 'legacy', now).removed.length, 1);
  assert.equal(api.removeIsolation(guard, 'fixture', 'shared', now, 'invalid').removed.length, 0);
});
test('isolation row click carries the ID through runtime removal and undo', () => {
  const r = runtime([]), nodes = [];
  const element = () => ({ children: [], replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); }, setAttribute(key, value) { this[key] = value; },
    addEventListener(event, handler) { this[event] = handler; } });
  Object.assign(r.ctx, { document: { createElement() { const node = element(); nodes.push(node); return node; } },
    window: { setTimeout() { return 1; }, clearTimeout() {} }, isolationUndoScheduler: null });
  r.refs.isolationRows = element();
  r.ctx.guard.blacklist = [1, 2].map(groupId => ({ model: 'fixture', group: 'shared', groupId, until: Date.now() + 10000 }));
  r.ctx.renderIsolations();
  const button = nodes.find(node => node['aria-label']?.includes('#1'));
  assert.ok(button, 'the exact group ID must be visible to assistive technology');
  assert.ok(nodes.some(node => node.textContent?.includes('#1')), 'same-name groups need a visible ID');
  button.click();
  assert.deepEqual(Array.from(r.ctx.guard.blacklist, entry => entry.groupId), [2]);
  r.ctx.undoIsolationClear();
  assert.deepEqual(Array.from(r.ctx.guard.blacklist, entry => entry.groupId).sort(), [1, 2]);
});
test('same-name ID transitions retain their observation and distinct IDs', () => {
  const r = runtime([]); r.token.group = 'shared';
  r.ctx.recordRollbackGuard(r.token, candidate(2));
  assert.equal(r.ctx.guard.byToken[1]?.fromGroupId, 1);
  assert.equal(r.ctx.guard.byToken[1]?.toGroupId, 2);
  assert.equal(r.ctx.guard.byToken[1]?.remaining, 2);
  const normalized = api.normalizeSwitchGuardState({ byToken: { 1: { model: 'fixture', fromGroup: 'shared', toGroup: 'shared', fromGroupId: 1, toGroupId: 2, remaining: 2 } } });
  assert.equal(normalized.byToken[1]?.toGroupId, 2);
  assert.equal(api.normalizeSwitchGuardState({ byToken: { 1: { model: 'fixture', fromGroup: 'old-name', toGroup: 'new-name', fromGroupId: 2, toGroupId: 2, remaining: 2 } } }).byToken[1], undefined);
});
test('rollback prefers an exact previous ID and never guesses an ambiguous old name', () => {
  const rows = [candidate(3, 'shared', { ratio: 2 }), candidate(1), candidate(4, 'other')];
  assert.equal(api.selectRollbackCandidate(rows, { group: 'shared', groupId: 1 }).candidate.groupId, 1);
  assert.equal(api.selectRollbackCandidate(rows, { group: 'shared', groupId: 1 }).usedPrevious, true);
  assert.equal(api.selectRollbackCandidate(rows, 'shared').usedPrevious, false);
  assert.equal(api.selectRollbackCandidate([candidate(1, 'previous'), candidate(4, 'other')], 'previous').candidate.groupId, 1);
});
test('an observation cannot follow a different ID with the same display name', async () => {
  const r = runtime([candidate(1, 'previous'), failed(3)], { enabled: true });
  Object.assign(r.token, { groupId: 3, group: 'shared' });
  r.ctx.guard.byToken[1] = { model: 'fixture', fromGroup: 'previous', fromGroupId: 1, toGroup: 'shared', toGroupId: 2, remaining: 2 };
  assert.equal(await r.ctx.handleRollbackGuard(r.token, [candidate(1, 'previous'), failed(3)]), null);
  assert.deepEqual(r.writes, []);
  assert.equal(r.ctx.guard.blacklist.length, 0);
});
test('legacy observations with ambiguous destination names never trigger rollback', async () => {
  const rows = [candidate(1, 'previous'), candidate(2), failed(3)];
  const r = runtime(rows, { enabled: true }); Object.assign(r.token, { groupId: 3, group: 'shared' });
  r.ctx.guard.byToken[1] = { model: 'fixture', fromGroup: 'previous', toGroup: 'shared', remaining: 2 };
  assert.equal(await r.ctx.handleRollbackGuard(r.token, rows), null);
  assert.deepEqual(r.writes, []); assert.equal(r.ctx.guard.blacklist.length, 0);
});
test('rollback and isolation keep same-name groups and model pools separate', async () => {
  const rows = [candidate(3, 'shared', { aihubMetricModel: 'other' }), candidate(1), failed(2)];
  const r = runtime(rows, { enabled: true }); Object.assign(r.token, { groupId: 2, group: 'shared' });
  r.ctx.guard.byToken[1] = { model: 'fixture', fromGroup: 'shared', fromGroupId: 1, toGroup: 'shared', toGroupId: 2, remaining: 2 };
  assert.equal((await r.ctx.handleRollbackGuard(r.token, rows)).outcome, 'rolled-back');
  assert.deepEqual(r.writes, [1]); assert.equal(r.ctx.guard.blacklist[0]?.groupId, 2);
  const isolated = api.applyTemporaryBlacklist(rows, r.ctx.guard, 'fixture', Date.now());
  assert.equal(isolated.find(row => row.groupId === 1).available, true);
  assert.equal(isolated.find(row => row.groupId === 3).available, true);
  assert.equal(isolated.find(row => row.groupId === 2).reasons.includes('temporarily-blacklisted'), true);
  const restored = api.restoreIsolations({}, [1, 2].map(groupId => ({ model: 'fixture', group: 'shared', groupId, until: Date.now() + 10000 })), Date.now());
  assert.equal(restored.blacklist.length, 2);
  const mixed = api.restoreIsolations({}, [{ model: 'fixture', group: 'shared', groupId: 1, until: Date.now() + 10000 },
    { model: 'fixture', group: '1', until: Date.now() + 10000 }], Date.now());
  assert.equal(mixed.blacklist.length, 2, 'legacy numeric names cannot overwrite an ID isolation');
});
test('legacy unique-name observations still roll back to their previous group', async () => {
  const rows = [candidate(1, 'previous'), failed(2, 'current')];
  const r = runtime(rows, { enabled: true }); Object.assign(r.token, { groupId: 2 });
  r.ctx.guard.byToken[1] = { model: 'fixture', fromGroup: 'previous', toGroup: 'current', remaining: 2 };
  assert.equal((await r.ctx.handleRollbackGuard(r.token, rows)).outcome, 'rolled-back'); assert.deepEqual(r.writes, [1]);
});
test('stale available target stops before writes and asks for its latest risk after unlocking', async () => {
  const latest = failed(2, 'target'); const r = runtime([candidate(1, 'current'), latest]);
  await r.ctx.manualSwitchToGroup(candidate(2, 'target'), 'once');
  assert.deepEqual(r.writes, []); assert.equal(r.ctx.running, false);
  const pending = vm.runInContext('pendingManualScopeCandidate', r.ctx);
  assert.equal(pending?.available, false, r.messages.join(' | '));
  assert.equal(r.refs.manualScopeDialog.open, true); assert.match(r.refs.manualScopeRisk.textContent, /风险/);
  await r.ctx.manualSwitchToGroup(pending, 'cancel');
  assert.deepEqual(r.writes, [], 'cancelling the new risk leaves the token unchanged');
  await r.ctx.manualSwitchToGroup(pending, 'once');
  assert.deepEqual(r.writes, [2], 'only the explicit risk confirmation allows the unavailable target');
});
test('available fresh manual target executes without a risk dialog', async () => {
  const target = candidate(2, 'target'); const r = runtime([candidate(1, 'current'), target]);
  await r.ctx.manualSwitchToGroup(target, 'once');
  assert.deepEqual(r.writes, [2]); assert.equal(r.refs.manualScopeDialog.open, undefined);
});
test('an unavailable process target requires explicit override authorization', async () => {
  const rows = [candidate(1, 'current'), failed(2, 'target')], r = runtime(rows);
  await assert.rejects(r.ctx.processToken(r.token, rows, { forceSwitch: true, targetGroup: 'target', targetGroupId: 2 }));
  assert.deepEqual(r.writes, []);
  await r.ctx.processToken(r.token, rows, { forceSwitch: true, targetGroup: 'target', targetGroupId: 2, allowUnavailable: true });
  assert.deepEqual(r.writes, [2]);
});
let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log('PASS ' + name); }
  catch (error) { failures += 1; console.error('FAIL ' + name + '\n' + error.stack); }
}
if (failures) process.exitCode = 1;
else console.log('PASS decision safety: ' + tests.length + ' cases; source VM, simulated IO, no build or real switching');
