/* ================== DATI DI BASE ================== */
const ALLERGENI = [
 {k:'glutine', n:'Cereali con glutine', t:'cereali contenenti glutine', w:['grano duro','grano tenero','grano','farina tipo 00','farina tipo 0','farina tipo 1','farina tipo 2','farina 00','farina 0','frumento','segale','orzo','avena','farro','kamut','khorasan','spelta','glutine','seitan','semola','semolato','semolino','triticale','bulgur','couscous','cous cous','cuscus']},
 {k:'crostacei', n:'Crostacei', t:'crostacei', w:['crostacei','gambero','gamberi','gamberetti','scampi','scampo','aragosta','astice','granchio','granchi','mazzancolle']},
 {k:'uova', n:'Uova', t:'uova', w:['uovo','uova','albume','albumi','tuorlo','tuorli','ovoprodotti']},
 {k:'pesce', n:'Pesce', t:'pesce', w:['pesce','acciuga','acciughe','alici','tonno','salmone','merluzzo','baccalà','sgombro','sardine','colatura di alici']},
 {k:'arachidi', n:'Arachidi', t:'arachidi', w:['arachide','arachidi','noccioline']},
 {k:'soia', n:'Soia', t:'soia', w:['soia','soya','soja','tofu','tempeh','edamame','tamari','shoyu','miso']},
 {k:'latte', n:'Latte', t:'latte', w:['latte','lattosio','burro','panna','formaggio','formaggi','ricotta','mozzarella','parmigiano','grana padano','caseina','caseinato','siero di latte','yogurt','mascarpone','stracchino','crescenza','gorgonzola','pecorino','provola','scamorza']},
 {k:'guscio', n:'Frutta a guscio', t:'frutta a guscio', w:['frutta a guscio','mandorla','mandorle','nocciola','nocciole','noce','noci','anacardo','anacardi','pistacchio','pistacchi','noci pecan','pecan','macadamia','noci del brasile']},
 {k:'sedano', n:'Sedano', t:'sedano', w:['sedano rapa','sedano']},
 {k:'senape', n:'Senape', t:'senape', w:['senape']},
 {k:'sesamo', n:'Sesamo', t:'sesamo', w:['sesamo','tahina','tahin','gomasio']},
 {k:'solfiti', n:'Anidride solforosa e solfiti', t:'anidride solforosa e solfiti', w:['anidride solforosa','solfiti','solfito','metabisolfito','vino','vino rosso','vino bianco','aceto di vino','aceto balsamico','marsala']},
 {k:'lupini', n:'Lupini', t:'lupini', w:['lupini','lupino']},
 {k:'molluschi', n:'Molluschi', t:'molluschi', w:['molluschi','cozze','vongole','calamari','calamaro','polpo','seppia','seppie','ostriche']}
];
// frasi in cui la PRIMA parola NON è un allergene (le altre parole vengono comunque controllate)
const ESCLUSIONI = ['latte di cocco','latte di riso','latte di soia','latte di mandorla','latte di mandorle','latte di avena','latte di nocciola','latte di nocciole','latte di anacardi','latte vegetale','latte di canapa','latte di miglio','latte di farro','burro di cacao','burro di karité','burro di arachidi','burro di mandorle','burro vegetale','burro di cocco','burro di nocciole','panna vegetale','panna di soia','panna di cocco','panna di riso','panna di avena','panna di mandorle','formaggio vegetale','formaggio vegano','formaggi vegetali','yogurt di soia','yogurt vegetale','yogurt di cocco','noce moscata','noce di cocco','noci di cocco','semola di riso','semola di mais','grano saraceno','farina di grano saraceno','burro di anacardi'];

const W2A = {}; ALLERGENI.forEach(a=>a.w.forEach(w=>W2A[w]=a.k));
const ALL_WORDS = Object.keys(W2A).sort((a,b)=>b.length-a.length);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const RE_ALL = new RegExp('(?<!\\p{L})(' + ALL_WORDS.map(reEsc).join('|') + ')(?!\\p{L})','giu');
const RE_EXC = new RegExp('(?<!\\p{L})(' + ESCLUSIONI.map(reEsc).join('|') + ')(?!\\p{L})','giu');

// *parola* = grassetto forzato (l'asterisco di apertura non deve seguire una lettera).
// parola* = ingrediente surgelato: asterisco attaccato alla fine della parola; la nota "*Ingrediente surgelato." la aggiunge l'etichetta.
const RE_BOLD=/(?<![\p{L}\p{N})\]])\*([^*\s][^*]*?)\*/gu;
const RE_SURG=/(?<=[\p{L}\p{N})\]])\*/u;
function highlight(text, upper){
  const found = new Set(); let html='', surg=false;
  const parts=[]; const src=String(text||''); let last0=0, mb; RE_BOLD.lastIndex=0;
  while((mb=RE_BOLD.exec(src))){ parts.push(src.slice(last0,mb.index),mb[1]); last0=mb.index+mb[0].length; }
  parts.push(src.slice(last0));
  parts.forEach((seg,i)=>{
    if(i%2===1){ html += `<b class="al">${esc(upper?seg.toUpperCase():seg)}</b>`; const k=W2A[seg.toLowerCase()]; if(k)found.add(k); else found.add('manuale:'+seg); return; }
    if(RE_SURG.test(seg)) surg=true;
    const prot=[]; let m; RE_EXC.lastIndex=0;
    while((m=RE_EXC.exec(seg))){ const ph=m[1].toLowerCase(); const fw=ph.startsWith('grano saraceno')?'grano':ph.startsWith('farina di grano saraceno')?'farina di grano':ph.split(' ')[0]; prot.push([m.index,m.index+fw.length]); }
    let last=0; RE_ALL.lastIndex=0;
    while((m=RE_ALL.exec(seg))){
      const s=m.index, e=s+m[1].length;
      if(prot.some(([a,b])=>s<b&&e>a)){ continue; }
      html += esc(seg.slice(last,s)) + `<b class="al">${esc(upper?m[1].toUpperCase():m[1])}</b>`; last=e;
      found.add(W2A[m[1].toLowerCase()]);
    }
    html += esc(seg.slice(last));
  });
  return {html, found:[...found], surg};
}
// ingredienti di primo livello (separati da virgola o punto fuori dalle parentesi), con la posizione del nome
function ingParts(text){
  const t=String(text||''), out=[]; let depth=0, start=0;
  const push=(a,b)=>{ const seg=t.slice(a,b); const s0=a+(seg.length-seg.trimStart().length);
    const cut=t.slice(s0,b).search(/[(\[:]/); let e0=cut<0?b:s0+cut; while(e0>s0&&/[\s.]/.test(t[e0-1])) e0--;
    const name=t.slice(s0,e0), bold=/^\*[^*]+\*$/.test(name);
    if(name.replace(/\*/g,'').trim()) out.push({s:s0,e:e0,nome:name.replace(/\*/g,'').trim(),surg:!bold&&/[\p{L}\p{N})\]]\*$/u.test(name)}); };
  for(let i=0;i<t.length;i++){ const c=t[i];
    if(c==='('||c==='[') depth++; else if((c===')'||c===']')&&depth>0) depth--;
    else if(depth===0&&(c===','||(c==='.'&&(i+1>=t.length||/\s/.test(t[i+1]))))){ push(start,i); start=i+1; } }
  push(start,t.length);
  return out;
}
function toggleSurg(k){
  const x=ingParts(EDIT.ingredienti)[k]; if(!x) return; const t=EDIT.ingredienti;
  EDIT.ingredienti = x.surg ? t.slice(0,x.e-1)+t.slice(x.e) : t.slice(0,x.e)+'*'+t.slice(x.e);
  render();
}
const STATI={'':'','decongelato':'Prodotto decongelato','surgelato':'Prodotto surgelato'};
const noteSurg=(p,hl)=>hl.surg&&!/surgelat|congelat/i.test(p.diciture||'')?'*Ingrediente surgelato.':'';

const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const now = () => Date.now();

const ESEMPIO_ING='Pasta (semola di grano duro, acqua), cavolfiore, cipolla, sedano, carote, polpa e succo di pomodoro, olio extravergine di oliva, sale, pepe, erbe aromatiche (origano, timo, maggiorana). Besciamella: bevanda di soia (acqua, soia, sale), olio di semi di girasole, farina di frumento tipo "0", lievito in scaglie, noce moscata, sale.';
const CAT_DEF=[{id:'cat_bis',nome:'Biscotti',colore:'#C98A1E'},{id:'cat_col',nome:'Colazione',colore:'#5E7F45'},{id:'cat_vas',nome:'Vasocottura',colore:'#B4532F'}];
function defaultState(){
  return {
    version:1,
    settings:{
      updatedAt:0, // un avvio da zero non deve mai sovrascrivere le impostazioni dell'archivio condiviso
      azienda:{nome:'La Magiostra', sottotitolo:'CUCINA', ragioneSociale:'La Magiostra di Aquilino e C. snc', indirizzo:'Via Grado 1 – 26100 Cremona (CR)', contatti:'Tel. 0372 21415 – aquilinochiara@libero.it'},
      logo:'compatto', logoCustom:'', layout024:true, layout029:true, layout031:true, cons035:true,
      etichetta:{w:63.5,h:72,pad:3,minPt:7,maxPt:8.5,allergeniMaiuscolo:false,etichettaProdotto:'Prodotto il:',mostraContatti:false,mostraProduzione:false,piedeCompatto:true},
      foglio:{preset:'L7164',modo:'a4',pageW:210,pageH:297,cols:3,rows:4,mTop:4.5,mLeft:7.25,gapX:2.5,gapY:0,taglio:false},
      categorie:CAT_DEF.map(c=>({...c})),
      pezzature:[{id:'pz1',nome:'250 g',kg:0.25},{id:'pz2',nome:'300 g',kg:0.3},{id:'pz3',nome:'500 g',kg:0.5},{id:'pz4',nome:'1 kg',kg:1}],
      conservazioni:[
        {id:'cs1',testo:'Conservare in frigorifero a +4 °C.',tipoData:'scadenza'},
        {id:'cs2',testo:'Conservare in luogo fresco e asciutto, lontano da fonti di calore.',tipoData:'tmc'},
        {id:'cs3',testo:'Prodotto congelato. Conservare in congelatore a -18 °C. Una volta scongelato non ricongelare.',tipoData:'tmc'},
        {id:'cs4',testo:'Conservare in frigorifero a +4 °C. Dopo l\'apertura consumare entro 3 giorni.',tipoData:'scadenza'},
        {id:'cs5',testo:'Conservare in luogo fresco e asciutto. Dopo l\'apertura conservare in frigorifero e consumare entro 7 giorni.',tipoData:'tmc'}
      ]
    },
    prodotti:[] // niente prodotto di esempio: creava una copia nell'archivio a ogni avvio da zero
  };
}
const PRESETS = {
  L7164:{nome:'Markin 210A420 / Avery L7164 / HERMA 4266 – 63,5×72 mm, 12 per foglio',w:63.5,h:72,cols:3,rows:4,mTop:4.5,mLeft:7.25,gapX:2.5,gapY:0,taglio:false},
  A4_66x80:{nome:'Carta normale A4 – 66×80 mm, 9 per foglio, con linee di taglio (a norma per ricette lunghe)',w:66,h:80,cols:3,rows:3,mTop:28.5,mLeft:6,gapX:0,gapY:0,taglio:true},
  A4_60x70:{nome:'Carta normale A4 – 60×70 mm, 12 per foglio, con linee di taglio',w:60,h:70,cols:3,rows:4,mTop:8.5,mLeft:15,gapX:0,gapY:0,taglio:true},
  custom:{nome:'Personalizzato'}
};

