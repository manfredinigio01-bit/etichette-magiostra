/* ================== ARCHIVIO CONDIVISO ================== */
function merge(a,b){
  const out={version:1,settings:(b.settings&&(b.settings.updatedAt||0)>=(a.settings?.updatedAt||0))?b.settings:a.settings /* a parità vince l'archivio (b) */,prodotti:[]};
  const m=new Map(); [...(a.prodotti||[]),...(b.prodotti||[])].forEach(p=>{ const o=m.get(p.id);
    if(!o){ m.set(p.id,p); return; }
    const w=(p.updatedAt||0)>(o.updatedAt||0)?p:o, l=w===p?o:p;
    // il testo ingredienti segue chi l'ha cambiato per ultimo (ingAt): così un PC rimasto indietro che cambia il prezzo non riporta il testo vecchio scritto dalla Cucina
    m.set(p.id,(l.ingAt||0)>(w.ingAt||0)?{...w,ingredienti:l.ingredienti,fonte:l.fonte,ricetta:l.ricetta,ingAt:l.ingAt}:w); });
  out.prodotti=[...m.values()]; return normalize(out);
}
function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open(PFX+'mag_etichette',1); r.onupgradeneeded=()=>r.result.createObjectStore('kv'); r.onsuccess=()=>res(r.result); r.onerror=rej; }); }
async function kvSet(k,v){ const d=await idb(); return new Promise(r=>{ const t=d.transaction('kv','readwrite'); t.objectStore('kv').put(v,k); t.oncomplete=r; }); }
async function kvGet(k){ const d=await idb(); return new Promise(r=>{ const q=d.transaction('kv').objectStore('kv').get(k); q.onsuccess=()=>r(q.result); q.onerror=()=>r(null); }); }
async function connectFile(create){
  try{
    const opts={types:[{description:'Archivio etichette',accept:{'application/json':['.json']}}]};
    fileHandle = create ? await showSaveFilePicker({...opts,suggestedName:'archivio-etichette-magiostra.json'}) : (await showOpenFilePicker(opts))[0];
    await kvSet('handle',fileHandle);
    if(create){ const w=await fileHandle.createWritable(); await w.write(JSON.stringify(S)); await w.close(); }
    await syncNow(true); render();
  }catch(e){ if(e.name!=='AbortError') alert('Impossibile collegare il file: '+e.message); }
}
async function disconnectFile(){ fileHandle=null; await kvSet('handle',null); setStatus('Archivio: solo su questo computer'); render(); }
async function reconnectFile(){ if(!fileHandle) return; const p=await fileHandle.requestPermission({mode:'readwrite'}); if(p==='granted'){ document.getElementById('reconnect').classList.add('hidden'); await syncNow(true); } }
function setStatus(t,err){ const s=document.getElementById('syncStatus'); s.textContent=t; s.classList.toggle('err',!!err); }
let syncing=false;
async function syncNow(force){
  if(GHCFG) return syncGH(); // archivio online configurato: mai il vecchio metodo file, anche se bloccato
  if(PROVA||!fileHandle||syncing) return; syncing=true;
  try{
    const perm=await fileHandle.queryPermission({mode:'readwrite'});
    if(perm!=='granted'){ document.getElementById('reconnect').classList.remove('hidden'); setStatus('Archivio condiviso: da ricollegare',true); return; }
    const file=await fileHandle.getFile(); const txt=await file.text();
    let remote=null; try{ remote=txt.trim()?JSON.parse(txt):null; }catch(e){ setStatus('Archivio illeggibile (forse in sincronizzazione), riprovo…',true); return; }
    const before=JSON.stringify(S);
    const merged = remote ? merge(S,remote) : S;
    const mStr=JSON.stringify(merged);
    if(!remote || mStr!==JSON.stringify(remote)){ const w=await fileHandle.createWritable(); await w.write(mStr); await w.close(); }
    if(mStr!==before){ S=merged; saveLocal(); if(!EDIT) render(); }
    lastSync=new Date(); setStatus('Archivio condiviso: '+fileHandle.name+' · aggiornato '+lastSync.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}));
  }catch(e){ setStatus('Errore archivio: '+e.message,true); }
  finally{ syncing=false; }
}

