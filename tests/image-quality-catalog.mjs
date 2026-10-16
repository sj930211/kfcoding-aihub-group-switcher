import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const repo = process.argv[2] || fileURLToPath(new URL('..', import.meta.url));
const imageModule = fs.readFileSync(path.join(repo, 'src/providers/image-quality.js'), 'utf8');
const monitorModule = fs.readFileSync(path.join(repo, 'src/providers/monitor.js'), 'utf8');
const oldMd5 = '900150983cd24fb0d6963f7d28e17f72';
const urlBase = 'https://aihub.top/api/v1/public/model-detection-artifacts/';
const criteria80 = Object.fromEntries([
  ["subject",20],["object",10],["relation",10],["anatomy",5],["frame",5],["wheels",5],["contact",5],["composition",10],["coherence",10],
].map(([key,score])=>[key,{score,evidence:"valid visible evidence"}]));
const reports = [];

for (const sameBytes of [true, false]) {
  const old = { group: 'A', groupId: 1, detectionMedia: { status: 'successful', url: urlBase + 'old', publishedAt: 'v1' } };
  const latest = { ...old, detectionMedia: { ...old.detectionMedia, url: urlBase + 'new', publishedAt: 'v2' } };
  const stored = {};
  let releaseOld;
  const ctx = {
    IS_AIHUB: true, AbortController, Map, Date, navigator: {},
    STORAGE_IMAGE_QUALITY: 'cache', STORAGE_IMAGE_QUALITY_SOURCES: 'sources',
    STORAGE_IMAGE_QUALITY_CATALOG_AT: 'catalog-at',
    GM_getValue: (key, fallback) => stored[key] ?? fallback,
    GM_setValue: (key, value) => { stored[key] = value; },
    render() {},
    fetch() { throw new Error('This replay must never call a real endpoint'); },
    state: { candidates: [old] },
    config: { imageQualityKeyId: 1, imageQualityModel: 'vision', imageQualityTask: 'pelican' },
    imageQuality: {
      catalogAt: 0, catalogRevision: 0, catalogReady: false, clearing: false,
      catalog: [], sources: {}, cache: {}, hashes: new Map(),
      controller: null, modelsController: null, hashController: null, refreshPending: false,
    },
    old, latest, oldMd5, criteria80,
    nextMd5: sameBytes ? oldMd5 : 'd41d8cd98f00b204e9800998ecf8427e',
    waitingForOld: new Promise(resolve => { releaseOld = resolve; }),
  };
  vm.createContext(ctx);
  vm.runInContext(monitorModule + '\n' + imageModule, ctx);
  vm.runInContext(`
    updateImageQualityCatalog({ apis: [{ id: 1, planType: 'A', detectionMedia: old.detectionMedia }] });
    globalThis.contentKey = imageQualityContentKey(oldMd5, 3, config);
    imageQuality.cache = { [contentKey]: { task: 40, structure: 20, finish: 20, score: 80, criteria: criteria80,
      confidence: 'high', reasons: ['valid visible evidence'], assessedAt: Date.now() - 10000 } };
    imageQuality.sources = { 1: { source: imageQualityIdentity(old), md5: oldMd5,
      byteLength: 3, observedAt: Date.now() - 10000, catalogAt: imageQuality.catalogAt } };
    GM_setValue('cache', imageQuality.cache);
    GM_setValue('sources', imageQuality.sources);
    readImageQualityImage = async row => {
      const previousUrl = row.detectionMedia.url.endsWith('/old');
      if (previousUrl) await waitingForOld;
      const image = { md5: previousUrl ? oldMd5 : nextMd5, byteLength: 3 };
      imageQuality.hashes.set(imageQualityIdentity(row), image);
      return image;
    };
    globalThis.refresh = refreshImageQualityHashes;
    globalThis.replaceCatalog = () => {
      updateImageQualityCatalog({ apis: [{ id: 1, planType: 'A', detectionMedia: latest.detectionMedia }] });
      state.candidates = [latest];
    };
  `, ctx);
  const inFlight = ctx.refresh();
  ctx.replaceCatalog();
  await ctx.refresh();
  assert.equal(ctx.imageQuality.refreshPending, true);
  releaseOld();
  await inFlight;
  for (let i = 0; i < 100 && (ctx.imageQuality.hashController || ctx.imageQuality.refreshPending); i++) {
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.equal(ctx.imageQuality.hashController, null, 'queued validation must finish');
  assert.equal(ctx.imageQuality.refreshPending, false);
  assert.equal(stored.sources['1'].source, JSON.stringify([latest.detectionMedia.url, 'v2']));
  assert.equal(stored.sources['1'].md5, ctx.nextMd5);
  assert.equal(Boolean(stored.cache[ctx.contentKey]), sameBytes,
    sameBytes ? 'same bytes at a new URL must keep their paid analysis' : 'changed bytes without remaining references must release old analysis');
  reports.push({ sameBytes, currentSource: stored.sources['1'].source, oldAnalysisRetained: Boolean(stored.cache[ctx.contentKey]) });
}

console.log(JSON.stringify({ result: 'PASS', reports }, null, 2));
