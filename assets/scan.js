'use strict';

(() => {
  const MAX_PDF_PAGES = 12;
  const MAX_FILES = 30;
  const MIN_TEXT_LENGTH = 100;
  const scanState = { files: [], worker: null, workerLang: '', detected: [], rawText: '', busy: false, batch: [], activeBatchIndex: -1 };

  const FIELD_LABELS = {
    nama:'Nama lengkap', tglLahir:'Tanggal lahir', jenisKelamin:'Jenis kelamin', tglPeriksa:'Tanggal periksa',
    tglDeklarasi:'Tanggal deklarasi', riwayatKerjaId:'Riwayat kerja', riwayatSakitId:'Riwayat sebelumnya', riwayatSakitJp:'Riwayat sebelumnya versi Jepang',
    gejalaSubId:'Gejala subjektif', gejalaSubJp:'Gejala subjektif versi Jepang', gejalaObjId:'Gejala objektif', gejalaObjJp:'Gejala objektif versi Jepang', tinggi:'Tinggi badan', berat:'Berat badan',
    lingkarPerut:'Lingkar perut', tekananDarah:'Tekanan darah', hb:'Hemoglobin', rbc:'Sel darah merah',
    got:'GOT / AST', gpt:'GPT / ALT', ggtp:'Gamma-GTP', ldl:'LDL', hdl:'HDL', trigliserida:'Trigliserida',
    gulaDarah:'Gula darah', gulaDarahBintang:'Tanda abnormal gula darah', glukosaUrine:'Glukosa urine',
    proteinUrine:'Protein urine', mataKanan:'Daya pandang kanan', mataKiri:'Daya pandang kiri',
    telingaKanan1000:'Pendengaran kanan 1.000 Hz', telingaKanan4000:'Pendengaran kanan 4.000 Hz',
    telingaKiri1000:'Pendengaran kiri 1.000 Hz', telingaKiri4000:'Pendengaran kiri 4.000 Hz',
    ekgId:'Hasil EKG', ekgJp:'Hasil EKG versi Jepang', pemeriksaanLainId:'Pemeriksaan lainnya', rontgenMetode:'Metode rontgen',
    rontgenTanggal:'Tanggal rontgen', rontgenNo:'Nomor film rontgen', rontgenTemuanId:'Temuan rontgen', rontgenTemuanJp:'Temuan rontgen versi Jepang',
    diagnosisId:'Diagnosis dokter', diagnosisJp:'Diagnosis dokter versi Jepang', fitStatus:'Status FIT / UNFIT', keteranganId:'Keterangan', keteranganJp:'Keterangan versi Jepang',
    tglDokumen:'Tanggal pembuatan dokumen', dokterNama:'Nama dokter', klinikNama:'Nama klinik'
  };

  function sEl(id){ return document.getElementById(id); }
  function escapeHtml(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function normalizeText(text){
    return String(text || '')
      .replace(/\r/g,'')
      .replace(/[‐‑‒–—−]/g,'-')
      .replace(/[，]/g,',')
      .replace(/[：]/g,':')
      .replace(/[／]/g,'/')
      .replace(/[．]/g,'.')
      .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0))
      .replace(/[Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0))
      .replace(/[⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g, ch => ({'⓪':'0','①':'1','②':'2','③':'3','④':'4','⑤':'5','⑥':'6','⑦':'7','⑧':'8','⑨':'9','⑩':'10','⑪':'11','⑫':'12','⑬':'13','⑭':'14','⑮':'15','⑯':'16','⑰':'17','⑱':'18','⑲':'19','⑳':'20'}[ch]||ch))
      .replace(/[ \t]+/g,' ')
      .replace(/ *\n */g,'\n')
      .replace(/\n{3,}/g,'\n\n')
      .trim();
  }
  function compactText(text){ return normalizeText(text).replace(/\s+/g,' ').trim(); }
  function toIsoDate(y,m,d){
    y=Number(y); m=Number(m); d=Number(d);
    if(y<100) y += y >= 70 ? 1900 : 2000;
    if(y<1900 || y>2100 || m<1 || m>12 || d<1 || d>31) return '';
    return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function parseDateString(value){
    const v=String(value||''); let m;
    m=v.match(/(19\d{2}|20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if(m) return toIsoDate(m[1],m[2],m[3]);
    m=v.match(/Tanggal\s*(\d{1,2})\s*Bulan\s*(\d{1,2})\s*Tahun\s*(\d{2,4})/i);
    if(m) return toIsoDate(m[3],m[2],m[1]);
    m=v.match(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/);
    if(m) return toIsoDate(m[3],m[2],m[1]);
    m=v.match(/\b(19\d{2}|20\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/);
    if(m) return toIsoDate(m[1],m[2],m[3]);
    return '';
  }
  function collectDatesWithPositions(value){
    const dates=[]; const patterns=[
      {re:/(19\d{2}|20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, order:m=>[m[1],m[2],m[3]]},
      {re:/Tanggal\s*(\d{1,2})\s*Bulan\s*(\d{1,2})\s*Tahun\s*(\d{2,4})/gi, order:m=>[m[3],m[2],m[1]]},
      {re:/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/g, order:m=>[m[3],m[2],m[1]]},
      {re:/\b(19\d{2}|20\d{2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/g, order:m=>[m[1],m[2],m[3]]}
    ];
    for(const item of patterns){
      let m;
      while((m=item.re.exec(value))){
        const [y,mo,d]=item.order(m); const iso=toIsoDate(y,mo,d);
        if(iso) dates.push({iso,index:m.index});
      }
    }
    return dates;
  }
  function findDateNear(text, labels, windowSize=180){
    for(const label of labels){
      const re=new RegExp(label,'i'); const match=re.exec(text); if(!match) continue;
      const start=Math.max(0,match.index-windowSize); const end=Math.min(text.length,match.index+match[0].length+windowSize);
      const window=text.slice(start,end); const labelPos=match.index-start; const dates=collectDatesWithPositions(window);
      if(dates.length){ dates.sort((a,b)=>Math.abs(a.index-labelPos)-Math.abs(b.index-labelPos)); return dates[0].iso; }
    }
    return '';
  }
  function findNumberWithUnit(text, labels, unitPattern, min, max, windowSize=220){
    for(const label of labels){
      const re=new RegExp(label,'i'); const match=re.exec(text); if(!match) continue;
      const window=text.slice(match.index,match.index+match[0].length+windowSize);
      const valueRe=new RegExp(`([*]?\\d{1,4}(?:[.,]\\d{1,3})?)\\s*(?:${unitPattern})`,'ig');
      let vm;
      while((vm=valueRe.exec(window))){
        const n=Number(vm[1].replace('*','').replace(',','.'));
        if(Number.isFinite(n)&&n>=min&&n<=max) return vm[1].replace('*','').replace(',','.');
      }
    }
    return '';
  }
  function findNumberWithUnitBounded(text, labels, stopLabels, unitPattern, min, max, windowSize=260){
    for(const label of labels){
      const re=new RegExp(label,'i'); const match=re.exec(text); if(!match) continue;
      let end=Math.min(text.length,match.index+match[0].length+windowSize);
      const afterStart=match.index+match[0].length;
      for(const stop of stopLabels){
        const stopMatch=new RegExp(stop,'i').exec(text.slice(afterStart,end));
        if(stopMatch) end=Math.min(end,afterStart+stopMatch.index);
      }
      const window=text.slice(match.index,end);
      const valueRe=new RegExp(`([*]?\\d{1,4}(?:[.,]\\d{1,3})?)\\s*(?:${unitPattern})`,'ig');
      let vm;
      while((vm=valueRe.exec(window))){
        const n=Number(vm[1].replace('*','').replace(',','.'));
        if(Number.isFinite(n)&&n>=min&&n<=max) return vm[1].replace('*','').replace(',','.');
      }
    }
    return '';
  }
  function findNumberAroundUnit(text, labels, unitPattern, min, max, windowSize=160){
    for(const label of labels){
      const re=new RegExp(label,'i'); const match=re.exec(text); if(!match) continue;
      const start=Math.max(0,match.index-windowSize); const end=Math.min(text.length,match.index+match[0].length+windowSize);
      const window=text.slice(start,end); const labelPos=match.index-start;
      const valueRe=new RegExp(`([*]?\\d{1,4}(?:[.,]\\d{1,3})?)\\s*(?:${unitPattern})`,'ig');
      const candidates=[]; let vm;
      while((vm=valueRe.exec(window))){
        const n=Number(vm[1].replace('*','').replace(',','.'));
        if(Number.isFinite(n)&&n>=min&&n<=max) candidates.push({value:vm[1].replace('*','').replace(',','.'),distance:Math.abs(vm.index-labelPos)});
      }
      if(candidates.length){ candidates.sort((a,b)=>a.distance-b.distance); return candidates[0].value; }
    }
    return '';
  }
  function findValueAround(text, labels, valuePattern, windowSize=180){
    for(const label of labels){
      const re=new RegExp(label,'i'); const match=re.exec(text); if(!match) continue;
      const start=Math.max(0,match.index-windowSize); const end=Math.min(text.length,match.index+match[0].length+windowSize);
      const window=text.slice(start,end); const labelPos=match.index-start; const vr=new RegExp(valuePattern,'ig'); const candidates=[]; let vm;
      while((vm=vr.exec(window))){ candidates.push({value:(vm[1]||vm[0]||'').trim(),distance:Math.abs(vm.index-labelPos)}); }
      if(candidates.length){ candidates.sort((a,b)=>a.distance-b.distance); return candidates[0].value; }
    }
    return '';
  }
  function findValueAfter(text, labels, valuePattern, windowSize=220){
    for(const label of labels){
      const re = new RegExp(label,'i'); const match = re.exec(text); if(!match) continue;
      const window = text.slice(match.index, match.index + windowSize);
      const vr = new RegExp(valuePattern,'i'); const vm=vr.exec(window); if(vm) return (vm[1] || vm[0] || '').trim();
    }
    return '';
  }
  function cleanCandidate(value){
    return String(value||'').replace(/^[\s:;,.\-–—/]+|[\s:;,.\-–—/]+$/g,'').replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  }
  function addResult(results, field, value, confidence=0.8, source='Analisis dokumen'){
    if(value === undefined || value === null || value === '') return;
    let normalized = typeof value === 'string' ? cleanCandidate(value) : value;
    if(typeof normalized === 'string') normalized=normalized.replace(/\bnonnal\b/gi,'normal').replace(/\bBRAD[I1l]KARDIA\b/gi,'BRADIKARDIA');
    if(normalized === '') return;
    if(/OCR/i.test(source) && /Jp$/.test(field) && normalized !== '特になし') confidence=Math.min(confidence,0.58);
    if(results.some(item => item.field === field)) return;
    results.push({field, label:FIELD_LABELS[field] || field, value:normalized, confidence, source});
  }
  function lineCandidates(text){ return normalizeText(text).split('\n').map(line=>line.trim()).filter(Boolean); }
  function layoutSegments(text){
    return String(text||'').replace(/\r/g,'').split('\n').flatMap(line=>line.split(/\s{2,}/)).map(part=>normalizeText(part)).filter(Boolean);
  }
  function allDates(text){
    const out=[]; const patterns=[
      /(19\d{2}|20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
      /Tanggal\s*(\d{1,2})\s*Bulan\s*(\d{1,2})\s*Tahun\s*(\d{2,4})/gi,
      /\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/g
    ];
    for(const re of patterns){ let m; while((m=re.exec(text))){ const iso=re.source.startsWith('Tanggal')?toIsoDate(m[3],m[2],m[1]):(re.source.startsWith('\\b')?toIsoDate(m[3],m[2],m[1]):toIsoDate(m[1],m[2],m[3])); if(iso&&!out.includes(iso)) out.push(iso); } }
    return out;
  }
  function extractName(text, page2){
    const source = page2 || text; let m;
    m=source.match(/(?:氏\s*名|N\s*A\s*M\s*A|Nama(?:\s+lengkap)?)\s*[:\-]?\s*([A-Z][A-Z .,'’-]{4,60})/i);
    if(m){
      let name=m[1].replace(/\b(?:生年|Tanggal|検診|Jenis|Laki|Perempuan|Usia).*$/i,'').trim();
      if(name.length>=4) return name.toUpperCase();
    }
    const banned=/FORMAT|REFERENSI|LAPORAN|PEMERIKSAAN|KESEHATAN|PRIBADI|TANGGAL|NAMA|DIAGNOSIS|DOKTER|JEPANG|TAHUN|BULAN|FIT|UNFIT|TES|ANEMIA|BMI|SINUS|BRADIKARDIA|NORMAL|GANGGUAN|KOLESTEROL|GLUKOSA|PROTEIN/;
    const lines=lineCandidates(source); const collectFromLine=line=>{
      const found=[];
      if(/^[A-Z][A-Z .,'’-]{7,55}$/.test(line)&&line.trim().split(/\s+/).length>=2) found.push(line.trim());
      for(const match of line.matchAll(/\b([A-Z]{2,}(?:\s+[A-Z]{2,}){1,4})\b/g)) found.push(match[1].trim());
      return found.filter(value=>value.length>=8&&!banned.test(value));
    };
    const nameIndexes=lines.map((line,index)=>/N\s*A\s*M\s*A|Nama(?:\s+lengkap)?|氏\s*名/i.test(line)?index:-1).filter(index=>index>=0);
    const near=[];
    nameIndexes.forEach(index=>{ for(let i=Math.max(0,index-3);i<=Math.min(lines.length-1,index+3);i++) near.push(...collectFromLine(lines[i])); });
    if(near.length) return [...new Set(near)].sort((a,b)=>b.length-a.length)[0];
    const candidates=[]; lines.slice(0,Math.max(12,Math.ceil(lines.length*.45))).forEach(line=>candidates.push(...collectFromLine(line)));
    return [...new Set(candidates)].sort((a,b)=>b.length-a.length)[0] || '';
  }
  function extractParagraphByKeyword(lines, keywordRegex, valueRegex, maxFollowing=5){
    const idx=lines.findIndex(line=>keywordRegex.test(line)); if(idx<0) return '';
    const values=[];
    for(let i=idx+1;i<Math.min(lines.length,idx+1+maxFollowing);i++){
      const line=lines[i]; if(valueRegex.test(line)) values.push(line); else if(values.length) break;
    }
    return values.join('\n');
  }
  function extractMappedData(rawText, origin='Dokumen'){
    const raw=String(rawText||'').replace(/\r/g,'');
    const text=normalizeText(raw); const compact=compactText(text);
    const pages=raw.split(/\f|---\s*PAGE\s*\d+\s*---/i).map(part=>part.trim()).filter(Boolean);
    const p1Page=pages.find(page=>/Laporan\s*Penerima\s*Pemeriksaan|受\s*診\s*者\s*の\s*申\s*告\s*書/i.test(compactText(page)));
    const p2Page=pages.find(page=>/Lembar\s*Pemeriksaan\s*Kesehatan\s*Pribadi|健康診断個人票|Tekanan\s*darah.*Hemoglobin/i.test(compactText(page)));
    const p3Page=pages.find(page=>/Diagnosis\s*dokter.*(?:Lingkar\s*perut|rontgen)|医師の診断.*(?:腹囲|胸部)/i.test(compactText(page)));
    const p1=p1Page||pages[0]||raw;
    const p2=p2Page||pages[pages.length>=3?1:0]||raw;
    const p3=p3Page||pages[pages.length>=3?2:Math.min(1,pages.length-1)]||raw;
    const p2c=compactText(p2), p3c=compactText(p3); const results=[];
    const sourceConfidence = origin === 'Teks PDF' ? 0.96 : 0.78;

    addResult(results,'nama',extractName(text,p2),sourceConfidence,origin);
    const identityDates=allDates(p2c.slice(0,700));
    addResult(results,'tglLahir',identityDates[0] || findDateNear(p2c,['Tanggal\\s*lahir','生\\s*年\\s*月\\s*日','Date\\s*of\\s*birth','\\bDOB\\b'],220),sourceConfidence,origin);
    addResult(results,'tglPeriksa',identityDates[1] || findDateNear(p2c,['Tanggal\\s*periksa','検診年月日','Tanggal\\s*pemeriksaan','Exam\\s*date'],300),sourceConfidence,origin);

    const p1Date=p1Page?findDateNear(compactText(p1Page),['作\\s*成\\s*年\\s*月\\s*日','Tanggal\\s*pembuatan'],180):'';
    const p3Dates=p3Page?allDates(compactText(p3Page)):[];
    const p3Date=p3Page?(findDateNear(compactText(p3Page),['作\\s*成\\s*年\\s*月\\s*日','Tanggal\\s*pembuatan'],220)||p3Dates[p3Dates.length-1]||''):'';
    if(p1Date) addResult(results,'tglDeklarasi',p1Date,sourceConfidence,origin);
    if(p3Date) addResult(results,'tglDokumen',p3Date,sourceConfidence,origin);

    const explicitGender=compact.match(/(?:Jenis\s*kelamin|Sex)\s*[:=\-]\s*(Laki[- ]?laki|Perempuan|Male|Female)\b/i);
    const markedMale=/(?:①|✓|✔)\s*(?:男|Laki[- ]?laki|Male)|(?:男|Laki[- ]?laki|Male)\s*(?:①|✓|✔)/i.test(compact);
    const markedFemale=/(?:①|✓|✔)\s*(?:女|Perempuan|Female)|(?:女|Perempuan|Female)\s*(?:①|✓|✔)/i.test(compact);
    if(explicitGender){ const g=explicitGender[1].toLowerCase(); addResult(results,'jenisKelamin',/perempuan|female/.test(g)?'P':'L',0.9,origin); }
    else if(markedMale&&!markedFemale) addResult(results,'jenisKelamin','L',0.76,origin);
    else if(markedFemale&&!markedMale) addResult(results,'jenisKelamin','P',0.76,origin);

    const bp=findValueAfter(p2c,['Tekanan\\s*darah','血\\s*圧','Blood\\s*pressure'],'(\\d{2,3}\\s*[/\\\\]\\s*\\d{2,3})',180);
    addResult(results,'tekananDarah',bp.replace(/\s/g,''),sourceConfidence,origin);
    addResult(results,'hb',findNumberWithUnitBounded(p2c,['Tes\\s*anemia','Hemoglobin','血\\s*色\\s*素\\s*量','\\bHb\\b'],['Jumlah\\s*sel\\s*darah\\s*merah','赤血球数','\\bRBC\\b'],'g\\s*[/\\\\]?\\s*d[lℓLet¢0]?',4,25,300),sourceConfidence,origin);
    addResult(results,'rbc',findNumberWithUnitBounded(p2c,['Jumlah\\s*sel\\s*darah\\s*merah','赤血球数','\\bRBC\\b'],['Riwayat\\s*sebelumnya','Tes\\s*fungsi','肝機能検査','G\\s*O\\s*T'],'(?:(?:万|J7)\\s*[/\\\\]?\\s*mm|10\\s*[.^x×]?\\s*4|million|juta)',1,1500,300),sourceConfidence,origin);
    addResult(results,'got',findNumberWithUnitBounded(p2c,['G\\s*O\\s*T','\\bAST\\b','\\bSGOT\\b'],['G\\s*P\\s*T','\\bALT\\b','\\bSGPT\\b'],'(?:μ|U|IU|u|w)\\s*[/\\\\]?\\s*[lℓLet]',1,999,220),sourceConfidence,origin);
    addResult(results,'gpt',findNumberWithUnitBounded(p2c,['G\\s*P\\s*T','\\bALT\\b','\\bSGPT\\b'],['γ\\s*-?\\s*G\\s*T\\s*P','Gamma\\s*-?\\s*GTP','GGT'],'(?:μ|U|IU|u|w)\\s*[/\\\\]?\\s*[lℓLet]',1,999,220),sourceConfidence,origin);
    addResult(results,'ggtp',findNumberWithUnitBounded(p2c,['γ\\s*-?\\s*G\\s*T\\s*P','Gamma\\s*-?\\s*GTP','GGT'],['LDL','血中脂質検査','Gejala\\s*yang\\s*subjektif'],'(?:μ|U|IU|u|w)\\s*[/\\\\]?\\s*[lℓLet]',1,999,240),sourceConfidence,origin);
    addResult(results,'ldl',findNumberWithUnitBounded(p2c,['LDL\\s*(?:コレステロール|cholesterol|kolesterol)?'],['HDL'],'mg\\s*[/\\\\]?\\s*d[lℓLet¢0]?',1,999,260),sourceConfidence,origin);
    addResult(results,'hdl',findNumberWithUnitBounded(p2c,['HDL\\s*(?:コレステロール|cholesterol|kolesterol)?'],['Trigliserida','Triglyceride','トリグリセライド'],'mg\\s*[/\\\\]?\\s*d[lℓLet¢0]?',1,999,260),sourceConfidence,origin);
    const trigValue=findNumberWithUnitBounded(p2c,['Trigliserida','Triglyceride','トリグリセライド'],['Pemeriksaan\\s*gula\\s*darah','Gula\\s*darah','血\\s*糖','Gejala\\s*objektif'],'mg\\s*[/\\\\]?\\s*d[lℓLet¢0]?',1,1500,280) || findNumberAroundUnit(p2c,['Trigliserida','Triglyceride'],'mg\\s*[/\\\\]?\\s*d[lℓLet¢0]?',1,1500,130);
    addResult(results,'trigliserida',trigValue,sourceConfidence,origin);
    const glucose=findNumberWithUnitBounded(p2c,['Pemeriksaan\\s*gula\\s*darah','Gula\\s*darah','血\\s*糖','Glucose(?!\\s*urine)'],['Tes\\s*urine','尿\\s*検\\s*査','Glukosa','Protein'],'mg\\s*[/\\\\]?\\s*d[lℓLet¢0]?',20,800,280) || findNumberAroundUnit(p2c,['Pemeriksaan\\s*gula\\s*darah','Gula\\s*darah'],'mg\\s*[/\\\\]?\\s*d[lℓLet¢0]?',20,800,140);
    addResult(results,'gulaDarah',glucose,sourceConfidence,origin);
    if(/\*\s*\d{2,3}\s*mg\s*[/\\]?\s*d[lℓLe¢]/i.test(p2c)) addResult(results,'gulaDarahBintang',true,sourceConfidence,origin);

    addResult(results,'tinggi',findNumberAroundUnit(p2c,['Tinggi\\s*badan','身\\s*長','Height'],'cm',80,250,170),sourceConfidence,origin);
    addResult(results,'berat',findNumberAroundUnit(p2c,['Berat\\s*badan','体\\s*重','Weight'],'kg',20,350,190),sourceConfidence,origin);
    addResult(results,'lingkarPerut',findNumberAroundUnit(p3c,['Lingkar\\s*perut','腹\\s*囲','Waist'],'cm',30,250,180),sourceConfidence,origin);

    const urineGlucose=findValueAfter(p2c,['Glukosa','糖'],'(Negatif|Negative|Positif|Positive|ネガティブ|ポジティブ)',180);
    const urineProtein=findValueAfter(p2c,['Protein','蛋\\s*白'],'(Negatif|Negative|Positif|Positive|ネガティブ|ポジティブ)',180);
    if(urineGlucose) addResult(results,'glukosaUrine',/pos|ポジ/i.test(urineGlucose)?'Positif':'Negatif',sourceConfidence,origin);
    if(urineProtein) addResult(results,'proteinUrine',/pos|ポジ/i.test(urineProtein)?'Positif':'Negatif',sourceConfidence,origin);

    const visionR=findValueAround(p3c,['Kanan','視力[\\s\\S]{0,35}?右','Right\\s*(?:vision|eye)'],'\\b([012](?:[.,]\\d{1,2})?)\\b',110);
    const visionL=findValueAround(p3c,['Kiri','視力[\\s\\S]{0,120}?左','Left\\s*(?:vision|eye)'],'\\b([012](?:[.,]\\d{1,2})?)\\b',110);
    addResult(results,'mataKanan',visionR.replace(',','.'),0.78,origin); addResult(results,'mataKiri',visionL.replace(',','.'),0.78,origin);

    const page2Lines=layoutSegments(p2);
    const paparan=page2Lines.filter(line=>/^(?:Tidak ada )?paparan|exposure/i.test(line)).slice(0,3).join('\n');
    addResult(results,'riwayatKerjaId',paparan,0.78,origin);
    const surgeryParts=page2Lines.filter(line=>/^(?:Operasi|Surgery)|摘出術|手術/i.test(line)).slice(0,3);
    if(surgeryParts.length){ const latin=surgeryParts.filter(x=>/operasi|surgery/i.test(x)).join('\n'); if(latin) addResult(results,'riwayatSakitId',latin,0.78,origin); const jp=surgeryParts.filter(x=>/[ぁ-んァ-ン一-龯]/.test(x)).join('\n'); if(jp) addResult(results,'riwayatSakitJp',jp,0.78,origin); }
    const noFindings=page2Lines.filter(line=>/^(?:Secara\s+Khusus\s+tidak\s+Ada|特になし|no\s+(?:special\s+)?findings)(?:\s*\/\s*特になし)?$/i.test(line));
    const idFindings=noFindings.filter(line=>!/特になし/.test(line) || /Secara/i.test(line));
    const jpFindings=noFindings.filter(line=>/特になし/.test(line));
    if(idFindings[0]) addResult(results,'gejalaSubId',idFindings[0].replace(/\s*\/\s*特になし.*/,'').trim(),0.74,origin);
    if(idFindings[1]) addResult(results,'gejalaObjId',idFindings[1].replace(/\s*\/\s*特になし.*/,'').trim(),0.74,origin);
    if(jpFindings[0]) addResult(results,'gejalaSubJp','特になし',0.74,origin);
    if(jpFindings[1]) addResult(results,'gejalaObjJp','特になし',0.74,origin);

    const ekgLine=page2Lines.find(line=>/SINUS|ECG|EKG|洞性|BRAD[I1]KARD/i.test(line));
    const ekgVariant=page2Lines.find(line=>/Varian\s*normal|正常亜型/i.test(line));
    if(ekgLine){
      const mainParts=ekgLine.split(/\s*\/\s*/); const variantParts=(ekgVariant||'').replace(/[（）()]/g,'').split(/\s*\/\s*/);
      addResult(results,'ekgId',[mainParts[0],variantParts[0]].filter(Boolean).join('\n'),0.82,origin);
      const ekgJapanese=[mainParts[1],variantParts[1]].filter(Boolean).join('\n'); if(/[ぁ-んァ-ン一-龯]/.test(ekgJapanese)) addResult(results,'ekgJp',ekgJapanese,0.82,origin);
    }
    const otherMatch=p2c.match(/Pemeriksaan\s+lainnya\s+([^\f]{1,50}?)(?=\s*$|\s*ＢＭＩ|\s*BMI)/i);
    if(otherMatch) addResult(results,'pemeriksaanLainId',otherMatch[1],0.7,origin);

    const xrayDates=allDates(p3c); const xrayDate=findDateNear(p3c,['Diambil\\s*tanggal','撮影','Tanggal\\s*rontgen','X-?ray\\s*date'],180)||(xrayDates.length>1?xrayDates[0]:'');
    addResult(results,'rontgenTanggal',xrayDate,sourceConfidence,origin);
    const film=findValueAfter(p3c,['No\\.?\\s*film','フィルム番号','Film\\s*(?:number|no\\.?)'],'(?:No\\.?\\s*)?([A-Z0-9][A-Z0-9./-]{4,30})',180);
    if(/\d/.test(film)) addResult(results,'rontgenNo',film,0.84,origin);
    const method=/Tidak\s+langsung|間接/i.test(p3c) && !/Langsung\s*[:\-]?\s*(?:✓|✔|1)/i.test(p3c) ? '' : (/Langsung|直接/i.test(p3c)?'Langsung':'');
    if(method) addResult(results,'rontgenMetode',method,0.63,origin);
    const page3Lines=layoutSegments(p3);
    const findingSegment=page3Lines.find(line=>/^[‘’'\"]?\s*(?:Temuan|Finding)\s*:/i.test(line));
    const findingJpSegment=page3Lines.find(line=>/^所見\s*[:：]/.test(line));
    if(findingSegment) addResult(results,'rontgenTemuanId',findingSegment.replace(/^[‘’'\"]?\s*(?:Temuan|Finding)\s*:\s*/i,''),0.88,origin);
    else {
      const finding=findValueAfter(p3c,['Temuan\\s*:','Finding\\s*:'],'([^.;\n]{3,60})',120);
      if(finding) addResult(results,'rontgenTemuanId',finding.replace(/^Temuan\s*:\s*/i,''),0.72,origin);
    }
    if(findingJpSegment) addResult(results,'rontgenTemuanJp',findingJpSegment.replace(/^所見\s*[:：]\s*/,''),0.86,origin);

    let diagnosisLine=page3Lines.find(line=>/gula darah puasa meningkat|空腹時血糖値/i.test(line));
    if(!diagnosisLine){
      const start=page3Lines.findIndex(line=>/Diagnosis\s*dokter|医師の診断/i.test(line));
      const end=page3Lines.findIndex((line,index)=>index>start&&/判定|Diagnosis\s*:/i.test(line));
      if(start>=0){
        const candidates=page3Lines.slice(start+1,end>start?end:start+35).filter(line=>/[A-Za-zぁ-んァ-ン一-龯]{4}/.test(line)&&!/(Lingkar|Daya|Kanan|Kiri|BMI|腹囲|視力|pandang|tahun|歳)/i.test(line));
        diagnosisLine=candidates.sort((a,b)=>b.length-a.length)[0]||'';
      }
    }
    if(diagnosisLine){
      const cleaned=diagnosisLine.replace(/^\d+\s*[.)]?\s*/,''); const parts=cleaned.split(/\s*\/\s*/);
      addResult(results,'diagnosisId',parts[0],0.88,origin);
      const diagJp=parts.slice(1).join(' / '); if(/[ぁ-んァ-ン一-龯]/.test(diagJp)) addResult(results,'diagnosisJp',diagJp,0.88,origin);
    }
    const markedFit=/(?:①|✓|✔)\s*(?:合|FIT)|(?:合|FIT)\s*(?:①|✓|✔)/i.test(p3c);
    const markedUnfit=/(?:①|✓|✔)\s*(?:否|UNFIT)|(?:否|UNFIT)\s*(?:①|✓|✔)/i.test(p3c);
    if(/FIT\s+TO\s+WORK|LAYAK\s+KERJA|合格/i.test(p3c) && !/UNFIT\s+TO\s+WORK/i.test(p3c) || markedFit&&!markedUnfit) addResult(results,'fitStatus','FIT',0.86,origin);
    if(/UNFIT\s+TO\s+WORK|TIDAK\s+LAYAK\s+KERJA/i.test(p3c) || markedUnfit&&!markedFit) addResult(results,'fitStatus','UNFIT',0.9,origin);
    const noteLines=page3Lines.filter(line=>/^(?:Secara\s+Khusus\s+tidak\s+Ada|特になし)(?:\s*\/\s*特になし)?$/i.test(line));
    if(noteLines.length){ addResult(results,'keteranganId',noteLines[noteLines.length-1].replace(/\s*\/\s*特になし.*/,'').trim(),0.78,origin); if(noteLines.some(x=>/特になし/.test(x))) addResult(results,'keteranganJp','特になし',0.78,origin); }

    if(/1\s*Normal[\s\S]{0,80}2\s*Gangguan/i.test(p3c) || /(?:①|1)\s*所見なし/i.test(p3c)){
      ['telingaKanan1000','telingaKanan4000','telingaKiri1000','telingaKiri4000'].forEach(field=>addResult(results,field,'Normal',0.68,origin));
    }

    const doctor=findValueAfter(compact,['Nama\\s*dokter','Dokter\\s*pemeriksa','Physician\\s*name','医師名'],'((?:dr\\.?\\s*)?[A-Z][A-Za-z .,-]{4,60})',160);
    if(doctor && !/diagnosis|pemeriksaan/i.test(doctor)) addResult(results,'dokterNama',doctor,0.7,origin);
    const clinic=findValueAfter(compact,['Nama\\s*klinik','Clinic\\s*name','Nama\\s*laboratorium'],'([A-Z][A-Za-z0-9 .,&-]{4,80})',160);
    if(clinic && !/pemeriksaan|darah|urine/i.test(clinic)) addResult(results,'klinikNama',clinic,0.7,origin);

    return results;
  }

  function updateProgress(value, message){
    const p=sEl('scanProgress'); if(p) p.value=Math.max(0,Math.min(100,Math.round(value)));
    const status=sEl('scanStatus'); if(status) status.textContent=message || '';
  }
  function setBusy(busy){
    scanState.busy=busy;
    ['btnAnalyzeScan','btnParseRaw','scanFilesInput','btnSaveAllBatch'].forEach(id=>{ const n=sEl(id); if(n) n.disabled=busy; });
    const b=sEl('btnAnalyzeScan'); if(b) b.textContent=busy?'Menganalisis batch...':'Analisis batch dan isi otomatis';
  }
  function updateFileList(){
    const box=sEl('scanFileList');
    if(!scanState.files.length){ box.textContent='Belum ada file dipilih.'; return; }
    const total=scanState.files.reduce((sum,file)=>sum+file.size,0);
    box.textContent=scanState.files.map((file,i)=>`${i+1}. ${file.name} (${Math.max(1,Math.round(file.size/1024))} KB)`).join('\n')+`\nTotal: ${scanState.files.length} file, ${(total/1024/1024).toFixed(2)} MB`;
  }
  function confidenceClass(c){ return c>=0.85?'high':c>=0.68?'medium':'low'; }
  function displayResults(results, rawText){
    scanState.detected=results; scanState.rawText=rawText;
    const container=sEl('scanResults'); container.hidden=false;
    sEl('scanResultCount').textContent=`${results.length} data terdeteksi`;
    sEl('scanResultBody').innerHTML=results.length?results.map(item=>`<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(String(item.value))}</td><td><span class="confidence ${confidenceClass(item.confidence)}">${Math.round(item.confidence*100)}%</span></td></tr>`).join(''):'<tr><td colspan="3">Tidak ada data yang dapat dipetakan secara aman.</td></tr>';
    sEl('scanRawText').value=rawText;
  }
  function applyDetected(results){
    const overwrite=sEl('scanOverwrite').checked; let applied=0;
    results.forEach(item=>{
      const target=sEl(item.field); if(!target || item.confidence<0.60) return;
      const current=target.type==='checkbox'?target.checked:String(target.value||'').trim();
      const hasValue=target.type==='checkbox'?Boolean(current):current!=='';
      if(hasValue && !overwrite) return;
      setInputValue(item.field,item.value); applied++;
    });
    render();
    showStatus(`${applied} kolom diisi. Periksa kembali sebelum mencetak.`);
    return applied;
  }

  async function createOcrWorker(){
    const lang=sEl('scanOcrLanguage')?.value||'eng';
    if(scanState.worker && scanState.workerLang===lang) return scanState.worker;
    if(scanState.worker){ await scanState.worker.terminate(); scanState.worker=null; }
    if(!window.Tesseract) throw new Error('Mesin OCR lokal tidak tersedia.');
    updateProgress(2,`Memuat OCR lokal (${lang==='eng'?'Latin/Indonesia':'Latin + Jepang'})...`);
    scanState.worker=await Tesseract.createWorker(lang,Tesseract.OEM.LSTM,{
      workerPath:'assets/vendor/worker.min.js', corePath:'assets/vendor/tesseract-core', langPath:'assets/vendor/tessdata',
      logger:m=>{ if(typeof m.progress==='number') updateProgress(5+m.progress*80,`${m.status || 'OCR'} ${Math.round(m.progress*100)}%`); }
    });
    scanState.workerLang=lang;
    await scanState.worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:Tesseract.PSM.SPARSE_TEXT});
    return scanState.worker;
  }
  async function loadImageSource(file){
    if('createImageBitmap' in window){ try{return await createImageBitmap(file)}catch(error){console.warn(error)} }
    return await new Promise((resolve,reject)=>{ const url=URL.createObjectURL(file); const image=new Image(); image.onload=()=>{URL.revokeObjectURL(url);resolve(image)}; image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Gambar tidak dapat dibaca.'))}; image.src=url; });
  }
  async function imageFileToCanvas(file){
    const source=await loadImageSource(file); const sw=source.width||source.naturalWidth, sh=source.height||source.naturalHeight;
    if(!(sw>0)||!(sh>0)) throw new Error('Ukuran gambar tidak valid.');
    const max=2400, scale=Math.min(1,max/Math.max(sw,sh));
    const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(sw*scale)); canvas.height=Math.max(1,Math.round(sh*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.fillStyle='#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(source,0,0,canvas.width,canvas.height);
    if(typeof source.close==='function') source.close(); return enhanceCanvas(canvas);
  }
  function enhanceCanvas(source){
    const canvas=document.createElement('canvas'); canvas.width=source.width; canvas.height=source.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(source,0,0);
    const image=ctx.getImageData(0,0,canvas.width,canvas.height), data=image.data;
    for(let i=0;i<data.length;i+=4){ const gray=.299*data[i]+.587*data[i+1]+.114*data[i+2]; const v=Math.max(0,Math.min(255,(gray-128)*1.18+128)); data[i]=data[i+1]=data[i+2]=v; data[i+3]=255; }
    ctx.putImageData(image,0,0); return canvas;
  }
  async function ocrCanvas(canvas, pageLabel){ const worker=await createOcrWorker(); updateProgress(8,`OCR ${pageLabel}...`); const result=await worker.recognize(canvas); return result.data.text||''; }
  function itemsToLines(items){
    const rows=[]; items.filter(item=>item.str&&item.str.trim()).forEach(item=>{ const y=item.transform?.[5]??0,x=item.transform?.[4]??0,width=Number(item.width||0); let row=rows.find(r=>Math.abs(r.y-y)<3); if(!row){row={y,items:[]};rows.push(row)} row.items.push({x,width,text:item.str}); });
    return rows.sort((a,b)=>b.y-a.y).map(row=>{ const ordered=row.items.sort((a,b)=>a.x-b.x); let line='',end=null; ordered.forEach(item=>{const gap=end===null?0:item.x-end;line+=(end===null?'':gap>22?'      ':' ')+item.text;end=item.x+Math.max(item.width,item.text.length*3)});return line.trim()}).filter(Boolean).join('\n');
  }
  async function extractPdf(file,forceOcr){
    if(!window.pdfjsLib) throw new Error('Pembaca PDF tidak tersedia.');
    pdfjsLib.GlobalWorkerOptions.workerSrc='assets/vendor/pdfjs/pdf.worker.min.js';
    const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'assets/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'assets/vendor/pdfjs/standard_fonts/'}).promise;
    const pages=Math.min(pdf.numPages,12); let directText='';
    if(!forceOcr){
      for(let i=1;i<=pages;i++){ const page=await pdf.getPage(i); const content=await page.getTextContent(); directText+=`\n--- PAGE ${i} ---\n${itemsToLines(content.items)}\n`; }
      if(directText.replace(/[^A-Za-z0-9ぁ-んァ-ン一-龯]/g,'').length>=100) return {text:directText,origin:'Teks PDF'};
    }
    let ocrText='';
    for(let i=1;i<=pages;i++){ const page=await pdf.getPage(i),base=page.getViewport({scale:1}),scale=Math.min(3,2100/base.width),viewport=page.getViewport({scale}); const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);await page.render({canvasContext:ctx,viewport}).promise;ocrText+=`\n--- PAGE ${i} ---\n${await ocrCanvas(enhanceCanvas(canvas),`halaman ${i}/${pages}`)}\n`; }
    return {text:ocrText,origin:'OCR PDF'};
  }
  async function extractFilesLocal(files,forceOcr){
    let combined='',origins=[];
    for(let i=0;i<files.length;i++){ const file=files[i]; if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){const out=await extractPdf(file,forceOcr);combined+=`\n${out.text}\n`;origins.push(out.origin)}else{const canvas=await imageFileToCanvas(file);combined+=`\n--- PAGE ${i+1} ---\n${await ocrCanvas(canvas,`gambar ${i+1}/${files.length}`)}\n`;origins.push('OCR gambar')} }
    return {text:normalizeText(combined),origin:origins.every(x=>x==='Teks PDF')?'Teks PDF':origins.join(' + ')};
  }

  const geminiRuntime={config:null};
  async function loadGeminiConfig(){
    if(geminiRuntime.config) return geminiRuntime.config;
    try{
      const res=await fetch('/api/gemini-config',{cache:'no-store'});
      if(!res.ok) throw new Error('Gagal membaca konfigurasi Gemini.');
      geminiRuntime.config=await res.json();
    }catch{
      geminiRuntime.config={hasApiKey:false,primaryModel:'gemini-3.5-flash',fallbackModels:['gemini-3.1-flash-lite','gemini-2.5-flash-lite'],allowBrowserOverride:false};
    }
    return geminiRuntime.config;
  }
  function updateModeUi(){
    const mode='gemini';
    const useGemini=mode==='gemini';
    document.querySelectorAll('.local-ocr-option').forEach(node=>node.hidden=useGemini);
  }
  async function applyGeminiConfigToUi(){
    const cfg=await loadGeminiConfig();
    const hint=sEl('geminiConfigHint');
    if(hint) hint.innerHTML=cfg.hasApiKey ? 'API key disimpan aman di server Railway. Dashboard ini tidak menampilkan atau menyimpan API key.' : 'GEMINI_API_KEY belum ditemukan di server Railway. Tambahkan pada menu Variables.';
    const fb=sEl('geminiFallbackHint');
    const chain=[cfg.primaryModel, ...(cfg.fallbackModels||[])].filter(Boolean);
    if(fb) fb.textContent=`Perpindahan model otomatis aktif: ${chain.join(' → ') || 'belum diatur'}.`;
    updateModeUi();
  }

  const GEMINI_FIELDS={
    nama:'string',tglLahir:'string',jenisKelamin:'string',tglPeriksa:'string',tglDeklarasi:'string',riwayatKerjaId:'string',riwayatKerjaJp:'string',riwayatSakitId:'string',riwayatSakitJp:'string',gejalaSubId:'string',gejalaSubJp:'string',gejalaObjId:'string',gejalaObjJp:'string',tinggi:'string',berat:'string',lingkarPerut:'string',tekananDarah:'string',hb:'string',rbc:'string',got:'string',gpt:'string',ggtp:'string',ldl:'string',hdl:'string',trigliserida:'string',gulaDarah:'string',gulaDarahBintang:'boolean',glukosaUrine:'string',proteinUrine:'string',mataKanan:'string',mataKiri:'string',alatBantuMata:'boolean',telingaKanan1000:'string',telingaKanan4000:'string',telingaKiri1000:'string',telingaKiri4000:'string',ekgId:'string',ekgJp:'string',pemeriksaanLainId:'string',pemeriksaanLainJp:'string',rontgenMetode:'string',rontgenTanggal:'string',rontgenNo:'string',rontgenTemuanId:'string',rontgenTemuanJp:'string',diagnosisId:'string',diagnosisJp:'string',fitStatus:'string',keteranganId:'string',keteranganJp:'string',tglDokumen:'string',dokterNama:'string',klinikNama:'string'
  };
  function geminiSchema(){
    const properties={}; Object.entries(GEMINI_FIELDS).forEach(([key,type])=>{properties[key]={type:type==='boolean'?'boolean':'string'}});
    return {type:'object',properties:{data:{type:'object',properties,additionalProperties:false},warnings:{type:'array',items:{type:'string'}}},required:['data'],additionalProperties:false};
  }
  const GEMINI_PROMPT=`Anda adalah sistem ekstraksi data formulir medical check-up Jepang/Indonesia. Analisis seluruh PDF atau gambar yang dilampirkan sebagai SATU peserta. Baca teks, tabel, tanda lingkaran/coretan, angka laboratorium, tulisan Jepang, dan posisi sel. Kembalikan hanya JSON sesuai schema.\n\nAturan ketat:\n1. Jangan menebak. Kosongkan atau hilangkan field yang tidak terlihat jelas.\n2. Tanggal wajib format YYYY-MM-DD.\n3. jenisKelamin hanya L atau P. fitStatus hanya FIT atau UNFIT.\n4. glukosaUrine dan proteinUrine hanya Negatif atau Positif.\n5. Pendengaran hanya Normal atau Gangguan.\n6. Nilai angka jangan diberi satuan. tekananDarah gunakan bentuk 130/80.\n7. Pisahkan teks Indonesia dan Jepang ke field masing-masing.\n8. tglDeklarasi adalah tanggal pada halaman surat pernyataan. tglDokumen adalah tanggal pembuatan pada halaman akhir.\n9. Untuk checkbox gulaDarahBintang dan alatBantuMata, isi boolean hanya jika dapat dipastikan.\n10. Masukkan keraguan atau konflik pada warnings.`;
  function mimeForFile(file){ if(file.type) return file.type; if(/\.pdf$/i.test(file.name)) return 'application/pdf'; if(/\.png$/i.test(file.name)) return 'image/png'; if(/\.webp$/i.test(file.name)) return 'image/webp'; return 'image/jpeg'; }
  function fileToBase64(file){ return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.onerror=()=>reject(reader.error||new Error('File gagal dibaca.'));reader.readAsDataURL(file)}); }
  async function analyzeWithGemini(files){
    const cfg=await loadGeminiConfig();
    const totalSize=files.reduce((sum,file)=>sum+file.size,0); if(totalSize>50*1024*1024) throw new Error('Ukuran satu peserta melebihi 50 MB. Kurangi ukuran atau pisahkan file.');
    const parts=[];
    for(const file of files){ parts.push({inline_data:{mime_type:mimeForFile(file),data:await fileToBase64(file)}}); }
    parts.push({text:GEMINI_PROMPT});
    const request={contents:[{role:'user',parts}],generationConfig:{responseFormat:{text:{mimeType:'application/json',schema:geminiSchema()}},maxOutputTokens:16384}};
    const modelChain=[cfg.primaryModel,...(cfg.fallbackModels||[])].filter((v,i,a)=>v&&a.indexOf(v)===i);
    const response=await fetch('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modelChain,request})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error?.message||payload.message||`Gemini API gagal (${response.status}).`);
    const text=(payload.output_text||payload.text||payload.candidates?.flatMap(candidate=>candidate?.content?.parts||[]).map(part=>part?.text||'').join('')||'').trim();
    if(!text){
      const block=payload.promptFeedback?.blockReason;
      const finish=payload.candidates?.[0]?.finishReason;
      const model=response.headers.get('X-Gemini-Model-Used');
      const mode=response.headers.get('X-Gemini-Mode-Used');
      const details=[model&&`model ${model}`,mode&&`mode ${mode}`,block&&`blok ${block}`,finish&&`finishReason ${finish}`].filter(Boolean).join(' • ');
      throw new Error(`Gemini merespons tetapi tidak menghasilkan teks${details?` (${details})`:''}. Periksa Railway Logs.`);
    }
    let parsed; try{parsed=JSON.parse(text)}catch{ throw new Error('Respons Gemini bukan JSON valid.'); }
    const data=parsed.data||parsed; const results=[];
    const usedModel=response.headers.get('X-Gemini-Model-Used');
    Object.entries(data).forEach(([field,value])=>{ if(!(field in GEMINI_FIELDS)||value===null||value===undefined||value==='') return; let v=value; if(GEMINI_FIELDS[field]==='boolean') v=Boolean(value); addResult(results,field,v,0.95,'Gemini API'); });
    const warnings=Array.isArray(parsed.warnings)?parsed.warnings.slice():[];
    if(usedModel) warnings.unshift(`Model dipakai: ${usedModel}`);
    const attempts=response.headers.get('X-Gemini-Attempts');
    if(attempts && !usedModel) warnings.unshift(`Riwayat model: ${attempts}`);
    return {results,rawText:JSON.stringify(parsed,null,2),warnings};
  }

  function groupFiles(files,mode){
    if(mode==='all') return [{name:`Gabungan ${files.length} file`,files:[...files]}];
    if(mode==='image3'){
      const groups=[],pending=[];
      const flush=()=>{if(pending.length){groups.push({name:pending.map(f=>f.name).join(' + '),files:pending.splice(0)})}};
      files.forEach(file=>{if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){flush();groups.push({name:file.name,files:[file]})}else{pending.push(file);if(pending.length===3)flush()}});flush();return groups;
    }
    return files.map(file=>({name:file.name,files:[file]}));
  }
  function renderBatchList(){
    const root=sEl('batchResults'),list=sEl('batchList'); root.hidden=!scanState.batch.length;
    const ok=scanState.batch.filter(x=>!x.error).length,err=scanState.batch.filter(x=>x.error).length;
    sEl('batchSummary').textContent=`${scanState.batch.length} peserta: ${ok} berhasil${err?`, ${err} gagal`:''}`;
    list.innerHTML=scanState.batch.map((item,index)=>`<div class="batch-item ${index===scanState.activeBatchIndex?'active':''} ${item.error?'error':''} ${item.saved?'saved':''}" data-batch-index="${index}"><div><div class="batch-item-title">${escapeHtml(item.displayName||item.name)}</div><div class="batch-item-meta">${escapeHtml(item.error||`${item.results.length} kolom terdeteksi${item.warnings?.length?` • ${item.warnings.length} catatan`:''}`)}</div></div><span class="batch-item-status">${item.saved?'Tersimpan':item.error?'Gagal':index===scanState.activeBatchIndex?'Aktif':'Muat'}</span></div>`).join('');
  }
  function selectBatch(index,apply=true){
    const item=scanState.batch[index]; if(!item||item.error) return; scanState.activeBatchIndex=index;
    displayResults(item.results,item.rawText||''); if(apply) applyDetected(item.results); renderBatchList();
  }
  function resultsToRecord(item){
    const record={marks:{},stampData:'',savedAt:new Date().toISOString()};
    item.results.forEach(result=>{record[result.field]=result.value});
    if(!record.jenisKelamin) record.jenisKelamin='L';
    if(!record.glukosaUrine) record.glukosaUrine='Negatif';
    if(!record.proteinUrine) record.proteinUrine='Negatif';
    if(!record.fitStatus) record.fitStatus='FIT';
    if(!record.rontgenMetode) record.rontgenMetode='Langsung';
    ['telingaKanan1000','telingaKanan4000','telingaKiri1000','telingaKiri4000'].forEach(field=>{if(!record[field])record[field]='Normal'});
    return record;
  }
  function saveAllBatch(){
    const valid=scanState.batch.filter(item=>!item.error&&!item.saved); if(!valid.length){updateProgress(100,'Tidak ada hasil baru yang perlu disimpan.');return}
    let records={}; try{records=JSON.parse(localStorage.getItem('mcuGeneratorRecordsV3')||'{}')}catch{records={}}
    valid.forEach((item,index)=>{const rec=resultsToRecord(item);rec.savedAt=new Date(Date.now()+index).toISOString();const id=`mcu-${Date.now()}-${index}`;records[id]=rec;item.saved=true});
    localStorage.setItem('mcuGeneratorRecordsV3',JSON.stringify(records)); renderBatchList();
    document.getElementById('btnNew')?.click();
    if(scanState.activeBatchIndex>=0) selectBatch(scanState.activeBatchIndex,true);
    updateProgress(100,`${valid.length} peserta disimpan ke daftar peserta.`); showStatus(`${valid.length} hasil batch tersimpan.`);
  }
  async function analyze(){
    if(scanState.busy) return;
    if(!scanState.files.length){updateProgress(0,'Pilih PDF atau gambar terlebih dahulu.');return}
    if(location.protocol==='file:'){updateProgress(0,'Buka melalui BUKA_APLIKASI.bat agar Gemini dan OCR bekerja.');return}
    setBusy(true);scanState.batch=[];scanState.activeBatchIndex=-1;sEl('scanResults').hidden=true;sEl('batchResults').hidden=true;
    try{
      const groups=groupFiles(scanState.files,sEl('scanGrouping').value),mode='gemini';
      for(let i=0;i<groups.length;i++){
        const group=groups[i];updateProgress((i/groups.length)*95,`Menganalisis peserta ${i+1}/${groups.length}: ${group.name}`);
        try{
          let results,rawText,warnings=[];
          if(mode==='gemini'){const out=await analyzeWithGemini(group.files);results=out.results;rawText=out.rawText;warnings=out.warnings}
          else{const out=await extractFilesLocal(group.files,mode==='ocr');rawText=out.text;results=extractMappedData(out.text,out.origin)}
          const nameResult=results.find(r=>r.field==='nama');scanState.batch.push({name:group.name,displayName:nameResult?.value||group.name,files:group.files,results,rawText,warnings,error:'',saved:false});
        }catch(error){console.error(error);scanState.batch.push({name:group.name,displayName:group.name,files:group.files,results:[],rawText:'',warnings:[],error:error.message||String(error),saved:false})}
        renderBatchList();
      }
      const first=scanState.batch.findIndex(item=>!item.error); if(first>=0) selectBatch(first,true);
      const ok=scanState.batch.filter(item=>!item.error).length;updateProgress(100,`Selesai. ${ok}/${groups.length} peserta berhasil dianalisis.`);
    }finally{setBusy(false)}
  }
  function parseRaw(){
    const raw=sEl('scanRawText').value;if(!raw.trim()){updateProgress(0,'Teks masih kosong.');return}
    const results=extractMappedData(raw,'Teks yang dikoreksi');displayResults(results,raw);const applied=applyDetected(results);
    if(scanState.activeBatchIndex>=0){const item=scanState.batch[scanState.activeBatchIndex];item.results=results;item.rawText=raw;renderBatchList()}
    updateProgress(100,`${results.length} data dipetakan ulang, ${applied} kolom diterapkan.`);
  }
  function acceptFiles(fileList){
    scanState.files=[...fileList].filter(file=>file.type==='application/pdf'||file.type.startsWith('image/')||/\.(pdf|png|jpe?g|webp|bmp)$/i.test(file.name)).slice(0,MAX_FILES);
    updateFileList();updateProgress(0,scanState.files.length?'Siap dianalisis.':'Tidak ada file PDF/gambar yang valid.');
  }
  function clearScan(){
    scanState.files=[];scanState.detected=[];scanState.rawText='';scanState.batch=[];scanState.activeBatchIndex=-1;sEl('scanFilesInput').value='';sEl('scanResults').hidden=true;sEl('batchResults').hidden=true;updateFileList();updateProgress(0,'');
  }

  const input=sEl('scanFilesInput'),zone=sEl('scanDropzone');
  input.addEventListener('change',event=>acceptFiles(event.target.files));
  zone.addEventListener('dragover',event=>{event.preventDefault();zone.classList.add('is-dragging')});
  zone.addEventListener('dragleave',()=>zone.classList.remove('is-dragging'));
  zone.addEventListener('drop',event=>{event.preventDefault();zone.classList.remove('is-dragging');acceptFiles(event.dataTransfer.files)});
  sEl('btnAnalyzeScan').addEventListener('click',analyze);
  sEl('btnClearScan').addEventListener('click',clearScan);
  sEl('btnParseRaw').addEventListener('click',parseRaw);
  sEl('btnApplyDetected').addEventListener('click',()=>{const applied=applyDetected(scanState.detected);updateProgress(100,`${applied} kolom diterapkan ulang.`)});
  sEl('btnSaveAllBatch').addEventListener('click',saveAllBatch);
  sEl('batchList').addEventListener('click',event=>{const item=event.target.closest('[data-batch-index]');if(item)selectBatch(Number(item.dataset.batchIndex),true)});
  window.MCUScan={extractMappedData,normalizeText,groupFiles,geminiSchema};
  if(location.protocol==='file:') sEl('scanProtocolWarning').hidden=false;
  updateFileList();
  applyGeminiConfigToUi();
})();
