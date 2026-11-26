/* ================== STATO ================== */
// v0.3.4: queste costanti devono esistere PRIMA di load(): prima erano dichiarate dopo, load() andava in errore
// e ripartiva da zero a ogni apertura (perdeva i dati locali, creava la copia dell'esempio e sovrascriveva le impostazioni condivise)
const SAFE_ID=/^[A-Za-z0-9_-]{1,40}$/;
const LOGHI=['sole+scritta','scritta','sole','compatto','nessuno','custom'];
const IMG_OK=/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+\/=]+$/;
let S = load();
localStorage.setItem(PFX+'mag_data',JSON.stringify(S)); // salva subito eventuali aggiornamenti di versione
let DEV = JSON.parse(localStorage.getItem(PFX+'mag_dev')||'{}');
DEV = Object.assign({offX:0,offY:0,coda:[],start:0,nome:''},DEV);
DEV.offX=Number(DEV.offX)||0; DEV.offY=Number(DEV.offY)||0; DEV.start=Math.max(0,parseInt(DEV.start)||0); DEV.nome=String(DEV.nome||'');
DEV.coda=(Array.isArray(DEV.coda)?DEV.coda:[]).filter(j=>j&&SAFE_ID.test(j.pid)).map(j=>({pid:j.pid,kg:j.kg==null?null:Number(j.kg),prod:String(j.prod||'').replace(/[^0-9-]/g,''),scad:String(j.scad||'').replace(/[^0-9-]/g,''),lotto:String(j.lotto||''),prezzo:String(j.prezzo??''),tipoPrezzo:j.tipoPrezzo==='pezzo'?'pezzo':'kg',showPrice:!!j.showPrice,qty:Math.max(1,parseInt(j.qty)||1)}));
let TAB='stampa', SEL=null, EDIT=null, Q='';
let fileHandle=null, lastSync=null, syncTimer=null;

function sanitize(s){
  // difesa contro file di archivio/backup manomessi: niente codice nascosto nei dati
  const st=s.settings||{}; s.settings=st;
  const n=(v,d,min,max)=>{ v=Number(v); return isFinite(v)?Math.min(max,Math.max(min,v)):d; };
  st.pezzature=(Array.isArray(st.pezzature)?st.pezzature:[]).filter(z=>z&&SAFE_ID.test(z.id)).map(z=>({id:z.id,nome:String(z.nome??''),kg:n(z.kg,0,0,1000)}));
  st.categorie=(Array.isArray(st.categorie)?st.categorie:CAT_DEF.map(c=>({...c}))).filter(c=>c&&SAFE_ID.test(c.id)).map(c=>({id:c.id,nome:String(c.nome??''),colore:/^#[0-9a-fA-F]{6}$/.test(c.colore)?c.colore:'#5E7F45'}));
  st.conservazioni=(Array.isArray(st.conservazioni)?st.conservazioni:[]).filter(c=>c&&SAFE_ID.test(c.id)).map(c=>({id:c.id,testo:String(c.testo??''),tipoData:c.tipoData==='tmc'?'tmc':'scadenza'}));
  if(!LOGHI.includes(st.logo)) st.logo='compatto';
  st.stileFronte = 'a'; // decisione Giovanni 23/11/2026: stile A
  if(st.logoCustom && !IMG_OK.test(st.logoCustom)) st.logoCustom='';
  const e=st.etichetta=st.etichetta||{};
  e.w=n(e.w,60,15,300); e.h=n(e.h,70,15,300); e.pad=n(e.pad,2.5,0,20); e.minPt=n(e.minPt,7,7,20); e.maxPt=n(e.maxPt,8.5,7,20);
  e.etichettaProdotto=String(e.etichettaProdotto??'Prodotto il:');
  const f=st.foglio=st.foglio||{};
  f.modo=f.modo==='singola'?'singola':'a4'; if(!PRESETS[f.preset]) f.preset='custom';
  f.pageW=n(f.pageW,210,50,500); f.pageH=n(f.pageH,297,50,500); f.cols=Math.round(n(f.cols,3,1,20)); f.rows=Math.round(n(f.rows,4,1,30));
  f.mTop=n(f.mTop,0,-50,300); f.mLeft=n(f.mLeft,0,-50,300); f.gapX=n(f.gapX,0,0,100); f.gapY=n(f.gapY,0,0,100); f.taglio=!!f.taglio;
  const a=st.azienda=st.azienda||{}; ['nome','sottotitolo','ragioneSociale','indirizzo','contatti'].forEach(k=>{ if(a[k]!==undefined) a[k]=String(a[k]); });
  const keys=ALLERGENI.map(x=>x.k), pzIds=st.pezzature.map(z=>z.id), csIds=st.conservazioni.map(c=>c.id);
  s.prodotti=(Array.isArray(s.prodotti)?s.prodotti:[]).filter(p=>p&&SAFE_ID.test(p.id)).map(p=>({...p,
    nome:String(p.nome??''),sottotitolo:String(p.sottotitolo??''),ingredienti:String(p.ingredienti??''),tracceExtra:String(p.tracceExtra??''),diciture:String(p.diciture??''),
    prezzoKg:String(p.prezzoKg??''),prezzoPezzo:String(p.prezzoPezzo??''),tipoPrezzo:p.tipoPrezzo==='pezzo'?'pezzo':'kg',linea:p.linea==='punta'?'punta':'standard',categoria:String(p.categoria??'').replace(/[^A-Za-z0-9_-]/g,''),fraseFronte:String(p.fraseFronte??''),stato:['decongelato','surgelato'].includes(p.stato)?p.stato:'',fonte:p.fonte==='cucina'?'cucina':'',ricetta:/^[A-Za-z0-9_-]{1,60}$/.test(p.ricetta||'')?p.ricetta:'',ingAt:Math.round(n(p.ingAt,0,0,1e14)),giorni:Math.round(n(p.giorni,0,0,3650)),tipoData:p.tipoData==='tmc'?'tmc':'scadenza',
    tracce:(Array.isArray(p.tracce)?p.tracce:[]).filter(k=>keys.includes(k)),
    pezzature:(Array.isArray(p.pezzature)?p.pezzature:[]).filter(k=>pzIds.includes(k)),
    conservazione:csIds.includes(p.conservazione)?p.conservazione:'',
    updatedBy:String(p.updatedBy??''),updatedAt:n(p.updatedAt,0,0,9e15),deleted:!!p.deleted}));
  return s;
}
function normalize(s){
  sanitize(s);
  // aggiorna dati salvati con versioni precedenti senza cambiare updatedAt (non sovrascrive modifiche di altre postazioni)
  const a=s.settings.azienda;
  if(a.ragioneSociale===undefined) a.ragioneSociale='La Magiostra di Aquilino e C. snc';
  if(a.indirizzo==='Via Grado 1 – 26100 Cremona') a.indirizzo='Via Grado 1 – 26100 Cremona (CR)';
  const st=s.settings;
  if(!st.layout024){ // scelta di Giovanni 11/11/2026: logo piccolo, niente CUCINA, contatti, data di produzione
    st.logo='compatto'; a.sottotitolo=''; Object.assign(st.etichetta,{mostraContatti:false,mostraProduzione:false,piedeCompatto:true});
    st.layout024=true;
  }
  if(!st.layout031){ // 18/11/2026: torna la sigla CUCINA nell'intestazione compatta
    if(!a.sottotitolo) a.sottotitolo='CUCINA';
    st.layout031=true;
  }
  if(!st.layout029){ // 18/11/2026: fogli Markin 210A420 63,5x72, niente linee tratteggiate
    const P=PRESETS.L7164, f=st.foglio, e=st.etichetta;
    Object.assign(f,{preset:'L7164',modo:'a4',cols:P.cols,rows:P.rows,mTop:P.mTop,mLeft:P.mLeft,gapX:P.gapX,gapY:P.gapY,taglio:false});
    e.w=P.w; e.h=P.h; e.pad=3;
    st.layout029=true;
  }
  if(!st.cons035){ // 18/11/2026: dicitura per composte e conserve (vaso chiuso a temperatura ambiente, frigo dopo l'apertura)
    if(!st.conservazioni.some(c=>c.id==='cs5')) st.conservazioni.push({id:'cs5',testo:'Conservare in luogo fresco e asciutto. Dopo l\'apertura conservare in frigorifero e consumare entro 7 giorni.',tipoData:'tmc'});
    st.cons035=true;
  }
  // v0.3.4: elimina le copie mai modificate del vecchio prodotto di esempio (ne resta una sola, la più vecchia)
  const isPasta=p=>!p.deleted && p.nome==='Pasta al forno' && p.sottotitolo==='con ragù di cavolfiore';
  const ex=s.prodotti.filter(p=>isPasta(p) && !p.updatedBy && p.ingredienti===ESEMPIO_ING);
  const modificata=s.prodotti.some(p=>isPasta(p) && p.updatedBy);
  if(ex.length>1 || (ex.length && modificata)){
    const keep = modificata ? null : ex.slice().sort((a,b)=>(a.updatedAt-b.updatedAt)||a.id.localeCompare(b.id))[0];
    const t=Date.now();
    ex.forEach(p=>{ if(p!==keep){ p.deleted=true; p.updatedAt=t; p.updatedBy='pulizia copie automatica'; } });
  }
  return s;
}
function load(){
  const raw=localStorage.getItem(PFX+'mag_data');
  try{ const s=JSON.parse(raw); if(s&&s.settings) return normalize(s); }
  catch(e){ console.error('Dati locali non leggibili',e); try{ if(raw) localStorage.setItem(PFX+'mag_data_errore_'+Date.now(),raw); }catch(_){} }
  return defaultState();
}
function saveLocal(){ localStorage.setItem(PFX+'mag_data',JSON.stringify(S)); }
function saveDev(){ localStorage.setItem(PFX+'mag_dev',JSON.stringify(DEV)); }
function touchSettings(){ S.settings.updatedAt=Math.max(now(),(S.settings.updatedAt||0)+1); commit(); }
function commit(){ saveLocal(); clearTimeout(syncTimer); syncTimer=setTimeout(syncNow,600); }
const prodotti = () => S.prodotti.filter(p=>!p.deleted).sort((a,b)=>a.nome.localeCompare(b.nome,'it'));
const getP = id => S.prodotti.find(p=>p.id===id);
// v0.3.6: è "da frigorifero" solo se lo è già da chiuso; "dopo l'apertura conservare in frigorifero" non conta (composte, conserve)
const isFrigo = t => /frigorifero|\+\s?4\s?°/i.test(String(t||'').split(/dopo l['’]apertura/i)[0]);
const getCons = id => S.settings.conservazioni.find(c=>c.id===id);
const getPz = id => S.settings.pezzature.find(z=>z.id===id);

