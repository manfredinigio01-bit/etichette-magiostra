# Server dell'app Etichette

Piccolo programma su Cloudflare, separato dal sito, che tiene la chiave GitHub dell'archivio
e controlla il PIN del negozio. L'app (cartella principale e `prova/`) gli parla a
`https://etichette.lamagiostra.it`. Dettagli in `index.ts` e nel `CLAUDE.md` del repository.

Prove in locale: file `.dev.vars` (ignorato da git) con `ETI_PIN`, `ETI_GH_TOKEN`, `ETI_GH_API`
(finto GitHub) ed `ETI_ORIGINI`, poi `npx wrangler dev`.
