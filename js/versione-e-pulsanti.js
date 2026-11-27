/* ================== VERSIONE E AGGIORNAMENTI ================== */
if(PROVA){ // versione di prova: ben riconoscibile, non installabile come app
  document.title='PROVA – '+document.title;
  document.querySelector('link[rel="manifest"]')?.remove();
  document.body.insertAdjacentHTML('afterbegin','<div id="provabar" style="background:#ffd54a;color:#3a2a00;padding:6px 20px;font-weight:600;font-size:13px;text-align:center">VERSIONE DI PROVA — dati separati da quelli veri; l\'archivio online si legge ma non si modifica. Per il lavoro vero usa la versione normale.</div>');
}
var STORAGE_PERSIST=null; // il browser conserva i dati dell'app? (chiesto all'avvio)
try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persisted().then(ok=>ok||navigator.storage.persist()).then(ok=>{ STORAGE_PERSIST=!!ok; }).catch(()=>{}); }catch(e){}
const APP_VERSION='0.9.0';
document.getElementById('ver').textContent='v'+APP_VERSION;
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('sw.js');
  const checkUpd=()=>fetch('version.json?'+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(v=>{ if(v.version!==APP_VERSION) document.getElementById('updbar').classList.remove('hidden'); }).catch(()=>{});
  checkUpd(); setInterval(checkUpd,10*60*1000); window.addEventListener('focus',checkUpd);
}

render();

/* ===== Gestori eventi (niente JavaScript dentro l'HTML: CSP script-src 'self') ===== */
const HANDLERS={
  0:(el,ev)=>{ Q=el.value;rerenderList() },
  1:(el,ev)=>{ selectProduct(el.dataset.click0) },
  2:(el,ev)=>{ FORM.pz=el.value;FORM.prezzoManual=false;render() },
  3:(el,ev)=>{ FORM.kgLibero=el.value;FORM.prezzoManual=false;render() },
  4:(el,ev)=>{ FORM.qty=el.value },
  5:(el,ev)=>{ FORM.prod=el.value;render() },
  6:(el,ev)=>{ FORM.scad=el.value;FORM.scadManual=true;render() },
  7:(el,ev)=>{ FORM.lotto=el.value;FORM.lottoManual=true;render() },
  8:(el,ev)=>{ FORM.showPrice=el.checked;render() },
  9:(el,ev)=>{ FORM.tipoPrezzo=el.value;FORM.prezzoManual=false;render() },
  10:(el,ev)=>{ FORM.prezzo=el.value;FORM.prezzoManual=true;render() },
  11:(el,ev)=>{ printNow() },
  12:(el,ev)=>{ addQueue() },
  13:(el,ev)=>{ FORM.scadManual=FORM.lottoManual=FORM.prezzoManual=false;render() },
  14:(el,ev)=>{ DEV.coda[(+el.dataset.change0)].qty=Math.max(1,parseInt(el.value)||1);saveDev();render() },
  15:(el,ev)=>{ DEV.coda.splice((+el.dataset.click0),1);saveDev();render() },
  16:(el,ev)=>{ DEV.start=(+el.dataset.click0);saveDev();render() },
  17:(el,ev)=>{ doPrint(expandQueue(),DEV.start) },
  18:(el,ev)=>{ if(confirm('Svuotare la coda?')){DEV.coda=[];DEV.start=0;saveDev();render()} },
  19:(el,ev)=>{ newProduct() },
  20:(el,ev)=>{ Q=el.value;render();setTimeout(()=>{const q=document.getElementById('qb2');q.focus();q.setSelectionRange(q.value.length,q.value.length)}) },
  21:(el,ev)=>{ editProduct(el.dataset.click0) },
  22:(el,ev)=>{ saveProduct() },
  23:(el,ev)=>{ dupProduct() },
  24:(el,ev)=>{ delProduct() },
  25:(el,ev)=>{ EDIT=null;render() },
  26:(el,ev)=>{ ed('nome',el.value) },
  27:(el,ev)=>{ ed('sottotitolo',el.value) },
  28:(el,ev)=>{ ed('ingredienti',el.value);document.getElementById('alfound').innerHTML=alFoundHTML(el.value);document.getElementById('surgbox').innerHTML=surgBoxHTML(EDIT) },
  29:(el,ev)=>{ toggleTraccia(el.dataset.change0,el.checked) },
  30:(el,ev)=>{ ed('tracceExtra',el.value) },
  31:(el,ev)=>{ setCons(el.value) },
  32:(el,ev)=>{ ed('tipoData',el.value,true) },
  33:(el,ev)=>{ ed('giorni',parseInt(el.value)||0) },
  34:(el,ev)=>{ ed('diciture',el.value) },
  35:(el,ev)=>{ ed('linea',el.value,true) },
  36:(el,ev)=>{ ed('categoria',el.value,true) },
  37:(el,ev)=>{ ed('fraseFronte',el.value) },
  38:(el,ev)=>{ ed('tipoPrezzo',el.value,true) },
  39:(el,ev)=>{ ed('prezzoPezzo',el.value) },
  40:(el,ev)=>{ ed('prezzoKg',el.value) },
  41:(el,ev)=>{ ed('mostraPrezzo',el.checked) },
  42:(el,ev)=>{ togglePz(el.dataset.change0,el.checked) },
  43:(el,ev)=>{ setS('azienda.nome',el.value) },
  44:(el,ev)=>{ setS('azienda.sottotitolo',el.value) },
  45:(el,ev)=>{ setS('azienda.ragioneSociale',el.value) },
  46:(el,ev)=>{ setS('azienda.indirizzo',el.value) },
  47:(el,ev)=>{ setS('azienda.contatti',el.value) },
  48:(el,ev)=>{ setS('etichetta.mostraContatti',el.checked) },
  49:(el,ev)=>{ setS('logo',el.value) },
  50:(el,ev)=>{ loadLogo(el) },
  51:(el,ev)=>{ setS('etichetta.w',num(el.value)||60);S.settings.foglio.preset='custom' },
  52:(el,ev)=>{ setS('etichetta.h',num(el.value)||70);S.settings.foglio.preset='custom' },
  53:(el,ev)=>{ setS('etichetta.pad',num(el.value)??2.5) },
  54:(el,ev)=>{ setS('etichetta.minPt',Math.max(MIN_LEGALE,num(el.value)||MIN_LEGALE)) },
  55:(el,ev)=>{ setS('etichetta.etichettaProdotto',el.value) },
  56:(el,ev)=>{ setS('etichetta.allergeniMaiuscolo',el.checked) },
  57:(el,ev)=>{ setS('etichetta.mostraProduzione',el.checked) },
  58:(el,ev)=>{ setS('etichetta.piedeCompatto',el.checked) },
  59:(el,ev)=>{ setS('foglio.modo',el.value) },
  60:(el,ev)=>{ applyPreset(el.value) },
  61:(el,ev)=>{ setS('foglio.cols',parseInt(el.value)||1);S.settings.foglio.preset='custom' },
  62:(el,ev)=>{ setS('foglio.rows',parseInt(el.value)||1);S.settings.foglio.preset='custom' },
  63:(el,ev)=>{ setS('foglio.mTop',num(el.value)??0);S.settings.foglio.preset='custom' },
  64:(el,ev)=>{ setS('foglio.mLeft',num(el.value)??0);S.settings.foglio.preset='custom' },
  65:(el,ev)=>{ setS('foglio.gapX',num(el.value)??0);S.settings.foglio.preset='custom' },
  66:(el,ev)=>{ setS('foglio.gapY',num(el.value)??0);S.settings.foglio.preset='custom' },
  67:(el,ev)=>{ centerSheet() },
  68:(el,ev)=>{ setS('foglio.taglio',el.checked) },
  69:(el,ev)=>{ DEV.nome=el.value.slice(0,40);saveDev() },
  70:(el,ev)=>{ DEV.offX=num(el.value)||0;saveDev();render() },
  71:(el,ev)=>{ DEV.offY=num(el.value)||0;saveDev();render() },
  72:(el,ev)=>{ printCalibration() },
  73:(el,ev)=>{ S.settings.pezzature[(+el.dataset.change0)].nome=el.value;touchSettings() },
  74:(el,ev)=>{ S.settings.pezzature[(+el.dataset.change0)].kg=num(el.value);touchSettings();render() },
  75:(el,ev)=>{ S.settings.pezzature.splice((+el.dataset.click0),1);touchSettings();render() },
  76:(el,ev)=>{ S.settings.pezzature.push({id:uid(),nome:'Nuova',kg:0.1});touchSettings();render() },
  77:(el,ev)=>{ S.settings.categorie[(+el.dataset.change0)].nome=el.value;touchSettings();render() },
  78:(el,ev)=>{ S.settings.categorie[(+el.dataset.change0)].colore=el.value;touchSettings();render() },
  79:(el,ev)=>{ if(confirm('Eliminare la categoria?')){S.settings.categorie.splice((+el.dataset.click0),1);touchSettings();render()} },
  80:(el,ev)=>{ S.settings.categorie.push({id:uid(),nome:'Nuova categoria',colore:'#2E3F5C'});touchSettings();render() },
  81:(el,ev)=>{ S.settings.conservazioni[(+el.dataset.change0)].testo=el.value;touchSettings() },
  82:(el,ev)=>{ S.settings.conservazioni[(+el.dataset.change0)].tipoData=el.value;touchSettings() },
  83:(el,ev)=>{ if(confirm('Eliminare?')){S.settings.conservazioni.splice((+el.dataset.click0),1);touchSettings();render()} },
  84:(el,ev)=>{ S.settings.conservazioni.push({id:uid(),testo:'Nuova dicitura',tipoData:'scadenza'});touchSettings();render() },
  85:(el,ev)=>{ syncGH() },
  86:(el,ev)=>{ ghDisconnect() },
  87:(el,ev)=>{ ghConnect() },
  88:(el,ev)=>{ connectFile(true) },
  89:(el,ev)=>{ connectFile(false) },
  90:(el,ev)=>{ disconnectFile() },
  91:(el,ev)=>{ exportJSON() },
  92:(el,ev)=>{ importJSON(el) },
  93:(el,ev)=>{ importCSV(document.getElementById('csvbox').value) },
  94:(el,ev)=>{ el.files[0].text().then(importCSV) },
  95:(el,ev)=>{ reconnectFile() },
  96:(el,ev)=>{ location.reload() },
  97:(el,ev)=>{ ghUnlock('ghPwBar') },
  98:(el,ev)=>{ ghProtect('ghPwNew1','ghPwNew2') },
  99:(el,ev)=>{ ghUnlock('ghPwCard') },
  100:(el,ev)=>{ ghLock() },
  103:(el,ev)=>{ if(confirm('Da adesso il testo ingredienti di questo prodotto lo scrivi tu e la Cucina non lo aggiornerà più. Continuare?')){ EDIT.fonte=''; render(); } },
  101:(el,ev)=>{ toggleSurg(+el.dataset.change0) },
  102:(el,ev)=>{ ed('stato',el.value,true) },
  104:(el,ev)=>{ srvSblocca('pinIn') },
  105:(el,ev)=>{ srvSoloStampa() },
  106:(el,ev)=>{ srvSblocca('pinCard') },
  107:(el,ev)=>{ srvSblocca('pinBar') },
  108:(el,ev)=>{ syncSrv() },
  109:(el,ev)=>{ srvBlocca() }
};
['click','change','input'].forEach(t=>document.addEventListener(t,ev=>{
  let el=ev.target.closest&&ev.target.closest('[data-h-'+t+']');
  while(el){ const f=HANDLERS[el.getAttribute('data-h-'+t)]; if(f) f(el,ev); el=el.parentElement&&el.parentElement.closest('[data-h-'+t+']'); }
}));

