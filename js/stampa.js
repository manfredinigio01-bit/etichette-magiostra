/* ================== STAMPA ================== */
function slotPos(i){
  const f=S.settings.foglio, e=S.settings.etichetta;
  const per=f.cols*f.rows, idx=i%per, r=Math.floor(idx/f.cols), c=idx%f.cols;
  return {x:f.mLeft + c*(e.w+f.gapX) + DEV.offX, y:f.mTop + r*(e.h+f.gapY) + DEV.offY};
}
function buildSheets(labels, start){
  const f=S.settings.foglio, e=S.settings.etichetta;
  if(f.modo==='singola'){
    setPage(e.w,e.h);
    return labels.map(h=>`<div class="sheet" style="width:${e.w}mm;height:${e.h}mm"><div class="slot" style="left:${DEV.offX}mm;top:${DEV.offY}mm">${h}</div></div>`).join('');
  }
  setPage(f.pageW,f.pageH);
  const per=f.cols*f.rows; let out='', cur='', n=start||0;
  const all=[...labels];
  while(all.length){
    const h=all.shift();
    const p=slotPos(n);
    cur+=`<div class="slot" style="left:${p.x}mm;top:${p.y}mm">${h}</div>`;
    n++;
    if(n%per===0 || !all.length){ out+=`<div class="sheet" style="width:${f.pageW}mm;height:${f.pageH}mm">${cur}</div>`; cur=''; }
  }
  return out;
}
function setPage(w,h){ document.getElementById('pagestyle').textContent=`@page { size: ${w}mm ${h}mm; margin: 0; }`; }
function expandQueue(){
  const out=[]; DEV.coda.forEach(j=>{ if(!getP(j.pid)||getP(j.pid).deleted) return; for(let i=0;i<(j.qty||1);i++) out.push(j); }); return out;
}
function countLabels(jobs){ return jobs.reduce((n,j)=>n+(isPunta(j)?2:1),0);
}
function doPrint(jobs, start){
  const f=S.settings.foglio;
  const cut = f.taglio;
  const labels = jobs.flatMap(j=>labelsFor(j,{cut}));
  const pr=document.getElementById('print');
  pr.innerHTML = buildSheets(labels, f.modo==='singola'?0:start);
  fitLabels(pr);
  const bad = pr.querySelectorAll('.lbl.overflow').length;
  if(bad){ pr.innerHTML=''; alert(`Stampa bloccata: ${bad} etichett${bad>1?'e non rispettano':'a non rispetta'} il carattere minimo di legge (7 pt) perché il testo non entra.\n\nScegli un formato più grande in Impostazioni → Foglio di stampa, oppure accorcia il testo del prodotto.`); return; }
  if(f.modo==='a4'){ const per=f.cols*f.rows; DEV.start=((start||0)+labels.length)%per; saveDev(); }
  openPrint(); setTimeout(render,300);
}
function printCalibration(){
  const f=S.settings.foglio, e=S.settings.etichetta;
  setPage(f.pageW,f.pageH);
  let slots='';
  for(let i=0;i<f.cols*f.rows;i++){ const p=slotPos(i); slots+=`<div class="slot" style="left:${p.x}mm;top:${p.y}mm;width:${e.w}mm;height:${e.h}mm;border:0.2mm solid #000;display:flex;align-items:center;justify-content:center;font:9pt Arial">${i+1}</div>`; }
  const cross=(x,y)=>`<div style="position:absolute;left:${x-5+DEV.offX}mm;top:${y+DEV.offY}mm;width:10mm;border-top:0.2mm solid #000"></div><div style="position:absolute;left:${x+DEV.offX}mm;top:${y-5+DEV.offY}mm;height:10mm;border-left:0.2mm solid #000"></div>`;
  const html=`<div class="sheet" style="width:${f.pageW}mm;height:${f.pageH}mm">${slots}
   ${cross(20,20)}
   <div style="position:absolute;left:${30+DEV.offX}mm;top:${148+DEV.offY}mm;width:100mm;border-top:0.4mm solid #000"></div>
   <div style="position:absolute;left:${30+DEV.offX}mm;top:${150+DEV.offY}mm;font:8pt Arial;background:#fff">Questa linea deve misurare esattamente 100 mm. Se è diversa la stampa è in scala: impostare Scala 100%.</div>
   <div style="position:absolute;left:${26+DEV.offX}mm;top:${17+DEV.offY}mm;font:8pt Arial;background:#fff;padding:0 1mm">← il centro della croce deve stare a 20 mm dal bordo sinistro e 20 mm dal bordo alto</div>
  </div>`;
  const pr=document.getElementById('print'); pr.innerHTML=html; openPrint();
}
// La stampa va chiamata subito, dentro il tocco/clic: Safari su iPhone blocca window.print() chiamato più tardi (setTimeout).
let printOpened=false;
window.addEventListener('beforeprint',()=>{ printOpened=true; });
function openPrint(){
  printOpened=false;
  try{ window.print(); }catch(e){}
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)){
    setTimeout(()=>{ if(!printOpened) alert(navigator.standalone
      ? 'Dall\'icona sulla schermata Home l\'iPhone non apre la stampa.\n\nApri l\'app in Safari (manfredinigio01-bit.github.io/etichette-magiostra) e premi di nuovo Stampa: si apre la finestra di stampa AirPrint.\n\nRicorda: sui fogli Markin la stampa precisa va fatta dal computer.'
      : 'La finestra di stampa non si è aperta. Riprova toccando di nuovo il pulsante.'); },1500);
  }
}

