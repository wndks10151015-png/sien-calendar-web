const ROOT=new URL('./',self.location).pathname;
const PREFIX='sien-calendar:'+ROOT+':';
const VERSION=new URL(self.location).searchParams.get('v')||'0.1.9';
const CACHE=PREFIX+'web-'+VERSION;
const FILES=["index.html","boot.js","app.js","host.js","navigation.js","store.js","sync.js","merge.js","view-state.js","layout.js","project-connections.js","calendar-engine.js","calendar.css","theme.css","web.css","icon.svg","manifest.webmanifest","assets/lucide.js","assets/fonts/PretendardVariable.woff2","assets/icon-192.png","assets/icon-512.png"];
const ASSETS=new Set(FILES.map(file=>new URL(file,self.location).pathname));
const sessions=new Map();
async function install(){
  const manifest=await fetch(new URL('./release.json?v='+VERSION,self.location),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Release unavailable');return r.json();});
  if(!/^\d+\.\d+\.\d+$/.test(VERSION)||manifest.version!==VERSION||Object.keys(manifest.assets||{}).length!==FILES.length)throw Error('Release mismatch');
  const responses=await Promise.all(FILES.map(async file=>{
    if(!/^[a-f0-9]{64}$/.test(manifest.assets[file]||''))throw Error('Invalid release asset');
    const url=new URL(file,self.location),request=new URL(url);request.searchParams.set('v',VERSION);
    const response=await fetch(request,{cache:'reload'});if(!response.ok)throw Error('Incomplete release');
    const bytes=await response.clone().arrayBuffer(),content=/\.(png|woff2)$/.test(file)?bytes:new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/\r\n/g,'\n'));
    const digest=await crypto.subtle.digest('SHA-256',content);
    // Content filters can add markup to HTML; its versioned entry must still match this release.
    if(file==='index.html'?!new TextDecoder().decode(bytes).includes('boot.js?v='+VERSION+'"'):Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')!==manifest.assets[file])throw Error('Stale release asset: '+file);
    return [url.href,response];
  }));
  const cache=await caches.open(CACHE);
  await Promise.all(responses.map(([url,response])=>cache.put(url,response)));
  await self.skipWaiting();
}
self.addEventListener('install',event=>event.waitUntil(install()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await self.clients.claim();
  await Promise.all((await caches.keys()).filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(ROOT))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(new URL('./index.html',self.location).href)||Response.error();}));return;
  }
  // Read this release only; never let an installing cache or private JSON serve the running app.
  if(ASSETS.has(url.pathname))event.respondWith((async()=>{
    if(url.searchParams.has('v')&&url.searchParams.get('v')!==VERSION)return fetch(event.request);
    const cache=await caches.open(CACHE);url.search='';url.hash='';
    return await cache.match(url.href)||fetch(event.request);
  })());
});
self.addEventListener('message',event=>{
  const port=event.ports[0],source=event.source;
  if(!port||!source?.url||new URL(source.url).origin!==self.location.origin||!new URL(source.url).pathname.startsWith(ROOT))return;
  for(const [key,value]of sessions)if(value.expires<Date.now())sessions.delete(key);
  if(event.data?.type==='VERSION')port.postMessage({version:VERSION});
  else if(event.data?.type==='KEEP_SESSION'){
    const session=event.data.session;
    if(typeof session?.token!=='string'||!session.token.startsWith('github_pat_')||session.token.length<30||sessions.size>=20){port.postMessage(null);return;}
    const ticket=crypto.randomUUID();sessions.set(ticket,{session,expires:Date.now()+60000});port.postMessage({ticket});
  }else if(event.data?.type==='TAKE_SESSION'){
    const value=sessions.get(event.data.ticket);sessions.delete(event.data.ticket);port.postMessage(value?.session||null);
  }else if(event.data?.type==='DROP_SESSION'){
    sessions.delete(event.data.ticket);port.postMessage(null);
  }
});
