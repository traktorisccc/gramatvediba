// Summa vārdiem latviski un angliski rēķiniem. Mehāniski, pēc gramatikas noteikumiem.

const LV_VIENI = ['', 'viens', 'divi', 'trīs', 'četri', 'pieci', 'seši', 'septiņi', 'astoņi', 'deviņi'];
const LV_PADSMIT = ['desmit', 'vienpadsmit', 'divpadsmit', 'trīspadsmit', 'četrpadsmit', 'piecpadsmit', 'sešpadsmit', 'septiņpadsmit', 'astoņpadsmit', 'deviņpadsmit'];
const LV_DESMITI = ['', '', 'divdesmit', 'trīsdesmit', 'četrdesmit', 'piecdesmit', 'sešdesmit', 'septiņdesmit', 'astoņdesmit', 'deviņdesmit'];

// Vienskaitlis, ja skaitlis beidzas ar 1, bet ne ar 11 (21 tūkstotis, bet 11 tūkstoši)
const vienskaitlis = (n) => n % 10 === 1 && n % 100 !== 11;

function lvLidz999(n) {
  const v = [], s = Math.floor(n / 100), r = n % 100;
  if (s === 1) v.push('simts'); else if (s > 1) v.push(LV_VIENI[s], 'simti');
  if (r >= 10 && r < 20) v.push(LV_PADSMIT[r - 10]);
  else { if (r >= 20) v.push(LV_DESMITI[Math.floor(r / 10)]); if (r % 10) v.push(LV_VIENI[r % 10]); }
  return v.join(' ');
}

export function veselsSkaitlisLv(n) {
  if (n === 0) return 'nulle';
  const v = [], milj = Math.floor(n / 1e6), tuk = Math.floor((n % 1e6) / 1000), atl = n % 1000;
  if (milj) v.push(lvLidz999(milj), vienskaitlis(milj) ? 'miljons' : 'miljoni');
  if (tuk) v.push(lvLidz999(tuk), vienskaitlis(tuk) ? 'tūkstotis' : 'tūkstoši');
  if (atl) v.push(lvLidz999(atl));
  return v.join(' ');
}

const EN_1 = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function enLidz999(n) {
  const v = [], s = Math.floor(n / 100), r = n % 100;
  if (s) v.push(EN_1[s], 'hundred');
  if (r < 20) { if (r) v.push(EN_1[r]); } else v.push(EN_10[Math.floor(r / 10)] + (r % 10 ? '-' + EN_1[r % 10] : ''));
  return v.join(' ');
}
export function veselsSkaitlisEn(n) {
  if (n === 0) return 'zero';
  const v = [], milj = Math.floor(n / 1e6), tuk = Math.floor((n % 1e6) / 1000), atl = n % 1000;
  if (milj) v.push(enLidz999(milj), 'million');
  if (tuk) v.push(enLidz999(tuk), 'thousand');
  if (atl) v.push(enLidz999(atl));
  return v.join(' ');
}

const lielais = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function dalit(summa) {
  const centi = Math.round(summa * 100);
  return { eiro: Math.floor(centi / 100), centi: centi % 100 };
}

/** "Viens tūkstotis eiro un sešdesmit astoņi centi"; bez centiem → "Viens tūkstotis eiro". */
export function summaVardiemLv(summa) {
  const { eiro, centi } = dalit(summa);
  const pamats = `${lielais(veselsSkaitlisLv(eiro))} eiro`;
  if (!centi) return pamats;
  return `${pamats} un ${veselsSkaitlisLv(centi)} ${vienskaitlis(centi) ? 'cents' : 'centi'}`;
}

/** "One thousand euros and sixty-eight cents"; bez centiem → "One thousand euros". */
export function summaVardiemEn(summa) {
  const { eiro, centi } = dalit(summa);
  const pamats = `${lielais(veselsSkaitlisEn(eiro))} ${eiro === 1 ? 'euro' : 'euros'}`;
  if (!centi) return pamats;
  return `${pamats} and ${veselsSkaitlisEn(centi)} ${centi === 1 ? 'cent' : 'cents'}`;
}
