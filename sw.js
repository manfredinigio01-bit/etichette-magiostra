// Service worker: prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata (funziona offline).
// Lo stesso file serve la versione normale e quella di prova (cartella prova/): le cache hanno nomi diversi.
const PROVA = self.registration.scope.includes('/prova/');
const CACHE = (PROVA ? 'prova-' : '') + 'etichette-v32';
const PREFISSO = PROVA ? 'prova-etichette-' : 'etichette-';
// tutti i file dell'app: servono per funzionare senza internet (stesso ordine di index.html)
const FILES = ['./', './index.html', './caratteri.css', './stile.css',
  ...['avvio-prova', 'loghi', 'allergeni-e-dati-base', 'stato', 'etichetta', 'stampa', 'schermata-stampa', 'schermata-prodotti',
    'schermata-impostazioni', 'archivio-file', 'archivio-online', 'versione-e-pulsanti'].map(n => `./js/${n}.js`),
  './manifest.webmanifest', './version.json', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFISSO) && k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
  // la versione normale non tocca la Cucina (ha il suo service worker) né la versione di prova
  if (!PROVA && (u.pathname.includes('/cucina/') || u.pathname.includes('/prova/'))) return;
  e.respondWith(
    fetch(e.request, {cache: 'no-cache'}).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
      .catch(() => caches.open(CACHE).then(c => c.match(e.request, {ignoreSearch: true})).then(r => r || caches.open(CACHE).then(c => c.match('./index.html'))))
  );
});
