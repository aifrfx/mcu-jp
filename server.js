'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const ROOT = __dirname;
const TEMPLATE_DOCX = path.join(ROOT, 'source', 'template-word-terbaru.docx');
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
    got: value(data, 'got') ? `${value(data, 'got')} μ/ℓ` : '',
    gpt: value(data, 'gpt') ? `${value(data, 'gpt')} μ/ℓ` : '',
    ggtp: value(data, 'ggtp') ? `${value(data, 'ggtp')} μ/ℓ` : '',
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
  if (!fs.existsSync(TEMPLATE_DOCX)) throw new Error('Template Word terbaru tidak ditemukan di folder source.');
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toJsonSchema(value) {
  if (Array.isArray(value)) return value.map(toJsonSchema);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'type' && typeof item === 'string') {
      const map = {
        OBJECT: 'object', ARRAY: 'array', STRING: 'string', BOOLEAN: 'boolean',
        NUMBER: 'number', INTEGER: 'integer', NULL: 'null',
      };
      result[key] = map[item.toUpperCase()] || item.toLowerCase();
    } else {
      result[key] = toJsonSchema(item);
    }
  }
  return result;
}

function normalizeGeminiRequest(requestBody) {
  const request = JSON.parse(JSON.stringify(requestBody || {}));
  const config = request.generationConfig && typeof request.generationConfig === 'object'
    ? request.generationConfig
    : {};

  const schema = config.responseFormat?.text?.schema
    || config.responseJsonSchema
    || config.responseSchema
    || null;

  delete config.responseMimeType;
  delete config.responseSchema;
  delete config.responseJsonSchema;
  delete config.temperature;

  config.maxOutputTokens = Math.max(Number(config.maxOutputTokens) || 0, 16384);
  if (schema) {
    config.responseFormat = {
      text: {
        mimeType: 'application/json',
        schema: toJsonSchema(schema),
      },
    };
  } else {
    config.responseFormat = {
      text: { mimeType: 'application/json' },
    };
  }
  request.generationConfig = config;
  return request;
}

function makeCompatibilityRequest(requestBody) {
  const request = JSON.parse(JSON.stringify(requestBody || {}));
  const config = request.generationConfig && typeof request.generationConfig === 'object'
    ? request.generationConfig
    : {};
  const schema = config.responseFormat?.text?.schema
    || config.responseJsonSchema
    || config.responseSchema
    || null;
  const fields = schema?.properties?.data?.properties
    ? Object.keys(schema.properties.data.properties)
    : [];

  delete config.responseFormat;
  delete config.responseSchema;
  delete config.responseJsonSchema;
  delete config.temperature;
  config.responseMimeType = 'application/json';
  config.maxOutputTokens = Math.max(Number(config.maxOutputTokens) || 0, 16384);
  request.generationConfig = config;

  if (fields.length && Array.isArray(request.contents)) {
    const suffix = `\n\nKeluarkan JSON dengan bentuk {"data":{...},"warnings":[]} dan gunakan hanya field berikut bila nilainya terlihat: ${fields.join(', ')}.`;
    const content = request.contents[0];
    if (content && Array.isArray(content.parts)) {
      const promptPart = [...content.parts].reverse().find((part) => typeof part?.text === 'string');
      if (promptPart) promptPart.text += suffix;
      else content.parts.push({ text: suffix });
    }
  }
  return request;
}

function extractGeminiText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text.trim();
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  return candidates
    .flatMap((candidate) => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();
}

function describeEmptyGeminiResponse(payload) {
  const promptBlock = payload?.promptFeedback?.blockReason;
  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
  const finishReason = candidate?.finishReason;
  const safety = Array.isArray(candidate?.safetyRatings)
    ? candidate.safetyRatings.filter((item) => item?.blocked).map((item) => item.category).join(', ')
    : '';
  const details = [];
  if (promptBlock) details.push(`prompt diblokir: ${promptBlock}`);
  if (finishReason) details.push(`finishReason: ${finishReason}`);
  if (safety) details.push(`safety: ${safety}`);
  if (payload?.modelStatus?.message) details.push(`modelStatus: ${payload.modelStatus.message}`);
  return details.length ? details.join('; ') : 'respons HTTP 200 tidak berisi teks kandidat';
}

async function callGeminiModel(model, apiKey, requestBody, mode, retryIndex = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      }
    );
    const responseText = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(responseText); } catch { parsed = null; }
    return { response, responseText, parsed, mode, retryIndex };
  } finally {
    clearTimeout(timeout);
  }
}

app.post('/api/gemini', async (req, res) => {
  try {
    const rawRequest = req.body && req.body.request;
    if (!rawRequest || typeof rawRequest !== 'object' || Array.isArray(rawRequest)) {
      throw new Error('Body permintaan Gemini tidak valid.');
    }

    const cfg = loadRuntimeConfig();
    if (!cfg.apiKey) throw new Error('GEMINI_API_KEY belum diatur pada Railway Variables.');

    const models = normalizeModelList(cfg.primaryModel, cfg.fallbackModels);
    if (!models.length) throw new Error('Model Gemini belum diatur.');

    const attempts = [];
    let finalStatus = 502;
    let finalError = 'Gemini tidak merespons.';

    for (const model of models) {
      const requestVariants = [
        { mode: 'structured', body: normalizeGeminiRequest(rawRequest) },
        { mode: 'json-compat', body: makeCompatibilityRequest(rawRequest) },
      ];

      for (const variant of requestVariants) {
        const maxRetries = variant.mode === 'structured' ? 2 : 1;
        for (let retryIndex = 0; retryIndex < maxRetries; retryIndex += 1) {
          if (retryIndex > 0) await sleep(1200 * (2 ** (retryIndex - 1)) + Math.floor(Math.random() * 350));
          let result;
          try {
            result = await callGeminiModel(model, cfg.apiKey, variant.body, variant.mode, retryIndex);
          } catch (error) {
            const message = error && error.name === 'AbortError'
              ? `Timeout setelah ${Math.round(GEMINI_TIMEOUT_MS / 1000)} detik.`
              : (error.message || String(error));
            attempts.push({ model, mode: variant.mode, retry: retryIndex + 1, status: 0, message });
            finalStatus = 504;
            finalError = `${model}: ${message}`;
            console.error('[Gemini]', model, variant.mode, message);
            continue;
          }

          const { response, responseText, parsed } = result;
          const apiMessage = parsed?.error?.message || response.statusText || `HTTP ${response.status}`;

          if (response.ok) {
            const generatedText = extractGeminiText(parsed);
            if (generatedText) {
              attempts.push({ model, mode: variant.mode, retry: retryIndex + 1, status: response.status, message: 'OK' });
              console.log('[Gemini]', model, variant.mode, response.status, 'OK');
              res.status(response.status);
              res.set('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
              res.set('X-Gemini-Model-Used', model);
              res.set('X-Gemini-Mode-Used', variant.mode);
              res.set('X-Gemini-Attempts', JSON.stringify(attempts));
              return res.send(responseText);
            }

            const emptyMessage = describeEmptyGeminiResponse(parsed);
            attempts.push({ model, mode: variant.mode, retry: retryIndex + 1, status: 200, message: emptyMessage });
            finalStatus = 502;
            finalError = `${model}: ${emptyMessage}`;
            console.warn('[Gemini empty]', model, variant.mode, JSON.stringify({
              promptFeedback: parsed?.promptFeedback || null,
              finishReason: parsed?.candidates?.[0]?.finishReason || null,
              usageMetadata: parsed?.usageMetadata || null,
            }));
            break;
          }

          attempts.push({ model, mode: variant.mode, retry: retryIndex + 1, status: response.status, message: apiMessage });
          finalStatus = response.status;
          finalError = apiMessage;
          console.log('[Gemini]', model, variant.mode, response.status, apiMessage.slice(0, 260));

          if ([401, 403].includes(response.status)) break;
          if (response.status === 400 && !/schema|responseformat|model|not found|unsupported/i.test(apiMessage)) break;
          if (![408, 429, 500, 502, 503, 504].includes(response.status)) break;
        }

        if ([401, 403].includes(finalStatus)) break;
      }

      if ([401, 403].includes(finalStatus)) break;
    }

    const any429 = attempts.some((item) => item.status === 429);
    const any404 = attempts.some((item) => item.status === 404);
    const status = any429 ? 429 : finalStatus;
    let advice = '';
    if (any429) advice = 'Kuota atau rate limit terkena batas. Tunggu lalu coba kembali, kurangi ukuran PDF, atau periksa quota project.';
    else if (any404) advice = 'Satu atau lebih nama model tidak tersedia. Periksa Variables Railway.';
    else if (attempts.some((item) => item.status === 200)) advice = 'Gemini merespons tanpa teks. Detail finishReason sudah dicatat di Railway Logs.';

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
