# Versione normale e versione di prova

| | Indirizzo | Dati |
|---|---|---|
| **Normale** (quella del negozio) | https://manfredinigio01-bit.github.io/etichette-magiostra/ | quelli veri, sincronizzati con l'archivio online |
| **Prova** | https://manfredinigio01-bit.github.io/etichette-magiostra/prova/ | separati (chiavi `prova_…` nel browser); l'archivio online si **legge** ma non si **scrive** mai |

La prova si riconosce dalla fascia gialla "VERSIONE DI PROVA" e dal titolo "PROVA –". Non si installa come app.

## Come si fa una modifica

1. `node strumenti/versioni.mjs nuova-prova` — solo se `prova/` non esiste o va riallineata alla versione normale.
2. Modificare i file **in `prova/`**, mai nella cartella principale.
3. `node strumenti/versioni.mjs alza 0.8.0 "cosa cambia"` — alza la versione nei 3 punti (app.js, version.json, sw.js).
4. `APP_DIR=prova npm test` e pubblicare (commit + push): la prova è online in un paio di minuti.
5. Provare all'indirizzo di prova, anche con i prodotti veri (collegando l'archivio online: in prova è in sola lettura).
6. Salvare la versione in uso nella cartella Drive `software` (regola delle versioni, `00-LEGGIMI-PRIMA.pdf`).
7. `node strumenti/versioni.mjs promuovi`, poi `npm test`, commit e push: arriva a tutte le postazioni ("Aggiorna ora").

Se GitHub mostra una **X rossa** sul controllo "Test etichette", non promuovere.
