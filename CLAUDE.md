# Etichette La Magiostra – note per le modifiche

App PWA per creare e stampare le etichette alimentari di La Magiostra (gastronomia vegetale, Cremona). Utente: Giovanni. Lingua dell'interfaccia: italiano.

## Struttura
- **Dalla 0.8.0 (25/11/2026; versione normale dalla 0.8.1, promossa la sera del 25/11)** il codice è diviso per argomento, senza cambiare una riga: `index.html` (solo la struttura, 3 KB), `stile.css`, `caratteri.css` (font Oswald e DM Serif in base64, licenza OFL), e in `js/` nell'ordine di caricamento: `avvio-prova` (PROVA, PFX, KEY_DATA), `loghi` (LOGO_SOLE, LOGO_SCRITTA in base64), `allergeni-e-dati-base`, `stato` (defaultState, sanitize, normalize, load), `etichetta` (utilità + HTML dell'etichetta, minimo 7 pt), `stampa`, `schermata-stampa`, `schermata-prodotti`, `schermata-impostazioni`, `archivio-file`, `archivio-online` (GitHub + chiave cifrata), `versione-e-pulsanti` (APP_VERSION, HANDLERS). **L'ordine conta**: sono script classici che condividono le variabili globali, e una funzione è disponibile al caricamento solo per i file che vengono DOPO il suo. Nuovi file: aggiungerli sia in `index.html` sia nella lista `FILES` di `sw.js` (funzionamento offline). Divisione verificata: test, impronta, 87 prodotti veri e 174 etichette identici, collaudo chiave 33/33, offline OK.
- Fino alla 0.7.1: `index.html` – struttura e CSS; `app.js` – tutto il codice (JS vanilla, nessuna dipendenza). Loghi e font incorporati come base64 (`LOGO_SOLE`, `LOGO_SCRITTA`).
- **v0.6.0 (25/11/2026):** niente JavaScript dentro l'HTML. CSP `script-src 'self'` (senza `unsafe-inline`). Gli eventi usano `data-h-click|change|input="N"` → funzione `HANDLERS[N](el,ev)` in fondo ad `app.js`; i parametri passano in `data-click0`, `data-change0`… Per un nuovo pulsante: aggiungere una voce in `HANDLERS`, mai `onclick=`.
- `sw.js` – service worker (prima la rete, poi la cache → funziona offline).
- `version.json` – versione pubblicata; l'app la confronta con `APP_VERSION` e mostra "Aggiorna ora".
- `manifest.webmanifest`, `icons/` – installazione.
- Pubblicata con GitHub Pages dal branch `main`, cartella root.

## Pubblicare una modifica (dal 25/11/2026: sempre passando dalla versione di PROVA, vedi `PROVA.md`)
1. Modificare SOLO i file in `prova/` (https://manfredinigio01-bit.github.io/etichette-magiostra/prova/). Se `prova/` non è allineata: `node strumenti/versioni.mjs nuova-prova`.
2. `node strumenti/versioni.mjs alza X.Y.Z "nota"`: alza la versione nei tre punti (`APP_VERSION`, `version.json`, numero della `CACHE` in `sw.js`).
3. `APP_DIR=prova npm test`, commit e push: Giovanni prova all'indirizzo di prova.
4. Approvato: salvare la versione in uso nel Drive `software` (1-IN-USO → 2-PRECEDENTE → storico), poi `node strumenti/versioni.mjs promuovi`, `npm test`, commit e push.
- In prova (`PROVA` = percorso contiene `/prova/`): chiavi localStorage/IndexedDB con prefisso `prova_` (`PFX`, `KEY_DATA`), `syncGH()` legge e unisce ma non fa mai PUT, vecchio metodo file disattivato, fascia `#provabar`, niente manifest. `sw.js` è lo stesso file: con scope `/prova/` usa cache `prova-etichette-vN`; quello normale ignora `/cucina/` e `/prova/`.

## Test automatici (25/11/2026)
- `npm test` (Node 22 + Playwright, Chrome senza finestra; in locale `CHROME_PATH=/percorso/chrome npm test`), `APP_DIR=prova npm test` per la prova. Su GitHub girano a ogni push (`.github/workflows/test.yml`): X rossa = non promuovere.
- Solo prodotti INVENTATI in `tests/fixtures/prodotti-prova.json`: il repository è pubblico, mai dati veri.
- `tests/fixtures/impronta-etichette.json`: HTML esatto delle etichette di prova. Se una modifica VOLUTA cambia le etichette: `AGGIORNA_IMPRONTA=1 npm test` e spiegarlo nel commit.
- Dati veri prima/dopo una modifica importante: `node tests/confronto-dati-veri.mjs <archivio.json> tests/locale/prima.json` (cartella ignorata da git), poi di nuovo e confrontare. 25/11: 87 prodotti, 174 etichette, 0 fuori misura.

## Dati
- I dati NON sono nel repository: `localStorage` (`mag_data`, `mag_dev`) + file JSON condiviso scelto dall'utente (File System Access API, solo Chrome/Edge).
- Unione: per prodotto vince `updatedAt` più recente; le impostazioni vincono in blocco per `settings.updatedAt`. Eliminazioni = `deleted:true`.
- `DEV` (calibrazione stampante offX/offY, coda di stampa, posizione di partenza) è locale alla postazione.
- Mantenere sempre la compatibilità con i dati esistenti (aggiungere campi con default, non rinominare).
- **v0.3.4 (18/11/2026), correzione importante:** `SAFE_ID`, `LOGHI` e `IMG_OK` erano dichiarate dopo `let S = load()`; `sanitize()` andava in errore e `load()` ripartiva da zero a ogni apertura (dal v0.2.6): dati locali persi, una copia nuova del prodotto di esempio nell'archivio e impostazioni condivise sovrascritte dai valori predefiniti. Ora: costanti prima di `load()`, `defaultState()` senza prodotto di esempio e con `settings.updatedAt:0` (un avvio da zero non vince mai sull'archivio), le migrazioni `layoutXXX` non cambiano più `settings.updatedAt` (`normalize` gira anche dopo ogni unione), pulizia automatica delle copie mai modificate dell'esempio "Pasta al forno con ragù di cavolfiore" (ne resta una). Se i dati locali non si leggono, `load()` li conserva in `mag_data_errore_<data>` invece di perderli.
- Ogni costante usata da `load()`/`normalize()`/`sanitize()` va dichiarata PRIMA di `let S = load()`.
- v0.3.5: dicitura di conservazione `cs5` ("Conservare in luogo fresco e asciutto. Dopo l'apertura conservare in frigorifero e consumare entro 7 giorni.", TMC) per composte e conserve, aggiunta una tantum alle impostazioni esistenti con il flag `settings.cons035`.
- v0.3.6: l'avviso "prodotto da frigorifero con preferibilmente entro" usa `isFrigo()`: conta solo la conservazione da chiuso (il testo prima di "dopo l'apertura").

## Regole di etichettatura implementate (Reg. UE 1169/2011)
- Allergeni in grassetto automatico (dizionario `ALLERGENI` + `ESCLUSIONI` es. "noce moscata", "latte di cocco"); `*parola*` = grassetto forzato.
- Testo minimo 7 pt (x-height ≈ 1,2 mm); avviso se scende sotto o se il testo viene tagliato.
- Prodotti refrigerati deperibili: "Da consumarsi entro" (avviso se impostato "preferibilmente").
- Prezzo: mostrato con €/kg. Avviso se compare "bio/biologico" (negozio non certificato).
- Lotto = AAAAMMGG della data di produzione.

## Decisioni di Giovanni (11/11/2026)
- Si lavora solo dalla chat Claude del progetto; Claude pubblica direttamente su `main`.
- Layout predefinito: logo **compatto** (sole piccolo + ragione sociale + indirizzo), niente "CUCINA" (poi tornata il 18/11, v0.3.3, migrazione `layout031`), niente telefono/email, niente data di produzione stampata, piè di pagina compatto. Migrazione una tantum tramite flag `settings.layout024`.
- Testo **sempre a 7 pt** (minimo di legge), mai ingrandito; nome prodotto 9 pt. La stampa è BLOCCATA se il testo non entra (niente eccezioni sotto i 7 pt).
- Ragione sociale: "La Magiostra di Aquilino e C. snc", Via Grado 1 – 26100 Cremona (CR).
- Formati: oggi 60×70 (circa 510 caratteri di ingredienti con prezzo); preset A4 66×80 (circa 740).

- Fogli: Markin 210A420 63,5×72, 12/foglio (preset `L7164`), niente linee di taglio, margine interno 3 mm (migrazione `layout029`).
- Prezzo (v0.3.0): `tipoPrezzo` 'kg' (prezzoKg) o 'pezzo' (prezzoPezzo fisso). Decisione Giovanni 18/11: in etichetta SOLO il prezzo scelto (al kg = €/kg, al pezzo = € confezione), nessun totale né €/kg aggiuntivo. Scelta anche in stampa (FORM.tipoPrezzo).

- Linea di punta (v0.4.0): prodotto `linea:'punta'` + `categoria` (settings.categorie: id, nome, colore) + `fraseFronte`. In stampa ogni confezione = 2 etichette 63,5×72: `frontHTML` (nome grande Oswald nel colore categoria, sottotitolo DM Serif, fascia colore con categoria e peso netto) + retro `labelHTML` con classe `pt` (accenti colore). Font Oswald/DM Serif Display incorporati base64 (OFL), CSP `font-src 'self' data:`. Palette colori definitive: in attesa da Giovanni. v0.4.2: Giovanni ha scelto lo stile A; lo stile B è stato rimosso dal codice (v0.6.0), `sanitize` forza 'a'.

## Sicurezza (v0.2.6)
- CSP: `script-src 'self'`, `connect-src 'self' https://api.github.com`, nessuna risorsa esterna. Non aggiungere CDN, analytics o font esterni.
- `sanitize()` ripulisce ogni dato caricato (archivio condiviso, backup, localStorage): id solo `[A-Za-z0-9_-]`, numeri limitati, logo solo data:image png/jpeg/webp. Ogni campo nuovo va aggiunto lì.
- Tutto il testo inserito nell'HTML passa da `esc()`.
- `updatedBy` = nome postazione (DEV.nome) su prodotti salvati/eliminati.

## Da fare / idee
- Palette colori definitive della linea di punta (in attesa da Giovanni).
- 25/11/2026: importati 64 prodotti dalla bilancia Mainardi (id `mndNNN`), dopo l'approvazione di Giovanni prodotto per prodotto.

## Archivio online (v0.5.0, 24/11/2026)
- Sincronizzazione tramite repository GitHub PRIVATO `manfredinigio01-bit/etichette-magiostra-dati`, file `archivio.json` (JSON indentato, ogni salvataggio = commit, storico completo). API contents con `sha` → su 409/422 rilegge, unisce e riprova.
- Chiave per postazione in `localStorage.mag_gh` (fino a v0.6.1: {repo, token} in chiaro); token fine-grained con solo Contents read/write su quel repo. Rifiuta repo pubblici. CSP `connect-src 'self' https://api.github.com`.
- **v0.7.0 (25/11/2026): chiave cifrata con password della postazione.** `mag_gh` = `{v:2, repo, iter, salt, iv, ct}`: AES-GCM 256, chiave PBKDF2-SHA256 600.000 passaggi (stesso schema dell'app Cucina). `GHCFG` = configurazione salvata, `GH` = {repo, token} solo in memoria dopo lo sblocco. Decisione di Giovanni: **password solo per sincronizzare** — stampa e modifiche funzionano sempre; da bloccato `syncGH()` non parte e le modifiche restano in `mag_data`, partono allo sblocco (unione per `updatedAt`). Lo sblocco dura finché l'app resta aperta; pulsante "Blocca adesso". Barra `#ghbar` (bloccato / chiave non protetta). Password minimo 8 caratteri; dopo 3 errori attesa crescente 5 s → 5 min (`mag_gh_fail`, `mag_gh_failt`). Vecchio formato in chiaro: continua a sincronizzare con avviso finché sulla postazione non si sceglie una password ("Proteggi la chiave"). Password dimenticata = Scollega e ricollega con una chiave GitHub nuova. Con `GHCFG` presente il vecchio metodo file non parte mai, nemmeno da bloccato. Collaudo con Chrome e GitHub simulato: 33 controlli (`collaudo.py` nella sessione del 25/11).
- Se GH è collegato, il vecchio metodo file (File System Access) è disattivato; resta come opzione "vecchio metodo".
- `updatedAt` monotono (max(now, precedente+1)) su prodotti, eliminazioni e impostazioni: una modifica vince sempre sulla versione da cui parte anche se l'orologio del PC è indietro.
- `merge`: a parità di `settings.updatedAt` vince l'archivio (b), così una postazione nuova non sovrascrive le impostazioni.
- Claude può modificare le ricette direttamente in `archivio.json` del repo dati (alzare `updatedAt` del prodotto modificato).

## App Cucina (separata)
- Dal 25/11/2026 sta nel repo `manfredinigio01-bit/cucina-magiostra` (https://manfredinigio01-bit.github.io/cucina-magiostra/), con il suo CLAUDE.md. Dati: repo privato `magiostra-cucina-dati`.
- Qui resta solo `cucina/`: pagina di rimando + service worker che si autodistrugge (Edge non installava la Cucina dentro lo scope delle etichette). Il SW delle etichette ignora `/cucina/`.
- La Cucina legge e può aggiornare `etichette-magiostra-dati/archivio.json` (testo ingredienti in ordine di peso).

## Surgelati (0.8.1, 25/11/2026, promossa con la Cucina 1.5.1)
- Nel testo ingredienti `parola*` (asterisco attaccato alla fine) = ingrediente surgelato; `*parola*` resta grassetto forzato solo se l'asterisco di apertura NON segue una lettera/cifra/parentesi (`RE_BOLD`). `highlight()` restituisce anche `surg`.
- Se c'è almeno un surgelato e le diciture non parlano già di surgelato/congelato, sotto gli ingredienti compare "*Ingrediente surgelato." (`noteSurg`).
- Editor: caselle "Ingredienti surgelati" (`ingParts`, `toggleSurg`, handler 101), avviso se c'è scritto "semilavorato" o se le diciture parlano di surgelato senza asterisco.
- Prodotto `stato`: '' | 'decongelato' | 'surgelato' (handler 102) → riga "PRODOTTO DECONGELATO / SURGELATO" sotto il nome (anche sul fronte della linea di punta). Reg. UE 1169/2011 all. VI parte A punto 2: "decongelato" obbligatorio per alimenti congelati e venduti scongelati; NON obbligatorio per gli ingredienti (l'asterisco è facoltativo ma corretto). Avvisi sulla conservazione (−18 °C).
- Corretto: `updatedBy` non veniva salvato (era finito dentro un commento in `saveProduct`).
- Impronta invariata e 87 prodotti veri identici: le novità compaiono solo se usate.

## Testo dalla Cucina (0.8.2, 26/11/2026, promossa con la Cucina 1.5.2)
- Campi prodotto `fonte` ('cucina'|''), `ricetta` (id ricetta), `ingAt` (momento dell'ultima modifica del testo ingredienti). In `sanitize`.
- `fonte:'cucina'`: textarea ingredienti in sola lettura, caselle surgelati nascoste (si segnano nella Cucina), etichetta "da Cucina" in elenco, pulsante "Modifica a mano (sgancia dalla Cucina)" (handler 103 → `fonte:''`).
- `merge`: il prodotto vince per `updatedAt`, ma il blocco {ingredienti, fonte, ricetta, ingAt} segue l'`ingAt` più alto: un PC rimasto indietro che cambia il prezzo non riporta indietro il testo scritto dalla Cucina. `saveProduct` alza `ingAt` se cambiano testo o fonte.
- Avvio: `navigator.storage.persist()`; nella scheda di collegamento all'archivio, aiuto per i PC che perdono i dati alla chiusura (Edge/Chrome che cancellano i dati dei siti, profilo temporaneo, InPrivate).
