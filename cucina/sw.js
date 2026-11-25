// Service worker app Cucina: prima la rete, poi la cache (funziona offline). Non tocca mai le richieste verso GitHub.
const CACHE='cucina-v1';
const FILES=['./','index.html','app.js','manifest.webmanifest','lib/exceljs.min.js','lib/fflate.min.js','icons/icon-192.png','icons/icon-512.png','icons/favicon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('cucina-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||!u.pathname.includes('/cucina/')) return;
  if(u.pathname.endsWith('version.json')) return;
  e.respondWith(fetch(e.request).then(r=>{ if(r.ok){const c=r.clone(); caches.open(CACHE).then(x=>x.put(e.request,c));} return r; }).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));
});
