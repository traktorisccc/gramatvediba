// Datu glabāšana. 1. posmā: pārlūka localStorage. 2. posmā šo failu aizstās Google Drive versija ar tādu pašu saskarni.
const ATSLEGA = 'gramatvediba:dati';

export const TUKSI_DATI = () => ({
  versija: 1,
  profils: { vards: '', personasKods: '', adrese: { iela: '', pilseta: '', indekss: '', valsts: 'LV' }, iban: '', bic: '', epasts: '', vieta: 'Rīgā', logo: '', nakamaisNr: 1 },
  pasutitaji: [], rekini: [], autorligumi: [], darijumi: [], maksataji: {},
  gadi: {} // gads → { d1Apliekamie, d1Ieturetais, citiNodokli, dzivibasIemaksas, attaisnotie, vsaoiDeklareta }
});

export function ieladet() {
  try {
    const s = localStorage.getItem(ATSLEGA);
    if (!s) return TUKSI_DATI();
    const d = JSON.parse(s), t = TUKSI_DATI();
    return { ...t, ...d, profils: { ...t.profils, ...d.profils, adrese: { ...t.profils.adrese, ...(d.profils?.adrese || {}) } } };
  } catch { return TUKSI_DATI(); }
}

export function saglabat(dati) {
  try { localStorage.setItem(ATSLEGA, JSON.stringify(dati)); return true; } catch { return false; }
}

export function eksportet(dati) { return JSON.stringify({ ...dati, eksportets: new Date().toISOString() }, null, 1); }

export function importet(teksts) {
  const d = JSON.parse(teksts);
  if (!d || d.versija !== 1 || !Array.isArray(d.rekini)) throw new Error('Šis nav grāmatvedības rīka datu fails.');
  return d;
}
