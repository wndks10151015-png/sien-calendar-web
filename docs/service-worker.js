const ROOT=new URL("./",self.location).pathname;
const PREFIX="sien-calendar:"+ROOT+":";
const CACHE=PREFIX+"web-0.1.2";
const FILES=["./","./index.html","./app.js","./host.js","./navigation.js","./store.js","./sync.js","./merge.js","./calendar-engine.js","./calendar.css","./theme.css","./web.css","./icon.svg","./manifest.webmanifest","./assets/lucide.js","./assets/fonts/PretendardVariable.woff2"];
FILES.push("./assets/icon-192.png","./assets/icon-512.png");
const ASSETS=new Set(FILES.map(file=>new URL(file,self.location).pathname));
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET"||url.origin!==self.location.origin||!url.pathname.startsWith(ROOT))return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request).catch(()=>caches.match(new URL("./index.html",self.location).href)));return;
  }
  // Only an explicit static asset allowlist is cached. Never calendar JSON, API responses or credentials.
  if(ASSETS.has(url.pathname))event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});
