// Grāmatvedības rīka aprēķinu kodols. Tīras funkcijas, bez ārējām atkarībām.
// Visas summas eiro; noapaļošana līdz centiem tāpat kā EDS: katrā solī.
import { norma } from './darbaVeidi.js';

export const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const menesis = (datums) => Number(datums.slice(5, 7));

/** Saimnieciskās darbības ieņēmumi pa mēnešiem (pēc naudas saņemšanas datuma). */
export function menesuIenakumi(ieraksti, gads) {
  const m = Array.from({ length: 12 }, (_, i) => ({ menesis: i + 1, ienemumi: 0, nosacitie: 0 }));
  for (const e of ieraksti) {
    if (e.kategorija !== 'sd' || Number(e.datums.slice(0, 4)) !== gads) continue;
    const x = m[menesis(e.datums) - 1];
    x.ienemumi += e.summa;
    x.nosacitie += e.summa * norma(e.veids) / 100;
  }
  return m.map((x) => {
    const ienemumi = r2(x.ienemumi), nosacitie = r2(x.nosacitie);
    return { ...x, ienemumi, nosacitie, ienakums: r2(Math.max(0, ienemumi - nosacitie)) };
  });
}

/** Viena mēneša VSAOI tāpat kā pašnodarbinātā ziņojumā. */
export function vsaoiMenesim(ienakums, n) {
  if (ienakums >= n.minimalaAlga) {
    const objekts = n.minimalaAlga, pensObjekts = r2(ienakums - objekts);
    return { objekts, vsaoi: r2(objekts * n.vsaoiLikme / 100), pensObjekts, pens: r2(pensObjekts * n.pensijuLikme / 100) };
  }
  return { objekts: 0, vsaoi: 0, pensObjekts: ienakums, pens: r2(ienakums * n.pensijuLikme / 100) };
}

/** Pašnodarbinātā ziņojums ceturksnim (1–4): rindas tieši kā EDS formā. */
export function ceturksnaZinojums(menesi, ceturksnis, n) {
  const rindas = menesi.slice((ceturksnis - 1) * 3, ceturksnis * 3).map((m) => ({ menesis: m.menesis, ienakums: m.ienakums, ...vsaoiMenesim(m.ienakums, n) }));
  const summa = (k) => r2(rindas.reduce((a, x) => a + x[k], 0));
  const kopa = { objekts: summa('objekts'), vsaoi: summa('vsaoi'), pensObjekts: summa('pensObjekts'), pens: summa('pens') };
  return { ceturksnis, rindas, kopa, jaMaksa: r2(kopa.vsaoi + kopa.pens) };
}

/** D3 pielikuma skaitļi no ierakstiem. */
export function d3(ieraksti, gads) {
  const m = menesuIenakumi(ieraksti, gads);
  const ienemumi = r2(m.reduce((a, x) => a + x.ienemumi, 0));
  const izdevumi = r2(m.reduce((a, x) => a + x.nosacitie, 0));
  return { ienemumi, izdevumi, apliekamie: r2(Math.max(0, ienemumi - izdevumi)) };
}

/**
 * Gada deklarācijas D lapas aplēse.
 * c: { d3Apliekamie, d1Apliekamie, d1Ieturetais, citiNodokli, vsaoi, dzivibasIemaksas, attaisnotie }
 */
export function gadaDeklaracija(c, n) {
  const r1 = r2((c.d1Apliekamie || 0) + c.d3Apliekamie);
  const r6 = r2(c.vsaoi || 0);
  const r8 = r2(c.attaisnotie || 0);
  const r9 = r2(Math.min(c.dzivibasIemaksas || 0, r2(r1 * n.dzivibasApdrosinasanaMaxDala / 100)));
  const r10 = r2(r6 + r8 + r9);
  const r11 = r2(n.neapliekamaisMinimumsMenesi * 12);
  const baze = r2(Math.max(0, r1 - r10 - r11));
  const zem = Math.min(baze, n.iinSlieksnis), virs = Math.max(0, baze - n.iinSlieksnis);
  const r18 = r2(r2(zem * n.iinLikme / 100) + r2(virs * n.iinAugstaLikme / 100));
  const r19 = r2(c.citiNodokli || 0);
  const r23 = r2(c.d1Ieturetais || 0);
  const starpiba = r2(r18 + r19 - r23);
  return { r1, r6, r8, r9, r10, r11, baze, r18, r19, r23, r24: starpiba > 0 ? starpiba : 0, r25: starpiba < 0 ? -starpiba : 0 };
}
