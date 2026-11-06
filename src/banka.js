// Swedbank konta izraksta (CSV) nolasīšana un maksājumu piesaiste. Bez AI: tikai noteikumi.
import { r2 } from './calc.js';

/** CSV ar semikoliem un pēdiņām (Swedbank eksports). */
function csvRindas(teksts) {
  const rindas = []; let rinda = [], lauks = '', iekspedinam = false;
  teksts = teksts.replace(/^\uFEFF/, '');
  for (let i = 0; i < teksts.length; i++) {
    const c = teksts[i];
    if (iekspedinam) {
      if (c === '"' && teksts[i + 1] === '"') { lauks += '"'; i++; }
      else if (c === '"') iekspedinam = false;
      else lauks += c;
    } else if (c === '"') iekspedinam = true;
    else if (c === ';') { rinda.push(lauks); lauks = ''; }
    else if (c === '\n') { rinda.push(lauks); rindas.push(rinda); rinda = []; lauks = ''; }
    else if (c !== '\r') lauks += c;
  }
  if (lauks || rinda.length) { rinda.push(lauks); rindas.push(rinda); }
  return rindas.filter((r) => r.some((x) => x.trim() !== ''));
}

const skaitlis = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'));
const datumsIso = (s) => { const [d, m, g] = s.split('.'); return `${g}-${m}-${d}`; };

/** Nolasa Swedbank CSV. Atgriež darījumus un bankas kopsummas pārbaudei. */
export function nolasitSwedbankCsv(teksts) {
  const [galva, ...dati] = csvRindas(teksts);
  const k = (nos) => galva.findIndex((h) => h.trim().toLowerCase().startsWith(nos));
  const ix = { konts: k('klienta konts'), tips: k('ieraksta tips'), datums: k('datums'), partneris: k('saņēmējs'), info: k('informācija'),
    summa: k('summa'), valuta: k('valūta'), dk: k('debets'), arhivs: k('arhīva kods'), veids: k('maksājuma veids'), dok: k('dokumenta numurs') };
  if (Object.values(ix).some((i) => i < 0)) throw new Error('Šis neizskatās pēc Swedbank CSV izraksta.');
  const iz = { konts: '', darijumi: [], apgrozijums: { K: 0, D: 0 }, sakumaAtlikums: null, beiguAtlikums: null };
  for (const r of dati) {
    const tips = r[ix.tips], summa = skaitlis(r[ix.summa]);
    iz.konts ||= r[ix.konts];
    if (tips === '10') iz.sakumaAtlikums = summa;
    else if (tips === '86') iz.beiguAtlikums = summa;
    else if (tips === '82') iz.apgrozijums[r[ix.dk]] = summa;
    else if (tips === '20') iz.darijumi.push({
      datums: datumsIso(r[ix.datums]), partneris: r[ix.partneris].replace(/^'/, '').trim(), info: r[ix.info].trim(),
      summa, valuta: r[ix.valuta], virziens: r[ix.dk], arhivaKods: r[ix.arhivs], veids: r[ix.veids], dokNr: r[ix.dok]
    });
  }
  return iz;
}

/** Nosaukumu salīdzināšanai: bez diakritikas, pēdiņām un juridiskās formas. */
export function normalizetNosaukumu(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/["'„”“]/g, ' ').replace(/\b(SIA|VSIA|AS|NODIBINAJUMS|BIEDRIBA)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Rēķina numurs maksājuma mērķī: "Rēķ.Nr.013", "rēķins 14", "Rēķins Nr. 15 no …", "Rek.Nr.16", "#22". */
export function rekinaNumurs(info) {
  const t = info.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const m = t.match(/(?:rek(?:ins|\.)?\s*(?:nr\.?)?\s*#?\s*|#)\s*0*(\d{1,5})(?!\d|\.\d{2}\.)/);
  return m ? Number(m[1]) : null;
}

const vienadaSumma = (a, b) => Math.abs(a - b) < 0.005;

/**
 * Katram darījumam piešķir kategoriju.
 * reg: { rekini: [{nr, summa, pasutitajs}], autorligumi: [{nr, summa, pasutitajs}], noteikumi: {normalizētsPartneris: kategorija}, savsVards }
 * Kategorijas: sd, akka, vid-atmaksa, vid-maksajums, savs-konts, kartes-atgriesana, procenti, personigs, ignorets, jaizverte
 */
export function klasificet(darijumi, reg) {
  const savs = normalizetNosaukumu(reg.savsVards || '');
  return darijumi.map((d) => {
    const p = normalizetNosaukumu(d.partneris), info = d.info;
    const rez = (kategorija, pamatojums, extra = {}) => ({ ...d, kategorija, pamatojums, ...extra });
    if (d.virziens === 'D') {
      if (/VALSTS BUDZETS|VALSTS IENEMUMU DIENESTS/.test(p)) return rez('vid-maksajums', 'maksājums VID');
      return rez('ignorets', 'izejošs maksājums');
    }
    // 1. Rēķina numurs mērķī + summa
    const nr = rekinaNumurs(info);
    if (nr !== null) {
      const ar = reg.rekini.filter((r) => r.nr === nr);
      const precizs = ar.find((r) => vienadaSumma(r.summa, d.summa));
      if (precizs) return rez('sd', `rēķins Nr. ${nr}`, { saite: { tips: 'rekins', nr } });
      if (ar.length) return rez('jaizverte', `rēķins Nr. ${nr} atrasts, bet summa ${ar.map((r) => r.summa).join(' / ')} ≠ ${d.summa}`, { saite: { tips: 'rekins', nr }, neatbilstiba: true });
    }
    // 1b. Rēķins bez numura mērķī: tas pats pasūtītājs un tieši tāda pati summa
    const pasMatch = (nos) => { const n = normalizetNosaukumu(nos || ''); return n && (p.includes(n) || n.includes(p)); };
    const rp = reg.rekini.filter((r) => pasMatch(r.pasutitajs) && vienadaSumma(r.summa, d.summa));
    if (rp.length === 1) return rez('sd', `rēķins Nr. ${rp[0].nr} (pasūtītājs un summa)`, { saite: { tips: 'rekins', nr: rp[0].nr } });
    // 2. Autorlīgums: līguma numurs mērķī, vai pasūtītājs un summa
    const al = reg.autorligumi.find((a) => (a.nr && info.toUpperCase().includes(a.nr.toUpperCase())) || (pasMatch(a.pasutitajs) && vienadaSumma(a.summa, d.summa)));
    if (al) return rez(al.izmaksatajsIetur ? 'nodokli-samaksaja-izmaksatajs' : 'sd', `autorlīgums ${al.nr || al.pasutitajs}`, { saite: { tips: 'autorligums', nr: al.nr } });
    // 3. Zināmi maksātāji
    if (/AUTORTIESIBU UN KOMUNICESANAS|LATVIJAS AUTORU APVIENIBA|\bAKKA\b/.test(p)) return rez('akka', 'kolektīvā pārvaldījuma organizācija (D1)');
    if (/VALSTS BUDZETS|VALSTS IENEMUMU DIENESTS/.test(p)) return rez('vid-atmaksa', 'nodokļu atmaksa');
    if (/^ATGRIEZTS DAR/i.test(info)) return rez('kartes-atgriesana', 'kartes darījuma atgriešana');
    if (/procent/i.test(info)) return rez('procenti', 'procenti (D1¹)');
    if (savs && p === savs) return rez('savs-konts', 'pārskaitījums no sava konta');
    // 4. Iepriekš izlemts maksātājs
    if (reg.noteikumi && reg.noteikumi[p]) return rez(reg.noteikumi[p], 'iepriekš izlemts šim maksātājam');
    // 5. Pārējais jāizvērtē lietotājam — nekad netiek klusi izslēgts
    return rez('jaizverte', 'nav atpazīts');
  });
}

/** Kopsavilkums pa kategorijām un pārbaude pret bankas kredīta apgrozījumu. */
export function kopsavilkums(klasificeti, izraksts) {
  const k = {};
  for (const d of klasificeti) if (d.virziens === 'K') k[d.kategorija] = r2((k[d.kategorija] || 0) + d.summa);
  const kopa = r2(Object.values(k).reduce((a, x) => a + x, 0));
  return { pecKategorijam: k, kopa, bankasApgrozijums: izraksts.apgrozijums.K, sakrit: vienadaSumma(kopa, izraksts.apgrozijums.K), jaizverte: klasificeti.filter((d) => d.kategorija === 'jaizverte') };
}

/** Rēķini, kuriem izrakstā nav atrasts maksājums. Rēķins ar samaksatsCitur: {datums} ir ar roku atzīmēts kā samaksāts citā kontā. */
export function bezMaksajuma(reg, klasificeti, lidzDatumam) {
  const atrasti = new Set(klasificeti.filter((d) => d.saite?.tips === 'rekins' && !d.neatbilstiba).map((d) => `${d.saite.nr}|${d.summa}`));
  return reg.rekini.filter((r) => !r.samaksatsCitur && (!lidzDatumam || !r.datums || r.datums <= lidzDatumam) && !atrasti.has(`${r.nr}|${r.summa}`));
}
