// Loopback-only interaction fixture. Every key, group write and inference endpoint is simulated.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mock = `<script>
const localParams = new URLSearchParams(location.search);
const localStorageKey = 'scope-fixture-' + localParams.get('case');
const localSavedConfig = localParams.has('scopepersist') ? sessionStorage.getItem(localStorageKey) : null;
values.set('aihub-group-switcher:config:v1', localSavedConfig ? JSON.parse(localSavedConfig) : {
  enabled:false, theme:localParams.get('theme') || 'dark', tokenIds:[1], models:['gpt-6.1-sol'],
  selectionMode:'saving', automaticSwitchMode:'failover', pollSeconds:15, strategySeconds:300,
  rollbackChecks:0, switchHoldMinutes:0, imageQualityKeyId:1, imageQualityModel:'fixture-evaluator',
  imageQualityFallbackGroupIds:[2,3]
});
window.localEvidence = {requests:[],modelCalls:0,groupWrites:[],configWrites:0,current:1,fault:false,unknown:false,failKeys:false};
const localBaseFetch = window.fetch;
const localBaseSet = window.GM_setValue;
window.GM_setValue = (key,value) => {
  if(key.endsWith(':config:v1')) { localEvidence.configWrites++; localEvidence.config = JSON.parse(JSON.stringify(value)); if(localParams.has('scopepersist')) sessionStorage.setItem(localStorageKey,JSON.stringify(value)); }
  localBaseSet(key,value);
};
const localGroups = Array.from({length:40},(_,i)=>({id:i+1,name:(i<30?'OpenAI':'Kimi')+'-'+String(i+1).padStart(2,'0'),rate_multiplier:i===0?50:i+1,probe_model:i<30?'gpt-6.1-sol':'kimi-k3'}));
if(localParams.has('platforms')) {
 const platforms=['openai','deepseek','zhipu','kimi','grok','mystery'];
 localGroups.forEach((g,i)=>{g.platform=platforms[i%6];g.name=(g.platform==='mystery'?'Unlisted':g.platform)+'-'+String(i+1).padStart(2,'0');g.probe_model='gpt-6.1-sol';});
}
const localKey = id => ({id,name:'模拟密钥-'+String(id).padStart(2,'0'),status:'active',group_id:id===1?localEvidence.current:31,group:localGroups[(id===1?localEvidence.current:31)-1]});
const localResponse = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
window.fetch = async (input,options={}) => {
 const url = new URL(String(input),location.origin); const method = String(options.method||'GET').toUpperCase();
 localEvidence.requests.push({path:url.pathname,method});
 if(localEvidence.slowMonitor && /^\\/api\\/v[12]\\/public\\/providers$/.test(url.pathname)) await new Promise(resolve=>setTimeout(resolve,500));
 if(url.pathname==='/v1/responses') {localEvidence.modelCalls++;return localResponse({message:'No inference is allowed in this fixture'},403);}
 if(url.pathname==='/api/v1/keys') return localResponse({items:Array.from({length:40},(_,i)=>localKey(i+1)),total:40,page:1,page_size:100});
 const match=url.pathname.match(/^\\/api\\/v1\\/keys\\/(\\d+)$/);
 if(match) {
   if(localEvidence.failKeys) return localResponse({message:'模拟登录过期'},401);
   const id=Number(match[1]);
   if(method==='PUT') { const group=Number(JSON.parse(options.body).group_id);localEvidence.groupWrites.push({id,group});if(id===1)localEvidence.current=group;return localResponse(localKey(id)); }
   return localResponse({...localKey(id),key:'fixture-only-not-a-real-credential'});
 }
 if(url.pathname==='/api/v1/groups/available') return localResponse(localGroups);
 if(url.pathname==='/api/v1/groups/rates') return localResponse(Object.fromEntries(localGroups.map(g=>[g.id,g.rate_multiplier])));
 if(/^\\/api\\/v[12]\\/public\\/providers$/.test(url.pathname)) return localResponse({version:2,platform_tabs:['openai','deepseek','zhipu','kimi','grok'],generated_at:new Date().toISOString(),items:localGroups.map((g,i)=>({
   group_id:g.id,code:g.name,platform:g.platform||(i<30?'openai':'kimi'),group_models:[{model:g.platform?'gpt-6.1-sol':i<30?'gpt-6.1-sol':'kimi-k3'}],
   rate_multiplier:g.rate_multiplier,last_probed_at:new Date().toISOString(),probe_model:g.probe_model,
   probe_e2e_ttft_ms:1000,output_tokens:10,output_tps:10,available:true,success_rates:{'1h':1},enabled:true,
   model_cards:[{model:'gpt-6.1-sol',health:i===0&&localEvidence.fault?'failed':i===0&&localEvidence.unknown?'insufficient':'healthy'},{model:'kimi-k3',health:'healthy'}]
 }))});
 if(/^\\/api\\/v[12]\\/public\\/providers\\/series$/.test(url.pathname)) return localResponse({items:[]});
 return localBaseFetch(input,options);
};
</script>`;
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://127.0.0.1').pathname;
  if (name === '/v022.html') {
    const html = fs.readFileSync(path.join(repo, 'ui-preview.html'), 'utf8')
      .replace('<script src="./kfcoding-group-switcher.user.js"></script>', mock + '<script src="/kfcoding-group-switcher.user.js"></script>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  } else if (name === '/kfcoding-group-switcher.user.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); res.end(fs.readFileSync(path.join(repo, name.slice(1))));
  } else { res.writeHead(404); res.end(); }
});
server.listen(8767, '127.0.0.1', () => console.log('Local simulated UI: http://127.0.0.1:8767/v022.html?site=aihub&pelican'));
