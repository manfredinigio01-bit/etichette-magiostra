// Test automatici dell'app Etichette. Si lanciano con:  npm test
// Controllano le regole di legge (Reg. UE 1169/2011), la sicurezza e i dati.
// Usano SOLO prodotti inventati (tests/fixtures): mai dati veri in questo repository pubblico.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { avviaServer, avviaBrowser, apriApp, leggiJSON, RADICE } from './aiuto.mjs';

let server, browser, app, prodotti;
const DATA = '2026-11-25';

before(async () => {
  server = await avviaServer();
  browser = await avviaBrowser();
  prodotti = await leggiJSON('tests/fixtures/prodotti-prova.json');
  app = await apriApp(browser, server.url, { prodotti });
});
after(async () => { await browser?.close(); await server?.chiudi(); });

// Prepara l'etichetta di un prodotto come in stampa, con data fissa, e la misura.
const etichetta = (id, prezzo = true) => app.pagina.evaluate(([id, prezzo, DATA]) => {
  const p = getP(id);
  const job = { pid: id, kg: 0.25, prod: DATA, scad: addDays(DATA, p.giorni || 0), lotto: lotto(DATA),
    prezzo: prezzoCalc(p, 0.25), tipoPrezzo: p.tipoPrezzo, showPrice: prezzo };
  const el = document.getElementById('print');
  const html = labelsFor(job);
  el.innerHTML = html.join('');
  fitLabels(el);
  const lbl = [...el.querySelectorAll('.lbl')];
  const r = { html, n: lbl.length, testo: el.innerText, overflow: lbl.some((l) => l.classList.contains('overflow')),
    pt: lbl.map((l) => l.dataset.pt).filter(Boolean) };
  el.innerHTML = '';
  return r;
}, [id, prezzo, DATA]);

test('allergeni: in grassetto quelli veri, non le eccezioni', async () => {
  const r = await app.pagina.evaluate(() => highlight(getP('t_esclusioni').ingredienti, false));
  for (const parola of ['farina tipo 00', 'vino bianco', 'soja', 'pinoli'])
    assert.match(r.html, new RegExp(`<b class="al">${parola}</b>`), `manca il grassetto su "${parola}"`);
  for (const parola of ['Latte di cocco', 'latte di riso', 'noce moscata', 'grano saraceno'])
    assert.doesNotMatch(r.html, new RegExp(`<b class="al">${parola}`, 'i'), `"${parola}" non è un allergene`);
  assert.deepEqual([...r.found].sort(), ['glutine', 'manuale:pinoli', 'soia', 'solfiti']);
});

test('allergeni: maiuscolo quando richiesto', async () => {
  const r = await app.pagina.evaluate(() => highlight('farina di frumento, sedano', true));
  assert.match(r.html, /<b class="al">FRUMENTO<\/b>/);
  assert.match(r.html, /<b class="al">SEDANO<\/b>/);
});

test('ogni allergene del dizionario viene riconosciuto da solo', async () => {
  const mancanti = await app.pagina.evaluate(() => {
    const out = [];
    for (const a of ALLERGENI) for (const w of a.w) {
      const r = highlight('acqua, ' + w + ', sale', false);
      if (![...r.found].includes(a.k)) out.push(a.k + ': ' + w);
    }
    return out;
  });
  assert.deepEqual(mancanti, []);
});

test('lotto = data di produzione AAAAMMGG, scadenze con anni bisestili', async () => {
  const r = await app.pagina.evaluate(() => [lotto('2026-11-25'), addDays('2026-02-27', 3), addDays('2024-02-28', 1), addDays('2026-12-30', 3)]);
  assert.deepEqual(r, ['20261125', '2026-03-02', '2024-02-29', '2027-01-02']);
});

test('tracce di allergeni e prezzo: solo il prezzo scelto', async () => {
  const r = await app.pagina.evaluate(() => [tracceText(getP('t_base')), tracceText(getP('t_pezzo')),
    prezzoCalc(getP('t_base'), 0.5), prezzoCalc(getP('t_pezzo'), 0.5), prezzoInfo(getP('t_pezzo'))]);
  assert.equal(r[0], 'Può contenere tracce di sesamo, frutta a guscio.');
  assert.equal(r[1], 'Prodotto in un laboratorio che usa anche arachidi.');
  assert.deepEqual(r.slice(2), ['24.50', '6.50', '€ 6,50/pz']);
});

test('conservazione: conta solo quella da chiuso per decidere "frigorifero"', async () => {
  const r = await app.pagina.evaluate(() => [isFrigo('Conservare in frigorifero a +4 °C'),
    isFrigo("Conservare in luogo fresco e asciutto. Dopo l'apertura conservare in frigorifero")]);
  assert.deepEqual(r, [true, false]);
});

test('etichetta normale: entra, testo esattamente 7 pt, dati obbligatori presenti', async () => {
  const r = await etichetta('t_base');
  assert.equal(r.overflow, false);
  assert.deepEqual(r.pt, ['7']);
  assert.match(r.testo, /Da consumarsi entro il/);
  assert.match(r.testo, /20261125/);                 // lotto
  assert.match(r.testo, /La Magiostra di Aquilino e C\. snc/);
  assert.match(r.testo, /24,50/);                    // prezzo al kg
});

test('minimo di legge: anche se nelle impostazioni si chiede di meno, mai sotto i 7 pt', async () => {
  const prima = await app.pagina.evaluate(() => S.settings.etichetta.minPt);
  await app.pagina.evaluate(() => { S.settings.etichetta.minPt = 5; });
  const r = await etichetta('t_base');
  await app.pagina.evaluate((v) => { S.settings.etichetta.minPt = v; }, prima);
  assert.deepEqual(r.pt, ['7']);
});

test('prodotto "preferibilmente entro" e prezzo al pezzo', async () => {
  const r = await etichetta('t_pezzo');
  assert.match(r.testo, /preferibilmente entro/);
  assert.match(r.testo, /6,50/);
  assert.doesNotMatch(r.testo, /30,00/, 'in etichetta deve esserci solo il prezzo scelto');
});

test('testo troppo lungo: etichetta segnalata e STAMPA BLOCCATA', async () => {
  const r = await etichetta('t_troppo_lungo');
  assert.equal(r.overflow, true, 'il testo non entra: deve risultare fuori misura');
  assert.deepEqual(r.pt, ['7'], 'il testo non va mai rimpicciolito sotto i 7 pt');
  app.pagina.dialoghi.length = 0;
  await app.pagina.evaluate((DATA) => doPrint([{ pid: 't_troppo_lungo', kg: 0.25, prod: DATA, scad: DATA, lotto: lotto(DATA), prezzo: '', showPrice: false }], 0), DATA);
  assert.ok(app.pagina.dialoghi.some((d) => d.startsWith('Stampa bloccata')), 'la stampa doveva essere bloccata');
});

test('linea di punta: due etichette (fronte + retro)', async () => {
  const r = await etichetta('t_punta');
  assert.equal(r.n, 2);
  assert.match(r.testo, /Frollini al limone/i);
});

test('sicurezza: testo pericoloso nei prodotti non viene mai eseguito', async () => {
  const r = await etichetta('t_iniezione');
  await app.pagina.click('nav button[data-tab="prodotti"]');
  await app.pagina.waitForTimeout(200);
  await app.pagina.evaluate(() => editProduct('t_iniezione'));
  await app.pagina.waitForTimeout(300);
  const attacco = await app.pagina.evaluate(() => window.__attacco);
  assert.equal(attacco, undefined, 'un testo del prodotto è stato eseguito come codice');
  assert.ok(!r.html.join('').includes('<script'), 'tag script finito in etichetta');
  assert.ok(!r.html.join('').includes('<img src=x'), 'tag img finito in etichetta');
  await app.pagina.click('nav button[data-tab="stampa"]');
});

test('avviso "biologico" nella scheda prodotto', async () => {
  await app.pagina.click('nav button[data-tab="prodotti"]');
  await app.pagina.evaluate(() => editProduct('t_bio'));
  await app.pagina.waitForTimeout(300);
  assert.match(await app.pagina.innerText('main'), /certificazione biologica/);
  await app.pagina.click('nav button[data-tab="stampa"]');
});

test('dati manomessi: id e logo non validi vengono ripuliti', async () => {
  const r = await app.pagina.evaluate(() => {
    const s = sanitize({ version: 1, settings: JSON.parse(JSON.stringify(S.settings)),
      prodotti: [{ id: '../<script>', nome: 'x', ingredienti: 'y' }, { id: 'buono', nome: 'z', ingredienti: 'w' }] });
    s.settings.logoCustom = 'javascript:alert(1)';
    const t = sanitize(s);
    return { ids: t.prodotti.map((p) => p.id), logo: t.settings.logoCustom };
  });
  assert.ok(!r.ids.includes('../<script>'), 'id pericoloso non scartato');
  assert.ok(r.ids.includes('buono'));
  assert.ok(!String(r.logo || '').startsWith('javascript:'), 'logo non valido accettato');
});

test('unione tra postazioni: vince la modifica più recente, le eliminazioni restano', async () => {
  const r = await app.pagina.evaluate(() => {
    const base = JSON.parse(JSON.stringify(S));
    const a = JSON.parse(JSON.stringify(base)), b = JSON.parse(JSON.stringify(base));
    a.prodotti.find((p) => p.id === 't_base').nome = 'Vecchio'; a.prodotti.find((p) => p.id === 't_base').updatedAt = 2000;
    b.prodotti.find((p) => p.id === 't_base').nome = 'Nuovo'; b.prodotti.find((p) => p.id === 't_base').updatedAt = 3000;
    b.prodotti.find((p) => p.id === 't_pezzo').deleted = true; b.prodotti.find((p) => p.id === 't_pezzo').updatedAt = 3000;
    const m1 = merge(a, b), m2 = merge(b, a);
    const nome = (m) => m.prodotti.find((p) => p.id === 't_base').nome;
    const del = (m) => !!m.prodotti.find((p) => p.id === 't_pezzo').deleted;
    // a parità di data delle impostazioni vince l'archivio (secondo argomento)
    const x = JSON.parse(JSON.stringify(base)), y = JSON.parse(JSON.stringify(base));
    x.settings.azienda.nome = 'Postazione'; y.settings.azienda.nome = 'Archivio'; x.settings.updatedAt = y.settings.updatedAt = 5000;
    return [nome(m1), nome(m2), del(m1), del(m2), merge(x, y).settings.azienda.nome];
  });
  assert.deepEqual(r, ['Nuovo', 'Nuovo', true, true, 'Archivio']);
});

test('dati locali illeggibili: conservati a parte, non persi', async () => {
  const { pagina, ctx } = await apriApp(browser, server.url);
  const chiave = await pagina.evaluate(() => typeof KEY_DATA !== 'undefined' ? KEY_DATA : 'mag_data');
  await pagina.evaluate((k) => localStorage.setItem(k, '{rotto'), chiave);
  await pagina.reload(); await pagina.waitForTimeout(300);
  const copie = await pagina.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('_errore_')).map((k) => localStorage.getItem(k)));
  assert.deepEqual(copie, ['{rotto']);
  await ctx.close();
});

test('chiave GitHub: salvata solo cifrata, si apre solo con la password giusta', async () => {
  const r = await app.pagina.evaluate(async () => {
    const token = 'github_pat_' + 'Zz9'.repeat(10);
    const cfg = await ghSeal('utente/archivio', token, 'password-di-prova');
    let sbagliata = 'aperta';
    try { await ghOpen(cfg, 'altra-password'); } catch { sbagliata = 'rifiutata'; }
    return { inChiaro: JSON.stringify(cfg).includes(token), v: cfg.v, iter: cfg.iter,
      giusta: (await ghOpen(cfg, 'password-di-prova')) === token, sbagliata,
      corta: ghPwCheck('1234567', '1234567'), diverse: ghPwCheck('12345678', '12345679'), ok: ghPwCheck('12345678', '12345678') };
  });
  assert.equal(r.inChiaro, false);
  assert.equal(r.v, 2);
  assert.ok(r.iter >= 600000);
  assert.equal(r.giusta, true);
  assert.equal(r.sbagliata, 'rifiutata');
  assert.ok(r.corta && r.diverse);
  assert.equal(r.ok, '');
});

test('impronta delle etichette invariata (protegge dalle modifiche involontarie)', async () => {
  const impronta = {};
  for (const p of prodotti.filter((x) => !x.deleted)) impronta[p.id] = (await etichetta(p.id)).html;
  const file = join(RADICE, 'tests/fixtures/impronta-etichette.json');
  if (process.env.AGGIORNA_IMPRONTA) { await writeFile(file, JSON.stringify(impronta, null, 1) + '\n'); return; }
  const attesa = JSON.parse(await readFile(file, 'utf8'));
  for (const id of Object.keys(attesa)) assert.deepEqual(impronta[id], attesa[id], `l'etichetta di ${id} è cambiata`);
});

test('nessun errore JavaScript o di sicurezza (CSP) durante i test', () => {
  assert.deepEqual(app.errori, []);
});
