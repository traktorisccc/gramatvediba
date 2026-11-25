// Rēķinu meklēšana: teksts pozīcijās (neatkarīgi no garumzīmēm, lielajiem burtiem un vārda galotnes), pasūtītājs, periods.

/** "Ziemassvētku" → "ziemassvetku" */
export const normalizet = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Vārda celms bez latviešu galotnes, lai "animācijas" atrod arī "animācija" un "animācijām". */
export function celms(vards) {
  const v = normalizet(vards);
  const bez = v.replace(/(ajiem|ajam|ajos|iem|am|em|im|um|as|es|os|is|us|ai|ei|a|e|i|u|s)$/, '');
  return bez.length >= 4 ? bez : v;
}

/** f: { teksts, pasutitajsId, no, lidz } (datumi GGGG-MM-DD). Tukšs lauks = bez ierobežojuma. */
export function filtretRekinus(rekini, f = {}) {
  const vardi = normalizet(f.teksts).split(/[^a-z0-9]+/).filter(Boolean).map(celms);
  return rekini.filter((r) => {
    if (f.pasutitajsId && r.pasutitajsId !== f.pasutitajsId) return false;
    if (f.no && r.datums < f.no) return false;
    if (f.lidz && r.datums > f.lidz) return false;
    if (!vardi.length) return true;
    const t = normalizet((r.pozicijas || []).map((p) => p.nosaukums).join(' '));
    return vardi.every((v) => t.includes(v));
  });
}

export const filtrsAktivs = (f = {}) => !!(String(f.teksts || '').trim() || f.pasutitajsId || f.no || f.lidz);

/**
 * Bankas darījumu filtrs. f: { teksts, kategorija, virziens ('K'|'D'), no, lidz, konts, bezSaites }.
 * teksts meklē maksātājā un mērķī (+ papildTeksts(d), piem., rēķina pozīcijas). bezSaites: tikai ienākumi bez rēķina vai līguma.
 */
export function filtretDarijumus(darijumi, f = {}, papildTeksts = () => '') {
  const vardi = normalizet(f.teksts).split(/[^a-z0-9]+/).filter(Boolean).map(celms);
  return darijumi.filter((d) => {
    if (f.kategorija && d.kategorija !== f.kategorija) return false;
    if (f.virziens && d.virziens !== f.virziens) return false;
    if (f.no && d.datums < f.no) return false;
    if (f.lidz && d.datums > f.lidz) return false;
    if (f.konts && d.konts !== f.konts) return false;
    if (f.bezSaites && (d.virziens === 'D' || d.saite || !['sd', 'nodokli-samaksaja-izmaksatajs'].includes(d.kategorija))) return false;
    if (!vardi.length) return true;
    const t = normalizet(`${d.partneris || ''} ${d.info || ''} ${papildTeksts(d) || ''}`);
    return vardi.every((v) => t.includes(v));
  });
}

export const darijumuFiltrsAktivs = (f = {}) => !!(String(f.teksts || '').trim() || f.kategorija || f.virziens || f.no || f.lidz || f.konts || f.bezSaites);
