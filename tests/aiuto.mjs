// Strumenti comuni ai test: piccolo server locale + Chrome senza finestra.
// GitHub è sempre SIMULATO: i test non si collegano mai all'archivio vero.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const RADICE = fileURLToPath(new URL('..', import.meta.url));
const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css' };

export async function avviaServer() {
  const srv = http.createServer(async (req, res) => {
    const percorso = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      const dati = await readFile(join(RADICE, percorso.endsWith('/') ? percorso + 'index.html' : percorso));
      res.writeHead(200, { 'Content-Type': TIPI[extname(percorso)] || 'application/octet-stream' });
      res.end(dati);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://localhost:${srv.address().port}`, chiudi: () => new Promise((r) => srv.close(r)) };
}

export async function avviaBrowser() {
  const opz = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const browser = await chromium.launch({ ...opz, args: ['--no-sandbox'] });
  return browser;
}

// Apre l'app in un profilo pulito. Raccoglie errori JavaScript e violazioni della CSP.
export async function apriApp(browser, url, { prodotti = null, percorso = '/index.html' } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const pagina = await ctx.newPage();
  const errori = [];
  pagina.on('pageerror', (e) => errori.push('ECCEZIONE: ' + e.message));
  pagina.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errori.push(m.text()); });
  pagina.on('dialog', (d) => { pagina.dialoghi.push(d.message()); d.accept(); });
  pagina.dialoghi = [];
  await pagina.route('https://api.github.com/**', (r) => r.fulfill({ status: 401, body: '{}' }));
  await pagina.goto(url + percorso);
  if (prodotti) {
    // impostazioni predefinite dell'app + prodotti di prova, caricati come farebbe un utente vero
    await pagina.evaluate((pp) => {
      const st = JSON.parse(JSON.stringify(S.settings)); st.updatedAt = 1;
      localStorage.setItem(typeof KEY_DATA !== 'undefined' ? KEY_DATA : 'mag_data', JSON.stringify({ version: 1, settings: st, prodotti: pp }));
    }, prodotti);
    await pagina.reload();
  }
  await pagina.waitForTimeout(300);
  return { pagina, ctx, errori };
}

export async function leggiJSON(rel) { return JSON.parse(await readFile(join(RADICE, rel), 'utf8')); }
