// Gestione delle versioni: versione normale (cartella principale) e versione di PROVA (cartella prova/).
// Si usa da terminale, nella cartella del progetto:
//
//   node strumenti/versioni.mjs stato                       mostra le due versioni
//   node strumenti/versioni.mjs nuova-prova                 copia la versione normale in prova/ (si riparte da lì)
//   node strumenti/versioni.mjs alza 0.8.0 "cosa cambia"    alza la versione di PROVA nei 3 punti (app.js, version.json, sw.js)
//   node strumenti/versioni.mjs promuovi                    porta la versione di prova nella versione normale
//
// Regola: si modifica SOLO in prova/, si prova all'indirizzo .../prova/, poi "promuovi". Prima di promuovere
// la versione in uso va salvata nella cartella Drive "software" (vedi 00-LEGGIMI-PRIMA.pdf).
import { readFile, writeFile, mkdir, cp, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROVA = join(RADICE, 'prova');
// file che compongono l'app (gli stessi nelle due versioni)
const FILE_APP = ['index.html', 'app.js', 'sw.js', 'version.json', 'manifest.webmanifest', 'icons', 'lib'];

const esiste = (p) => access(p).then(() => true, () => false);
const leggi = (p) => readFile(p, 'utf8');
async function versione(dir) {
  const v = JSON.parse(await leggi(join(dir, 'version.json'))).version;
  const app = (await leggi(join(dir, 'app.js'))).match(/const APP_VERSION\s*=\s*'([^']+)'/)?.[1];
  const cache = (await leggi(join(dir, 'sw.js'))).match(/-v(\d+)'/)?.[1];
  return { v, app, cache: Number(cache) };
}
const confronta = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
async function copia(da, a) {
  for (const f of FILE_APP) if (await esiste(join(da, f))) await cp(join(da, f), join(a, f), { recursive: true, force: true });
}
const fine = (msg) => { console.error('FERMO: ' + msg); process.exit(1); };

const [, , comando, ...arg] = process.argv;
if (comando === 'stato') {
  const n = await versione(RADICE);
  console.log(`Versione normale: ${n.v} (app.js ${n.app}, cache v${n.cache})`);
  if (await esiste(PROVA)) { const p = await versione(PROVA); console.log(`Versione di prova: ${p.v} (app.js ${p.app}, cache v${p.cache})`); }
  else console.log('Versione di prova: nessuna');
} else if (comando === 'nuova-prova') {
  await mkdir(PROVA, { recursive: true });
  await copia(RADICE, PROVA);
  console.log('Fatto: prova/ ora è uguale alla versione normale. Modifica i file in prova/.');
} else if (comando === 'alza') {
  const [nuova, nota = ''] = arg;
  if (!/^\d+\.\d+\.\d+$/.test(nuova || '')) fine('scrivi la versione nella forma 1.2.3');
  const n = await versione(RADICE), p = await versione(PROVA);
  if (confronta(nuova, n.v) <= 0) fine(`la nuova versione deve essere più alta di quella normale (${n.v})`);
  const cache = Math.max(n.cache, p.cache) + 1;
  const app = join(PROVA, 'app.js'), sw = join(PROVA, 'sw.js');
  await writeFile(app, (await leggi(app)).replace(/const APP_VERSION\s*=\s*'[^']+'/, `const APP_VERSION='${nuova}'`));
  await writeFile(sw, (await leggi(sw)).replace(/-v\d+'/, `-v${cache}'`));
  const oggi = new Date().toISOString().slice(0, 10);
  await writeFile(join(PROVA, 'version.json'), JSON.stringify({ version: nuova, data: oggi, note: nota }) + '\n');
  console.log(`Versione di prova portata a ${nuova} (cache v${cache}).`);
} else if (comando === 'promuovi') {
  const n = await versione(RADICE), p = await versione(PROVA);
  if (p.v !== p.app) fine(`in prova/ version.json (${p.v}) e app.js (${p.app}) non coincidono`);
  if (confronta(p.v, n.v) <= 0) fine(`la prova (${p.v}) non è più nuova della versione normale (${n.v}): usa prima "alza"`);
  if (p.cache <= n.cache) fine('il numero della cache in prova/sw.js deve essere più alto');
  await copia(PROVA, RADICE);
  console.log(`Fatto: la versione normale ora è la ${p.v}. Controlla con "npm test", poi salva e pubblica.`);
} else {
  console.log('Comandi: stato | nuova-prova | alza <versione> "<nota>" | promuovi');
}
