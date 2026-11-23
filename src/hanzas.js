// Hanzas Perons rēķins: aizpilda viņu Excel blanku (.xlsx), saglabājot noformējumu.
// Šūnas tiek atrastas pēc uzrakstiem („Rēķins Nr.”, „Apmaksas termiņš:” u. c.), nevis pēc fiksētām adresēm,
// tāpēc nelielas izmaiņas blankā (pārvietota rinda) to nesalauž.
import { zip, excelDatums } from './xlsx.js';
import { summaVardiemLv } from './summaVardiem.js';
import { r2 } from './calc.js';

const MEN = {
  lok: ['janvārī', 'februārī', 'martā', 'aprīlī', 'maijā', 'jūnijā', 'jūlijā', 'augustā', 'septembrī', 'oktobrī', 'novembrī', 'decembrī'],
  gen: ['janvāra', 'februāra', 'marta', 'aprīļa', 'maija', 'jūnija', 'jūlija', 'augusta', 'septembra', 'oktobra', 'novembra', 'decembra'],
  dat: ['janvārim', 'februārim', 'martam', 'aprīlim', 'maijam', 'jūnijam', 'jūlijam', 'augustam', 'septembrim', 'oktobrim', 'novembrim', 'decembrim']
};
export const datumsLocijuma = (iso, loc) => { const [g, m, d] = iso.split('-').map(Number); return `${g}. gada ${d}. ${MEN[loc][m - 1]}`; };

/** Pakalpojuma periods kā blankā: „no\n2026. gada 1. oktobra līdz 2026. gada 2. oktobrim”. */
export function periodsTeksts(no, lidz) {
  if (!no || !lidz || no === lidz) return datumsLocijuma(no || lidz, 'lok');
  return `no\n${datumsLocijuma(no, 'gen')} līdz ${datumsLocijuma(lidz, 'dat')}`;
}
export function summaVardiemBlankai(x) {
  return `${summaVardiemLv(x)}.`;
}
const BANKAS = { HABA: 'Swedbank, AS', UNLA: 'SEB banka, AS', PARX: 'Citadele banka, AS', RIKO: 'Luminor Bank AS', LLBB: 'Signet Bank, AS', NDEA: 'Luminor Bank AS' };
export const bankasNosaukums = (bic) => BANKAS[String(bic || '').slice(0, 4).toUpperCase()] || '';

// ---------- ZIP lasīšana ----------
async function inflate(dati) {
  const s = new Blob([dati]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export async function lasitZip(baiti) {
  const b = baiti instanceof Uint8Array ? baiti : new Uint8Array(baiti), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = b.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Fails nav .xlsx (nav ZIP struktūras). Ja tas ir .xls, atver to Excel vai Numbers un saglabā kā .xlsx.');
  const skaits = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const faili = new Map(), dek = new TextDecoder();
  for (let i = 0; i < skaits; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Bojāts .xlsx fails.');
    const metode = dv.getUint16(p + 10, true), izm = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lh = dv.getUint32(p + 42, true);
    const vards = dek.decode(b.subarray(p + 46, p + 46 + nl));
    const sak = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true), d = b.subarray(sak, sak + izm);
    if (!vards.endsWith('/')) faili.set(vards, metode === 0 ? d.slice() : metode === 8 ? await inflate(d) : (() => { throw new Error('Neatbalstīta saspiešana .xlsx failā.'); })());
    p += 46 + nl + el + cl;
  }
  return faili;
}

// ---------- Šūnas ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const unesc = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tekstsNoRst = (x) => [...x.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join('');
const kolNr = (k) => [...k].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
const kolBurti = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const sadalit = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return { kol: kolNr(m[1]), rinda: Number(m[2]) }; };
const SUNA = /<c r="([A-Z]+\d+)"((?:\s[^>]*?)?)(?:\/>|>([\s\S]*?)<\/c>)/g;

function nolasitLapu(xml, sst) {
  const sunas = new Map();
  for (const m of xml.matchAll(SUNA)) {
    const [pilna, ref, attr, iekss = ''] = m, t = /\st="([^"]*)"/.exec(attr)?.[1], s = /\ss="([^"]*)"/.exec(attr)?.[1];
    let teksts = '', rst = null;
    if (t === 's') { const i = Number(/<v>([\s\S]*?)<\/v>/.exec(iekss)?.[1]); rst = sst[i] ?? ''; teksts = tekstsNoRst(rst); }
    else if (t === 'inlineStr') { rst = /<is>([\s\S]*?)<\/is>/.exec(iekss)?.[1] ?? ''; teksts = tekstsNoRst(rst); }
    else { const v = /<v>([\s\S]*?)<\/v>/.exec(iekss)?.[1]; teksts = v !== undefined ? unesc(v) : ''; }
    sunas.set(ref, { ref, ...sadalit(ref), s, t, teksts, rst, formula: /<f[\s>]/.test(iekss) ? /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(iekss)?.[1] ?? '' : null, pilna });
  }
  const apvienotas = [...xml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g)].map((m) => ({ no: sadalit(m[1]), lidz: sadalit(m[2]), ref: m[1] }));
  return { sunas, apvienotas };
}

/** Atrod blankas laukus pēc uzrakstiem. Atgriež šūnu adreses vai kļūdu sarakstu. */
export function kartet(lapa) {
  const { sunas, apvienotas } = lapa, saraksts = [...sunas.values()].filter((c) => c.teksts.trim() !== '');
  const atrast = (re, no = 0, lidz = Infinity) => saraksts.filter((c) => re.test(c.teksts) && c.rinda >= no && c.rinda <= lidz).sort((a, b) => a.rinda - b.rinda || a.kol - b.kol)[0];
  // Vērtības šūna: pirmā šūna pa labi, kurai ir vērtība vai kas ir apvienotā apgabala sākums
  const pa_labi = (u) => {
    const sakums = new Set(apvienotas.map((a) => a.ref)), sava = apvienotas.find((a) => a.no.rinda <= u.rinda && a.lidz.rinda >= u.rinda && a.no.kol <= u.kol && a.lidz.kol >= u.kol);
    const no = (sava ? sava.lidz.kol : u.kol) + 1;
    for (let k = no; k <= no + 8; k++) { const ref = kolBurti(k) + u.rinda, c = sunas.get(ref); if ((c && c.teksts.trim() !== '') || sakums.has(ref)) return ref; }
    return kolBurti(no) + u.rinda;
  };
  const kl = [], k = {};
  const virsraksts = atrast(/^\s*Rēķins\s+Nr\./i);
  if (!virsraksts) kl.push('„Rēķins Nr.”'); else {
    k.virsraksts = virsraksts.ref;
    k.datums = atrast(/\d{4}\.\s*gada/, virsraksts.rinda + 1, virsraksts.rinda + 2)?.ref;
  }
  const snied = atrast(/Pakalpojuma sniedzējs/i), sanem = atrast(/Pakalpojuma saņēmējs/i);
  if (snied) {
    const lidz = sanem ? sanem.rinda - 1 : snied.rinda + 6;
    k.vards = pa_labi(snied);
    for (const [kods, re] of [['adrese', /adrese/i], ['regNr', /Reģ\.\s*nr/i], ['banka', /^\s*Banka/i], ['konts', /Bankas konts/i]]) { const u = atrast(re, snied.rinda, lidz); if (u) k[kods] = pa_labi(u); }
  }
  const periods = atrast(/sniegšanas datums vai periods/i); if (periods) k.periods = pa_labi(periods);
  const termins = atrast(/Apmaksas termiņš/i); if (termins) k.termins = pa_labi(termins); else kl.push('„Apmaksas termiņš:”');
  const galva = atrast(/Pakalpojumu nosaukums/i), kopsumma = atrast(/Kopsumma/i), pavisam = atrast(/Pavisam apmaksai/i), vardiem = atrast(/Summa apmaksai vārdiem/i);
  if (!galva) kl.push('„Pakalpojumu nosaukums”'); if (!kopsumma) kl.push('„Kopsumma bez PVN”'); if (!vardiem) kl.push('„Summa apmaksai vārdiem:”');
  if (galva && kopsumma) {
    const kolonna = (re) => saraksts.find((c) => c.rinda === galva.rinda && re.test(c.teksts))?.kol;
    k.kolonnas = { nr: kolonna(/Nr\.?\s*p\.?\s*k/i), nosaukums: galva.kol, merv: kolonna(/Mērv/i), daudz: kolonna(/Daudz/i), cena: kolonna(/Cena/i), summa: kolonna(/Summa/i) };
    if (!k.kolonnas.summa || !k.kolonnas.cena) kl.push('kolonnas „Cena” un „Summa”');
    k.pozRindas = []; for (let r = galva.rinda + 1; r < kopsumma.rinda; r++) k.pozRindas.push(r);
    if (!k.pozRindas.length) kl.push('pozīciju rinda starp galveni un „Kopsumma”');
    k.kopsumma = kolBurti(k.kolonnas.summa) + kopsumma.rinda;
    if (pavisam) k.pavisam = kolBurti(k.kolonnas.summa) + pavisam.rinda;
  }
  if (vardiem) k.vardiem = pa_labi(vardiem);
  return { k, kludas: kl };
}

function sunaXml(ref, s, vertiba) {
  const sa = s !== undefined ? ` s="${s}"` : '';
  if (vertiba === null || vertiba === '') return `<c r="${ref}"${sa}/>`;
  if (typeof vertiba === 'number') return `<c r="${ref}"${sa}><v>${vertiba}</v></c>`;
  if (vertiba.rst !== undefined) return `<c r="${ref}"${sa} t="inlineStr"><is>${vertiba.rst}</is></c>`;
  if (vertiba.formula !== undefined) return `<c r="${ref}"${sa}><f>${vertiba.formula}</f><v>${vertiba.v}</v></c>`;
  return `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(vertiba)}</t></is></c>`;
}

/** Ieliek šūnas vērtību lapas XML: aizstāj esošo šūnu vai ievieto rindā pareizajā vietā. */
function ieliktSunu(xml, lapa, ref, vertiba) {
  const c = lapa.sunas.get(ref);
  if (c) { const jauna = sunaXml(ref, c.s, vertiba); xml = xml.replace(c.pilna, jauna); c.pilna = jauna; return xml; }
  const { rinda, kol } = sadalit(ref), jauna = sunaXml(ref, undefined, vertiba);
  const rm = new RegExp(`<row r="${rinda}"(?:\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</row>)`).exec(xml);
  if (!rm) throw new Error(`Blankā nav ${rinda}. rindas.`);
  if (rm[0].endsWith('/>')) return xml.replace(rm[0], rm[0].slice(0, -2) + `>${jauna}</row>`);
  const iekss = rm[1] || '', pec = [...iekss.matchAll(SUNA)].find((m) => sadalit(m[1]).kol > kol);
  const jaunsIekss = pec ? iekss.replace(pec[0], jauna + pec[0]) : iekss + jauna;
  lapa.sunas.set(ref, { ref, rinda, kol, pilna: jauna });
  return xml.replace(rm[0], rm[0].replace(iekss + '</row>', jaunsIekss + '</row>'));
}

async function atvertBlanku(baiti) {
  const faili = await lasitZip(baiti), dek = new TextDecoder();
  const teksts = (n) => faili.has(n) ? dek.decode(faili.get(n)) : null;
  const wb = teksts('xl/workbook.xml'); if (!wb) throw new Error('Šis nav Excel (.xlsx) fails.');
  const rid = /<sheet\s[^>]*r:id="([^"]+)"/.exec(wb)?.[1], rels = teksts('xl/_rels/workbook.xml.rels') || '';
  const merkis = new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] || new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1];
  const lapasCels = merkis ? (merkis.startsWith('/') ? merkis.slice(1) : 'xl/' + merkis.replace(/^\.\//, '')) : 'xl/worksheets/sheet1.xml';
  const sstXml = teksts('xl/sharedStrings.xml') || '', sst = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1]);
  const xml = teksts(lapasCels); if (!xml) throw new Error('Excel failā nav atrodama lapa.');
  return { faili, wb, lapasCels, xml, lapa: nolasitLapu(xml, sst), datums1904: /date1904="(1|true)"/.test(wb) };
}

/** Pārbauda, vai fails der kā Hanzas Perons blanka. */
export async function parbauditBlanku(baiti) {
  const b = await atvertBlanku(baiti), { k, kludas } = kartet(b.lapa);
  return { ok: !kludas.length, kludas, pozicijuRindas: k.pozRindas?.length || 0 };
}

/**
 * Aizpilda blanku. r: { nr, datums, termins, periods: {no, lidz}, pozicijas: [{nosaukums, daudzums, cena}] }
 * profils: { vards, personasKods, adrese, iban, bic }. Atgriež .xlsx baitus.
 */
export async function aizpilditBlanku(baiti, r, profils) {
  const b = await atvertBlanku(baiti), { k, kludas } = kartet(b.lapa);
  if (kludas.length) throw new Error(`Blankā nav atrasts: ${kludas.join(', ')}.`);
  if (r.pozicijas.length > k.pozRindas.length) throw new Error(`Blankā ir vieta ${k.pozRindas.length} pozīcijai, bet rēķinā ir ${r.pozicijas.length}. Apvieno pozīcijas vienā.`);
  const lapa = b.lapa, nobide = b.datums1904 ? 1462 : 0, datums = (iso) => excelDatums(iso) - nobide;
  let xml = b.xml;
  const liec = (ref, v) => { if (ref) xml = ieliktSunu(xml, lapa, ref, v); };
  const nrTeksts = String(r.nr).padStart(3, '0');
  // Virsraksts: saglabā formatējumu (treknraksts „Rēķins”), maina tikai numuru
  const v = lapa.sunas.get(k.virsraksts);
  liec(k.virsraksts, v.rst ? { rst: v.rst.replace(/(<t(?:\s[^>]*)?>)([\s\S]*?)(<\/t>)/g, (m, a, t, z) => a + t.replace(/Nr\.\s*\d+/, `Nr. ${nrTeksts}`) + z) } : v.teksts.replace(/Nr\.\s*\d+/, `Nr. ${nrTeksts}`));
  liec(k.datums, datumsLocijuma(r.datums, 'lok'));
  // Sniedzēja rekvizīti no iestatījumiem (ja aizpildīti)
  const a = profils.adrese || {}, adrese = [a.iela, a.pilseta, a.indekss].filter(Boolean).join(', '), pk = String(profils.personasKods || '').replace(/\D/g, '');
  if (profils.vards) liec(k.vards, profils.vards);
  if (adrese) liec(k.adrese, adrese);
  if (pk) liec(k.regNr, pk.length <= 15 ? Number(pk) : pk);
  if (bankasNosaukums(profils.bic)) liec(k.banka, bankasNosaukums(profils.bic));
  if (profils.iban) liec(k.konts, profils.iban.replace(/\s/g, ''));
  liec(k.periods, periodsTeksts(r.periods?.no || r.datums, r.periods?.lidz || r.periods?.no || r.datums));
  liec(k.termins, datums(r.termins));
  // Pozīcijas
  const K = k.kolonnas, kol = (n, rinda) => n ? kolBurti(n) + rinda : null;
  let kopa = 0;
  k.pozRindas.forEach((rinda, i) => {
    const p = r.pozicijas[i];
    if (!p) { for (const n of [K.nr, K.nosaukums, K.daudz, K.cena, K.summa]) if (n && lapa.sunas.get(kol(n, rinda))) liec(kol(n, rinda), null); return; }
    const summa = r2(p.daudzums * p.cena); kopa = r2(kopa + summa);
    liec(kol(K.nr, rinda), i + 1); liec(kol(K.nosaukums, rinda), p.nosaukums); liec(kol(K.daudz, rinda), p.daudzums); liec(kol(K.cena, rinda), p.cena);
    if (K.merv && p.daudzums !== 1 && /^\s*1\s/.test(lapa.sunas.get(kol(K.merv, rinda))?.teksts || '')) liec(kol(K.merv, rinda), 'gab.');   // „1 gab.” der tikai vienam
    const sc = lapa.sunas.get(kol(K.summa, rinda));
    liec(kol(K.summa, rinda), sc?.formula ? { formula: sc.formula, v: summa } : summa);
  });
  for (const ref of [k.kopsumma, k.pavisam]) { if (!ref) continue; const c = lapa.sunas.get(ref); liec(ref, c?.formula ? { formula: c.formula, v: kopa } : kopa); }
  liec(k.vardiem, summaVardiemBlankai(kopa));

  // Darbgrāmata: lai Excel pārrēķina formulas; aprēķinu ķēde vairs neatbilst, tāpēc to izņem
  const enc = new TextEncoder(), dek = new TextDecoder(), faili = b.faili;
  let wb = b.wb;
  wb = /<calcPr\b/.test(wb) ? wb.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, at, sl) => `<calcPr${at.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"${sl}>`)
    : wb.replace(/(<\/sheets>|<\/definedNames>)(?![\s\S]*<\/definedNames>)/, `$1<calcPr fullCalcOnLoad="1"/>`);
  faili.set('xl/workbook.xml', enc.encode(wb));
  faili.set(b.lapasCels, enc.encode(xml));
  if (faili.has('xl/calcChain.xml')) {
    faili.delete('xl/calcChain.xml');
    for (const n of ['[Content_Types].xml', 'xl/_rels/workbook.xml.rels']) faili.set(n, enc.encode(dek.decode(faili.get(n)).replace(/<(Override|Relationship)\b[^>]*calcChain[^>]*\/>/g, '')));
  }
  return zip([...faili.entries()]);
}

/** Faila nosaukums kā Hanzas Perons paraugā: Vards_Uzvards_Rekins_2026_Nr_027_Hanzas_perons.xlsx */
export function blankasFailaVards(vards, datums, nr) {
  const v = String(vards || 'Rekins').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${v}_Rekins_${datums.slice(0, 4)}_Nr_${String(nr).padStart(3, '0')}_Hanzas_perons.xlsx`;
}

/** Šūnu teksti pēc adreses (pārbaudēm un priekšskatījumam). */
export async function nolasitVertibas(baiti) {
  const b = await atvertBlanku(baiti);
  return new Map([...b.lapa.sunas.values()].map((c) => [c.ref, c.teksts]));
}
