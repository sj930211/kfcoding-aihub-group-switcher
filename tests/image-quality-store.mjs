import { qualityCriteria } from "./fixtures/image-quality.mjs";
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = process.argv[2] || fileURLToPath(new URL('..', import.meta.url));
const code = fs.readFileSync(root + '/src/providers/image-quality.js', 'utf8');
// Execute the real startup migration without mounting UI or issuing requests.
const stateSource = fs.readFileSync(root + '/src/runtime/state.js', 'utf8');
const startup = stateSource.slice(stateSource.indexOf('  // Isolate strict scores'), stateSource.indexOf('  const imageQuality = {'));
assert(startup.includes('GM_setValue(STORAGE_IMAGE_QUALITY, {})'));
const storagePrefix = 'aihub-group-switcher';
const strictStorage = `${storagePrefix}:image-quality:content:v4`;
const legacyStorage = `${storagePrefix}:image-quality:content:v3`;
const migrationStore = { [legacyStorage]: { old: 'legacy result' }, [`${storagePrefix}:image-quality:content:v2`]: { older: 'legacy v2' }, config: { keyId: 7 } };
const migration = {
  IS_AIHUB: true, STORAGE_IMAGE_QUALITY: strictStorage, STORAGE_PREFIX: storagePrefix,
  GM_getValue: (key, fallback) => Object.hasOwn(migrationStore, key) ? migrationStore[key] : fallback,
  GM_setValue: (key, value) => { migrationStore[key] = value; },
};
vm.createContext(migration);
vm.runInContext(startup, migration);
assert.equal(Object.keys(migrationStore[legacyStorage]).length, 0);
assert.equal(Object.keys(migrationStore[`${storagePrefix}:image-quality:content:v2`]).length, 0);
assert.equal(Object.keys(migrationStore[strictStorage]).length, 0);
assert.deepEqual(migrationStore.config, { keyId: 7 });
migrationStore[strictStorage] = { new: 'strict result' };
migrationStore[legacyStorage] = { late: 'old tab write' };
vm.runInContext(startup, migration);
assert.deepEqual(migrationStore[strictStorage], { new: 'strict result' });
assert.deepEqual(migrationStore[legacyStorage], { late: 'old tab write' }, 'migration runs only once');
const otherSite = { ...migration, IS_AIHUB: false, GM_setValue() { assert.fail('other sites must not migrate AIHub scores'); } };
vm.runInNewContext(startup, otherSite);
console.log('PASS strict storage migration retires legacy results once, preserves configuration and isolates old-tab writes');
const now = Date.now();
const criteria80 = qualityCriteria();
criteria80.proportion.score = 6; criteria80.posture.score = 6; criteria80.integration.score = 3;
const old = { groupId: 1, group: 'g', detectionMedia: { status: 'successful', url: 'https://aihub.top/api/v1/public/model-detection-artifacts/old', publishedAt: '2026-10-15' } };
const fresh = { ...old, detectionMedia: { ...old.detectionMedia, url: 'https://aihub.top/api/v1/public/model-detection-artifacts/new', publishedAt: '2026-10-16' } };
const sourceB = { source: JSON.stringify([fresh.detectionMedia.url, fresh.detectionMedia.publishedAt]), md5: 'b'.repeat(32), byteLength: 100, observedAt: now - 1000, catalogAt: now - 2000 };
const store = { cache: {}, sources: { 1: sourceB }, catalogAt: 0 };
const writes = [];
let tail = Promise.resolve();
const locks = { request(name, options, callback) {
  const run = typeof options === 'function' ? options : callback;
  const pending = tail.then(() => run());
  tail = pending.catch(() => {});
  return pending;
} };
const s = {
  console, Date, AbortController, IS_AIHUB: true, navigator: { locks },
  config: { imageQualityKeyId: 1, imageQualityModel: 'v', imageQualityTask: 't' },
  state: { candidates: [old] },
  imageQuality: { catalog: [old], catalogReady: true, catalogAt: now - 3000, catalogRevision: 1,
    hashes: new Map(), sources: { 1: sourceB }, cache: {}, clearing: false },
  STORAGE_IMAGE_QUALITY: 'cache', STORAGE_IMAGE_QUALITY_SOURCES: 'sources', STORAGE_IMAGE_QUALITY_CATALOG_AT: 'catalogAt',
  GM_getValue: key => store[key],
  GM_setValue: (key, value) => { writes.push(key); store[key] = value; },
  render() {},
  aihubDetectionImageUrl: value => /^https:\/\/aihub\.top\/api\/v1\/public\/model-detection-artifacts\/[a-z]+$/.test(value) ? value : '',
};
vm.createContext(s);
vm.runInContext(code, s);
const keyB = s.imageQualityContentKey(sourceB.md5, 100, s.config);
store.cache[keyB] = { task: 20, structure: 30, harmony: 15, finish: 15, score: 80, criteria: criteria80, confidence: 'high', reasons: ['valid'], assessedAt: now - 1000 };
await s.rememberImageQualitySource(old, { md5: 'a'.repeat(32), byteLength: 100 }, now);
assert.equal(store.sources[1].md5, sourceB.md5, 'an older catalog tab must not replace the newer binding after a later download');
vm.runInContext('readImageQualityImage = async () => ({md5:"a".repeat(32),byteLength:100,bytes:new Uint8Array([1])})', s);
await s.refreshImageQualityHashes();
assert.equal(store.sources[1].md5, sourceB.md5, 'old-catalog GC must preserve a newer source');
assert.ok(store.cache[keyB], 'old-catalog GC must preserve the newer source score');
console.log('PASS stale tab cannot replace newer binding or collect its score');

let release;
const gate = new Promise(resolve => { release = resolve; });
const blocker = locks.request('cache:store', async () => gate);
await Promise.resolve();
const beforeClear = writes.length;
const clear = s.clearImageQualityCache();
assert.equal(s.imageQuality.clearing, true, 'clear must mark this page busy while waiting');
await Promise.resolve();
await Promise.resolve();
assert.equal(writes.length, beforeClear, 'clear must wait for the shared store lock before writing');
assert.ok(store.cache[keyB], 'waiting clear must not mutate persisted scores');
release();
await blocker;
await clear;
assert.equal(Object.keys(store.cache).length, 0);
assert.equal(Object.keys(store.sources).length, 0);
assert.equal(s.imageQuality.clearing, false);
console.log('PASS clear waits for store lock and clears both stores after acquisition');

// A group losing its current image must retain a shared revision barrier even
// when GC removes its old source record; otherwise stale tabs can recreate it.
store.sources = { 1: sourceB };
const missing = { ...fresh, detectionMedia: { status: 'failed', url: '' } };
const newerTab = { ...s, state: { candidates: [missing] },
  imageQuality: { ...s.imageQuality, catalog: [missing], catalogAt: now - 500, catalogRevision: 2,
    hashes: new Map(), sources: { 1: sourceB }, cache: {}, refreshPending: false } };
vm.createContext(newerTab);
vm.runInContext(code, newerTab);
await newerTab.refreshImageQualityHashes();
assert.equal(store.sources[1], undefined, 'newer failed-image catalog should remove old binding');
assert.equal(store.catalogAt, newerTab.imageQuality.catalogAt, 'actual refresh must publish its directory watermark');
assert.equal(await s.rememberImageQualitySource(old, { md5: 'a'.repeat(32), byteLength: 100 }, Date.now()), false,
  'stale source registration must explicitly report rejection');
assert.equal(store.sources[1], undefined, 'an older catalog tab must not resurrect a binding removed by newer GC');
console.log('PASS removed source cannot be resurrected by stale catalog tab');

await s.clearImageQualityCache();
assert.equal(store.catalogAt, newerTab.imageQuality.catalogAt, 'manual clear must retain directory watermark');
assert.equal(await s.rememberImageQualitySource(old, { md5: 'a'.repeat(32), byteLength: 100 }, Date.now()), false);
console.log('PASS manual clear preserves watermark and stale-source rejection');

vm.runInContext(`globalThis.paidCalls = 0;
  imageQualityDataUrl = async () => { throw new Error('stale image must not reach encoding'); };
  readImageQualityCredential = async () => { throw new Error('stale image must not read a billing key'); };
  imageQualityFetchJson = async () => { paidCalls += 1; throw new Error('stale image must not issue inference'); };
`, s);
await s.runImageQuality();
assert.equal(s.paidCalls, 0, 'rejected stale binding must not reach a paid inference request');
assert.equal(store.sources[1], undefined);
console.log('PASS rejected stale source stops worker before credential access and inference');

// A shared content score may survive for group 2, but no longer belongs to group 1.
s.imageQuality.catalog = [old, { ...old, groupId: 2 }];
s.imageQuality.sources = { 2: { ...sourceB, source: s.imageQualityIdentity(old) } };
s.imageQuality.hashes.set(s.imageQualityIdentity(old), { md5: sourceB.md5, byteLength: 100 });
s.imageQuality.cache = { [keyB]: { task: 20, structure: 30, harmony: 15, finish: 15, score: 80, criteria: criteria80, confidence: 'high', reasons: ['valid'], assessedAt: now - 1000 } };
assert.equal(s.candidateImageQuality(old), null, 'a removed group binding must hide its score even if another group retains identical content');
assert.equal(s.candidateImageQuality({ ...old, groupId: 2 }).score, 80, 'the remaining group must keep its valid shared score');
console.log('PASS removed group does not borrow a surviving shared-content score');
