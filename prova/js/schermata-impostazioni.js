/* ---------- IMPOSTAZIONI ---------- */
function setS(path,v,re=true){ const ks=path.split('.'); let o=S.settings; while(ks.length>1) o=o[ks.shift()]; o[ks[0]]=v; touchSettings(); if(re) render(); }
function viewImpostazioni(){
  const st=S.settings, a=st.azienda, e=st.etichetta, f=st.foglio;
  const fsa = 'showOpenFilePicker' in window;
  const sample={pid:prodotti()[0]?.id,kg:0.25,prod:isoToday(),scad:addDays(isoToday(),4),lotto:lotto(isoToday()),prezzo:'4.50',showPrice:true};
  const usedW=f.mLeft+f.cols*e.w+(f.cols-1)*f.gapX, usedH=f.mTop+f.rows*e.h+(f.rows-1)*f.gapY;
  return `<div class="grid2"><div>
  <div class="card"><h2>Dati in intestazione</h2>
    <div class="row"><label class="f">Nome azienda<input value="${esc(a.nome)}" data-h-change="43"></label><label class="f">Sotto il logo<input value="${esc(a.sottotitolo)}" data-h-change="44"></label></div>
    <div class="row"><label class="f">Ragione sociale (obbligatoria)<input value="${esc(a.ragioneSociale||'')}" data-h-change="45"></label></div>
    <div class="row"><label class="f">Indirizzo (obbligatorio)<input value="${esc(a.indirizzo)}" data-h-change="46"></label></div>
    <div class="row"><label class="f">Contatti<input value="${esc(a.contatti)}" data-h-change="47"></label><label class="chk"><input type="checkbox" ${e.mostraContatti?'checked':''} data-h-change="48"> Mostra</label></div>
    <div class="row"><label class="f">Logo<select data-h-change="49">
      ${[['sole+scritta','Sole + scritta (come ora)'],['scritta','Solo scritta'],['sole','Solo sole + nome'],['compatto','Compatto: sole piccolo + dati azienda accanto (più spazio)'],['nessuno','Nessun logo, solo testo'],['custom','Immagine personalizzata']].map(([v,n])=>`<option value="${v}" ${st.logo===v?'selected':''}>${n}</option>`).join('')}</select></label>
      ${st.logo==='custom'?`<label class="f">Carica logo (PNG/JPG/SVG)<input type="file" accept="image/png,image/jpeg,image/webp" data-h-change="50"></label>`:''}</div>
  </div>
  <div class="card"><h2>Etichetta</h2>
    <div class="row">
      <label class="f s">Larghezza mm<input value="${e.w}" data-h-change="51"></label>
      <label class="f s">Altezza mm<input value="${e.h}" data-h-change="52"></label>
      <label class="f s">Margine interno mm<input value="${e.pad}" data-h-change="53"></label>
    </div>
    <div class="row">
      <label class="f s">Dimensione testo (pt, min. 7)<input value="${Math.max(MIN_LEGALE,e.minPt)}" data-h-change="54"></label>
      <label class="f">Dicitura data produzione<input value="${esc(e.etichettaProdotto)}" data-h-change="55"></label>
    </div>
    <label class="chk"><input type="checkbox" ${e.allergeniMaiuscolo?'checked':''} data-h-change="56"> Allergeni anche in MAIUSCOLO</label>
    <label class="chk"><input type="checkbox" ${e.mostraProduzione!==false?'checked':''} data-h-change="57"> Stampa la data di produzione (facoltativa)</label>
    <label class="chk"><input type="checkbox" ${e.piedeCompatto?'checked':''} data-h-change="58"> Piè di pagina compatto (date, lotto e peso su righe, senza riquadro)</label>
    <div class="muted" style="margin-top:8px">Tutto il testo è stampato alla dimensione minima consentita (il nome prodotto a 9 pt), mai sotto i 7 pt (circa 1,28 mm di altezza delle minuscole, Reg. UE 1169/2011 art. 13). Se non entra, la stampa viene bloccata: serve un formato più grande o un testo più corto.</div>
  </div>
  <div class="card"><h2>Foglio di stampa</h2>
    <div class="row"><label class="f">Modalità<select data-h-change="59"><option value="a4" ${f.modo==='a4'?'selected':''}>Foglio A4 (pretagliato o carta normale)</option><option value="singola" ${f.modo==='singola'?'selected':''}>Una etichetta per pagina (formato carta = etichetta)</option></select></label></div>
    ${f.modo==='a4'?`
    <div class="row"><label class="f">Modello foglio<select data-h-change="60">${Object.entries(PRESETS).map(([k,v])=>`<option value="${k}" ${f.preset===k?'selected':''}>${v.nome}</option>`).join('')}</select></label></div>
    <div class="row">
      <label class="f s">Colonne<input value="${f.cols}" data-h-change="61"></label>
      <label class="f s">Righe<input value="${f.rows}" data-h-change="62"></label>
      <label class="f s">Margine alto mm<input value="${f.mTop}" data-h-change="63"></label>
      <label class="f s">Margine sin. mm<input value="${f.mLeft}" data-h-change="64"></label>
      <label class="f s">Spazio orizz. mm<input value="${f.gapX}" data-h-change="65"></label>
      <label class="f s">Spazio vert. mm<input value="${f.gapY}" data-h-change="66"></label>
    </div>
    <div class="row"><button class="b sm" data-h-click="67">Centra sul foglio</button><label class="chk"><input type="checkbox" ${f.taglio?'checked':''} data-h-change="68"> Linee di taglio (per carta normale)</label></div>
    ${usedW>f.pageW+0.1||usedH>f.pageH+0.1?`<div class="err">Le etichette escono dal foglio (${usedW.toFixed(1)} × ${usedH.toFixed(1)} mm su ${f.pageW} × ${f.pageH}).</div>`:''}
    ${f.preset==='L7164'?`<div class="warn">Misure dei margini Avery L7164 calcolate centrando il foglio: verificale con la stampa di prova prima di usare i fogli adesivi.</div>`:''}
    `:`<div class="warn">Con molte stampanti laser bisogna creare un formato carta personalizzato ${e.w}×${e.h} mm nel driver. Se non lo accetta, usa il foglio A4.</div>`}
  </div>
  </div><div>
  <div class="card"><h2>Calibrazione stampante (solo questa postazione)</h2>
    <div class="muted">Ogni computer può avere una stampante diversa: lo spostamento si salva solo qui.</div>
    <div class="row" style="margin-top:8px"><label class="f">Nome di questa postazione (compare in "Ultima modifica")<input value="${esc(DEV.nome)}" placeholder="es. Mac Giovanni, PC laboratorio" data-h-change="69"></label></div>
    <div class="row" style="margin-top:8px">
      <label class="f s">Sposta a destra mm<input value="${DEV.offX}" data-h-change="70"></label>
      <label class="f s">Sposta in basso mm<input value="${DEV.offY}" data-h-change="71"></label>
      <button class="b" data-h-click="72">Stampa foglio di prova</button>
    </div>
    <div class="muted">Stampa il foglio di prova su carta normale, sovrapponilo controluce a un foglio di etichette e misura la croce. Se la croce risulta a 22 mm invece di 20, scrivi −2. In stampa: <b>Scala 100% (o "Dimensioni effettive")</b>, <b>Margini: Nessuno</b>, intestazioni e piè di pagina disattivati. Usa Chrome o Edge.</div>
  </div>
  <div class="card"><h2>Anteprima con le impostazioni attuali</h2><div class="prevwrap" data-fit>${sample.pid?scaled(labelHTML(sample,{cut:f.taglio}),2):'<span class="muted">Crea un prodotto per vedere l\'anteprima</span>'}</div></div>
  <div class="card"><h2>Pezzature</h2>
    <table class="q">${st.pezzature.map((z,i)=>`<tr><td><input value="${esc(z.nome)}" data-h-change="73" data-change0="${i}"></td><td><input value="${String(z.kg).replace('.',',')}" style="width:90px" data-h-change="74" data-change0="${i}"> kg</td><td><button class="b sm d" data-h-click="75" data-click0="${i}">✕</button></td></tr>`).join('')}</table>
    <button class="b sm" style="margin-top:8px" data-h-click="76">+ Aggiungi pezzatura</button>
  </div>
  <div class="card"><h2>Categorie della linea di punta</h2>

    <table class="q">${st.categorie.map((c,i)=>`<tr><td><input value="${esc(c.nome)}" data-h-change="77" data-change0="${i}"></td><td><input type="color" value="${c.colore}" data-h-change="78" data-change0="${i}" style="width:48px;padding:2px;height:32px"></td><td><span class="tag" style="background:${c.colore};color:${testoSu(c.colore)}">${esc(c.nome)}</span></td><td><button class="b sm d" data-h-click="79" data-click0="${i}">✕</button></td></tr>`).join('')}</table>
    <button class="b sm" style="margin-top:8px" data-h-click="80">+ Aggiungi categoria</button>
    <div class="muted" style="margin-top:6px">Il colore compare sul fronte (nome e fascia) e sui dettagli del retro. Stampato a laser il colore sarà diverso da quello a schermo: fai una prova.</div>
  </div>
  <div class="card"><h2>Diciture di conservazione</h2>
    <table class="q">${st.conservazioni.map((c,i)=>`<tr><td style="width:65%"><input style="width:100%" value="${esc(c.testo)}" data-h-change="81" data-change0="${i}"></td><td><select data-h-change="82" data-change0="${i}"><option value="scadenza" ${c.tipoData==='scadenza'?'selected':''}>Scadenza</option><option value="tmc" ${c.tipoData==='tmc'?'selected':''}>Preferibilmente</option></select></td><td><button class="b sm d" data-h-click="83" data-click0="${i}">✕</button></td></tr>`).join('')}</table>
    <button class="b sm" style="margin-top:8px" data-h-click="84">+ Aggiungi dicitura</button>
    <div class="muted" style="margin-top:6px">Il tipo di data viene proposto in automatico quando assegni la dicitura a un prodotto.</div>
  </div>
  <div class="card"><h2>Archivio online (tutte le postazioni)</h2>
    ${srvOn()?`<div class="ok" style="color:#2e6b2e">Collegato all'archivio online tramite il sito, con il PIN del negozio. Nessuna chiave è salvata su questo computer: da qualsiasi PC basta aprire l'app e inserire il PIN.</div>
    <div class="muted" style="margin-top:6px">🔓 Modifiche sbloccate fino alle ${PASS?srvOra(PASS.scade):'–'} (o finché non chiudi l'app). Prodotti e impostazioni si sincronizzano da soli ogni 20 secondi e a ogni salvataggio.</div>
    <div class="row" style="margin-top:8px"><button class="b" data-h-click="108">Sincronizza adesso</button><button class="b" data-h-click="109">Blocca adesso</button></div>`
    :ghLocked()?`<div class="err" style="color:var(--rosso)">🔒 Collegato all'archivio online <b>${esc(GHCFG.repo)}</b>, ma <b>bloccato</b>: la chiave è protetta dalla password di questo computer. Puoi stampare e modificare; le modifiche restano qui e partono quando sblocchi.</div>
    <div class="row" style="margin-top:8px"><label class="f">Password<input id="ghPwCard" type="password" autocomplete="current-password"></label></div>
    <div class="row"><button class="b p" data-h-click="99">Sblocca</button><button class="b d" data-h-click="86">Scollega da questo computer</button></div>
    <div class="muted" style="margin-top:6px">Password dimenticata? Scollega questo computer e ricollegalo con una chiave GitHub nuova: i dati restano online e su questo computer.</div>`
    :GHCFG?`<div class="ok" style="color:#2e6b2e">Collegato all'archivio online <b>${esc(GHCFG.repo)}</b>. Prodotti e impostazioni si sincronizzano da soli ogni 20 secondi e a ogni salvataggio, anche senza Google Drive. Ogni salvataggio resta nello storico su GitHub.</div>
    ${ghLegacy()?`<div class="err" style="color:var(--rosso);margin-top:6px">⚠️ La chiave di questo computer non è protetta da password: usa la barra gialla in alto per sceglierne una.</div>`:`<div class="muted" style="margin-top:6px">🔒 Chiave protetta dalla password. Si blocca di nuovo quando chiudi l'app.</div>`}
    <div class="row" style="margin-top:8px"><button class="b" data-h-click="85">Sincronizza adesso</button>${ghLegacy()?'':`<button class="b" data-h-click="100">Blocca adesso</button>`}<button class="b d" data-h-click="86">Scollega da questo computer</button></div>`
    :`<div class="muted">Per collegare questa postazione: incolla il nome dell'archivio e la chiave GitHub una sola volta, poi scegli una password per questo computer (almeno ${GH_PW_MIN} caratteri). La chiave viene salvata cifrata: senza password nessuno può leggerla. I prodotti già presenti qui vengono uniti a quelli online, non si perde niente.</div>
    <div class="row" style="margin-top:8px"><label class="f">Archivio (utente/nome)<input id="ghRepo" value="manfredinigio01-bit/etichette-magiostra-dati" autocomplete="off"></label></div>
    <div class="row"><label class="f">Chiave GitHub<input id="ghToken" type="password" placeholder="github_pat_…" autocomplete="off"></label></div>
    <div class="row"><label class="f">Password di questo computer<input id="ghPw1" type="password" autocomplete="new-password"></label><label class="f">Ripeti la password<input id="ghPw2" type="password" autocomplete="new-password"></label></div>
    <div class="row"><button class="b p" data-h-click="87">Collega</button></div>
    <div class="muted" style="margin-top:10px;border-top:1px solid #ddd;padding-top:8px"><b>Su questo computer devi ricollegare ogni volta che chiudi?</b> Allora il browser cancella i dati dei siti alla chiusura (o il PC usa un profilo temporaneo / un programma di pulizia). <b>Edge</b>: Impostazioni → Privacy, ricerca e servizi → Cancella dati delle esplorazioni → "Scegli cosa cancellare ogni volta che chiudi il browser" → spegni <i>Cookie e altri dati del sito</i>. <b>Chrome</b>: Impostazioni → Privacy e sicurezza → Impostazioni sito → Dati dei siti sul dispositivo → scegli <i>I siti possono salvare dati</i> (non "elimina alla chiusura"). Non usare finestre InPrivate / in incognito.${window.STORAGE_PERSIST===false?' <br>Stato su questo PC: il browser <b>non</b> garantisce di conservare i dati di questa app.':''}</div>`}
    ${!srvOn()&&!GHCFG&&fsa&&!PROVA?`<details style="margin-top:12px"><summary class="muted">Vecchio metodo: file su Google Drive / cartella condivisa</summary>
    <div class="row" style="margin-top:8px"><button class="b" data-h-click="88">Crea nuovo archivio…</button><button class="b" data-h-click="89">Collega archivio esistente…</button>${fileHandle?`<button class="b d" data-h-click="90">Scollega</button>`:''}</div>
    <div class="muted">${fileHandle?'Collegato a: <b>'+esc(fileHandle.name)+'</b>':'Nessun file collegato.'}</div></details>`:''}
    <h3>Backup e importazione</h3>
    <div class="row"><button class="b" data-h-click="91">Esporta backup (.json)</button><label class="b" style="cursor:pointer">Importa backup<input type="file" accept=".json" class="hidden" data-h-change="92"></label></div>
    <h3>Importa prodotti da Excel / CSV</h3>
    <div class="muted">Prima riga con le intestazioni: <code>nome; sottotitolo; ingredienti; giorni; prezzo_kg; conservazione</code> (conservazione: frigo / secco / congelato; per il prezzo a confezione aggiungi la colonna prezzo_pezzo). Puoi anche copiare le righe da Excel e incollarle qui.</div>
    <textarea id="csvbox" placeholder="Incolla qui le righe…" style="width:100%;min-height:80px;margin-top:6px"></textarea>
    <div class="row"><button class="b" data-h-click="93">Importa righe incollate</button><label class="b" style="cursor:pointer">Importa file CSV<input type="file" accept=".csv,.txt" class="hidden" data-h-change="94"></label></div>
  </div>
  </div></div>`;
}
function applyPreset(k){ const p=PRESETS[k]; const f=S.settings.foglio; f.preset=k; if(k!=='custom'){ Object.assign(f,{cols:p.cols,rows:p.rows,mTop:p.mTop,mLeft:p.mLeft,gapX:p.gapX,gapY:p.gapY,taglio:p.taglio}); S.settings.etichetta.w=p.w; S.settings.etichetta.h=p.h; } touchSettings(); render(); }
function centerSheet(){ const f=S.settings.foglio,e=S.settings.etichetta; f.mLeft=+((f.pageW-(f.cols*e.w+(f.cols-1)*f.gapX))/2).toFixed(2); f.mTop=+((f.pageH-(f.rows*e.h+(f.rows-1)*f.gapY))/2).toFixed(2); f.preset='custom'; touchSettings(); render(); }
function loadLogo(inp){ const f=inp.files[0]; if(!f) return; if(!/^image\/(png|jpeg|webp)$/.test(f.type)||f.size>2e6){ alert('Usa un\'immagine PNG o JPG sotto i 2 MB'); return; } const fr=new FileReader(); fr.onload=()=>{ if(!IMG_OK.test(fr.result)) return alert('Immagine non valida'); S.settings.logoCustom=fr.result; touchSettings(); render(); }; fr.readAsDataURL(f); }
function exportJSON(){ const b=new Blob([JSON.stringify(S,null,1)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='etichette-magiostra-backup-'+isoToday()+'.json'; a.click(); }
function importJSON(inp){ if(inp.files[0].size>20e6){ alert('File troppo grande'); return; } inp.files[0].text().then(t=>{ try{ const d=JSON.parse(t); if(!d.settings||!d.prodotti) throw 0; if(!confirm('Unire il backup con i dati attuali? (vince la versione più recente di ogni prodotto)')) return; S=merge(S,d); commit(); render(); alert('Importato.'); }catch(e){ alert('File non valido'); } }); }
function importCSV(text){
  text=String(text||'').replace(/^﻿/,'').trim(); if(!text) return;
  const lines=text.split(/\r?\n/).filter(l=>l.trim());
  const sep = lines[0].includes('\t')?'\t':(lines[0].split(';').length>=lines[0].split(',').length?';':',');
  const parse = l => { const out=[]; let cur='',q=false; for(let i=0;i<l.length;i++){const c=l[i]; if(q){ if(c==='"'&&l[i+1]==='"'){cur+='"';i++;} else if(c==='"') q=false; else cur+=c; } else if(c==='"') q=true; else if(c===sep){out.push(cur);cur='';} else cur+=c;} out.push(cur); return out.map(s=>s.trim()); };
  const hdr=parse(lines[0]).map(h=>h.toLowerCase().replace(/[^a-z_]/g,''));
  const ix = n => hdr.findIndex(h=>h.startsWith(n));
  const iN=ix('nome'); if(iN<0){ alert('Manca la colonna "nome" nella prima riga'); return; }
  const iS=ix('sottotitolo'), iI=ix('ingredienti'), iG=ix('giorni'), iP=hdr.findIndex(h=>h==='prezzo_kg'||h==='prezzokg'||h==='prezzo'), iPP=hdr.findIndex(h=>h.startsWith('prezzo_pezzo')||h.startsWith('prezzopezzo')), iC=ix('conservazione');
  let n=0, upd=0; const t=now();
  lines.slice(1).forEach(l=>{ const c=parse(l); const nome=c[iN]; if(!nome) return;
    const consTxt=(iC>=0?c[iC]:'').toLowerCase();
    const cons = /cong|surg|-18/.test(consTxt)?'cs3':/secc|fresco e asciutto|dispensa/.test(consTxt)?'cs2':'cs1';
    const csObj=getCons(cons)||S.settings.conservazioni[0];
    const ex=prodotti().find(p=>p.nome.toLowerCase()===nome.toLowerCase() && (iS<0||(p.sottotitolo||'').toLowerCase()===(c[iS]||'').toLowerCase()));
    const data={nome,sottotitolo:iS>=0?c[iS]:'',ingredienti:iI>=0?c[iI]:'',giorni:iG>=0?(parseInt(c[iG])||0):3,prezzoKg:iP>=0?c[iP]:'',prezzoPezzo:iPP>=0?c[iPP]:'',tipoPrezzo:(iPP>=0&&c[iPP]&&!(iP>=0&&c[iP]))?'pezzo':'kg',conservazione:csObj?.id,tipoData:csObj?.tipoData||'scadenza',updatedAt:t};
    if(ex){ Object.assign(ex,data); upd++; } else { S.prodotti.push({id:uid(),tracce:[],tracceExtra:'',diciture:'',pezzature:[],mostraPrezzo:false,...data}); n++; }
  });
  commit(); render(); alert(`Importati ${n} nuovi prodotti, aggiornati ${upd}.`);
}

