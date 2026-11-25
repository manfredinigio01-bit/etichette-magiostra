/* Cucina La Magiostra — ricettario, food cost, prezzi d'acquisto.
   Dati: repository GitHub PRIVATO (ricettario.json), copia locale CIFRATA con la password (AES-GCM 256, chiave PBKDF2-SHA256).
   Nessuna dipendenza esterna a runtime: lib/ contiene fflate (zip) ed ExcelJS (xlsx), caricate da questo stesso sito. */
'use strict';
const APP_VERSION='1.0.1';
const DEF_REPO='manfredinigio01-bit/magiostra-cucina-dati';
const ETI_REPO='manfredinigio01-bit/etichette-magiostra-dati';
const DATA_FILE='ricettario.json';
const GH_API='https://api.github.com';
const PBKDF2_ITER=600000;
const LOCK_MIN=30;
const REPO_OK=/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const ID_OK=/^[A-Za-z0-9_-]{1,80}$/;

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>Date.now();
const uid=p=>p+now().toString(36)+Math.random().toString(36).slice(2,6);
const num=v=>{ if(v===''||v==null) return null; const n=typeof v==='number'?v:parseFloat(String(v).replace(',','.')); return Number.isFinite(n)?n:null; };
const eur=v=>v==null||!Number.isFinite(v)?'–':v.toLocaleString('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2});
const banco=r=>r.prezzoBanco==null?'–':r.prezzoBanco.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(r.unitaBanco||'€');
const eur3=v=>v==null||!Number.isFinite(v)?'–':v.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:3})+' €';
const pct=v=>v==null||!Number.isFinite(v)?'–':Math.round(v*100)+'%';
const fmt=(v,d=3)=>v==null||!Number.isFinite(v)?'':(+v.toFixed(d)).toLocaleString('it-IT',{maximumFractionDigits:d});
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const dIT=s=>{ if(!s) return ''; const d=new Date(s); return isNaN(d)?String(s):d.toLocaleDateString('it-IT'); };
function toast(t,ms=2200){ const e=$('#toast'); e.textContent=t; e.classList.add('on'); clearTimeout(toast.t); toast.t=setTimeout(()=>e.classList.remove('on'),ms); }

/* ===================== CIFRATURA ===================== */
const TE=new TextEncoder(), TD=new TextDecoder();
function b64(u8){ let s=''; for(let i=0;i<u8.length;i+=0x8000) s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000)); return btoa(s); }
function unb64(s){ const b=atob(s); const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }
async function deriveKey(pw,salt,iter){
  const base=await crypto.subtle.importKey('raw',TE.encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function seal(key,obj){ const iv=crypto.getRandomValues(new Uint8Array(12)); const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,TE.encode(JSON.stringify(obj))); return {iv:b64(iv),ct:b64(new Uint8Array(ct))}; }
async function unseal(key,box){ const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(box.iv)},key,unb64(box.ct)); return JSON.parse(TD.decode(pt)); }

/* ===================== IndexedDB (chiave/valore) ===================== */
const IDB={db:null};
function idb(){ return IDB.db||(IDB.db=new Promise((res,rej)=>{ const r=indexedDB.open('cucina-magiostra',1); r.onupgradeneeded=()=>r.result.createObjectStore('kv'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); })); }
async function kvGet(k){ const db=await idb(); return new Promise((res,rej)=>{ const r=db.transaction('kv').objectStore('kv').get(k); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function kvSet(k,v){ const db=await idb(); return new Promise((res,rej)=>{ const t=db.transaction('kv','readwrite'); t.objectStore('kv').put(v,k); t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); }); }
async function kvDel(k){ const db=await idb(); return new Promise((res,rej)=>{ const t=db.transaction('kv','readwrite'); t.objectStore('kv').delete(k); t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); }); }

/* ===================== STATO ===================== */
let KEY=null;      // chiave AES in memoria, solo a app sbloccata
let CFG=null;      // {token, repo, etiRepo, nome}
let S=null;        // dati
let ETI=null;      // archivio etichette (sola lettura salvo azioni esplicite)
let TAB='quadro', SEL=null, EDIT=null, Q='', FILT={};
let dirty=false, syncing=false, pending=false, lastSync=null;

function emptyData(){ return {version:1,updatedAt:0,parametri:{costoOrario:18,energiaOra:5,affittoMese:400,settimaneMese:4,giorniSettimana:5,oreGiorno:6,quotaAffitto:.5,iva:.1,ricaricoDef:.7,packagingDef:.5,altriFissiMese:230,note:{},updatedAt:0},ingredienti:[],packaging:[],ricette:[],archivio:[],stagionalita:[],mappaFatture:[],importati:[]}; }

/* ===================== PULIZIA DATI ===================== */
const str=(v,max=4000)=>String(v??'').slice(0,max);
const nn=(v,min=-1e9,max=1e9)=>{ const n=num(v); return n==null?null:Math.min(max,Math.max(min,n)); };
const okid=(v,p)=>ID_OK.test(String(v||''))?String(v):uid(p);
function sanitize(D){
  const o=emptyData(); if(!D||typeof D!=='object') return o;
  const P=D.parametri||{}; const po=o.parametri;
  for(const k of ['costoOrario','energiaOra','affittoMese','settimaneMese','giorniSettimana','oreGiorno','quotaAffitto','iva','ricaricoDef','packagingDef','altriFissiMese']){ const v=nn(P[k],0,100000); if(v!=null) po[k]=v; }
  po.note={}; if(P.note&&typeof P.note==='object') for(const k in P.note) if(/^[a-zA-Z]{1,30}$/.test(k)) po.note[k]=str(P.note[k],1500);
  po.updatedAt=nn(P.updatedAt,0)||0;
  o.ingredienti=(Array.isArray(D.ingredienti)?D.ingredienti:[]).slice(0,3000).map(i=>({id:okid(i.id,'i-'),nome:str(i.nome,120).trim(),fornitore:str(i.fornitore,80),prezzo:nn(i.prezzo,0,1e6),formato:nn(i.formato,0,1e5),unita:['kg','l','pz'].includes(i.unita)?i.unita:'kg',pesoPezzo:nn(i.pesoPezzo,0,1000),note:str(i.note,1500),
    storico:(Array.isArray(i.storico)?i.storico:[]).slice(-60).map(s=>({data:str(s.data,20),prezzoUnit:nn(s.prezzoUnit,0,1e6),prima:nn(s.prima,0,1e6),fornitore:str(s.fornitore,80),fattura:str(s.fattura,40),voce:str(s.voce,200)})),
    updatedAt:nn(i.updatedAt,0)||0,deleted:!!i.deleted})).filter(i=>i.nome);
  o.packaging=(Array.isArray(D.packaging)?D.packaging:[]).slice(0,300).map(p=>({id:okid(p.id,'p-'),nome:str(p.nome,120),fornitore:str(p.fornitore,80),prezzo:nn(p.prezzo,0,1e6),pezzi:nn(p.pezzi,0,1e6)||1,updatedAt:nn(p.updatedAt,0)||0,deleted:!!p.deleted})).filter(p=>p.nome);
  o.ricette=(Array.isArray(D.ricette)?D.ricette:[]).slice(0,3000).map(r=>({id:okid(r.id,'r-'),nome:str(r.nome,140).trim(),foglio:str(r.foglio,40),categoria:str(r.categoria,60),unita:str(r.unita,80),allergeni:str(r.allergeni,300),note:str(r.note,2000),
    righe:(Array.isArray(r.righe)?r.righe:[]).slice(0,60).map(x=>({ing:x.ing&&ID_OK.test(x.ing)?x.ing:null,nome:str(x.nome,120),dose:nn(x.dose,0,10000),doseTesto:str(x.doseTesto,40),flag:str(x.flag,20)})),
    procedimento:str(r.procedimento,20000),lotto:nn(r.lotto,0,10000),tProd:nn(r.tProd,0,100000),tCott:nn(r.tCott,0,100000),perdita:nn(r.perdita,0,.99),ricarico:nn(r.ricarico,0,100),confezione:nn(r.confezione,0,100000),
    packaging:r.packaging&&ID_OK.test(r.packaging)?r.packaging:'',pezziPack:nn(r.pezziPack,0,1000),prezzoBanco:nn(r.prezzoBanco,0,10000),unitaBanco:str(r.unitaBanco,20),etichetta:r.etichetta&&ID_OK.test(r.etichetta)?r.etichetta:'',
    inProdotti:r.inProdotti!==false,updatedAt:nn(r.updatedAt,0)||0,deleted:!!r.deleted})).filter(r=>r.nome);
  o.archivio=(Array.isArray(D.archivio)?D.archivio:[]).slice(0,5000).map(a=>({id:okid(a.id,'a-'),nome:str(a.nome,200),tipo:a.tipo==='dolce'?'dolce':'salato',categoria:str(a.categoria,60),stagioni:(Array.isArray(a.stagioni)?a.stagioni:[]).filter(s=>['primavera','estate','autunno','inverno'].includes(s)),
    mesi:str(a.mesi,120),ultimoPrezzo:nn(a.ultimoPrezzo,0,10000),unita:str(a.unita,20),volte:nn(a.volte,0,100000)||0,prima:str(a.prima,20),ultima:str(a.ultima,20),materiaPrima:str(a.materiaPrima,120),ricetta:a.ricetta&&ID_OK.test(a.ricetta)?a.ricetta:'',updatedAt:nn(a.updatedAt,0)||0,deleted:!!a.deleted})).filter(a=>a.nome);
  o.stagionalita=(Array.isArray(D.stagionalita)?D.stagionalita:[]).slice(0,300).map(s=>({nome:str(s.nome,80),mesi:(Array.isArray(s.mesi)?s.mesi:[]).map(Number).filter(m=>m>=0&&m<12)}));
  o.mappaFatture=(Array.isArray(D.mappaFatture)?D.mappaFatture:[]).slice(0,5000).map(m=>({voce:str(m.voce,200),fornitore:str(m.fornitore,80),ing:m.ing&&ID_OK.test(m.ing)?m.ing:null,formato:nn(m.formato,0,1e5),updatedAt:nn(m.updatedAt,0)||0})).filter(m=>m.voce&&m.ing);
  o.importati=(Array.isArray(D.importati)?D.importati:[]).slice(-3000).map(x=>str(x,200));
  o.updatedAt=nn(D.updatedAt,0)||0;
  return o;
}
function mergeColl(a,b){ const m=new Map(); for(const x of a||[]) m.set(x.id,x); for(const y of b||[]){ const x=m.get(y.id); if(!x||(y.updatedAt||0)>=(x.updatedAt||0)) m.set(y.id,y); } return [...m.values()]; }
function merge(a,b){ // b = archivio online: a parità vince b
  const o=emptyData();
  o.parametri=(b.parametri.updatedAt||0)>=(a.parametri.updatedAt||0)?b.parametri:a.parametri;
  for(const k of ['ingredienti','packaging','ricette','archivio']) o[k]=mergeColl(a[k],b[k]);
  o.stagionalita=b.stagionalita.length?b.stagionalita:a.stagionalita;
  const mk=x=>x.voce.toUpperCase()+'|'+x.fornitore.toUpperCase(); const mm=new Map();
  for(const x of a.mappaFatture) mm.set(mk(x),x); for(const y of b.mappaFatture){ const x=mm.get(mk(y)); if(!x||(y.updatedAt||0)>=(x.updatedAt||0)) mm.set(mk(y),y); }
  o.mappaFatture=[...mm.values()];
  o.importati=[...new Set([...a.importati,...b.importati])].slice(-3000);
  o.updatedAt=Math.max(a.updatedAt||0,b.updatedAt||0);
  return o;
}
const canon=d=>JSON.stringify(merge(d,emptyData()));
const touch=x=>{ x.updatedAt=Math.max(now(),(x.updatedAt||0)+1); };

/* ===================== ACCESSO AI DATI ===================== */
const ings=()=>S.ingredienti.filter(i=>!i.deleted).sort((a,b)=>a.nome.localeCompare(b.nome,'it'));
const ricette=()=>S.ricette.filter(r=>!r.deleted).sort((a,b)=>a.nome.localeCompare(b.nome,'it'));
const packs=()=>S.packaging.filter(p=>!p.deleted);
let IMAP=new Map(), INAME=new Map();
function reindex(){ IMAP=new Map(S.ingredienti.map(i=>[i.id,i])); INAME=new Map(S.ingredienti.filter(i=>!i.deleted).map(i=>[i.nome.toLowerCase(),i])); }
const getI=id=>IMAP.get(id);
const getR=id=>S.ricette.find(r=>r.id===id);
const unitCost=i=>i&&i.prezzo!=null&&i.formato?i.prezzo/i.formato:null;
function lastPriceDate(i){ const ds=(i.storico||[]).map(s=>s.data).filter(Boolean).sort(); if(ds.length) return ds[ds.length-1]; const m=/(\d{2})\/(\d{2})\/(\d{4})/.exec(i.note||''); return m?`${m[3]}-${m[2]}-${m[1]}`:''; }
function usedIn(id){ return ricette().filter(r=>r.righe.some(x=>x.ing===id)); }

/* ===================== FOOD COST (identico al file Excel v10) ===================== */
function orarioFissi(P){ const h=P.settimaneMese*P.giorniSettimana*P.oreGiorno; return h>0?(P.affittoMese+P.altriFissiMese)/h:0; }
function calc(r,opt={}){
  const P=S.parametri; let peso=0,costo=0,manc=0,righe=[],conDose=0;
  for(const x of r.righe){
    const i=x.ing?getI(x.ing):null, u=unitCost(i);
    const has=!!x.nome&&x.dose!=null;
    if(has){ conDose++; peso+=x.dose*(i&&i.unita==='pz'?(i.pesoPezzo||0):1); if(u==null) manc++; else costo+=x.dose*u; }
    righe.push({x,i,u,costo:has&&u!=null?x.dose*u:null});
  }
  const lotto=r.lotto||0, per=r.perdita||0;
  let molt=opt.molt!=null&&opt.molt>0?opt.molt:1;
  if(opt.kgVoluti>0&&peso>0) molt=opt.kgVoluti/(peso*(1-per));
  const crudo=peso*lotto, fin=crudo*(1-per), cIng=costo*lotto;
  const man=(r.tProd||0)/60*P.costoOrario, en=(r.tCott||0)/60*P.energiaOra;
  const aff=((r.tProd||0)+(r.tCott||0))/60*orarioFissi(P)*P.quotaAffitto;
  const tot=cIng+man+en+aff;
  const ckg=fin>0?tot/fin:null;
  const ric=r.ricarico!=null?r.ricarico:P.ricaricoDef;
  const pkg=ckg!=null?ckg*(1+ric)*(1+P.iva):null;
  const pk=S.packaging.find(p=>p.id===r.packaging&&!p.deleted);
  const pcost=pk?(pk.prezzo||0)/(pk.pezzi||1)*(r.pezziPack||1):P.packagingDef;
  const conf=ckg!=null&&(r.confezione||0)>0?ckg*r.confezione/1000+pcost:null;
  const pconf=conf!=null?conf*(1+ric)*(1+P.iva):null;
  const marg=pconf!=null?pconf/(1+P.iva)-conf:null;
  let stato;
  if(!r.righe.some(x=>x.nome)) stato='Ricetta da inserire';
  else if(!conDose) stato='Dosi mancanti';
  else if(manc>0) stato='Prezzi mancanti';
  else if(!(r.tProd>0)) stato='Tempi mancanti';
  else if(ckg!=null) stato='OK'; else stato='Lotto mancante';
  // ricarico reale al banco (prezzo €/etto o €/kg, IVA inclusa) sul costo pieno €/kg
  let ricReale=null; const pb=r.prezzoBanco;
  if(pb!=null&&ckg){ const perKg=/etto/i.test(r.unitaBanco)?pb*10:/kg/i.test(r.unitaBanco)?pb:null; if(perKg!=null) ricReale=perKg/(1+P.iva)/ckg-1; }
  return {righe,peso,costo,manc,molt,crudo,fin,cIng,man,en,aff,tot,ckg,ric,pkg,pcost,conf,pconf,marg,stato,ricReale,pesoIng:tot>0?cIng/tot:null,pesoMan:tot>0?man/tot:null};
}
const STATO_CL={'OK':'ok','Tempi mancanti':'w','Prezzi mancanti':'w','Dosi mancanti':'w','Lotto mancante':'w','Ricetta da inserire':'r'};

/* ===================== GITHUB ===================== */
async function gh(method,path,body){
  return fetch(GH_API+path,{method,cache:'no-store',headers:{Authorization:'Bearer '+CFG.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}
const ghErr=r=>r.status===401?'chiave non valida o scaduta':r.status===403?'accesso negato (permessi della chiave)':r.status===404?'archivio non trovato o chiave senza accesso':'errore GitHub '+r.status;
async function ghReadJSON(repo,file){
  const r=await gh('GET',`/repos/${repo}/contents/${file}`);
  if(r.status===404){ const t=await gh('GET',`/repos/${repo}`); if(t.ok) return {data:null,sha:null}; throw new Error(ghErr(t)); }
  if(!r.ok) throw new Error(ghErr(r));
  const j=await r.json(); let txt;
  if(j.content) txt=TD.decode(unb64(j.content.replace(/\s/g,'')));
  else { const bl=await gh('GET',`/repos/${repo}/git/blobs/${j.sha}`); if(!bl.ok) throw new Error(ghErr(bl)); txt=TD.decode(unb64((await bl.json()).content.replace(/\s/g,''))); }
  let data=null; try{ data=txt.trim()?JSON.parse(txt):null; }catch(e){ throw new Error('file online illeggibile'); }
  return {data,sha:j.sha};
}
async function ghWriteJSON(repo,file,obj,sha,msg){
  return gh('PUT',`/repos/${repo}/contents/${file}`,{message:msg,content:b64(TE.encode(JSON.stringify(obj,null,1))),...(sha?{sha}:{})});
}
function setStatus(t,err){ const e=$('#st'); if(!e) return; e.textContent=t; e.classList.toggle('err',!!err); }
async function sync(){
  if(!CFG||!KEY) return; if(syncing){ pending=true; return; } syncing=true;
  try{
    for(let k=0;k<4;k++){
      const {data,sha}=await ghReadJSON(CFG.repo,DATA_FILE);
      const remote=data?sanitize(data):null;
      const before=JSON.stringify(S);
      const merged=remote?merge(S,remote):S;
      if(JSON.stringify(merged)!==before){ S=merged; reindex(); await saveLocal(); if(!EDIT) render(); }
      if(remote&&canon(merged)===canon(remote)) break;
      const w=await ghWriteJSON(CFG.repo,DATA_FILE,merged,sha,`Cucina: salvataggio da ${CFG.nome||'postazione'}`);
      if(w.ok) break;
      if(w.status===409||w.status===422) continue;
      throw new Error(ghErr(w));
    }
    lastSync=new Date(); dirty=false;
    setStatus('Archivio ✓ '+lastSync.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}));
    scheduleFiles();
  }catch(e){
    const off=!navigator.onLine||e instanceof TypeError;
    setStatus(off?'Senza rete: le modifiche partono appena torna la connessione':'Archivio: '+e.message,true);
  }finally{ syncing=false; if(pending){ pending=false; setTimeout(sync,400); } }
}
async function loadEti(){
  if(!CFG) return;
  try{ const {data}=await ghReadJSON(CFG.etiRepo||ETI_REPO,'archivio.json'); ETI=data&&Array.isArray(data.prodotti)?data:null; }catch(e){ ETI=null; }
}
async function saveLocal(){ if(KEY&&S) await kvSet('cache',await seal(KEY,S)); }
let saveT=null;
function commit(){ S.updatedAt=now(); reindex(); dirty=true; clearTimeout(saveT); saveT=setTimeout(async()=>{ await saveLocal(); sync(); },500); }

/* ===================== BLOCCO / PRIMO AVVIO ===================== */
let lockT=null;
function armLock(){ clearTimeout(lockT); lockT=setTimeout(lockNow,LOCK_MIN*60000); }
['pointerdown','keydown','wheel','touchstart'].forEach(ev=>addEventListener(ev,()=>{ if(KEY) armLock(); },{passive:true}));
async function lockNow(){ if(dirty){ try{ await saveLocal(); }catch(e){} } KEY=null; CFG=null; S=null; location.reload(); }
function failDelay(){ const f=+(localStorage.getItem('cuc_fail')||0); return f<3?0:Math.min(300,2**(f-2)); }

async function showLock(){
  const vault=await kvGet('vault');
  const box=$('#lockbox');
  if(!vault){
    box.innerHTML=`<img src="icons/icon-192.png" alt=""><h2>Cucina La Magiostra</h2>
    <p class="mut small">Primo avvio su questo computer. Scegli la password per aprire l'app (la stessa su tutti i computer) e incolla la chiave GitHub "Cucina". La chiave viene salvata qui <b>cifrata con la password</b>: senza password nessuno può leggerla.</p>
    <label class="f">Password (almeno 10 caratteri)<input class="i" id="pw1" type="password" autocomplete="new-password"></label>
    <label class="f">Ripeti la password<input class="i" id="pw2" type="password" autocomplete="new-password"></label>
    <label class="f">Chiave GitHub "Cucina"<input class="i" id="tok" type="password" placeholder="github_pat_…" autocomplete="off"></label>
    <label class="f">Archivio della cucina<input class="i" id="repo" value="${esc(DEF_REPO)}"></label>
    <label class="f">Nome di questo computer<input class="i" id="nome" placeholder="es. Mac Giovanni"></label>
    <div class="row"><button class="b p" data-act="setup">Collega e apri</button></div><div id="lmsg"></div>`;
    $('#pw1').focus();
  } else {
    box.innerHTML=`<img src="icons/icon-192.png" alt=""><h2>Cucina La Magiostra</h2><p class="mut small">App protetta. Inserisci la password.</p>
    <label class="f">Password<input class="i" id="pw" type="password" autocomplete="current-password"></label>
    <div class="row"><button class="b p" data-act="unlock">Apri</button></div><div id="lmsg"></div>
    <p class="small mut" style="margin-top:18px">Password dimenticata? Su questo computer si può solo <a href="#" data-act="reset">cancellare l'accesso</a> e ricollegarlo con la chiave GitHub: i dati restano al sicuro nell'archivio online.</p>`;
    $('#pw').focus();
  }
}
function lmsg(t,cl='err'){ const e=$('#lmsg'); if(e) e.innerHTML=t?`<div class="${cl}">${esc(t)}</div>`:''; }
async function doSetup(){
  const p1=$('#pw1').value, p2=$('#pw2').value, tok=$('#tok').value.trim(), repo=$('#repo').value.trim().replace(/^https?:\/\/github\.com\//,'').replace(/\/$/,''), nome=$('#nome').value.trim().slice(0,40);
  if(p1.length<10) return lmsg('La password deve avere almeno 10 caratteri.');
  if(p1!==p2) return lmsg('Le due password non sono uguali.');
  if(!/^[A-Za-z0-9_]{20,255}$/.test(tok)) return lmsg('Incolla la chiave GitHub (inizia con github_pat_).');
  if(!REPO_OK.test(repo)) return lmsg('Archivio non valido: scrivilo come utente/nome.');
  lmsg('Controllo la chiave…','good');
  CFG={token:tok,repo,etiRepo:ETI_REPO,nome};
  try{
    const r=await gh('GET',`/repos/${repo}`); if(!r.ok) { CFG=null; return lmsg('Collegamento non riuscito: '+ghErr(r)); }
    const j=await r.json(); if(!j.private){ CFG=null; return lmsg('Questo archivio è PUBBLICO: costi e ricette sarebbero visibili a tutti. Rendilo privato su GitHub.'); }
    if(j.permissions&&!j.permissions.push){ CFG=null; return lmsg('La chiave può solo leggere: serve Contents "Read and write".'); }
  }catch(e){ CFG=null; return lmsg('Nessuna connessione: per il primo collegamento serve internet.'); }
  lmsg('Cifro e salvo…','good');
  const salt=crypto.getRandomValues(new Uint8Array(16));
  KEY=await deriveKey(p1,salt,PBKDF2_ITER);
  await kvSet('vault',{v:1,salt:b64(salt),iter:PBKDF2_ITER,box:await seal(KEY,CFG)});
  S=emptyData(); reindex(); await saveLocal();
  await start();
}
async function doUnlock(){
  const d=failDelay(); const last=+(localStorage.getItem('cuc_failt')||0);
  if(d&&now()-last<d*1000) return lmsg(`Troppi tentativi: riprova tra ${Math.ceil((d*1000-(now()-last))/1000)} secondi.`);
  const pw=$('#pw').value; if(!pw) return;
  lmsg('Apro…','good');
  const v=await kvGet('vault');
  try{
    const k=await deriveKey(pw,unb64(v.salt),v.iter);
    CFG=await unseal(k,v.box); KEY=k;
  }catch(e){
    localStorage.setItem('cuc_fail',String(+(localStorage.getItem('cuc_fail')||0)+1)); localStorage.setItem('cuc_failt',String(now()));
    return lmsg('Password sbagliata.');
  }
  localStorage.removeItem('cuc_fail');
  const c=await kvGet('cache');
  try{ S=c?sanitize(await unseal(KEY,c)):emptyData(); }catch(e){ S=emptyData(); }
  reindex();
  await start();
}
async function doReset(){
  if(!confirm('Cancello da questo computer la chiave e la copia locale dei dati. I dati online NON vengono toccati. Poi potrai ricollegarti con la chiave GitHub e una nuova password. Procedo?')) return;
  await kvDel('vault'); await kvDel('cache'); await kvDel('dir'); location.reload();
}
async function start(){
  $('#lock').classList.add('hidden'); $('#hdr').classList.remove('hidden'); $('#main').classList.remove('hidden');
  armLock(); render(); setStatus('Sincronizzo…');
  await sync(); loadEti().then(()=>{ if(TAB==='ricette'&&!EDIT) render(); });
  setInterval(()=>{ if(KEY&&!EDIT) sync(); },30000);
  addEventListener('online',()=>sync());
  dirInit();
  checkUpdate(); setInterval(checkUpdate,10*60000);
}

/* ===================== NAVIGAZIONE ===================== */
const TABS=[['quadro','Quadro'],['ricette','Ricette'],['ingredienti','Ingredienti e prezzi'],['archivio','Archivio piatti'],['fatture','Fatture e file'],['impostazioni','Impostazioni']];
function nav(){ $('#nav').innerHTML=TABS.map(([k,t])=>`<button class="${k===TAB?'on':''}" data-tab="${k}">${t}</button>`).join(''); }
function render(){
  if(!S) return; nav();
  const m=$('#main');
  const f={quadro:vQuadro,ricette:vRicette,ingredienti:vIngredienti,archivio:vArchivio,fatture:vFatture,impostazioni:vImpostazioni}[TAB];
  if(render.busy) return; render.busy=true;
  try{ const ae=document.activeElement; if(ae&&m.contains(ae)&&ae.id!=='q') ae.blur(); const y=scrollY; m.innerHTML=f(); scrollTo(0,y); }
  finally{ render.busy=false; }
  afterRender();
}
function afterRender(){ const q=document.getElementById('q'); if(q&&render.focusQ){ q.focus(); q.setSelectionRange(q.value.length,q.value.length); render.focusQ=false; } }
async function checkUpdate(){
  try{ const r=await fetch('version.json',{cache:'no-store'}); const j=await r.json();
    if(j.version&&j.version!==APP_VERSION&&!document.getElementById('upd')){ const b=document.createElement('button'); b.id='upd'; b.className='b sm'; b.textContent='Aggiorna app ('+j.version+')'; b.dataset.act='aggiorna'; $('#hdr').insertBefore(b,$('#nav')); }
  }catch(e){}
}

/* ===================== DIALOGO ===================== */
function dialog(title,body,buttons){ // buttons: [[label,act,cls]]
  const d=$('#dlg'); d.innerHTML=`<div class="dh"><h3>${esc(title)}</h3><button class="b sm" data-act="dlgclose">✕</button></div><div class="db">${body}</div><div class="df">${(buttons||[]).map(([l,a,c])=>`<button class="b ${c||''}" data-act="${a}">${esc(l)}</button>`).join('')}</div>`;
  if(!d.open) d.showModal();
}
const closeDlg=()=>{ const d=$('#dlg'); if(d.open) d.close(); };

/* ===================== QUADRO ===================== */
const STAG=['inverno','inverno','primavera','primavera','primavera','estate','estate','estate','autunno','autunno','autunno','inverno'];
function monthsSince(s){ if(!s) return null; const d=new Date(s); if(isNaN(d)) return null; const n=new Date(); return (n.getFullYear()-d.getFullYear())*12+(n.getMonth()-d.getMonth()); }
function vQuadro(){
  const R=ricette().filter(r=>r.inProdotti!==false), C=R.map(r=>[r,calc(r)]);
  const cnt={}; C.forEach(([r,c])=>cnt[c.stato]=(cnt[c.stato]||0)+1);
  const I=ings(); const noPrice=I.filter(i=>unitCost(i)==null);
  const old=I.filter(i=>{ const d=lastPriceDate(i); const m=monthsSince(d); return unitCost(i)!=null&&(m==null||m>=6); });
  const sotto=C.filter(([r,c])=>c.ricReale!=null&&c.ricReale<(r.ricarico??S.parametri.ricaricoDef)-0.05).sort((a,b)=>a[1].ricReale-b[1].ricReale);
  const stag=STAG[new Date().getMonth()];
  const ripro=S.archivio.filter(a=>!a.deleted&&a.stagioni.includes(stag)&&(monthsSince(a.ultima)??99)>=12).sort((a,b)=>(b.volte||0)-(a.volte||0)).slice(0,14);
  const recenti=[]; I.forEach(i=>(i.storico||[]).forEach(s=>{ const m=monthsSince(s.data); if(m!=null&&m<=1&&s.prima&&s.prezzoUnit) recenti.push([i,s,s.prezzoUnit/s.prima-1]); }));
  recenti.sort((a,b)=>Math.abs(b[2])-Math.abs(a[2]));
  const k=(n,t,go)=>`<div class="kpi" data-go="${go}"><b>${n}</b><span>${t}</span></div>`;
  return `<div class="kpis">
    ${k(R.length,'prodotti nel ricettario','ricette:')}
    ${k(cnt['OK']||0,'food cost completo','ricette:OK')}
    ${k((cnt['Tempi mancanti']||0)+(cnt['Prezzi mancanti']||0)+(cnt['Dosi mancanti']||0)+(cnt['Lotto mancante']||0),'quasi pronti (manca un dato)','ricette:quasi')}
    ${k(cnt['Ricetta da inserire']||0,'ricette da inserire','ricette:Ricetta da inserire')}
    ${k(I.length,'ingredienti','ingredienti:')}
    ${k(old.length,'prezzi vecchi (oltre 6 mesi)','ingredienti:vecchi')}
  </div>
  <div class="grid2">
   <div class="card"><h2>Prezzo al banco sotto il ricarico voluto</h2>
    ${sotto.length?`<div class="scroll"><table class="t"><tr><th>Prodotto</th><th class="n">Costo €/kg</th><th class="n">Banco</th><th class="n">Ricarico reale</th><th class="n">Voluto</th></tr>
    ${sotto.slice(0,15).map(([r,c])=>`<tr data-ric="${r.id}" style="cursor:pointer"><td>${esc(r.nome)}</td><td class="n">${eur(c.ckg)}</td><td class="n">${esc(banco(r))}</td><td class="n"><span class="chip ${c.ricReale<0.3?'r':'w'}">${pct(c.ricReale)}</span></td><td class="n">${pct(r.ricarico??S.parametri.ricaricoDef)}</td></tr>`).join('')}</table></div>`
    :'<p class="mut">Nessun prodotto con food cost completo è venduto sotto il ricarico voluto (o mancano i prezzi al banco).</p>'}
    <p class="small mut">Ricarico reale = prezzo al banco senza IVA ÷ costo pieno €/kg − 1. Conta solo i prodotti con food cost completo e prezzo al banco.</p></div>
   <div class="card"><h2>Prezzi cambiati nell'ultimo mese</h2>
    ${recenti.length?`<table class="t"><tr><th>Ingrediente</th><th>Fornitore</th><th class="n">Prima</th><th class="n">Ora</th><th class="n">Var.</th></tr>${recenti.slice(0,12).map(([i,s,v])=>`<tr><td>${esc(i.nome)}</td><td>${esc(s.fornitore)}</td><td class="n">${eur3(s.prima)}</td><td class="n">${eur3(s.prezzoUnit)}</td><td class="n"><span class="chip ${v>0.05?'r':v<-0.05?'ok':'g'}">${v>0?'+':''}${pct(v)}</span></td></tr>`).join('')}</table>`:'<p class="mut">Nessun aggiornamento prezzi nell\'ultimo mese. Carica le fatture XML in "Fatture e file".</p>'}
   </div>
  </div>
  <div class="grid2">
   <div class="card"><h2>Da riproporre questa stagione (${stag})</h2><p class="small mut">Piatti già fatti in ${stag}, non proposti da almeno 12 mesi.</p>
    ${ripro.length?`<table class="t">${ripro.map(a=>`<tr><td>${esc(a.nome)}</td><td class="mut small">${a.tipo}</td><td class="n small">${a.volte||0} volte</td><td class="n small mut">${esc(dIT(a.ultima))}</td></tr>`).join('')}</table>`:'<p class="mut">Nessuno.</p>'}</div>
   <div class="card"><h2>Ingredienti da sistemare</h2>
    <p><b>${noPrice.length}</b> senza prezzo · <b>${old.length}</b> con prezzo più vecchio di 6 mesi</p>
    ${noPrice.length?`<p class="small">${noPrice.slice(0,30).map(i=>esc(i.nome)).join(', ')}${noPrice.length>30?'…':''}</p>`:''}
    <button class="b" data-go="ingredienti:vecchi">Vedi l'elenco</button></div>
  </div>`;
}

/* ===================== RICETTE ===================== */
const CATS=()=>[...new Set(ricette().map(r=>r.categoria).filter(Boolean))].sort();
function vRicette(){
  const f=FILT.ric||'';
  let R=ricette();
  if(Q) R=R.filter(r=>norm(r.nome+' '+r.categoria+' '+r.righe.map(x=>x.nome).join(' ')).includes(norm(Q)));
  const C=new Map(R.map(r=>[r.id,calc(r)]));
  if(f==='quasi') R=R.filter(r=>['Tempi mancanti','Prezzi mancanti','Dosi mancanti','Lotto mancante'].includes(C.get(r.id).stato));
  else if(f&&f.startsWith('cat:')) R=R.filter(r=>r.categoria===f.slice(4));
  else if(f) R=R.filter(r=>C.get(r.id).stato===f);
  const sel=SEL&&getR(SEL);
  const fl=[['','Tutte'],['OK','Food cost OK'],['quasi','Manca un dato'],['Ricetta da inserire','Da inserire'],...CATS().map(c=>['cat:'+c,c])];
  return `<div class="split"><div>
    <div class="row" style="margin-bottom:8px"><input class="i flex1" id="q" placeholder="Cerca ricetta o ingrediente" value="${esc(Q)}"><button class="b p" data-act="nuovaric">+ Nuova</button></div>
    <div class="tabs2">${fl.map(([k,t])=>`<button class="${k===f?'on':''}" data-filt="ric:${esc(k)}">${esc(t)}</button>`).join('')}</div>
    <div class="list">${R.map(r=>{const c=C.get(r.id);return `<div class="it ${sel&&sel.id===r.id?'on':''}" data-ric="${r.id}"><div class="nm">${esc(r.nome)}<small>${esc(r.categoria)}${c.ckg!=null?' · '+eur(c.ckg)+'/kg':''}</small></div><span class="chip ${STATO_CL[c.stato]}">${c.stato==='OK'?'OK':esc(c.stato.replace(' mancanti','').replace('Ricetta da inserire','da inserire'))}</span></div>`}).join('')||'<div class="it mut">Nessuna ricetta</div>'}</div>
    <p class="small mut">${R.length} ricette</p>
  </div><div>${sel?(EDIT&&EDIT.id===sel.id?ricEdit():ricView(sel)):'<div class="card"><p class="mut">Scegli una ricetta dall\'elenco.</p></div>'}</div></div>`;
}
let MOLT={m:1,kg:null};
function ricView(r){
  const c=calc(r,{molt:MOLT.m,kgVoluti:MOLT.kg});
  const P=S.parametri, pk=S.packaging.find(p=>p.id===r.packaging);
  const et=ETI&&r.etichetta?ETI.prodotti.find(p=>p.id===r.etichetta&&!p.deleted):null;
  return `<div class="card">
    <div class="row"><h2 class="flex1" style="margin:0">${esc(r.nome)}</h2><span class="chip ${STATO_CL[c.stato]}">${esc(c.stato)}</span></div>
    <p class="mut small">${esc(r.categoria)}${r.unita?' · '+esc(r.unita):''}${r.foglio?' · scheda Excel: '+esc(r.foglio):''}</p>
    ${r.note?`<p class="small">${esc(r.note)}</p>`:''}
    <div class="row" style="margin:8px 0 12px"><button class="b p" data-act="modric">Modifica</button><button class="b" data-act="stampa:cucina">Stampa per la cucina</button><button class="b" data-act="stampa:fc">Stampa food cost</button><button class="b" data-act="duplica">Duplica</button><button class="b d" data-act="eliminaric">Elimina</button></div>
    <h3>Ricetta</h3>
    <div class="row small"><label class="f s">Moltiplicatore dosi<input class="i n" id="molt" value="${fmt(MOLT.kg?c.molt:MOLT.m,3)}" inputmode="decimal"></label><label class="f s">oppure kg finali voluti<input class="i n" id="kgv" value="${MOLT.kg?fmt(MOLT.kg,2):''}" inputmode="decimal"></label><span class="mut">${MOLT.kg?'moltiplicatore calcolato dai kg voluti: '+fmt(c.molt,3):''}</span></div>
    <div class="scroll"><table class="t" style="margin-top:8px"><tr><th>Ingrediente</th><th class="n">1 dose</th><th class="n">Da usare</th><th class="n">€/unità</th><th class="n">Costo 1 dose</th><th>Fornitore</th></tr>
    ${c.righe.filter(z=>z.x.nome).map(({x,i,u,costo})=>{ const un=i?i.unita:''; const q=x.dose!=null?x.dose*c.molt:null; return `<tr><td>${esc(x.nome)}${x.flag?' <span class="chip w">da verificare</span>':''}${!i?' <span class="chip r">non in elenco</span>':''}</td><td class="n">${x.dose!=null?fmt(x.dose)+' '+esc(un):esc(x.doseTesto||'–')}</td><td class="n"><b>${q!=null?(un==='pz'?fmt(q,1)+' pz':fmt(q*1000,0)+(un==='l'?' ml':' g')):''}</b></td><td class="n">${u!=null?eur3(u):'<span class="chip r">manca</span>'}</td><td class="n">${costo!=null?eur(costo):''}</td><td class="small mut">${esc(i?i.fornitore:'')}</td></tr>`}).join('')}
    <tr class="tot"><td>Peso impasto crudo · costo ingredienti (1 dose)</td><td class="n">${fmt(c.peso)} kg</td><td class="n">${fmt(c.peso*c.molt)} kg</td><td></td><td class="n">${eur(c.costo)}</td><td class="small">${c.manc?`<span class="chip r">${c.manc} prezzi mancanti</span>`:''}</td></tr></table></div>
    ${r.procedimento?`<h3>Procedimento</h3><div class="proc">${esc(r.procedimento)}</div>`:''}
    <h3>Food cost (lotto standard: ${fmt(r.lotto)||'–'} dosi)</h3>
    <div class="fc">
      <div><span>Costo di produzione</span><b>${eur(c.ckg)}/kg</b></div>
      <div><span>Prezzo teorico (ricarico ${pct(c.ric)} + IVA)</span><b>${eur(c.pkg)}/kg</b></div>
      <div><span>Confezione ${r.confezione?fmt(r.confezione,0)+' g':'–'}</span><b>${eur(c.pconf)}</b></div>
      <div><span>Margine a confezione</span><b>${eur(c.marg)}</b></div>
      <div><span>Prezzo al banco</span><b>${esc(banco(r))}</b></div>
      <div><span>Ricarico reale al banco</span><b>${pct(c.ricReale)}</b></div>
    </div>
    <div class="scroll"><table class="t" style="margin-top:10px">
      <tr><td>Peso crudo del lotto</td><td class="n">${fmt(c.crudo)} kg</td><td>Perdita in cottura</td><td class="n">${pct(r.perdita||0)}</td></tr>
      <tr><td>Peso finale del lotto</td><td class="n">${fmt(c.fin)} kg</td><td>Tempo produzione / cottura</td><td class="n">${fmt(r.tProd)||0} / ${fmt(r.tCott)||0} min</td></tr>
      <tr><td>Ingredienti del lotto</td><td class="n">${eur(c.cIng)}</td><td>Manodopera (${eur(P.costoOrario)}/h)</td><td class="n">${eur(c.man)}</td></tr>
      <tr><td>Energia (${eur(P.energiaOra)}/h)</td><td class="n">${eur(c.en)}</td><td>Affitto e costi fissi cucina</td><td class="n">${eur(c.aff)}</td></tr>
      <tr class="tot"><td>Costo totale del lotto</td><td class="n">${eur(c.tot)}</td><td>Packaging a confezione</td><td class="n">${eur(c.pcost)} ${pk?'('+esc(pk.nome)+')':'(predefinito)'}</td></tr>
      <tr><td>Peso ingredienti sul costo</td><td class="n">${pct(c.pesoIng)}</td><td>Peso manodopera sul costo</td><td class="n">${pct(c.pesoMan)}</td></tr>
    </table></div>
    <h3>Etichetta</h3>
    ${etiBox(r,et,c)}
  </div>`;
}
function etiBox(r,et,c){
  if(!ETI) return '<p class="mut small">Archivio etichette non raggiungibile (serve la rete, e la chiave deve avere accesso anche a etichette-magiostra-dati).</p>';
  const opts=ETI.prodotti.filter(p=>!p.deleted).sort((a,b)=>a.nome.localeCompare(b.nome,'it'));
  const ord=c.righe.filter(z=>z.x.nome&&z.x.dose!=null).sort((a,b)=>b.x.dose*((b.i&&b.i.unita==='pz')?(b.i.pesoPezzo||0):1)-a.x.dose*((a.i&&a.i.unita==='pz')?(a.i.pesoPezzo||0):1)).map(z=>z.x.nome);
  let miss='';
  if(et){ const t=norm(et.ingredienti); const m=r.righe.filter(x=>x.nome&&!t.includes(norm(x.nome).split(' ')[0])).map(x=>x.nome); if(m.length) miss=`<div class="warn small">Nella ricetta ma forse non in etichetta: ${m.map(esc).join(', ')}</div>`; }
  return `<div class="row"><select class="i flex1" id="etisel"><option value="">— nessuna etichetta collegata —</option>${opts.map(p=>`<option value="${p.id}" ${p.id===r.etichetta?'selected':''}>${esc(p.nome+(p.sottotitolo?' '+p.sottotitolo:''))}</option>`).join('')}</select></div>
  ${et?`<p class="small" style="margin-top:8px"><b>Ingredienti in etichetta:</b> ${esc(et.ingredienti)}</p>${miss}`:''}
  ${ord.length?`<p class="small mut">Ordine per peso dalla ricetta (quello richiesto in etichetta): ${ord.map(esc).join(', ')}</p>`:''}
  <div class="row"><button class="b sm" data-act="etinuova">${et?'Copia l\'ordine per peso nell\'etichetta…':'Crea l\'etichetta da questa ricetta…'}</button></div>`;
}
function ricEdit(){
  const r=EDIT; const names=ings().map(i=>i.nome);
  return `<div class="card"><h2>${r._new?'Nuova ricetta':'Modifica: '+esc(r.nome)}</h2>
   <div class="row"><label class="f">Nome<input class="i" data-e="nome" value="${esc(r.nome)}"></label><label class="f">Categoria<input class="i" data-e="categoria" value="${esc(r.categoria)}" list="catlist"></label><label class="f">Unità / resa<input class="i" data-e="unita" value="${esc(r.unita)}"></label></div>
   <datalist id="catlist">${CATS().map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
   <datalist id="inglist">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
   <h3>Ingredienti per 1 dose (kg, litri o pezzi, come nell'elenco ingredienti)</h3>
   <div class="scroll"><table class="t"><tr><th>Ingrediente</th><th class="n">Dose</th><th>Unità</th><th></th></tr>
   ${r.righe.map((x,k)=>{ const i=INAME.get((x.nome||'').toLowerCase()); return `<tr><td><input class="i" list="inglist" data-row="${k}" data-f="nome" value="${esc(x.nome)}">${x.nome&&!i?'<div class="small" style="color:var(--r)">Non è nell\'elenco ingredienti: aggiungilo in "Ingredienti e prezzi" o scegli un nome dall\'elenco.</div>':''}</td><td class="n"><input class="i n" inputmode="decimal" data-row="${k}" data-f="dose" value="${x.dose!=null?fmt(x.dose,4):esc(x.doseTesto)}"></td><td class="mut">${i?esc(i.unita):''}</td><td><button class="b sm d" data-act="delriga:${k}">✕</button></td></tr>`}).join('')}
   </table></div>
   <div class="row" style="margin-top:6px"><button class="b sm" data-act="addriga">+ Ingrediente</button></div>
   <h3>Procedimento</h3><textarea class="i" data-e="procedimento">${esc(r.procedimento)}</textarea>
   <h3>Produzione e prezzo</h3>
   <div class="row">
    <label class="f s">Lotto standard (dosi)<input class="i" inputmode="decimal" data-n="lotto" value="${fmt(r.lotto)}"></label>
    <label class="f s">Tempo produzione (min)<input class="i" inputmode="decimal" data-n="tProd" value="${fmt(r.tProd)}"></label>
    <label class="f s">Tempo cottura (min)<input class="i" inputmode="decimal" data-n="tCott" value="${fmt(r.tCott)}"></label>
    <label class="f s">Perdita in cottura %<input class="i" inputmode="decimal" data-p="perdita" value="${r.perdita!=null?fmt(r.perdita*100,1):''}"></label>
    <label class="f s">Ricarico % (vuoto = ${pct(S.parametri.ricaricoDef)})<input class="i" inputmode="decimal" data-p="ricarico" value="${r.ricarico!=null?fmt(r.ricarico*100,1):''}"></label>
    <label class="f s">Confezione (g)<input class="i" inputmode="decimal" data-n="confezione" value="${fmt(r.confezione)}"></label>
    <label class="f">Packaging<select class="i" data-e="packaging"><option value="">predefinito (${eur(S.parametri.packagingDef)})</option>${packs().map(p=>`<option value="${p.id}" ${p.id===r.packaging?'selected':''}>${esc(p.nome)}</option>`).join('')}</select></label>
    <label class="f s">Pezzi packaging<input class="i" inputmode="decimal" data-n="pezziPack" value="${fmt(r.pezziPack)}"></label>
    <label class="f s">Prezzo al banco €<input class="i" inputmode="decimal" data-n="prezzoBanco" value="${fmt(r.prezzoBanco,2)}"></label>
    <label class="f s">Unità prezzo<select class="i" data-e="unitaBanco">${['','€/etto','€/kg','€/pz','€/porzione'].map(u=>`<option ${u===r.unitaBanco?'selected':''}>${u}</option>`).join('')}</select></label>
   </div>
   <label class="f" style="margin-top:8px">Note<textarea class="i" style="min-height:60px" data-e="note">${esc(r.note)}</textarea></label>
   <div class="row" style="margin-top:12px"><button class="b p" data-act="salvaric">Salva</button><button class="b" data-act="annullaric">Annulla</button></div>
  </div>`;
}

/* ===================== INGREDIENTI ===================== */
function vIngredienti(){
  const f=FILT.ing||'';
  let I=ings();
  if(Q) I=I.filter(i=>norm(i.nome+' '+i.fornitore).includes(norm(Q)));
  if(f==='vecchi') I=I.filter(i=>{ const m=monthsSince(lastPriceDate(i)); return unitCost(i)==null||m==null||m>=6; });
  else if(f==='senza') I=I.filter(i=>unitCost(i)==null);
  else if(f.startsWith('forn:')) I=I.filter(i=>i.fornitore===f.slice(5));
  const forn=[...new Set(ings().map(i=>i.fornitore).filter(Boolean))].sort();
  const use=new Map(); ricette().forEach(r=>r.righe.forEach(x=>{ if(x.ing) use.set(x.ing,(use.get(x.ing)||0)+1); }));
  return `<div class="card">
   <div class="row" style="margin-bottom:8px"><input class="i flex1" id="q" placeholder="Cerca ingrediente o fornitore" value="${esc(Q)}"><button class="b p" data-act="nuovoing">+ Ingrediente</button><button class="b" data-act="stampa:listino">Stampa elenco prezzi</button></div>
   <div class="tabs2"><button class="${!f?'on':''}" data-filt="ing:">Tutti (${ings().length})</button><button class="${f==='vecchi'?'on':''}" data-filt="ing:vecchi">Da aggiornare</button><button class="${f==='senza'?'on':''}" data-filt="ing:senza">Senza prezzo</button>
   <select class="i" style="width:auto" data-filtsel="ing"><option value="">Fornitore…</option>${forn.map(x=>`<option value="forn:${esc(x)}" ${f==='forn:'+x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
   <div class="scroll"><table class="t"><tr><th>Ingrediente</th><th>Fornitore</th><th class="n">Prezzo</th><th class="n">Formato</th><th class="n">Costo unitario</th><th>Ultimo prezzo</th><th class="n">Ricette</th></tr>
   ${I.map(i=>{ const u=unitCost(i), d=lastPriceDate(i), m=monthsSince(d); return `<tr data-ing="${i.id}" style="cursor:pointer"><td>${esc(i.nome)}</td><td class="small">${esc(i.fornitore)}</td><td class="n">${eur(i.prezzo)}</td><td class="n">${fmt(i.formato)} ${esc(i.unita)}</td><td class="n"><b>${u!=null?eur3(u)+'/'+esc(i.unita):'<span class="chip r">manca</span>'}</b></td><td class="small">${d?esc(dIT(d)):'<span class="mut">?</span>'} ${m!=null&&m>=6?'<span class="chip w">vecchio</span>':''}</td><td class="n">${use.get(i.id)||''}</td></tr>`}).join('')}
   </table></div><p class="small mut">${I.length} ingredienti · prezzi IVA esclusa · clic su una riga per modificarla e vedere lo storico</p></div>`;
}
function ingDialog(id){
  const i=id?getI(id):{id:'',nome:'',fornitore:'',prezzo:null,formato:null,unita:'kg',pesoPezzo:null,note:'',storico:[]};
  const used=id?usedIn(id):[];
  dialog(id?i.nome:'Nuovo ingrediente',`
   <div class="row"><label class="f">Nome<input class="i" id="d_nome" value="${esc(i.nome)}"></label><label class="f">Fornitore<input class="i" id="d_forn" value="${esc(i.fornitore)}"></label></div>
   <div class="row"><label class="f s">Prezzo confezione € (IVA escl.)<input class="i" id="d_prezzo" inputmode="decimal" value="${fmt(i.prezzo,4)}"></label><label class="f s">Formato (quantità nella confezione)<input class="i" id="d_formato" inputmode="decimal" value="${fmt(i.formato,4)}"></label>
   <label class="f s">Unità<select class="i" id="d_unita">${['kg','l','pz'].map(u=>`<option ${u===i.unita?'selected':''}>${u}</option>`).join('')}</select></label><label class="f s">Peso per pezzo (kg, solo pz)<input class="i" id="d_pp" inputmode="decimal" value="${fmt(i.pesoPezzo,4)}"></label></div>
   <label class="f">Note<textarea class="i" id="d_note" style="min-height:70px">${esc(i.note)}</textarea></label>
   ${used.length?`<p class="small"><b>Usato in:</b> ${used.map(r=>esc(r.nome)).join(', ')}</p>`:''}
   ${(i.storico||[]).length?`<h3>Storico prezzi da fattura</h3><table class="t small"><tr><th>Data</th><th>Fornitore</th><th>Fattura</th><th>Voce</th><th class="n">€/unità</th></tr>${i.storico.slice().reverse().map(s=>`<tr><td>${esc(dIT(s.data))}</td><td>${esc(s.fornitore)}</td><td>${esc(s.fattura)}</td><td>${esc(s.voce)}</td><td class="n">${eur3(s.prezzoUnit)}</td></tr>`).join('')}</table>`:''}
  `,[...(id&&!used.length?[['Elimina','ingdel:'+id,'d']]:[]),['Annulla','dlgclose'],['Salva','ingsave:'+(id||''),'p']]);
}
function ingSave(id){
  const nome=$('#d_nome').value.trim(); if(!nome) return alert('Scrivi il nome.');
  const other=INAME.get(nome.toLowerCase()); if(other&&other.id!==id) return alert('Esiste già un ingrediente con questo nome.');
  let i=id?getI(id):null;
  if(!i){ i={id:uid('i-'),storico:[],updatedAt:0,deleted:false}; S.ingredienti.push(i); }
  const oldName=i.nome;
  Object.assign(i,{nome,fornitore:$('#d_forn').value.trim(),prezzo:num($('#d_prezzo').value),formato:num($('#d_formato').value),unita:$('#d_unita').value,pesoPezzo:num($('#d_pp').value),note:$('#d_note').value});
  touch(i);
  if(oldName&&oldName!==nome) S.ricette.forEach(r=>{ let ch=false; r.righe.forEach(x=>{ if(x.ing===i.id){ x.nome=nome; ch=true; } }); if(ch) touch(r); });
  closeDlg(); commit(); render(); toast('Ingrediente salvato');
}

/* ===================== ARCHIVIO PIATTI ===================== */
function vArchivio(){
  const f=FILT.arc||'';
  let A=S.archivio.filter(a=>!a.deleted);
  if(Q) A=A.filter(a=>norm(a.nome+' '+a.materiaPrima+' '+a.categoria).includes(norm(Q)));
  if(['primavera','estate','autunno','inverno'].includes(f)) A=A.filter(a=>a.stagioni.includes(f));
  if(f==='salato'||f==='dolce') A=A.filter(a=>a.tipo===f);
  if(f==='ripro') A=A.filter(a=>(monthsSince(a.ultima)??99)>=12);
  const so=FILT.arcsort||'nome';
  A.sort(so==='volte'?(a,b)=>(b.volte||0)-(a.volte||0):so==='ultima'?(a,b)=>String(b.ultima).localeCompare(String(a.ultima)):(a,b)=>a.nome.localeCompare(b.nome,'it'));
  const mese=new Date().getMonth();
  const stagM=S.stagionalita.filter(s=>s.mesi.includes(mese)).map(s=>s.nome);
  return `<div class="card">
   <div class="row" style="margin-bottom:8px"><input class="i flex1" id="q" placeholder="Cerca piatto o materia prima" value="${esc(Q)}"><button class="b" data-act="stampa:archivio">Stampa elenco</button></div>
   <div class="tabs2">${[['','Tutti'],['salato','Salato'],['dolce','Dolci'],['primavera','Primavera'],['estate','Estate'],['autunno','Autunno'],['inverno','Inverno'],['ripro','Non proposti da 12 mesi']].map(([k,t])=>`<button class="${k===f?'on':''}" data-filt="arc:${k}">${t}</button>`).join('')}
   <select class="i" style="width:auto" data-filtsel="arcsort"><option value="nome" ${so==='nome'?'selected':''}>Ordina per nome</option><option value="volte" ${so==='volte'?'selected':''}>Più proposti</option><option value="ultima" ${so==='ultima'?'selected':''}>Ultima volta</option></select></div>
   ${stagM.length?`<p class="small"><b>Di stagione questo mese:</b> ${stagM.map(esc).join(', ')}</p>`:''}
   <div class="scroll"><table class="t"><tr><th>Piatto</th><th>Tipo</th><th>Stagioni</th><th class="n">Ultimo prezzo</th><th class="n">Volte</th><th>Ultima volta</th><th>Materia prima</th></tr>
   ${A.map(a=>{ const m=monthsSince(a.ultima); return `<tr><td>${esc(a.nome)}</td><td class="small">${a.tipo}${a.categoria?' · '+esc(a.categoria):''}</td><td class="small">${a.stagioni.map(s=>s.slice(0,3)).join(' ')}</td><td class="n">${a.ultimoPrezzo!=null?eur(a.ultimoPrezzo)+' '+esc(a.unita):''}</td><td class="n">${a.volte||''}</td><td class="small">${esc(dIT(a.ultima))} ${m!=null&&m>=12?'<span class="chip w">'+m+' mesi</span>':''}</td><td class="small">${esc(a.materiaPrima)}</td></tr>`}).join('')}
   </table></div><p class="small mut">${A.length} piatti. L'archivio si aggiorna caricando i file "PROPOSTE della GASTRONOMIA" in "Fatture e file".</p></div>`;
}

/* ===================== IMPOSTAZIONI ===================== */
function vImpostazioni(){
  const P=S.parametri; const fields=[['costoOrario','Costo orario personale (€/h)'],['energiaOra','Costo energia in cottura (€/h)'],['affittoMese','Affitto cucina (€/mese)'],['altriFissiMese','Altri costi fissi cucina (€/mese)'],['settimaneMese','Settimane al mese'],['giorniSettimana','Giorni a settimana'],['oreGiorno','Ore al giorno'],['quotaAffitto','Quota affitto sul tempo di produzione (0-1)'],['iva','IVA gastronomia (0,10 = 10%)'],['ricaricoDef','Ricarico predefinito (0,70 = 70%)'],['packagingDef','Packaging predefinito (€/confezione)']];
  return `<div class="grid2"><div class="card"><h2>Parametri di costo</h2>
   ${fields.map(([k,t])=>`<label class="f" style="margin-bottom:6px">${t}<input class="i" inputmode="decimal" data-par="${k}" value="${fmt(P[k],4)}">${P.note&&P.note[k]?`<span class="small mut">${esc(P.note[k])}</span>`:''}</label>`).join('')}
   <p class="small">Costo orario affitto + costi fissi calcolato: <b>${eur(orarioFissi(P))}/h</b></p>
   <button class="b p" data-act="salvapar">Salva parametri</button></div>
   <div>
   <div class="card"><h2>Packaging</h2><table class="t"><tr><th>Packaging</th><th>Fornitore</th><th class="n">Prezzo</th><th class="n">Pezzi</th><th class="n">€/pz</th><th></th></tr>
   ${packs().map(p=>`<tr><td><input class="i" data-pk="${p.id}" data-f="nome" value="${esc(p.nome)}"></td><td><input class="i" data-pk="${p.id}" data-f="fornitore" value="${esc(p.fornitore)}"></td><td class="n"><input class="i n" data-pk="${p.id}" data-f="prezzo" value="${fmt(p.prezzo,4)}"></td><td class="n"><input class="i n" data-pk="${p.id}" data-f="pezzi" value="${fmt(p.pezzi)}"></td><td class="n">${eur3((p.prezzo||0)/(p.pezzi||1))}</td><td><button class="b sm d" data-act="pkdel:${p.id}">✕</button></td></tr>`).join('')}</table>
   <div class="row" style="margin-top:8px"><button class="b sm" data-act="pkadd">+ Packaging</button><button class="b sm p" data-act="pksave">Salva packaging</button></div></div>
   <div class="card"><h2>Cartella Drive e file</h2>${dirBox()}</div>
   <div class="card"><h2>Sicurezza</h2>
    <p class="small">Questo computer: <b>${esc(CFG.nome||'senza nome')}</b> · archivio <b>${esc(CFG.repo)}</b>. L'app si blocca dopo ${LOCK_MIN} minuti senza uso. Chiave e copia locale sono cifrate con la tua password.</p>
    <div class="row"><button class="b" data-act="blocca">Blocca adesso</button><button class="b" data-act="cambiapw">Cambia password</button><button class="b d" data-act="reset">Scollega questo computer</button></div>
    <p class="small mut" style="margin-top:10px">App Cucina v${APP_VERSION}${lastSync?' · ultima sincronizzazione '+lastSync.toLocaleTimeString('it-IT'):''}</p></div>
   </div></div>`;
}

/* ===================== CARTELLA DRIVE: Excel + backup automatici ===================== */
let DIR=null, dirState='none', fileT=null, lastFiles=null, filesErr='';
const XLS_NAME='Cucina La Magiostra - ricettario e food cost.xlsx';
const BAK_NAME='Cucina La Magiostra - backup dati.json';
async function dirInit(){ if(!('showDirectoryPicker' in window)) { dirState='nosupport'; return; } try{ DIR=await kvGet('dir'); }catch(e){ DIR=null; } await dirCheck(); }
async function dirCheck(){ if(!DIR){ dirState='none'; return; } try{ const p=await DIR.queryPermission({mode:'readwrite'}); dirState=p==='granted'?'ok':'ask'; }catch(e){ dirState='ask'; } }
function dirBox(){
  if(dirState==='nosupport') return `<p class="small">Questo browser non può scrivere nelle cartelle (serve Chrome o Edge su Mac/Windows). Puoi sempre scaricare i file:</p><div class="row"><button class="b" data-act="scaricaxls">Scarica Excel</button><button class="b" data-act="scaricajson">Scarica backup dati</button></div>`;
  return `<p class="small">Collega la cartella di Google Drive sul computer (es. <i>Il mio Drive › La Magiostra › Cucina</i>). A ogni modifica l'app scrive lì, entro un minuto:</p>
   <ul class="small"><li><b>${esc(XLS_NAME)}</b>: il ricettario con le formule, come il tuo v10</li><li><b>${esc(BAK_NAME)}</b>: copia completa dei dati</li><li>cartella <b>Backup Cucina</b>: una copia al giorno</li></ul>
   ${dirState==='ok'?`<div class="good small">Collegata: <b>${esc(DIR.name)}</b>${lastFiles?' · file aggiornati alle '+lastFiles.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):''}</div>`:dirState==='ask'?`<div class="warn small">Cartella <b>${esc(DIR.name)}</b>: Chrome chiede di nuovo il permesso.</div>`:''}
   ${filesErr?`<div class="err small">${esc(filesErr)}</div>`:''}
   <div class="row">${dirState==='ask'?'<button class="b p" data-act="dirperm">Consenti di nuovo</button>':''}<button class="b ${dirState==='none'?'p':''}" data-act="dirpick">${DIR?'Cambia cartella':'Collega cartella'}</button>${dirState==='ok'?'<button class="b" data-act="scrivifile">Aggiorna file adesso</button>':''}<button class="b" data-act="scaricaxls">Scarica Excel</button><button class="b" data-act="scaricajson">Scarica backup</button></div>
   <p class="small mut">Consiglio: installa l'app (icona "Installa" nella barra di Chrome) e alla richiesta scegli "Consenti a ogni visita": così Chrome non richiede il permesso ogni volta.</p>`;
}
async function dirPick(){ try{ const h=await showDirectoryPicker({id:'cucina',mode:'readwrite'}); DIR=h; await kvSet('dir',h); await dirCheck(); await writeFiles(); render(); }catch(e){ if(e.name!=='AbortError') alert('Cartella non collegata: '+e.message); } }
async function dirPerm(){ try{ const p=await DIR.requestPermission({mode:'readwrite'}); dirState=p==='granted'?'ok':'ask'; if(dirState==='ok') await writeFiles(); render(); }catch(e){} }
function scheduleFiles(){ if(dirState!=='ok') return; clearTimeout(fileT); fileT=setTimeout(writeFiles,45000); }
async function writeTo(dir,name,data){ const fh=await dir.getFileHandle(name,{create:true}); const w=await fh.createWritable(); await w.write(data); await w.close(); }
async function writeFiles(){
  if(dirState!=='ok'||!S) return;
  try{
    const json=JSON.stringify(S,null,1);
    await writeTo(DIR,BAK_NAME,new Blob([json],{type:'application/json'}));
    const bd=await DIR.getDirectoryHandle('Backup Cucina',{create:true});
    await writeTo(bd,'cucina-'+new Date().toISOString().slice(0,10)+'.json',new Blob([json],{type:'application/json'}));
    const buf=await buildXlsx();
    await writeTo(DIR,XLS_NAME,new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    lastFiles=new Date(); filesErr='';
  }catch(e){
    filesErr=e.name==='NoModificationAllowedError'||/lock/i.test(e.message)?'Il file Excel è aperto in Excel: chiudilo e premi "Aggiorna file adesso".':'Non riesco a scrivere nella cartella: '+e.message;
    if(e.name==='NotAllowedError') dirState='ask';
  }
  if(TAB==='impostazioni'&&!EDIT) render();
}
function download(name,blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },2000); }

/* ===================== EXCEL (stesse formule del v10) ===================== */
let XL=null;
function loadExcelJS(){ return XL||(XL=new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='lib/exceljs.min.js'; s.onload=()=>res(window.ExcelJS); s.onerror=()=>rej(new Error('ExcelJS non caricato')); document.head.appendChild(s); })); }
function sheetName(n,used){ let s=String(n).replace(/[\[\]:*?\/\\]/g,' ').slice(0,31).replace(/^'+|'+$/g,'').trim()||'Ricetta'; let k=2, b=s; while(used.has(s.toLowerCase())){ const suf=' ('+(k++)+')'; s=b.slice(0,31-suf.length)+suf; } used.add(s.toLowerCase()); return s; }
const qs=n=>"'"+n.replace(/'/g,"''")+"'";
async function buildXlsx(){
  const ExcelJS=await loadExcelJS();
  const wb=new ExcelJS.Workbook(); wb.creator='Cucina La Magiostra'; wb.calcProperties.fullCalcOnLoad=true;
  const Y={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF4C2'}}, H={type:'pattern',pattern:'solid',fgColor:{argb:'FFF3E3D6'}}, T={bold:true,size:14,color:{argb:'FF7C3A20'}};
  const hdr=row=>{ row.font={bold:true}; row.eachCell(c=>{ c.fill=H; c.alignment={wrapText:true,vertical:'top'}; }); };
  const P=S.parametri, I=ings(), R=ricette(), K=packs();
  const NI=Math.max(1000,I.length+50);
  const used=new Set(['prodotti','ingredienti','parametri','packaging','archivio piatti','stagionalità']);
  // Prodotti (riempito alla fine)
  const wsP=wb.addWorksheet('Prodotti',{views:[{state:'frozen',ySplit:4}]});
  // Ingredienti
  const wsI=wb.addWorksheet('Ingredienti',{views:[{state:'frozen',ySplit:4}]});
  wsI.getCell('A1').value="Ingredienti e prezzi d'acquisto"; wsI.getCell('A1').font=T;
  wsI.getCell('A2').value='File generato dall\'app Cucina il '+new Date().toLocaleString('it-IT')+'. Prezzi IVA esclusa. Le modifiche vanno fatte nell\'app: questo file viene riscritto.';
  wsI.getRow(4).values=['Ingrediente','Fornitore',"Prezzo d'acquisto (€)",'Formato (kg, l o pz)','Unità','Costo unitario (€/kg · €/l · €/pz)','Peso per pezzo (kg)','Note','Ultimo prezzo'];
  hdr(wsI.getRow(4));
  I.forEach((i,k)=>{ const r=5+k; wsI.getRow(r).values=[i.nome,i.fornitore,i.prezzo,i.formato,i.unita,null,i.pesoPezzo,i.note,lastPriceDate(i)?new Date(lastPriceDate(i)):null];
    wsI.getCell('F'+r).value={formula:`IF(OR(C${r}="",D${r}="",D${r}=0),"",C${r}/D${r})`,result:unitCost(i)??''}; ['C','D'].forEach(c=>wsI.getCell(c+r).fill=Y); wsI.getCell('I'+r).numFmt='dd/mm/yyyy'; });
  [32,18,14,14,8,16,12,60,12].forEach((w,k)=>wsI.getColumn(k+1).width=w); wsI.getColumn(3).numFmt='#,##0.00 €'; wsI.getColumn(6).numFmt='#,##0.000 €';
  // Parametri (stesse celle del v10)
  const wsA=wb.addWorksheet('Parametri'); wsA.getCell('A1').value='Parametri generali di costo'; wsA.getCell('A1').font=T;
  wsA.getRow(4).values=['Parametro','Valore','Nota']; hdr(wsA.getRow(4));
  const prow=[['Costo orario personale (€/h)',P.costoOrario,'costoOrario'],['Costo energia in cottura (€/h)',P.energiaOra,'energiaOra'],['Affitto mensile (€)',P.affittoMese,'affittoMese'],['Settimane al mese',P.settimaneMese],['Giorni a settimana',P.giorniSettimana],['Ore al giorno',P.oreGiorno],['Costo orario affitto + costi fissi cucina (€/h)',null],['Quota affitto allocata al tempo di produzione',P.quotaAffitto,'quotaAffitto'],['IVA gastronomia',P.iva],['Ricarico predefinito (se non indicato)',P.ricaricoDef],['Packaging predefinito (€/confezione)',P.packagingDef,'packagingDef'],['Altri costi fissi cucina (€/mese)',P.altriFissiMese,'altriFissiMese']];
  prow.forEach(([t,v,nk],k)=>{ const r=5+k; wsA.getCell('A'+r).value=t; if(r===11) wsA.getCell('B11').value={formula:'(B7+B16)/(B8*B9*B10)',result:orarioFissi(P)}; else { wsA.getCell('B'+r).value=v; wsA.getCell('B'+r).fill=Y; } if(nk&&P.note&&P.note[nk]) wsA.getCell('C'+r).value=P.note[nk]; });
  wsA.getColumn(1).width=46; wsA.getColumn(2).width=12; wsA.getColumn(3).width=90;
  // Packaging
  const wsK=wb.addWorksheet('Packaging'); wsK.getCell('A1').value='Packaging'; wsK.getCell('A1').font=T;
  wsK.getRow(3).values=['Packaging','Fornitore',"Prezzo d'acquisto (€)",'Pezzi nella confezione','Costo unitario (€/pz)']; hdr(wsK.getRow(3));
  for(let k=0;k<25;k++){ const r=4+k, p=K[k]; if(p) wsK.getRow(r).values=[p.nome,p.fornitore,p.prezzo,p.pezzi]; wsK.getCell('E'+r).value={formula:`IF(OR(C${r}="",D${r}="",D${r}=0),"",C${r}/D${r})`,result:p?(p.prezzo||0)/(p.pezzi||1):''}; }
  [34,16,14,14,14].forEach((w,k)=>wsK.getColumn(k+1).width=w);
  // Schede ricetta
  const IR=`Ingredienti!$A$5:$A$${4+NI}`, col=c=>`Ingredienti!$${c}$5:$${c}$${4+NI}`;
  const refs=[];
  for(const r of R){
    const c=calc(r); const name=sheetName(r.nome,used); refs.push([r,name,c]);
    const ws=wb.addWorksheet(name);
    ws.getCell('A1').value=r.nome; ws.getCell('A1').font=T;
    ws.getCell('H1').value={text:'← Prodotti',hyperlink:"#'Prodotti'!A1"};
    ws.getCell('A2').value='Categoria'; ws.getCell('B2').value=r.categoria; ws.getCell('D2').value='Allergeni'; ws.getCell('E2').value=r.allergeni||null;
    ws.getCell('A3').value='Unità'; ws.getCell('B3').value=r.unita||null; ws.getCell('D3').value='Note'; ws.getCell('E3').value=r.note||null;
    ws.getCell('A5').value='📖  RICETTA'; ws.getCell('A5').font={bold:true};
    ws.getCell('B6').value='Moltiplicatore dosi'; ws.getCell('D6').value=1; ws.getCell('D6').fill=Y; ws.getCell('E6').value='oppure kg finali voluti:'; ws.getCell('G6').fill=Y;
    ws.getCell('B7').value='Moltiplicatore applicato'; ws.getCell('D7').value={formula:'IF(AND(ISNUMBER(G6),G6>0),IFERROR(G6/(D30*(1-$D$53)),D6),IF(ISNUMBER(D6),D6,1))',result:1};
    ws.getRow(9).values=['#','Ingrediente','Unità','Q.tà originale (1 dose)','Q.tà da usare (moltiplicata)','≈ grammi / pezzi','Costo unit. (€/kg·l·pz)','Costo 1 dose (€)','Fornitore']; hdr(ws.getRow(9));
    const rows=r.righe.filter(x=>x.nome).slice(0,20);
    for(let k=0;k<20;k++){
      const rr=10+k, x=rows[k]; ws.getCell('A'+rr).value=k+1;
      if(x){ ws.getCell('B'+rr).value=x.nome; ws.getCell('D'+rr).value=x.dose!=null?x.dose:(x.doseTesto||null); }
      ws.getCell('B'+rr).fill=Y; ws.getCell('D'+rr).fill=Y;
      const z=x?c.righe.find(q=>q.x===x):null;
      ws.getCell('C'+rr).value={formula:`IF(B${rr}="","",IFERROR(INDEX(${col('E')},MATCH(B${rr},${IR},0)),"?"))`,result:z&&z.i?z.i.unita:''};
      ws.getCell('E'+rr).value={formula:`IF(OR(B${rr}="",D${rr}=""),"",D${rr}*$D$7)`,result:x&&x.dose!=null?x.dose:''};
      ws.getCell('F'+rr).value={formula:`IF(E${rr}="","",IF(C${rr}="pz",E${rr},E${rr}*1000))`,result:''};
      ws.getCell('G'+rr).value={formula:`IF(B${rr}="","",IFERROR(INDEX(${col('F')},MATCH(B${rr},${IR},0)),""))`,result:z&&z.u!=null?z.u:''};
      ws.getCell('H'+rr).value={formula:`IF(OR(B${rr}="",D${rr}="",G${rr}=""),"",D${rr}*G${rr})`,result:z&&z.costo!=null?z.costo:''};
      ws.getCell('I'+rr).value={formula:`IF(B${rr}="","",IFERROR(INDEX(${col('B')},MATCH(B${rr},${IR},0))&"",""))`,result:z&&z.i?z.i.fornitore:''};
      ws.getCell('K'+rr).value={formula:`IF(OR(B${rr}="",D${rr}=""),0,D${rr}*IF(C${rr}="pz",IFERROR(INDEX(${col('G')},MATCH(B${rr},${IR},0)),0),1))`,result:0};
      ws.getCell('L'+rr).value={formula:`IF(AND(B${rr}<>"",D${rr}<>"",G${rr}=""),1,0)`,result:0};
    }
    ws.getCell('B30').value='Peso impasto crudo (kg) / Costo ingredienti'; ws.getCell('D30').value={formula:'SUM(K10:K29)',result:c.peso}; ws.getCell('E30').value={formula:'D30*$D$7',result:c.peso}; ws.getCell('H30').value={formula:'SUM(H10:H29)',result:c.costo}; ws.getCell('L30').value={formula:'SUM(L10:L29)',result:c.manc};
    ws.getCell('B31').value='Costo ingredienti per la quantità moltiplicata'; ws.getCell('H31').value={formula:'H30*$D$7',result:c.costo};
    ws.getCell('I31').value={formula:'IF(L30>0,"⚠ "&L30&" prezzi mancanti","")',result:c.manc?'⚠ '+c.manc+' prezzi mancanti':''};
    if(r.righe.filter(x=>x.nome).length>20) ws.getCell('I32').value='⚠ La ricetta ha più di 20 ingredienti: nell\'Excel ci sono solo i primi 20 (nell\'app ci sono tutti).';
    ws.getCell('A33').value='Procedimento'; ws.getCell('A33').font={bold:true};
    ws.getCell('A34').value=r.procedimento||null; ws.mergeCells('A34:I47'); ws.getCell('A34').alignment={wrapText:true,vertical:'top'};
    ws.getCell('A49').value='€  FOOD COST (calcolato sul lotto standard di produzione)'; ws.getCell('A49').font={bold:true};
    const set=(cell,label,val,fill)=>{ ws.getCell('B'+cell).value=label; ws.getCell('D'+cell).value=val; if(fill) ws.getCell('D'+cell).fill=Y; };
    set(50,'Lotto standard di produzione (n. dosi)',r.lotto,1); set(51,'Tempo di produzione (minuti)',r.tProd,1); set(52,'Tempo di cottura (minuti)',r.tCott,1); set(53,'Perdita di peso in cottura',r.perdita,1);
    ws.getCell('D53').numFmt='0%';
    set(54,'Peso crudo del lotto (kg)',{formula:'D30*N(D50)',result:c.crudo}); set(55,'Peso finale del lotto (kg)',{formula:'D54*(1-N(D53))',result:c.fin});
    set(56,'Costo ingredienti del lotto',{formula:'H30*N(D50)',result:c.cIng}); set(57,'Costo manodopera',{formula:'N(D51)/60*Parametri!$B$5',result:c.man});
    set(58,'Costo energia',{formula:'N(D52)/60*Parametri!$B$6',result:c.en}); set(59,'Quota affitto e costi fissi cucina',{formula:'(N(D51)+N(D52))/60*Parametri!$B$11*Parametri!$B$12',result:c.aff});
    set(60,'COSTO TOTALE DEL LOTTO',{formula:'SUM(D56:D59)',result:c.tot}); set(61,'COSTO DI PRODUZIONE €/kg',{formula:'IF(D55>0,D60/D55,"")',result:c.ckg??''});
    set(62,'Peso ingredienti sul costo totale',{formula:'IF(D60>0,D56/D60,"")',result:c.pesoIng??''}); set(63,'Peso manodopera sul costo totale',{formula:'IF(D60>0,D57/D60,"")',result:c.pesoMan??''});
    set(64,'Ricarico',r.ricarico,1); set(65,'Ricarico applicato',{formula:'IF(ISNUMBER(D64),D64,Parametri!$B$14)',result:c.ric});
    set(66,'Prezzo di vendita €/kg (IVA incl.)',{formula:'IF(ISNUMBER(D61),D61*(1+D65)*(1+Parametri!$B$13),"")',result:c.pkg??''});
    set(67,'Confezione standard (g)',r.confezione,1);
    const pk=K.find(p=>p.id===r.packaging); set(68,'Packaging usato',pk?pk.nome:null,1); ws.getCell('E68').value=r.pezziPack; ws.getCell('E68').fill=Y;
    ws.getCell('F68').value={formula:'IF(D68="",Parametri!$B$15,IFERROR(INDEX(Packaging!$E$4:$E$28,MATCH(D68,Packaging!$A$4:$A$28,0))*IF(ISNUMBER(E68),E68,1),Parametri!$B$15))',result:c.pcost};
    set(69,'Costo pieno della confezione',{formula:'IF(AND(ISNUMBER(D61),N(D67)>0),D61*D67/1000+F68,"")',result:c.conf??''});
    set(70,'Prezzo della confezione (IVA incl.)',{formula:'IF(ISNUMBER(D69),D69*(1+D65)*(1+Parametri!$B$13),"")',result:c.pconf??''});
    set(71,'Margine lordo a confezione (al netto IVA)',{formula:'IF(ISNUMBER(D70),D70/(1+Parametri!$B$13)-D69,"")',result:c.marg??''});
    ['D56','D57','D58','D59','D60','D61','D66','D69','D70','D71','H30','H31','F68'].forEach(a=>ws.getCell(a).numFmt='#,##0.00 €'); ['D62','D63','D64','D65'].forEach(a=>ws.getCell(a).numFmt='0%');
    for(let k=10;k<30;k++){ ws.getCell('G'+k).numFmt='#,##0.000 €'; ws.getCell('H'+k).numFmt='#,##0.000 €'; }
    [5,34,8,14,14,12,14,14,18].forEach((w,k)=>ws.getColumn(k+1).width=w); ws.getColumn(11).hidden=true; ws.getColumn(12).hidden=true;
  }
  // Prodotti
  wsP.getCell('A1').value='La Magiostra — Cucina: prodotti, ricettario e food cost'; wsP.getCell('A1').font=T;
  wsP.getCell('A2').value='Generato dall\'app Cucina il '+new Date().toLocaleString('it-IT')+'. Clicca il nome per aprire la scheda. Per modificare usa l\'app: questo file viene riscritto.';
  wsP.getRow(4).values=['#','Prodotto','Categoria','Stato','Costo produzione €/kg','Ricarico','Prezzo teorico €/kg (IVA incl.)','Confezione (g)','Prezzo confezione','Margine a confezione','Prezzo al banco','Unità','Ricarico reale al banco']; hdr(wsP.getRow(4));
  refs.forEach(([r,name,c],k)=>{ const row=5+k, q=qs(name);
    wsP.getCell('A'+row).value=k+1;
    wsP.getCell('B'+row).value={text:r.nome,hyperlink:`#${q}!A1`}; wsP.getCell('B'+row).font={color:{argb:'FF7C3A20'},underline:true};
    wsP.getCell('C'+row).value=r.categoria; wsP.getCell('D'+row).value=c.stato;
    wsP.getCell('E'+row).value={formula:`${q}!D61`,result:c.ckg??''}; wsP.getCell('F'+row).value={formula:`${q}!D65`,result:c.ric};
    wsP.getCell('G'+row).value={formula:`${q}!D66`,result:c.pkg??''}; wsP.getCell('H'+row).value={formula:`IF(N(${q}!D67)>0,${q}!D67,"")`,result:r.confezione||''};
    wsP.getCell('I'+row).value={formula:`${q}!D70`,result:c.pconf??''}; wsP.getCell('J'+row).value={formula:`${q}!D71`,result:c.marg??''};
    wsP.getCell('K'+row).value=r.prezzoBanco; wsP.getCell('L'+row).value=r.unitaBanco||null;
    wsP.getCell('M'+row).value={formula:`IF(AND(ISNUMBER(K${row}),L${row}="€/etto",ISNUMBER(E${row})),K${row}*10/(1+Parametri!$B$13)/E${row}-1,IF(AND(ISNUMBER(K${row}),L${row}="€/kg",ISNUMBER(E${row})),K${row}/(1+Parametri!$B$13)/E${row}-1,""))`,result:c.ricReale??''};
    if(c.stato!=='OK') wsP.getCell('D'+row).font={color:{argb:'FFA86B00'}};
  });
  [5,36,16,18,14,10,16,12,14,14,12,10,14].forEach((w,k)=>wsP.getColumn(k+1).width=w);
  ['E','G','I','J','K'].forEach(c=>wsP.getColumn(c).numFmt='#,##0.00 €'); ['F','M'].forEach(c=>wsP.getColumn(c).numFmt='0%');
  // Archivio piatti
  const wsR=wb.addWorksheet('Archivio piatti',{views:[{state:'frozen',ySplit:1}]});
  wsR.getRow(1).values=['Piatto','Tipo','Categoria','Primavera','Estate','Autunno','Inverno','Mesi','Ultimo prezzo','Unità','Volte','Prima volta','Ultima volta','Materia prima']; hdr(wsR.getRow(1));
  S.archivio.filter(a=>!a.deleted).sort((a,b)=>a.nome.localeCompare(b.nome,'it')).forEach(a=>wsR.addRow([a.nome,a.tipo,a.categoria,...['primavera','estate','autunno','inverno'].map(s=>a.stagioni.includes(s)?'●':''),a.mesi,a.ultimoPrezzo,a.unita,a.volte,a.prima?new Date(a.prima):null,a.ultima?new Date(a.ultima):null,a.materiaPrima]));
  [44,8,12,6,6,6,6,24,10,8,7,11,11,22].forEach((w,k)=>wsR.getColumn(k+1).width=w); wsR.getColumn(12).numFmt='mm/yyyy'; wsR.getColumn(13).numFmt='mm/yyyy';
  wsR.autoFilter='A1:N1';
  const wsS=wb.addWorksheet('Stagionalità'); wsS.getRow(1).values=['Materia prima','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']; hdr(wsS.getRow(1));
  S.stagionalita.forEach(s=>wsS.addRow([s.nome,...Array.from({length:12},(_,m)=>s.mesi.includes(m)?'●':'')])); wsS.getColumn(1).width=24;
  return wb.xlsx.writeBuffer();
}

/* ===================== FATTURE E FILE ===================== */
let IMP=null; // {righe:[...], docs:[...], proposte:[...], note:[]}
function vFatture(){
  return `<div class="card"><h2>Carica fatture e file</h2>
   <p class="small">Trascina qui (o scegli) i file. L'app li legge sul tuo computer: non vengono caricati da nessuna parte.</p>
   <ul class="small"><li><b>Fatture elettroniche XML</b> (.xml, .xml.p7m o uno .zip che le contiene, scaricate da Aziendaonweb): aggiornano i prezzi d'acquisto degli ingredienti con l'ultimo prezzo pagato.</li>
   <li><b>PROPOSTE della GASTRONOMIA</b> (.docx): aggiornano l'archivio piatti (ultima volta, volte, prezzo).</li>
   <li><b>Excel</b> (.xlsx): se contiene righe con descrizione e prezzo le uso come una fattura; l'elenco fatture di Aziendaonweb ha solo i totali e non basta per i prezzi.</li>
   <li><b>PDF e foto</b> di bolle o fatture: l'app non li sa leggere in modo affidabile. Mandali a Claude in chat e aggiorna lui l'archivio.</li></ul>
   <div class="drop" id="drop">Trascina qui i file<br><br><label class="b p">Scegli file<input type="file" id="fileinp" multiple accept=".xml,.p7m,.zip,.docx,.xlsx" hidden></label></div>
  </div>${IMP?impView():''}`;
}
async function readFiles(files){
  IMP={righe:[],proposte:[],note:[]};
  for(const f of files){
    try{
      const buf=new Uint8Array(await f.arrayBuffer()); const n=f.name.toLowerCase();
      if(n.endsWith('.zip')){ const z=fflate.unzipSync(buf); for(const k in z){ const kl=k.toLowerCase(); if(kl.endsWith('.xml')||kl.endsWith('.p7m')) parseInvoice(z[k],k.split('/').pop()); } }
      else if(n.endsWith('.xml')||n.endsWith('.p7m')) parseInvoice(buf,f.name);
      else if(n.endsWith('.docx')) parseDocx(buf,f.name);
      else if(n.endsWith('.xlsx')) await parseXlsx(buf,f.name);
      else IMP.note.push(f.name+': formato non gestito (PDF e foto: mandali a Claude in chat).');
    }catch(e){ IMP.note.push(f.name+': non leggibile ('+e.message+')'); }
  }
  prepInvoice(); render();
}
/* --- FatturaPA --- */
function p7mToXml(u8){
  let s=''; for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
  if(/^\s*MI/.test(s)&&!/<\?xml|<\w*:?FatturaElettronica/.test(s)){ try{ return p7mToXml(unb64(s.replace(/\s/g,''))); }catch(e){} }
  const a=s.search(/<\?xml|<([A-Za-z0-9_]+:)?FatturaElettronica[\s>]/); const m=/<\/([A-Za-z0-9_]+:)?FatturaElettronica>/.exec(s);
  if(a<0||!m) throw new Error('XML non trovato nel file firmato');
  let x=s.slice(a,m.index+m[0].length);
  x=x.replace(/\x04\x82[\x00-\xff]{2}|\x04\x81[\x00-\xff]/g,''); // salti dei blocchi della firma
  const b=new Uint8Array(x.length); for(let i=0;i<x.length;i++) b[i]=x.charCodeAt(i);
  return new TextDecoder('utf-8').decode(b);
}
const kids=(el,name)=>[...el.getElementsByTagNameNS('*',name)];
const tx=(el,name)=>{ const e=el&&el.getElementsByTagNameNS('*',name)[0]; return e?e.textContent.trim():''; };
function parseInvoice(u8,name){
  let xml; const head=String.fromCharCode(...u8.slice(0,200));
  if(/\.p7m$/i.test(name)||!/<\?xml|<\w*:?FatturaElettronica/.test(head)) xml=p7mToXml(u8); else xml=new TextDecoder('utf-8').decode(u8);
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('XML non valido');
  const ced=kids(doc,'CedentePrestatore')[0]; if(!ced) throw new Error('non è una fattura elettronica');
  const forn=tx(ced,'Denominazione')||(tx(ced,'Nome')+' '+tx(ced,'Cognome')).trim();
  for(const body of kids(doc,'FatturaElettronicaBody')){
    const dg=kids(body,'DatiGeneraliDocumento')[0];
    const tipo=tx(dg,'TipoDocumento'), data=tx(dg,'Data'), numero=tx(dg,'Numero');
    if(tipo==='TD04'||tipo==='TD05'){ IMP.note.push(`${forn} n. ${numero} (${dIT(data)}): nota di credito/debito, ignorata per i prezzi.`); continue; }
    for(const l of kids(body,'DettaglioLinee')){
      const desc=tx(l,'Descrizione'); const q=num(tx(l,'Quantita')); const pu=num(tx(l,'PrezzoUnitario')); const pt=num(tx(l,'PrezzoTotale'));
      if(!desc||pt==null||pt<=0) continue;
      const netto=q&&q>0?pt/q:pt;
      IMP.righe.push({file:name,fornitore:forn,data,numero,voce:desc.replace(/\s+/g,' '),qta:q,um:tx(l,'UnitaMisura').toUpperCase(),pu,netto,iva:num(tx(l,'AliquotaIVA'))});
    }
  }
}
async function parseXlsx(u8,name){
  const ExcelJS=await loadExcelJS(); const wb=new ExcelJS.Workbook(); await wb.xlsx.load(u8.buffer);
  let found=0;
  wb.eachSheet(ws=>{ let h=null;
    ws.eachRow((row,ri)=>{ const v=row.values.map(x=>x&&typeof x==='object'&&'result' in x?x.result:x&&x.text?x.text:x);
      if(!h){ const lc=v.map(x=>norm(x)); const d=lc.findIndex(x=>/descrizione/.test(x)), p=lc.findIndex(x=>/prezzo unitario|prezzo/.test(x)); if(d>0&&p>0) h={d,p,q:lc.findIndex(x=>/quantit/.test(x)),f:lc.findIndex(x=>/fornitore|denominazione|cedente/.test(x)),dt:lc.findIndex(x=>/^data/.test(x)),n:lc.findIndex(x=>/numero/.test(x))}; return; }
      const desc=v[h.d]; const pu=num(v[h.p]); if(!desc||pu==null||pu<=0) return;
      const q=h.q>0?num(v[h.q]):null; const dt=h.dt>0?v[h.dt]:''; 
      IMP.righe.push({file:name,fornitore:h.f>0?String(v[h.f]||''):'',data:dt instanceof Date?dt.toISOString().slice(0,10):String(dt||'').slice(0,10),numero:h.n>0?String(v[h.n]||''):'',voce:String(desc).replace(/\s+/g,' '),qta:q,um:'',pu,netto:pu}); found++;
    }); });
  if(!found) IMP.note.push(name+': non ci sono righe con descrizione e prezzo (probabilmente è l\'elenco fatture con i soli totali). Per i prezzi servono gli XML.');
}
function guessFormato(voce,um){
  if(/^(KG|KGM|KILOGRAMMI|KILO)$/.test(um)) return {f:1,u:'kg'}; if(/^(LT|L|LITRI)$/.test(um)) return {f:1,u:'l'};
  const s=voce.toUpperCase().replace(',','.');
  let mult=1; const mm=/(\d+)\s*[X×]\s*\d/.exec(s); if(mm) mult=+mm[1];
  const m=/(\d+(?:\.\d+)?)\s*(KG|GR|G|LT|L|ML|CL)\b/.exec(s);
  if(!m) return null; let v=+m[1], u=m[2];
  if(u==='G'||u==='GR') return {f:v/1000*mult,u:'kg'}; if(u==='KG') return {f:v*mult,u:'kg'};
  if(u==='ML') return {f:v/1000*mult,u:'l'}; if(u==='CL') return {f:v/100*mult,u:'l'}; return {f:v*mult,u:'l'};
}
function suggest(voce,forn){
  const key=voce.toUpperCase();
  let m=S.mappaFatture.find(x=>x.voce.toUpperCase()===key&&(!forn||!x.fornitore||norm(forn).includes(norm(x.fornitore).split(' ')[0])));
  if(!m) m=S.mappaFatture.find(x=>x.voce.toUpperCase()===key);
  if(m&&getI(m.ing)&&!getI(m.ing).deleted) return {ing:m.ing,sure:true,formato:m.formato};
  const w=new Set(norm(voce).split(' ').filter(x=>x.length>2&&!/^\d/.test(x)));
  let best=null,bs=0;
  for(const i of ings()){ const iw=norm(i.nome).split(' ').filter(x=>x.length>2); if(!iw.length) continue; const hit=iw.filter(x=>w.has(x)||[...w].some(y=>y.startsWith(x.slice(0,5))&&x.length>4)).length; const sc=hit/iw.length; if(sc>bs){bs=sc;best=i;} }
  return bs>=0.99?{ing:best.id,sure:false}:bs>=0.5?{ing:best.id,sure:false,weak:true}:{ing:null};
}
function prepInvoice(){
  if(!IMP) return;
  IMP.righe.sort((a,b)=>String(b.data).localeCompare(String(a.data)));
  for(const r of IMP.righe){
    const s=suggest(r.voce,r.fornitore); r.ing=s.ing; r.sure=!!s.sure; r.weak=!!s.weak;
    const g=guessFormato(r.voce,r.um); r.formato=s.formato||(g?g.f:null);
    r.key=(r.fornitore+'|'+r.numero+'|'+r.voce).slice(0,200);
    r.on=!!r.ing&&!!r.formato;
    const i=r.ing&&getI(r.ing);
    if(i){ const last=lastPriceDate(i); if(last&&r.data&&r.data<last){ r.on=false; r.why='prezzo più vecchio di quello già registrato'; }
      if(/^farin/i.test(i.nome)&&!/sobrino/i.test(r.fornitore)){ r.on=false; r.why='farine: solo prezzi Mulino Sobrino'; } }
    if(S.importati.includes(r.key)){ r.on=false; r.why='già importata'; }
  }
  // stesso ingrediente più volte: tiene la riga più recente, a parità il formato più grande
  const byIng=new Map(); for(const r of IMP.righe.filter(r=>r.on)){ const o=byIng.get(r.ing); if(!o||r.data>o.data||(r.data===o.data&&(r.formato||0)>(o.formato||0))) byIng.set(r.ing,r); }
  for(const r of IMP.righe) if(r.on&&byIng.get(r.ing)!==r){ r.on=false; r.why='c\'è una riga più recente o un formato più grande'; }
}
function impView(){
  const R=IMP.righe; const sel=R.filter(r=>r.on).length; const opts=ings();
  const P=IMP.proposte;
  return `${IMP.note.length?`<div class="card">${IMP.note.map(n=>`<div class="warn small">${esc(n)}</div>`).join('')}</div>`:''}
  ${R.length?`<div class="card"><h2>Righe di fattura (${R.length})</h2>
   <p class="small">Controlla l'ingrediente e il <b>formato</b> (kg, litri o pezzi contenuti in UNA unità di fattura: es. "Aceto 250ML" = 0,25). Il prezzo è quello netto pagato (sconti già tolti), IVA esclusa. Le righe spuntate aggiornano il prezzo; l'abbinamento voce → ingrediente viene ricordato per le prossime fatture.</p>
   <div class="row" style="margin-bottom:8px"><button class="b p" data-act="applicafatt" ${sel?'':'disabled'}>Aggiorna ${sel} prezzi</button><button class="b" data-act="chiudiimp">Chiudi</button></div>
   <div class="scroll"><table class="t small"><tr><th></th><th>Data · fornitore</th><th>Voce in fattura</th><th class="n">Prezzo netto</th><th>Ingrediente</th><th class="n">Formato</th><th class="n">Nuovo €/unità</th><th class="n">Prima</th></tr>
   ${R.map((r,k)=>{ const i=r.ing&&getI(r.ing); const nu=r.formato?r.netto/r.formato:null; const old=i?unitCost(i):null; const v=nu&&old?nu/old-1:null; return `<tr>
    <td><input type="checkbox" data-imp="${k}" data-f="on" ${r.on?'checked':''}></td>
    <td>${esc(dIT(r.data))}<br><span class="mut">${esc(r.fornitore.slice(0,28))} n. ${esc(r.numero)}</span></td>
    <td>${esc(r.voce)}${r.qta?`<br><span class="mut">q.tà ${fmt(r.qta,2)} ${esc(r.um)}</span>`:''}${r.why?`<br><span class="chip g">${esc(r.why)}</span>`:''}</td>
    <td class="n">${eur3(r.netto)}</td>
    <td><select class="i" data-imp="${k}" data-f="ing"><option value="">— non è un ingrediente —</option>${opts.map(o=>`<option value="${o.id}" ${o.id===r.ing?'selected':''}>${esc(o.nome)}</option>`).join('')}</select>${r.ing&&!r.sure?`<span class="chip ${r.weak?'w':'g'}">${r.weak?'da controllare':'proposto'}</span>`:''}</td>
    <td class="n"><input class="i n" data-imp="${k}" data-f="formato" value="${fmt(r.formato,4)}" inputmode="decimal" style="width:80px"> ${i?esc(i.unita):''}</td>
    <td class="n"><b>${nu?eur3(nu):'–'}</b></td><td class="n">${old!=null?eur3(old):'–'}${v!=null?`<br><span class="chip ${v>0.05?'r':v<-0.05?'ok':'g'}">${v>0?'+':''}${pct(v)}</span>`:''}</td></tr>`}).join('')}
   </table></div></div>`:''}
  ${P.length?propView():''}`;
}
function applyInvoice(){
  let n=0;
  for(const r of IMP.righe.filter(r=>r.on&&r.ing&&r.formato)){
    const i=getI(r.ing); if(!i) continue;
    const prima=unitCost(i), nu=r.netto/r.formato;
    const fs=r.fornitore.split(/\s+/).slice(0,2).join(' ');
    i.storico=(i.storico||[]).concat([{data:r.data,prezzoUnit:nu,prima,fornitore:fs,fattura:r.numero,voce:r.voce}]).slice(-60);
    i.prezzo=r.netto; i.formato=r.formato; i.fornitore=fs;
    i.note=`Fattura ${dIT(r.data)} ${fs} n. ${r.numero}: ${r.voce} (conf. ${fmt(r.formato,3)} ${i.unita}). Ultimo prezzo pagato, IVA esclusa.${prima!=null?' Prima: '+eur3(prima)+'/'+i.unita+'.':''}`;
    touch(i);
    const mk=r.voce.toUpperCase(); const ex=S.mappaFatture.find(m=>m.voce.toUpperCase()===mk&&m.fornitore===fs);
    if(ex){ ex.ing=r.ing; ex.formato=r.formato; touch(ex); } else S.mappaFatture.push({voce:r.voce,fornitore:fs,ing:r.ing,formato:r.formato,updatedAt:now()});
    S.importati.push(r.key); n++;
  }
  // ricorda anche gli abbinamenti scelti a mano sulle righe non applicate
  commit(); IMP.righe=IMP.righe.filter(r=>!S.importati.includes(r.key)); prepInvoice(); render(); toast(n+' prezzi aggiornati: le ricette sono già ricalcolate');
}
/* --- PROPOSTE della GASTRONOMIA (.docx) --- */
const MESI=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
function parseDocx(u8,name){
  const z=fflate.unzipSync(u8,{filter:f=>f.name==='word/document.xml'}); const x=z['word/document.xml']; if(!x) throw new Error('documento Word non valido');
  const doc=new DOMParser().parseFromString(new TextDecoder().decode(x),'application/xml');
  const paras=[...doc.getElementsByTagNameNS('*','p')].map(p=>[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join('').trim()).filter(Boolean);
  // data: dal titolo o dal nome del file
  const src=(paras.slice(0,4).join(' ')+' '+name).toLowerCase();
  let data=''; const mm=new RegExp('(\\d{1,2})\\D{0,25}?(?:(?:e|-|–)\\s*\\D{0,12}?(\\d{1,2})\\s*)?('+MESI.join('|')+')').exec(src);
  if(mm){ const mo=MESI.indexOf(mm[3]); const d=+(mm[2]||mm[1]); const n=new Date(); let y=n.getFullYear(); if(mo>n.getMonth()+1) y--; data=`${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
  let tipo='salato', sempre=false; const piatti=[];
  for(const p of paras){
    const u=p.toUpperCase();
    if(/^DOLCI\b/.test(u)){ tipo='dolce'; continue; }
    if(/SEMPRE PRESENTI/.test(u)){ sempre=true; continue; }
    const m=/^(.+?)\s*[–—-]\s*€\s*([\d]+(?:[.,]\d+)?)\s*\/?\s*(etto|pz|pezzo|kg|porzione|vasetto)?/i.exec(p);
    if(!m) continue;
    piatti.push({nome:m[1].trim().replace(/\s+/g,' '),prezzo:num(m[2]),unita:'€/'+((m[3]||'pz').toLowerCase().replace('pezzo','pz')),tipo,sempre});
  }
  if(!piatti.length) { IMP.note.push(name+': nessun piatto riconosciuto (righe "Nome – € 2,50/etto").'); return; }
  IMP.proposte.push({file:name,data,piatti,on:!S.importati.includes('doc:'+name)&&!!data});
}
function findArch(nome,tipo){ const k=norm(nome); return S.archivio.find(a=>!a.deleted&&norm(a.nome)===k)||null; }
function propView(){
  return `<div class="card"><h2>Proposte della gastronomia</h2><p class="small">Per ogni documento: i piatti già in archivio prendono questa data come "ultima volta" (+1 volta) e il nuovo prezzo; quelli nuovi vengono aggiunti. I piatti "sempre presenti" aggiornano solo il prezzo.</p>
  ${IMP.proposte.map((d,k)=>`<div style="border-top:1px solid var(--b);padding-top:8px;margin-top:8px"><label class="row"><input type="checkbox" data-prop="${k}" ${d.on?'checked':''}> <b>${esc(d.file)}</b> — data: <input class="i" type="date" data-propdate="${k}" value="${esc(d.data)}" style="width:auto">${S.importati.includes('doc:'+d.file)?'<span class="chip g">già importato</span>':''}</label>
   <table class="t small">${d.piatti.map(p=>{ const a=findArch(p.nome,p.tipo); return `<tr><td>${esc(p.nome)}</td><td>${p.tipo}${p.sempre?' · sempre presente':''}</td><td class="n">${esc(banco({prezzoBanco:p.prezzo,unitaBanco:p.unita}))}</td><td>${a?'<span class="chip ok">in archivio</span>':'<span class="chip w">nuovo</span>'}</td></tr>`}).join('')}</table></div>`).join('')}
   <div class="row" style="margin-top:10px"><button class="b p" data-act="applicaprop">Aggiorna l'archivio</button></div></div>`;
}
function applyProposte(){
  let n=0,nw=0;
  for(const d of IMP.proposte.filter(d=>d.on&&d.data)){
    const st=STAG[new Date(d.data).getMonth()], mese=MESI[new Date(d.data).getMonth()].slice(0,3);
    for(const p of d.piatti){
      let a=findArch(p.nome,p.tipo);
      if(!a){ a={id:uid('a-'),nome:p.nome,tipo:p.tipo,categoria:'',stagioni:[],mesi:'',ultimoPrezzo:null,unita:'',volte:0,prima:d.data,ultima:'',materiaPrima:'',ricetta:'',updatedAt:0,deleted:false}; S.archivio.push(a); nw++; }
      a.ultimoPrezzo=p.prezzo; a.unita=p.unita;
      if(!p.sempre&&(!a.ultima||d.data>a.ultima)){ a.ultima=d.data; a.volte=(a.volte||0)+1; if(!a.stagioni.includes(st)) a.stagioni.push(st); if(!a.mesi.includes(mese)) a.mesi=(a.mesi?a.mesi+', ':'')+mese; if(!a.prima||d.data<a.prima) a.prima=d.data; }
      // prezzo al banco della ricetta con lo stesso nome
      const r=ricette().find(r=>norm(r.nome)===norm(p.nome)); if(r&&p.prezzo!=null){ r.prezzoBanco=p.prezzo; r.unitaBanco=p.unita; touch(r); }
      touch(a); n++;
    }
    S.importati.push('doc:'+d.file);
  }
  commit(); IMP.proposte=[]; render(); toast(`Archivio aggiornato: ${n} piatti, ${nw} nuovi`);
}

/* ===================== ETICHETTE (archivio separato) ===================== */
async function etiWrite(r){
  const c=calc(r);
  const ord=c.righe.filter(z=>z.x.nome).sort((a,b)=>((b.x.dose||0)*((b.i&&b.i.unita==='pz')?(b.i.pesoPezzo||0):1))-((a.x.dose||0)*((a.i&&a.i.unita==='pz')?(a.i.pesoPezzo||0):1))).map(z=>z.x.nome.toLowerCase());
  let txt=ord.join(', '); txt=txt.charAt(0).toUpperCase()+txt.slice(1)+'.';
  const ex=r.etichetta?ETI.prodotti.find(p=>p.id===r.etichetta):null;
  dialog(ex?'Aggiorna etichetta':'Nuova etichetta',`<p class="small">Testo ingredienti in ordine di peso decrescente, preso dalla ricetta. <b>Completalo</b> con i sotto-ingredienti dei prodotti composti (es. "salsa di soia (acqua, soia, sale)"): in etichetta sono obbligatori. Gli allergeni li evidenzia l'app etichette.</p>
   <label class="f">Nome in etichetta<input class="i" id="e_nome" value="${esc(ex?ex.nome:r.nome)}"></label>
   <label class="f">Ingredienti<textarea class="i" id="e_ing">${esc(ex?ex.ingredienti:txt)}</textarea></label>
   ${ex?`<p class="small mut">Testo attuale in etichetta: ${esc(ex.ingredienti)}</p><button class="b sm" data-act="etiord">Sostituisci con l'ordine per peso della ricetta</button>`:''}
   <p class="small mut">Viene scritto nell'archivio dell'app etichette: tutti i PC lo vedono entro 20 secondi.</p>`,[['Annulla','dlgclose'],[ex?'Salva nell\'etichetta':'Crea etichetta','etisave','p']]);
  etiWrite.txt=txt;
}
async function etiSave(r){
  const nome=$('#e_nome').value.trim(), ing=$('#e_ing').value.trim(); if(!nome||!ing) return alert('Nome e ingredienti servono.');
  const repo=CFG.etiRepo||ETI_REPO;
  for(let k=0;k<4;k++){
    const {data,sha}=await ghReadJSON(repo,'archivio.json'); if(!data) return alert('Archivio etichette vuoto o non raggiungibile.');
    let p=r.etichetta?data.prodotti.find(x=>x.id===r.etichetta):null;
    const t=now();
    if(p){ p.nome=nome; p.ingredienti=ing; p.updatedAt=Math.max(t,(p.updatedAt||0)+1); p.updatedBy='App Cucina'; }
    else { const id='cuc'+t.toString(36); p={id,updatedAt:t,updatedBy:'App Cucina',nome,sottotitolo:'',ingredienti:ing,tracce:[],tracceExtra:'',conservazione:'cs1',diciture:'',tipoData:'scadenza',giorni:4,prezzoKg:'',prezzoPezzo:'',tipoPrezzo:'kg',pezzature:[],mostraPrezzo:false,deleted:false,linea:'standard',categoria:'',fraseFronte:''}; data.prodotti.push(p); r.etichetta=id; touch(r); commit(); }
    const w=await ghWriteJSON(repo,'archivio.json',data,sha,'Etichette: '+nome+' da app Cucina');
    if(w.ok){ ETI=data; closeDlg(); render(); toast('Etichetta salvata: controllala nell\'app etichette (conservazione, giorni, tracce)'); return; }
    if(w.status!==409&&w.status!==422) return alert('Non salvata: '+ghErr(w));
  }
  alert('Non salvata: troppi salvataggi contemporanei, riprova.');
}

/* ===================== STAMPA ===================== */
function printHTML(html){ $('#print').innerHTML=html; window.print(); }
const pHead=t=>`<div class="head"><b>La Magiostra · Cucina</b><span>${esc(t)} · ${new Date().toLocaleDateString('it-IT')}</span></div>`;
function stampa(tipo){
  if(tipo==='cucina'||tipo==='fc'){
    const r=getR(SEL); if(!r) return; const c=calc(r,{molt:MOLT.m,kgVoluti:MOLT.kg});
    let h=pHead(tipo==='cucina'?'Scheda di produzione':'Food cost')+`<h1>${esc(r.nome)}</h1><p>${esc(r.categoria)}${r.unita?' · '+esc(r.unita):''}${c.molt!==1?' · <b>dosi × '+fmt(c.molt,3)+'</b>':''}</p>`;
    h+=`<table><tr><th>Ingrediente</th><th class="n">Quantità</th>${tipo==='fc'?'<th class="n">€/unità</th><th class="n">Costo 1 dose</th>':''}</tr>${c.righe.filter(z=>z.x.nome).map(({x,i,u,costo})=>{ const un=i?i.unita:''; const q=x.dose!=null?x.dose*c.molt:null; return `<tr><td>${esc(x.nome)}</td><td class="n"><b>${q!=null?(un==='pz'?fmt(q,1)+' pz':fmt(q*1000,0)+(un==='l'?' ml':' g')):esc(x.doseTesto||'q.b.')}</b></td>${tipo==='fc'?`<td class="n">${u!=null?eur3(u):'manca'}</td><td class="n">${costo!=null?eur(costo):''}</td>`:''}</tr>`}).join('')}
    <tr><td><b>Totale impasto crudo</b></td><td class="n"><b>${fmt(c.peso*c.molt)} kg</b></td>${tipo==='fc'?`<td></td><td class="n"><b>${eur(c.costo)}</b></td>`:''}</tr></table>`;
    if(r.procedimento) h+=`<h2>Procedimento</h2><div style="white-space:pre-wrap">${esc(r.procedimento)}</div>`;
    if(tipo==='fc') h+=`<h2>Food cost — lotto ${fmt(r.lotto)||'–'} dosi</h2><table>
      <tr><td>Peso finale del lotto</td><td class="n">${fmt(c.fin)} kg</td></tr><tr><td>Ingredienti</td><td class="n">${eur(c.cIng)}</td></tr><tr><td>Manodopera (${fmt(r.tProd)||0} min)</td><td class="n">${eur(c.man)}</td></tr>
      <tr><td>Energia (${fmt(r.tCott)||0} min)</td><td class="n">${eur(c.en)}</td></tr><tr><td>Affitto e costi fissi</td><td class="n">${eur(c.aff)}</td></tr><tr><td><b>Costo totale lotto</b></td><td class="n"><b>${eur(c.tot)}</b></td></tr>
      <tr><td><b>Costo di produzione</b></td><td class="n"><b>${eur(c.ckg)}/kg</b></td></tr><tr><td>Prezzo teorico (ricarico ${pct(c.ric)} + IVA)</td><td class="n">${eur(c.pkg)}/kg</td></tr>
      <tr><td>Confezione ${fmt(r.confezione,0)||'–'} g: prezzo / margine</td><td class="n">${eur(c.pconf)} / ${eur(c.marg)}</td></tr><tr><td>Prezzo al banco · ricarico reale</td><td class="n">${esc(banco(r))} · ${pct(c.ricReale)}</td></tr></table>`;
    return printHTML(h);
  }
  if(tipo==='listino'){
    const I=ings(); return printHTML(pHead('Ingredienti e prezzi d\'acquisto')+`<h1>Ingredienti e prezzi d'acquisto</h1><table><tr><th>Ingrediente</th><th>Fornitore</th><th class="n">Prezzo</th><th class="n">Formato</th><th class="n">€/unità</th><th>Ultimo prezzo</th></tr>${I.map(i=>`<tr><td>${esc(i.nome)}</td><td>${esc(i.fornitore)}</td><td class="n">${eur(i.prezzo)}</td><td class="n">${fmt(i.formato)} ${esc(i.unita)}</td><td class="n">${unitCost(i)!=null?eur3(unitCost(i)):'–'}</td><td>${esc(dIT(lastPriceDate(i)))}</td></tr>`).join('')}</table>`);
  }
  if(tipo==='archivio'){
    const A=S.archivio.filter(a=>!a.deleted).sort((a,b)=>a.nome.localeCompare(b.nome,'it'));
    return printHTML(pHead('Archivio piatti')+`<h1>Archivio piatti</h1><table><tr><th>Piatto</th><th>Tipo</th><th>Stagioni</th><th class="n">Prezzo</th><th class="n">Volte</th><th>Ultima</th></tr>${A.map(a=>`<tr><td>${esc(a.nome)}</td><td>${a.tipo}</td><td>${a.stagioni.join(', ')}</td><td class="n">${a.ultimoPrezzo!=null?eur(a.ultimoPrezzo)+' '+esc(a.unita):''}</td><td class="n">${a.volte||''}</td><td>${esc(dIT(a.ultima))}</td></tr>`).join('')}</table>`);
  }
  if(tipo==='quadro'){
    const C=ricette().map(r=>[r,calc(r)]);
    return printHTML(pHead('Quadro food cost')+`<h1>Quadro food cost</h1><table><tr><th>Prodotto</th><th>Stato</th><th class="n">Costo €/kg</th><th class="n">Prezzo teorico €/kg</th><th class="n">Banco</th><th class="n">Ricarico reale</th></tr>${C.map(([r,c])=>`<tr><td>${esc(r.nome)}</td><td>${esc(c.stato)}</td><td class="n">${eur(c.ckg)}</td><td class="n">${eur(c.pkg)}</td><td class="n">${r.prezzoBanco!=null?esc(banco(r)):''}</td><td class="n">${pct(c.ricReale)}</td></tr>`).join('')}</table>`);
  }
}

/* ===================== AZIONI ===================== */
function newRecipe(){ return {id:uid('r-'),nome:'',foglio:'',categoria:'',unita:'',allergeni:'',note:'',righe:[{ing:null,nome:'',dose:null,doseTesto:'',flag:''}],procedimento:'',lotto:1,tProd:null,tCott:null,perdita:null,ricarico:null,confezione:null,packaging:'',pezziPack:null,prezzoBanco:null,unitaBanco:'',etichetta:'',inProdotti:true,updatedAt:0,deleted:false,_new:true}; }
function readEdit(){
  const r=EDIT; if(!r) return;
  document.querySelectorAll('[data-e]').forEach(e=>r[e.dataset.e]=e.value);
  document.querySelectorAll('[data-n]').forEach(e=>r[e.dataset.n]=num(e.value));
  document.querySelectorAll('[data-p]').forEach(e=>{ const v=num(e.value); r[e.dataset.p]=v==null?null:v/100; });
  document.querySelectorAll('[data-row]').forEach(e=>{ const x=r.righe[+e.dataset.row]; if(!x) return; if(e.dataset.f==='nome'){ x.nome=e.value.trim(); const i=INAME.get(x.nome.toLowerCase()); x.ing=i?i.id:null; } else { const v=num(e.value); x.dose=v; x.doseTesto=v==null?e.value.trim():''; } });
}
function saveRecipe(){
  readEdit(); const r=EDIT; r.nome=r.nome.trim(); if(!r.nome) return alert('Scrivi il nome della ricetta.');
  if(ricette().some(x=>x.id!==r.id&&x.nome.toLowerCase()===r.nome.toLowerCase())) return alert('Esiste già una ricetta con questo nome.');
  const miss=r.righe.filter(x=>x.nome&&!x.ing).map(x=>x.nome);
  if(miss.length&&!confirm('Questi ingredienti non sono nell\'elenco e non avranno un costo:\n'+miss.join(', ')+'\n\nSalvo lo stesso?')) return;
  r.righe=r.righe.filter(x=>x.nome||x.dose!=null);
  const isNew=r._new; delete r._new; touch(r);
  if(isNew) S.ricette.push(r); else { const k=S.ricette.findIndex(x=>x.id===r.id); S.ricette[k]=r; }
  EDIT=null; SEL=r.id; commit(); render(); toast('Ricetta salvata');
}
async function pwDialog(){
  dialog('Cambia password',`<label class="f">Password attuale<input class="i" type="password" id="pwo" autocomplete="current-password"></label><label class="f">Nuova password (almeno 10 caratteri)<input class="i" type="password" id="pwn1" autocomplete="new-password"></label><label class="f">Ripeti la nuova<input class="i" type="password" id="pwn2" autocomplete="new-password"></label><div id="pwmsg"></div>`,[['Annulla','dlgclose'],['Cambia','pwsave','p']]);
}
async function pwSave(){
  const m=t=>$('#pwmsg').innerHTML=`<div class="err small">${esc(t)}</div>`;
  const v=await kvGet('vault'); try{ await unseal(await deriveKey($('#pwo').value,unb64(v.salt),v.iter),v.box); }catch(e){ return m('Password attuale sbagliata.'); }
  const p1=$('#pwn1').value; if(p1.length<10) return m('Almeno 10 caratteri.'); if(p1!==$('#pwn2').value) return m('Le due password non coincidono.');
  const salt=crypto.getRandomValues(new Uint8Array(16)); KEY=await deriveKey(p1,salt,PBKDF2_ITER);
  await kvSet('vault',{v:1,salt:b64(salt),iter:PBKDF2_ITER,box:await seal(KEY,CFG)}); await saveLocal(); closeDlg();
  alert('Password cambiata su questo computer. Sugli altri computer va cambiata anche lì (ognuno ha la sua copia cifrata).');
}

document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-tab],[data-act],[data-ric],[data-ing],[data-filt],[data-go]'); if(!t) return;
  if(t.dataset.tab){ TAB=t.dataset.tab; Q=''; EDIT=null; IMP=TAB==='fatture'?IMP:IMP; render(); scrollTo(0,0); return; }
  if(t.dataset.go!==undefined){ const [tab,f]=t.dataset.go.split(':'); TAB=tab; Q=''; FILT[tab==='ricette'?'ric':'ing']=f||''; render(); scrollTo(0,0); return; }
  if(t.dataset.filt!==undefined){ const [k,...v]=t.dataset.filt.split(':'); FILT[k]=v.join(':'); render(); return; }
  if(t.dataset.ric&&!t.dataset.act){ if(EDIT&&!confirm('Esci dalla modifica senza salvare?')) return; EDIT=null; TAB='ricette'; SEL=t.dataset.ric; MOLT={m:1,kg:null}; render(); if(innerWidth<860) document.querySelector('.split>div:last-child')?.scrollIntoView({behavior:'smooth'}); return; }
  if(t.dataset.ing&&!t.dataset.act){ ingDialog(t.dataset.ing); return; }
  const [a,arg]=(t.dataset.act||'').split(/:(.*)/);
  switch(a){
    case 'setup': return doSetup();
    case 'unlock': return doUnlock();
    case 'reset': e.preventDefault(); return doReset();
    case 'blocca': return lockNow();
    case 'cambiapw': return pwDialog();
    case 'pwsave': return pwSave();
    case 'aggiorna': if('serviceWorker' in navigator){ const rg=await navigator.serviceWorker.getRegistration(); if(rg) await rg.update(); } location.reload(); return;
    case 'dlgclose': return closeDlg();
    case 'nuovaric': EDIT=newRecipe(); SEL=EDIT.id; TAB='ricette'; return render();
    case 'modric': EDIT=JSON.parse(JSON.stringify(getR(SEL))); return render();
    case 'annullaric': EDIT=null; if(!getR(SEL)) SEL=null; return render();
    case 'salvaric': return saveRecipe();
    case 'addriga': readEdit(); EDIT.righe.push({ing:null,nome:'',dose:null,doseTesto:'',flag:''}); render(); { const ins=document.querySelectorAll('[data-f="nome"]'); ins[ins.length-1]?.focus(); } return;
    case 'delriga': readEdit(); EDIT.righe.splice(+arg,1); return render();
    case 'duplica': { const r=JSON.parse(JSON.stringify(getR(SEL))); r.id=uid('r-'); r.nome=r.nome+' (copia)'; r.foglio=''; r.etichetta=''; r._new=true; EDIT=r; SEL=r.id; return render(); }
    case 'eliminaric': { const r=getR(SEL); if(!confirm('Eliminare "'+r.nome+'"? Resta nello storico dell\'archivio online.')) return; r.deleted=true; touch(r); SEL=null; commit(); return render(); }
    case 'stampa': return stampa(arg);
    case 'nuovoing': return ingDialog(null);
    case 'ingsave': return ingSave(arg||null);
    case 'ingdel': { const i=getI(arg); if(!confirm('Eliminare "'+i.nome+'"?')) return; i.deleted=true; touch(i); closeDlg(); commit(); return render(); }
    case 'salvapar': { const P=S.parametri; document.querySelectorAll('[data-par]').forEach(x=>{ const v=num(x.value); if(v!=null) P[x.dataset.par]=v; }); touch(P); commit(); render(); return toast('Parametri salvati: tutti i food cost sono ricalcolati'); }
    case 'pkadd': S.packaging.push({id:uid('p-'),nome:'Nuovo packaging',fornitore:'',prezzo:null,pezzi:1,updatedAt:now(),deleted:false}); commit(); return render();
    case 'pksave': document.querySelectorAll('[data-pk]').forEach(x=>{ const p=S.packaging.find(p=>p.id===x.dataset.pk); if(!p) return; const f=x.dataset.f; const v=f==='prezzo'||f==='pezzi'?num(x.value):x.value; if(p[f]!==v){ p[f]=v; touch(p); } }); commit(); render(); return toast('Packaging salvato');
    case 'pkdel': { const p=S.packaging.find(p=>p.id===arg); if(S.ricette.some(r=>!r.deleted&&r.packaging===arg)) return alert('Questo packaging è usato da qualche ricetta.'); p.deleted=true; touch(p); commit(); return render(); }
    case 'dirpick': return dirPick();
    case 'dirperm': return dirPerm();
    case 'scrivifile': toast('Scrivo i file…'); await writeFiles(); return toast(filesErr||'File aggiornati nella cartella');
    case 'scaricaxls': toast('Preparo l\'Excel…'); return download(XLS_NAME,new Blob([await buildXlsx()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    case 'scaricajson': return download('cucina-backup-'+new Date().toISOString().slice(0,10)+'.json',new Blob([JSON.stringify(S,null,1)],{type:'application/json'}));
    case 'applicafatt': return applyInvoice();
    case 'applicaprop': return applyProposte();
    case 'chiudiimp': IMP=null; return render();
    case 'etinuova': return etiWrite(getR(SEL));
    case 'etiord': $('#e_ing').value=etiWrite.txt; return;
    case 'etisave': return etiSave(getR(SEL));
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='fileinp'&&t.files.length) return readFiles([...t.files]);
  if(t.dataset.filtsel){ FILT[t.dataset.filtsel]=t.value; return render(); }
  if(t.id==='etisel'){ const r=getR(SEL); r.etichetta=t.value; touch(r); commit(); return render(); }
  if(t.dataset.imp!==undefined){ const r=IMP.righe[+t.dataset.imp]; const f=t.dataset.f;
    if(f==='on') r.on=t.checked; else if(f==='ing'){ r.ing=t.value||null; r.sure=true; r.why=''; r.on=!!r.ing&&!!r.formato; } else if(f==='formato'){ r.formato=num(t.value); r.on=!!r.ing&&!!r.formato; }
    return render(); }
  if(t.dataset.prop!==undefined){ IMP.proposte[+t.dataset.prop].on=t.checked; return; }
  if(t.dataset.propdate!==undefined){ IMP.proposte[+t.dataset.propdate].data=t.value; return; }
  if(t.id==='molt'||t.id==='kgv'){ const m=num($('#molt').value), kg=num($('#kgv').value); MOLT=t.id==='kgv'?{m:1,kg:kg>0?kg:null}:{m:m>0?m:1,kg:null}; return render(); }
});
document.addEventListener('input',e=>{ if(e.target.id==='q'){ Q=e.target.value; render.focusQ=true; clearTimeout(render.qt); render.qt=setTimeout(render,180); } });
document.addEventListener('keydown',e=>{ if(e.key==='Enter'){ if(e.target.id==='pw') doUnlock(); if(e.target.id==='nome'&&$('#pw1')) doSetup(); } });
document.addEventListener('dragover',e=>{ const d=$('#drop'); if(d){ e.preventDefault(); d.classList.add('on'); } });
document.addEventListener('dragleave',e=>{ const d=$('#drop'); if(d&&e.target===d) d.classList.remove('on'); });
document.addEventListener('drop',e=>{ const d=$('#drop'); if(!d) return; e.preventDefault(); d.classList.remove('on'); if(e.dataTransfer.files.length) readFiles([...e.dataTransfer.files]); });
addEventListener('beforeunload',e=>{ if(EDIT){ e.preventDefault(); e.returnValue=''; } });

/* ===================== AVVIO ===================== */
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
showLock();
