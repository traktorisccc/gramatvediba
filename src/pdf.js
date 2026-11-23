// Rēķina PDF bez ārējām bibliotēkām: TrueType fonts (Gramatvediba Sans, OFL) tiek iegults,
// teksts kodēts kā glifu numuri (Identity-H) ar ToUnicode tabulu, lai PDF tekstu var kopēt un meklēt.
import { rekinaSaturs } from './rekinsHtml.js';

const MM = 72 / 25.4;
const A4 = { w: 595.28, h: 841.89 };

// ---------- TrueType ----------
export function lasitFontu(baiti) {
  const b = baiti instanceof Uint8Array ? baiti : new Uint8Array(baiti), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tabulas = {}, n = dv.getUint16(4);
  for (let i = 0; i < n; i++) { const p = 12 + i * 16; tabulas[String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3])] = { o: dv.getUint32(p + 8), l: dv.getUint32(p + 12) }; }
  const t = (k) => { if (!tabulas[k]) throw new Error(`Fontā nav tabulas ${k}`); return tabulas[k].o; };
  const head = t('head'), upm = dv.getUint16(head + 18);
  const bbox = [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)];
  const hhea = t('hhea'), ascent = dv.getInt16(hhea + 4), descent = dv.getInt16(hhea + 6), nH = dv.getUint16(hhea + 34);
  const glifi = dv.getUint16(t('maxp') + 4), hmtx = t('hmtx'), platumi = new Uint16Array(glifi);
  for (let g = 0; g < glifi; g++) platumi[g] = dv.getUint16(hmtx + 4 * Math.min(g, nH - 1));
  let capHeight = ascent;
  if (tabulas['OS/2'] && dv.getUint16(t('OS/2')) >= 2) capHeight = dv.getInt16(t('OS/2') + 88);
  // cmap: 3/10 (formāts 12) vai 3/1 (formāts 4)
  const cmap = t('cmap'), karte = new Map();
  const apakstabulas = Array.from({ length: dv.getUint16(cmap + 2) }, (_, i) => ({ pid: dv.getUint16(cmap + 4 + i * 8), eid: dv.getUint16(cmap + 6 + i * 8), o: cmap + dv.getUint32(cmap + 8 + i * 8) }));
  const izv = apakstabulas.find((x) => x.pid === 3 && x.eid === 10) || apakstabulas.find((x) => x.pid === 3 && x.eid === 1) || apakstabulas.find((x) => x.pid === 0);
  const fmt = dv.getUint16(izv.o);
  if (fmt === 4) {
    const o = izv.o, segX2 = dv.getUint16(o + 6), ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let i = 0; i < segX2 / 2; i++) {
      const e = dv.getUint16(ends + 2 * i), s = dv.getUint16(starts + 2 * i), d = dv.getInt16(deltas + 2 * i), ro = dv.getUint16(ranges + 2 * i);
      for (let c = s; c <= e && c !== 0xFFFF; c++) {
        let g = ro === 0 ? (c + d) & 0xFFFF : dv.getUint16(ranges + 2 * i + ro + 2 * (c - s));
        if (ro !== 0 && g !== 0) g = (g + d) & 0xFFFF;
        if (g) karte.set(c, g);
      }
    }
  } else if (fmt === 12) {
    const o = izv.o, nG = dv.getUint32(o + 12);
    for (let i = 0; i < nG; i++) { const s = dv.getUint32(o + 16 + i * 12), e = dv.getUint32(o + 20 + i * 12), g0 = dv.getUint32(o + 24 + i * 12); for (let c = s; c <= e; c++) karte.set(c, g0 + c - s); }
  } else throw new Error(`Neatbalstīts cmap formāts ${fmt}`);
  const k = 1000 / upm;
  return { baiti: b, upm, k, bbox: bbox.map((x) => Math.round(x * k)), ascent: Math.round(ascent * k), descent: Math.round(descent * k), capHeight: Math.round(capHeight * k), platumi, karte };
}

const glifs = (f, c) => f.karte.get(c) ?? f.karte.get(0x3F) ?? 0;
/** Teksta platums punktos. */
export function platums(f, teksts, izm) {
  let w = 0; for (const ch of teksts) w += f.platumi[glifs(f, ch.codePointAt(0))]; return (w * f.k * izm) / 1000;
}
/** Sadala tekstu rindās, kas ietilpst platumā (ievēro arī \n). */
export function aplauzt(f, teksts, izm, max) {
  const rez = [];
  for (const rindkopa of String(teksts).split('\n')) {
    let rinda = '';
    for (const vards of rindkopa.split(/(\s+)/)) {
      const kandidats = rinda + vards;
      if (rinda && vards.trim() && platums(f, kandidats.trimEnd(), izm) > max) { rez.push(rinda.trimEnd()); rinda = vards.trimStart(); }
      else rinda = kandidats;
      while (platums(f, rinda, izm) > max && rinda.length > 1) {     // ļoti garš vārds bez atstarpēm
        let i = rinda.length; while (i > 1 && platums(f, rinda.slice(0, i), izm) > max) i--;
        rez.push(rinda.slice(0, i)); rinda = rinda.slice(i);
      }
    }
    rez.push(rinda.trimEnd());
  }
  return rez;
}

// ---------- PDF objekti ----------
const enc = new TextEncoder();
async function saspiest(baiti) {
  const s = new Blob([baiti]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const hex4 = (n) => n.toString(16).padStart(4, '0').toUpperCase();
const sk = (x) => (Math.round(x * 100) / 100).toString();
const utf16hex = (t) => 'FEFF' + [...t].map((ch) => { const c = ch.codePointAt(0); if (c < 0x10000) return hex4(c); const v = c - 0x10000; return hex4(0xD800 + (v >> 10)) + hex4(0xDC00 + (v & 0x3FF)); }).join('');

class Dokuments {
  constructor() { this.obj = []; }
  rezervet() { this.obj.push(null); return this.obj.length; }
  likt(nr, saturs) { this.obj[nr - 1] = saturs; return nr; }
  pievienot(saturs) { return this.likt(this.rezervet(), saturs); }
  plusma(vardnica, dati) { return { vardnica, dati }; }
  baiti(saknesNr, infoNr) {
    const dalas = [enc.encode('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n')], nobides = [];
    let garums = dalas[0].length;
    const liec = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; dalas.push(u); garums += u.length; };
    this.obj.forEach((o, i) => {
      nobides.push(garums);
      if (o && o.dati) { liec(`${i + 1} 0 obj\n<<${o.vardnica} /Length ${o.dati.length}>>\nstream\n`); liec(o.dati); liec('\nendstream\nendobj\n'); }
      else liec(`${i + 1} 0 obj\n${o}\nendobj\n`);
    });
    const xref = garums;
    liec(`xref\n0 ${this.obj.length + 1}\n0000000000 65535 f \n${nobides.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`);
    liec(`trailer\n<< /Size ${this.obj.length + 1} /Root ${saknesNr} 0 R /Info ${infoNr} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(garums); let p = 0; for (const d of dalas) { out.set(d, p); p += d.length; }
    return out;
  }
}

async function iegultFontu(doc, f, vards, lietotie) {
  const g = [...lietotie].sort((a, b) => a - b);
  const W = g.map((x) => `${x} [${Math.round(f.platumi[x] * f.k)}]`).join(' ');
  const uni = [...f.karte.entries()].filter(([, gl]) => lietotie.has(gl));
  const bfchar = uni.map(([c, gl]) => `<${hex4(gl)}> <${utf16hex(String.fromCodePoint(c)).slice(4)}>`);
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def
1 begincodespacerange <0000> <FFFF> endcodespacerange
${Array.from({ length: Math.ceil(bfchar.length / 100) }, (_, i) => bfchar.slice(i * 100, i * 100 + 100)).map((ch) => `${ch.length} beginbfchar\n${ch.join('\n')}\nendbfchar`).join('\n')}
endcmap CMapName currentdict /CMap defineresource pop end end`;
  const fails = doc.pievienot(doc.plusma(` /Filter /FlateDecode /Length1 ${f.baiti.length}`, await saspiest(f.baiti)));
  const tu = doc.pievienot(doc.plusma(' /Filter /FlateDecode', await saspiest(enc.encode(cmap))));
  const desc = doc.pievienot(`<< /Type /FontDescriptor /FontName /${vards} /Flags 32 /FontBBox [${f.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${f.ascent} /Descent ${f.descent} /CapHeight ${f.capHeight} /StemV 80 /FontFile2 ${fails} 0 R >>`);
  const cid = doc.pievienot(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${vards} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /CIDToGIDMap /Identity /DW 500 /W [${W}] >>`);
  return doc.pievienot(`<< /Type /Font /Subtype /Type0 /BaseFont /${vards} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
}

/**
 * Rēķina PDF. fonti: { regular, bold } — TTF baiti. logo: { platums, augstums, rgb, alfa? } (pikseļi) vai null.
 * Atgriež Uint8Array.
 */
export async function rekinsPdf(r, profils, pasutitajs, fonti, logo = null) {
  const S = rekinaSaturs(r, profils, pasutitajs), L = S.L;
  const F = { R: lasitFontu(fonti.regular), B: lasitFontu(fonti.bold) }, lietoti = { R: new Set([0]), B: new Set([0]) };
  const lapas = []; let ops = [];
  const kreisa = 16 * MM, laba = A4.w - 16 * MM, augsa = A4.h - 22 * MM, apaksa = 18 * MM, platumsLapa = laba - kreisa;
  let y = augsa;
  const jaunaLapa = () => { lapas.push(ops); ops = []; y = augsa; };
  const teksts = (t, x, yy, fonts = 'R', izm = 11, krasa = 0.07) => {
    const f = F[fonts]; let h = '';
    for (const ch of t) { const g = glifs(f, ch.codePointAt(0)); lietoti[fonts].add(g); h += hex4(g); }
    ops.push(`BT ${sk(krasa)} g /${fonts === 'R' ? 'F1' : 'F2'} ${sk(izm)} Tf ${sk(x)} ${sk(yy)} Td <${h}> Tj ET`);
  };
  const pa_labi = (t, xLabais, yy, fonts, izm, krasa) => teksts(t, xLabais - platums(F[fonts], t, izm), yy, fonts, izm, krasa);
  const linija = (x1, y1, x2, y2, biezums = 0.75, pel = 0.73) => ops.push(`q ${sk(pel)} G ${sk(biezums)} w ${sk(x1)} ${sk(y1)} m ${sk(x2)} ${sk(y2)} l S Q`);
  const vieta = (aug) => { if (y - aug < apaksa) jaunaLapa(); };
  const rindstarpa = (izm) => izm * 1.45;

  // Logo augšējā labajā stūrī (100 px ≈ 26,5 mm)
  let logoObj = null;
  const logoIzm = 26.46 * MM;
  if (logo) ops.push(`q ${sk(logoIzm)} 0 0 ${sk(logoIzm)} ${sk(laba - logoIzm)} ${sk(augsa - logoIzm + 8)} cm /Im1 Do Q`);

  // Vieta un datums, virsraksts
  y -= 11; teksts(S.vieta, kreisa, y); y -= 11 * 1.45 + 18;
  y -= 15; teksts(S.virsraksts, kreisa, y, 'B', 15);
  if (S.ligums) teksts(S.ligums, kreisa + platums(F.B, S.virsraksts, 15) + 6, y, 'R', 11);
  y -= 15 * 0.45 + 28;
  if (logo) y = Math.min(y, augsa - logoIzm - 10);

  // Divas kolonnas: saņēmējs un autors
  const kolPlat = (platumsLapa - 24) / 2, kol2 = kreisa + kolPlat + 24;
  const bloks = (b, x) => { const r = [...aplauzt(F.B, b.galva, 11, kolPlat).map((t) => [t, 'B']), ...b.rindas.flatMap((t) => aplauzt(F.R, t, 11, kolPlat).map((x2) => [x2, 'R']))]; return { x, r }; };
  const bl = [bloks(S.klients, kreisa), bloks(S.autors, kol2)], rindu = Math.max(...bl.map((b) => b.r.length));
  for (const b of bl) b.r.forEach(([t, f], i) => teksts(t, b.x, y - 11 - i * rindstarpa(11) - (i > 0 ? 2 : 0), f, 11));
  y -= 11 + (rindu - 1) * rindstarpa(11) + 2 + 26;

  if (S.periods) { teksts(S.periods, kreisa, y - 11); y -= rindstarpa(11) + 10; }

  // Tabula
  const kol = [{ k: 'nr', w: 14 * MM }, { k: 'nosaukums', w: 0 }, { k: 'cena', w: 28 * MM, n: true }, { k: 'daudzums', w: 26 * MM, n: true }, { k: 'summa', w: 30 * MM, n: true }];
  kol[1].w = platumsLapa - kol.reduce((a, c) => a + c.w, 0);
  let x = kreisa; for (const c of kol) { c.x = x; x += c.w; }
  const pad = 6 * 0.75;
  const galva = () => {
    vieta(30); y -= 8; const yy = y - 9.5 - pad;
    [['Nr.', 0], [L.poz, 1], [L.cena, 2], [L.daudz, 3], [L.kopa, 4]].forEach(([t, i]) => {
      const c = kol[i], T = t.toLocaleUpperCase(S.en ? 'en' : 'lv');
      c.n ? pa_labi(T, c.x + c.w - pad, yy, 'B', 9.5) : teksts(T, c.x + pad, yy, 'B', 9.5);
    });
    y = yy - pad - 2; linija(kreisa, y, laba, y, 1.1, 0.07);
  };
  galva();
  for (const p of S.pozicijas) {
    const nosR = aplauzt(F.R, p.nosaukums, 11, kol[1].w - 2 * pad), aug = pad * 2 + nosR.length * rindstarpa(11);
    if (y - aug < apaksa) { jaunaLapa(); galva(); }
    const yy = y - pad - 11 + 1;
    teksts(p.nr, kol[0].x + pad, yy);
    nosR.forEach((t, i) => teksts(t, kol[1].x + pad, yy - i * rindstarpa(11)));
    pa_labi(p.cena, kol[2].x + kol[2].w - pad, yy, 'R', 11); pa_labi(p.daudzums, kol[3].x + kol[3].w - pad, yy, 'R', 11); pa_labi(p.summa, kol[4].x + kol[4].w - pad, yy, 'R', 11);
    y -= aug; linija(kreisa, y, laba, y);
  }
  vieta(30);
  const yk = y - pad - 12 + 1;
  teksts(L.kopa, kol[1].x + pad, yk, 'B', 12); pa_labi(S.kopaTeksts, laba - pad, yk, 'B', 12);
  y = yk - pad - 14;

  // Summa vārdiem un apakšdaļa
  for (const t of aplauzt(F.R, S.vardiem, 11, platumsLapa)) { vieta(16); y -= 11; teksts(t, kreisa, y); y -= rindstarpa(11) - 11; }
  y -= 18 + 10;
  for (const p of S.apaksa) for (const t of aplauzt(F.R, p, 10, platumsLapa)) { vieta(14); y -= 10; teksts(t, kreisa, y, 'R', 10, 0.2); y -= 10 * 1.45 - 10 + 3; }
  lapas.push(ops);

  // Dokuments
  const doc = new Dokuments();
  const katalogs = doc.rezervet(), lapuKoks = doc.rezervet();
  const f1 = await iegultFontu(doc, F.R, 'AAAAAA+GramatvedibaSans-Regular', lietoti.R), f2 = await iegultFontu(doc, F.B, 'AAAAAB+GramatvedibaSans-Bold', lietoti.B);
  if (logo) {
    const smask = logo.alfa ? doc.pievienot(doc.plusma(` /Type /XObject /Subtype /Image /Width ${logo.platums} /Height ${logo.augstums} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, await saspiest(logo.alfa))) : null;
    logoObj = doc.pievienot(doc.plusma(` /Type /XObject /Subtype /Image /Width ${logo.platums} /Height ${logo.augstums} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smask ? ` /SMask ${smask} 0 R` : ''}`, await saspiest(logo.rgb)));
  }
  const resursi = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${logoObj ? ` /XObject << /Im1 ${logoObj} 0 R >>` : ''} >>`;
  const lapuNr = [];
  for (const o of lapas) {
    const saturs = doc.pievienot(doc.plusma(' /Filter /FlateDecode', await saspiest(enc.encode(o.join('\n')))));
    lapuNr.push(doc.pievienot(`<< /Type /Page /Parent ${lapuKoks} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources ${resursi} /Contents ${saturs} 0 R >>`));
  }
  doc.likt(lapuKoks, `<< /Type /Pages /Kids [${lapuNr.map((n) => `${n} 0 R`).join(' ')}] /Count ${lapuNr.length} >>`);
  doc.likt(katalogs, `<< /Type /Catalog /Pages ${lapuKoks} 0 R /Lang (${S.en ? 'en' : 'lv'}) >>`);
  const sod = new Date(), d2 = (n) => String(n).padStart(2, '0');
  const info = doc.pievienot(`<< /Title <${utf16hex(S.virsraksts)}> /Author <${utf16hex(profils.vards || '')}> /Producer (Gramatvediba) /CreationDate (D:${sod.getFullYear()}${d2(sod.getMonth() + 1)}${d2(sod.getDate())}${d2(sod.getHours())}${d2(sod.getMinutes())}${d2(sod.getSeconds())}) >>`);
  return doc.baiti(katalogs, info);
}

/** Faila nosaukums kā līdzšinējos rēķinos: Vards_Uzvards_rekins_27_2026_Pasutitajs.pdf */
export function pdfFailaVards(vards, r, pasutitajaNosaukums) {
  const s = (t, n = 40) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, n);
  return `${s(vards) || 'rekins'}_rekins_${r.nr}_${r.datums.slice(0, 4)}_${s(pasutitajaNosaukums)}.pdf`;
}
