/* ================== UTILITÀ ================== */
const pad2 = n => String(n).padStart(2,'0');
const isoToday = () => { const d=new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const addDays = (iso,n) => { const [y,m,d]=iso.split('-').map(Number); const dt=new Date(y,m-1,d+Number(n||0)); return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`; };
const fmtD = iso => iso ? iso.split('-').reverse().join('.') : '';
const lotto = iso => iso ? iso.replace(/-/g,'') : '';
const num = v => { const n=parseFloat(String(v).replace(',','.')); return isNaN(n)?null:n; };
const eur = n => n==null?'':n.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
const kgFmt = n => n==null?'':n.toLocaleString('it-IT',{minimumFractionDigits:3,maximumFractionDigits:3});
const pesoFmt = kg => kg==null?'': (kg<1 ? Math.round(kg*1000)+' g' : kgFmt(kg)+' kg');

/* ================== RENDER ETICHETTA ================== */
// prezzo: 'kg' = prezzo al chilo (totale = €/kg × peso); 'pezzo' = prezzo fisso a confezione (€/kg calcolato)
function prezzoCalc(p,kg,tipo){
  tipo = tipo || p.tipoPrezzo || 'kg';
  if(tipo==='pezzo'){ const v=num(p.prezzoPezzo); return v==null?'':v.toFixed(2); }
  const k=num(p.prezzoKg); return k!=null?k.toFixed(2):'';
}
function prezzoInfo(p){ return (p.tipoPrezzo==='pezzo') ? (num(p.prezzoPezzo)!=null?'€ '+eur(num(p.prezzoPezzo))+'/pz':'') : (num(p.prezzoKg)!=null?'€/kg '+eur(num(p.prezzoKg)):''); }
function tracceText(p){
  const list=(p.tracce||[]).map(k=>ALLERGENI.find(a=>a.k===k)?.t).filter(Boolean);
  let t = list.length ? 'Può contenere tracce di ' + list.join(', ') + '.' : '';
  if(p.tracceExtra) t += (t?' ':'') + p.tracceExtra;
  return t;
}
const getCat = id => S.settings.categorie.find(c=>c.id===id) || S.settings.categorie[0] || {nome:'',colore:'#5E7F45'};
const isPunta = j => (getP(j.pid)||{}).linea==='punta';
const pesoBreve = kg => kg==null?'': (kg<1 ? Math.round(kg*1000)+' g' : String(kg).replace('.',',')+' kg');
// FRONTE linea di punta: nome grande nel colore della categoria + peso netto (stesso campo visivo, art. 13 Reg. 1169/2011)
function frontHTML(job){ return frontHTML_A(job); } // stile A scelto da Giovanni (23/11/2026); lo stile B è stato rimosso
function frontHTML_A(job){
  const st=S.settings, e=st.etichetta, p=getP(job.pid)||{}, c=getCat(p.categoria), P=e.pad, W=e.w, H=e.h;
  const sunH=Math.min(11,H*0.15);
  return `<div class="lbl fr" style="width:${W}mm;height:${H}mm"><div class="fi" style="inset:${P}mm">
    <div class="top"><img src="${LOGO_SOLE}" style="height:${sunH}mm"><div><div class="brand">${esc(st.azienda.nome||'La Magiostra')}</div><div class="sub">${esc(st.azienda.sottotitolo||'Cucina')} · Cremona</div></div></div>
    <div class="nmbox"><div class="nm" style="color:${c.colore}">${esc(p.nome||'Prodotto')}</div>
      ${p.sottotitolo?`<div class="ds">${esc(p.sottotitolo)}</div>`:''}
      ${p.fraseFronte?`<div class="fd">${esc(p.fraseFronte)}</div>`:''}</div>
    <img class="wm" src="${LOGO_SOLE}">
    <div class="band" style="background:${c.colore}"><span class="ct">${esc((c.nome||'').toUpperCase())}</span><span class="pw">${job.kg!=null?pesoBreve(job.kg):''}</span></div>
  </div></div>`;
}
function fitFronts(root){
  root.querySelectorAll('.lbl.fr').forEach(l=>{
    const box=l.querySelector('.nmbox'), nm=l.querySelector('.nm'), ds=l.querySelector('.ds'), fd=l.querySelector('.fd');
    const B=l.classList.contains('frb'); let n=B?22:28, d=B?9.5:11;
    const set=()=>{ nm.style.fontSize=n+'pt'; if(ds) ds.style.fontSize=d+'pt'; if(fd) fd.style.fontSize=Math.max(7,d-2.5)+'pt'; };
    set();
    // il nome non deve andare a capo a metà parola
    const tooWide=()=>nm.scrollWidth>nm.clientWidth+0.5;
    while((box.scrollHeight>box.clientHeight+0.5 || tooWide()) && n>10){ n-=0.5; if(d>8) d-=0.1; set(); }
    l.classList.toggle('overflow', box.scrollHeight>box.clientHeight+0.5);
  });
}
function labelsFor(j,opts={}){ return isPunta(j) ? [frontHTML(j), labelHTML(j,opts)] : [labelHTML(j,opts)]; }
function labelHTML(job, opts={}){
  const st=S.settings, e=st.etichetta, a=st.azienda, p=getP(job.pid)||{};
  const cons=getCons(p.conservazione);
  const hl=highlight(p.ingredienti, e.allergeniMaiuscolo);
  const tipo = p.tipoData||'scadenza';
  const scadLbl = tipo==='tmc' ? 'Da consumarsi preferibilmente entro il:' : 'Da consumarsi entro il:';
  const W=e.w, H=e.h, P=e.pad;
  const soleH = Math.min(12, H*0.155);
  const minPt=Math.max(MIN_LEGALE,e.minPt);
  const compatto = st.logo==='compatto';
  let logo='';
  const lg = st.logo;
  if(lg==='sole+scritta') logo=`<img class="sole" src="${LOGO_SOLE}" style="height:${soleH}mm"><div class="hr"><img class="scritta" src="${LOGO_SCRITTA}" style="max-height:${soleH*0.78}mm">${a.sottotitolo?`<div class="azsub">${esc(a.sottotitolo)}</div>`:''}</div>`;
  else if(lg==='scritta') logo=`<div class="hr"><img class="scritta" src="${LOGO_SCRITTA}" style="max-height:${soleH*0.85}mm">${a.sottotitolo?`<div class="azsub">${esc(a.sottotitolo)}</div>`:''}</div>`;
  else if(lg==='sole') logo=`<img class="sole" src="${LOGO_SOLE}" style="height:${soleH}mm"><div class="hr"><div class="aznome">${esc(a.nome)}</div>${a.sottotitolo?`<div class="azsub">${esc(a.sottotitolo)}</div>`:''}</div>`;
  else if(lg==='compatto') logo=`<img class="sole" src="${LOGO_SOLE}" style="height:${Math.min(11.5,H*0.16)}mm"><div class="hc" style="font-size:${minPt}pt">${a.sottotitolo?`<div class="cuc">${esc(a.sottotitolo)}</div>`:''}<div class="rsc">${esc(a.ragioneSociale||a.nome)}</div><div>${esc(a.indirizzo)}</div>${e.mostraContatti&&a.contatti?`<div>${esc(a.contatti)}</div>`:''}</div>`;
  else if(lg==='custom' && st.logoCustom) logo=`<div class="hr"><img class="scritta" src="${st.logoCustom}" style="max-height:${soleH}mm">${a.sottotitolo?`<div class="azsub">${esc(a.sottotitolo)}</div>`:''}</div>`;
  else logo=`<div class="hr"><div class="aznome">${esc(a.nome)}</div>${a.sottotitolo?`<div class="azsub">${esc(a.sottotitolo)}</div>`:''}</div>`;
  const kg = job.kg;
  const prezzo = job.prezzo!=null && job.prezzo!=='' ? num(job.prezzo) : null;
  const tipoP = (job.tipoPrezzo||p.tipoPrezzo)==='pezzo' ? 'pezzo' : 'kg'; // in etichetta solo il prezzo scelto
  const tr = tracceText(p);
  const punta = p.linea==='punta', cat = punta ? getCat(p.categoria) : null;
  if(punta && compatto) logo=`<img class="sole" src="${LOGO_SOLE}" style="height:${Math.min(11.5,H*0.16)}mm"><div class="hc" style="font-size:${minPt}pt"><div class="cuc">${esc((cat.nome||'').toUpperCase())}</div><div class="rsc">${esc(a.ragioneSociale||a.nome)}</div><div>${esc(a.indirizzo)}</div>${e.mostraContatti&&a.contatti?`<div>${esc(a.contatti)}</div>`:''}</div>`;
  return `<div class="lbl ${opts.cut?'cut':''} ${punta?'pt':''}" style="width:${W}mm;height:${H}mm;--m:${minPt}pt;${punta?`--c:${cat.colore}`:''}"><div class="in" style="padding:${P}mm">
    <div class="hd">${logo}</div>
    ${compatto?'':`${a.ragioneSociale?`<div class="rs" style="font-size:${minPt}pt">${esc(a.ragioneSociale)}</div>`:''}
    <div class="addr" style="font-size:${minPt}pt">${esc(a.indirizzo)}</div>
    ${e.mostraContatti&&a.contatti?`<div class="cont" style="font-size:${minPt}pt">${esc(a.contatti)}</div>`:''}`}
    <div class="pn">${esc(p.nome||'Prodotto')}</div>
    ${p.sottotitolo?`<div class="ps">${esc(p.sottotitolo)}</div>`:''}
    <div class="body"><div class="fit">
      <p class="ing"><b>Ingredienti:</b> ${hl.html}</p>
      ${tr?`<p class="tr">${esc(tr)}</p>`:''}
      ${p.diciture?`<p>${esc(p.diciture)}</p>`:''}
    </div></div>
    ${cons?`<div class="consb" style="font-size:${minPt}pt">${esc(cons.testo)}</div>`:''}
    ${e.piedeCompatto ? `<div class="ft fc" style="font-size:${minPt}pt">
      <div>${scadLbl} <b class="big">${fmtD(job.scad)}</b></div>
      <div class="r2"><span>Lotto: <b>${esc(job.lotto)}</b>${e.mostraProduzione!==false?` · ${esc(e.etichettaProdotto.replace(/:$/,''))} ${fmtD(job.prod)}`:''}</span><span>Peso netto <b class="big">${kg!=null?kgFmt(kg)+' kg':'—'}</b></span></div>
      ${job.showPrice && prezzo!=null ? `<div class="r2"><span></span><span>${tipoP==='pezzo'?'Prezzo':'Prezzo al kg'} <b class="big">€ ${eur(prezzo)}</b></span></div>`:''}
    </div>` : `<div class="ft" style="font-size:${minPt}pt">
      <div class="sc">${scadLbl} <b class="big">${fmtD(job.scad)}</b></div>
      <div class="ftr">
        <div class="dl">${e.mostraProduzione!==false?`<div>${esc(e.etichettaProdotto)} ${fmtD(job.prod)}</div>`:''}<div>Lotto: <b>${esc(job.lotto)}</b></div></div>
        <div class="box"><span class="k">Peso netto</span> <span class="v">${kg!=null?kgFmt(kg)+' kg':'—'}</span>
        ${job.showPrice && prezzo!=null ? `<div class="pr"><span class="k">${tipoP==='pezzo'?'Prezzo':'Prezzo al kg'}</span> <span class="v">€ ${eur(prezzo)}</span></div>`:''}</div>
      </div>
    </div>`}
  </div></div>`;
}
const MIN_LEGALE=7; // pt: x-height ≈ 1,28 mm in Arial (Reg. UE 1169/2011 art. 13: ≥ 1,2 mm)
function fitLabels(root){
  fitFronts(root);
  const e=S.settings.etichetta;
  root.querySelectorAll('.lbl').forEach(l=>{
    const body=l.querySelector('.body'), fit=l.querySelector('.fit'); if(!body||!fit) return;
    // scelta di Giovanni: testo sempre al minimo consentito dalla legge, mai più grande
    const size=Math.max(MIN_LEGALE,e.minPt); fit.style.fontSize=size+'pt';
    l.classList.toggle('overflow', fit.offsetHeight>body.clientHeight+0.5);
    l.dataset.pt=size;
  });
}

