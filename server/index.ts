// Server dell'app Etichette (https://manfredinigio01-bit.github.io/etichette-magiostra/): progetto Cloudflare
// separato dal sito (etichette-magiostra-server, indirizzo https://etichette.lamagiostra.it).
//
// Perché serve: l'app è pubblica e non può contenere la chiave GitHub. La chiave sta solo su
// Cloudflare (segreto ETI_GH_TOKEN); l'app manda il PIN del negozio (segreto ETI_PIN), qui viene
// controllato e, se è giusto, l'app riceve un "pass" firmato valido ETI_ORE ore. Con il pass legge e
// salva archivio.json nel repository privato. Il PIN non viene mai salvato sui PC.
//
// Indirizzi:
//   POST /sblocca   {pin}                     → {pass, scade}       (401 PIN sbagliato, 429 troppi tentativi)
//   GET  /archivio  Authorization: Bearer pass → {testo, sha}       (testo e sha null se il file non esiste)
//   PUT  /archivio  {testo, sha, nome}        → {sha}               (409 se un'altra postazione ha salvato prima)
//
// Configurazione su Cloudflare (progetto etichette-magiostra-server → Settings → Variables and secrets):
//   ETI_PIN       segreto: il PIN del negozio (da 4 a 8 cifre)
//   ETI_GH_TOKEN  segreto: token GitHub "fine-grained" con Contents lettura e scrittura SOLO su etichette-magiostra-dati
// Senza questi due l'app continua a funzionare come prima (chiave GitHub su ogni PC).
//
// Protezione dai tentativi a raffica: ETI_LIMITE (binding Rate Limiting, in server/wrangler.jsonc) per indirizzo IP,
// più un secondo di attesa per ogni PIN sbagliato.

export interface EnvEtichette {
  ETI_PIN?: string;
  ETI_GH_TOKEN?: string;
  ETI_REPO?: string;
  ETI_ORIGINI?: string;
  ETI_GH_API?: string; // solo per le prove in locale
  ETI_ORE?: string;
  AMBIENTE?: string;
  ETI_LIMITE?: { limit(opzioni: { key: string }): Promise<{ success: boolean }> };
}

const REPO = 'manfredinigio01-bit/etichette-magiostra-dati';
const FILE = 'archivio.json';
const ORIGINI = 'https://manfredinigio01-bit.github.io';
const ORE = 14; // un giorno di lavoro: il pass scade di notte anche se l'app resta aperta
const MAX_TESTO = 8_000_000;
const PIN_OK = /^\d{4,8}$/;
const SHA_OK = /^[0-9a-f]{40}$/;
const TE = new TextEncoder();

function origini(env: EnvEtichette): string[] {
  return (env.ETI_ORIGINI || ORIGINI).split(',').map((s) => s.trim()).filter(Boolean);
}

function cors(request: Request, env: EnvEtichette): Record<string, string> {
  const o = request.headers.get('Origin');
  if (!o || !origini(env).includes(o)) return {};
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Etichette-Prova',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function json(request: Request, env: EnvEtichette, corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(request, env) },
  });
}

function b64url(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64(testo: string): string {
  const u8 = TE.encode(testo);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

function deb64(t: string): string {
  const bin = atob(t.replace(/\s/g, ''));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(u8);
}

// La chiave che firma i pass dipende da PIN e token: cambiando il PIN tutti i pass vecchi smettono di valere.
async function chiave(env: EnvEtichette): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', TE.encode(`etichette|${env.ETI_PIN}|${env.ETI_GH_TOKEN}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function firma(env: EnvEtichette, testo: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', await chiave(env), TE.encode(testo))));
}

// Confronto che non dipende da quanti caratteri sono giusti.
async function uguali(env: EnvEtichette, a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([firma(env, 'confronto|' + a), firma(env, 'confronto|' + b)]);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

async function nuovoPass(env: EnvEtichette): Promise<{ pass: string; scade: number }> {
  const ore = Math.min(24, Math.max(1, Number(env.ETI_ORE) || ORE));
  const scade = Date.now() + ore * 3600_000;
  const dati = b64url(TE.encode(JSON.stringify({ s: scade, n: b64url(crypto.getRandomValues(new Uint8Array(9))) })));
  return { pass: `${dati}.${await firma(env, 'pass|' + dati)}`, scade };
}

async function passValido(request: Request, env: EnvEtichette): Promise<boolean> {
  const m = /^Bearer ([A-Za-z0-9_-]{10,200})\.([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '');
  if (!m) return false;
  if (!(await uguali(env, m[2], await firma(env, 'pass|' + m[1])))) return false;
  try {
    const { s } = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))));
    return typeof s === 'number' && s > Date.now();
  } catch {
    return false;
  }
}

function github(env: EnvEtichette, metodo: string, percorso: string, corpo?: unknown): Promise<Response> {
  return fetch((env.ETI_GH_API || 'https://api.github.com') + percorso, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${env.ETI_GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'lamagiostra-etichette',
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
}

function percorsoFile(env: EnvEtichette): string {
  return `/repos/${env.ETI_REPO || REPO}/contents/${FILE}`;
}

async function leggi(request: Request, env: EnvEtichette): Promise<Response> {
  const r = await github(env, 'GET', percorsoFile(env));
  if (r.status === 404) return json(request, env, { testo: null, sha: null });
  if (!r.ok) return json(request, env, { errore: `GitHub ha risposto ${r.status}` }, 502);
  const j = (await r.json()) as { sha: string; content?: string };
  let testo = j.content ? deb64(j.content) : '';
  if (!j.content) {
    // file oltre 1 MB: GitHub non lo manda insieme, va chiesto a parte
    const b = await github(env, 'GET', `/repos/${env.ETI_REPO || REPO}/git/blobs/${j.sha}`);
    if (!b.ok) return json(request, env, { errore: `GitHub ha risposto ${b.status}` }, 502);
    testo = deb64(((await b.json()) as { content: string }).content);
  }
  return json(request, env, { testo, sha: j.sha });
}

async function salva(request: Request, env: EnvEtichette): Promise<Response> {
  if (env.AMBIENTE === 'prova' || request.headers.get('X-Etichette-Prova')) {
    return json(request, env, { errore: 'versione di prova: l\'archivio non si modifica' }, 403);
  }
  const corpo = (await request.json().catch(() => null)) as { testo?: unknown; sha?: unknown; nome?: unknown } | null;
  const testo = corpo && typeof corpo.testo === 'string' ? corpo.testo : '';
  if (!testo || testo.length > MAX_TESTO) return json(request, env, { errore: 'archivio mancante o troppo grande' }, 400);
  try {
    const d = JSON.parse(testo) as { settings?: unknown; prodotti?: unknown };
    if (!d || typeof d.settings !== 'object' || !Array.isArray(d.prodotti)) throw new Error();
  } catch {
    return json(request, env, { errore: 'non è un archivio etichette' }, 400);
  }
  const sha = typeof corpo?.sha === 'string' && SHA_OK.test(corpo.sha) ? corpo.sha : undefined;
  const nome = (typeof corpo?.nome === 'string' ? corpo.nome : '').replace(/[^\p{L}\p{N} ._'-]/gu, '').slice(0, 40) || 'postazione senza nome';
  const w = await github(env, 'PUT', percorsoFile(env), { message: `Etichette: salvataggio da ${nome}`, content: b64(testo), ...(sha ? { sha } : {}) });
  if (w.status === 409 || w.status === 422) return json(request, env, { errore: 'un\'altra postazione ha salvato prima' }, 409);
  if (!w.ok) return json(request, env, { errore: `GitHub ha risposto ${w.status}` }, 502);
  const j = (await w.json()) as { content?: { sha?: string } };
  return json(request, env, { sha: j.content?.sha || null });
}

async function sblocca(request: Request, env: EnvEtichette): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') || 'sconosciuto';
  if (env.ETI_LIMITE) {
    const { success } = await env.ETI_LIMITE.limit({ key: 'pin:' + ip });
    if (!success) return json(request, env, { errore: 'troppi tentativi: riprova tra un minuto' }, 429);
  }
  const corpo = (await request.json().catch(() => null)) as { pin?: unknown } | null;
  const pin = corpo && typeof corpo.pin === 'string' ? corpo.pin.trim() : '';
  if (!PIN_OK.test(pin) || !(await uguali(env, pin, String(env.ETI_PIN)))) {
    await new Promise((r) => setTimeout(r, 1000));
    return json(request, env, { errore: 'PIN sbagliato' }, 401);
  }
  return json(request, env, await nuovoPass(env));
}

async function apiEtichette(request: Request, env: EnvEtichette, pathname: string): Promise<Response> {
  const o = request.headers.get('Origin');
  if (o && !origini(env).includes(o)) return new Response('Origine non ammessa', { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
  // spazi o a capo incollati per sbaglio nei segreti non devono bloccare tutto
  env = { ...env, ETI_PIN: (env.ETI_PIN || '').trim(), ETI_GH_TOKEN: (env.ETI_GH_TOKEN || '').trim() };
  if (!env.ETI_PIN || !env.ETI_GH_TOKEN || !PIN_OK.test(env.ETI_PIN)) {
    // dice COSA manca, mai i valori: serve a sistemare la configurazione su Cloudflare
    const manca: string[] = [];
    if (!env.ETI_GH_TOKEN) manca.push('ETI_GH_TOKEN');
    if (!env.ETI_PIN) manca.push('ETI_PIN');
    else if (!PIN_OK.test(env.ETI_PIN)) manca.push(`ETI_PIN valido (deve essere di sole cifre, da 4 a 8: ora è lungo ${env.ETI_PIN.length} caratteri)`);
    return json(request, env, { errore: 'non configurato', manca }, 503);
  }

  if (pathname === '/sblocca') {
    if (request.method !== 'POST') return json(request, env, { errore: 'metodo' }, 405);
    return sblocca(request, env);
  }
  if (pathname === '/archivio') {
    if (request.method !== 'GET' && request.method !== 'PUT') return json(request, env, { errore: 'metodo' }, 405);
    if (!(await passValido(request, env))) return json(request, env, { errore: 'serve il PIN' }, 401);
    return request.method === 'GET' ? leggi(request, env) : salva(request, env);
  }
  return json(request, env, { errore: 'non trovato' }, 404);
}

export default {
  async fetch(request: Request, env: EnvEtichette): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/') return new Response('Server dell\'app Etichette di La Magiostra.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    return apiEtichette(request, env, pathname);
  },
};
