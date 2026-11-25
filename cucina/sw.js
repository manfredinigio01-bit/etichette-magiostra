// Vecchio service worker dell'app Cucina: si autodistrugge (l'app è su /cucina-magiostra/).
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil((async()=>{ for(const k of await caches.keys()) if(/^cucina-v/.test(k)) await caches.delete(k); await self.registration.unregister(); for(const c of await self.clients.matchAll({type:'window'})) c.navigate('https://manfredinigio01-bit.github.io/cucina-magiostra/'); })());});
