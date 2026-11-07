// Grāmatvedības rīka saskarne (1. posms: dati pārlūkā).
import { r2, menesuIenakumi, ceturksnaZinojums, d3, gadaDeklaracija } from './calc.js';
import { DARBA_VEIDI } from './darbaVeidi.js';
import { nolasitSwedbankCsv, klasificet, bezMaksajuma, normalizetNosaukumu } from './banka.js';
import { eRekinsXml } from './eRekins.js';
import { rekinsHtml, rekinaKopsumma, rekinaNumursTeksts, naudaLv, datumsLv } from './rekinsHtml.js';
import { ieladet, saglabat, eksportet, importet, TUKSI_DATI } from './glabatuve.js';

// ---------- Pamata palīgi ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sk = (v) => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const eds = (x) => r2(x).toFixed(2).replace('.', ',');           // EDS formāts: 1480,00
const sodien = () => new Date().toISOString().slice(0, 10);
const pieskaititDienas = (iso, d) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const MENESI = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'];
const KATEGORIJAS = {
  sd: 'Saimnieciskā darbība', 'nodokli-samaksaja-izmaksatajs': 'Nodokļus samaksāja izmaksātājs', akka: 'AKKA/LAA (D1)', 'vid-atmaksa': 'VID atmaksa',
  'kartes-atgriesana': 'Kartes darījuma atgriešana', procenti: 'Procenti', personigs: 'Personīgs pārskaitījums', 'savs-konts': 'No sava konta', jaizverte: '— jāizvērtē —'
};

let dati = ieladet();
const noteikumi = {};
let bankasSesija = null;

function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 1800); }
function saglabatUnRadit(zina) { if (!saglabat(dati)) toast('Neizdevās saglabāt pārlūkā'); else if (zina) toast(zina); radit(); }
function lejupieladet(nosaukums, saturs, tips) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([saturs], { type: tips })); a.download = nosaukums;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function kopet(v) { try { await navigator.clipboard.writeText(v); toast(`Nokopēts: ${v}`); } catch { toast('Neizdevās nokopēt'); } }

// ---------- Datu atvasinājumi ----------
const pasutitajs = (id) => dati.pasutitaji.find((p) => p.id === id) || { nosaukums: '?', regNr: '', adrese: {} };
function gadaNoteikumi(gads) {
  if (noteikumi[gads]) return { n: noteikumi[gads], provizoriski: false };
  const pedejais = Math.max(...Object.keys(noteikumi).map(Number));
  return { n: noteikumi[pedejais], provizoriski: true, no: pedejais };
}
function registrs() {
  return {
    savsVards: dati.profils.vards,
    rekini: dati.rekini.map((r) => ({ nr: r.nr, summa: rekinaKopsumma(r), pasutitajs: pasutitajs(r.pasutitajsId).nosaukums, datums: r.datums, samaksatsCitur: r.samaksatsCitur })),
    autorligumi: dati.autorligumi.map((a) => ({ nr: a.nr, summa: a.summa, pasutitajs: pasutitajs(a.pasutitajsId).nosaukums, izmaksatajsIetur: a.izmaksatajsIetur })),
    noteikumi: dati.maksataji
  };
}
function veidsPecSaites(saite) {
  if (saite?.tips === 'rekins') return dati.rekini.find((r) => r.nr === saite.nr)?.veids || '90.13';
  if (saite?.tips === 'autorligums') return dati.autorligumi.find((a) => a.nr === saite.nr)?.veids || '90.13';
  return '90.13';
}
function sdIeraksti() {
  const no_bankas = dati.darijumi.filter((d) => d.kategorija === 'sd').map((d) => ({ datums: d.datums, summa: d.summa, veids: d.veids || veidsPecSaites(d.saite), kategorija: 'sd' }));
  const citur = dati.rekini.filter((r) => r.samaksatsCitur).map((r) => ({ datums: r.samaksatsCitur.datums, summa: rekinaKopsumma(r), veids: r.veids, kategorija: 'sd' }));
  return [...no_bankas, ...citur];
}
function rekinsSamaksats(r) {
  if (r.samaksatsCitur) return true;
  const kopa = rekinaKopsumma(r);
  return dati.darijumi.some((d) => d.saite?.tips === 'rekins' && d.saite.nr === r.nr && Math.abs(d.summa - kopa) < 0.005);
}
function termini(gads, c) {
  const [g, m] = [[gads, 4], [gads, 7], [gads, 10], [gads + 1, 1]][c - 1], mm = String(m).padStart(2, '0');
  const lab = m === 1 ? `${g}-02-23` : `${g}-${String(m + 1).padStart(2, '0')}-23`;
  return { iesniegt: `${g}-${mm}-17`, samaksat: `${g}-${mm}-23`, labotLidz: lab };
}
function gadaAprekins(gads) {
  const { n } = gadaNoteikumi(gads), ier = sdIeraksti(), m = menesuIenakumi(ier, gads);
  const q = [1, 2, 3, 4].map((c) => ceturksnaZinojums(m, c, n));
  const vsaoi = r2(q.reduce((a, x) => a + x.jaMaksa, 0));
  const g = dati.gadi[gads] || {}, x = d3(ier, gads);
  const d = gadaDeklaracija({ d3Apliekamie: x.apliekamie, d1Apliekamie: sk(g.d1Apliekamie), d1Ieturetais: sk(g.d1Ieturetais), citiNodokli: sk(g.citiNodokli),
    vsaoi: g.vsaoiDeklareta !== undefined && g.vsaoiDeklareta !== '' ? sk(g.vsaoiDeklareta) : vsaoi, dzivibasIemaksas: sk(g.dzivibasIemaksas), attaisnotie: sk(g.attaisnotie) }, n);
  return { m, q, vsaoi, d3: x, d };
}

// ---------- Pasūtītāja izvēlne ----------
function pasutitajaIzvele(name, izveleta) {
  const opcijas = [...dati.pasutitaji].sort((a, b) => a.nosaukums.localeCompare(b.nosaukums, 'lv'));
  return `<label>Pasūtītājs<select name="${name}" data-pasutitajs>
    <option value="__jauns">+ Ievadīt jaunus rekvizītus</option>
    ${opcijas.map((p) => `<option value="${p.id}" ${p.id === izveleta ? 'selected' : ''}>${h(p.nosaukums)}</option>`).join('')}
  </select></label>
  <div class="panel" data-jauns-pasutitajs ${opcijas.length && izveleta !== '__jauns' ? 'hidden' : ''} style="grid-column:1/-1">
    <div class="grid">
      <label>Nosaukums<input data-p="nosaukums"></label><label>Reģ. nr.<input data-p="regNr"></label>
      <label>Iela, māja<input data-p="iela"></label><label>Pilsēta<input data-p="pilseta"></label><label>Pasta indekss<input data-p="indekss" placeholder="LV-1001"></label>
      <label>Valsts<input data-p="valsts" value="LV"></label><label>E-pasts<input data-p="epasts"></label>
      <label>Rēķina veidne<select data-p="veidne"><option value="standarta">Mana veidne</option><option value="hanzas">Hanzas Perons blanka</option></select></label>
      <label class="check"><input type="checkbox" data-p="budzetaIestade"> Budžeta iestāde (obligāts e-rēķins)</label>
    </div>
    <p class="note">Vai pasūtītājs ir budžeta iestāde, var pārbaudīt CSP tīmekļvietnē pēc reģistrācijas numura.</p>
  </div>`;
}
function piesaistitPasutitajaIzveli(el) {
  const sel = $('[data-pasutitajs]', el), panel = $('[data-jauns-pasutitajs]', el);
  sel.onchange = () => { panel.hidden = sel.value !== '__jauns'; };
}
function nolasitPasutitaju(el) {
  const sel = $('[data-pasutitajs]', el);
  if (sel.value !== '__jauns') return sel.value;
  const v = (k) => $(`[data-p="${k}"]`, el);
  const p = { id: uid(), nosaukums: v('nosaukums').value.trim(), regNr: v('regNr').value.trim(),
    adrese: { iela: v('iela').value.trim(), pilseta: v('pilseta').value.trim(), indekss: v('indekss').value.trim(), valsts: v('valsts').value.trim() || 'LV' },
    epasts: v('epasts').value.trim(), veidne: v('veidne').value, budzetaIestade: v('budzetaIestade').checked };
  if (!p.nosaukums || !p.regNr) { toast('Ievadi pasūtītāja nosaukumu un reģistrācijas numuru'); return null; }
  dati.pasutitaji.push(p); return p.id;
}
const veidaIzvele = (name, izv = '90.13') => `<label>Darba veids<select name="${name}">${Object.entries(DARBA_VEIDI).map(([k, v]) =>
  `<option value="${k}" ${k === izv ? 'selected' : ''}>${h(v.nosaukums)} (${v.norma} %)</option>`).join('')}</select></label>`;

// ---------- Pārskats ----------
function skatsParskats(v) {
  const gads = Number(sodien().slice(0, 4)), sod = sodien();
  if (!dati.profils.vards) {
    v.innerHTML = `<h2>Sveiks!</h2><p class="lead">Sāc ar saviem rekvizītiem sadaļā „Iestatījumi”. Tie tiks ievietoti katrā rēķinā.</p><p><a href="#iestatijumi"><button class="primary">Uz iestatījumiem</button></a></p>`;
    return;
  }
  const a = gadaAprekins(gads), { provizoriski } = gadaNoteikumi(gads);
  const vidSamaksats = r2(dati.darijumi.filter((d) => d.kategorija === 'vid-maksajums' && d.datums.startsWith(String(gads))).reduce((s, d) => s + d.summa, 0));
  const japietur = r2(Math.max(0, a.vsaoi + a.d.r18 - a.d.r23 - vidSamaksats));
  // Cik atlikt no katra ienākuma: nodokļu pieaugums pēc katra maksājuma
  const ier = sdIeraksti().filter((e) => e.datums.startsWith(String(gads))).sort((x, y) => x.datums.localeCompare(y.datums));
  const { n } = gadaNoteikumi(gads); let ieprieks = 0;
  const atlikt = ier.map((e, i) => {
    const dala = ier.slice(0, i + 1), m = menesuIenakumi(dala, gads);
    const vs = [1, 2, 3, 4].reduce((s, c) => s + ceturksnaZinojums(m, c, n).jaMaksa, 0);
    const iin = gadaDeklaracija({ d3Apliekamie: d3(dala, gads).apliekamie, vsaoi: vs, dzivibasIemaksas: sk(dati.gadi[gads]?.dzivibasIemaksas) }, n).r18;
    const kopa = r2(vs + iin), x = r2(kopa - ieprieks); ieprieks = kopa; return { ...e, atlikt: x };
  });
  const nakamie = [1, 2, 3, 4].flatMap((c) => { const t = termini(gads, c); return [{ d: t.iesniegt, t: `${c}. ceturkšņa ziņojums` }, { d: t.samaksat, t: `${c}. ceturkšņa VSAOI samaksa`, s: a.q[c - 1].jaMaksa }]; })
    .concat([{ d: `${gads + 1}-03-01`, t: `Gada deklarācija par ${gads}. gadu (no 1. marta līdz 1. jūnijam)` }, { d: `${gads + 1}-06-23`, t: 'IIN samaksa', s: a.d.r24 }])
    .filter((x) => x.d >= sod).slice(0, 4);
  const neapm = dati.rekini.filter((r) => !rekinsSamaksats(r));
  v.innerHTML = `<h2>Pārskats ${gads}</h2>${provizoriski ? `<p class="banner">${gads}. gada noteikumi vēl nav pārbaudīti, aprēķini ir provizoriski.</p>` : ''}
  <div class="grid2">
    <div class="panel"><p class="note" style="margin:0">Nodokļiem jāpietur</p><div class="big"><span class="hl">${naudaLv(japietur)} €</span></div>
      <p class="note">VSAOI šogad ${naudaLv(a.vsaoi)} € + IIN aplēse ${naudaLv(a.d.r18)} € − AKKA ieturētais ${naudaLv(a.d.r23)} € − maksājumi VID šogad ${naudaLv(vidSamaksats)} €.
      VID maksājumos var būt arī iepriekšējā gada IIN, tad šis skaitlis ir mazāks par īsto.</p></div>
    <div class="panel"><h3 style="margin-top:0">Tuvākie termiņi</h3>${nakamie.map((x) => `<p style="margin:6px 0"><b>${datumsLv(x.d)}</b> ${h(x.t)}${x.s ? ` · ${naudaLv(x.s)} €` : ''}</p>`).join('') || '<p class="note">Šogad termiņu vairs nav.</p>'}</div>
  </div>
  <h3>Ienākumi šogad un cik no katra atlikt</h3>
  ${atlikt.length ? `<div class="tbl"><table><thead><tr><th>Datums</th><th class="n">Summa</th><th class="n">Atlikt nodokļiem</th></tr></thead><tbody>
    ${atlikt.map((e) => `<tr><td>${datumsLv(e.datums)}</td><td class="n">${naudaLv(e.summa)}</td><td class="n">${naudaLv(e.atlikt)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="note">Šogad vēl nav apstiprinātu ienākumu. Ielādē bankas izrakstu sadaļā „Banka”.</p>'}
  <p class="note">Neapmaksāti rēķini: ${neapm.length}. Nākamais rēķina numurs: ${dati.profils.nakamaisNr}.</p>`;
}

// ---------- Rēķini ----------
let rekinaForma = null;
function skatsRekini(v) {
  const saraksts = [...dati.rekini].sort((a, b) => b.nr - a.nr);
  v.innerHTML = `<h2>Rēķini</h2><p class="lead">Katram rēķinam tiek sagatavots PDF un e-rēķins XML formātā. Numerācija ir automātiska un viena visiem pasūtītājiem.</p>
  ${rekinaForma ? rekinaRedaktors() : '<p><button class="primary" id="jauns">+ Jauns rēķins</button></p>'}
  <div class="tbl" style="margin-top:16px"><table><thead><tr><th>Nr.</th><th>Datums</th><th>Pasūtītājs</th><th class="n">Summa</th><th>Statuss</th><th></th></tr></thead><tbody>
  ${saraksts.map((r) => { const p = pasutitajs(r.pasutitajsId), sam = rekinsSamaksats(r); return `<tr><td>${h(rekinaNumursTeksts(r.nr, p.veidne))}</td><td>${datumsLv(r.datums)}</td><td class="wrap">${h(p.nosaukums)}${p.budzetaIestade ? ' <span class="tag">budžeta iestāde</span>' : ''}</td>
    <td class="n">${naudaLv(rekinaKopsumma(r))}</td><td>${sam ? '<span class="tag ok">apmaksāts</span>' : (r.termins < sodien() ? '<span class="tag warn">kavēts</span>' : '<span class="tag">gaida</span>')}</td>
    <td><div class="row"><button class="link" data-pdf="${r.id}">PDF</button><button class="link" data-xml="${r.id}">XML</button></div></td></tr>`; }).join('') || '<tr><td colspan="6" class="note">Rēķinu vēl nav.</td></tr>'}
  </tbody></table></div>`;
  if ($('#jauns')) $('#jauns').onclick = () => { rekinaForma = { pozicijas: [{ nosaukums: '', daudzums: 1, cena: '' }] }; radit(); };
  $$('[data-pdf]').forEach((b) => b.onclick = () => atvertPdf(dati.rekini.find((r) => r.id === b.dataset.pdf)));
  $$('[data-xml]').forEach((b) => b.onclick = () => lejupieladetXml(dati.rekini.find((r) => r.id === b.dataset.xml)));
  if (rekinaForma) piesaistitRedaktoru(v);
}
function rekinaRedaktors() {
  const f = rekinaForma, d = f.datums || sodien();
  return `<form class="panel" id="rf"><h3 style="margin-top:0">Jauns rēķins ${h('#' + dati.profils.nakamaisNr)}</h3>
  <div class="grid">${pasutitajaIzvele('pas', f.pasutitajsId)}
    <label>Datums<input type="date" name="datums" value="${d}" required></label>
    <label>Apmaksas termiņš<input type="date" name="termins" value="${f.termins || pieskaititDienas(d, 14)}" required></label>
    <label>Valoda<select name="valoda"><option value="lv">Latviešu</option><option value="en">Angļu</option></select></label>
    <label>Līguma nr. (ja ir)<input name="ligumaNr"></label>
    <label>Periods no (ja vajag)<input type="date" name="no"></label><label>Periods līdz<input type="date" name="lidz"></label>
    ${veidaIzvele('veids')}
  </div>
  <h3>Pozīcijas</h3><div id="poz">${f.pozicijas.map((p, i) => `<div class="poz">
    <label>Nosaukums<input name="pn${i}" value="${h(p.nosaukums)}" required></label><label>Daudzums<input name="pd${i}" inputmode="decimal" value="${p.daudzums}"></label>
    <label>Cena, €<input name="pc${i}" inputmode="decimal" value="${p.cena}"></label><button type="button" class="link" data-dzest-poz="${i}" ${f.pozicijas.length < 2 ? 'disabled' : ''}>Dzēst</button></div>`).join('')}</div>
  <div class="row"><button type="button" id="pozPlus">+ Pozīcija</button><button type="button" id="frazes">Ievietot autordarba frāzi</button></div>
  <p class="note">Rēķinā: „Rēķins sagatavots elektroniski un ir derīgs bez paraksta”, summa vārdiem un tavs logo tiek pievienoti automātiski.</p>
  <div class="row"><button class="primary" type="submit">Saglabāt rēķinu</button><button type="button" id="atcelt">Atcelt</button></div></form>`;
}
function nolasitPozicijas(form) {
  return rekinaForma.pozicijas.map((_, i) => ({ nosaukums: form[`pn${i}`].value.trim(), daudzums: sk(form[`pd${i}`].value) || 1, cena: sk(form[`pc${i}`].value) }));
}
function piesaistitRedaktoru(v) {
  const form = $('#rf'); piesaistitPasutitajaIzveli(form);
  $('#atcelt').onclick = () => { rekinaForma = null; radit(); };
  $('#pozPlus').onclick = () => { rekinaForma.pozicijas = [...nolasitPozicijas(form), { nosaukums: '', daudzums: 1, cena: '' }]; radit(); };
  $('#frazes').onclick = () => { const el = form.pn0; el.value = `Atlīdzība par autordarba „${el.value || '…'}” radīšanu un izmantošanas tiesību nodošanu`; el.focus(); };
  $$('[data-dzest-poz]').forEach((b) => b.onclick = () => { const p = nolasitPozicijas(form); p.splice(Number(b.dataset.dzestPoz), 1); rekinaForma.pozicijas = p; radit(); });
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!dati.profils.vards || !dati.profils.iban) { toast('Vispirms aizpildi savus rekvizītus iestatījumos'); return; }
    const pasId = nolasitPasutitaju(form); if (!pasId) return;
    const poz = nolasitPozicijas(form);
    if (poz.some((p) => !p.nosaukums || p.cena <= 0)) { toast('Katrai pozīcijai vajag nosaukumu un cenu'); return; }
    const r = { id: uid(), nr: dati.profils.nakamaisNr, datums: form.datums.value, termins: form.termins.value, pasutitajsId: pasId, valoda: form.valoda.value,
      ligumaNr: form.ligumaNr.value.trim(), periods: form.no.value && form.lidz.value ? { no: form.no.value, lidz: form.lidz.value } : null, veids: form.veids.value, pozicijas: poz };
    dati.rekini.push(r); dati.profils.nakamaisNr += 1; rekinaForma = null;
    const p = pasutitajs(pasId);
    saglabatUnRadit(p.budzetaIestade ? `Rēķins saglabāts. Budžeta iestādei sūti e-rēķinu (XML) caur e-adresi.` : 'Rēķins saglabāts');
    if (p.veidne === 'hanzas') toast('Hanzas Perons Excel blanka būs 3. posmā. Pagaidām lieto PDF.');
  };
}
function atvertPdf(r) {
  const w = window.open('', '_blank');
  if (!w) { toast('Pārlūks bloķēja jaunu logu'); return; }
  w.document.write(rekinsHtml(r, dati.profils, pasutitajs(r.pasutitajsId))); w.document.close();
  setTimeout(() => w.print(), 400);
}
function lejupieladetXml(r) {
  const p = pasutitajs(r.pasutitajsId), pr = dati.profils;
  const xml = eRekinsXml({ numurs: String(r.nr).padStart(3, '0'), datums: r.datums, termins: r.termins, ligumaNr: r.ligumaNr, periods: r.periods,
    pardevejs: { nosaukums: pr.vards, regNr: pr.personasKods, adrese: pr.adrese, epasts: pr.epasts },
    pircejs: { nosaukums: p.nosaukums, regNr: p.regNr, adrese: p.adrese, epasts: p.epasts }, pozicijas: r.pozicijas, iban: pr.iban, bic: pr.bic });
  lejupieladet(`e-rekins-${String(r.nr).padStart(3, '0')}.xml`, xml, 'application/xml');
  if (p.budzetaIestade) toast('Augšupielādē šo XML latvija.lv e-adreses e-rēķinu formā: tad dati VID nonāk automātiski.');
}

// ---------- Autorlīgumi ----------
function skatsLigumi(v) {
  v.innerHTML = `<h2>Autorlīgumi</h2><p class="lead">Ieraksti autorlīgumu, kad to paraksti. Kad maksājums ienāks bankā, rīks to atpazīs pēc līguma numura vai pasūtītāja un summas.</p>
  <form class="panel" id="lf"><div class="grid">${pasutitajaIzvele('pas')}
    <label>Līguma nr.<input name="nr" required></label><label>Datums<input type="date" name="datums" value="${sodien()}"></label>
    <label>Summa, €<input name="summa" inputmode="decimal" required></label>${veidaIzvele('veids')}
    <label class="check"><input type="checkbox" name="ietur"> Izmaksātājs ietur visus nodokļus</label></div>
    <p class="row"><button class="primary" type="submit">Saglabāt līgumu</button></p></form>
  <div class="tbl" style="margin-top:16px"><table><thead><tr><th>Līgums</th><th>Pasūtītājs</th><th>Datums</th><th class="n">Summa</th><th>Veids</th></tr></thead><tbody>
  ${dati.autorligumi.map((a) => `<tr><td>${h(a.nr)}</td><td class="wrap">${h(pasutitajs(a.pasutitajsId).nosaukums)}</td><td>${datumsLv(a.datums)}</td><td class="n">${naudaLv(a.summa)}</td>
    <td>${h(DARBA_VEIDI[a.veids]?.nosaukums)}${a.izmaksatajsIetur ? ' <span class="tag">nodokļus ietur izmaksātājs</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="note">Līgumu vēl nav.</td></tr>'}
  </tbody></table></div>`;
  const f = $('#lf'); piesaistitPasutitajaIzveli(f);
  f.onsubmit = (e) => {
    e.preventDefault(); const pasId = nolasitPasutitaju(f); if (!pasId) return;
    dati.autorligumi.push({ id: uid(), nr: f.nr.value.trim(), pasutitajsId: pasId, datums: f.datums.value, summa: sk(f.summa.value), veids: f.veids.value, izmaksatajsIetur: f.ietur.checked });
    saglabatUnRadit('Līgums saglabāts');
  };
}

// ---------- Banka ----------
function skatsBanka(v) {
  const s = bankasSesija;
  const neapm = bezMaksajuma(registrs(), dati.darijumi).map((x) => dati.rekini.find((r) => r.nr === x.nr && Math.abs(rekinaKopsumma(r) - x.summa) < 0.005)).filter(Boolean);
  let saturs = `<h2>Banka</h2><p class="lead">Ielādē Swedbank izrakstu CSV formātā. Rīks katru ienākošo maksājumu piesaista rēķinam, līgumam vai kategorijai. Ja nav pārliecināts, tas jautā tev.</p>
  <div class="panel row"><label style="flex:1">Izraksts (CSV)<input type="file" id="csv" accept=".csv,text/csv"></label></div>`;
  if (s) {
    const jaizv = s.rindas.filter((r) => r.virziens === 'K' && r.kategorija === 'jaizverte').length;
    const kopa = r2(s.rindas.filter((r) => r.virziens === 'K').reduce((a, r) => a + r.summa, 0));
    saturs += `<h3>${h(s.izraksts.konts)} · jauni darījumi: ${s.rindas.length}${s.jau ? ` · jau ielādēti iepriekš: ${s.jau}` : ''}</h3>
    ${s.jau ? '' : `<p class="note">Ienākošo maksājumu kopsumma ${naudaLv(kopa)} € ${Math.abs(kopa - s.izraksts.apgrozijums.K) < 0.005 ? 'sakrīt ar bankas kredīta apgrozījumu ✓' : `NESAKRĪT ar bankas kredīta apgrozījumu ${naudaLv(s.izraksts.apgrozijums.K)} €`}</p>`}
    <div class="tbl"><table><thead><tr><th>Datums</th><th>Maksātājs</th><th>Informācija</th><th class="n">Summa</th><th>Kategorija</th></tr></thead><tbody>
    ${s.rindas.map((r, i) => `<tr><td>${datumsLv(r.datums)}</td><td class="wrap">${h(r.partneris)}</td><td class="wrap">${h(r.info)}<br><span class="note">${h(r.pamatojums)}</span></td>
      <td class="n">${r.virziens === 'D' ? '−' : ''}${naudaLv(r.summa)}</td><td>${r.virziens === 'D' ? '<span class="tag">maksājums VID</span>' : `
      <select data-kat="${i}" ${r.kategorija === 'jaizverte' ? 'style="border-color:var(--warn)"' : ''}>${Object.entries(KATEGORIJAS).map(([k, t]) => `<option value="${k}" ${k === r.kategorija ? 'selected' : ''}>${t}</option>`).join('')}</select>
      ${r.kategorija === 'sd' && !r.saite ? `<select data-veids="${i}">${Object.entries(DARBA_VEIDI).map(([k, x]) => `<option value="${k}" ${k === r.veids ? 'selected' : ''}>${h(x.nosaukums)}</option>`).join('')}</select>` : ''}
      ${r.manuali ? `<label class="check"><input type="checkbox" data-atc="${i}" ${r.atcereties ? 'checked' : ''}> atcerēties šim maksātājam</label>` : ''}`}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="row" style="margin-top:12px"><button class="primary" id="apstiprinat" ${jaizv ? 'disabled' : ''}>Apstiprināt ${s.rindas.length} darījumus</button><button id="atmest">Atmest</button>
    ${jaizv ? `<span class="note">Vēl jāizvērtē: ${jaizv}</span>` : ''}</p>`;
  }
  saturs += `<h3>Rēķini bez atrasta maksājuma</h3>${neapm.length ? `<div class="tbl"><table><thead><tr><th>Nr.</th><th>Pasūtītājs</th><th class="n">Summa</th><th>Samaksāts citā kontā</th></tr></thead><tbody>
    ${neapm.map((r) => `<tr><td>${h(rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne))}</td><td class="wrap">${h(pasutitajs(r.pasutitajsId).nosaukums)}</td><td class="n">${naudaLv(rekinaKopsumma(r))}</td>
    <td><div class="row"><input type="date" data-citur-d="${r.id}" style="width:auto"><button class="link" data-citur="${r.id}">Atzīmēt</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="note">Visiem rēķiniem maksājums ir atrasts.</p>'}`;
  v.innerHTML = saturs;
  $('#csv').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const izraksts = nolasitSwedbankCsv(await f.text()), zinami = new Set(dati.darijumi.map((d) => d.arhivaKods));
      const vis = klasificet(izraksts.darijumi, registrs()), jauni = vis.filter((d) => !zinami.has(d.arhivaKods));
      const rindas = jauni.filter((d) => d.virziens === 'K' || d.kategorija === 'vid-maksajums')
        .map((d) => ({ ...d, manuali: d.kategorija === 'jaizverte', veids: d.kategorija === 'sd' ? veidsPecSaites(d.saite) : '90.13' }));
      bankasSesija = { izraksts, rindas, jau: vis.length - jauni.length }; radit();
    } catch (err) { toast(err.message); }
  };
  $$('[data-kat]').forEach((el) => el.onchange = () => { const r = s.rindas[el.dataset.kat]; r.kategorija = el.value; r.manuali = true; if (r.kategorija !== 'sd') r.saite = r.saite && r.kategorija === 'sd' ? r.saite : undefined; radit(); });
  $$('[data-veids]').forEach((el) => el.onchange = () => { s.rindas[el.dataset.veids].veids = el.value; });
  $$('[data-atc]').forEach((el) => el.onchange = () => { s.rindas[el.dataset.atc].atcereties = el.checked; });
  if ($('#atmest')) $('#atmest').onclick = () => { bankasSesija = null; radit(); };
  if ($('#apstiprinat')) $('#apstiprinat').onclick = () => {
    for (const r of s.rindas) {
      dati.darijumi.push({ arhivaKods: r.arhivaKods, datums: r.datums, partneris: r.partneris, info: r.info, summa: r.summa, virziens: r.virziens, kategorija: r.kategorija, saite: r.saite, veids: r.kategorija === 'sd' ? r.veids : undefined });
      if (r.atcereties && r.kategorija !== 'jaizverte') dati.maksataji[normalizetNosaukumu(r.partneris)] = r.kategorija;
    }
    bankasSesija = null; saglabatUnRadit('Darījumi apstiprināti');
  };
  $$('[data-citur]').forEach((b) => b.onclick = () => {
    const d = $(`[data-citur-d="${b.dataset.citur}"]`).value; if (!d) { toast('Norādi samaksas datumu'); return; }
    dati.rekini.find((r) => r.id === b.dataset.citur).samaksatsCitur = { datums: d }; saglabatUnRadit('Atzīmēts kā samaksāts citā kontā');
  });
}

// ---------- Ceturkšņa ziņojums (EDS izskatā) ----------
let izvGads = null, izvCet = null;
function gaduSaraksts() {
  const g = new Set([...Object.keys(noteikumi).map(Number), ...sdIeraksti().map((e) => Number(e.datums.slice(0, 4))), Number(sodien().slice(0, 4))]);
  return [...g].sort((a, b) => b - a);
}
function skatsCeturksnis(v) {
  const t = new Date(); const pedejais = Math.floor(t.getMonth() / 3) || 4;
  izvGads ??= pedejais === 4 && t.getMonth() < 3 ? t.getFullYear() - 1 : t.getFullYear(); izvCet ??= pedejais;
  const { n, provizoriski } = gadaNoteikumi(izvGads), m = menesuIenakumi(sdIeraksti(), izvGads), q = ceturksnaZinojums(m, izvCet, n), tr = termini(izvGads, izvCet);
  const rinda = (nos, k) => `<tr><td>${nos}</td>${q.rindas.map((x) => `<td class="n c" data-k="${eds(x[k])}">${eds(x[k])}</td>`).join('')}<td class="n c" data-k="${eds(q.kopa[k])}">${eds(q.kopa[k])}</td></tr>`;
  v.innerHTML = `<h2>Pašnodarbinātā ziņojums</h2>
  <div class="row" style="margin-bottom:14px"><label>Gads<select id="g">${gaduSaraksts().map((g) => `<option ${g === izvGads ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
  <label>Ceturksnis<select id="c">${[1, 2, 3, 4].map((c) => `<option value="${c}" ${c === izvCet ? 'selected' : ''}>${c}. ceturksnis</option>`).join('')}</select></label></div>
  ${provizoriski ? `<p class="banner">${izvGads}. gada noteikumi vēl nav pārbaudīti, aprēķins ir provizorisks.</p>` : ''}
  <p class="note">Taksācijas periods: <b>${izvGads}. gada ${izvCet}. ceturksnis</b> · Apdrošinātās personas statuss: PN – Pašnodarbinātais. Uzklikšķini uz skaitļa, lai to nokopētu.</p>
  <div class="tbl eds"><table><thead><tr><th rowspan="2">Rādītāji</th><th colspan="3" style="text-align:center">Ceturkšņa mēnesis</th><th rowspan="2" class="n">Kopā</th></tr><tr><th class="n">1</th><th class="n">2</th><th class="n">3</th></tr></thead><tbody>
    ${rinda('Valsts sociālās apdrošināšanas obligāto iemaksu objekts', 'objekts')}
    ${rinda('Aprēķinātās valsts sociālās apdrošināšanas obligātās iemaksas', 'vsaoi')}
    ${rinda('Valsts sociālās apdrošināšanas obligāto iemaksu objekts pensiju apdrošināšanai, kuram piemēro obligāto iemaksu likmi 10%', 'pensObjekts')}
    ${rinda('Aprēķinātās valsts sociālās apdrošināšanas obligātās iemaksas pensiju apdrošināšanai 10%', 'pens')}
    <tr><td><b>Aprēķinātās valsts sociālās apdrošināšanas obligātās iemaksas kopā</b></td><td colspan="3"></td><td class="n c" data-k="${eds(q.jaMaksa)}"><b>${eds(q.jaMaksa)}</b></td></tr>
  </tbody></table></div>
  <p>Iesniegt EDS līdz <b>${datumsLv(tr.iesniegt)}</b>, samaksāt <span class="hl">${naudaLv(q.jaMaksa)} €</span> līdz <b>${datumsLv(tr.samaksat)}</b> Labot ziņojumu var līdz ${datumsLv(tr.labotLidz)}</p>
  <h3>No kā tas sastāv</h3><div class="tbl"><table><thead><tr><th>Mēnesis</th><th class="n">Ieņēmumi</th><th class="n">Nosacītie izdevumi</th><th class="n">Ienākums</th></tr></thead><tbody>
  ${m.slice((izvCet - 1) * 3, izvCet * 3).map((x) => `<tr><td>${MENESI[x.menesis - 1]}</td><td class="n">${naudaLv(x.ienemumi)}</td><td class="n">${naudaLv(x.nosacitie)}</td><td class="n">${naudaLv(x.ienakums)}</td></tr>`).join('')}</tbody></table></div>
  <p class="note">Minimālā alga ${izvGads}. gadā: ${naudaLv(n.minimalaAlga)} €. Ja mēneša ienākums to sasniedz, maksā ${eds(n.vsaoiLikme)} % no minimālās algas un 10 % no pārējā; ja nesasniedz, tikai 10 %.</p>`;
  $('#g').onchange = (e) => { izvGads = Number(e.target.value); radit(); };
  $('#c').onchange = (e) => { izvCet = Number(e.target.value); radit(); };
  $$('[data-k]').forEach((td) => td.onclick = () => kopet(td.dataset.k));
}

// ---------- Gada deklarācija ----------
let deklGads = null;
function skatsDeklaracija(v) {
  deklGads ??= new Date().getMonth() < 6 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  const { n, provizoriski } = gadaNoteikumi(deklGads), a = gadaAprekins(deklGads), g = dati.gadi[deklGads] || {}, D = n.dRindas, R = n.d3Rindas;
  const ievade = (k, nos) => `<label>${nos}<input data-g="${k}" inputmode="decimal" value="${h(g[k] ?? '')}"></label>`;
  const rinda = (nr, nos, x, b) => `<tr><td>${h(nos)}</td><td class="n">${nr}</td><td class="n c" data-k="${eds(x)}">${b ? '<b>' : ''}${eds(x)}${b ? '</b>' : ''}</td></tr>`;
  v.innerHTML = `<h2>Gada ienākumu deklarācija</h2>
  <div class="row" style="margin-bottom:14px"><label>Gads<select id="g">${gaduSaraksts().map((x) => `<option ${x === deklGads ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
  ${provizoriski ? `<p class="banner">${deklGads}. gada noteikumi vēl nav pārbaudīti, aprēķins ir provizorisks.</p>` : ''}
  <h3>D3 · Ienākumi no saimnieciskās darbības</h3><p class="note">Šos trīs skaitļus ievadi EDS. Uzklikšķini, lai nokopētu.</p>
  <div class="tbl eds"><table><thead><tr><th></th><th class="n">Rinda</th><th class="n">Nodokļa maksātāja deklarētie dati</th></tr></thead><tbody>
    ${rinda(R.ienemumi, 'Ieņēmumi no citiem saimnieciskās darbības veidiem', a.d3.ienemumi)}
    ${rinda(R.izdevumi, 'Izdevumi, kas saistīti ar citiem saimnieciskās darbības veidiem', a.d3.izdevumi)}
    ${rinda(R.apliekamie, 'Apliekamie ienākumi no saimnieciskās darbības', a.d3.apliekamie, true)}
  </tbody></table></div>
  <h3>Dati, ko EDS pievieno pats</h3><p class="note">Ievadi tos no EDS, lai aplēse sakristu ar deklarāciju. Ja neaizpildīsi, aplēse būs nedaudz lielāka par īsto IIN.</p>
  <div class="panel grid">${ievade('d1Apliekamie', 'D1 apliekamie (AKKA u. c.)')}${ievade('d1Ieturetais', 'D1 ieturētais nodoklis')}${ievade('citiNodokli', 'D1¹ starpība (19. rinda)')}
    ${ievade('dzivibasIemaksas', 'Dzīvības apdrošināšanas iemaksas')}${ievade('attaisnotie', 'Attaisnotie izdevumi (D4)')}${ievade('vsaoiDeklareta', 'VSAOI, ja atšķiras no aprēķinātās')}</div>
  <h3>D · Gada ienākumu deklarācija (aplēse)</h3>
  <div class="tbl eds"><table><thead><tr><th></th><th class="n">Rinda</th><th class="n">Summa</th></tr></thead><tbody>
    ${rinda(D.apliekamie, 'Latvijas Republikā gūtie apliekamie ienākumi', a.d.r1)}${rinda(D.vsaoi, 'Valsts sociālās apdrošināšanas obligātās iemaksas', a.d.r6)}
    ${rinda(D.attaisnotie, 'Par izglītību, ārstnieciskajiem pakalpojumiem, ziedojumiem', a.d.r8)}${rinda(D.dzivibasApdr, 'Pensiju fondi, dzīvības apdrošināšana', a.d.r9)}
    ${rinda(D.attaisnotieKopa, 'Attaisnotie izdevumi kopā', a.d.r10)}${rinda(D.neapliekamais, 'Gada neapliekamais minimums', a.d.r11)}
    ${rinda(D.nodoklis, 'Nodoklis kopā', a.d.r18, true)}${rinda(D.citiNodokli, 'Nodoklis no citiem ienākumiem', a.d.r19)}${rinda(D.ieturetais, 'Avansā samaksātais (ieturētais) nodoklis', a.d.r23)}
    ${a.d.r24 ? rinda(D.maksajams, 'Maksājamais nodoklis', a.d.r24, true) : rinda(D.parmaksa, 'Pārmaksātais nodoklis', a.d.r25, true)}
  </tbody></table></div>
  <p class="note">VSAOI no ceturkšņa ziņojumiem šim gadam: ${naudaLv(a.vsaoi)} €. Deklarāciju iesniedz no ${datumsLv(`${deklGads + 1}-03-01`)} līdz ${datumsLv(`${deklGads + 1}-06-01`)}, IIN samaksā līdz ${datumsLv(`${deklGads + 1}-06-23`)}${a.d.r24 > n.iinVienaMaksajumaRobeza ? ' (var trīs daļās)' : ''}</p>`;
  $('#g').onchange = (e) => { deklGads = Number(e.target.value); radit(); };
  $$('[data-g]').forEach((el) => el.onchange = () => { dati.gadi[deklGads] = { ...(dati.gadi[deklGads] || {}), [el.dataset.g]: el.value.trim() }; saglabatUnRadit(); });
  $$('[data-k]').forEach((td) => td.onclick = () => kopet(td.dataset.k));
}

// ---------- Iestatījumi ----------
function skatsIestatijumi(v) {
  const p = dati.profils, a = p.adrese;
  v.innerHTML = `<h2>Iestatījumi</h2>
  <form class="panel" id="pf"><h3 style="margin-top:0">Mani rekvizīti</h3><div class="grid">
    <label>Vārds, uzvārds<input name="vards" value="${h(p.vards)}" required></label><label>Personas kods<input name="personasKods" value="${h(p.personasKods)}" required></label>
    <label>Iela, māja, dzīvoklis<input name="iela" value="${h(a.iela)}"></label><label>Pilsēta<input name="pilseta" value="${h(a.pilseta)}"></label><label>Pasta indekss<input name="indekss" value="${h(a.indekss)}"></label>
    <label>IBAN<input name="iban" value="${h(p.iban)}" required></label><label>SWIFT/BIC<input name="bic" value="${h(p.bic)}"></label><label>E-pasts<input name="epasts" value="${h(p.epasts)}"></label>
    <label>Izrakstīšanas vieta<input name="vieta" value="${h(p.vieta)}"></label><label>Nākamais rēķina nr.<input name="nakamaisNr" inputmode="numeric" value="${p.nakamaisNr}"></label>
    <label>Logo (100×100 px)<input type="file" id="logo" accept="image/*"></label>${p.logo ? `<img src="${p.logo}" alt="Logo" width="64" height="64" style="object-fit:contain">` : ''}
  </div><p class="row"><button class="primary" type="submit">Saglabāt</button></p></form>
  <h3>Pasūtītāji</h3><div class="tbl"><table><thead><tr><th>Nosaukums</th><th>Reģ. nr.</th><th>Veidne</th><th>Budžeta iestāde</th><th></th></tr></thead><tbody>
  ${dati.pasutitaji.map((x) => `<tr><td class="wrap">${h(x.nosaukums)}</td><td>${h(x.regNr)}</td>
    <td><select data-veidne="${x.id}"><option value="standarta">Mana veidne</option><option value="hanzas" ${x.veidne === 'hanzas' ? 'selected' : ''}>Hanzas Perons</option></select></td>
    <td><input type="checkbox" data-budz="${x.id}" ${x.budzetaIestade ? 'checked' : ''} style="width:auto;min-height:0"></td>
    <td>${dati.rekini.some((r) => r.pasutitajsId === x.id) || dati.autorligumi.some((l) => l.pasutitajsId === x.id) ? '' : `<button class="link" data-dz="${x.id}">Dzēst</button>`}</td></tr>`).join('') || '<tr><td colspan="5" class="note">Pasūtītājus pievieno, izrakstot rēķinu.</td></tr>'}
  </tbody></table></div>
  <h3>Dati</h3><div class="panel"><p class="note" style="margin-top:0">Rezerves kopija satur visus tavus datus. Glabā to drošā vietā.</p>
    <div class="row"><button id="eksp">Lejupielādēt rezerves kopiju</button><label class="check" style="cursor:pointer"><span>Atjaunot no faila</span><input type="file" id="imp" accept=".json" hidden></label>
    <button id="dzestVisu" class="link">Dzēst visus datus šajā pārlūkā</button></div></div>`;
  const f = $('#pf');
  f.onsubmit = (e) => {
    e.preventDefault();
    Object.assign(p, { vards: f.vards.value.trim(), personasKods: f.personasKods.value.trim(), iban: f.iban.value.replace(/\s/g, ''), bic: f.bic.value.trim(), epasts: f.epasts.value.trim(),
      vieta: f.vieta.value.trim() || 'Rīgā', nakamaisNr: Math.max(1, Math.floor(sk(f.nakamaisNr.value)) || 1), adrese: { ...a, iela: f.iela.value.trim(), pilseta: f.pilseta.value.trim(), indekss: f.indekss.value.trim() } });
    saglabatUnRadit('Rekvizīti saglabāti');
  };
  $('#logo').onchange = (e) => { const fl = e.target.files[0]; if (!fl) return; if (fl.size > 300000) { toast('Logo fails ir par lielu (līdz 300 KB)'); return; }
    const rd = new FileReader(); rd.onload = () => { p.logo = rd.result; saglabatUnRadit('Logo saglabāts'); }; rd.readAsDataURL(fl); };
  $$('[data-veidne]').forEach((el) => el.onchange = () => { dati.pasutitaji.find((x) => x.id === el.dataset.veidne).veidne = el.value; saglabatUnRadit(); });
  $$('[data-budz]').forEach((el) => el.onchange = () => { dati.pasutitaji.find((x) => x.id === el.dataset.budz).budzetaIestade = el.checked; saglabatUnRadit(); });
  $$('[data-dz]').forEach((b) => b.onclick = () => { dati.pasutitaji = dati.pasutitaji.filter((x) => x.id !== b.dataset.dz); saglabatUnRadit('Pasūtītājs dzēsts'); });
  $('#eksp').onclick = () => lejupieladet(`gramatvediba-${sodien()}.json`, eksportet(dati), 'application/json');
  $('#imp').onchange = async (e) => { try { const d = importet(await e.target.files[0].text()); if (confirm('Aizstāt pašreizējos datus ar rezerves kopiju?')) { dati = d; saglabatUnRadit('Dati atjaunoti'); } } catch (err) { toast(err.message); } };
  $('#dzestVisu').onclick = () => { if (confirm('Dzēst visus datus šajā pārlūkā? Rezerves kopija netiks dzēsta.')) { dati = TUKSI_DATI(); saglabatUnRadit('Dati dzēsti'); } };
}

// ---------- Maršruti un sākums ----------
const SKATI = { parskats: skatsParskats, rekini: skatsRekini, ligumi: skatsLigumi, banka: skatsBanka, ceturksnis: skatsCeturksnis, deklaracija: skatsDeklaracija, iestatijumi: skatsIestatijumi };
function radit() {
  const r = SKATI[location.hash.slice(1)] ? location.hash.slice(1) : 'parskats';
  $$('#nav a').forEach((a) => a.getAttribute('href') === '#' + r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  SKATI[r]($('#view'));
}
window.addEventListener('hashchange', radit);
(async function sakt() {
  try {
    const { gadi } = await (await fetch('rules/index.json')).json();
    for (const g of gadi) noteikumi[g] = await (await fetch(`rules/${g}.json`)).json();
  } catch { $('#view').innerHTML = '<p class="banner">Neizdevās ielādēt noteikumu failus. Rīks jāatver caur tīmekļa adresi, nevis kā fails no datora.</p>'; return; }
  radit();
})();
