// Ieņēmumu un izdevumu žurnāls pa ceturkšņiem — viens avots gan rīka skatam, gan Excel pārskatam.
import { r2, menesuIenakumi } from './calc.js';
import { DARBA_VEIDI } from './darbaVeidi.js';

/** Bankas kategorijas, kuru ienākumi žurnālā redzami, bet nodokļu aprēķinā neiet (nodoklis jau samaksāts). */
export const IETURETIE = { 'nodokli-samaksaja-izmaksatajs': 'Nodokļus samaksāja izmaksātājs', akka: 'AKKA/LAA (D1)' };

const ceturksnis = (iso) => Math.ceil(Number(iso.slice(5, 7)) / 3);

/**
 * sd:   [{ datums, partneris, info, veids, summa, pozicija? }] — saimnieciskās darbības ieņēmumi
 * citi: [{ datums, partneris, info, summa, iemesls, pozicija? }] — ienākumi, no kuriem nodokļus jau samaksāja cits
 * Atgriež { ceturksni: [{ c, rindas, kopa }], kopa }. Ceturkšņu un gada summas sakrīt ar ceturkšņa ziņojumu un D3.
 */
export function zurnals(sd, citi, gads) {
  const sis = (e) => Number(e.datums.slice(0, 4)) === gads;
  const visi = [...sd.filter(sis).map((e) => ({ ...e, sd: true })), ...citi.filter(sis).map((e) => ({ ...e, sd: false }))]
    .sort((a, b) => a.datums.localeCompare(b.datums) || Number(b.sd) - Number(a.sd));
  const m = menesuIenakumi(sd.map((e) => ({ ...e, kategorija: 'sd' })), gads);
  let nr = 0;
  const summa = (x, k) => r2(x.reduce((a, e) => a + (e[k] || 0), 0));
  const ceturksni = [1, 2, 3, 4].map((c) => {
    const rindas = visi.filter((e) => ceturksnis(e.datums) === c).map((e) => {
      const norma = e.sd ? (DARBA_VEIDI[e.veids]?.norma ?? 0) : null;
      return {
        nr: ++nr, datums: e.datums, partneris: e.partneris || '', info: e.info || '', sd: e.sd, veids: e.sd ? e.veids : '',
        veidaTeksts: e.sd ? `${e.veids} ${DARBA_VEIDI[e.veids]?.nosaukums || ''}`.trim() : e.iemesls || '',
        norma, ienemumi: e.sd ? e.summa : null, nosacitie: e.sd ? r2(e.summa * norma / 100) : null, ienakums: e.sd ? r2(e.summa - e.summa * norma / 100) : null,
        neieskaitits: e.sd ? null : e.summa, pozicija: e.pozicija || ''
      };
    });
    const mm = m.slice((c - 1) * 3, c * 3), ienemumi = summa(mm, 'ienemumi'), nosacitie = summa(mm, 'nosacitie');
    return { c, rindas, kopa: { ienemumi, nosacitie, ienakums: r2(ienemumi - nosacitie), neieskaitits: summa(rindas, 'neieskaitits') } };
  });
  const ienemumi = summa(m, 'ienemumi'), nosacitie = summa(m, 'nosacitie');
  return { ceturksni, kopa: { ienemumi, nosacitie, ienakums: r2(ienemumi - nosacitie), neieskaitits: r2(ceturksni.reduce((a, c) => a + c.kopa.neieskaitits, 0)) } };
}
