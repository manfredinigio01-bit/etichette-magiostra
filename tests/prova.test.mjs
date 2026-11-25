// La versione di PROVA (cartella prova/) deve essere completamente separata da quella vera:
// dati diversi nello stesso browser, archivio online letto ma MAI scritto.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { avviaServer, avviaBrowser } from './aiuto.mjs';

let server, browser;
before(async () => { server = await avviaServer(); browser = await avviaBrowser(); });
after(async () => { await browser?.close(); await server?.chiudi(); });

const REPO = 'manfredinigio01-bit/etichette-magiostra-dati';
const TOKEN = 'github_pat_' + 'P1r2o3v4a5'.repeat(5);

async function contesto() {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const scritture = [];
  const archivio = { version: 1, settings: null, prodotti: [{ id: 'dallarchivio', updatedAt: 5000, nome: 'Prodotto archivio vero', ingredienti: 'acqua, sale', tracce: [], conservazione: 'cs1', tipoData: 'scadenza', giorni: 3, pezzature: ['pz1'], tipoPrezzo: 'kg', linea: 'standard' }] };
  await ctx.route('https://api.github.com/**', (r) => {
    const req = r.request(), path = req.url().replace('https://api.github.com', '');
    if (!(req.headers().authorization || '').includes(TOKEN)) return r.fulfill({ status: 401, body: '{}' });
    if (req.method() !== 'GET') { scritture.push(req.method() + ' ' + path); return r.fulfill({ status: 200, body: '{}' }); }
    if (path === `/repos/${REPO}`) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ private: true, permissions: { push: true } }) });
    if (path.startsWith(`/repos/${REPO}/contents/archivio.json`)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: 'abc', content: Buffer.from(JSON.stringify(archivio)).toString('base64') }) });
    return r.fulfill({ status: 404, body: '{}' });
  });
  return { ctx, scritture, archivio };
}

test('prova e versione normale non condividono i dati nello stesso browser', async () => {
  const { ctx } = await contesto();
  const vera = await ctx.newPage();
  await vera.goto(server.url + '/index.html');
  await vera.evaluate(() => { S.prodotti.push({ id: 'solovero', updatedAt: 1, nome: 'Solo nella versione vera', ingredienti: 'x', tracce: [], conservazione: 'cs1', pezzature: ['pz1'] }); commit(); });
  await vera.waitForTimeout(800);
  const prova = await ctx.newPage();
  await prova.goto(server.url + '/prova/index.html'); await prova.waitForTimeout(300);
  const r = await prova.evaluate(() => ({ PROVA, KEY_DATA, ids: S.prodotti.map((p) => p.id), fascia: !!document.getElementById('provabar'),
    manifest: !!document.querySelector('link[rel="manifest"]'), titolo: document.title }));
  assert.equal(r.PROVA, true);
  assert.equal(r.KEY_DATA, 'prova_mag_data');
  assert.ok(!r.ids.includes('solovero'), 'la prova vede i dati della versione vera');
  assert.equal(r.fascia, true, 'manca la fascia VERSIONE DI PROVA');
  assert.equal(r.manifest, false, 'la prova non deve essere installabile');
  assert.match(r.titolo, /^PROVA/);
  // e al contrario: la versione vera non vede i dati della prova
  await prova.evaluate(() => { S.prodotti.push({ id: 'soloprova', updatedAt: 1, nome: 'Solo prova', ingredienti: 'x', tracce: [], conservazione: 'cs1', pezzature: ['pz1'] }); commit(); });
  await prova.waitForTimeout(800);
  await vera.reload(); await vera.waitForTimeout(300);
  const idsVera = await vera.evaluate(() => S.prodotti.map((p) => p.id));
  assert.ok(idsVera.includes('solovero') && !idsVera.includes('soloprova'));
  assert.equal(await vera.evaluate(() => PROVA), false);
  await ctx.close();
});

test('prova: legge l\'archivio online vero ma non scrive MAI', async () => {
  const { ctx, scritture, archivio } = await contesto();
  const prova = await ctx.newPage();
  prova.on('dialog', (d) => d.accept());
  await prova.goto(server.url + '/prova/index.html');
  archivio.settings = await prova.evaluate(() => { const s = JSON.parse(JSON.stringify(S.settings)); s.updatedAt = 10; return s; });
  await prova.evaluate(() => { S.prodotti.push({ id: 'modificaprova', updatedAt: 9000, nome: 'Modifica fatta in prova', ingredienti: 'x', tracce: [], conservazione: 'cs1', pezzature: ['pz1'] }); saveLocal(); });
  await prova.click('nav button[data-tab="impostazioni"]');
  await prova.fill('#ghToken', TOKEN); await prova.fill('#ghPw1', 'password-prova'); await prova.fill('#ghPw2', 'password-prova');
  await prova.click('[data-h-click="87"]'); await prova.waitForTimeout(3500);
  await prova.evaluate(() => syncNow()); await prova.waitForTimeout(1500);
  const ids = await prova.evaluate(() => S.prodotti.map((p) => p.id));
  assert.ok(ids.includes('dallarchivio'), 'la prova non ha letto i prodotti dall\'archivio');
  assert.deepEqual(scritture, [], 'la prova ha provato a SCRIVERE sull\'archivio vero');
  assert.match(await prova.innerText('#syncStatus'), /PROVA/);
  const chiavi = await prova.evaluate(() => Object.keys(localStorage));
  assert.ok(chiavi.every((k) => k.startsWith('prova_')), 'la prova ha salvato chiavi senza prefisso: ' + chiavi.join(','));
  await ctx.close();
});
