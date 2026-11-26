/* ================== UI: TAB ================== */
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{TAB=b.dataset.tab; document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('on',x===b)); render.newTab=true; render(); scrollTo(0,0);});
function render(){
  document.getElementById('hdrLogo').src=LOGO_SCRITTA;
  const m=document.getElementById('main');
  const y=scrollY, keep=render.newTab?[]:[...m.querySelectorAll('.plist,.scroll')].map(e=>e.scrollTop); render.newTab=false; // le liste restano dove eri
  if(TAB==='stampa') m.innerHTML=viewStampa();
  else if(TAB==='prodotti') m.innerHTML=viewProdotti();
  else m.innerHTML=viewImpostazioni();
  m.querySelectorAll('.plist,.scroll').forEach((e,k)=>{ if(keep[k]!=null) e.scrollTop=keep[k]; });
  scrollTo(0,y);
  afterRender();
}
function afterRender(){
  document.querySelectorAll('[data-fit]').forEach(fitLabels);
  const fw=document.getElementById('fitwarn');
  if(fw && document.querySelector('.prevwrap .lbl.overflow')) fw.innerHTML=`<div class="err">Con il formato attuale (${S.settings.etichetta.w}×${S.settings.etichetta.h} mm) questo prodotto non entra a norma di legge (carattere minimo 7 pt): la stampa è bloccata. Scegli un formato più grande in Impostazioni o accorcia il testo.</div>`;
  if(TAB==='prodotti') markNonFit();
  // tastiera: le voci cliccabili che non sono pulsanti si raggiungono con Tab e si aprono con Invio
  document.querySelectorAll('#main [data-h-click]:not(button):not(input):not(select):not(a):not(label)').forEach(e=>{ if(!e.hasAttribute('tabindex')){ e.tabIndex=0; e.setAttribute('role','button'); } });
  if(typeof hdrH==='function') hdrH();
}
document.addEventListener('keydown',e=>{ const t=e.target; if((e.key==='Enter'||e.key===' ')&&t.matches&&t.matches('[role=button][tabindex][data-h-click]')){ e.preventDefault(); t.click(); } });
function prodJob(p,price){
  const z=getPz((p.pezzature&&p.pezzature[0]))||S.settings.pezzature[0]||{};
  const kg=z.kg??0.25;
  return {pid:p.id,kg,prod:isoToday(),scad:addDays(isoToday(),p.giorni||0),lotto:lotto(isoToday()),prezzo:prezzoCalc(p,kg)||'99.99',tipoPrezzo:p.tipoPrezzo,showPrice:price};
}
function markNonFit(){
  const tmp=document.getElementById('print'); let n=0;
  document.querySelectorAll('.plist .it[data-id]').forEach(it=>{
    const p=getP(it.dataset.id); if(!p) return;
    tmp.innerHTML=labelHTML(prodJob(p, !!prezzoCalc(p,0.25))); fitLabels(tmp);
    if(tmp.querySelector('.lbl.overflow')){ n++; it.querySelector('.nf')?.classList.remove('hidden'); }
  });
  tmp.innerHTML='';
  const c=document.getElementById('nfcount'); if(c) c.textContent = n ? `${n} non entrano a norma nel formato ${S.settings.etichetta.w}×${S.settings.etichetta.h} mm` : '';
}

/* ---------- STAMPA ---------- */
let FORM = {pid:null,tipoPrezzo:'kg',pz:'',kgLibero:'',prod:isoToday(),scad:'',lotto:'',prezzo:'',showPrice:false,qty:1,scadManual:false,lottoManual:false,prezzoManual:false};
function formJob(){
  const p=getP(FORM.pid); if(!p) return null;
  const kg = FORM.pz==='libero' ? num(FORM.kgLibero) : (getPz(FORM.pz)?.kg ?? null);
  const scad = FORM.scadManual&&FORM.scad ? FORM.scad : addDays(FORM.prod, p.giorni||0);
  const lt = FORM.lottoManual&&FORM.lotto ? FORM.lotto : lotto(FORM.prod);
  const prezzo = FORM.prezzoManual ? FORM.prezzo : prezzoCalc(p,kg,FORM.tipoPrezzo);
  return {pid:p.id,kg,prod:FORM.prod,scad,lotto:lt,prezzo,tipoPrezzo:FORM.tipoPrezzo,showPrice:FORM.showPrice,qty:Math.max(1,parseInt(FORM.qty)||1)};
}
function selectProduct(id){
  const p=getP(id); FORM.pid=id;
  const pzs=(p.pezzature&&p.pezzature.length)?p.pezzature:S.settings.pezzature.map(z=>z.id);
  FORM.pz=pzs[0]||'libero'; FORM.scadManual=false; FORM.lottoManual=false; FORM.prezzoManual=false;
  FORM.tipoPrezzo=p.tipoPrezzo||'kg'; FORM.showPrice=!!p.mostraPrezzo && !!prezzoCalc(p,0.25); render();
}
function viewStampa(){
  const ps=prodotti().filter(p=>!Q||(p.nome+' '+(p.sottotitolo||'')).toLowerCase().includes(Q.toLowerCase()));
  const p=getP(FORM.pid); const j=formJob();
  const f=S.settings.foglio, per=f.cols*f.rows;
  const nLab=countLabels(expandQueue());
  let warns='';
  if(p){
    const cons=getCons(p.conservazione);
    if(cons && isFrigo(cons.testo) && p.tipoData==='tmc') warns+=`<div class="warn">Prodotto da frigorifero con "preferibilmente entro": per gli alimenti deperibili serve la data di scadenza "Da consumarsi entro". Correggilo nella scheda prodotto.</div>`;
    if(j && j.kg==null) warns+=`<div class="warn">Manca il peso netto.</div>`;
    if(FORM.showPrice && !j.prezzo) warns+=`<div class="warn">Prezzo mancante: inseriscilo nella scheda prodotto (al kg o al pezzo) oppure scrivilo qui.</div>`;
  }
  const pzs = p ? ((p.pezzature&&p.pezzature.length)?p.pezzature.map(getPz).filter(Boolean):S.settings.pezzature) : [];
  return `<div class="grid2">
  <div>
    <div class="card"><h2>1 · Scegli il prodotto</h2>
      <input placeholder="Cerca prodotto…" value="${esc(Q)}" data-h-input="0" id="qbox" style="width:100%;margin-bottom:8px">
      <div class="plist" id="plist">${ps.map(x=>`<div class="it ${x.id===FORM.pid?'on':''}" data-h-click="1" data-click0="${x.id}"><span><b>${esc(x.nome)}</b> <span class="muted">${esc(x.sottotitolo||'')}</span></span><span class="muted">${x.giorni?x.giorni+' gg':''}</span></div>`).join('')||'<div class="it muted">Nessun prodotto. Aggiungili dalla scheda Prodotti.</div>'}</div>
    </div>
    ${p?`<div class="card"><h2>2 · Dati di questa produzione</h2>
      <div class="row">
        <label class="f">Pezzatura<select data-h-change="2">
          ${pzs.map(z=>`<option value="${z.id}" ${FORM.pz===z.id?'selected':''}>${esc(z.nome)}</option>`).join('')}
          <option value="libero" ${FORM.pz==='libero'?'selected':''}>Peso libero…</option></select></label>
        ${FORM.pz==='libero'?`<label class="f s">Peso (kg)<input value="${esc(FORM.kgLibero)}" placeholder="0,350" data-h-change="3"></label>`:''}
        <label class="f s">Quantità<input type="number" min="1" value="${FORM.qty}" data-h-change="4"></label>
      </div>
      <div class="row">
        <label class="f">Data di produzione<input type="date" value="${FORM.prod}" data-h-change="5"></label>
        <label class="f">${p.tipoData==='tmc'?'Preferibilmente entro':'Scadenza'} <span>(${p.giorni||0} gg)</span><input type="date" value="${j.scad}" data-h-change="6"></label>
        <label class="f">Lotto<input value="${esc(j.lotto)}" data-h-change="7"></label>
      </div>
      <div class="row">
        <label class="chk"><input type="checkbox" ${FORM.showPrice?'checked':''} data-h-change="8"> Stampa il prezzo</label>
        ${FORM.showPrice?`<label class="f s">Tipo di prezzo<select data-h-change="9"><option value="kg" ${FORM.tipoPrezzo!=='pezzo'?'selected':''}>Al kg</option><option value="pezzo" ${FORM.tipoPrezzo==='pezzo'?'selected':''}>Al pezzo</option></select></label>
          <label class="f s">${FORM.tipoPrezzo==='pezzo'?'Prezzo a pezzo €':'Prezzo al kg €'}<input value="${esc(j.prezzo)}" data-h-change="10"></label>
          <span class="muted">${FORM.tipoPrezzo==='pezzo' ? (num(j.prezzo)!=null&&j.kg?'(al kg sarebbe € '+eur(Math.round(num(j.prezzo)/j.kg*100)/100)+': mettilo sul cartellino)':'') : ''}</span>`:''}
      </div>
      ${warns}
      <div class="row" style="margin-top:12px">
        <button class="b p" data-h-click="11">Stampa subito ${isPunta(j)?(j.qty>1?j.qty+' confezioni ('+(j.qty*2)+' etichette)':'1 confezione (2 etichette)'):(j.qty>1?j.qty+' etichette':'1 etichetta')}</button>
        <button class="b" data-h-click="12">Aggiungi alla coda</button>
        ${FORM.scadManual||FORM.lottoManual||FORM.prezzoManual?`<button class="b sm" data-h-click="13">Ricalcola automatico</button>`:''}
      </div>
    </div>`:''}
  </div>
  <div>
    ${p?`<div class="card"><div class="flexsp"><h2>Anteprima</h2><span class="muted" id="ptinfo"></span></div>
      <div class="prevwrap" data-fit style="gap:14px">${isPunta(j)?scaled(frontHTML(j),1.15)+scaled(labelHTML(j),1.15):scaled(labelHTML(j),2.3)}</div>
      ${isPunta(j)?'<div class="muted" style="margin-top:4px">Linea di punta: per ogni confezione si stampano 2 etichette, fronte e retro, una accanto all\'altra.</div>':''}
      <div id="fitwarn"></div>
      <div class="muted" style="margin-top:6px">Gli allergeni in grassetto sono rilevati in automatico: controlla sempre. Per forzare il grassetto scrivi la parola tra asterischi nella scheda prodotto, es. *farina di farro*.</div>
    </div>`:''}
    <div class="card"><div class="flexsp"><h2>Coda di stampa</h2><span class="pill">${nLab} etichette${f.modo==='a4'?' · '+Math.ceil((nLab+DEV.start)/per||0)+' fogli':''}</span></div>
      ${DEV.coda.length?`<table class="q"><tr><th>Prodotto</th><th>Peso</th><th>Prod.</th><th>Scad.</th><th>Prezzo</th><th>Qtà</th><th></th></tr>
      ${DEV.coda.map((q,i)=>{const pp=getP(q.pid);return `<tr><td>${esc(pp?pp.nome:'(eliminato)')}</td><td>${pesoFmt(q.kg)}</td><td>${fmtD(q.prod)}</td><td>${fmtD(q.scad)}</td><td>${q.showPrice&&q.prezzo?'€ '+eur(num(q.prezzo)):'—'}</td><td><input type="number" min="1" value="${q.qty}" style="width:56px" data-h-change="14" data-change0="${i}"></td><td><button class="b sm d" data-h-click="15" data-click0="${i}">✕</button></td></tr>`}).join('')}</table>`:'<div class="muted">Vuota. Usa "Aggiungi alla coda" per mettere più prodotti sullo stesso foglio.</div>'}
      ${f.modo==='a4'?`<h3>Parti dalla posizione (fogli già iniziati)</h3>
      <div class="sheetmap" style="grid-template-columns:repeat(${f.cols},26px)">${Array.from({length:per},(_,i)=>`<div class="${i<DEV.start?'skip':''} ${i===DEV.start?'start':''}" data-h-click="16" data-click0="${i}">${i+1}</div>`).join('')}</div>
      <div class="muted">Le caselle grigie sono già state usate e verranno saltate.</div>`:''}
      <div class="row" style="margin-top:12px">
        <button class="b p" ${nLab?'':'disabled'} data-h-click="17">Stampa la coda</button>
        <button class="b" ${DEV.coda.length?'':'disabled'} data-h-click="18">Svuota</button>
      </div>
    </div>
  </div></div>`;
}
function rerenderList(){
  const ps=prodotti().filter(p=>!Q||(p.nome+' '+(p.sottotitolo||'')).toLowerCase().includes(Q.toLowerCase()));
  document.getElementById('plist').innerHTML=ps.map(x=>`<div class="it ${x.id===FORM.pid?'on':''}" data-h-click="1" data-click0="${x.id}"><span><b>${esc(x.nome)}</b> <span class="muted">${esc(x.sottotitolo||'')}</span></span><span class="muted">${x.giorni?x.giorni+' gg':''}</span></div>`).join('')||'<div class="it muted">Nessun risultato</div>';
}
function scaled(html,s){
  const e=S.settings.etichetta;
  return `<div style="flex:0 0 auto;width:${e.w*s}mm;height:${e.h*s}mm;box-shadow:0 2px 10px rgba(0,0,0,.15);background:#fff"><div style="transform:scale(${s});transform-origin:0 0;width:${e.w}mm;height:${e.h}mm">${html}</div></div>`;
}
function printNow(){ const j=formJob(); if(!j) return; doPrint(Array(j.qty).fill(j), S.settings.foglio.modo==='a4'?DEV.start:0); }
function addQueue(){ const j=formJob(); if(!j) return; DEV.coda.push(j); saveDev(); render(); }

