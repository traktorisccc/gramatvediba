// Grāmatvedības rīka saskarne (1. posms: dati pārlūkā).
import { r2, menesuIenakumi, ceturksnaZinojums, d3, gadaDeklaracija } from './calc.js';
import { DARBA_VEIDI } from './darbaVeidi.js';
import { nolasitSwedbankCsv, klasificet, normalizetNosaukumu } from './banka.js';
import { eRekinsXml } from './eRekins.js';
import { rekinsHtml, rekinaKopsumma, rekinaNumursTeksts, rekinaNumursId, naudaLv, datumsLv } from './rekinsHtml.js';
import { sadalitRekvizitus } from './rekviziti.js';
import { gadaParskats, VID_MAKSAJUMS } from './parskats.js';
import { ieladet, saglabat, eksportet, importet, TUKSI_DATI } from './glabatuve.js';

// ---------- Pamata palīgi ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sk = (v) => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const eds = (x) => r2(x).toFixed(2).replace('.', ',');           // EDS formāts: 1480,00
const isoLokali = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sodien = () => isoLokali(new Date());                       // vietējais datums, nevis UTC
const pieskaititDienas = (iso, n) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + n); return isoLokali(t); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const gadsNo = (iso) => Number(iso.slice(0, 4));
const MENESI = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'];
const KATEGORIJAS = {
  sd: 'Saimnieciskā darbība', 'nodokli-samaksaja-izmaksatajs': 'Nodokļus samaksāja izmaksātājs', akka: 'AKKA/LAA (D1)', 'vid-atmaksa': 'VID atmaksa',
  'kartes-atgriesana': 'Kartes darījuma atgriešana', procenti: 'Procenti', personigs: 'Personīgs pārskaitījums', 'savs-konts': 'No sava konta', jaizverte: '— jāizvērtē —'
};
const AR_SAITI = new Set(['sd', 'nodokli-samaksaja-izmaksatajs']);   // kategorijas, kurām var būt rēķins vai līgums
// Ar darbību nesaistīti ienākošie maksājumi: pārskatā grāmatvedim tikai kopsumma, bez detaļām.
const NESAISTITAS = new Set(['personigs', 'savs-konts', 'kartes-atgriesana', 'procenti']);

let dati = ieladet();
const noteikumi = {};
// Neapstiprinātais izraksts glabājas pārlūkā, lai nepazustu pēc lapas pārlādēšanas.
const SESIJAS_ATSLEGA = 'gramatvediba:banka-sesija';
function ieladetSesiju() {
  try {
    const s = JSON.parse(localStorage.getItem(SESIJAS_ATSLEGA) || 'null');
    if (!s?.rindas) return null;
    const zinami = new Set(dati.darijumi.map((d) => d.arhivaKods));      // jau apstiprinātie vairs nav jārāda
    s.rindas = s.rindas.filter((r) => !zinami.has(r.arhivaKods));
    return s.rindas.length ? { ...s, atjaunots: true } : null;
  } catch { return null; }
}
function saglabatSesiju() {
  try { bankasSesija ? localStorage.setItem(SESIJAS_ATSLEGA, JSON.stringify(bankasSesija)) : localStorage.removeItem(SESIJAS_ATSLEGA); } catch { /* nav vietas: sesija paliek tikai atmiņā */ }
}
let bankasSesija = ieladetSesiju();
let kess = {};                                                     // aprēķinu kešs vienam zīmējumam

function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); }
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
  const tuvakais = Object.keys(noteikumi).map(Number).sort((a, b) => Math.abs(a - gads) - Math.abs(b - gads))[0];
  return { n: noteikumi[tuvakais], provizoriski: true, no: tuvakais };
}
const provBaneris = (gads) => { const x = gadaNoteikumi(gads); return x.provizoriski ? `<p class="banner">${gads}. gadam nav noteikumu faila. Aprēķins veikts pēc ${x.no}. gada noteikumiem un var būt nepareizs.</p>` : ''; };

// Saite no darījuma uz rēķinu vai līgumu. Vecākos datos saitei ir tikai numurs.
const rekinsPecSaites = (s) => s?.tips === 'rekins' ? (dati.rekini.find((r) => r.id === s.kods) || (s.kods ? null : dati.rekini.find((r) => r.nr === s.nr))) : null;
const ligumsPecSaites = (s) => s?.tips === 'autorligums' ? (dati.autorligumi.find((a) => a.id === s.kods) || (s.kods ? null : dati.autorligumi.find((a) => a.nr === s.nr))) : null;
const samaksatsRekinam = (r) => r2(dati.darijumi.filter((d) => AR_SAITI.has(d.kategorija) && rekinsPecSaites(d.saite) === r).reduce((a, d) => a + d.summa, 0));
const samaksatsLigumam = (l) => r2(dati.darijumi.filter((d) => AR_SAITI.has(d.kategorija) && ligumsPecSaites(d.saite) === l).reduce((a, d) => a + d.summa, 0));
function rekinaStatuss(r) {
  const kopa = rekinaKopsumma(r), samaksats = samaksatsRekinam(r);
  return { kopa, samaksats, atlikums: r2(kopa - samaksats), pilniba: samaksats >= kopa - 0.005 || (!!r.samaksatsCitur && samaksats === 0), daleji: samaksats > 0 && samaksats < kopa - 0.005 };
}
function registrs() {
  return {
    savsVards: dati.profils.vards, noteikumi: dati.maksataji,
    rekini: dati.rekini.map((r) => ({ id: r.id, nr: r.nr, summa: rekinaKopsumma(r), pasutitajs: pasutitajs(r.pasutitajsId).nosaukums, samaksats: samaksatsRekinam(r) })),
    autorligumi: dati.autorligumi.map((a) => ({ id: a.id, nr: a.nr, summa: a.summa, pasutitajs: pasutitajs(a.pasutitajsId).nosaukums, izmaksatajsIetur: a.izmaksatajsIetur, samaksats: samaksatsLigumam(a) }))
  };
}
const veidsDarijumam = (d) => rekinsPecSaites(d.saite)?.veids || ligumsPecSaites(d.saite)?.veids || d.veids || '90.13';
/** Visi saimnieciskās darbības ieņēmumi. Rēķins, kas atzīmēts kā samaksāts citā kontā, skaitās tikai tad, ja tam nav bankas maksājuma. */
function sdIeraksti() {
  if (kess.sd) return kess.sd;
  const noBankas = dati.darijumi.filter((d) => d.kategorija === 'sd').map((d) => ({ datums: d.datums, summa: d.summa, veids: veidsDarijumam(d), kategorija: 'sd', partneris: d.partneris, info: d.info }));
  const citur = dati.rekini.filter((r) => r.samaksatsCitur && samaksatsRekinam(r) === 0).map((r) => ({ datums: r.samaksatsCitur.datums, summa: rekinaKopsumma(r), veids: r.veids, kategorija: 'sd',
    partneris: pasutitajs(r.pasutitajsId).nosaukums, info: `Rēķins ${rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne)}, samaksāts citā kontā` }));
  return (kess.sd = [...noBankas, ...citur]);
}
function termini(gads, c) {
  const [g, m] = [[gads, 4], [gads, 7], [gads, 10], [gads + 1, 1]][c - 1], mm = String(m).padStart(2, '0');
  return { iesniegt: `${g}-${mm}-17`, samaksat: `${g}-${mm}-23`, labotLidz: `${g}-${String(m + 1).padStart(2, '0')}-23` };
}
function gadaAprekins(gads) {
  if (kess['g' + gads]) return kess['g' + gads];
  const { n } = gadaNoteikumi(gads), ier = sdIeraksti(), m = menesuIenakumi(ier, gads);
  const q = [1, 2, 3, 4].map((c) => ceturksnaZinojums(m, c, n));
  const vsaoiAprekinata = r2(q.reduce((a, x) => a + x.jaMaksa, 0));
  const g = dati.gadi[gads] || {}, x = d3(ier, gads);
  const vsaoi = g.vsaoiDeklareta !== undefined && g.vsaoiDeklareta !== '' ? sk(g.vsaoiDeklareta) : vsaoiAprekinata;
  const d = gadaDeklaracija({ d3Apliekamie: x.apliekamie, d1Apliekamie: sk(g.d1Apliekamie), d1Ieturetais: sk(g.d1Ieturetais), citiNodokli: sk(g.citiNodokli),
    vsaoi, dzivibasIemaksas: sk(g.dzivibasIemaksas), attaisnotie: sk(g.attaisnotie) }, n);
  return (kess['g' + gads] = { m, q, vsaoi, vsaoiAprekinata, d3: x, d, irDati: ier.some((e) => gadsNo(e.datums) === gads) });
}
/** Par kuru nodokļu gadu ir maksājums VID. Lietotāja izvēle ir noteicošā; citādi minējums pēc datuma un summas. */
function nodokluGads(d) {
  if (d.nodokluGads) return d.nodokluGads;
  const g = gadsNo(d.datums), m = Number(d.datums.slice(5, 7));
  if (m === 1) return g - 1;                                       // 4. ceturkšņa VSAOI maksā līdz 23. janvārim
  if (m >= 3 && m <= 8) {                                          // iepriekšējā gada IIN: viss vai pa trešdaļām
    const iin = gadaAprekins(g - 1).d.r24, tresdala = r2(iin / 3);
    if (iin > 0 && [iin, tresdala, r2(iin - 2 * tresdala)].some((x) => Math.abs(x - d.summa) <= 0.02)) return g - 1;
  }
  return g;
}
/** Cik par gadu vēl jāsamaksā: VSAOI + IIN pēc deklarācijas − maksājumi VID par šo gadu. */
function nodokluAtlikums(gads) {
  const a = gadaAprekins(gads);
  const samaksats = r2(dati.darijumi.filter((d) => d.kategorija === 'vid-maksajums' && nodokluGads(d) === gads).reduce((s, d) => s + d.summa, 0));
  return { a, samaksats, saistibas: r2(a.vsaoi + a.d.r24), atlikums: r2(Math.max(0, a.vsaoi + a.d.r24 - samaksats)) };
}

/** Excel pārskats grāmatvedim par gadu: žurnāls, ceturkšņi, deklarācija, banka, rēķini un noteikumi ar formulām. */
function lejupieladetParskatu(gads) {
  const { n, provizoriski } = gadaNoteikumi(gads), g = dati.gadi[gads] || {};
  const piesaiste = (d) => { const r = rekinsPecSaites(d.saite), l = ligumsPecSaites(d.saite);
    return r ? `Rēķins ${rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne)}` : l ? `Līgums ${l.nr}` : ''; };
  const gadaDarijumi = dati.darijumi.filter((d) => gadsNo(d.datums) === gads || (d.kategorija === 'vid-maksajums' && nodokluGads(d) === gads));
  const nesaistits = (d) => NESAISTITAS.has(d.kategorija) && d.virziens !== 'D';
  const nesaistiti = r2(gadaDarijumi.filter(nesaistits).reduce((a, d) => a + d.summa, 0));
  const darijumi = gadaDarijumi.filter((d) => !nesaistits(d)).map((d) => ({
    datums: d.datums, partneris: d.partneris, info: d.info, virziens: d.virziens, summa: d.summa,
    kategorija: d.kategorija === 'vid-maksajums' ? VID_MAKSAJUMS : (KATEGORIJAS[d.kategorija] || d.kategorija), aprekina: d.kategorija === 'sd',
    piesaiste: piesaiste(d), nodokluGads: d.kategorija === 'vid-maksajums' ? nodokluGads(d) : '', avots: d.arRoku ? 'ievadīts ar roku' : 'bankas izraksts' }));
  const rekini = dati.rekini.filter((r) => gadsNo(r.datums) === gads).sort((a, b) => a.nr - b.nr).map((r) => {
    const st = rekinaStatuss(r);
    return { numurs: rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne), datums: r.datums, pasutitajs: pasutitajs(r.pasutitajsId).nosaukums, veids: r.veids,
      summa: st.kopa, samaksats: r.samaksatsCitur && !st.samaksats ? st.kopa : st.samaksats,
      statuss: st.pilniba ? (r.samaksatsCitur && !st.samaksats ? `samaksāts citā kontā ${datumsLv(r.samaksatsCitur.datums)}` : 'apmaksāts') : st.daleji ? 'daļēji apmaksāts' : 'nav apmaksāts' };
  });
  const ligumi = dati.autorligumi.filter((a) => gadsNo(a.datums || '0000') === gads || dati.darijumi.some((d) => ligumsPecSaites(d.saite) === a && gadsNo(d.datums) === gads))
    .map((a) => ({ nr: a.nr, datums: a.datums, pasutitajs: pasutitajs(a.pasutitajsId).nosaukums, veids: a.veids, summa: a.summa, samaksats: samaksatsLigumam(a), ietur: a.izmaksatajsIetur }));
  const ieraksti = sdIeraksti().filter((e) => gadsNo(e.datums) === gads).map((e) => ({ datums: e.datums, partneris: e.partneris, info: e.info, veids: e.veids, summa: e.summa }));
  const fails = gadaParskats({ gads, n, provizoriski, vards: dati.profils.vards, izveidots: sodien(), ieraksti, darijumi, nesaistiti, rekini, ligumi,
    g: { d1Apliekamie: sk(g.d1Apliekamie), d1Ieturetais: sk(g.d1Ieturetais), citiNodokli: sk(g.citiNodokli), dzivibasIemaksas: sk(g.dzivibasIemaksas), attaisnotie: sk(g.attaisnotie),
      vsaoiDeklareta: g.vsaoiDeklareta === undefined || g.vsaoiDeklareta === '' ? '' : sk(g.vsaoiDeklareta) } });
  lejupieladet(`gramatvediba-parskats-${gads}.xlsx`, fails, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  toast('Pārskats lejupielādēts');
}

// ---------- Pasūtītāja izvēlne ----------
function pasutitajaIzvele(name, izveleta) {
  const opcijas = [...dati.pasutitaji].sort((a, b) => a.nosaukums.localeCompare(b.nosaukums, 'lv'));
  return `<label>Pasūtītājs<select name="${name}" data-pasutitajs>
    <option value="__jauns">+ Ievadīt jaunus rekvizītus</option>
    ${opcijas.map((p) => `<option value="${p.id}" ${p.id === izveleta ? 'selected' : ''}>${h(p.nosaukums)}</option>`).join('')}
  </select></label>
  <div class="panel" data-jauns-pasutitajs ${opcijas.some((p) => p.id === izveleta) ? 'hidden' : ''} style="grid-column:1/-1">
    <label>Ielīmē rekvizītus, kā tos atsūtīja pasūtītājs<textarea data-ielime rows="4" placeholder="Nosaukums&#10;Juridiskā adrese: …&#10;Reģ. nr. …"></textarea></label>
    <p class="row" style="margin:8px 0 14px"><button type="button" data-sadalit>Sadalīt pa laukiem</button><span class="note">Pēc sadalīšanas pārbaudi laukus zemāk.</span></p>
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
  $('[data-sadalit]', el).onclick = () => {
    const r = sadalitRekvizitus($('[data-ielime]', el).value);
    for (const k of ['nosaukums', 'regNr', 'iela', 'pilseta', 'indekss', 'valsts', 'epasts']) $(`[data-p="${k}"]`, el).value = r[k];
    toast(r.regNr ? 'Sadalīts. Pārbaudi laukus.' : 'Reģistrācijas numurs netika atrasts. Ievadi to ar roku.');
  };
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
const veidaOpcijas = (izv) => Object.entries(DARBA_VEIDI).map(([k, v]) => `<option value="${k}" ${k === izv ? 'selected' : ''}>${h(v.nosaukums)} (${v.norma} %)</option>`).join('');
const veidaIzvele = (name, izv = '90.13') => `<label>Darba veids<select name="${name}">${veidaOpcijas(izv)}</select></label>`;
const gaduIzvele = (id, izv) => `<label>Gads<select id="${id}">${gaduSaraksts().map((g) => `<option ${g === izv ? 'selected' : ''}>${g}</option>`).join('')}</select></label>`;
function gaduSaraksts() {
  const g = new Set([...Object.keys(noteikumi).map(Number), ...dati.darijumi.map((d) => gadsNo(d.datums)), ...sdIeraksti().map((e) => gadsNo(e.datums)), gadsNo(sodien())]);
  return [...g].sort((a, b) => b - a);
}

// ---------- Pārskats ----------
let parskGads = null;
function skatsParskats(v) {
  const sod = sodien(); parskGads ??= gadsNo(sod); const gads = parskGads;
  if (!dati.profils.vards) {
    v.innerHTML = `<h2>Sveiks!</h2><p class="lead">Sāc ar saviem rekvizītiem sadaļā „Iestatījumi”. Tie tiks ievietoti katrā rēķinā.</p><p><a href="#iestatijumi"><button class="primary">Uz iestatījumiem</button></a></p>`;
    return;
  }
  const x = nodokluAtlikums(gads), a = x.a, { n } = gadaNoteikumi(gads);
  const iepr = gadaAprekins(gads - 1).irDati ? nodokluAtlikums(gads - 1) : null;
  // Cik atlikt no katra ienākuma: nodokļu pieaugums pēc katra maksājuma
  const ier = sdIeraksti().filter((e) => gadsNo(e.datums) === gads).sort((p, q) => p.datums.localeCompare(q.datums));
  const g = dati.gadi[gads] || {}; let ieprieks = 0;
  const atlikt = ier.map((e, i) => {
    const dala = ier.slice(0, i + 1), m = menesuIenakumi(dala, gads);
    const vs = [1, 2, 3, 4].reduce((s, c) => s + ceturksnaZinojums(m, c, n).jaMaksa, 0);
    const iin = gadaDeklaracija({ d3Apliekamie: d3(dala, gads).apliekamie, vsaoi: vs, dzivibasIemaksas: sk(g.dzivibasIemaksas) }, n).r18;
    const kopa = r2(vs + iin), pieaugums = r2(kopa - ieprieks); ieprieks = kopa; return { ...e, atlikt: pieaugums };
  });
  const nakamie = [1, 2, 3, 4].flatMap((c) => { const t = termini(gads, c); return [{ d: t.iesniegt, t: `${c}. ceturkšņa ziņojums` }, { d: t.samaksat, t: `${c}. ceturkšņa VSAOI samaksa`, s: a.q[c - 1].jaMaksa }]; })
    .concat([{ d: `${gads + 1}-03-01`, t: `Gada deklarācija par ${gads}. gadu (līdz 1. jūnijam)` }, { d: `${gads + 1}-06-23`, t: 'IIN samaksa', s: a.d.r24 }])
    .filter((t) => t.d >= sod).slice(0, 4);
  const neapm = dati.rekini.filter((r) => !rekinaStatuss(r).pilniba);
  const vidMaks = dati.darijumi.filter((d) => d.kategorija === 'vid-maksajums' && nodokluGads(d) === gads).sort((p, q) => p.datums.localeCompare(q.datums));
  v.innerHTML = `<h2>Pārskats</h2><div class="row" style="margin-bottom:14px">${gaduIzvele('pg', gads)}</div>${provBaneris(gads)}
  <div class="grid2">
    <div class="panel"><p class="note" style="margin:0">Par ${gads}. gadu nodokļiem jāpietur</p><div class="big"><span class="hl">${naudaLv(x.atlikums)} €</span></div>
      <p class="note">VSAOI ${naudaLv(a.vsaoi)} € + IIN pēc deklarācijas ${naudaLv(a.d.r24)} € − jau samaksāts VID par ${gads}. gadu ${naudaLv(x.samaksats)} €.</p>
      ${iepr && iepr.atlikums > 0.5 ? `<p class="note"><span class="tag warn">uzmanību</span> Par ${gads - 1}. gadu pēc rīka datiem vēl nav samaksāti ${naudaLv(iepr.atlikums)} €. Ja tas neatbilst patiesībai, sadaļā „Banka” pārbaudi, kuram gadam piesaistīti maksājumi VID.</p>` : ''}
      <p class="note">IIN ir aplēse: precīzāka, ja sadaļā „Gada deklarācija” ievadi datus no EDS.</p></div>
    <div class="panel"><h3 style="margin-top:0">Tuvākie termiņi</h3>${nakamie.map((t) => `<p style="margin:6px 0"><b>${datumsLv(t.d)}</b> ${h(t.t)}${t.s ? ` · ${naudaLv(t.s)} €` : ''}</p>`).join('') || '<p class="note">Šim gadam termiņu vairs nav.</p>'}</div>
  </div>
  <h3>Maksājumi VID par ${gads}. gadu</h3>
  <form class="panel grid" id="vf"><label>Datums<input type="date" name="datums" value="${sod}" required></label><label>Summa, €<input name="summa" inputmode="decimal" required></label>
    <label>Par kuru gadu<select name="gads">${[gads - 1, gads].map((y) => `<option ${y === gads ? 'selected' : ''}>${y}</option>`).join('')}</select></label><button type="submit">Pievienot maksājumu</button></form>
  <p class="note">Maksājumus VID rīks atpazīst bankas izrakstā. Ja nodokļus maksā no konta, kura izrakstu rīkā neielādē, ievadi tos šeit.</p>
  ${vidMaks.length ? `<div class="tbl"><table><thead><tr><th>Datums</th><th class="n">Summa</th><th>Avots</th><th></th></tr></thead><tbody>
    ${vidMaks.map((d) => `<tr><td>${datumsLv(d.datums)}</td><td class="n">${naudaLv(d.summa)}</td><td>${d.arRoku ? 'ievadīts ar roku' : 'bankas izraksts'}</td><td>${d.arRoku ? `<button class="link" data-dzv="${h(d.arhivaKods)}">Dzēst</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
  <h3>${gads}. gada ienākumi un cik no katra atlikt</h3>
  ${atlikt.length ? `<div class="tbl"><table><thead><tr><th>Datums</th><th>Maksātājs</th><th class="n">Summa</th><th class="n">Atlikt nodokļiem</th></tr></thead><tbody>
    ${atlikt.map((e) => `<tr><td>${datumsLv(e.datums)}</td><td class="wrap">${h(e.partneris)}</td><td class="n">${naudaLv(e.summa)}</td><td class="n">${naudaLv(e.atlikt)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="note">Šajā gadā nav apstiprinātu ienākumu. Ielādē bankas izrakstu sadaļā „Banka”.</p>'}
  <p class="note">Neapmaksāti rēķini: ${neapm.length}. Nākamais rēķina numurs: ${dati.profils.nakamaisNr}.</p>`;
  $('#pg').onchange = (e) => { parskGads = Number(e.target.value); radit(); };
  $('#vf').onsubmit = (e) => {
    e.preventDefault(); const f = e.target, summa = sk(f.summa.value);
    if (summa <= 0) { toast('Ievadi summu'); return; }
    dati.darijumi.push({ arhivaKods: 'roku-' + uid(), datums: f.datums.value, partneris: 'Valsts budžets (VID)', info: 'Ievadīts ar roku', summa, valuta: 'EUR', virziens: 'D', kategorija: 'vid-maksajums', nodokluGads: Number(f.gads.value), arRoku: true });
    saglabatUnRadit('Maksājums pievienots');
  };
  $$('[data-dzv]').forEach((b) => b.onclick = () => { dati.darijumi = dati.darijumi.filter((d) => d.arhivaKods !== b.dataset.dzv); saglabatUnRadit('Maksājums dzēsts'); });
}

// ---------- Rēķini ----------
let rekinaForma = null;
function skatsRekini(v) {
  const saraksts = [...dati.rekini].sort((a, b) => b.nr - a.nr);
  v.innerHTML = `<h2>Rēķini</h2><p class="lead">Katram rēķinam tiek sagatavots PDF un e-rēķins XML formātā. Numerācija ir automātiska un viena visiem pasūtītājiem.</p>
  ${rekinaForma ? rekinaRedaktors() : '<p><button class="primary" id="jauns">+ Jauns rēķins</button></p>'}
  <div class="tbl" style="margin-top:16px"><table><thead><tr><th>Nr.</th><th>Datums</th><th>Pasūtītājs</th><th class="n">Summa</th><th>Statuss</th><th></th></tr></thead><tbody>
  ${saraksts.map((r) => { const p = pasutitajs(r.pasutitajsId), st = rekinaStatuss(r);
    const tags = st.pilniba ? `<span class="tag ok">${r.samaksatsCitur && !st.samaksats ? 'apmaksāts citā kontā' : 'apmaksāts'}</span>` : st.daleji ? `<span class="tag warn">daļēji, atlikums ${naudaLv(st.atlikums)}</span>` : r.termins < sodien() ? '<span class="tag warn">kavēts</span>' : '<span class="tag">gaida</span>';
    return `<tr><td>${h(rekinaNumursTeksts(r.nr, p.veidne))}</td><td>${datumsLv(r.datums)}</td><td class="wrap">${h(p.nosaukums)}${p.budzetaIestade ? ' <span class="tag">budžeta iestāde</span>' : ''}</td>
    <td class="n">${naudaLv(st.kopa)}</td><td>${tags}</td>
    <td><div class="row"><button class="link" data-pdf="${r.id}">PDF</button><button class="link" data-xml="${r.id}">XML</button><button class="link" data-labot="${r.id}">Labot</button>${st.samaksats === 0 && !r.samaksatsCitur ? `<button class="link" data-dzest="${r.id}">Dzēst</button>` : ''}</div></td></tr>`; }).join('') || '<tr><td colspan="6" class="note">Rēķinu vēl nav.</td></tr>'}
  </tbody></table></div>`;
  const atrast = (id) => dati.rekini.find((r) => r.id === id);
  if ($('#jauns')) $('#jauns').onclick = () => { rekinaForma = { pozicijas: [{ nosaukums: '', daudzums: 1, cena: '' }] }; radit(); };
  $$('[data-pdf]').forEach((b) => b.onclick = () => atvertPdf(atrast(b.dataset.pdf)));
  $$('[data-xml]').forEach((b) => b.onclick = () => lejupieladetXml(atrast(b.dataset.xml)));
  $$('[data-labot]').forEach((b) => b.onclick = () => { const r = atrast(b.dataset.labot); rekinaForma = { ...r, labo: r.id, pozicijas: r.pozicijas.map((p) => ({ ...p })) }; radit(); window.scrollTo({ top: 0 }); });
  $$('[data-dzest]').forEach((b) => b.onclick = () => {
    const r = atrast(b.dataset.dzest), pedejais = r.nr === dati.profils.nakamaisNr - 1;
    if (!confirm(`Dzēst rēķinu ${rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne)}?${pedejais ? ' Numurs tiks atbrīvots nākamajam rēķinam.' : ' Numerācijā paliks iztrūkums, jo pēc tā jau ir izrakstīti citi rēķini.'}`)) return;
    dati.rekini = dati.rekini.filter((q) => q.id !== r.id); if (pedejais) dati.profils.nakamaisNr = r.nr;
    saglabatUnRadit('Rēķins dzēsts');
  });
  if (rekinaForma) piesaistitRedaktoru();
}
function rekinaRedaktors() {
  const f = rekinaForma, d = f.datums || sodien(), labo = !!f.labo;
  return `<form class="panel" id="rf"><h3 style="margin-top:0">${labo ? `Labot rēķinu ${h(rekinaNumursTeksts(f.nr, pasutitajs(f.pasutitajsId).veidne))}` : `Jauns rēķins ${h('#' + dati.profils.nakamaisNr)}`}</h3>
  ${labo ? '<p class="note">Ja rēķins jau ir nosūtīts pasūtītājam, pēc labošanas nosūti viņam arī jauno versiju.</p>' : ''}
  <div class="grid">${pasutitajaIzvele('pas', f.pasutitajsId)}
    <label>Datums<input type="date" name="datums" value="${d}" required></label>
    <label>Apmaksas termiņš<input type="date" name="termins" value="${f.termins || pieskaititDienas(d, 14)}" required></label>
    <label>Valoda<select name="valoda"><option value="lv">Latviešu</option><option value="en" ${f.valoda === 'en' ? 'selected' : ''}>Angļu</option></select></label>
    <label>Līguma nr. (ja ir)<input name="ligumaNr" value="${h(f.ligumaNr || '')}"></label>
    <label>Periods no (ja vajag)<input type="date" name="no" value="${f.periods?.no || ''}"></label><label>Periods līdz<input type="date" name="lidz" value="${f.periods?.lidz || ''}"></label>
    ${veidaIzvele('veids', f.veids)}
  </div>
  <h3>Pozīcijas</h3><div id="poz">${f.pozicijas.map((p, i) => `<div class="poz">
    <label>Nosaukums<input name="pn${i}" value="${h(p.nosaukums)}" required></label><label>Daudzums<input name="pd${i}" inputmode="decimal" value="${h(p.daudzums)}"></label>
    <label>Cena, €<input name="pc${i}" inputmode="decimal" value="${h(p.cena)}"></label><button type="button" class="link" data-dzest-poz="${i}" ${f.pozicijas.length < 2 ? 'disabled' : ''}>Dzēst</button></div>`).join('')}</div>
  <div class="row"><button type="button" id="pozPlus">+ Pozīcija</button><button type="button" id="frazes">Ievietot autordarba frāzi</button></div>
  <p class="note">Rēķinā: „Rēķins sagatavots elektroniski un ir derīgs bez paraksta”, summa vārdiem un tavs logo tiek pievienoti automātiski.</p>
  <div class="row"><button class="primary" type="submit">${labo ? 'Saglabāt izmaiņas' : 'Saglabāt rēķinu'}</button><button type="button" id="atcelt">Atcelt</button></div></form>`;
}
function piesaistitRedaktoru() {
  const form = $('#rf'); piesaistitPasutitajaIzveli(form);
  const pozicijas = () => rekinaForma.pozicijas.map((_, i) => ({ nosaukums: form[`pn${i}`].value.trim(), daudzums: sk(form[`pd${i}`].value) || 1, cena: sk(form[`pc${i}`].value) }));
  // Saglabā formā jau ievadīto, lai pārzīmēšana neko neizdzēš
  const paturet = () => Object.assign(rekinaForma, { pasutitajsId: form.pas.value, datums: form.datums.value, termins: form.termins.value, valoda: form.valoda.value, ligumaNr: form.ligumaNr.value,
    periods: { no: form.no.value, lidz: form.lidz.value }, veids: form.veids.value, pozicijas: pozicijas(),
    jaunsPas: Object.fromEntries($$('[data-p]', form).map((el) => [el.dataset.p, el.type === 'checkbox' ? el.checked : el.value])) });
  if (rekinaForma.jaunsPas) for (const el of $$('[data-p]', form)) { const x = rekinaForma.jaunsPas[el.dataset.p]; if (x !== undefined) el.type === 'checkbox' ? (el.checked = x) : (el.value = x); }
  $('#atcelt').onclick = () => { rekinaForma = null; radit(); };
  $('#pozPlus').onclick = () => { paturet(); rekinaForma.pozicijas.push({ nosaukums: '', daudzums: 1, cena: '' }); radit(); };
  $('#frazes').onclick = () => { const el = form.pn0; el.value = `Atlīdzība par autordarba „${el.value || '…'}” radīšanu un izmantošanas tiesību nodošanu`; el.focus(); };
  $$('[data-dzest-poz]').forEach((b) => b.onclick = () => { paturet(); rekinaForma.pozicijas.splice(Number(b.dataset.dzestPoz), 1); radit(); });
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!dati.profils.vards || !dati.profils.iban) { toast('Vispirms aizpildi savus rekvizītus iestatījumos'); return; }
    const poz = pozicijas();
    if (poz.some((p) => !p.nosaukums || p.cena <= 0)) { toast('Katrai pozīcijai vajag nosaukumu un cenu'); return; }
    const pasId = nolasitPasutitaju(form); if (!pasId) return;
    const lauki = { datums: form.datums.value, termins: form.termins.value, pasutitajsId: pasId, valoda: form.valoda.value, ligumaNr: form.ligumaNr.value.trim(),
      periods: form.no.value && form.lidz.value ? { no: form.no.value, lidz: form.lidz.value } : null, veids: form.veids.value, pozicijas: poz };
    const p = pasutitajs(pasId);
    if (rekinaForma.labo) { Object.assign(dati.rekini.find((r) => r.id === rekinaForma.labo), lauki); rekinaForma = null; saglabatUnRadit('Izmaiņas saglabātas'); return; }
    dati.rekini.push({ id: uid(), nr: dati.profils.nakamaisNr, ...lauki }); dati.profils.nakamaisNr += 1; rekinaForma = null;
    saglabatUnRadit(p.veidne === 'hanzas' ? 'Rēķins saglabāts. Hanzas Perons Excel blanka būs 3. posmā, pagaidām lieto PDF.'
      : p.budzetaIestade ? 'Rēķins saglabāts. Budžeta iestādei sūti e-rēķinu (XML) caur e-adresi.' : 'Rēķins saglabāts');
  };
}
function atvertPdf(r) {
  const w = window.open('', '_blank');
  if (!w) { toast('Pārlūks bloķēja jaunu logu. Atļauj uznirstošos logus šai vietnei.'); return; }
  w.document.write(rekinsHtml(r, dati.profils, pasutitajs(r.pasutitajsId))); w.document.close();
  setTimeout(() => w.print(), 400);
}
function lejupieladetXml(r) {
  const p = pasutitajs(r.pasutitajsId), pr = dati.profils, nr = rekinaNumursId(r.nr, p.veidne);
  const xml = eRekinsXml({ numurs: nr, datums: r.datums, termins: r.termins, ligumaNr: r.ligumaNr, periods: r.periods,
    pardevejs: { nosaukums: pr.vards, regNr: pr.personasKods, adrese: pr.adrese, epasts: pr.epasts },
    pircejs: { nosaukums: p.nosaukums, regNr: p.regNr, adrese: p.adrese, epasts: p.epasts }, pozicijas: r.pozicijas, iban: pr.iban, bic: pr.bic });
  lejupieladet(`e-rekins-${nr}.xml`, xml, 'application/xml');
  if (p.budzetaIestade) toast('Augšupielādē šo XML latvija.lv e-adreses e-rēķinu formā: tad dati VID nonāk automātiski.');
}

// ---------- Autorlīgumi ----------
function skatsLigumi(v) {
  v.innerHTML = `<h2>Autorlīgumi</h2><p class="lead">Ieraksti autorlīgumu, kad to paraksti. Kad maksājums ienāks bankā, rīks to atpazīs pēc līguma numura (vismaz 4 zīmes) vai pēc pasūtītāja un summas.</p>
  <form class="panel" id="lf"><div class="grid">${pasutitajaIzvele('pas')}
    <label>Līguma nr.<input name="nr" required></label><label>Datums<input type="date" name="datums" value="${sodien()}"></label>
    <label>Līguma summa, €<input name="summa" inputmode="decimal" required></label>${veidaIzvele('veids')}
    <label class="check"><input type="checkbox" name="ietur"> Izmaksātājs ietur visus nodokļus</label></div>
    <p class="row"><button class="primary" type="submit">Saglabāt līgumu</button></p></form>
  <div class="tbl" style="margin-top:16px"><table><thead><tr><th>Līgums</th><th>Pasūtītājs</th><th>Datums</th><th class="n">Summa</th><th class="n">Saņemts</th><th>Veids</th><th></th></tr></thead><tbody>
  ${dati.autorligumi.map((a) => { const sam = samaksatsLigumam(a); return `<tr><td>${h(a.nr)}</td><td class="wrap">${h(pasutitajs(a.pasutitajsId).nosaukums)}</td><td>${datumsLv(a.datums)}</td><td class="n">${naudaLv(a.summa)}</td><td class="n">${naudaLv(sam)}</td>
    <td>${h(DARBA_VEIDI[a.veids]?.nosaukums)}${a.izmaksatajsIetur ? ' <span class="tag">nodokļus ietur izmaksātājs</span>' : ''}</td><td>${sam === 0 ? `<button class="link" data-dzl="${a.id}">Dzēst</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="note">Līgumu vēl nav.</td></tr>'}
  </tbody></table></div>`;
  const f = $('#lf'); piesaistitPasutitajaIzveli(f);
  f.onsubmit = (e) => {
    e.preventDefault(); const summa = sk(f.summa.value);
    if (summa <= 0) { toast('Ievadi līguma summu'); return; }
    const pasId = nolasitPasutitaju(f); if (!pasId) return;
    dati.autorligumi.push({ id: uid(), nr: f.nr.value.trim(), pasutitajsId: pasId, datums: f.datums.value, summa, veids: f.veids.value, izmaksatajsIetur: f.ietur.checked });
    saglabatUnRadit('Līgums saglabāts');
  };
  $$('[data-dzl]').forEach((b) => b.onclick = () => { if (confirm('Dzēst šo līgumu?')) { dati.autorligumi = dati.autorligumi.filter((a) => a.id !== b.dataset.dzl); saglabatUnRadit('Līgums dzēsts'); } });
}

// ---------- Banka ----------
let bankGads = null;
/** Izvēlne: kuram rēķinam vai līgumam pieder maksājums. */
function saitesIzvele(r, atslega) {
  const tagad = rekinsPecSaites(r.saite) || ligumsPecSaites(r.saite);
  const rek = dati.rekini.filter((x) => !rekinaStatuss(x).pilniba || x === tagad || (x.samaksatsCitur && !samaksatsRekinam(x))).sort((a, b) => b.nr - a.nr);
  if (!rek.length && !dati.autorligumi.length) return '<span class="note" style="display:block;margin:6px 0">Nav rīkā izrakstītu rēķinu vai ievadītu līgumu, ko piesaistīt. Tas nav obligāti: nodokļiem pietiek ar kategoriju un darba veidu.</span>';
  const opc = (v, t, sel) => `<option value="${v}" ${sel ? 'selected' : ''}>${h(t)}</option>`;
  return `<select data-saite="${atslega}" title="Rēķins vai līgums">${opc('', '— bez rēķina vai līguma —', !tagad)}
    ${rek.map((x) => opc('r:' + x.id, `Rēķins ${rekinaNumursTeksts(x.nr, pasutitajs(x.pasutitajsId).veidne)} · ${pasutitajs(x.pasutitajsId).nosaukums} · ${naudaLv(rekinaKopsumma(x))}`, x === tagad)).join('')}
    ${dati.autorligumi.map((a) => opc('a:' + a.id, `Līgums ${a.nr} · ${pasutitajs(a.pasutitajsId).nosaukums}`, a === tagad)).join('')}</select>`;
}
/** Vadīklas vienam darījumam: kategorija, saite, darba veids; maksājumam VID: nodokļu gads. */
function vadiklas(r, atslega, sesija) {
  if (r.virziens === 'D') {
    const g = gadsNo(r.datums), izv = nodokluGads(r);
    return `<span class="tag">maksājums VID</span> <label class="check" style="margin-top:6px">par gadu <select data-ngads="${atslega}" style="width:auto">${[g - 1, g].map((x) => `<option ${x === izv ? 'selected' : ''}>${x}</option>`).join('')}</select></label>`;
  }
  return `<select data-kat="${atslega}" ${r.kategorija === 'jaizverte' ? 'style="border-color:var(--warn)"' : ''}>${Object.entries(KATEGORIJAS).filter(([k]) => sesija || k !== 'jaizverte').map(([k, t]) => `<option value="${k}" ${k === r.kategorija ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${AR_SAITI.has(r.kategorija) ? saitesIzvele(r, atslega) : ''}
    ${r.kategorija === 'sd' && !rekinsPecSaites(r.saite) && !ligumsPecSaites(r.saite) ? `<select data-veids="${atslega}" title="Darba veids">${veidaOpcijas(r.veids || '90.13')}</select>` : ''}
    ${sesija && r.citaValuta ? `<label>Saņemts eiro<input data-eur="${atslega}" inputmode="decimal" value="${h(r.summaEur ?? '')}" placeholder="summa EUR"></label>` : ''}
    ${sesija && r.manuali && r.partneris ? `<label class="check"><input type="checkbox" data-atc="${atslega}" ${r.atcereties ? 'checked' : ''}> atcerēties šim maksātājam</label>` : ''}`;
}
function piesaistitVadiklas(sakne, atrast, pecIzmainam) {
  $$('[data-kat]', sakne).forEach((el) => el.onchange = () => { const r = atrast(el.dataset.kat); r.kategorija = el.value; r.manuali = true; delete r.neatbilstiba; if (!AR_SAITI.has(r.kategorija)) delete r.saite; pecIzmainam(); });
  $$('[data-saite]', sakne).forEach((el) => el.onchange = () => {
    const r = atrast(el.dataset.saite), [t, id] = el.value.split(':'); delete r.neatbilstiba;
    if (!el.value) delete r.saite;
    else if (t === 'r') { const x = dati.rekini.find((q) => q.id === id); r.saite = { tips: 'rekins', kods: id, nr: x.nr }; }
    else { const a = dati.autorligumi.find((q) => q.id === id); r.saite = { tips: 'autorligums', kods: id, nr: a.nr }; r.kategorija = a.izmaksatajsIetur ? 'nodokli-samaksaja-izmaksatajs' : 'sd'; }
    pecIzmainam();
  });
  $$('[data-veids]', sakne).forEach((el) => el.onchange = () => { atrast(el.dataset.veids).veids = el.value; pecIzmainam(true); });
  $$('[data-ngads]', sakne).forEach((el) => el.onchange = () => { atrast(el.dataset.ngads).nodokluGads = Number(el.value); pecIzmainam(true); });
  $$('[data-eur]', sakne).forEach((el) => el.onchange = () => { atrast(el.dataset.eur).summaEur = sk(el.value); pecIzmainam(); });
  $$('[data-atc]', sakne).forEach((el) => el.onchange = () => { atrast(el.dataset.atc).atcereties = el.checked; });
}
const rinduTabula = (rindas, sesija, atslega) => `<div class="tbl"><table><thead><tr><th>Datums</th><th>Maksātājs</th><th>Informācija</th><th class="n">Summa</th><th>Kategorija</th>${sesija ? '' : '<th></th>'}</tr></thead><tbody>
  ${rindas.map((r, i) => `<tr><td>${datumsLv(r.datums)}</td><td class="wrap">${h(r.partneris)}</td><td class="wrap">${h(r.info)}${r.pamatojums ? `<br><span class="note">${h(r.pamatojums)}</span>` : ''}</td>
    <td class="n">${r.virziens === 'D' ? '−' : ''}${naudaLv(r.summa)}${r.valuta && r.valuta !== 'EUR' ? ' ' + h(r.valuta) : ''}</td><td>${vadiklas(r, atslega(r, i), sesija)}</td>
    ${sesija ? '' : `<td><button class="link" data-dzd="${h(r.arhivaKods)}">Dzēst</button></td>`}</tr>`).join('')}</tbody></table></div>`;

function skatsBanka(v) {
  const s = bankasSesija; bankGads ??= gadsNo(sodien()); saglabatSesiju();
  let saturs = `<h2>Banka</h2><p class="lead">Ielādē Swedbank izrakstu CSV formātā. Rīks katru ienākošo maksājumu piesaista rēķinam, līgumam vai kategorijai. Ja nav pārliecināts, tas jautā tev.</p>
  <div class="panel row"><label style="flex:1">Izraksts (CSV)<input type="file" id="csv" accept=".csv,text/csv"></label></div>`;
  if (s) {
    const ien = s.rindas.filter((r) => r.virziens === 'K'), jaizv = ien.filter((r) => r.kategorija === 'jaizverte').length;
    const bezEur = ien.filter((r) => r.citaValuta && AR_SAITI.has(r.kategorija) && !(r.summaEur > 0)).length;
    const kopa = r2(ien.filter((r) => !r.citaValuta).reduce((a, r) => a + r.summa, 0));
    const poga = `<p class="row" style="margin:12px 0"><button class="primary" data-apstiprinat ${jaizv || bezEur ? 'disabled' : ''}>Apstiprināt ${s.rindas.length} darījumus</button><button data-atmest>Atmest</button>
      ${jaizv ? `<span class="note">Vēl jāizvērtē: ${jaizv}</span>` : ''}${bezEur ? `<span class="note">Jāievada summa eiro: ${bezEur}</span>` : ''}</p>`;
    saturs += `<h3>Izraksts ${datumsLv(s.izraksts.periods.no)} – ${datumsLv(s.izraksts.periods.lidz)} · konts ${h(s.izraksts.konts)}</h3>
    <p class="note">Jauni darījumi: ${s.rindas.length}${s.jau ? `, jau ielādēti iepriekš: ${s.jau}` : ''}.
    ${s.jau ? '' : (Math.abs(kopa - s.izraksts.apgrozijums.K) < 0.005 ? `Ienākošo maksājumu kopsumma ${naudaLv(kopa)} € sakrīt ar bankas kredīta apgrozījumu ✓` : `<span class="tag warn">uzmanību</span> Ienākošo maksājumu kopsumma ${naudaLv(kopa)} € nesakrīt ar bankas kredīta apgrozījumu ${naudaLv(s.izraksts.apgrozijums.K)} €.`)}
    <b>Darījumi tiek saglabāti grāmatvedībā tikai pēc apstiprināšanas.</b>${s.atjaunots ? ' Šis ir iepriekš ielādētais, vēl neapstiprinātais izraksts: tavas izvēles ir saglabātas.' : ''}</p>
    ${s.rindas.length ? poga + rinduTabula(s.rindas, true, (_, i) => String(i)) + (s.rindas.length > 8 ? poga : '') : '<p class="row"><button data-atmest>Aizvērt</button></p>'}`;
  }
  // Rēķini bez pilna maksājuma
  const neapm = dati.rekini.filter((r) => !rekinaStatuss(r).pilniba), citur = dati.rekini.filter((r) => r.samaksatsCitur && !samaksatsRekinam(r));
  saturs += `<h3>Rēķini bez atrasta maksājuma</h3>${neapm.length ? `<div class="tbl"><table><thead><tr><th>Nr.</th><th>Pasūtītājs</th><th class="n">Summa</th><th class="n">Saņemts</th><th>Samaksāts citā kontā</th></tr></thead><tbody>
    ${neapm.map((r) => { const st = rekinaStatuss(r); return `<tr><td>${h(rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne))}</td><td class="wrap">${h(pasutitajs(r.pasutitajsId).nosaukums)}</td><td class="n">${naudaLv(st.kopa)}</td><td class="n">${naudaLv(st.samaksats)}</td>
    <td>${st.samaksats === 0 ? `<div class="row"><input type="date" data-citur-d="${r.id}" style="width:auto"><button class="link" data-citur="${r.id}">Atzīmēt</button></div>` : '<span class="note">daļēji apmaksāts bankā</span>'}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="note">Atzīmē tikai tad, ja šī konta izrakstu rīkā neielādēsi. Ja vēlāk ielādēsi arī to, rīks izmantos bankas maksājumu un ienākumu neieskaitīs divreiz.</p>` : '<p class="note">Visiem rēķiniem maksājums ir atrasts.</p>'}
    ${citur.length ? `<p class="note">Atzīmēti kā samaksāti citā kontā: ${citur.map((r) => `${h(rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne))} (${datumsLv(r.samaksatsCitur.datums)}) <button class="link" data-necitur="${r.id}">atcelt</button>`).join(', ')}</p>` : ''}`;
  // Apstiprinātie darījumi: labojami
  const apst = dati.darijumi.filter((d) => gadsNo(d.datums) === bankGads).sort((a, b) => b.datums.localeCompare(a.datums));
  saturs += `<h3>Apstiprinātie darījumi</h3><div class="row" style="margin-bottom:10px">${gaduIzvele('bg', bankGads)}<span class="note">Šeit vari mainīt kategoriju, piesaistīt maksājumu rēķinam vai izdzēst kļūdaini ielādētu darījumu.</span></div>
    ${apst.length ? `<div id="apst">${rinduTabula(apst, false, (r) => r.arhivaKods)}</div>` : '<p class="note">Šajā gadā nav apstiprinātu darījumu.</p>'}`;
  v.innerHTML = saturs;

  $('#csv').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const izraksts = nolasitSwedbankCsv(await f.text()), zinami = new Set(dati.darijumi.map((d) => d.arhivaKods));
      const jauni = izraksts.darijumi.filter((d) => !zinami.has(d.arhivaKods));
      const rindas = klasificet(jauni, registrs()).filter((d) => d.virziens === 'K' || d.kategorija === 'vid-maksajums').map((d) => ({ ...d, manuali: d.kategorija === 'jaizverte', veids: '90.13' }));
      bankasSesija = { izraksts, rindas, jau: izraksts.darijumi.length - jauni.length }; radit();
    } catch (err) { toast(err.message); }
  };
  $('#bg').onchange = (e) => { bankGads = Number(e.target.value); radit(); };
  if (s) {
    piesaistitVadiklas(v, (i) => s.rindas[Number(i)] ?? {}, () => radit());
    $$('[data-atmest]').forEach((b) => b.onclick = () => { bankasSesija = null; radit(); });
    $$('[data-apstiprinat]').forEach((b) => b.onclick = () => {
      for (const r of s.rindas) {
        const ienakums = AR_SAITI.has(r.kategorija), rek = rekinsPecSaites(r.saite);
        const d = { arhivaKods: r.arhivaKods, datums: r.datums, partneris: r.partneris, info: r.info, summa: r.citaValuta && ienakums ? r.summaEur : r.summa, valuta: r.citaValuta && !ienakums ? r.valuta : 'EUR',
          virziens: r.virziens, kategorija: r.kategorija };
        if (r.citaValuta) d.sakotneji = { summa: r.summa, valuta: r.valuta };
        if (ienakums && r.saite) d.saite = r.saite;
        if (r.kategorija === 'sd' && !d.saite) d.veids = r.veids || '90.13';
        if (r.virziens === 'D') {
          const dienas = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
          const roku = dati.darijumi.find((x) => x.arRoku && Math.abs(x.summa - r.summa) < 0.005 && dienas(x.datums, r.datums) <= 3);
          d.nodokluGads = roku ? roku.nodokluGads : nodokluGads(r);
          if (roku) dati.darijumi = dati.darijumi.filter((x) => x !== roku);
        }
        if (rek?.samaksatsCitur && ienakums) delete rek.samaksatsCitur;       // bankas maksājums ir noteicošais
        dati.darijumi.push(d);
        if (r.atcereties && r.partneris && r.kategorija !== 'jaizverte') dati.maksataji[normalizetNosaukumu(r.partneris)] = r.kategorija;
      }
      bankasSesija = null; saglabatUnRadit('Darījumi apstiprināti un saglabāti');
    });
  }
  // Apstiprināto darījumu labošana (atsevišķas atslēgas, lai nesajauktos ar sesiju)
  const apstEl = $('#apst');
  if (apstEl && !s) piesaistitVadiklas(apstEl, (k) => dati.darijumi.find((d) => d.arhivaKods === k), () => saglabatUnRadit('Saglabāts'));
  else if (apstEl) $$('select', apstEl).forEach((el) => { el.disabled = true; el.title = 'Vispirms apstiprini vai atmet ielādēto izrakstu'; });
  $$('[data-dzd]').forEach((b) => b.onclick = () => { if (confirm('Dzēst šo darījumu no rīka? Bankā tas paliek, un to var ielādēt no jauna.')) { dati.darijumi = dati.darijumi.filter((d) => d.arhivaKods !== b.dataset.dzd); saglabatUnRadit('Darījums dzēsts'); } });
  $$('[data-citur]').forEach((b) => b.onclick = () => {
    const d = $(`[data-citur-d="${b.dataset.citur}"]`).value; if (!d) { toast('Norādi samaksas datumu'); return; }
    dati.rekini.find((r) => r.id === b.dataset.citur).samaksatsCitur = { datums: d }; saglabatUnRadit('Atzīmēts kā samaksāts citā kontā');
  });
  $$('[data-necitur]').forEach((b) => b.onclick = () => { delete dati.rekini.find((r) => r.id === b.dataset.necitur).samaksatsCitur; saglabatUnRadit('Atzīme noņemta'); });
}

// ---------- Ceturkšņa ziņojums (EDS izskatā) ----------
let izvGads = null, izvCet = null;
function skatsCeturksnis(v) {
  const t = new Date(), pedejais = Math.floor(t.getMonth() / 3) || 4;
  izvGads ??= t.getMonth() < 3 ? t.getFullYear() - 1 : t.getFullYear(); izvCet ??= pedejais;
  const { n } = gadaNoteikumi(izvGads), ier = sdIeraksti(), m = menesuIenakumi(ier, izvGads), q = ceturksnaZinojums(m, izvCet, n), tr = termini(izvGads, izvCet);
  const rinda = (nos, k) => `<tr><td>${nos}</td>${q.rindas.map((x) => `<td class="n c" data-k="${eds(x[k])}">${eds(x[k])}</td>`).join('')}<td class="n c" data-k="${eds(q.kopa[k])}">${eds(q.kopa[k])}</td></tr>`;
  const menesi = m.slice((izvCet - 1) * 3, izvCet * 3);
  v.innerHTML = `<h2>Pašnodarbinātā ziņojums</h2>
  <div class="row" style="margin-bottom:14px">${gaduIzvele('g', izvGads)}
  <label>Ceturksnis<select id="c">${[1, 2, 3, 4].map((c) => `<option value="${c}" ${c === izvCet ? 'selected' : ''}>${c}. ceturksnis</option>`).join('')}</select></label></div>
  ${provBaneris(izvGads)}
  <p class="note">Taksācijas periods: <b>${izvGads}. gada ${izvCet}. ceturksnis</b> · Apdrošinātās personas statuss: PN – Pašnodarbinātais. Uzklikšķini uz skaitļa, lai to nokopētu.</p>
  <div class="tbl eds"><table><thead><tr><th rowspan="2">Rādītāji</th><th colspan="3" style="text-align:center">Ceturkšņa mēnesis</th><th rowspan="2" class="n">Kopā</th></tr><tr><th class="n">1</th><th class="n">2</th><th class="n">3</th></tr></thead><tbody>
    ${rinda('Valsts sociālās apdrošināšanas obligāto iemaksu objekts', 'objekts')}
    ${rinda('Aprēķinātās valsts sociālās apdrošināšanas obligātās iemaksas', 'vsaoi')}
    ${rinda('Valsts sociālās apdrošināšanas obligāto iemaksu objekts pensiju apdrošināšanai, kuram piemēro obligāto iemaksu likmi 10%', 'pensObjekts')}
    ${rinda('Aprēķinātās valsts sociālās apdrošināšanas obligātās iemaksas pensiju apdrošināšanai 10%', 'pens')}
    <tr><td><b>Aprēķinātās valsts sociālās apdrošināšanas obligātās iemaksas kopā</b></td><td colspan="3"></td><td class="n c" data-k="${eds(q.jaMaksa)}"><b>${eds(q.jaMaksa)}</b></td></tr>
  </tbody></table></div>
  <p>Iesniegt EDS līdz <b>${datumsLv(tr.iesniegt)}</b>, samaksāt <span class="hl">${naudaLv(q.jaMaksa)} €</span> līdz <b>${datumsLv(tr.samaksat)}</b> Labot ziņojumu var līdz ${datumsLv(tr.labotLidz)}</p>
  <h3>No kā tas sastāv</h3>
  <div class="tbl"><table><thead><tr><th>Datums</th><th>Maksātājs</th><th>Darba veids</th><th class="n">Ieņēmumi</th><th class="n">Nosacītie izdevumi</th><th class="n">Ienākums</th></tr></thead><tbody>
  ${menesi.map((x) => { const mi = ier.filter((e) => gadsNo(e.datums) === izvGads && Number(e.datums.slice(5, 7)) === x.menesis).sort((a, b) => a.datums.localeCompare(b.datums));
    return mi.map((e) => { const nor = DARBA_VEIDI[e.veids]?.norma ?? 0; return `<tr><td>${datumsLv(e.datums)}</td><td class="wrap">${h(e.partneris)}<br><span class="note">${h(e.info)}</span></td><td>${h(DARBA_VEIDI[e.veids]?.nosaukums)} (${nor} %)</td>
      <td class="n">${naudaLv(e.summa)}</td><td class="n">${naudaLv(e.summa * nor / 100)}</td><td class="n">${naudaLv(e.summa * (100 - nor) / 100)}</td></tr>`; }).join('')
      + `<tr style="background:var(--field)"><td colspan="3"><b>${MENESI[x.menesis - 1]} kopā</b></td><td class="n"><b>${naudaLv(x.ienemumi)}</b></td><td class="n"><b>${naudaLv(x.nosacitie)}</b></td><td class="n"><b>${naudaLv(x.ienakums)}</b></td></tr>`; }).join('')}
  </tbody></table></div>
  <p class="note">Ja kāds maksājums šeit ir lieks vai trūkst, izlabo to sadaļā <a href="#banka">Banka</a> pie apstiprinātajiem darījumiem.
  Minimālā alga ${izvGads}. gadā: ${naudaLv(n.minimalaAlga)} €. Ja mēneša ienākums to sasniedz, maksā ${eds(n.vsaoiLikme)} % no minimālās algas un 10 % no pārējā; ja nesasniedz, tikai 10 %.</p>`;
  $('#g').onchange = (e) => { izvGads = Number(e.target.value); radit(); };
  $('#c').onchange = (e) => { izvCet = Number(e.target.value); radit(); };
  $$('[data-k]').forEach((td) => td.onclick = () => kopet(td.dataset.k));
}

// ---------- Gada deklarācija ----------
let deklGads = null;
function skatsDeklaracija(v) {
  deklGads ??= new Date().getMonth() < 6 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  const { n } = gadaNoteikumi(deklGads), a = gadaAprekins(deklGads), g = dati.gadi[deklGads] || {}, D = n.dRindas, R = n.d3Rindas;
  const ievade = (k, nos) => `<label>${nos}<input data-g="${k}" inputmode="decimal" value="${h(g[k] ?? '')}"></label>`;
  const rinda = (nr, nos, x, b) => `<tr><td>${h(nos)}</td><td class="n">${nr}</td><td class="n c" data-k="${eds(x)}">${b ? '<b>' : ''}${eds(x)}${b ? '</b>' : ''}</td></tr>`;
  v.innerHTML = `<h2>Gada ienākumu deklarācija</h2>
  <div class="row" style="margin-bottom:14px;align-items:flex-end">${gaduIzvele('g', deklGads)}<button id="parskats">Pārskats grāmatvedim (Excel)</button></div>${provBaneris(deklGads)}
  <p class="note">Pārskatā ir žurnāls, ceturkšņu VSAOI, D3 un D lapa, visi bankas darījumi ar kategorijām, rēķini un līgumi. Aprēķini ir Excel formulas, tāpēc grāmatvedis var pārbaudīt katru skaitli.</p>
  <h3>D3 · Ienākumi no saimnieciskās darbības</h3><p class="note">Šos skaitļus ievadi EDS. Uzklikšķini, lai nokopētu. Ja VID priekšaizpildījumā ir citi skaitļi, pareizie ir tie, kas balstīti uz tavu uzskaiti.</p>
  <div class="tbl eds"><table><thead><tr><th></th><th class="n">Rinda</th><th class="n">Nodokļa maksātāja deklarētie dati</th></tr></thead><tbody>
    ${rinda(R.ienemumi, 'Ieņēmumi no citiem saimnieciskās darbības veidiem', a.d3.ienemumi)}
    ${rinda(R.izdevumi, 'Izdevumi, kas saistīti ar citiem saimnieciskās darbības veidiem', a.d3.izdevumi)}
    ${rinda(R.apliekamie, 'Apliekamie ienākumi no saimnieciskās darbības', a.d3.apliekamie, true)}
  </tbody></table></div>
  <h3>Dati, ko EDS pievieno pats</h3><p class="note">Ievadi tos no EDS, lai aplēse sakristu ar deklarāciju. Ja neaizpildīsi, aplēse būs nedaudz lielāka par īsto IIN.</p>
  <div class="panel grid">${ievade('d1Apliekamie', 'D1 apliekamie (AKKA u. c.)')}${ievade('d1Ieturetais', 'D1 ieturētais nodoklis')}${ievade('citiNodokli', 'D1¹ starpība (19. rinda)')}
    ${ievade('dzivibasIemaksas', 'Dzīvības apdrošināšanas iemaksas')}${ievade('attaisnotie', 'Attaisnotie izdevumi (D4)')}${ievade('vsaoiDeklareta', 'VSAOI pēc iesniegtajiem ziņojumiem')}</div>
  <p class="note">VSAOI pēc rīka aprēķina šim gadam: ${naudaLv(a.vsaoiAprekinata)} €. Ja iesniegtajos ziņojumos kopsumma bija cita, ieraksti to pēdējā laukā, jo EDS izmanto iesniegto.</p>
  <h3>D · Gada ienākumu deklarācija (aplēse)</h3>
  <div class="tbl eds"><table><thead><tr><th></th><th class="n">Rinda</th><th class="n">Summa</th></tr></thead><tbody>
    ${rinda(D.apliekamie, 'Latvijas Republikā gūtie apliekamie ienākumi', a.d.r1)}${rinda(D.vsaoi, 'Valsts sociālās apdrošināšanas obligātās iemaksas', a.d.r6)}
    ${rinda(D.attaisnotie, 'Par izglītību, ārstnieciskajiem pakalpojumiem, ziedojumiem', a.d.r8)}${rinda(D.dzivibasApdr, 'Pensiju fondi, dzīvības apdrošināšana', a.d.r9)}
    ${rinda(D.attaisnotieKopa, 'Attaisnotie izdevumi kopā', a.d.r10)}${rinda(D.neapliekamais, 'Gada neapliekamais minimums', a.d.r11)}
    ${rinda(D.nodoklis, 'Nodoklis kopā', a.d.r18, true)}${rinda(D.citiNodokli, 'Nodoklis no citiem ienākumiem', a.d.r19)}${rinda(D.ieturetais, 'Avansā samaksātais (ieturētais) nodoklis', a.d.r23)}
    ${a.d.r25 > 0 ? rinda(D.parmaksa, 'Pārmaksātais nodoklis', a.d.r25, true) : rinda(D.maksajams, 'Maksājamais nodoklis', a.d.r24, true)}
  </tbody></table></div>
  <p class="note">Deklarāciju iesniedz no ${datumsLv(`${deklGads + 1}-03-01`)} līdz ${datumsLv(`${deklGads + 1}-06-01`)} IIN samaksā līdz ${datumsLv(`${deklGads + 1}-06-23`)}${a.d.r24 > n.iinVienaMaksajumaRobeza ? ' Summu var maksāt trīs daļās.' : ''}</p>`;
  $('#g').onchange = (e) => { deklGads = Number(e.target.value); radit(); };
  $('#parskats').onclick = () => lejupieladetParskatu(deklGads);
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
    <label>Logo (100×100 px)<input type="file" id="logo" accept="image/*"></label><img id="logoPrieksskats" src="${p.logo || ''}" alt="Logo" width="64" height="64" style="object-fit:contain" ${p.logo ? '' : 'hidden'}>
  </div><p class="row"><button class="primary" type="submit">Saglabāt</button><span class="note" id="logoZina"></span></p></form>
  <h3>Pasūtītāji</h3><div class="tbl"><table><thead><tr><th>Nosaukums</th><th>Reģ. nr.</th><th>Veidne</th><th>Budžeta iestāde</th><th></th></tr></thead><tbody>
  ${dati.pasutitaji.map((x) => `<tr><td class="wrap">${h(x.nosaukums)}</td><td>${h(x.regNr)}</td>
    <td><select data-veidne="${x.id}"><option value="standarta">Mana veidne</option><option value="hanzas" ${x.veidne === 'hanzas' ? 'selected' : ''}>Hanzas Perons</option></select></td>
    <td><input type="checkbox" data-budz="${x.id}" ${x.budzetaIestade ? 'checked' : ''} style="width:auto;min-height:0"></td>
    <td>${dati.rekini.some((r) => r.pasutitajsId === x.id) || dati.autorligumi.some((l) => l.pasutitajsId === x.id) ? '' : `<button class="link" data-dz="${x.id}">Dzēst</button>`}</td></tr>`).join('') || '<tr><td colspan="5" class="note">Pasūtītājus pievieno, izrakstot rēķinu.</td></tr>'}
  </tbody></table></div>
  <h3>Dati</h3><div class="panel"><p class="note" style="margin-top:0">Rezerves kopija satur visus tavus datus. Glabā to drošā vietā.</p>
    <div class="row"><button id="eksp">Lejupielādēt rezerves kopiju</button><label class="check" style="cursor:pointer"><span>Atjaunot no faila</span><input type="file" id="imp" accept=".json" hidden></label>
    <button id="dzestVisu" class="link">Dzēst visus datus šajā pārlūkā</button></div></div>`;
  const f = $('#pf'); let jaunsLogo = null;
  f.onsubmit = (e) => {
    e.preventDefault();
    Object.assign(p, { vards: f.vards.value.trim(), personasKods: f.personasKods.value.trim(), iban: f.iban.value.replace(/\s/g, ''), bic: f.bic.value.trim(), epasts: f.epasts.value.trim(),
      vieta: f.vieta.value.trim() || 'Rīgā', nakamaisNr: Math.max(1, Math.floor(sk(f.nakamaisNr.value)) || 1), adrese: { ...a, iela: f.iela.value.trim(), pilseta: f.pilseta.value.trim(), indekss: f.indekss.value.trim() } });
    if (jaunsLogo) p.logo = jaunsLogo;
    saglabatUnRadit('Rekvizīti saglabāti');
  };
  // Logo tikai parāda priekšskatījumu; forma netiek pārzīmēta, tāpēc ievadītie lauki nepazūd. Saglabājas kopā ar formu.
  $('#logo').onchange = (e) => { const fl = e.target.files[0]; if (!fl) return; if (fl.size > 300000) { toast('Logo fails ir par lielu (līdz 300 KB)'); e.target.value = ''; return; }
    const rd = new FileReader(); rd.onload = () => { jaunsLogo = rd.result; const img = $('#logoPrieksskats'); img.src = jaunsLogo; img.hidden = false; $('#logoZina').textContent = 'Logo izvēlēts. Nospied „Saglabāt”.'; }; rd.readAsDataURL(fl); };
  $$('[data-veidne]').forEach((el) => el.onchange = () => { dati.pasutitaji.find((x) => x.id === el.dataset.veidne).veidne = el.value; saglabatUnRadit(); });
  $$('[data-budz]').forEach((el) => el.onchange = () => { dati.pasutitaji.find((x) => x.id === el.dataset.budz).budzetaIestade = el.checked; saglabatUnRadit(); });
  $$('[data-dz]').forEach((b) => b.onclick = () => { dati.pasutitaji = dati.pasutitaji.filter((x) => x.id !== b.dataset.dz); saglabatUnRadit('Pasūtītājs dzēsts'); });
  $('#eksp').onclick = () => lejupieladet(`gramatvediba-${sodien()}.json`, eksportet(dati), 'application/json');
  $('#imp').onchange = async (e) => { try { const d = importet(await e.target.files[0].text()); if (confirm('Aizstāt pašreizējos datus ar rezerves kopiju?')) { dati = d; saglabat(dati); dati = ieladet(); saglabatUnRadit('Dati atjaunoti'); } } catch (err) { toast(err.message); } };
  $('#dzestVisu').onclick = () => { if (confirm('Dzēst visus datus šajā pārlūkā? Rezerves kopija netiks dzēsta.')) { dati = TUKSI_DATI(); bankasSesija = null; saglabatSesiju(); saglabatUnRadit('Dati dzēsti'); } };
}

// ---------- Maršruti un sākums ----------
const SKATI = { parskats: skatsParskats, rekini: skatsRekini, ligumi: skatsLigumi, banka: skatsBanka, ceturksnis: skatsCeturksnis, deklaracija: skatsDeklaracija, iestatijumi: skatsIestatijumi };
function radit() {
  kess = {};
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
