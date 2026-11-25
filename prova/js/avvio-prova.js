// Versione di PROVA (cartella prova/): stesso codice, dati separati (prefisso "prova_"),
// archivio online in SOLA LETTURA (nessun salvataggio su GitHub), niente file condiviso. Vedi PROVA.md.
const PROVA = /\/prova\//.test(location.pathname);
const PFX = PROVA ? 'prova_' : '';
const KEY_DATA = PFX + 'mag_data';
