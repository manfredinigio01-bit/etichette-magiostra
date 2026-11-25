"""Divide prova/app.js in più file per argomento (operazione una tantum del 25/11/2026).
Il contenuto non cambia: i file, uniti nell'ordine di caricamento, ridanno esattamente l'app.js originale."""
import re, sys, pathlib

DIR = pathlib.Path(sys.argv[1])
src = (DIR / 'app.js').read_text(encoding='utf8')
righe = src.split('\n')

def riga(marcatore):
    idx = [i for i, r in enumerate(righe) if r.startswith(marcatore)]
    assert len(idx) == 1, (marcatore, idx)
    return idx[0]

# (file, prima riga) in ordine; ogni file arriva fino all'inizio del successivo
tagli = [
    ('js/avvio-prova.js', 0),
    ('js/loghi.js', riga('const LOGO_SOLE=')),
    ('js/allergeni-e-dati-base.js', riga('/* ================== DATI DI BASE')),
    ('js/stato.js', riga('/* ================== STATO')),
    ('js/etichetta.js', riga('/* ================== UTILITÀ')),
    ('js/stampa.js', riga('/* ================== STAMPA ================== */')),
    ('js/schermata-stampa.js', riga('/* ================== UI: TAB')),
    ('js/schermata-prodotti.js', riga('/* ---------- PRODOTTI')),
    ('js/schermata-impostazioni.js', riga('/* ---------- IMPOSTAZIONI')),
    ('js/archivio-file.js', riga('/* ================== ARCHIVIO CONDIVISO')),
    ('js/archivio-online.js', riga('/* ================== ARCHIVIO ONLINE')),
    ('js/versione-e-pulsanti.js', riga('/* ================== VERSIONE E AGGIORNAMENTI')),
]
assert [t[1] for t in tagli] == sorted(t[1] for t in tagli)
(DIR / 'js').mkdir(exist_ok=True)
pezzi = []
for k, (nome, da) in enumerate(tagli):
    a = tagli[k + 1][1] if k + 1 < len(tagli) else len(righe)
    testo = '\n'.join(righe[da:a])
    pezzi.append(testo)
    (DIR / nome).write_text(testo + '\n', encoding='utf8')
assert '\n'.join(pezzi) == src, 'la divisione non ricompone il file originale'
(DIR / 'app.js').unlink()
print('\n'.join(n for n, _ in tagli))
