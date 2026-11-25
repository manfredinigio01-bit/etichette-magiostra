/* ================== ARCHIVIO ONLINE (GitHub privato) ================== */
// I dati stanno in un file JSON in un repository GitHub PRIVATO. Ogni salvataggio è un commit: c'è lo storico completo.
// La chiave (token "fine-grained" con solo Contents lettura/scrittura su quel repository) resta in questo browser,
// CIFRATA con una password scelta sulla postazione (v0.7.0): AES-GCM 256, chiave PBKDF2-SHA256 600.000 passaggi,
// stesso schema dell'app Cucina. In localStorage.mag_gh: {v:2, repo, iter, salt, iv, ct} (repo in chiaro, non è segreto).
// La chiave decifrata vive solo in memoria (GH) finché l'app resta aperta. Senza sblocco si stampa e si modifica lo stesso:
// le modifiche restano su questo computer e partono allo sblocco (unione per updatedAt, niente si perde).
// Vecchio formato {repo, token} in chiaro (fino a v0.6.1): continua a funzionare, con avviso, finché non si sceglie una password.
const GH_API='https://api.github.com', GH_FILE='archivio.json';
const GH_REPO_OK=/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const GH_TOKEN_OK=/^[A-Za-z0-9_]{20,255}$/;
const GH_ITER=600000, GH_PW_MIN=8;
const B64_OK=/^[A-Za-z0-9+/]+={0,2}$/;
let GHCFG=null; // configurazione salvata (cifrata o vecchia in chiaro)
let GH=null;    // {repo, token} in memoria quando la chiave è disponibile
try{ GHCFG=JSON.parse(localStorage.getItem(PFX+'mag_gh')||'null'); }catch(e){ GHCFG=null; }
if(GHCFG&&(typeof GHCFG!=='object'||!GH_REPO_OK.test(String(GHCFG.repo||'')))) GHCFG=null;
if(GHCFG&&GHCFG.v===2){
  if(!(Number.isInteger(GHCFG.iter)&&GHCFG.iter>=100000&&GHCFG.iter<=10000000&&[GHCFG.salt,GHCFG.iv,GHCFG.ct].every(x=>typeof x==='string'&&B64_OK.test(x)))) GHCFG=null;
}else if(GHCFG){
  if(typeof GHCFG.token==='string'&&GH_TOKEN_OK.test(GHCFG.token)) GH={repo:GHCFG.repo,token:GHCFG.token}; else GHCFG=null;
}
let ghSyncing=false, ghPending=false;
const ghOn=()=>!!GHCFG;
const ghLegacy=()=>!!(GHCFG&&GHCFG.v!==2);
const ghLocked=()=>!!(GHCFG&&!GH);
const TE=new TextEncoder(), TD=new TextDecoder();
function u8b64(u8){ let s=''; for(let i=0;i<u8.length;i+=0x8000) s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000)); return btoa(s); }
function b64u8(s){ const b=atob(s); const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }
async function ghKey(pw,salt,iter){
  const base=await crypto.subtle.importKey('raw',TE.encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function ghSeal(repo,token,pw){
  const salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await ghKey(pw,salt,GH_ITER);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,TE.encode(JSON.stringify({token})));
  return {v:2,repo,iter:GH_ITER,salt:u8b64(salt),iv:u8b64(iv),ct:u8b64(new Uint8Array(ct))};
}
async function ghOpen(cfg,pw){ // errore se la password è sbagliata (AES-GCM verifica l'integrità)
  const key=await ghKey(pw,b64u8(cfg.salt),cfg.iter);
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64u8(cfg.iv)},key,b64u8(cfg.ct));
  const o=JSON.parse(TD.decode(pt));
  if(!o||typeof o.token!=='string'||!GH_TOKEN_OK.test(o.token)) throw new Error('contenuto non valido');
  return o.token;
}
function ghPwCheck(a,b){
  if(a.length<GH_PW_MIN) return 'La password deve avere almeno '+GH_PW_MIN+' caratteri.';
  if(a!==b) return 'Le due password non coincidono.';
  return '';
}
// Tentativi sbagliati: dopo 3 errori attesa crescente (5 s, 10 s, 20 s… fino a 5 minuti)
function ghWait(){ const n=+(localStorage.getItem(PFX+'mag_gh_fail')||0), t=+(localStorage.getItem(PFX+'mag_gh_failt')||0); if(n<3) return 0; const ms=Math.min(300000,5000*2**(n-3)); return Math.max(0,t+ms-Date.now()); }
function ghFail(){ localStorage.setItem(PFX+'mag_gh_fail',String(+(localStorage.getItem(PFX+'mag_gh_fail')||0)+1)); localStorage.setItem(PFX+'mag_gh_failt',String(Date.now())); }
function ghOk(){ localStorage.removeItem(PFX+'mag_gh_fail'); localStorage.removeItem(PFX+'mag_gh_failt'); }
let ghBusy=false;
async function ghUnlock(inputId){
  if(ghBusy||!ghLocked()) return; const el=document.getElementById(inputId); if(!el) return;
  const w=ghWait(); if(w>0) return alert('Troppe password sbagliate. Riprova tra '+Math.ceil(w/1000)+' secondi.');
  const pw=el.value; if(!pw) return el.focus();
  ghBusy=true; setStatus('Sblocco in corso…');
  try{ const token=await ghOpen(GHCFG,pw); GH={repo:GHCFG.repo,token}; ghOk(); el.value=''; updGhBar(); render(); await syncGH(); }
  catch(e){ ghFail(); el.value=''; setStatus('Password sbagliata: archivio online ancora bloccato',true); alert('Password sbagliata.'); el.focus(); }
  finally{ ghBusy=false; }
}
async function ghProtect(id1,id2){ // vecchia chiave in chiaro → cifrata
  if(ghBusy||!ghLegacy()||!GH) return;
  const a=document.getElementById(id1), b=document.getElementById(id2); if(!a||!b) return;
  const err=ghPwCheck(a.value,b.value); if(err) return alert(err);
  ghBusy=true;
  try{ const cfg=await ghSeal(GH.repo,GH.token,a.value); await ghOpen(cfg,a.value); GHCFG=cfg; localStorage.setItem(PFX+'mag_gh',JSON.stringify(cfg)); a.value=''; b.value=''; updGhBar(); render(); alert('Fatto: la chiave di questo computer ora è protetta dalla password. Segnala in un posto sicuro: se la dimentichi bisogna ricollegare il computer con una chiave GitHub nuova.'); }
  catch(e){ alert('Non sono riuscito a proteggere la chiave: '+e.message); }
  finally{ ghBusy=false; }
}
function ghLock(){ if(!GHCFG||ghLegacy()) return; if(ghSyncing) return void setTimeout(ghLock,300); GH=null; updGhBar(); ghLockedStatus(); render(); }
function ghLockedStatus(){ setStatus('Archivio online bloccato: le modifiche restano su questo computer finché non lo sblocchi',true); }
function updGhBar(){
  const bar=document.getElementById('ghbar'); if(!bar) return;
  if(ghLocked()){
    bar.innerHTML=`🔒 Archivio online bloccato su questo computer: puoi stampare e modificare, le modifiche partono quando lo sblocchi. <input id="ghPwBar" type="password" placeholder="Password" autocomplete="current-password" style="width:150px"> <button class="b sm p" data-h-click="97">Sblocca</button>`;
    bar.classList.remove('hidden');
  }else if(ghLegacy()){
    bar.innerHTML=`⚠️ La chiave dell'archivio online di questo computer non è protetta. Scegli una password (almeno ${GH_PW_MIN} caratteri): <input id="ghPwNew1" type="password" placeholder="Password" autocomplete="new-password" style="width:130px"> <input id="ghPwNew2" type="password" placeholder="Ripeti" autocomplete="new-password" style="width:130px"> <button class="b sm p" data-h-click="98">Proteggi la chiave</button>`;
    bar.classList.remove('hidden');
  }else{ bar.innerHTML=''; bar.classList.add('hidden'); }
}
document.addEventListener('keydown',ev=>{ if(ev.key!=='Enter') return; const id=ev.target&&ev.target.id;
  if(id==='ghPwBar'||id==='ghPwCard'){ ev.preventDefault(); ghUnlock(id); }
  else if(id==='ghPwNew2'){ ev.preventDefault(); ghProtect('ghPwNew1','ghPwNew2'); } });
function b64enc(str){ const b=new TextEncoder().encode(str); let bin=''; for(let i=0;i<b.length;i+=0x8000) bin+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000)); return btoa(bin); }
function b64dec(t){ const bin=atob(String(t).replace(/\s/g,'')); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return new TextDecoder().decode(u); }
async function ghFetch(method,path,body,cfg){
  const c=cfg||GH;
  return fetch(GH_API+path,{method,cache:'no-store',headers:{Authorization:'Bearer '+c.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}
function ghErr(r){ return r.status===401?'chiave non valida o scaduta':r.status===403?'accesso negato (permessi della chiave o limite richieste)':r.status===404?'archivio non trovato o la chiave non ha accesso':'errore GitHub '+r.status; }
async function ghRead(){
  const r=await ghFetch('GET',`/repos/${GH.repo}/contents/${GH_FILE}`);
  if(r.status===404){ const t=await ghFetch('GET',`/repos/${GH.repo}`); if(t.ok) return {data:null,sha:null}; throw new Error(ghErr(t)); }
  if(!r.ok) throw new Error(ghErr(r));
  const j=await r.json(); let txt;
  if(j.content) txt=b64dec(j.content);
  else { const b=await ghFetch('GET',`/repos/${GH.repo}/git/blobs/${j.sha}`); if(!b.ok) throw new Error(ghErr(b)); txt=b64dec((await b.json()).content); } // file oltre 1 MB
  let data=null; try{ data=txt.trim()?JSON.parse(txt):null; }catch(e){ throw new Error('archivio online illeggibile'); }
  if(data&&(!data.settings||!Array.isArray(data.prodotti))) throw new Error('il file online non è un archivio etichette');
  return {data,sha:j.sha};
}
async function syncGH(){
  if(!GHCFG) return; if(!GH){ ghLockedStatus(); return; } if(ghSyncing){ ghPending=true; return; } ghSyncing=true;
  try{
    for(let tent=0;tent<4;tent++){
      const {data:remote,sha}=await ghRead();
      const remoteN=remote?normalize(JSON.parse(JSON.stringify(remote))):null;
      const before=JSON.stringify(S);
      const merged=remoteN?merge(S,remoteN):S;
      const mStr=JSON.stringify(merged);
      if(mStr!==before){ S=merged; saveLocal(); if(!EDIT) render(); }
      if(remoteN&&mStr===JSON.stringify(merge(remoteN,{}))) break; // niente di nuovo da inviare (confronto nello stesso ordine)
      if(PROVA) break; // versione di prova: si legge l'archivio vero ma non si scrive mai
      const w=await ghFetch('PUT',`/repos/${GH.repo}/contents/${GH_FILE}`,{message:`Etichette: salvataggio da ${DEV.nome||'postazione senza nome'}`,content:b64enc(JSON.stringify(merged,null,1)),...(sha?{sha}:{})});
      if(w.ok) break;
      if(w.status===409||w.status===422) continue; // un'altra postazione ha salvato nello stesso momento: rileggo e riunisco
      throw new Error(ghErr(w));
    }
    lastSync=new Date(); if(PROVA){ setStatus('PROVA: prodotti letti dall\'archivio online (le modifiche restano qui) · '+lastSync.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})); return; }
    setStatus('Archivio online ✓ aggiornato alle '+lastSync.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}));
  }catch(e){
    const off=!navigator.onLine||e instanceof TypeError;
    setStatus(off?'Senza rete: le modifiche restano qui e partono appena torna la connessione':'Archivio online: '+e.message,true);
  }finally{ ghSyncing=false; if(ghPending){ ghPending=false; setTimeout(syncGH,300); } }
}
async function ghConnect(){
  const repo=document.getElementById('ghRepo').value.trim().replace(/^https?:\/\/github\.com\//,'').replace(/\.git$/,'').replace(/\/$/,'');
  const token=document.getElementById('ghToken').value.trim();
  const pw1=document.getElementById('ghPw1').value, pw2=document.getElementById('ghPw2').value;
  if(!GH_REPO_OK.test(repo)) return alert('Scrivi l\'archivio nella forma utente/nome, per esempio manfredinigio01-bit/etichette-magiostra-dati');
  if(!GH_TOKEN_OK.test(token)) return alert('Incolla la chiave GitHub (inizia con github_pat_)');
  const pwErr=ghPwCheck(pw1,pw2); if(pwErr) return alert(pwErr);
  const cfg={repo,token};
  try{
    const r=await ghFetch('GET',`/repos/${repo}`,null,cfg);
    if(!r.ok) return alert('Collegamento non riuscito: '+ghErr(r));
    const j=await r.json();
    if(!j.private) return alert('Questo repository è PUBBLICO: ricette e prezzi sarebbero visibili a tutti. Rendilo privato su GitHub e riprova.');
    if(j.permissions&&!j.permissions.push) return alert('La chiave può solo leggere: dalle il permesso Contents "Read and write".');
  }catch(e){ return alert('Collegamento non riuscito: controlla la rete'); }
  let sealed; try{ sealed=await ghSeal(repo,token,pw1); await ghOpen(sealed,pw1); }catch(e){ return alert('Non sono riuscito a cifrare la chiave: '+e.message); }
  GHCFG=sealed; GH=cfg; localStorage.setItem(PFX+'mag_gh',JSON.stringify(sealed)); ghOk(); updGhBar();
  if(fileHandle){ fileHandle=null; await kvSet('handle',null); document.getElementById('reconnect').classList.add('hidden'); }
  await syncGH(); render();
}
function ghDisconnect(){ if(!confirm('Scollegare l\'archivio online da questo computer? I dati restano online e in questo browser.')) return; GH=null; GHCFG=null; localStorage.removeItem(PFX+'mag_gh'); ghOk(); updGhBar(); setStatus('Archivio: solo su questo computer'); render(); }
(async()=>{
  if(GHCFG){ updGhBar(); await syncGH(); }
  else if('showOpenFilePicker' in window){ try{ const h=await kvGet('handle'); if(h){ fileHandle=h; await syncNow(); } }catch(e){} }
  window.addEventListener('online',()=>syncNow());
  setInterval(()=>syncNow(),20000);
  window.addEventListener('focus',()=>syncNow());
})();
window.addEventListener('afterprint',()=>{ document.getElementById('print').innerHTML=''; });

