// Pasūtītāja rekvizītu sadalīšana pa laukiem no ielīmēta teksta. Mehāniski, pēc marķieriem.
// Ko nevar droši atpazīt, tas paliek tukšs, nevis tiek ielikts nepareizā laukā.

const MARKIERI = /^(juridisk|faktisk|adrese|re[gģ]|banka|bankas|konts|konta|kods|swift|bic|iban|e-?pasts|pvn|t[aā]lr|tel|mob)/i;

function sadalitAdresi(rinda) {
  const teksts = rinda.replace(/^[^:]*adrese\s*:?/i, '').trim();
  const ind = teksts.match(/LV[-\s]?(\d{4})/i);
  const dalas = teksts.split(',').map((x) => x.trim()).filter((x) => x && !/^latvija$/i.test(x) && !/^LV[-\s]?\d{4}$/i.test(x))
    .map((x) => x.replace(/\s*LV[-\s]?\d{4}\s*/i, '').trim()).filter(Boolean);
  const pilseta = dalas.length > 1 ? dalas[dalas.length - 1] : '';
  const iela = (dalas.length > 1 ? dalas.slice(0, -1) : dalas).join(', ');
  return { iela, pilseta, indekss: ind ? `LV-${ind[1]}` : '' };
}

export function sadalitRekvizitus(teksts) {
  const rindas = String(teksts ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const viss = rindas.join('\n');
  const rez = { nosaukums: '', regNr: '', iela: '', pilseta: '', indekss: '', valsts: 'LV', epasts: '' };

  const nos = rindas.find((r) => !MARKIERI.test(r) && !/@/.test(r) && !/^\+?[\d\s-]{7,}$/.test(r));
  if (nos) rez.nosaukums = nos.replace(/[,;]+$/, '').trim();

  const reg = viss.match(/re[gģ](?:istr[aā]cijas)?\.?\s*(?:nr|numurs|n)?\.?\s*:?\s*((?:LV)?\d{8,11})/i) || viss.match(/(?<![\dA-Z])([49]\d{10})(?!\d)/);
  if (reg) rez.regNr = reg[1].replace(/^LV/i, '');

  const adr = rindas.find((r) => /juridisk[aā]\s+adrese/i.test(r)) || rindas.find((r) => /adrese/i.test(r) && !/faktisk/i.test(r)) || rindas.find((r) => /LV[-\s]?\d{4}/i.test(r) && !MARKIERI.test(r) && r !== nos);
  if (adr) Object.assign(rez, sadalitAdresi(adr));

  const ep = viss.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  if (ep) rez.epasts = ep[0];
  return rez;
}
