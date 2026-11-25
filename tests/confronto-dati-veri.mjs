// Confronto con i DATI VERI, da usare prima e dopo una modifica importante al codice.
// I dati veri non entrano mai nel repository: si passano da fuori e il risultato va in tests/locale/ (ignorata da git).
//
//   node tests/confronto-dati-veri.mjs <archivio.json> <uscita.json>
//   node tests/confronto-dati-veri.mjs <archivio.json> <uscita2.json> && diff <uscita.json> <uscita2.json>
//
// Per ogni prodotto attivo produce l'HTML esatto dell'etichetta (con data fissa) e se il testo entra a 7 pt.
import { readFile, writeFile } from 'node:fs/promises';
import { avviaServer, avviaBrowser, apriApp } from './aiuto.mjs';

const [, , ingresso, uscita] = process.argv;
if (!ingresso || !uscita) { console.error('Uso: node tests/confronto-dati-veri.mjs <archivio.json> <uscita.json>'); process.exit(2); }
const archivio = JSON.parse(await readFile(ingresso, 'utf8'));
const server = await avviaServer(), browser = await avviaBrowser();
const { pagina, ctx, errori } = await apriApp(browser, server.url);
await pagina.evaluate((a) => localStorage.setItem(typeof KEY_DATA !== 'undefined' ? KEY_DATA : 'mag_data', JSON.stringify(a)), archivio);
await pagina.reload(); await pagina.waitForTimeout(500);
const risultato = await pagina.evaluate(() => {
  const DATA = '2026-11-25', out = {};
  const el = document.getElementById('print');
  for (const p of S.prodotti.filter((x) => !x.deleted)) {
    for (const prezzo of [false, true]) {
      const job = { pid: p.id, kg: 0.25, prod: DATA, scad: addDays(DATA, p.giorni || 0), lotto: lotto(DATA),
        prezzo: prezzoCalc(p, 0.25), tipoPrezzo: p.tipoPrezzo, showPrice: prezzo };
      const html = labelsFor(job);
      el.innerHTML = html.join(''); fitLabels(el);
      out[p.id + (prezzo ? ':prezzo' : '')] = { html, entra: !el.querySelector('.lbl.overflow') };
    }
  }
  el.innerHTML = '';
  return { prodotti: S.prodotti.filter((x) => !x.deleted).length, etichette: out };
});
await writeFile(uscita, JSON.stringify(risultato, null, 1));
const nonEntrano = Object.entries(risultato.etichette).filter(([, v]) => !v.entra).map(([k]) => k);
console.log(`Prodotti attivi: ${risultato.prodotti}. Etichette che NON entrano a 7 pt: ${nonEntrano.length}${nonEntrano.length ? ' (' + nonEntrano.join(', ') + ')' : ''}`);
if (errori.length) { console.error('ERRORI:', errori); process.exitCode = 1; }
await ctx.close(); await browser.close(); await server.chiudi();
