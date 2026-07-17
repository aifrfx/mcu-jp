'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const ROOT = __dirname;
const TEMPLATE_DOCX = path.join(ROOT, 'source', 'template-bonto.docx');
const RETRYABLE_STATUS = new Set([404, 429, 500, 502, 503, 504]);
const DEFAULT_PRIMARY_MODEL = 'gemini-3.5-flash';
const DEFAULT_FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
const GEMINI_API_VERSION = String(process.env.GEMINI_API_VERSION || 'v1beta').trim() || 'v1beta';
const GEMINI_TIMEOUT_MS = Math.max(30000, Number(process.env.GEMINI_TIMEOUT_MS || 210000));

function normalizeModelList(...groups) {
  const result = [];
  const seen = new Set();
  for (const group of groups) {
    if (!group) continue;
    const values = Array.isArray(group) ? group : String(group).split(',');
    for (const raw of values) {
      const model = String(raw || '').trim();
      if (!model || seen.has(model) || !/^[A-Za-z0-9._-]+$/.test(model)) continue;
      seen.add(model);
      result.push(model);
    }
  }
  return result;
}

function loadRuntimeConfig() {
  const primaryModel = String(process.env.GEMINI_PRIMARY_MODEL || DEFAULT_PRIMARY_MODEL).trim() || DEFAULT_PRIMARY_MODEL;
  const fallbackModels = normalizeModelList(
    process.env.GEMINI_FALLBACK_MODELS || DEFAULT_FALLBACK_MODELS.join(',')
  ).filter((model) => model !== primaryModel);
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  return {
    hasApiKey: Boolean(apiKey),
    apiKey,
    primaryModel,
    fallbackModels,
    allowBrowserOverride: false,
  };
}

function value(data, key, fallback = '') {
  const result = data && Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
  return result == null ? fallback : result;
}

function parseIso(input) {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const [year, month, day] = input.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function dateJp(input, wide = false) {
  const parsed = parseIso(input);
  if (!parsed) return '';
  if (wide) return `${parsed.year} 年　　 ${String(parsed.month).padStart(2, '0')} 月　　 ${String(parsed.day).padStart(2, '0')} 日`;
  return `${parsed.year} 年 ${String(parsed.month).padStart(2, '0')} 月 ${String(parsed.day).padStart(2, '0')} 日`;
}

function dateDash(input) {
  const parsed = parseIso(input);
  if (!parsed) return '';
  return `${String(parsed.day).padStart(2, '0')} - ${String(parsed.month).padStart(2, '0')} - ${parsed.year}`;
}

function dateIdWide(input) {
  const parsed = parseIso(input);
  if (!parsed) return '';
  return `Tanggal　${String(parsed.day).padStart(2, '0')}　Bulan　${String(parsed.month).padStart(2, '0')}　Tahun ${parsed.year}`;
}

function age(birth, exam) {
  const b = parseIso(birth);
  const e = parseIso(exam);
  if (!b || !e) return '';
  let years = e.year - b.year;
  if (e.month < b.month || (e.month === b.month && e.day < b.day)) years -= 1;
  return Math.max(0, years);
}

function bmi(height, weight) {
  const h = Number(height) / 100;
  const w = Number(weight);
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0) return '';
  return (w / (h * h)).toFixed(2);
}

function bilingual(indonesian, japanese, separator = ' / ') {
  const left = String(indonesian || '').trim();
  const right = String(japanese || '').trim();
  if (left && right) return `${left}${separator}${right}`;
  return left || right;
}

function statusJpId(input) {
  return String(input || '').toLowerCase().startsWith('pos') ? 'ポジティブ\nPositif' : 'ネガティブ\nNegatif';
}

function vision(input, assisted) {
  const text = String(input || '').trim();
  if (!text) return '';
  return assisted ? `（ ${text} ）` : `${text}　（　）`;
}

function hearing(input1000, input4000) {
  const line = (input) => {
    const abnormal = String(input || '').toLowerCase().startsWith('gang');
    return abnormal
      ? '1 所見なし　② 所見あり\n1 Normal　② Gangguan'
      : '① 所見なし　2 所見あり\n① Normal　2 Gangguan';
  };
  return `${line(input1000)}\n${line(input4000)}`;
}

function sanitizeFilename(rawName) {
  let name = String(rawName || 'MCU_Medical_Checkup.docx')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+|[._]+$/g, '');
  if (!name) name = 'MCU_Medical_Checkup.docx';
  if (!name.toLowerCase().endsWith('.docx')) name += '.docx';
  return name;
}

function extractStamp(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return null;
  const extension = match[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
  const contentType = extension === 'png' ? 'image/png' : 'image/jpeg';
  try {
    return { buffer: Buffer.from(match[2], 'base64'), extension, contentType };
  } catch {
    return null;
  }
}

function appendRelationship(xml, relationshipXml) {
  return xml.replace('</Relationships>', `${relationshipXml}</Relationships>`);
}

function ensureContentType(xml, extension, contentType) {
  const marker = `Extension="${extension}"`;
  if (xml.includes(marker)) return xml;
  return xml.replace('</Types>', `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`);
}

function imageParagraphXml(rId, extension) {
  const cx = 1620000; // 45 mm
  const cy = 720000;  // 20 mm
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="999" name="Stamp.${extension}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Stamp.${extension}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function insertStamp(zip, stamp) {
  if (!stamp) return;
  const mediaPath = `word/media/mcu-stamp.${stamp.extension}`;
  const rId = 'rIdMCUStamp';
  zip.file(mediaPath, stamp.buffer);

  const relPath = 'word/_rels/document.xml.rels';
  let rels = zip.file(relPath).asText();
  if (!rels.includes(`Id="${rId}"`)) {
    rels = appendRelationship(
      rels,
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/mcu-stamp.${stamp.extension}"/>`
    );
    zip.file(relPath, rels);
  }

  const typesPath = '[Content_Types].xml';
  let types = zip.file(typesPath).asText();
  types = ensureContentType(types, stamp.extension, stamp.contentType);
  zip.file(typesPath, types);

  const docPath = 'word/document.xml';
  let documentXml = zip.file(docPath).asText();
  const paragraphPattern = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?__STAMP_PLACEHOLDER__(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/;
  if (paragraphPattern.test(documentXml)) {
    documentXml = documentXml.replace(paragraphPattern, imageParagraphXml(rId, stamp.extension));
  } else {
    documentXml = documentXml.replace('__STAMP_PLACEHOLDER__', '');
  }
  zip.file(docPath, documentXml);
}

function buildTemplateData(data) {
  const birth = String(value(data, 'tglLahir')).trim();
  const exam = String(value(data, 'tglPeriksa')).trim();
  const declaration = String(value(data, 'tglDeklarasi')).trim();
  const docDate = String(value(data, 'tglDokumen')).trim();
  const years = age(birth, exam);
  const bmiValue = bmi(value(data, 'tinggi'), value(data, 'berat'));
  const gender = String(value(data, 'jenisKelamin', 'L')).toUpperCase();
  const direct = String(value(data, 'rontgenMetode', 'Langsung')) !== 'Tidak langsung';
  const fit = String(value(data, 'fitStatus', 'FIT')).toUpperCase();
  const glucosePrefix = Boolean(value(data, 'gulaDarahBintang', false)) ? '*' : '';
  const glucoseValue = value(data, 'gulaDarah');

  const xray = `${direct ? '○直接　　　　　間接' : '直接　　　　　○間接'}\n${direct ? '○Langsung　　 Tidak langsung' : 'Langsung　　 ○Tidak langsung'}\n撮影　　 ${dateJp(value(data, 'rontgenTanggal'))}\nDiambil tanggal　${dateDash(value(data, 'rontgenTanggal'))}\nNo.　${value(data, 'rontgenNo')}\n所見: ${value(data, 'rontgenTemuanJp')}\nTemuan: ${value(data, 'rontgenTemuanId')}`;

  return {
    titleName: String(value(data, 'nama')).trim(),
    declarationJp: dateJp(declaration, true),
    declarationId: dateIdWide(declaration),
    name: String(value(data, 'nama')).trim(),
    birthText: `${dateJp(birth)}\n${dateDash(birth)}`,
    examText: `${dateJp(exam)}\n${dateDash(exam)}`,
    genderText: gender === 'L' ? '○男　・　女\nLaki-laki /\nPerempuan' : '男　・　○女\nLaki-laki /\nPerempuan',
    ageText: years === '' ? '' : `${years}　歳\n${years}　tahun`,
    work: bilingual(value(data, 'riwayatKerjaId'), value(data, 'riwayatKerjaJp'), '\n'),
    history: bilingual(value(data, 'riwayatSakitId'), value(data, 'riwayatSakitJp'), '\n/　'),
    subjective: bilingual(value(data, 'gejalaSubId'), value(data, 'gejalaSubJp'), '\n/　'),
    objective: bilingual(value(data, 'gejalaObjId'), value(data, 'gejalaObjJp'), '\n/　'),
    bp: value(data, 'tekananDarah') ? `${value(data, 'tekananDarah')} mm/Hg` : '',
    hb: value(data, 'hb') ? `${value(data, 'hb')} g/dℓ` : '',
    rbc: value(data, 'rbc') ? `${value(data, 'rbc')} 万/mm³` : '',
    got: value(data, 'got') ? `${value(data, 'got')} IU/ℓ` : '',
    gpt: value(data, 'gpt') ? `${value(data, 'gpt')} IU/ℓ` : '',
    ggtp: value(data, 'ggtp') ? `${value(data, 'ggtp')} IU/ℓ` : '',
    ldl: value(data, 'ldl') ? `${value(data, 'ldl')} mg/dℓ` : '',
    hdl: value(data, 'hdl') ? `${value(data, 'hdl')} mg/dℓ` : '',
    trig: value(data, 'trigliserida') ? `${value(data, 'trigliserida')} mg/dℓ` : '',
    glucose: glucoseValue ? `${glucosePrefix}${glucoseValue} mg/dℓ` : '',
    urineGlucose: statusJpId(value(data, 'glukosaUrine')),
    urineProtein: statusJpId(value(data, 'proteinUrine')),
    height: value(data, 'tinggi') ? `${value(data, 'tinggi')} cm` : '',
    weight: value(data, 'berat') ? `${value(data, 'berat')} kg` : '',
    ekg: bilingual(value(data, 'ekgId'), value(data, 'ekgJp'), ' / '),
    other: bilingual(value(data, 'pemeriksaanLainId'), value(data, 'pemeriksaanLainJp'), ' / '),
    bmi: bmiValue ? `${bmiValue} kg/m²` : '',
    waist: value(data, 'lingkarPerut') ? `${value(data, 'lingkarPerut')} cm` : '',
    visionR: vision(value(data, 'mataKanan'), Boolean(value(data, 'alatBantuMata', false))),
    visionL: vision(value(data, 'mataKiri'), Boolean(value(data, 'alatBantuMata', false))),
    hearingR: hearing(value(data, 'telingaKanan1000'), value(data, 'telingaKanan4000')),
    hearingL: hearing(value(data, 'telingaKiri1000'), value(data, 'telingaKiri4000')),
    xray,
    diagnosis: bilingual(value(data, 'diagnosisId'), value(data, 'diagnosisJp'), ' / '),
    fitText: fit === 'FIT' ? '● FIT' : 'FIT',
    unfitText: fit === 'UNFIT' ? '● UNFIT' : 'UNFIT',
    notes: bilingual(value(data, 'keteranganId'), value(data, 'keteranganJp'), ' / '),
    docDateText: `作成年月日　　　　${dateJp(docDate)}\nTanggal pembuatan:　${dateIdWide(docDate)}`,
    stampBlock: extractStamp(String(value(data, 'stampData', ''))) ? '__STAMP_PLACEHOLDER__' : '',
    clinicName: extractStamp(String(value(data, 'stampData', ''))) ? '' : String(value(data, 'klinikNama')).trim(),
    doctorNameText: value(data, 'dokterNama') ? `(${String(value(data, 'dokterNama')).trim()})` : '',
  };
}

function buildWordDocument(data) {
  if (!fs.existsSync(TEMPLATE_DOCX)) throw new Error('Template Word Bonto tidak ditemukan di folder source.');
  const templateBuffer = fs.readFileSync(TEMPLATE_DOCX);
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  const templateData = buildTemplateData(data);
  doc.render(templateData);
  const outputZip = doc.getZip();
  insertStamp(outputZip, extractStamp(String(value(data, 'stampData', ''))));
  return outputZip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '80mb' }));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/api/gemini-config', (req, res) => {
  const cfg = loadRuntimeConfig();
  res.json({
    hasApiKey: cfg.hasApiKey,
    primaryModel: cfg.primaryModel,
    fallbackModels: cfg.fallbackModels,
    allowBrowserOverride: false,
  });
});

app.post('/api/gemini', async (req, res) => {
  try {
    const requestBody = req.body && req.body.request;
    if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
      throw new Error('Body permintaan Gemini tidak valid.');
    }

    const cfg = loadRuntimeConfig();
    if (!cfg.apiKey) throw new Error('GEMINI_API_KEY belum diatur pada Railway Variables.');

    // Model dari browser sengaja diabaikan. Urutan hanya berasal dari Environment Bonto.
    const models = normalizeModelList(cfg.primaryModel, cfg.fallbackModels);
    if (!models.length) throw new Error('Model Gemini belum diatur.');

    const attempts = [];
    let finalStatus = 502;
    let finalError = 'Gemini tidak merespons.';

    for (const model of models) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
      let response;
      let responseText = '';

      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': cfg.apiKey,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          }
        );
        responseText = await response.text();
      } catch (error) {
        clearTimeout(timeout);
        const message = error && error.name === 'AbortError'
          ? `Timeout setelah ${Math.round(GEMINI_TIMEOUT_MS / 1000)} detik.`
          : (error.message || String(error));
        attempts.push({ model, status: 0, message });
        finalStatus = 504;
        finalError = `${model}: ${message}`;
        console.error('[Gemini]', model, message);
        continue;
      } finally {
        clearTimeout(timeout);
      }

      let parsed = null;
      try { parsed = JSON.parse(responseText); } catch { parsed = null; }
      const message = parsed?.error?.message || response.statusText || `HTTP ${response.status}`;
      attempts.push({ model, status: response.status, message });
      console.log('[Gemini]', model, response.status, message.slice(0, 220));

      if (response.ok) {
        res.status(response.status);
        res.set('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
        res.set('X-Gemini-Model-Used', model);
        res.set('X-Gemini-Attempts', JSON.stringify(attempts));
        return res.send(responseText);
      }

      finalStatus = response.status;
      finalError = message;

      // Auth/request yang sama tidak akan sembuh hanya dengan mengganti model.
      if ([401, 403].includes(response.status)) break;
      if (response.status === 400 && !/model|not found|unsupported/i.test(message)) break;

      // 404, 429, timeout, dan error server mencoba model fallback berikutnya.
      if (!RETRYABLE_STATUS.has(response.status) && response.status !== 400) break;
    }

    const any429 = attempts.some((item) => item.status === 429);
    const any404 = attempts.some((item) => item.status === 404);
    const status = any429 ? 429 : finalStatus;
    let advice = '';
    if (any429) {
      advice = 'Semua model yang dicoba terkena batas kuota/rate limit. Periksa quota project di Google AI Studio atau aktifkan billing.';
    } else if (any404) {
      advice = 'Satu atau lebih model tidak tersedia. Perbarui GEMINI_PRIMARY_MODEL dan GEMINI_FALLBACK_MODELS.';
    }

    res.status(status || 502);
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.set('X-Gemini-Attempts', JSON.stringify(attempts));
    return res.json({
      error: {
        message: `${finalError}${advice ? ` ${advice}` : ''}`,
        attempts,
      },
    });
  } catch (error) {
    return res.status(400).json({ error: { message: error.message || 'Permintaan Gemini gagal.' } });
  }
});

app.post('/api/export-word', (req, res) => {
  try {
    const data = req.body && req.body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Data formulir Word tidak valid.');
    }
    const filename = sanitizeFilename(req.body.filename);
    const body = buildWordDocument(data);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.set('Content-Length', String(body.length));
    return res.send(body);
  } catch (error) {
    return res.status(400).json({ error: { message: error.message || 'Export Word gagal.' } });
  }
});

app.use((req, res, next) => {
  if (/\/(?:\.env|gemini\.config(?:\.local)?\.json)$/i.test(req.path)) return res.sendStatus(404);
  return next();
});

app.use(express.static(ROOT, { index: 'index.html', fallthrough: true }));
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

const port = Number.parseInt(process.env.PORT || '3000', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`MCU Railway server listening on port ${port}`);
});
