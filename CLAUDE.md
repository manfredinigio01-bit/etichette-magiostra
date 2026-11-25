# Etichette La Magiostra – note per le modifiche

App PWA per creare e stampare le etichette alimentari di La Magiostra (gastronomia vegetale, Cremona). Utente: Giovanni. Lingua dell'interfaccia: italiano.

## Struttura
- `index.html` – tutta l'app (HTML + CSS + JS vanilla, nessuna dipendenza). Loghi incorporati come PNG base64 (`LOGO_SOLE`, `LOGO_SCRITTA`).
- `sw.js` – service worker (prima la rete, poi la cache → funziona offline).
- `version.json` – versione pubblicata; l'app la confronta con `APP_VERSION` e mostra "Aggiorna ora".
- `manifest.webmanifest`, `icons/` – installazione.
- Pubblicata con GitHub Pages dal branch `main`, cartella root.

## Pubblicare una modifica
1. Aumentare la versione in **tre** punti: `APP_VERSION` in `index.html`, `version.json`, nome `CACHE` in `sw.js`.
2. Commit e push su `main`. Le postazioni ricevono la barra "Aggiorna ora".

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
- Layout predefinito: logo **compatto** (sole piccolo + ragione sociale + indirizzo), niente "CUCINA", niente telefono/email, niente data di produzione stampata, piè di pagina compatto. Migrazione una tantum tramite flag `settings.layout024`.
- Testo **sempre a 7 pt** (minimo di legge), mai ingrandito; nome prodotto 9 pt. La stampa è BLOCCATA se il testo non entra (niente eccezioni sotto i 7 pt).
- Ragione sociale: "La Magiostra di Aquilino e C. snc", Via Grado 1 – 26100 Cremona (CR).
- Formati: oggi 60×70 (circa 510 caratteri di ingredienti con prezzo); preset A4 66×80 (circa 740).

- Fogli: Markin 210A420 63,5×72, 12/foglio (preset `L7164`), niente linee di taglio, margine interno 3 mm (migrazione `layout029`).
- Prezzo (v0.3.0): `tipoPrezzo` 'kg' (prezzoKg) o 'pezzo' (prezzoPezzo fisso). Decisione Giovanni 18/11: in etichetta SOLO il prezzo scelto (al kg = €/kg, al pezzo = € confezione), nessun totale né €/kg aggiuntivo. Scelta anche in stampa (FORM.tipoPrezzo).

- Linea di punta (v0.4.0): prodotto `linea:'punta'` + `categoria` (settings.categorie: id, nome, colore) + `fraseFronte`. In stampa ogni confezione = 2 etichette 63,5×72: `frontHTML` (nome grande Oswald nel colore categoria, sottotitolo DM Serif, fascia colore con categoria e peso netto) + retro `labelHTML` con classe `pt` (accenti colore). Font Oswald/DM Serif Display incorporati base64 (OFL), CSP `font-src 'self' data:`. Palette colori definitive: in attesa da Giovanni. v0.4.1: `settings.stileFronte` a|b (B = fascia verticale a sinistra con sole bianco via filter:invert, `frontHTML_B`). v0.4.2: Giovanni ha scelto lo stile A; `sanitize` forza 'a' e il selettore è stato tolto.

## Sicurezza (v0.2.6)
- CSP: `connect-src 'self'`, nessuna risorsa esterna. Non aggiungere CDN, analytics o font esterni.
- `sanitize()` ripulisce ogni dato caricato (archivio condiviso, backup, localStorage): id solo `[A-Za-z0-9_-]`, numeri limitati, logo solo data:image png/jpeg/webp. Ogni campo nuovo va aggiunto lì.
- Tutto il testo inserito nell'HTML passa da `esc()`.
- `updatedBy` = nome postazione (DEV.nome) su prodotti salvati/eliminati.

## Da fare / idee
- Importazione dati dal vecchio software Helmac HLL (formato da scoprire).
- Formato etichetta definitivo e fogli adesivi laser da scegliere (stampante Samsung laser).

## Archivio online (v0.5.0, 24/11/2026)
- Sincronizzazione tramite repository GitHub PRIVATO `manfredinigio01-bit/etichette-magiostra-dati`, file `archivio.json` (JSON indentato, ogni salvataggio = commit, storico completo). API contents con `sha` → su 409/422 rilegge, unisce e riprova.
- Chiave per postazione in `localStorage.mag_gh` ({repo, token}); token fine-grained con solo Contents read/write su quel repo. Rifiuta repo pubblici. CSP `connect-src 'self' https://api.github.com`.
- Se GH è collegato, il vecchio metodo file (File System Access) è disattivato; resta come opzione "vecchio metodo".
- `updatedAt` monotono (max(now, precedente+1)) su prodotti, eliminazioni e impostazioni: una modifica vince sempre sulla versione da cui parte anche se l'orologio del PC è indietro.
- `merge`: a parità di `settings.updatedAt` vince l'archivio (b), così una postazione nuova non sovrascrive le impostazioni.
- Claude può modificare le ricette direttamente in `archivio.json` del repo dati (alzare `updatedAt` del prodotto modificato).

## App Cucina (cartella `cucina/`, v1.0.0, 25/11/2026)
- App SEPARATA (ricettario, food cost, prezzi d'acquisto, archivio piatti), stesso repo per comodità di pubblicazione: https://manfredinigio01-bit.github.io/etichette-magiostra/cucina/ — manifest, service worker (`cucina-vN`) e version.json propri. Il SW delle etichette ignora `/cucina/`.
- Pubblicare: alzare `APP_VERSION` in `cucina/app.js`, `cucina/version.json`, `CACHE` in `cucina/sw.js`.
- Dati: repo PRIVATO `manfredinigio01-bit/magiostra-cucina-dati`, file `ricettario.json` (ingredienti, packaging, ricette, archivio piatti, stagionalità, mappaFatture voce→ingrediente, importati). Unione per `updatedAt` come le etichette; a parità vince l'archivio online.
- Sicurezza: password all'apertura; token + copia locale cifrati AES-GCM 256 con chiave PBKDF2-SHA256 600.000 iterazioni (IndexedDB `cucina-magiostra`: vault, cache, dir). Blocco dopo 30 min. CSP senza `unsafe-inline` negli script: niente onclick inline, solo data-act.
- Food cost: `calc()` replica esattamente le formule del file Excel v10 (verificato su 104 schede, differenze 0). L'export Excel (ExcelJS, `lib/`) riscrive la stessa struttura con formule; ricalcolato con LibreOffice = valori dell'app.
- Lettura file in locale: fatture FatturaPA (.xml, .p7m, .zip), PROPOSTE della GASTRONOMIA (.docx) → archivio piatti, .xlsx con righe descrizione/prezzo. Regole prezzi: ultimo prezzo pagato netto (PrezzoTotale/Quantita), farine solo Mulino Sobrino, formato più grande a parità di data.
- Cartella Drive collegata (File System Access): scrive "Cucina La Magiostra - ricettario e food cost.xlsx", backup JSON e "Backup Cucina/cucina-AAAA-MM-GG.json".
- Collegamento etichette: `ricetta.etichetta` = id prodotto in `etichette-magiostra-dati/archivio.json`; l'app può creare/aggiornare il testo ingredienti di un'etichetta (ordine per peso).
