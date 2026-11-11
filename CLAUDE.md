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

## Sicurezza (v0.2.6)
- CSP: `connect-src 'self'`, nessuna risorsa esterna. Non aggiungere CDN, analytics o font esterni.
- `sanitize()` ripulisce ogni dato caricato (archivio condiviso, backup, localStorage): id solo `[A-Za-z0-9_-]`, numeri limitati, logo solo data:image png/jpeg/webp. Ogni campo nuovo va aggiunto lì.
- Tutto il testo inserito nell'HTML passa da `esc()`.
- `updatedBy` = nome postazione (DEV.nome) su prodotti salvati/eliminati.

## Da fare / idee
- Importazione dati dal vecchio software Helmac HLL (formato da scoprire).
- Formato etichetta definitivo e fogli adesivi laser da scegliere (stampante Samsung laser).
