import fs from 'node:fs';
import vm from 'node:vm';
import { qualityCriteria } from './image-quality.mjs';
const root = new URL('../../', import.meta.url);
export const candidate = (id = 1) => ({ groupId: id, group: 'Group-' + id, detectionMedia: {
  status: 'successful', url: 'https://aihub.top/api/v1/public/model-detection-artifacts/fixture-' + id, publishedAt: 'v1',
} });
export function response(criteria = qualityCriteria()) {
  return { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({
    unable_to_assess: false, criteria, confidence: 'high', reasons: ['模拟图片的可见依据'],
  }) }] }] };
}
export function qualityRuntime(settings = {}) {
  const stored = { 'legacy:content:v4': { paid: 'historical analysis' } }, reads = [], writes = [], calls = [], images = [];
  const routes = [], groupWrites = [], groupState = { id: 1 }, lockState = { held: false };
  const rows = [candidate(1), candidate(2), candidate(3)];
  const ctx = { console, AbortController, DOMException, TextDecoder, URL, Uint8Array, setTimeout, clearTimeout,
    navigator: { locks: { async request(name, options, action) {
      if (lockState.held) return action(null);
      lockState.held = true;
      try { return await action({ name }); } finally { lockState.held = false; }
    } } }, IS_AIHUB: true, config: { imageQualityKeyId: 1, imageQualityModel: 'primary', imageQualityFallbackGroupIds: [2, 3], imageQualityTask: '鹈鹕骑自行车', ...settings },
    state: { candidates: rows }, imageQuality: { records: new Map(), catalogReady: false, catalog: [], catalogAt: 0, catalogRevision: 0, cancelRevision: 0, controller: null, modelsController: null },
    STORAGE_IMAGE_QUALITY_CATALOG_AT: 'watermark', render() {}, requestHeaders: () => ({}),
    unwrapSiteResponse: payload => { if (payload.code !== undefined) { if (payload.code !== 0) throw Error('fixture key/group rejected'); return payload.data; } return payload; },
    GM_getValue(key, fallback) { reads.push(key); return stored[key] ?? fallback; },
    GM_setValue(key, value) { writes.push(key); stored[key] = value; },
    async fetch(url, options = {}) {
      if (url === '/api/v1/keys/1') {
        if (options.method === 'PUT') {
          const id = JSON.parse(options.body).group_id; groupWrites.push(id);
          if (ctx.onGroupPut) return ctx.onGroupPut(id, options);
          groupState.id = id;
          return new Response(JSON.stringify({ code: 0, data: {} }));
        }
        ctx.onKeyRead?.();
        return new Response(JSON.stringify({ id: 1, status: 'active', group_id: groupState.id, group: { id: groupState.id, name: 'Route-' + groupState.id }, key: 'fixture-key-never-real-123456' }));
      }
      if (url === '/api/v1/groups/available') return new Response(JSON.stringify([{ id: 1, name: 'Route-1' }, { id: 2, name: 'Route-2' }, { id: 3, name: 'Route-3' }]));
      if (url === '/v1/responses') {
        const model = JSON.parse(options.body).model; calls.push(model);
        routes.push(groupState.id);
        return ctx.respond(model, options, groupState.id);
      }
      images.push(url);
      return new Response(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { 'Content-Type': 'image/png' } });
    },
    respond: async () => new Response(JSON.stringify(response())),
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('src/providers/monitor.js', root), 'utf8') + '\n' + fs.readFileSync(new URL('src/providers/image-quality.js', root), 'utf8'), ctx);
  // Isolate browser-only FileReader encoding; the fetch/download, model request and parser remain real.
  vm.runInContext('imageQualityDataUrl = async () => "data:image/png;base64,iVBORw0KGgo=";', ctx);
  const catalog = (next = rows) => ctx.updateImageQualityCatalog({ apis: next.map(row => ({ id: row.groupId, planType: row.group, detectionMedia: row.detectionMedia })) });
  catalog();
  return { ctx, stored, reads, writes, calls, images, rows, catalog, routes, groupWrites, groupState, lockState };
}
