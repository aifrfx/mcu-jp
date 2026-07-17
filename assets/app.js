'use strict';

const STORAGE_KEY = 'mcuGeneratorRecordsV3';
const FORM_IDS = [
  'nama','tglLahir','jenisKelamin','tglPeriksa','tglDeklarasi','riwayatKerjaId','riwayatKerjaJp',
  'riwayatSakitId','riwayatSakitJp','gejalaSubId','gejalaSubJp','gejalaObjId','gejalaObjJp',
  'tinggi','berat','lingkarPerut','tekananDarah','hb','rbc','got','gpt','ggtp','ldl','hdl',
  'trigliserida','gulaDarah','gulaDarahBintang','glukosaUrine','proteinUrine','mataKanan',
  'mataKiri','alatBantuMata','telingaKanan1000','telingaKanan4000','telingaKiri1000',
  'telingaKiri4000','ekgId','ekgJp','pemeriksaanLainId','pemeriksaanLainJp','rontgenMetode',
  'rontgenTanggal','rontgenNo','rontgenTemuanId','rontgenTemuanJp','diagnosisId','diagnosisJp',
  'fitStatus','keteranganId','keteranganJp','tglDokumen','dokterNama','klinikNama'
];

const state = {
  currentId: null,
  marks: {},
  selectedMark: null,
  stampData: ''
};

const GENDER_LATIN_MARK_KEYS = new Set(['gender-male-id','gender-female-id']);
function clearGenderLatinMarks(){
  GENDER_LATIN_MARK_KEYS.forEach(key=>{ state.marks[key]={circle:false,strike:false,manual:false}; });
}

const sampleData = {
  nama:'AHMAD FADHOLI', tglLahir:'1998-11-13', jenisKelamin:'L', tglPeriksa:'2026-07-15', tglDeklarasi:'2026-03-09',
  riwayatKerjaId:'Tidak ada paparan bahan kimia\nTidak ada paparan radiasi', riwayatKerjaJp:'',
  riwayatSakitId:'Operasi amandel (2018)', riwayatSakitJp:'扁桃腺摘出術（2018）',
  gejalaSubId:'Secara Khusus tidak Ada', gejalaSubJp:'特になし', gejalaObjId:'Secara Khusus tidak Ada', gejalaObjJp:'特になし',
  tinggi:'170', berat:'65', lingkarPerut:'85', tekananDarah:'130/80', hb:'15.7', rbc:'520',
  got:'17', gpt:'24', ggtp:'20', ldl:'113', hdl:'57', trigliserida:'130', gulaDarah:'106', gulaDarahBintang:true,
  glukosaUrine:'Negatif', proteinUrine:'Negatif', mataKanan:'1.0', mataKiri:'1.0', alatBantuMata:false,
  telingaKanan1000:'Normal', telingaKanan4000:'Normal', telingaKiri1000:'Normal', telingaKiri4000:'Normal',
  ekgId:'SINUS BRADIKARDIA\n( Varian normal )', ekgJp:'洞性徐脈\n（ 正常亜型 ）',
  pemeriksaanLainId:'-', pemeriksaanLainJp:'', rontgenMetode:'Langsung', rontgenTanggal:'2026-03-05',
  rontgenNo:'B-260305-008221', rontgenTemuanId:'Cor dan pulmo : Normal', rontgenTemuanJp:'Cor と pulmo 通常の制限内',
  diagnosisId:'1. Gula darah puasa meningkat', diagnosisJp:'空腹時血糖値が高い', fitStatus:'FIT',
  keteranganId:'Secara Khusus tidak Ada', keteranganJp:'特になし', tglDokumen:'2026-07-15',
  dokterNama:'dr. Septian Dwi Rismianto', klinikNama:'Laboratorium Klinik Platinum'
};

function el(id){ return document.getElementById(id); }
function esc(value){
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function getInputValue(id){
  const node = el(id);
  if (!node) return '';
  return node.type === 'checkbox' ? node.checked : node.value;
}
function setInputValue(id, value){
  const node = el(id);
  if (!node) return;
  if (node.type === 'checkbox') node.checked = Boolean(value);
  else node.value = value ?? '';
}
function readForm(){
  const data = {};
  FORM_IDS.forEach(id => data[id] = getInputValue(id));
  data.marks = structuredClone(state.marks);
  data.stampData = state.stampData;
  return data;
}
function writeForm(data){
  FORM_IDS.forEach(id => setInputValue(id, data?.[id] ?? ''));
  state.marks = structuredClone(data?.marks || {});
  clearGenderLatinMarks();
  state.stampData = data?.stampData || '';
  render();
}
function pad2(value){ return String(value).padStart(2,'0'); }
function parts(iso){
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y,m,d] = iso.split('-'); return {y,m,d};
}
function dateJP(iso){ const p=parts(iso); return p ? `${p.y} 年　${p.m} 月　${p.d} 日` : ''; }
function dateJPWide(iso){ const p=parts(iso); return p ? `${p.y} 年　　 ${p.m} 月　　 ${p.d} 日` : ''; }
function dateIDWide(iso){ const p=parts(iso); return p ? `Tanggal　${p.d}　Bulan　${p.m}　Tahun ${p.y}` : ''; }
function dateID(iso){ const p=parts(iso); return p ? `Tanggal ${p.d}  Bulan  ${p.m}  Tahun ${p.y}` : ''; }
function dateDash(iso){ const p=parts(iso); return p ? `${p.d} - ${p.m} - ${p.y}` : ''; }
function dateCell(iso){ const p=parts(iso); return p ? `${p.y} 年 ${p.m} 月 ${p.d} 日\n${p.d} - ${p.m} - ${p.y}` : ''; }
function calculateAge(birthIso, examIso){
  const b=parts(birthIso), e=parts(examIso); if(!b||!e) return '';
  let age=Number(e.y)-Number(b.y);
  if(Number(e.m)<Number(b.m)||(e.m===b.m&&Number(e.d)<Number(b.d))) age--;
  return age >= 0 ? age : '';
}
function calculateBMI(height, weight){
  const h=Number(height), w=Number(weight); if(!(h>0)||!(w>0)) return '';
  return (w/((h/100)**2)).toFixed(2);
}
function bilingual(idText,jpText,separator=' / '){
  const a=(idText||'').trim(), b=(jpText||'').trim();
  if(a&&b) return `${a}${separator}${b}`;
  return a||b||'';
}
function combineEkg(idText,jpText){
  const idLines=String(idText||'').split(/\n+/).map(v=>v.trim()).filter(Boolean);
  const jpLines=String(jpText||'').split(/\n+/).map(v=>v.trim()).filter(Boolean);
  const first=[idLines[0],jpLines[0]].filter(Boolean).join(' / ');
  const second=[idLines[1],jpLines[1]].filter(Boolean).join(' / ');
  return second ? `${first}\n（ ${second.replace(/[（）()]/g,'').trim()} ）` : first;
}
function setText(id, text){ const node=el(id); if(node) node.textContent=text || ''; }
function setHTML(id, html){ const node=el(id); if(node) node.innerHTML=html; }
function markSpan(key,label,text,extra=''){
  return `<span class="markable ${extra}" data-mark-key="${esc(key)}" data-mark-label="${esc(label)}">${esc(text)}</span>`;
}
function statusPair(value){
  return value === 'Positif' ? ['ポジティブ','Positif'] : ['ネガティブ','Negatif'];
}
function visionValue(value, corrected){
  const v=value||''; return corrected ? `（ ${v} ）` : `${v}　（　）`;
}
function hearingMarkup(side, val1000, val4000){
  const rows=[['1000',val1000],['4000',val4000]];
  return rows.map(([hz,status])=>{
    const normalKey=`hear-${side}${hz}-normal`, abnormalKey=`hear-${side}${hz}-abnormal`;
    const sideLabel=side==='r'?'Kanan':'Kiri';
    return `<div class="choice-line jp-line">${markSpan(normalKey,`${sideLabel} ${hz}Hz Normal`,'1')} 所見なし　 ${markSpan(abnormalKey,`${sideLabel} ${hz}Hz Gangguan`,'2')} 所見あり</div>`+
      `<div class="choice-line latin-line small-line">1 Normal　　　 2 Gangguan</div>`;
  }).join('');
}
function ensureAutoMark(key, circle, strike){
  if(state.marks[key]?.manual) return;
  state.marks[key]={circle:Boolean(circle),strike:Boolean(strike),manual:false};
}
function updateAutomaticMarks(data){
  const male=data.jenisKelamin==='L';
  ensureAutoMark('gender-male-jp',male,false);
  ensureAutoMark('gender-female-jp',!male,false);
  state.marks['gender-male-id']={circle:false,strike:false,manual:false};
  state.marks['gender-female-id']={circle:false,strike:false,manual:false};
  // FIT dan UNFIT tidak diberi lingkaran otomatis.
  // Pengguna tetap dapat memberi coretan atau lingkaran secara manual dari toolbar.
  ensureAutoMark('fit',false,false);
  ensureAutoMark('unfit',false,false);
  [['r1000',data.telingaKanan1000],['r4000',data.telingaKanan4000],['l1000',data.telingaKiri1000],['l4000',data.telingaKiri4000]].forEach(([key,status])=>{
    const normal=status!=='Gangguan';
    ensureAutoMark(`hear-${key}-normal`,normal,false);
    ensureAutoMark(`hear-${key}-abnormal`,!normal,false);
  });
  const direct=data.rontgenMetode!=='Tidak langsung';
  ensureAutoMark('xray-direct-jp',false,!direct); ensureAutoMark('xray-direct-id',false,!direct);
  ensureAutoMark('xray-indirect-jp',false,direct); ensureAutoMark('xray-indirect-id',false,direct);
}
function applyMarks(){
  clearGenderLatinMarks();
  document.querySelectorAll('.markable').forEach(node=>{
    const key=node.dataset.markKey||'';
    const mark=state.marks[key]||{};
    const isGenderLatin=GENDER_LATIN_MARK_KEYS.has(key);
    node.classList.toggle('is-struck',!isGenderLatin && Boolean(mark.strike));
    node.classList.toggle('is-circled',!isGenderLatin && Boolean(mark.circle));
    node.classList.toggle('selected',state.selectedMark===key);
    if(isGenderLatin){
      node.style.textDecoration='none';
      node.style.borderBottom='0';
    }
  });
}
function render(){
  const d={}; FORM_IDS.forEach(id=>d[id]=getInputValue(id));
  const age=calculateAge(d.tglLahir,d.tglPeriksa), bmi=calculateBMI(d.tinggi,d.berat);
  el('usiaDisplay').value=age===''?'':`${age} tahun`;
  el('bmiDisplay').value=bmi===''?'':`${bmi} kg/m²`;

  setText('outP1DateJp',dateJPWide(d.tglDeklarasi||d.tglDokumen)); setText('outP1DateId',dateIDWide(d.tglDeklarasi||d.tglDokumen)); setText('outP1Name',(d.nama||'').toUpperCase());
  setText('outName',(d.nama||'').toUpperCase()); setText('outBirth',dateCell(d.tglLahir)); setText('outExamDate',dateCell(d.tglPeriksa));
  setHTML('outGender',`<div class="jp-line">${markSpan('gender-male-jp','Jenis kelamin laki-laki','男')} ・ ${markSpan('gender-female-jp','Jenis kelamin perempuan','女')}</div><div class="latin-line">${markSpan('gender-male-id','Laki-laki','Laki-laki')} / ${markSpan('gender-female-id','Perempuan','Perempuan')}</div>`);
  setText('outAge',age===''?'':`${age} 歳\n${age} tahun`);
  setText('outWork',bilingual(d.riwayatKerjaId,d.riwayatKerjaJp,'\n/ '));
  setText('outBp',d.tekananDarah?`${d.tekananDarah} mm/Hg`:''); setText('outHb',d.hb?`${d.hb} g/dℓ`:''); setText('outRbc',d.rbc?`${d.rbc} 万/mm³`:'');
  setText('outHistory',bilingual(d.riwayatSakitId,d.riwayatSakitJp,'\n/ '));
  setText('outGot',d.got?`${d.got} μ/ℓ`:''); setText('outGpt',d.gpt?`${d.gpt} μ/ℓ`:''); setText('outGgtp',d.ggtp?`${d.ggtp} μ/ℓ`:'');
  setText('outSubjective',bilingual(d.gejalaSubId,d.gejalaSubJp,'\n/ ')); setText('outLdl',d.ldl?`${d.ldl} mg/dℓ`:''); setText('outHdl',d.hdl?`${d.hdl} mg/dℓ`:''); setText('outTrig',d.trigliserida?`${d.trigliserida} mg/dℓ`:'');
  setText('outObjective',bilingual(d.gejalaObjId,d.gejalaObjJp,'\n/ ')); setText('outGlucose',d.gulaDarah?`${d.gulaDarahBintang?'*':''}${d.gulaDarah} mg/dℓ`:'');
  const ug=statusPair(d.glukosaUrine), up=statusPair(d.proteinUrine); setText('outUrineGlucose',`${ug[0]}\n${ug[1]}`); setText('outUrineProtein',`${up[0]}\n${up[1]}`);
  setText('outHeight',d.tinggi?`${d.tinggi} cm`:''); setText('outWeight',d.berat?`${d.berat} kg`:''); setText('outEkg',combineEkg(d.ekgId,d.ekgJp)); setText('outOther',bilingual(d.pemeriksaanLainId,d.pemeriksaanLainJp,' / '));

  setText('outBmi',bmi?`${bmi} kg/m²`:''); setText('outWaist',d.lingkarPerut?`${d.lingkarPerut} cm`:''); setText('outVisionR',visionValue(d.mataKanan,d.alatBantuMata)); setText('outVisionL',visionValue(d.mataKiri,d.alatBantuMata));
  setHTML('outHearingR',hearingMarkup('r',d.telingaKanan1000,d.telingaKanan4000));
  setHTML('outHearingL',hearingMarkup('l',d.telingaKiri1000,d.telingaKiri4000));
  const direct=d.rontgenMetode!=='Tidak langsung';
  setHTML('outXray',`<div class="xray-methods"><div>${markSpan('xray-direct-jp','Metode langsung Jepang','直接')}<br>${markSpan('xray-direct-id','Metode langsung','Langsung')}</div><div>${markSpan('xray-indirect-jp','Metode tidak langsung Jepang','間接')}<br>${markSpan('xray-indirect-id','Metode tidak langsung','Tidak langsung')}</div></div><div class="xray-row"><span>撮影</span><span>${esc(dateJP(d.rontgenTanggal))}</span></div><div class="xray-row"><span>Diambil tanggal</span><span>${esc(dateDash(d.rontgenTanggal))}</span></div><div class="xray-row"><span>No.</span><span>${esc(d.rontgenNo||'')}</span></div><div class="xray-findings">所見：${esc(d.rontgenTemuanJp||'')}\nTemuan: ${esc(d.rontgenTemuanId||'')}</div>`);
  setHTML('outDiagnosis',`<div class="diagnosis-text">${markSpan('diagnosis','Diagnosis dokter',bilingual(d.diagnosisId,d.diagnosisJp,' / '),'block')}</div><div class="fit-row"><div class="fit-label">判定<br><b>Diagnosis:</b></div><div class="fit-choice"><span class="markable fit-combined" data-mark-key="fit" data-mark-label="FIT">合<br>FIT</span></div><div class="fit-choice"><span class="markable fit-combined" data-mark-key="unfit" data-mark-label="UNFIT">否<br>UNFIT</span></div></div><div class="fit-note">※ 日本での就業に問題なし</div>`);
  setText('outNotes',bilingual(d.keteranganId,d.keteranganJp,' / '));
  setHTML('outFooterDate',`<div class="footer-date-line jp-line">${esc(dateJP(d.tglDokumen))}</div><div class="footer-date-line latin-line">${esc(dateID(d.tglDokumen))}</div>`);
  const stamp=el('outStamp');
  if(state.stampData){
    stamp.src=state.stampData; stamp.classList.add('visible'); setText('outDoctorName','');
  }else{
    stamp.removeAttribute('src'); stamp.classList.remove('visible');
    setText('outDoctorName',[d.klinikNama,d.dokterNama?`(${d.dokterNama})`:''].filter(Boolean).join('\n'));
  }

  updateAutomaticMarks(d); applyMarks();
}

function loadRecords(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return {}}
}
function saveRecords(records){ localStorage.setItem(STORAGE_KEY,JSON.stringify(records)); }
function refreshRecordSelect(){
  const select=el('recordSelect'), previous=state.currentId; select.innerHTML='<option value="">Peserta baru</option>';
  const records=loadRecords(); Object.entries(records).sort((a,b)=>(b[1].savedAt||'').localeCompare(a[1].savedAt||'')).forEach(([id,r])=>{
    const option=document.createElement('option'); option.value=id; option.textContent=`${r.nama||'(tanpa nama)'} — ${r.tglPeriksa||''}`; select.append(option);
  });
  if(previous&&records[previous]) select.value=previous;
}
function showStatus(message){ el('statusMsg').textContent=message; window.clearTimeout(showStatus.timer); showStatus.timer=window.setTimeout(()=>el('statusMsg').textContent='',2600); }
async function fetchAsDataUrl(url){
  if(/^data:/i.test(url)) return url;
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok) throw new Error(`Gagal memuat ${url}`);
  const blob=await response.blob();
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(reader.error||new Error('Gagal membaca gambar.'));
    reader.readAsDataURL(blob);
  });
}
async function capturePagePng(pageNode){
  const rect=pageNode.getBoundingClientRect();
  const width=Math.max(1,Math.round(rect.width));
  const height=Math.max(1,Math.round(rect.height));
  const clone=pageNode.cloneNode(true);
  clone.style.margin='0';
  clone.style.boxShadow='none';
  clone.style.width=`${width}px`;
  clone.style.height=`${height}px`;
  for(const image of clone.querySelectorAll('img')){
    const src=image.getAttribute('src');
    if(!src) continue;
    try{ image.setAttribute('src',await fetchAsDataUrl(new URL(src,location.href).href)); }catch{}
  }
  const cssFiles=['assets/style.css','assets/modern.css','assets/document-font-match.css'];
  const css=[];
  for(const file of cssFiles){
    try{ const response=await fetch(file,{cache:'no-store'}); if(response.ok) css.push(await response.text()); }catch{}
  }
  const wrapper=document.createElement('div');
  wrapper.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  const style=document.createElement('style');
  style.textContent=css.join('\n')+'\nhtml,body{margin:0!important;padding:0!important;background:#fff!important}.page{margin:0!important;box-shadow:none!important}.markable.selected::before{display:none!important}';
  wrapper.appendChild(style);
  wrapper.appendChild(clone);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  svg.setAttribute('width',String(width));
  svg.setAttribute('height',String(height));
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const foreign=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');
  foreign.setAttribute('width','100%');
  foreign.setAttribute('height','100%');
  foreign.appendChild(wrapper);
  svg.appendChild(foreign);
  const xml=new XMLSerializer().serializeToString(svg);
  const blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'});
  const objectUrl=URL.createObjectURL(blob);
  try{
    const image=await new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('Gagal merender halaman Word.'));
      img.src=objectUrl;
    });
    const canvas=document.createElement('canvas');
    canvas.width=1407;
    canvas.height=1997;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }finally{
    URL.revokeObjectURL(objectUrl);
  }
}
async function exportWord(){
  const button=el('btnExportWord');
  if(button) button.disabled=true;
  try{
    if(location.protocol==='file:'){
      throw new Error('Export Word memerlukan server aplikasi. Buka melalui Bonto/Back4App/Railway, bukan index.html langsung.');
    }
    showStatus('Menyiapkan dokumen Word editable...');
    const data=readForm();
    if(data.stampData && !/^data:/i.test(data.stampData)){
      try{ data.stampData=await fetchAsDataUrl(new URL(data.stampData,location.href).href); }catch{}
    }
    const filename=((data.nama||'MCU').toString().trim().replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'')||'MCU')+'_MCU.docx';
    const response=await fetch('/api/export-word',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({filename,data})
    });
    if(!response.ok){
      const payload=await response.json().catch(()=>({}));
      throw new Error(payload.error?.message||`Export Word gagal (${response.status}).`);
    }
    const blob=await response.blob();
    if(!blob.size) throw new Error('File Word yang diterima kosong.');
    const contentType=(response.headers.get('content-type')||'').toLowerCase();
    if(!contentType.includes('wordprocessingml') && !contentType.includes('octet-stream')){
      throw new Error('Respons server bukan dokumen Word.');
    }
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    showStatus('Dokumen Word editable berhasil dibuat.');
  }catch(error){
    console.error(error);
    showStatus(error.message||'Export Word gagal.');
  }finally{
    if(button) button.disabled=false;
  }
}
function saveCurrent(){
  const data=readForm(); const records=loadRecords(); const id=state.currentId||`mcu-${Date.now()}`; data.savedAt=new Date().toISOString(); records[id]=data; saveRecords(records); state.currentId=id; refreshRecordSelect(); el('recordSelect').value=id; showStatus('Data peserta tersimpan di browser.');
}
function loadCurrent(){
  const id=el('recordSelect').value; if(!id){newRecord();return} const record=loadRecords()[id]; if(!record){showStatus('Data tidak ditemukan.');return} state.currentId=id; state.selectedMark=null; writeForm(record); showStatus('Data peserta dimuat.');
}
function deleteCurrent(){
  const id=el('recordSelect').value; if(!id)return; const records=loadRecords(); delete records[id]; saveRecords(records); newRecord(); refreshRecordSelect(); showStatus('Data dihapus.');
}
function newRecord(){
  state.currentId=null; state.marks={}; state.selectedMark=null; state.stampData=''; FORM_IDS.forEach(id=>setInputValue(id,''));
  setInputValue('jenisKelamin','L'); setInputValue('glukosaUrine','Negatif'); setInputValue('proteinUrine','Negatif'); setInputValue('fitStatus','FIT'); setInputValue('rontgenMetode','Langsung'); ['telingaKanan1000','telingaKanan4000','telingaKiri1000','telingaKiri4000'].forEach(id=>setInputValue(id,'Normal')); render(); refreshRecordSelect(); el('recordSelect').value='';
}
function useSample(){
  state.currentId=null; state.marks={}; state.selectedMark=null; FORM_IDS.forEach(id=>setInputValue(id,sampleData[id]??''));
  state.stampData='assets/sample-doctor-stamp.png';
  render(); el('recordSelect').value=''; showStatus('Contoh dari PDF dimuat.');
}
function blobToDataURL(blob){ return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)}); }
function resizeImage(file,maxWidth=1000,maxHeight=600){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{let w=img.width,h=img.height;const scale=Math.min(1,maxWidth/w,maxHeight/h);w=Math.round(w*scale);h=Math.round(h*scale);const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);resolve(canvas.toDataURL('image/png'))};img.src=reader.result};reader.readAsDataURL(file)});
}
function selectMark(node){
  document.querySelectorAll('.markable.selected').forEach(n=>n.classList.remove('selected')); state.selectedMark=node.dataset.markKey; node.classList.add('selected'); el('selectedMarkLabel').textContent=node.dataset.markLabel||node.textContent.trim(); ['btnStrike','btnCircle','btnClearMark'].forEach(id=>el(id).disabled=false);
}
function modifySelectedMark(action){
  if(!state.selectedMark)return; const current=state.marks[state.selectedMark]||{}; const next={circle:Boolean(current.circle),strike:Boolean(current.strike),manual:true}; if(action==='strike')next.strike=!next.strike; if(action==='circle')next.circle=!next.circle; if(action==='clear'){next.circle=false;next.strike=false} state.marks[state.selectedMark]=next; applyMarks();
}

document.addEventListener('input',event=>{if(event.target.matches('[data-field]'))render()});
document.addEventListener('change',event=>{if(event.target.matches('[data-field]'))render()});
document.addEventListener('click',event=>{const mark=event.target.closest('.markable');if(mark){event.preventDefault();selectMark(mark)}});
el('btnSave').addEventListener('click',saveCurrent); el('btnLoad').addEventListener('click',loadCurrent); el('btnDelete').addEventListener('click',deleteCurrent); el('btnNew').addEventListener('click',newRecord); el('btnSample').addEventListener('click',useSample); el('btnPrint').addEventListener('click',()=>window.print()); el('btnExportWord').addEventListener('click',exportWord);
el('btnStrike').addEventListener('click',()=>modifySelectedMark('strike')); el('btnCircle').addEventListener('click',()=>modifySelectedMark('circle')); el('btnClearMark').addEventListener('click',()=>modifySelectedMark('clear'));
el('dokterStamp').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{state.stampData=await resizeImage(file);render();showStatus('Gambar cap dimuat.')}catch{showStatus('Gagal membaca gambar cap.')}});
el('btnSampleStamp').addEventListener('click',()=>{state.stampData='assets/sample-doctor-stamp.png';render()});
el('btnClearStamp').addEventListener('click',()=>{state.stampData='';el('dokterStamp').value='';render()});

refreshRecordSelect(); useSample();
