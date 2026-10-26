import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const sandbox = { __KFCODING_GROUP_SWITCHER_TEST__: true };
vm.runInNewContext(read('kfcoding-group-switcher.user.js'), sandbox);
const api = sandbox.__KFCODING_GROUP_SWITCHER_API__;
const base = api.sanitizeConfig({ models: ['fixture'], tokenIds: [1], enabled: true, businessPlatform: 'kimi', rollbackChecks: 0 });
assert.equal(base.businessPlatform, 'kimi', 'business scope must survive config sanitization');
assert.equal(api.sanitizeConfig({}).businessPlatform, '', 'legacy config defaults to all');
assert.equal(api.sanitizeConfig({ businessPlatform: 'invalid' }).businessPlatform, '', 'invalid stored scope cannot silently lock out all groups');
const now = Date.now();
const monitors = Array.from({ length: 40 }, (_, index) => ({
  id: String(index + 1), group_id: index + 1, platform: index % 2 ? 'kimi' : 'openai',
  planType: 'g' + (index + 1), group_models: index === 3 ? ['other'] : ['fixture'], probe_model: 'fixture',
  checkedAt: new Date(now).toISOString(), available: true, priceMultiplier: index + 1,
  successRates: { '1h': 1 }, firstTokenLatencyMs: 100, outputTokens: 10, outputTokensPerSecond: 10,
  model_cards: [{ model: 'fixture', health: 'healthy' }],
}));
const groups = monitors.map(m => ({ id: m.group_id, name: m.planType }));
const writes = [], evaluated = [], logs = [];
const token = { id: 1, groupId: 1, group: 'g1', status: 'active' };
const ctx = vm.createContext({ ...api, config: base, IS_AIHUB: true, IS_FLUXION: false, SITE_ID: 'aihub', SITE_LABEL: 'AIHub',
  state: { candidates: [], candidateRequestRevision: 0, candidateRevision: 0, logs: [], tokenResults: [] },
  imageQuality: { catalogRevision: 0, cancelRevision: 0, catalogAt: now },
  automaticImageAdmission: { jobs: new Map(), bindings: new Map(), active: null }, pendingCandidates: new Map(),
  aihubGroupsCache: [], aihubRatesCache: {}, aihubPlatformMonitorsCache: [], pricingCache: {}, tokensCache: [], running: false,
  guard: { byToken: {}, blacklist: [] },
  fetchJson: async () => {}, loadAihubMonitorData: async () => ({ summary: { apis: monitors, providerVersion: 2 }, series: {}, groups, rates: {} }),
  loadAihubProviderData: async () => ({ summary: { apis: monitors, providerVersion: 2 }, series: {} }),
  STORAGE_IMAGE_QUALITY_CATALOG_AT: 'fixture-catalog-at', GM_getValue: () => 0, GM_notification: () => {}, GM_setValue: () => {},
  refs: {}, console,
});
vm.runInContext(read('src/runtime/operations.js'), ctx);
Object.assign(ctx, {
  evaluateAihubCandidates: (summary, ...args) => { evaluated.push(...summary.apis.map(m => m.group_id)); return api.evaluateAihubCandidates(summary, ...args); },
  updateImageQualityCatalog: () => {}, addLog: (...args) => logs.push(args),
  getSwitchGuardState: () => ctx.guard, saveSwitchGuardState: guard => { ctx.guard = guard; },
  validateToken: () => {}, getSwitchHistory: () => ({}),
  switchTokenGroup: async (_token, candidate, options) => { options?.beforeSwitch?.(); writes.push(candidate.group); },
  refreshTodayUsage: async () => {}, refreshTokenCatalog: async () => {},
  getTokenDetail: async () => ({ ...token }), render: () => {}, renderOptions: () => {}, setStatus: () => {},
  scheduleNext: () => {}, updateCountdown: () => {}, summarizeTokenGroups: () => token.group,
});
const load = async (request = {}, health = false) => { evaluated.length = 0; return (await ctx.loadCheckCandidates(['fixture'], health, { currentTokens: [token], ...request })).candidates; };
let rows = await load();
assert.equal(evaluated.length, 20, '19 matching candidates + current health row, never all 40');
assert.deepEqual(evaluated, [1, ...monitors.filter(m => m.platform === 'kimi' && m.group_id !== 4).map(m => m.group_id)].sort((a,b) => a-b));
assert.equal(rows.find(r => r.groupId === 1).scopeEligible, false, 'current health row is not a switch target');
assert.equal(api.selectBestCandidate(rows, '', 'saving').group, 'g2');
const imageChecked = [];
const imageChoice = await api.selectImageQualifiedCandidate(rows, 'elsewhere', { mode: 'saving', preferred: rows.find(row => row.groupId === 1),
  assertCurrent() {}, eligible: candidates => candidates, check: async row => { imageChecked.push(row.groupId); return { pass: true }; }, isolate() {} });
assert.deepEqual(imageChecked, [2], 'outside-scope preferred rows never enter image admission');
assert.equal(imageChoice.groupId, 2);
assert.equal(ctx.aihubPlatformMonitorsCache.length, 40, 'full catalog is retained');
assert.equal(api.scopeAihubMonitors({ apis: monitors }, groups, { ...base, businessPlatform: 'grok' }, ['fixture']).summary.apis.length, 0, 'empty scope never borrows other platforms');
const unknownMonitor = { ...monitors[0], platform: 'unlisted' };
assert.equal(api.scopeAihubMonitors({ apis: [unknownMonitor] }, groups, { ...base, businessPlatform: 'unknown' }, ['fixture']).summary.apis.length, 1);
assert.equal(api.scopeAihubMonitors({ apis: monitors }, groups, base, ['fixture', 'other']).summary.apis.length, 0, 'all target models must coexist in the same group');
ctx.config = { ...base, groupFilterMode: 'whitelist', groupWhitelist: ['g2', 'g4', 'g6', 'g7'] };
rows = await load(); assert.deepEqual(evaluated, [1, 2, 6], 'whitelist + actual model support + platform intersection');
ctx.config = { ...base, groupFilterMode: 'blacklist', groupBlacklist: ['g2'] };
rows = await load(); assert.equal(evaluated.includes(2), false); assert.equal(evaluated.length, 19);
ctx.config = base;
rows = await load({}, true); assert.deepEqual(evaluated, [1], 'health tick evaluates only actual business groups before recovery');
rows = await load({ targetGroup: 'g7' }); assert.deepEqual(evaluated, [1, 7], 'explicit manual destination only evaluates target and current');
assert.equal(api.selectSwitchCandidate(rows, 'g1', 'g7', { allowUnavailable: true }).group, 'g7');
assert.equal(api.selectBestCandidate(rows, '', 'saving'), null, 'manual override must not become an outside-scope strategy recommendation');
ctx.state.candidates = rows;
assert.equal(ctx.manualGroupCatalog().length, 40, 'manual directory retains unassessed outside-scope groups');
assert.equal(ctx.manualGroupCatalog().find(row => row.groupId === 3).catalogOnly, true);
const healthy = (await load()).find(r => r.group === 'g1');
const failed = row => ({ ...row, available: false, latestSuccess: 0, reasons: ['latest-unavailable'],
  ...(row.modelResults ? { modelResults: row.modelResults.map(entry => ({ ...entry, available: false, candidate: failed(entry.candidate) })) } : {}) });
for (const automaticSwitchMode of ['strategy', 'failover']) {
  ctx.config = { ...base, automaticSwitchMode };
  const result = await ctx.processToken(token, [healthy, ...rows.filter(r => r.group !== 'g1')]);
  assert.equal(result.group, 'g1'); assert.equal(writes.length, 0, 'healthy outside scope stays put');
  const broken = failed(healthy);
  const alternatives = await load();
  for (const selectionMode of ['saving', 'stable', 'balanced']) {
    ctx.config.selectionMode = selectionMode;
    const expected = api.selectBestCandidate(alternatives, '', selectionMode).group;
    assert.equal((await ctx.processToken(token, [broken, ...alternatives.filter(r => r.group !== 'g1')])).group, expected);
    assert.equal(writes.pop(), expected, 'recovery follows configured strategy inside scope');
  }
  const resultWithoutTarget = await ctx.processToken(token, [broken]);
  assert.equal(resultWithoutTarget.outcome, 'recovery-blocked'); assert.equal(writes.length, 0);
}
ctx.config = { ...base, rollbackChecks: 2 };
ctx.guard.byToken = { 1: { model: api.targetModelIdentity(base), fromGroup: 'g7', toGroup: 'g1', remaining: 2 } };
const broken = failed(healthy);
rows = await load();
assert.equal((await ctx.processToken(token, [broken, ...rows.filter(r => r.group !== 'g1')])).group, 'g2', 'rollback cannot return to out-of-scope original');
assert.equal(writes.pop(), 'g2');
// Exercise the real runCheck order: fresh token details must reach preselection, not a stale catalog.
ctx.config = { ...base, enabled: false, tokenIds: [1] };
ctx.guard.byToken = {};
ctx.tokensCache = [{ ...token, group: 'g3', groupId: 3 }];
evaluated.length = 0;
await ctx.runCheck({ manual: true });
assert.equal(evaluated.includes(1), true, 'fresh current group checked');
assert.equal(evaluated.includes(3), false, 'stale token group never deeply evaluated');
assert.equal(ctx.state.tokenResults[0]?.group, 'g1');
ctx.imageQuality.scoringToken = { ...token, groupId: 3, group: 'g3' };
evaluated.length = 0;
await ctx.runCheck({ mode: 'health' });
assert.deepEqual(evaluated, [3], 'scoring snapshot preserves the actual business route during temporary scoring');
ctx.imageQuality.scoringToken = null;
// Same display name across platforms must not merge health or target eligibility.
const twins = monitors.slice(0, 2).map(m => ({ ...m, planType: 'shared' }));
const twinGroups = twins.map(m => ({ id: m.group_id, name: 'shared' }));
const scopedTwins = api.scopeAihubMonitors({ apis: twins }, twinGroups, base, ['fixture'], { currentTokens: [{ ...token, group: 'shared' }] });
const twinRows = api.mergeTargetModelCandidates([{ model: 'fixture', candidates: api.evaluateAihubCandidates(scopedTwins.summary, {}, twinGroups, {}, base, now) }])
  .map(row => ({ ...row, scopeEligible: scopedTwins.eligibleIds.has(Number(row.groupId)) }));
assert.equal(twinRows.length, 2, 'same-name group IDs remain independent');
assert.equal(api.selectBestCandidate(twinRows, '', 'saving').groupId, 2);
ctx.config = base;
assert.equal((await ctx.processToken({ ...token, group: 'shared' }, twinRows)).outcome, 'scope-hold');
assert.equal(writes.length, 0);
assert.equal(api.selectSwitchCandidate(twinRows, 'shared', 'shared', { allowUnavailable: true, targetGroupId: 2 }).groupId, 2);
ctx.config = { ...base, enabled: false };
ctx.loadAihubMonitorData = async () => ({ summary: { apis: twins, providerVersion: 2 }, series: {}, groups: twinGroups, rates: {} });
ctx.loadAihubProviderData = async () => ({ summary: { apis: twins, providerVersion: 2 }, series: {} });
ctx.getTokenDetail = async () => ({ ...token, group: 'shared' });
await ctx.runCheck({ manual: true });
await ctx.runCheck({ mode: 'health' });
assert.deepEqual(Array.from(ctx.state.candidates, row => row.groupId), [1, 2], 'health refresh never overwrites a same-name candidate from another platform');
assert.equal(ctx.state.candidates.find(row => row.groupId === 2).scopeEligible, true);
ctx.loadAihubMonitorData = async () => ({ summary: { apis: monitors, providerVersion: 2 }, series: {}, groups, rates: {} });
ctx.loadAihubProviderData = async () => ({ summary: { apis: monitors, providerVersion: 2 }, series: {} });
ctx.getTokenDetail = async () => ({ ...token });
// The UI saves only the business scope, invalidates old decisions and does no IO/check.
vm.runInContext(read('src/ui/render.js'), ctx);
let configWrites = 0, aborted = false;
Object.assign(ctx, { STORAGE_CONFIG: 'fixture-config', GM_setValue: () => { configWrites++; }, render: () => {}, setStatus: () => {} });
ctx.config = { ...base, businessPlatform: '' };
ctx.pendingCandidates.set(1, { group: 'g2', hits: 3 });
ctx.automaticImageAdmission.jobs.set('old', { invalid: false });
ctx.automaticImageAdmission.active = { controller: { abort: () => { aborted = true; } } };
ctx.persistBusinessPlatform('kimi');
assert.equal(ctx.config.businessPlatform, 'kimi'); assert.equal(configWrites, 1);
assert.equal(ctx.pendingCandidates.size, 0); assert.equal(ctx.automaticImageAdmission.jobs.size, 0); assert.equal(aborted, true);
assert.equal(ctx.state.candidates.length, 0, 'stale recommendation is cleared immediately');
ctx.persistBusinessPlatform('kimi'); assert.equal(configWrites, 1, 'same scope is a no-op');
ctx.automaticImageAdmission.active = null;
ctx.config = base;
ctx.switchTokenGroup = async (_token, candidate, options) => {
  ctx.persistBusinessPlatform('grok');
  options.beforeSwitch();
  writes.push(candidate.group);
};
await assert.rejects(ctx.processToken(token, [failed(healthy), ...(await load()).filter(row => row.groupId !== 1)]), /设置.*变更|本轮取消/, 'scope change while awaiting key lock cancels old write');
assert.equal(writes.length, 0);
ctx.config = base;
ctx.switchTokenGroup = async (_token, candidate, options) => {
  ctx.persistBusinessPlatform('grok');
  ctx.persistBusinessPlatform('kimi');
  options.beforeSwitch();
  writes.push(candidate.group);
};
await assert.rejects(ctx.processToken(token, [failed(healthy), ...(await load()).filter(row => row.groupId !== 1)]), /设置.*变更|本轮取消/, 'A to B to A scope changes invalidate an old decision permanently');
assert.equal(writes.length, 0);
ctx.config = { ...base, enabled: false };
ctx.loadAihubMonitorData = async () => {
  ctx.persistBusinessPlatform('grok'); ctx.persistBusinessPlatform('kimi');
  return { summary: { apis: monitors, providerVersion: 2 }, series: {}, groups, rates: {} };
};
await ctx.runCheck({ manual: true });
assert.equal(ctx.state.candidates.length, 0, 'scope round trip while loading cannot repopulate retired candidate rows');
console.log('PASS business scope intersection, current health, recovery/rollback boundaries, manual scope and detailed-evaluation counts');
