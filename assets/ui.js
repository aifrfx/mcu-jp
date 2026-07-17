'use strict';

const REQUIRED_PROGRESS_FIELDS = [
  'nama','tglLahir','tglPeriksa','riwayatKerjaId','riwayatSakitId','gejalaSubId','gejalaObjId',
  'tinggi','berat','lingkarPerut','tekananDarah','hb','rbc','got','gpt','ggtp','ldl','hdl',
  'trigliserida','gulaDarah','mataKanan','mataKiri','ekgId','rontgenTanggal','rontgenNo',
  'rontgenTemuanId','diagnosisId','keteranganId','tglDokumen','dokterNama','klinikNama'
];

function isCompletedField(id){
  const node=document.getElementById(id);
  if(!node) return false;
  if(node.type==='checkbox') return node.checked;
  return String(node.value||'').trim()!=='';
}

function updateFormProgress(){
  const completed=REQUIRED_PROGRESS_FIELDS.filter(isCompletedField).length;
  const total=REQUIRED_PROGRESS_FIELDS.length;
  const percent=Math.round((completed/total)*100);
  const progress=document.getElementById('formProgress');
  const percentNode=document.getElementById('progressPercent');
  const caption=document.getElementById('progressCaption');
  if(progress) progress.value=percent;
  if(percentNode) percentNode.textContent=`${percent}%`;
  if(caption){
    if(percent===100) caption.textContent='Semua data utama sudah terisi dan dokumen siap diperiksa.';
    else if(percent>=75) caption.textContent=`${completed} dari ${total} data utama terisi. Tinggal beberapa bagian.`;
    else if(percent>=40) caption.textContent=`${completed} dari ${total} data utama terisi. Lanjutkan pemeriksaan.`;
    else if(completed>0) caption.textContent=`${completed} dari ${total} data utama terisi.`;
    else caption.textContent='Belum ada data wajib yang terisi.';
  }
}

function setActivePageButton(targetId){
  document.querySelectorAll('.page-nav-btn').forEach(button=>{
    button.classList.toggle('active',button.dataset.pageTarget===targetId);
  });
}

document.querySelectorAll('.page-nav-btn').forEach(button=>{
  button.addEventListener('click',()=>{
    const target=document.getElementById(button.dataset.pageTarget);
    if(target){
      target.scrollIntoView({behavior:'smooth',block:'start'});
      setActivePageButton(button.dataset.pageTarget);
    }
  });
});

const previewPanel=document.querySelector('.preview-panel');
if(previewPanel && 'IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(visible) setActivePageButton(visible.target.id);
  },{root:previewPanel,threshold:[.2,.45,.7]});
  document.querySelectorAll('.page').forEach(page=>observer.observe(page));
}

document.addEventListener('input',event=>{
  if(event.target.matches('[data-field]')) updateFormProgress();
});
document.addEventListener('change',event=>{
  if(event.target.matches('[data-field]')) updateFormProgress();
});
['btnNew','btnSample','btnLoad','btnDelete'].forEach(id=>{
  const button=document.getElementById(id);
  if(button) button.addEventListener('click',()=>window.setTimeout(updateFormProgress,0));
});

updateFormProgress();


/* Dashboard developer credit */
(function addDeveloperCredit(){
  const renderCredit=()=>{
    if(document.querySelector('.developer-credit')) return;
    const panel=document.querySelector('.form-panel');
    const actions=document.querySelector('.bottom-actions');
    if(!panel) return;

    const style=document.createElement('style');
    style.id='developer-credit-style';
    style.textContent=`
      .developer-credit{
        position:relative;
        overflow:hidden;
        margin:16px 0 22px;
        padding:16px;
        border:1px solid rgba(13,116,125,.22);
        border-radius:16px;
        color:#12383d;
        background:
          radial-gradient(circle at 100% 0%,rgba(45,196,184,.22),transparent 38%),
          linear-gradient(145deg,#f7fffe 0%,#edf9f8 55%,#e4f4f3 100%);
        box-shadow:0 10px 28px rgba(17,91,98,.12);
      }
      .developer-credit::before{
        content:"";
        position:absolute;
        width:110px;
        height:110px;
        right:-42px;
        bottom:-54px;
        border-radius:50%;
        border:22px solid rgba(14,120,128,.07);
        pointer-events:none;
      }
      .developer-credit__top{
        display:flex;
        align-items:center;
        gap:11px;
        margin-bottom:12px;
      }
      .developer-credit__mark{
        flex:0 0 42px;
        width:42px;
        height:42px;
        display:grid;
        place-items:center;
        border-radius:13px;
        color:#fff;
        background:linear-gradient(145deg,#0e7c84,#07555e);
        box-shadow:0 7px 16px rgba(7,85,94,.22);
        font-size:22px;
        font-weight:700;
      }
      .developer-credit__eyebrow{
        display:block;
        margin-bottom:2px;
        color:#0d7780;
        font-size:9px;
        font-weight:800;
        letter-spacing:.11em;
        text-transform:uppercase;
      }
      .developer-credit__name{
        display:block;
        color:#12383d;
        font-size:13.5px;
        line-height:1.25;
        font-weight:800;
      }
      .developer-credit__address{
        position:relative;
        z-index:1;
        margin:0 0 13px;
        padding-left:22px;
        color:#4a666a;
        font-size:10.5px;
        line-height:1.55;
      }
      .developer-credit__address::before{
        content:"⌖";
        position:absolute;
        left:1px;
        top:-1px;
        color:#0e7c84;
        font-size:16px;
        font-weight:700;
      }
      .developer-credit__wa{
        position:relative;
        z-index:1;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        width:100%;
        padding:10px 12px;
        border:1px solid rgba(19,150,78,.25);
        border-radius:12px;
        color:#fff;
        text-decoration:none;
        background:linear-gradient(135deg,#21b864,#128c4b);
        box-shadow:0 7px 18px rgba(18,140,75,.18);
        transition:transform .16s ease,box-shadow .16s ease,filter .16s ease;
      }
      .developer-credit__wa:hover{
        transform:translateY(-1px);
        filter:saturate(1.08);
        box-shadow:0 10px 22px rgba(18,140,75,.24);
      }
      .developer-credit__wa:focus-visible{
        outline:3px solid rgba(18,140,75,.25);
        outline-offset:3px;
      }
      .developer-credit__wa-main{
        display:flex;
        align-items:center;
        gap:9px;
        min-width:0;
      }
      .developer-credit__wa-icon{
        flex:0 0 28px;
        width:28px;
        height:28px;
        display:grid;
        place-items:center;
        border-radius:50%;
        background:rgba(255,255,255,.18);
        font-size:15px;
      }
      .developer-credit__wa-copy{
        display:flex;
        flex-direction:column;
        min-width:0;
      }
      .developer-credit__wa-copy strong{
        font-size:11.5px;
        line-height:1.2;
      }
      .developer-credit__wa-copy span{
        margin-top:2px;
        color:rgba(255,255,255,.86);
        font-size:9.5px;
        letter-spacing:.02em;
      }
      .developer-credit__arrow{
        font-size:17px;
        line-height:1;
      }
      .developer-credit__legal{
        position:relative;
        z-index:1;
        margin:11px 0 0;
        padding-top:10px;
        border-top:1px solid rgba(13,116,125,.13);
        color:#627a7d;
        font-size:9px;
        line-height:1.45;
        text-align:center;
      }
      @media(max-width:900px){
        .developer-credit{margin-bottom:18px;}
      }
      @media print{
        .developer-credit{display:none!important;}
      }
    `;
    document.head.appendChild(style);

    const card=document.createElement('section');
    card.className='developer-credit';
    card.setAttribute('aria-label','Informasi pengembang dan hak cipta');
    card.innerHTML=`
      <div class="developer-credit__top">
        <div class="developer-credit__mark" aria-hidden="true">©</div>
        <div>
          <span class="developer-credit__eyebrow">Developer & Copyright</span>
          <strong class="developer-credit__name">Syaeful Imam Al Kusyaeri</strong>
        </div>
      </div>
      <p class="developer-credit__address">Blok Selasa, Desa Kertabasuki, Kecamatan Maja, Kabupaten Majalengka, Jawa Barat, Indonesia</p>
      <a class="developer-credit__wa" href="https://wa.me/6285321296926?text=Halo%20Syaeful%20Imam%20Al%20Kusyaeri%2C%20saya%20ingin%20bertanya%20tentang%20MCU%20Document%20Studio." target="_blank" rel="noopener noreferrer" aria-label="Chat WhatsApp Syaeful Imam Al Kusyaeri">
        <span class="developer-credit__wa-main">
          <span class="developer-credit__wa-icon" aria-hidden="true">☎</span>
          <span class="developer-credit__wa-copy">
            <strong>Chat melalui WhatsApp</strong>
            <span>0853-2129-6926</span>
          </span>
        </span>
        <span class="developer-credit__arrow" aria-hidden="true">›</span>
      </a>
      <p class="developer-credit__legal">© 2026 Syaeful Imam Al Kusyaeri. All rights reserved.</p>
    `;

    if(actions && actions.parentNode===panel) panel.insertBefore(card,actions);
    else panel.appendChild(card);
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',renderCredit,{once:true});
  else renderCredit();
})();
