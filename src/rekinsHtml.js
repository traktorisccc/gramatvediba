// Rēķina saturs un izskats: HTML priekšskatījumam; PDF failu veido pdf.js no tā paša satura.
import { summaVardiemLv, summaVardiemEn } from './summaVardiem.js';
import { r2 } from './calc.js';

const MEN_LOK = ['janvārī', 'februārī', 'martā', 'aprīlī', 'maijā', 'jūnijā', 'jūlijā', 'augustā', 'septembrī', 'oktobrī', 'novembrī', 'decembrī'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const naudaLv = (x) => new Intl.NumberFormat('lv-LV', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
export function datumsVardiem(iso) { const [g, m, d] = iso.split('-').map(Number); return `${g}. gada ${d}. ${MEN_LOK[m - 1]}`; }
export const datumsLv = (iso) => iso ? iso.split('-').reverse().join('.') + '.' : '';
/** Rēķina numurs kā identifikators: tāds pats PDF, XML un faila nosaukumā. */
export const rekinaNumursId = (nr, veidne) => veidne === 'hanzas' ? String(nr).padStart(3, '0') : String(nr);
export const rekinaNumursTeksts = (nr, veidne) => veidne === 'hanzas' ? `Nr. ${rekinaNumursId(nr, veidne)}` : `#${nr}`;

export function rekinaKopsumma(r) { return r2(r.pozicijas.reduce((a, p) => a + r2(p.daudzums * p.cena), 0)); }

const adreseTeksts = (a) => [a?.iela, a?.pilseta, a?.indekss].filter(Boolean).join(', ');

/** Rēķina saturs, kopīgs HTML priekšskatījumam un PDF failam. */
export function rekinaSaturs(r, profils, pasutitajs) {
  const en = r.valoda === 'en', kopa = rekinaKopsumma(r);
  const L = en
    ? { rek: 'INVOICE', pec: 'under contract No.', autors: 'Author', sanemejs: 'Recipient', konts: 'Account No.', banka: 'Bank', bic: 'Bank code', reg: 'Registration No.', adr: 'Address', poz: 'Item', cena: 'Price', daudz: 'Qty', kopa: 'Total', vardiem: 'Amount in words', termins: 'Payment due', metode: 'Payment method: bank transfer', periods: 'Service period', piezime: 'This invoice was prepared electronically and is valid without a signature. The issuer is not registered for VAT.' }
    : { rek: 'RĒĶINS', pec: 'saskaņā ar LĪGUMU NR.', autors: 'Autors', sanemejs: 'Saņēmējs', konts: 'Konta numurs', banka: 'Banka', bic: 'Bankas kods', reg: 'Reģistrācijas Nr.', adr: 'Adrese', poz: 'Pozīcija', cena: 'Cena', daudz: 'Daudzums', kopa: 'Kopā', vardiem: 'Summa vārdiem', termins: 'Apmaksas termiņš', metode: 'Maksājuma metode: bankas pārskaitījums', periods: 'Pakalpojuma periods', piezime: 'Rēķins sagatavots elektroniski un ir derīgs bez paraksta. Rēķina izsniedzējs nav PVN maksātājs.' };
  const rindas = (pari) => pari.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  return {
    en, L, kopa,
    vieta: en ? `${profils.vieta === 'Rīgā' ? 'Riga' : profils.vieta}, ${datumsLv(r.datums).slice(0, -1)}` : `${profils.vieta}, ${datumsVardiem(r.datums)}`,
    virsraksts: `${L.rek} ${rekinaNumursTeksts(r.nr, pasutitajs.veidne)}`,
    ligums: r.ligumaNr ? `(${L.pec} ${r.ligumaNr})` : '',
    klients: { galva: `${L.sanemejs}: ${pasutitajs.nosaukums}`, rindas: rindas([[L.adr, adreseTeksts(pasutitajs.adrese)], [L.reg, pasutitajs.regNr], [L.konts, pasutitajs.konts], [L.banka, pasutitajs.banka], [L.bic, pasutitajs.bic]]) },
    autors: { galva: `${L.autors}: ${profils.vards}`, rindas: rindas([[L.reg, profils.personasKods], ['IBAN', profils.iban], ['SWIFT/BIC', profils.bic], [L.adr, adreseTeksts(profils.adrese)]]) },
    periods: r.periods?.no && r.periods?.lidz ? `${L.periods}: ${datumsLv(r.periods.no)} – ${datumsLv(r.periods.lidz)}` : '',
    pozicijas: r.pozicijas.map((p, i) => ({ nr: String(i + 1), nosaukums: p.nosaukums, cena: naudaLv(p.cena), daudzums: String(p.daudzums), summa: naudaLv(r2(p.daudzums * p.cena)) })),
    kopaTeksts: `${naudaLv(kopa)} EUR`,
    vardiem: `${L.vardiem}: ${en ? summaVardiemEn(kopa) : summaVardiemLv(kopa)}`,
    apaksa: [`${L.termins}: ${datumsLv(r.termins)}`, L.metode, L.piezime]
  };
}

export function rekinsHtml(r, profils, pasutitajs) {
  const S = rekinaSaturs(r, profils, pasutitajs), L = S.L, en = S.en;
  return `<!DOCTYPE html><html lang="${en ? 'en' : 'lv'}"><head><meta charset="utf-8"><title>${esc(S.virsraksts)}</title>
<style>
@page { size: A4; margin: 0; }   /* bez malām pārlūks nedrukā galveni un kājeni (lapas nosaukumu un adresi) */
body { font-family: "Helvetica Neue", Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.45; margin: 0; }
.lapa { max-width: 178mm; margin: 0 auto; padding: 8mm 0; position: relative; }
@media print { .lapa { max-width: none; padding: 22mm 16mm 18mm; } .logo { top: 22mm; right: 16mm; } }
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
<p class="vieta">${esc(S.vieta)}</p>
<h1>${esc(S.virsraksts)}${S.ligums ? ` <span style="font-weight:400;font-size:11pt">${esc(S.ligums)}</span>` : ''}</h1>
<div class="puses">
<p><b>${esc(S.klients.galva)}</b>${S.klients.rindas.map(esc).join('<br>')}</p>
<p><b>${esc(S.autors.galva)}</b>${S.autors.rindas.map(esc).join('<br>')}</p>
</div>
${S.periods ? `<p>${esc(S.periods)}</p>` : ''}
<table><thead><tr><th>Nr.</th><th>${L.poz}</th><th class="n">${L.cena}</th><th class="n">${L.daudz}</th><th class="n">${L.kopa}</th></tr></thead><tbody>
${S.pozicijas.map((p) => `<tr><td>${p.nr}</td><td style="white-space:pre-line">${esc(p.nosaukums)}</td><td class="n">${p.cena}</td><td class="n">${esc(p.daudzums)}</td><td class="n">${p.summa}</td></tr>`).join('')}
</tbody><tfoot><tr><td></td><td>${L.kopa}</td><td></td><td></td><td class="n">${S.kopaTeksts}</td></tr></tfoot></table>
<p class="vardiem">${esc(S.vardiem)}</p>
<div class="apaksa">${S.apaksa.map((t) => `<p>${esc(t)}</p>`).join('')}</div>
</div></body></html>`;
}
