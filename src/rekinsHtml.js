// Rēķina izskats drukāšanai un PDF saglabāšanai (pārlūka "Saglabāt kā PDF").
import { summaVardiemLv, summaVardiemEn } from './summaVardiem.js';
import { r2 } from './calc.js';

const MEN_LOK = ['janvārī', 'februārī', 'martā', 'aprīlī', 'maijā', 'jūnijā', 'jūlijā', 'augustā', 'septembrī', 'oktobrī', 'novembrī', 'decembrī'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const naudaLv = (x) => new Intl.NumberFormat('lv-LV', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
export function datumsVardiem(iso) { const [g, m, d] = iso.split('-').map(Number); return `${g}. gada ${d}. ${MEN_LOK[m - 1]}`; }
export const datumsLv = (iso) => iso ? iso.split('-').reverse().join('.') + '.' : '';
export const rekinaNumursTeksts = (nr, veidne) => veidne === 'hanzas' ? `Nr. ${String(nr).padStart(3, '0')}` : `#${nr}`;

export function rekinaKopsumma(r) { return r2(r.pozicijas.reduce((a, p) => a + r2(p.daudzums * p.cena), 0)); }

const adreseTeksts = (a) => [a?.iela, a?.pilseta, a?.indekss].filter(Boolean).join(', ');

export function rekinsHtml(r, profils, pasutitajs) {
  const en = r.valoda === 'en', kopa = rekinaKopsumma(r);
  const L = en
    ? { rek: 'INVOICE', pec: 'under contract No.', autors: 'Author', reg: 'Registration No.', adr: 'Address', poz: 'Item', cena: 'Price', daudz: 'Qty', kopa: 'Total', vardiem: 'Amount in words', termins: 'Payment due', metode: 'Payment method: bank transfer', periods: 'Service period', piezime: 'This invoice was prepared electronically and is valid without a signature. The issuer is not registered for VAT.' }
    : { rek: 'RĒĶINS', pec: 'saskaņā ar LĪGUMU NR.', autors: 'Autors', reg: 'Reģistrācijas Nr.', adr: 'Adrese', poz: 'Pozīcija', cena: 'Cena', daudz: 'Daudzums', kopa: 'Kopā', vardiem: 'Summa vārdiem', termins: 'Apmaksas termiņš', metode: 'Maksājuma metode: bankas pārskaitījums', periods: 'Pakalpojuma periods', piezime: 'Rēķins sagatavots elektroniski un ir derīgs bez paraksta. Rēķina izsniedzējs nav PVN maksātājs.' };
  const virsraksts = en ? `${esc(profils.vieta === 'Rīgā' ? 'Riga' : profils.vieta)}, ${r.datums}` : `${esc(profils.vieta)}, ${datumsVardiem(r.datums)}`;
  return `<!DOCTYPE html><html lang="${en ? 'en' : 'lv'}"><head><meta charset="utf-8"><title>${L.rek} ${esc(rekinaNumursTeksts(r.nr, 'standarta'))}</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
body { font-family: "Helvetica Neue", Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.45; margin: 0; }
.lapa { max-width: 178mm; margin: 0 auto; padding: 8mm 0; position: relative; }
.logo { position: absolute; top: 0; right: 0; width: 100px; height: 100px; object-fit: contain; }
.vieta { margin: 0 0 18px; } h1 { font-size: 15pt; margin: 0 0 28px; letter-spacing: .02em; padding-right: 120px; }
.puses { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 26px; } .puses p { margin: 0; }
.puses b { display: block; margin-bottom: 2px; }
table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; } th, td { border-bottom: 1px solid #bbb; padding: 7px 6px; text-align: left; vertical-align: top; }
th { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1.5px solid #111; } td.n, th.n { text-align: right; white-space: nowrap; }
tfoot td { border-bottom: 0; font-weight: 700; font-size: 12pt; }
.vardiem { margin: 0 0 18px; } .apaksa { margin-top: 28px; font-size: 10pt; color: #333; } .apaksa p { margin: 3px 0; }
@media screen { body { background: #e9ebe7; } .lapa { background: #fff; padding: 18mm 16mm; margin: 16px auto; box-shadow: 0 1px 6px rgba(0,0,0,.15); } }
</style></head><body><div class="lapa">
${profils.logo ? `<img class="logo" src="${profils.logo}" alt="">` : ''}
<p class="vieta">${virsraksts}</p>
<h1>${L.rek} ${esc(rekinaNumursTeksts(r.nr, 'standarta'))}${r.ligumaNr ? ` <span style="font-weight:400;font-size:11pt">(${L.pec} ${esc(r.ligumaNr)})</span>` : ''}</h1>
<div class="puses">
<p><b>${esc(pasutitajs.nosaukums)}</b>${L.reg} ${esc(pasutitajs.regNr)}<br>${esc(adreseTeksts(pasutitajs.adrese))}</p>
<p><b>${L.autors}: ${esc(profils.vards)}</b>${L.reg} ${esc(profils.personasKods)}<br>IBAN: ${esc(profils.iban)}${profils.bic ? `<br>SWIFT/BIC: ${esc(profils.bic)}` : ''}<br>${L.adr}: ${esc(adreseTeksts(profils.adrese))}</p>
</div>
${r.periods ? `<p>${L.periods}: ${datumsLv(r.periods.no)} – ${datumsLv(r.periods.lidz)}</p>` : ''}
<table><thead><tr><th>Nr.</th><th>${L.poz}</th><th class="n">${L.cena}</th><th class="n">${L.daudz}</th><th class="n">${L.kopa}</th></tr></thead><tbody>
${r.pozicijas.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.nosaukums)}</td><td class="n">${naudaLv(p.cena)}</td><td class="n">${esc(p.daudzums)}</td><td class="n">${naudaLv(r2(p.daudzums * p.cena))}</td></tr>`).join('')}
</tbody><tfoot><tr><td></td><td>${L.kopa}</td><td></td><td></td><td class="n">${naudaLv(kopa)} EUR</td></tr></tfoot></table>
<p class="vardiem">${L.vardiem}: ${esc(en ? summaVardiemEn(kopa) : summaVardiemLv(kopa))}</p>
<div class="apaksa"><p>${L.termins}: ${datumsLv(r.termins)}</p><p>${L.metode}</p><p>${L.piezime}</p></div>
</div></body></html>`;
}
