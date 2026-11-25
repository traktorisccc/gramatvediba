// Datu apvienošana starp pārlūku un Google Drive pa ierakstiem (trīspusēji: bāze = pēdējā kopīgā versija).
// Mērķis: nekad nepazaudēt ierakstu tikai tāpēc, ka viena puse to neredzēja. Dzēšana tiek pārnesta tikai tad,
// ja bāze pierāda, ka ieraksts bija un otra puse to nav mainījusi.

/** Salīdzināšanai: JSON ar sakārtotām atslēgām (lai atslēgu secība neradītu viltus konfliktus). */
export function stabils(v) {
  if (Array.isArray(v)) return `[${v.map(stabils).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stabils(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
const vien = (a, b) => stabils(a) === stabils(b);

const darijumaAtslega = (d) => d.arhivaKods || `${d.datums}|${d.summa}|${d.partneris || ''}|${d.info || ''}`;
export const KOLEKCIJAS = {
  rekini: { atslega: (x) => x.id || `nr:${x.nr}`, nosaukums: (x) => `rēķins #${x.nr}` },
  autorligumi: { atslega: (x) => x.id || `nr:${x.nr}`, nosaukums: (x) => `līgums ${x.nr || ''}`.trim() },
  pasutitaji: { atslega: (x) => x.id || `n:${x.nosaukums}`, nosaukums: (x) => `pasūtītājs ${x.nosaukums || ''}`.trim() },
  darijumi: { atslega: darijumaAtslega, nosaukums: (x) => `bankas darījums ${x.datums} ${x.summa} €` }
};
const KARTES = ['maksataji', 'gadi', 'samaksas', 'konti', 'izraksti'];          // atslēga → vērtība
const NEMAINAMIE = ['versija', 'eksportets'];

/** Viena vērtība trīspusēji. Atgriež { v } vai { konflikts: true }. */
function viens(b, l, a, irBaze) {
  if (vien(l, a)) return { v: l };
  if (irBaze && vien(b, l)) return { v: a };        // mainīts tikai Drive
  if (irBaze && vien(b, a)) return { v: l };        // mainīts tikai pārlūkā
  return { konflikts: true };
}

/**
 * baze: pēdējā sinhronizētā versija vai null (tad divpusēji: apvieno, neko nedzēš).
 * Atgriež { dati, konflikti: [{ kur, atslega, nosaukums, l, a }], kopsavilkums }.
 * Konfliktā rezultātā sākotnēji ir Drive vērtība; atrisinat() var izvēlēties pārlūka vērtību.
 */
export function apvienot(baze, lok, att) {
  const irBaze = !!baze, b = baze || {}, konflikti = [];
  const kops = { noParluka: 0, noDrive: 0, dzesti: 0 };
  const rez = {};

  for (const [kol, { atslega, nosaukums }] of Object.entries(KOLEKCIJAS)) {
    const karte = (x) => new Map((x || []).map((r) => [atslega(r), r]));
    const B = karte(b[kol]), L = karte(lok[kol]), A = karte(att[kol]);
    const seciba = [...new Set([...A.keys(), ...L.keys()])], izv = [];
    for (const k of seciba) {
      const br = B.get(k), lr = L.get(k), ar = A.get(k);
      if (lr && ar) {
        const r = viens(br, lr, ar, irBaze && !!br);
        if (r.konflikts) { izv.push(ar); konflikti.push({ kur: kol, atslega: k, nosaukums: nosaukums(ar), l: lr, a: ar }); }
        else { izv.push(r.v); if (r.v === lr && !vien(lr, ar)) kops.noParluka++; else if (!vien(lr, ar)) kops.noDrive++; }
      } else if (lr) {                                  // nav Drive
        if (irBaze && br) { if (vien(br, lr)) { kops.dzesti++; continue; } konflikti.push({ kur: kol, atslega: k, nosaukums: nosaukums(lr), l: lr, a: null }); izv.push(lr); }
        else { izv.push(lr); kops.noParluka++; }
      } else {                                          // nav pārlūkā
        if (irBaze && br) { if (vien(br, ar)) { kops.dzesti++; continue; } konflikti.push({ kur: kol, atslega: k, nosaukums: nosaukums(ar), l: null, a: ar }); izv.push(ar); }
        else { izv.push(ar); kops.noDrive++; }
      }
    }
    rez[kol] = izv;
  }

  for (const kart of KARTES) {
    const B = b[kart] || {}, L = lok[kart] || {}, A = att[kart] || {}, o = {};
    for (const k of new Set([...Object.keys(A), ...Object.keys(L)])) {
      const ir = (x) => Object.prototype.hasOwnProperty.call(x, k);
      if (ir(L) && ir(A)) {
        const r = viens(B[k], L[k], A[k], irBaze && ir(B));
        if (r.konflikts) { o[k] = A[k]; konflikti.push({ kur: kart, atslega: k, nosaukums: ({ gadi: `${k}. gada dati`, samaksas: `nodokļu samaksas atzīme ${k}`, konti: `konta nosaukums ${k}`, izraksti: `izraksts ${k}` })[kart] || `maksātājs ${k}`, l: L[k], a: A[k] }); }
        else o[k] = r.v;
      } else if (ir(L)) { if (!(irBaze && ir(B) && vien(B[k], L[k]))) o[k] = L[k]; }
      else if (!(irBaze && ir(B) && vien(B[k], A[k]))) o[k] = A[k];
    }
    rez[kart] = o;
  }

  // Profils pa laukiem; nākamais rēķina numurs nekad nedrīkst atkārtot jau esošu numuru.
  const prof = {}, bp = b.profils || {}, lp = lok.profils || {}, ap = att.profils || {};
  for (const k of new Set([...Object.keys(ap), ...Object.keys(lp)])) {
    if (k === 'nakamaisNr') continue;
    const r = viens(bp[k], lp[k], ap[k], irBaze);
    if (r.konflikts) { prof[k] = ap[k]; konflikti.push({ kur: 'profils', atslega: k, nosaukums: `rekvizīti: ${k}`, l: lp[k], a: ap[k] }); }
    else prof[k] = r.v;
  }
  const maxNr = Math.max(0, ...rez.rekini.map((r) => Number(r.nr) || 0));
  prof.nakamaisNr = Math.max(Number(lp.nakamaisNr) || 1, Number(ap.nakamaisNr) || 1, maxNr + 1);
  rez.profils = prof;

  // Pārējie lauki (rēķina paraugs, Drive piesaiste u. c.) kopumā.
  const citi = new Set([...Object.keys(att), ...Object.keys(lok)].filter((k) => !(k in KOLEKCIJAS) && !KARTES.includes(k) && k !== 'profils' && !NEMAINAMIE.includes(k)));
  for (const k of citi) {
    const r = viens(b[k], lok[k], att[k], irBaze);
    if (r.konflikts) { rez[k] = att[k] !== undefined ? att[k] : lok[k]; if (att[k] !== undefined && lok[k] !== undefined) konflikti.push({ kur: 'citi', atslega: k, nosaukums: k === 'hanzasBlanka' ? 'Hanzas Perons rēķina paraugs' : k, l: lok[k], a: att[k] }); }
    else if (r.v !== undefined) rez[k] = r.v;
  }
  rez.versija = att.versija ?? lok.versija ?? 1;

  // Divi dažādi rēķini ar vienu numuru (izrakstīti divās ierīcēs bez savienojuma) — jāparāda lietotājam.
  const pecNr = new Map();
  for (const r of rez.rekini) pecNr.set(r.nr, [...(pecNr.get(r.nr) || []), r]);
  const dubulti = [...pecNr.entries()].filter(([, x]) => x.length > 1).map(([nr]) => nr);
  return { dati: rez, konflikti, kopsavilkums: { ...kops, dubultiNumuri: dubulti } };
}

/** Konfliktos izvēlas pārlūka ('parluks') vai Drive ('drive') vērtību. */
export function atrisinat(rezultats, izvele) {
  if (izvele !== 'parluks') return rezultats.dati;
  const d = structuredClone(rezultats.dati);
  for (const k of rezultats.konflikti) {
    if (k.kur in KOLEKCIJAS) {
      const { atslega } = KOLEKCIJAS[k.kur], i = d[k.kur].findIndex((r) => atslega(r) === k.atslega);
      if (k.l === null) { if (i >= 0) d[k.kur].splice(i, 1); }
      else if (i >= 0) d[k.kur][i] = k.l; else d[k.kur].push(k.l);
    } else if (KARTES.includes(k.kur)) d[k.kur][k.atslega] = k.l;
    else if (k.kur === 'profils') d.profils[k.atslega] = k.l;
    else d[k.atslega] = k.l;
  }
  return d;
}

/** Cik ierakstu kopā — lai brīdinātu, ja jaunā versija būtiski mazāka. */
export const ierakstuSkaits = (d) => Object.keys(KOLEKCIJAS).reduce((a, k) => a + (d?.[k]?.length || 0), 0);
