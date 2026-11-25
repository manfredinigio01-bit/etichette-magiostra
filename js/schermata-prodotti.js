/* ---------- PRODOTTI ---------- */
function viewProdotti(){
  const ps=prodotti().filter(p=>!Q||(p.nome+' '+(p.sottotitolo||'')+' '+p.ingredienti).toLowerCase().includes(Q.toLowerCase()));
  const p = EDIT ? EDIT : null;
  return `<div class="grid2">
   <div class="card"><div class="flexsp"><h2>Prodotti (${prodotti().length}) <span class="muted" id="nfcount" style="font-weight:400;color:#b3261e"></span></h2><button class="b p sm" data-h-click="19">+ Nuovo prodotto</button></div>
    <input placeholder="Cerca per nome o ingrediente…" value="${esc(Q)}" data-h-input="20" id="qb2" style="width:100%;margin:6px 0 8px">
    <div class="plist" style="max-height:640px">${ps.map(x=>{const al=highlight(x.ingredienti).found.filter(k=>!k.startsWith('manuale'));return `<div class="it ${EDIT&&EDIT.id===x.id?'on':''}" data-id="${x.id}" data-h-click="21" data-click0="${x.id}"><span><b>${esc(x.nome)}</b> ${x.linea==='punta'?`<span class="tag" style="background:${getCat(x.categoria).colore};color:#fff">${esc(getCat(x.categoria).nome)}</span>`:''} <span class="tag nf hidden" style="background:#fdecea;color:#7a1712">non entra</span> <span class="muted">${esc(x.sottotitolo||'')}</span><br>${al.map(k=>`<span class="tag a">${ALLERGENI.find(a=>a.k===k).n}</span>`).join('')}</span><span class="muted" style="white-space:nowrap">${x.giorni||0} gg${prezzoInfo(x)?'<br>'+prezzoInfo(x):''}</span></div>`}).join('')||'<div class="it muted">Nessun prodotto</div>'}</div>
   </div>
   <div>${p?editorHTML(p):'<div class="card muted">Seleziona un prodotto a sinistra o creane uno nuovo.</div>'}</div>
  </div>`;
}
function newProduct(){ EDIT={id:uid(),nome:'',sottotitolo:'',ingredienti:'',tracce:[],tracceExtra:'',conservazione:S.settings.conservazioni[0]?.id,diciture:'',tipoData:'scadenza',giorni:3,prezzoKg:'',prezzoPezzo:'',tipoPrezzo:'kg',pezzature:[],mostraPrezzo:false,_new:true}; render(); scrollEditor(); }
function editProduct(id){ EDIT=JSON.parse(JSON.stringify(getP(id))); render(); scrollEditor(); }
function scrollEditor(){ if(innerWidth>760) return; const h=[...document.querySelectorAll('.card h2')].find(x=>/^(Modifica|Nuovo) prodotto/.test(x.textContent)); if(h) h.closest('.card').scrollIntoView({behavior:'smooth',block:'start'}); }
function ed(k,v,re){ EDIT[k]=v; if(k==='linea'&&v==='punta'&&!EDIT.categoria) EDIT.categoria=S.settings.categorie[0]?.id||''; if(re) render(); else refreshEditorPreview(); }
function editorHTML(p){
  const hl=highlight(p.ingredienti);
  const al=hl.found.filter(k=>!k.startsWith('manuale')).map(k=>ALLERGENI.find(a=>a.k===k).n);
  const man=hl.found.filter(k=>k.startsWith('manuale')).map(k=>k.slice(8));
  const cons=getCons(p.conservazione);
  const bio=/(?<!\p{L})bio(logic[oaie])?(?!\p{L})/iu.test(p.nome+' '+p.sottotitolo+' '+p.ingredienti);
  const job={pid:'__edit',kg:(getPz(p.pezzature?.[0])||S.settings.pezzature[0]||{}).kg??null,prod:isoToday(),scad:addDays(isoToday(),p.giorni||0),lotto:lotto(isoToday()),prezzo:'',showPrice:false};
  return `<div class="card"><div class="flexsp"><h2>${p._new?'Nuovo prodotto':'Modifica prodotto'}</h2>
    <div><button class="b p" data-h-click="22">Salva</button> ${!p._new?`<button class="b" data-h-click="23">Duplica</button> <button class="b d" data-h-click="24">Elimina</button>`:''} <button class="b" data-h-click="25">Chiudi</button></div></div>
    ${p.updatedAt&&!p._new?`<div class="muted" style="margin-bottom:8px">Ultima modifica: ${new Date(p.updatedAt).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'})} · ${esc(p.updatedBy||'—')}</div>`:''}
    <div class="row"><label class="f">Nome (in grande)<input value="${esc(p.nome)}" data-h-input="26"></label></div>
    <div class="row"><label class="f">Sottotitolo<input value="${esc(p.sottotitolo)}" placeholder="es. con ragù di cavolfiore" data-h-input="27"></label></div>
    <div class="row"><label class="f">Ingredienti (in ordine di peso decrescente)<textarea data-h-input="28">${esc(p.ingredienti)}</textarea></label></div>
    <div id="alfound">${alFoundHTML(p.ingredienti)}</div>
    <div id="surgbox">${surgBoxHTML(p)}</div>
    <div class="row"><label class="f">Stato del prodotto<select data-h-change="102">${Object.entries({'':'Normale (fresco)','decongelato':'Decongelato (congelato e venduto scongelato)','surgelato':'Surgelato / congelato (venduto congelato)'}).map(([v,t])=>`<option value="${v}" ${(p.stato||'')===v?'selected':''}>${t}</option>`).join('')}</select></label></div>
    ${p.stato==='surgelato'&&!(cons&&/18/.test(cons.testo))?`<div class="warn">Prodotto venduto congelato: scegli una dicitura di conservazione con −18 °C e "non ricongelare".</div>`:''}
    ${p.stato==='decongelato'&&cons&&/18/.test(cons.testo)?`<div class="warn">Prodotto decongelato ma la conservazione dice −18 °C: scegli quella del frigorifero.</div>`:''}
    ${bio?`<div class="warn">Hai scritto "bio/biologico". Senza certificazione biologica di La Magiostra questo termine probabilmente non può comparire in etichetta: verifica con il tuo consulente HACCP/ente certificatore.</div>`:''}
    <h3>Tracce di allergeni (contaminazione crociata)</h3>
    <div style="display:flex;flex-wrap:wrap;gap:4px 14px">${ALLERGENI.map(a=>`<label class="chk"><input type="checkbox" ${p.tracce?.includes(a.k)?'checked':''} data-h-change="29" data-change0="${a.k}"> ${a.n}</label>`).join('')}</div>
    <div class="row" style="margin-top:8px"><label class="f">Testo aggiuntivo tracce (facoltativo)<input value="${esc(p.tracceExtra)}" data-h-input="30"></label></div>
    <h3>Conservazione e data</h3>
    <div class="row">
      <label class="f">Dicitura di conservazione<select data-h-change="31">${S.settings.conservazioni.map(c=>`<option value="${c.id}" ${p.conservazione===c.id?'selected':''}>${esc(c.testo)}</option>`).join('')}<option value="" ${!p.conservazione?'selected':''}>— nessuna —</option></select></label>
    </div>
    <div class="row">
      <label class="f">Tipo di data<select data-h-change="32"><option value="scadenza" ${p.tipoData!=='tmc'?'selected':''}>Da consumarsi entro (scadenza)</option><option value="tmc" ${p.tipoData==='tmc'?'selected':''}>Da consumarsi preferibilmente entro (TMC)</option></select></label>
      <label class="f s">Giorni di durata<input type="number" min="0" value="${p.giorni}" data-h-input="33"></label>
    </div>
    ${cons&&isFrigo(cons.testo)&&p.tipoData==='tmc'?`<div class="warn">Prodotto refrigerato deperibile: di norma serve "Da consumarsi entro", non "preferibilmente".</div>`:''}
    <div class="row"><label class="f">Altre diciture (facoltativo)<input value="${esc(p.diciture)}" placeholder="es. Scaldare prima del consumo" data-h-input="34"></label></div>
    <h3>Linea</h3>
    <div class="row">
      <label class="f">Tipo di etichetta<select data-h-change="35"><option value="standard" ${p.linea!=='punta'?'selected':''}>Standard (una etichetta)</option><option value="punta" ${p.linea==='punta'?'selected':''}>Linea di punta (fronte colorato + retro)</option></select></label>
      ${p.linea==='punta'?`<label class="f">Categoria<select data-h-change="36">${S.settings.categorie.map(c=>`<option value="${c.id}" ${(p.categoria||S.settings.categorie[0]?.id)===c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select></label>`:''}
    </div>
    ${p.linea==='punta'?`<div class="row"><label class="f">Frase per il fronte (facoltativa, solo cose vere)<input value="${esc(p.fraseFronte||'')}" placeholder="es. fatto a mano nel nostro laboratorio" data-h-input="37"></label></div>`:''}
    <h3>Vendita</h3>
    <div class="row">
      <label class="f s">Tipo di prezzo<select data-h-change="38"><option value="kg" ${p.tipoPrezzo!=='pezzo'?'selected':''}>Al kg</option><option value="pezzo" ${p.tipoPrezzo==='pezzo'?'selected':''}>Al pezzo</option></select></label>
      ${p.tipoPrezzo==='pezzo'?`<label class="f s">Prezzo a pezzo €<input value="${esc(p.prezzoPezzo||'')}" placeholder="4,50" data-h-input="39"></label>`:`<label class="f s">Prezzo €/kg<input value="${esc(p.prezzoKg)}" placeholder="18,00" data-h-input="40"></label>`}
      <label class="chk"><input type="checkbox" ${p.mostraPrezzo?'checked':''} data-h-change="41"> Prezzo attivo di default in stampa</label>
    </div>
    ${p.tipoPrezzo==='pezzo'?`<div class="muted" style="margin-bottom:8px">In etichetta compare solo il prezzo scelto. Il prezzo al kg va comunque indicato al cliente, per esempio sul cartellino del banco.</div>`:''}
    <div class="row">
    </div>
    <div class="muted" style="margin-bottom:4px">Pezzature disponibili per questo prodotto (nessuna selezionata = tutte):</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px 14px">${S.settings.pezzature.map(z=>`<label class="chk"><input type="checkbox" ${p.pezzature?.includes(z.id)?'checked':''} data-h-change="42" data-change0="${z.id}"> ${esc(z.nome)}</label>`).join('')}</div>
  </div>
  <div class="card"><h2>Anteprima</h2><div class="prevwrap" id="edprev" data-fit style="gap:12px">${scaledEditPreview(job)}</div></div>`;
}
function surgBoxHTML(p){
  const P=ingParts(p.ingredienti); if(!P.length) return '';
  const hl=highlight(p.ingredienti);
  return `<div class="muted" style="margin:4px 0 2px">Ingredienti surgelati (spunta per mettere l'asterisco; la nota "*Ingrediente surgelato." si aggiunge da sola):</div>
    <div style="display:flex;flex-wrap:wrap;gap:2px 12px;margin-bottom:6px">${P.map((x,k)=>`<label class="chk"><input type="checkbox" ${x.surg?'checked':''} data-h-change="101" data-change0="${k}"> ${esc(x.nome)}</label>`).join('')}</div>
    ${/surgelat/i.test(p.diciture||'')&&!hl.surg?`<div class="warn">Le diciture parlano di ingrediente surgelato ma nessun ingrediente ha l'asterisco: spunta quello surgelato.</div>`:''}
    ${/semilavorat/i.test(p.ingredienti)?`<div class="warn">C'è scritto "semilavorato": in etichetta il semilavorato va scritto con i suoi ingredienti tra parentesi, es. maionese vegana (bevanda di soia, olio di semi di girasole, aceto di mele, sale).</div>`:''}`;
}
function alFoundHTML(text){
  const hl=highlight(text);
  const al=hl.found.filter(k=>!k.startsWith('manuale')).map(k=>ALLERGENI.find(a=>a.k===k).n);
  const man=hl.found.filter(k=>k.startsWith('manuale')).map(k=>k.slice(8));
  return `<div class="muted">Allergeni rilevati: ${al.length?al.map(n=>`<span class="tag a">${n}</span>`).join(''):'<i>nessuno</i>'} ${man.length?' · grassetto manuale: '+man.map(m=>`<span class="tag">${esc(m)}</span>`).join(''):''}</div>`;
}
function scaledEditPreview(job){
  const real=getP('__edit'); // placeholder non usato
  const keep=S.prodotti; S.prodotti=[...keep,{...EDIT,id:'__edit'}];
  const h = EDIT.linea==='punta' ? scaled(frontHTML(job),1.1)+scaled(labelHTML(job),1.1) : scaled(labelHTML(job),2.2); S.prodotti=keep; return h;
}
let prevT=null;
function refreshEditorPreview(){ clearTimeout(prevT); prevT=setTimeout(()=>{ const el=document.getElementById('edprev'); if(!el) return; const p=EDIT; const job={pid:'__edit',kg:(getPz(p.pezzature?.[0])||S.settings.pezzature[0]||{}).kg??null,prod:isoToday(),scad:addDays(isoToday(),p.giorni||0),lotto:lotto(isoToday()),prezzo:'',showPrice:false}; el.innerHTML=scaledEditPreview(job); fitLabels(el); },150); }
function toggleTraccia(k,on){ EDIT.tracce=(EDIT.tracce||[]).filter(x=>x!==k); if(on) EDIT.tracce.push(k); refreshEditorPreview(); }
function togglePz(k,on){ EDIT.pezzature=(EDIT.pezzature||[]).filter(x=>x!==k); if(on) EDIT.pezzature.push(k); }
function setCons(id){ EDIT.conservazione=id; const c=getCons(id); if(c) EDIT.tipoData=c.tipoData; render(); }
function saveProduct(){
  if(!EDIT.nome.trim()){ alert('Inserisci il nome del prodotto'); return; }
  const p={...EDIT}; delete p._new; p.updatedAt=Math.max(now(),(getP(p.id)?.updatedAt||0)+1); // sempre più recente della versione modificata, anche se l'orologio del PC è indietro
  p.updatedBy=DEV.nome||'postazione senza nome';
  const i=S.prodotti.findIndex(x=>x.id===p.id); if(i>=0) S.prodotti[i]=p; else S.prodotti.push(p);
  EDIT=JSON.parse(JSON.stringify(p)); commit(); render();
}
function dupProduct(){ EDIT={...JSON.parse(JSON.stringify(EDIT)),id:uid(),nome:EDIT.nome+' (copia)',_new:true}; render(); }
function delProduct(){ if(!confirm('Eliminare "'+EDIT.nome+'"?')) return; const p=getP(EDIT.id); if(p){p.deleted=true;p.updatedAt=Math.max(now(),(p.updatedAt||0)+1);p.updatedBy=DEV.nome||'postazione senza nome';} EDIT=null; commit(); render(); }

