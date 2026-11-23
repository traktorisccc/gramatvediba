// Vienkāršs .xlsx rakstītājs bez ārējām bibliotēkām.
// .xlsx ir ZIP arhīvs ar XML failiem; šeit ZIP tiek veidots bez saspiešanas (to atļauj formāts).
//
// lapa = { nosaukums, platumi: [platums, ...], iesaldet: rindu skaits augšā, rindas: [[sūna, ...], ...] }
// sūna = null | skaitlis | teksts | { v, f, s }
//   v — vērtība (skaitlis, teksts vai 'GGGG-MM-DD' datumam), f — Excel formula bez '=', s — stils (sk. STILI)

const STILI = { parasts: 0, b: 1, nauda: 2, naudaB: 3, datums: 4, galva: 5, ievade: 6, virsraksts: 7, piezime: 8, sadala: 9, galvaN: 10, bridinajums: 11 };

const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Kolonnas burti: 0 → A, 26 → AA. */
export function kolonna(i) { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

/** ISO datums → Excel sērijas numurs. */
export function excelDatums(iso) {
  const [g, m, d] = iso.split('-').map(Number);
  return (Date.UTC(g, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

function sunaXml(c, ref) {
  if (c === null || c === undefined || c === '') return '';
  const o = typeof c === 'object' ? c : { v: c };
  const s = STILI[o.s ?? (typeof o.v === 'number' && !o.f ? 'parasts' : 'parasts')] ?? 0;
  const sa = s ? ` s="${s}"` : '';
  let v = o.v;
  if (o.s === 'datums' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) v = excelDatums(v);
  if (o.f) {
    const f = `<f>${esc(o.f)}</f>`;
    if (typeof v === 'number') return `<c r="${ref}"${sa}>${f}<v>${v}</v></c>`;
    if (v === undefined || v === null) return `<c r="${ref}"${sa}>${f}</c>`;
    return `<c r="${ref}"${sa} t="str">${f}<v>${esc(v)}</v></c>`;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${sa}><v>${v}</v></c>` : '';
  if (v === undefined || v === null || v === '') return s ? `<c r="${ref}"${sa}/>` : '';
  return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function lapasXml(lapa) {
  const rindas = lapa.rindas.map((r, i) => {
    const sunas = (r || []).map((c, j) => sunaXml(c, kolonna(j) + (i + 1))).join('');
    return sunas ? `<row r="${i + 1}">${sunas}</row>` : '';
  }).join('');
  const cols = lapa.platumi?.length ? `<cols>${lapa.platumi.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const pane = lapa.iesaldet ? `<pane ySplit="${lapa.iesaldet}" topLeftCell="A${lapa.iesaldet + 1}" activePane="bottomLeft" state="frozen"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>${cols}<sheetData>${rindas}</sheetData></worksheet>`;
}

const STILU_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF9C2B00"/><name val="Calibri"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E1"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2B3"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F2EE"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"><color rgb="FF999999"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="12">
<xf/>
<xf fontId="1" applyFont="1"/>
<xf numFmtId="164" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="165" applyNumberFormat="1"/>
<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fillId="3" applyNumberFormat="1" applyFill="1"/>
<xf fontId="2" applyFont="1"/>
<xf fontId="3" applyFont="1"><alignment wrapText="1" vertical="top"/></xf>
<xf fontId="1" fillId="4" applyFont="1" applyFill="1"/>
<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" wrapText="1" vertical="top"/></xf>
<xf fontId="4" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function gramatasXml(lapas) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${lapas.map((l, i) => `<sheet name="${esc(l.nosaukums)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
}

// ---------- ZIP (bez saspiešanas) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

export function zip(faili) {
  const enc = new TextEncoder(), dalas = [], centrs = [];
  let nobide = 0;
  const DOS_LAIKS = 0, DOS_DATUMS = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const [nosaukums, saturs] of faili) {
    const v = enc.encode(nosaukums), d = typeof saturs === 'string' ? enc.encode(saturs) : saturs, crc = crc32(d);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, DOS_LAIKS, true); lh.setUint16(12, DOS_DATUMS, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true); lh.setUint16(26, v.length, true); lh.setUint16(28, 0, true);
    dalas.push(new Uint8Array(lh.buffer), v, d);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, DOS_LAIKS, true); ch.setUint16(14, DOS_DATUMS, true); ch.setUint32(16, crc, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true);
    ch.setUint16(28, v.length, true); ch.setUint32(42, nobide, true);
    centrs.push(new Uint8Array(ch.buffer), v);
    nobide += 30 + v.length + d.length;
  }
  const centraIzmers = centrs.reduce((a, x) => a + x.length, 0);
  const beigas = new DataView(new ArrayBuffer(22));
  beigas.setUint32(0, 0x06054b50, true); beigas.setUint16(8, faili.length, true); beigas.setUint16(10, faili.length, true);
  beigas.setUint32(12, centraIzmers, true); beigas.setUint32(16, nobide, true);
  const visas = [...dalas, ...centrs, new Uint8Array(beigas.buffer)], izmers = visas.reduce((a, x) => a + x.length, 0);
  const out = new Uint8Array(izmers); let p = 0; for (const x of visas) { out.set(x, p); p += x.length; }
  return out;
}

/** Izveido .xlsx failu (Uint8Array) no lapu saraksta. */
export function xlsxFails(lapas) {
  const n = lapas.length;
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${lapas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', gramatasXml(lapas)],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${lapas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STILU_XML],
    ...lapas.map((l, i) => [`xl/worksheets/sheet${i + 1}.xml`, lapasXml(l)])
  ]);
}
