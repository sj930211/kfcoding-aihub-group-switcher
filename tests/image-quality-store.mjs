import assert from 'node:assert/strict';
import fs from 'node:fs';
import { qualityRuntime, response } from './fixtures/image-quality-runtime.mjs';
const jsonError = (status, code = 'upstream_error') => new Response(JSON.stringify({ error: { code, message: 'private-credential-must-not-leak' } }), { status });
{
  const { ctx, rows, calls, images, reads, writes, stored } = qualityRuntime();
  await ctx.runImageQuality({ candidate: rows[0] });
  await ctx.runImageQuality({ candidate: rows[0] });
  assert.deepEqual(calls, ['primary', 'primary'], 'same image and earlier page evaluation must be computed afresh every decision');
  assert.equal(images.length, 2);
  assert(reads.every(key => key === 'watermark')); assert(writes.every(key => key === 'watermark'));
  assert.deepEqual(stored['legacy:content:v4'], { paid: 'historical analysis' });
  ctx.clearImageQualityPage(); assert.equal(ctx.imageQuality.records.size, 0); assert.equal(calls.length, 2);
}
{
  const { ctx, rows, calls, routes, groupWrites, groupState } = qualityRuntime();
  ctx.respond = async (model, options, groupId) => groupId === 1 ? jsonError(503) : new Response(JSON.stringify(response()));
  const budget = { remaining: 10, unavailableGroups: new Set() };
  assert.equal((await ctx.runImageQuality({ candidate: rows[0], budget })).scoringGroupId, 2);
  assert.equal((await ctx.runImageQuality({ candidate: rows[1], budget })).scoringGroupId, 2);
  assert.deepEqual(calls, ['primary', 'primary', 'primary'], 'the model never changes');
  assert.deepEqual(routes, [1,2,2], 'failed route is skipped within this round');
  assert.deepEqual(groupWrites, [2,1,2,1]); assert.equal(groupState.id,1);
  assert.equal(budget.remaining, 7); assert.match(ctx.imageQualityDescription(ctx.candidateImageQuality(rows[1])), /评分分组 Route-2/);
}
for (const [status, code, shouldFallback] of [[400,'model_not_supported',true],[403,'SUPPLIER_UPSTREAM_BLOCKED',true],[404,'model_not_found',true],[429,'rate_limit_exceeded',true],[502,'upstream_error',true],[401,'unauthorized',false],[400,'invalid_request_error',false],[403,'forbidden',false]]) {
  const { ctx, rows, calls } = qualityRuntime();
  ctx.respond = async (model, options, groupId) => groupId === 1 ? jsonError(status, code) : new Response(JSON.stringify(response()));
  if (shouldFallback) assert.equal((await ctx.runImageQuality({ candidate: rows[0] })).scoringGroupId, 2);
  else await assert.rejects(ctx.runImageQuality({ candidate: rows[0] }), e => e.code === 'IMAGE_SCORER_UNAVAILABLE' && !e.message.includes('private-credential'));
  assert.equal(calls.length, shouldFallback ? 2 : 1);
}
{
  const { ctx, rows, calls } = qualityRuntime(); ctx.respond = async () => jsonError(503);
  await assert.rejects(ctx.runImageQuality({ candidate: rows[0] }), e => e.code === 'IMAGE_SCORER_UNAVAILABLE');
  assert.deepEqual(calls, ['primary','primary','primary']); assert.equal(ctx.imageQuality.records.size, 0);
}
{
  const { ctx, rows, calls } = qualityRuntime();
  ctx.respond = async () => { const result = response(); const detail = JSON.parse(result.output[0].content[0].text); detail.confidence = 'low'; result.output[0].content[0].text = JSON.stringify(detail); return new Response(JSON.stringify(result)); };
  assert.equal((await ctx.runImageQuality({ candidate: rows[0] })).confidence, 'low');
  assert.deepEqual(calls, ['primary'], 'valid insufficient evidence must not shop for a different model');
}
{
  const { ctx, rows, calls } = qualityRuntime(); ctx.respond = async () => jsonError(503);
  const budget = { remaining: 1, unavailableGroups: new Set() };
  await assert.rejects(ctx.runImageQuality({ candidate: rows[0], budget }), e => e.code === 'IMAGE_ADMISSION_BUDGET');
  assert.equal(calls.length, 1); assert.equal(budget.remaining, 0);
  await ctx.runImageQuality({ test: true });
  assert.equal(calls.length, 2, 'explicit primary test is exactly one extra call, never a fallback chain');
  assert.match(ctx.imageQuality.testStatus, /当前评分分组暂不可用.*未切换分组或模型/);
}
{
  const { ctx, rows, calls } = qualityRuntime();
  ctx.respond = async () => { ctx.cancelImageQuality(); throw new DOMException('Aborted','AbortError'); };
  await assert.rejects(ctx.runImageQuality({ candidate: rows[0] }), e => e.name === 'AbortError');
  assert.deepEqual(calls, ['primary']); assert.equal(ctx.imageQuality.records.size, 0);
}
{
  const { ctx, rows, calls } = qualityRuntime();
  ctx.respond = async () => { ctx.config = { ...ctx.config, imageQualityModel: 'changed' }; return new Response(JSON.stringify(response())); };
  await assert.rejects(ctx.runImageQuality({ candidate: rows[0] }), e => e.code === 'IMAGE_CATALOG_STALE');
  assert.deepEqual(calls, ['primary']); assert.equal(ctx.imageQuality.records.size, 0);
}
{
  const { ctx, calls } = qualityRuntime({imageQualityFallbackGroupIds: []}); let active = 0, peak = 0;
  ctx.respond = async () => { active++; peak = Math.max(peak,active); await new Promise(resolve => setTimeout(resolve, 2)); active--; return new Response(JSON.stringify(response())); };
  await ctx.runImageQuality(); assert.equal(calls.length, 3); assert.equal(peak, 2, 'manual batch remains bounded to two concurrent models');
}
const state = fs.readFileSync(new URL('../src/runtime/state.js', import.meta.url), 'utf8');
assert(!/image-quality:content|normalizeImageQualityCache|STORAGE_IMAGE_QUALITY[,)]/.test(state), 'startup must not load or migrate legacy scoring caches');
console.log('PASS fresh evaluation per decision, no persisted score reads/writes, ordered bounded group fallback, fixed model and restoration, safe failures, exact primary test, cancellation and two-worker batching');
// Invalid protocol data is a service failure; only a literal true means this image is unassessable.
for (const flag of [undefined, null, 'false']) {
  const { ctx, rows, calls } = qualityRuntime();
  ctx.respond = async () => {
    const result = response(); result.output[0].content[0].text = JSON.stringify(flag === undefined ? {} : { unable_to_assess: flag });
    return new Response(JSON.stringify(result));
  };
  await assert.rejects(ctx.runImageQuality({ candidate: rows[0] }), e => e.code === 'IMAGE_SCORER_UNAVAILABLE');
  assert.deepEqual(calls, ['primary']);
}
for (const code of ['model_not_supported', 'unsupported_model', 'unsupported_image', 'image_input_not_supported']) {
  const { ctx, rows, calls } = qualityRuntime();
  ctx.respond = async (model, options, groupId) => groupId !== 1 ? new Response(JSON.stringify(response()))
    : new Response(`event: error\ndata: ${JSON.stringify({ type:'error', error: { code, message:'private upstream text' } })}\n\n`, { headers: { 'Content-Type':'text/event-stream' } });
  assert.equal((await ctx.runImageQuality({ candidate: rows[0] })).scoringGroupId, 2);
  assert.deepEqual(calls,['primary','primary']);
}
console.log('PASS malformed assessability flags stop service flow; SSE capability errors use the same fallback classification as HTTP');

// Changing the key's route must remain transactional, including failed/aborted writes.
{
  const { ctx, rows, calls, routes, groupWrites, groupState } = qualityRuntime();
  ctx.respond = async (model, options, groupId) => groupId === 1 ? jsonError(503) : new Response(JSON.stringify(response()));
  await ctx.runImageQuality({ candidate: rows[0] });
  await ctx.runImageQuality({ candidate: rows[0] });
  assert.deepEqual(routes,[1,2,1,2], 'a new round starts from the restored original group');
  assert(calls.every(model=>model==='primary')); assert.deepEqual(groupWrites,[2,1,2,1]); assert.equal(groupState.id,1);
}
{
  const { ctx, rows, calls, groupWrites, groupState } = qualityRuntime();
  ctx.respond = async () => jsonError(503);
  ctx.onGroupPut = async id => { groupState.id=id; if(id===2) throw new TypeError('lost PUT response'); return new Response('{}'); };
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}), e=>e.code==='IMAGE_SCORER_UNAVAILABLE');
  assert.equal(groupState.id,1,'a write with lost response may have succeeded and must be restored');
  assert.deepEqual(groupWrites,[2,1]); assert.equal(calls.length,1,'unverified switch never sends another paid request');
}
{
  const { ctx, rows, groupWrites, groupState } = qualityRuntime();
  ctx.respond = async (model, options, groupId) => { if(groupId===1)return jsonError(503); ctx.cancelImageQuality(); throw new DOMException('Aborted','AbortError'); };
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}), e=>e.name==='AbortError');
  assert.deepEqual(groupWrites,[2,1]); assert.equal(groupState.id,1); assert.equal(ctx.imageQuality.records.size,0);
}
{
  const { ctx, rows, groupWrites, groupState } = qualityRuntime();
  ctx.respond = async () => jsonError(503);
  ctx.onGroupPut = async id => { groupState.id=id; if(id===2)ctx.cancelImageQuality(); return new Response('{}'); };
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}), e=>e.name==='AbortError');
  assert.deepEqual(groupWrites,[2,1]); assert.equal(groupState.id,1,'stop during PUT still verifies and restores');
}
{
  const { ctx, rows, groupState } = qualityRuntime();
  ctx.respond = async (model, options, groupId) => groupId===1?jsonError(503):new Response(JSON.stringify(response()));
  ctx.onGroupPut = async id => { if(id===1)return jsonError(503); groupState.id=id; return new Response('{}'); };
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}), e=>e.code==='IMAGE_SCORER_UNAVAILABLE');
  assert.equal(ctx.imageQuality.records.size,0,'a good score cannot authorize switching if route restoration failed');
  assert.match(ctx.imageQuality.status,/恢复原分组/);
}
{
  const { ctx, rows, groupWrites, groupState } = qualityRuntime();
  ctx.respond = async (model, options, groupId) => { if(groupId===1)return jsonError(503);groupState.id=99;return new Response(JSON.stringify(response())); };
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}), e=>e.code==='IMAGE_SCORER_UNAVAILABLE');
  assert.deepEqual(groupWrites,[2]); assert.equal(groupState.id,99,'observed external edits must not be overwritten by restoration');
}
{
  const { ctx, rows, calls, groupWrites, lockState } = qualityRuntime(); lockState.held=true;
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}), e=>e.code==='IMAGE_SCORER_UNAVAILABLE');
  assert.equal(calls.length,0);assert.equal(groupWrites.length,0,'another tab holding the key lock blocks all writes and inference');
}
{
  const { ctx, rows, calls, groupWrites } = qualityRuntime();ctx.navigator={};
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}), e=>e.code==='IMAGE_SCORER_UNAVAILABLE');
  assert.equal(calls.length,0);assert.equal(groupWrites.length,0);
}
{
  const { ctx, groupWrites } = qualityRuntime(); let active=0,peak=0;
  ctx.respond=async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return new Response(JSON.stringify(response()));};
  await ctx.runImageQuality();assert.equal(peak,1,'configured key routing is serial to avoid group races');assert.deepEqual(groupWrites,[]);
}
{
  const { ctx, rows, groupWrites } = qualityRuntime();
  ctx.respond = async () => {const result=response();const detail=JSON.parse(result.output[0].content[0].text);detail.unable_to_assess=true;result.output[0].content[0].text=JSON.stringify(detail);return new Response(JSON.stringify(result));};
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}),e=>e.code==='IMAGE_UNASSESSABLE');assert.deepEqual(groupWrites,[]);
}
console.log('PASS fixed-model group routing, restoration after success/failure/stop/lost responses, failed restoration blocks admission, external-change and cross-tab locks, serial routing');
{
  const { ctx, rows, calls, groupState, groupWrites } = qualityRuntime();groupState.id=99;
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}),e=>e.code==='IMAGE_SCORER_UNAVAILABLE');
  assert.deepEqual(groupWrites,[],'an original group absent from available groups must not be temporarily switched');assert.deepEqual(calls,[]);
}
{
  const { ctx, calls, groupWrites } = qualityRuntime({imageQualityFallbackGroupIds:[99]});
  await ctx.runImageQuality({test:true});assert.deepEqual(calls,['primary']);assert.deepEqual(groupWrites,[],'current-route test ignores invalid backup configuration');
}
console.log('PASS unavailable original group blocks writes, independent single-image test ignores backup configuration');
{
  const { ctx, rows, calls, groupWrites } = qualityRuntime();const fetch=ctx.fetch;
  ctx.fetch=async(url,options)=>String(url).startsWith('https://aihub.top/')?new Response('broken',{status:500}):fetch(url,options);
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}),e=>e.code==='IMAGE_READ_FAILED');
  assert.deepEqual(calls,[]);assert.deepEqual(groupWrites,[],'bad original images must not trigger key-group fallback');
}
{
  const { ctx, rows, calls, routes, groupWrites, groupState } = qualityRuntime();
  const budget={remaining:10,unavailableGroups:new Set()};
  ctx.respond=async(model,options,groupId)=>groupId===1?jsonError(503):new Response(JSON.stringify(response()));
  for(let i=0;i<9;i++)await ctx.runImageQuality({candidate:rows[i%rows.length],budget});
  assert.equal(calls.length,10);assert.deepEqual(routes,[1,...Array(9).fill(2)]);assert.equal(budget.remaining,0);assert.equal(groupState.id,1);
  const beforeWrites=groupWrites.length;
  await assert.rejects(ctx.runImageQuality({candidate:rows[0],budget}),e=>e.code==='IMAGE_ADMISSION_BUDGET');
  assert.equal(calls.length,10);assert.equal(groupWrites.length,beforeWrites,'budget exhaustion never initiates another temporary switch');
}
console.log('PASS bad-image failures stay image failures; route retries share exact ten-request cap and exhausted budgets never switch keys');
{
  const { ctx, rows } = qualityRuntime();const fetch=ctx.fetch;
  ctx.fetch=async(url,options)=>url==='/api/v1/groups/available'?new Response(JSON.stringify({code:403,message:'图片评分请求失败：private-credential-must-not-leak'})):fetch(url,options);
  await assert.rejects(ctx.runImageQuality({candidate:rows[0]}),e=>e.code==='IMAGE_SCORER_UNAVAILABLE'&&!e.message.includes('private-credential'));
}
