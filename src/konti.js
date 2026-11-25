// Vairāki bankas konti, ielādēto izrakstu periodi, ar roku ievadīti maksājumi un nodokļu samaksas atzīmes.

const dienas = (a, b) => Math.abs(new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5;
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const pieskaitit = (iso, n) => { const t = new Date(iso + 'T12:00:00'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// ---------- Darījumu atpazīšana starp kontiem ----------
/** Sākotnējais bankas arhīva kods (ja glabāšanai tas papildināts ar konta galotni). */
export const bankasKods = (d) => d.bankasKods || d.arhivaKods;

/** Vai šis izraksta darījums jau ir rīkā. Vecākiem ierakstiem konts nav zināms: tad salīdzina tikai kodu. */
export function zinamieDarijumi(darijumi) {
  const ar = new Set(), bez = new Set();
  for (const d of darijumi) (d.konts ? ar : bez).add(d.konts ? `${d.konts}|${bankasKods(d)}` : bankasKods(d));
  return (konts, kods) => ar.has(`${konts}|${kods}`) || bez.has(kods);
}

/** Kods glabāšanai: ja cita konta darījumam jau ir tāds pats arhīva kods, pievieno konta galotni, lai ieraksti nesaplūstu. */
export function glabajamaisKods(darijumi, konts, kods) {
  const aizn = darijumi.some((d) => d.arhivaKods === kods && d.konts && d.konts !== konts);
  return aizn ? `${kods}@${String(konts).slice(-4)}` : kods;
}

// ---------- Izrakstu periodi ----------
/** izraksti: { atslēga: { konts, no, lidz } } → katram kontam apvienoti periodi un iztrūkumi. */
export function kontuParklajums(izraksti) {
  const pec = new Map();
  for (const x of Object.values(izraksti || {})) if (x?.konts && x.no && x.lidz) pec.set(x.konts, [...(pec.get(x.konts) || []), { no: x.no, lidz: x.lidz }]);
  const rez = {};
  for (const [konts, p] of pec) {
    p.sort((a, b) => a.no.localeCompare(b.no));
    const per = [];
    for (const x of p) {
      const pd = per[per.length - 1];
      if (pd && x.no <= pieskaitit(pd.lidz, 1)) { if (x.lidz > pd.lidz) pd.lidz = x.lidz; }
      else per.push({ ...x });
    }
    const iztrukumi = per.slice(1).map((x, i) => ({ no: pieskaitit(per[i].lidz, 1), lidz: pieskaitit(x.no, -1) }));
    rez[konts] = { periodi: per, iztrukumi, lidz: per[per.length - 1].lidz };
  }
  return rez;
}

/** Vai datums ir kāda šī konta ielādētā izraksta periodā. */
export const parklats = (parkl, konts, datums) => !!parkl[konts]?.periodi.some((p) => p.no <= datums && datums <= p.lidz);

// ---------- Ar roku ievadīti ienākumi ----------
/**
 * Izraksta ienākošajam maksājumam atrod ar roku ievadītu ierakstu, ko tas aizstāj:
 * tā pati summa, ±7 dienas un tas pats maksātājs vai tas pats rēķins/līgums.
 */
export function atrastRokuIerakstu(darijumi, r, sakrit = (a, b) => a === b, izmantoti = new Set()) {
  if (r.virziens !== 'K') return null;
  return darijumi.find((d) => d.arRoku && d.virziens === 'K' && !izmantoti.has(d.arhivaKods) && Math.abs(d.summa - r.summa) < 0.005 && dienas(d.datums, r.datums) <= 7
    && (sakrit(d.partneris, r.partneris) || (d.saite && r.saite && d.saite.tips === r.saite.tips && d.saite.kods === r.saite.kods))) || null;
}

// ---------- Nodokļu samaksas atzīmes ----------
// samaksas: { '2026-C1': { zinots, maksajumi: [{ summa, datums }] }, '2026-IIN': {...}, '2025-norekinats': { datums } }
export const ceturksnaAtslega = (gads, c) => `${gads}-C${c}`;
export const iinAtslega = (gads) => `${gads}-IIN`;
export const norekinatsAtslega = (gads) => `${gads}-norekinats`;
export const samaksatsAtzimei = (a) => r2((a?.maksajumi || []).reduce((s, m) => s + (Number(m.summa) || 0), 0));

/** Visas gada atzīmes: ceturkšņi un IIN. */
export function gadaAtzimes(samaksas, gads) {
  const s = samaksas || {}, rez = [];
  for (const c of [1, 2, 3, 4]) { const a = s[ceturksnaAtslega(gads, c)]; if (a) rez.push({ kods: ceturksnaAtslega(gads, c), nosaukums: `${c}. ceturkšņa VSAOI`, ...a }); }
  const i = s[iinAtslega(gads)]; if (i) rez.push({ kods: iinAtslega(gads), nosaukums: `IIN par ${gads}. gadu`, ...i });
  return rez;
}

/**
 * Atzīmētos maksājumus salīdzina ar bankas izraksta maksājumiem VID (summa ±0,01, datums ±10 dienas).
 * Atgriež { rindas: [{ atzime, maksajums, banka, statuss: 'sakrit'|'nav-izraksta'|'nav-atzimets' }] }.
 */
export function salidzinatSamaksas(atzimes, bankas) {
  const brivi = [...bankas].sort((a, b) => a.datums.localeCompare(b.datums)), rindas = [];
  for (const a of atzimes) for (const m of a.maksajumi || []) {
    if (!(Number(m.summa) > 0)) continue;
    const i = brivi.findIndex((b) => Math.abs(b.summa - m.summa) < 0.015 && dienas(b.datums, m.datums) <= 10);
    if (i >= 0) { rindas.push({ atzime: a, maksajums: m, banka: brivi[i], statuss: 'sakrit' }); brivi.splice(i, 1); }
    else rindas.push({ atzime: a, maksajums: m, banka: null, statuss: 'nav-izraksta' });
  }
  for (const b of brivi) rindas.push({ atzime: null, maksajums: null, banka: b, statuss: 'nav-atzimets' });
  rindas.sort((x, y) => (x.maksajums?.datums || x.banka.datums).localeCompare(y.maksajums?.datums || y.banka.datums));
  return { rindas };
}
