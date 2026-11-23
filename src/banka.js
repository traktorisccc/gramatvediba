// Swedbank konta izraksta (CSV) nolasīšana un maksājumu piesaiste. Bez AI: tikai noteikumi.
// Princips: ja rīks nav drošs, tas neko nepiesaista un atstāj lēmumu lietotājam.
import { r2 } from './calc.js';

/** CSV ar semikoliem un pēdiņām (Swedbank eksports). */
function csvRindas(teksts) {
  const rindas = []; let rinda = [], lauks = '', pedinas = false;
  teksts = teksts.replace(/^\uFEFF/, '');
  for (let i = 0; i < teksts.length; i++) {
    const c = teksts[i];
    if (pedinas) {
      if (c === '"' && teksts[i + 1] === '"') { lauks += '"'; i++; }
      else if (c === '"') pedinas = false;
      else lauks += c;
    } else if (c === '"') pedinas = true;
    else if (c === ';') { rinda.push(lauks); lauks = ''; }
    else if (c === '\n') { rinda.push(lauks); rindas.push(rinda); rinda = []; lauks = ''; }
    else if (c !== '\r') lauks += c;
  }
  if (lauks || rinda.length) { rinda.push(lauks); rindas.push(rinda); }
  return rindas.filter((r) => r.some((x) => x.trim() !== ''));
}

const skaitlis = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'));
const datumsIso = (s) => { const [d, m, g] = s.split('.'); return `${g}-${m}-${d}`; };

/** Nolasa Swedbank CSV. Atgriež darījumus, periodu un bankas kopsummas (eiro) pārbaudei. */
export function nolasitSwedbankCsv(teksts) {
  const [galva, ...dati] = csvRindas(teksts);
  if (!galva) throw new Error('Fails ir tukšs.');
  const k = (nos) => galva.findIndex((h) => h.trim().toLowerCase().startsWith(nos));
  const ix = { konts: k('klienta konts'), tips: k('ieraksta tips'), datums: k('datums'), partneris: k('saņēmējs'), info: k('informācija'),
    summa: k('summa'), valuta: k('valūta'), dk: k('debets'), arhivs: k('arhīva kods'), veids: k('maksājuma veids'), dok: k('dokumenta numurs') };
  if (Object.values(ix).some((i) => i < 0)) throw new Error('Šis neizskatās pēc Swedbank CSV izraksta.');
  const iz = { konts: '', darijumi: [], apgrozijums: { K: 0, D: 0 }, sakumaAtlikums: null, beiguAtlikums: null, periods: { no: null, lidz: null } };
  for (const r of dati) {
    const tips = r[ix.tips], summa = skaitlis(r[ix.summa]), eur = r[ix.valuta] === 'EUR';
    iz.konts ||= r[ix.konts];
    if (tips === '10') { if (eur) iz.sakumaAtlikums = summa; iz.periods.no ??= datumsIso(r[ix.datums]); }
    else if (tips === '86') { if (eur) iz.beiguAtlikums = summa; iz.periods.lidz = datumsIso(r[ix.datums]); }
    else if (tips === '82') { if (eur) iz.apgrozijums[r[ix.dk]] = summa; }
    else if (tips === '20') iz.darijumi.push({
      datums: datumsIso(r[ix.datums]), partneris: r[ix.partneris].replace(/^'/, '').trim(), info: r[ix.info].trim(),
      summa, valuta: r[ix.valuta], virziens: r[ix.dk], arhivaKods: r[ix.arhivs], veids: r[ix.veids], dokNr: r[ix.dok]
    });
  }
  const datumi = iz.darijumi.map((d) => d.datums).sort();
  iz.periods.no ??= datumi[0] ?? null; iz.periods.lidz ??= datumi[datumi.length - 1] ?? null;
  return iz;
}

/** Nosaukumu salīdzināšanai: bez diakritikas, pēdiņām un juridiskās formas. */
export function normalizetNosaukumu(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/["'„”“,.]/g, ' ').replace(/\b(SIA|VSIA|AS|NODIBINAJUMS|BIEDRIBA)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Rēķina numurs maksājuma mērķī: "Rēķ.Nr.013", "rēķins 14", "Rēķins Nr. 15 no …", "Rek.Nr.16", "RĒĶINS #11". */
export function rekinaNumurs(info) {
  const t = info.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const m = t.match(/\brek(?:ins|ina|inu|\.)?\s*(?:nr\.?)?\s*#?\s*0*(\d{1,5})(?!\d|\.\d{2}\.)/);
  return m ? Number(m[1]) : null;
}

const vienadaSumma = (a, b) => Math.abs(a - b) < 0.005;
/** Reģistra ieraksta atslēga: id, ja ir; citādi numurs un summa. */
export const regAtslega = (r) => r.id ?? `${r.nr}|${r.summa}`;
const MIN_NOSAUKUMS = 4, MIN_LIGUMA_NR = 4;

/**
 * Vai maksātājs bankā un pasūtītājs rīkā ir viens un tas pats.
 * Der: pilnīgi vienādi nosaukumi; viens kā veseli vārdi ietilpst otrā (īsākais vismaz 8 zīmes);
 * vai banka nosaukumu ir apgriezusi (maksātājs ir pasūtītāja nosaukuma sākums, vismaz 12 zīmes).
 */
export function nosaukumiSakrit(maksatajs, pasutitajs) {
  const x = normalizetNosaukumu(maksatajs), y = normalizetNosaukumu(pasutitajs);
  if (x.length < MIN_NOSAUKUMS || y.length < MIN_NOSAUKUMS) return false;
  if (x === y) return true;
  const [iss, gars] = x.length <= y.length ? [x, y] : [y, x];
  if (iss.length >= 8 && ` ${gars} `.includes(` ${iss} `)) return true;
  return x.length >= 12 && y.startsWith(x);
}

/** Līguma numurs tekstā kā atsevišķs gabals (ne daļa no cita skaitļa vai vārda). */
function ligumaNrTeksta(info, nr) {
  if (!nr || nr.length < MIN_LIGUMA_NR) return false;
  const e = nr.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${e}($|[^A-Za-z0-9])`, 'i').test(info);
}

/**
 * Katram darījumam piešķir kategoriju.
 * reg: { savsVards, noteikumi: {normalizētsMaksātājs: kategorija},
 *        rekini: [{id?, nr, summa, pasutitajs, samaksats?}], autorligumi: [{id?, nr, summa, pasutitajs, izmaksatajsIetur?, samaksats?}] }
 * "samaksats" ir jau agrāk piesaistīto maksājumu summa; tā neļauj vienu rēķinu apmaksāt divreiz.
 * Kategorijas: sd, nodokli-samaksaja-izmaksatajs, akka, vid-atmaksa, vid-maksajums, savs-konts, kartes-atgriesana, procenti, personigs, ignorets, jaizverte
 */
export function klasificet(darijumi, reg) {
  const savs = normalizetNosaukumu(reg.savsVards || '');
  const atlikums = new Map();
  for (const r of reg.rekini) atlikums.set('r:' + regAtslega(r), r2(r.summa - (r.samaksats || 0)));
  for (const a of reg.autorligumi) atlikums.set('a:' + regAtslega(a), r2(a.summa - (a.samaksats || 0)));
  const pietiek = (k, s) => atlikums.get(k) >= s - 0.005;
  const nonemt = (k, s) => atlikums.set(k, r2(atlikums.get(k) - s));

  return darijumi.map((d) => {
    const p = normalizetNosaukumu(d.partneris), info = d.info;
    const rez = (kategorija, pamatojums, extra = {}) => ({ ...d, kategorija, pamatojums, ...extra });
    if (d.virziens === 'D') {
      if (/VALSTS BUDZETS|VALSTS IENEMUMU DIENESTS/.test(p)) return rez('vid-maksajums', 'maksājums VID');
      return rez('ignorets', 'izejošs maksājums');
    }
    if (d.valuta && d.valuta !== 'EUR') return rez('jaizverte', `maksājums valūtā ${d.valuta}: ievadi saņemto summu eiro`, { citaValuta: true });

    const saiteR = (r) => ({ tips: 'rekins', kods: regAtslega(r), nr: r.nr });
    const saiteA = (a) => ({ tips: 'autorligums', kods: regAtslega(a), nr: a.nr });

    // 1. Rēķina numurs mērķī + tieši tāda pati summa + rēķins vēl nav apmaksāts
    const nr = rekinaNumurs(info);
    if (nr !== null) {
      const arNr = reg.rekini.filter((r) => r.nr === nr), arSummu = arNr.filter((r) => vienadaSumma(r.summa, d.summa));
      const brivs = arSummu.find((r) => pietiek('r:' + regAtslega(r), d.summa));
      if (brivs) { nonemt('r:' + regAtslega(brivs), d.summa); return rez('sd', `rēķins Nr. ${nr}`, { saite: saiteR(brivs) }); }
      if (arSummu.length) return rez('jaizverte', `rēķins Nr. ${nr} jau ir apmaksāts: iespējams dubults maksājums`, { neatbilstiba: true });
      if (arNr.length) return rez('jaizverte', `rēķins Nr. ${nr} atrasts, bet summa ${arNr.map((r) => r.summa).join(' / ')} ≠ ${d.summa}`, { saite: saiteR(arNr[0]), neatbilstiba: true });
    }
    // 1b. Bez numura: tas pats pasūtītājs (veseli vārdi), tieši tāda pati summa, tieši viens neapmaksāts rēķins
    const rp = reg.rekini.filter((r) => nosaukumiSakrit(d.partneris, r.pasutitajs) && vienadaSumma(r.summa, d.summa) && pietiek('r:' + regAtslega(r), d.summa));
    if (rp.length === 1) { nonemt('r:' + regAtslega(rp[0]), d.summa); return rez('sd', `rēķins Nr. ${rp[0].nr} (pasūtītājs un summa)`, { saite: saiteR(rp[0]) }); }
    // 2. Autorlīgums: līguma numurs mērķī, vai pasūtītājs un tieši līguma summa
    const al = reg.autorligumi.find((a) => ligumaNrTeksta(info, a.nr))
      || reg.autorligumi.find((a) => nosaukumiSakrit(d.partneris, a.pasutitajs) && vienadaSumma(a.summa, d.summa) && pietiek('a:' + regAtslega(a), d.summa));
    if (al) {
      const k = 'a:' + regAtslega(al);
      if (!pietiek(k, d.summa)) return rez('jaizverte', `autorlīgums ${al.nr}: maksājums pārsniedz līguma atlikumu ${Math.max(0, atlikums.get(k))} €`, { saite: saiteA(al), neatbilstiba: true });
      nonemt(k, d.summa);
      return rez(al.izmaksatajsIetur ? 'nodokli-samaksaja-izmaksatajs' : 'sd', `autorlīgums ${al.nr || al.pasutitajs}`, { saite: saiteA(al) });
    }
    // 3. Zināmi maksātāji
    if (/AUTORTIESIBU UN KOMUNICESANAS|LATVIJAS AUTORU APVIENIBA|\bAKKA\b/.test(p)) return rez('akka', 'kolektīvā pārvaldījuma organizācija (D1)');
    if (/VALSTS BUDZETS|VALSTS IENEMUMU DIENESTS/.test(p)) return rez('vid-atmaksa', 'nodokļu atmaksa');
    if (/^ATGRIEZTS DAR/i.test(info)) return rez('kartes-atgriesana', 'kartes darījuma atgriešana');
    if (/procent/i.test(info) && !p) return rez('procenti', 'procenti (D1¹)');
    if (savs && p === savs) return rez('savs-konts', 'pārskaitījums no sava konta');
    // 4. Iepriekš izlemts maksātājs
    if (p && reg.noteikumi && reg.noteikumi[p]) return rez(reg.noteikumi[p], 'iepriekš izlemts šim maksātājam');
    // 5. Pārējais jāizvērtē lietotājam: nekad netiek klusi izslēgts
    return rez('jaizverte', 'nav atpazīts');
  });
}

/** Kopsavilkums pa kategorijām un pārbaude pret bankas kredīta apgrozījumu (tikai eiro darījumi). */
export function kopsavilkums(klasificeti, izraksts) {
  const k = {};
  for (const d of klasificeti) if (d.virziens === 'K' && (!d.valuta || d.valuta === 'EUR')) k[d.kategorija] = r2((k[d.kategorija] || 0) + d.summa);
  const kopa = r2(Object.values(k).reduce((a, x) => a + x, 0));
  return { pecKategorijam: k, kopa, bankasApgrozijums: izraksts.apgrozijums.K, sakrit: vienadaSumma(kopa, izraksts.apgrozijums.K), jaizverte: klasificeti.filter((d) => d.kategorija === 'jaizverte') };
}

/** Katram rēķinam vai līgumam piesaistīto maksājumu summa: Map "kods" → summa. */
export function piesaistitasSummas(darijumi, tips) {
  const m = new Map();
  for (const d of darijumi) if (d.saite?.tips === tips && !d.neatbilstiba && (d.kategorija === 'sd' || d.kategorija === 'nodokli-samaksaja-izmaksatajs'))
    m.set(d.saite.kods, r2((m.get(d.saite.kods) || 0) + d.summa));
  return m;
}

/** Rēķini, kas nav pilnībā apmaksāti un nav ar roku atzīmēti kā samaksāti citā kontā. */
export function bezMaksajuma(reg, darijumi) {
  const sam = piesaistitasSummas(darijumi, 'rekins');
  return reg.rekini.filter((r) => !r.samaksatsCitur && r2((r.samaksats || 0) + (sam.get(regAtslega(r)) || 0)) < r.summa - 0.005);
}
