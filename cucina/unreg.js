// Toglie il vecchio service worker e la vecchia cache dell'app Cucina a questo indirizzo.
if('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>{ if(r.scope.includes('/cucina/')) r.unregister(); }));
if(window.caches) caches.keys().then(ks=>ks.filter(k=>/^cucina-v/.test(k)).forEach(k=>caches.delete(k)));
