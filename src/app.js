// Grāmatvedības rīka saskarne (1. posms: dati pārlūkā).
import { r2, menesuIenakumi, ceturksnaZinojums, d3, gadaDeklaracija } from './calc.js';
import { DARBA_VEIDI } from './darbaVeidi.js';
import { nolasitSwedbankCsv, klasificet, normalizetNosaukumu, nosaukumiSakrit } from './banka.js';
import { eRekinsXml } from './eRekins.js';
import { rekinaKopsumma, rekinaNumursTeksts, rekinaNumursId, naudaLv, datumsLv } from './rekinsHtml.js';
import { sadalitRekvizitus } from './rekviziti.js';
import { gadaParskats, VID_MAKSAJUMS } from './parskats.js';
import { ieladet, saglabat, eksportet, importet, TUKSI_DATI } from './glabatuve.js';
import * as drive from './drive.js';
import { izveidotSinhronizatoru, datuApraksts } from './sinhronizacija.js';
import { filtretRekinus, filtrsAktivs, filtretDarijumus, darijumuFiltrsAktivs } from './meklesana.js';
import { zinamieDarijumi, glabajamaisKods, kontuParklajums, parklats, atrastRokuIerakstu, ceturksnaAtslega, iinAtslega, norekinatsAtslega, samaksatsAtzimei, gadaAtzimes, salidzinatSamaksas } from './konti.js';
import * as gmail from './gmail.js';
import { zurnals, IETURETIE } from './zurnals.js';
import { lasitVidDeklaraciju, gadaLauki, salidzinat } from './vidDeklaracija.js';
import { VERSIJA } from './versija.js';
import { parbauditBlanku, aizpilditBlanku, blankasFailaVards, bankasNosaukums } from './hanzas.js';
import { rekinsPdf, pdfFailaVards } from './pdf.js';

// ---------- Pamata palīgi ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sk = (v) => { const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const eds = (x) => r2(x).toFixed(2).replace('.', ',');           // EDS formāts: 1480,00
const isoLokali = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sodien = () => isoLokali(new Date());                       // vietējais datums, nevis UTC
const pieskaititDienas = (iso, n) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + n); return isoLokali(t); };
/** Datuma lauks dd.mm.gggg neatkarīgi no pārlūka valodas. Īstā vērtība (GGGG-MM-DD) ir slēptajā laukā ar doto name. */
const TERMINA_DIENAS = 14;
const datumsTeksts = (iso) => iso ? iso.split('-').reverse().join('.') : '';
function nolasitDatumu(t) {
  const m = /^\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})\.?\s*$/.exec(t || ''); if (!m) return '';
  const g = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), mm = Number(m[2]), d = Number(m[1]), x = new Date(Date.UTC(g, mm - 1, d));
  return x.getUTCMonth() === mm - 1 && x.getUTCDate() === d ? `${g}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
}
const datumaLauks = (name, iso = '', { obligats = false, attr = '', stils = '' } = {}) => `<span class="datums" style="${stils}"><input class="dtxt" inputmode="numeric" placeholder="dd.mm.gggg" value="${datumsTeksts(iso)}" ${obligats ? 'required' : ''} autocomplete="off"><button type="button" class="dbtn" aria-label="Kalendārs" tabindex="-1">▦</button><input type="date" class="dpick" tabindex="-1" aria-hidden="true" ${name ? `name="${name}"` : ''} value="${iso}" ${attr}></span>`;
function piesaistitDatumus(sakne = document) {
  for (const el of $$('.datums', sakne)) {
    const txt = $('.dtxt', el), pick = $('.dpick', el);
    const uzPick = () => { const iso = nolasitDatumu(txt.value); txt.setCustomValidity(txt.value && !iso ? 'Datums formā dd.mm.gggg' : ''); if (pick.value !== iso) { pick.value = iso; pick.dispatchEvent(new Event('change', { bubbles: true })); } };
    txt.oninput = uzPick;
    txt.onblur = () => { uzPick(); if (pick.value) txt.value = datumsTeksts(pick.value); };
    pick.addEventListener('change', () => { if (nolasitDatumu(txt.value) !== pick.value) txt.value = datumsTeksts(pick.value); });
    $('.dbtn', el).onclick = () => { try { pick.showPicker(); } catch { txt.focus(); } };
  }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const gadsNo = (iso) => Number(iso.slice(0, 4));
const MENESI = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'];
const KATEGORIJAS = {
  sd: 'Saimnieciskā darbība', 'nodokli-samaksaja-izmaksatajs': 'Nodokļus samaksāja izmaksātājs', akka: 'AKKA/LAA (D1)', 'vid-atmaksa': 'VID atmaksa',
  'kartes-atgriesana': 'Kartes darījuma atgriešana', procenti: 'Procenti', personigs: 'Personīgs pārskaitījums', 'savs-konts': 'No sava konta', jaizverte: '— jāizvērtē —'
};
const FILTRA_KATEGORIJAS = { ...Object.fromEntries(Object.entries(KATEGORIJAS).filter(([k]) => k !== 'jaizverte')), 'vid-maksajums': 'Maksājums VID' };
const AVOTI = { skaidra: 'skaidrā naudā', 'cits-konts': 'uz citu kontu', cits: 'cits' };
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
    const zin = zinamieDarijumi(dati.darijumi);                          // jau apstiprinātie vairs nav jārāda
    s.rindas = s.rindas.filter((r) => !zin(s.izraksts?.konts, r.arhivaKods));
    return s.rindas.length ? { ...s, atjaunots: true } : null;
  } catch { return null; }
}
function saglabatSesiju() {
  try { bankasSesija ? localStorage.setItem(SESIJAS_ATSLEGA, JSON.stringify(bankasSesija)) : localStorage.removeItem(SESIJAS_ATSLEGA); } catch { /* nav vietas: sesija paliek tikai atmiņā */ }
}
let bankasSesija = ieladetSesiju();

// ---------- Google Drive ----------
const DRIVE_ATSLEGA = 'gramatvediba:drive';
function driveMeta() { try { return JSON.parse(localStorage.getItem(DRIVE_ATSLEGA) || '{}') || {}; } catch { return {}; } }
function rakstitDriveMeta(m) { try { localStorage.setItem(DRIVE_ATSLEGA, JSON.stringify(m)); } catch { /* nav vietas */ } raditDriveStatusu(); }
let driveKluda = '', sinhTaimeris = null;
const BAZE = 'gramatvediba:sinh-baze';      // pēdējā ar Drive kopīgā versija (trīspusējai apvienošanai)
const sinh = izveidotSinhronizatoru({
  drive, meta: driveMeta, rakstitMeta: rakstitDriveMeta, dati: () => dati,
  aizstatDatus: (d) => { saglabat(d); dati = ieladet(); kess = {}; radit(); },
  lokalaRezerve: (d) => { try { localStorage.setItem('gramatvediba:dati-pirms-drive', JSON.stringify(d)); } catch { /* nav vietas */ } },
  piesaistitKontu: (e) => { if (dati.drive?.konts !== e) { dati.drive = { konts: e }; saglabat(dati); } },
  uzTekstu: eksportet, noTeksta: importet, jautat: dialogs, apstiprinat: (teksts) => dialogs({ virsraksts: 'Google Drive', teksts, pogas: [{ id: 'ja', teksts: 'Jā' }, { id: 'ne', teksts: 'Nē' }] }).then((x) => x === 'ja'),
  baze: () => { try { return JSON.parse(localStorage.getItem(BAZE) || 'null'); } catch { return null; } },
  rakstitBazi: (d) => { try { localStorage.setItem(BAZE, JSON.stringify(d)); } catch { /* nav vietas: apvienošana būs divpusēja */ } },
  zinot: (t) => toast(t, 6000),
  sodien: () => sodien(), tagad: () => new Date().toISOString()
});
function planotSinhronizaciju() {
  clearTimeout(sinhTaimeris);
  if (!drive.irAtslega()) { raditDriveStatusu(); return; }
  sinhTaimeris = setTimeout(() => izpilditSinh(() => sinh.sinhronizet()), 1500);
}
async function izpilditSinh(fn) {
  driveKluda = ''; raditDriveStatusu(true);
  try {
    const r = await fn();
    if (r === 'lejupieladet') toast('Dati ielādēti no Google Drive');
    if (r !== 'atcelts') await arhivetRekinus();
  } catch (e) { driveKluda = e.message || String(e); }
  raditDriveStatusu();
}
const pieslegtDrive = () => izpilditSinh(() => sinh.savienot());

// ---------- Faili Google Drive mapēs: Grāmatvedība/<gads>/Rēķini | Līgumi | Bankas izraksti | Atskaites ----------
const slugs = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
const mapjuKesh = {};
const driveGatavs = () => { const m = driveMeta(); return !!(m.konts && m.mapesId && drive.irAtslega()); };
/** Saglabā failu Drive mapē. Atgriež { id, webViewLink } vai null, ja Drive nav pieslēgts. */
async function saglabatDrive(cels, nosaukums, saturs, tips) {
  if (!driveGatavs()) return null;
  return drive.saglabatMape(driveMeta().mapesId, cels, nosaukums, saturs, tips, mapjuKesh);
}
/** Rēķina fails arhīvam: Hanzas Perons — aizpildīta Excel blanka; pārējiem — e-rēķins XML. */
// Rēķina PDF: fonti no rīka mapes, logo pārvērsts pikseļos ar canvas (der jebkurš attēla formāts)
let fontuKesh = null, logoKesh = { url: null, v: null };
async function fonti() {
  if (fontuKesh) return fontuKesh;
  const lad = async (n) => { const r = await fetch(`fonts/GramatvedibaSans-${n}.ttf`); if (!r.ok) throw new Error('Neizdevās ielādēt fontu PDF failam.'); return new Uint8Array(await r.arrayBuffer()); };
  return (fontuKesh = { regular: await lad('Regular'), bold: await lad('Bold') });
}
async function logoPikseli(url) {
  if (!url) return null;
  if (logoKesh.url === url) return logoKesh.v;
  const img = new Image(); img.src = url; await img.decode();
  const mer = Math.min(1, 300 / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * mer)), hh = Math.max(1, Math.round(img.naturalHeight * mer));
  const c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, hh);
  const d = x.getImageData(0, 0, w, hh).data, rgb = new Uint8Array(w * hh * 3), alfa = new Uint8Array(w * hh); let caursp = false;
  for (let i = 0; i < w * hh; i++) { rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2]; alfa[i] = d[i * 4 + 3]; if (d[i * 4 + 3] < 255) caursp = true; }
  logoKesh = { url, v: { platums: w, augstums: hh, rgb, alfa: caursp ? alfa : null } };
  return logoKesh.v;
}
async function rekinaPdfFails(r) {
  const p = pasutitajs(r.pasutitajsId);
  const saturs = await rekinsPdf(r, dati.profils, p, await fonti(), await logoPikseli(dati.profils.logo).catch(() => null));
  return { nosaukums: pdfFailaVards(dati.profils.vards, r, p.nosaukums), saturs, tips: 'application/pdf' };
}
/** Kādi faili rēķinam glabājas Drive: Hanzas Perons — Excel; pārējiem PDF; budžeta iestādei arī e-rēķins XML. */
function vajadzigieFaili(r) {
  const p = pasutitajs(r.pasutitajsId);
  if (p.veidne === 'hanzas') return ['xlsx'];
  return p.budzetaIestade ? ['pdf', 'xml'] : ['pdf'];
}
async function rekinaArhivaFails(r, veids) {
  const p = pasutitajs(r.pasutitajsId);
  if (veids === 'xlsx') {
    if (!dati.hanzasBlanka?.fails) return null;
    return { nosaukums: blankasFailaVards(dati.profils.vards, r.datums, r.nr), saturs: await aizpilditBlanku(noBase64(dati.hanzasBlanka.fails), r, dati.profils), tips: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
  if (veids === 'pdf') return rekinaPdfFails(r);
  const { nr, xml } = rekinaXml(r);
  return { nosaukums: `Rekins_${nr}_${slugs(p.nosaukums)}.xml`, saturs: xml, tips: 'application/xml' };
}
const failaLauks = (veids) => veids === 'pdf' ? 'pdfDrive' : 'driveFails';
/** Augšupielādē rēķinu failus, kuru Drive vēl nav vai kas ir novecojuši (rēķins labots). */
async function arhivetRekinus() {
  let mainits = false;
  for (const r of dati.rekini) {
    const trukst = vajadzigieFaili(r).filter((v) => r.driveGaida || !r[failaLauks(v)]);
    if (!trukst.length) continue;
    if (!driveGatavs()) break;
    let visi = true;
    for (const v of trukst) {
      const f = await rekinaArhivaFails(r, v); if (!f) { visi = false; continue; }
      const j = await saglabatDrive([r.datums.slice(0, 4), 'Rēķini'], f.nosaukums, f.saturs, f.tips); if (!j) return;
      r[failaLauks(v)] = { id: j.id, saite: j.webViewLink || '', nosaukums: f.nosaukums }; mainits = true;
    }
    if (visi) delete r.driveGaida;
  }
  if (mainits) { saglabatDati(); if (location.hash === '#rekini' && !rekinaForma) radit(); }   // neskar formu, kurā raksta
}
/** Poga „PDF”: izveido PDF, lejupielādē un saglabā Drive. */
async function lejupieladetPdf(r) {
  try {
    const f = await rekinaPdfFails(r);
    lejupieladet(f.nosaukums, f.saturs, 'application/pdf');
    if (driveGatavs()) {
      const j = await saglabatDrive([r.datums.slice(0, 4), 'Rēķini'], f.nosaukums, f.saturs, f.tips);
      if (j) { r.pdfDrive = { id: j.id, saite: j.webViewLink || '', nosaukums: f.nosaukums }; saglabatUnRadit('PDF lejupielādēts un saglabāts Google Drive'); return; }
    }
    toast(driveMeta().konts ? 'PDF lejupielādēts. Google Drive tas tiks saglabāts pēc pieslēgšanās.' : 'PDF lejupielādēts');
  } catch (e) { toast(e.message || 'Neizdevās izveidot PDF'); }
}
/** Lietotāja izvēlēts PDF (rēķins vai līgums) uz Drive. */
async function augsupieladetPdf(fl, cels, nosaukums) {
  if (!driveGatavs()) { toast('Vispirms pieslēdzies Google Drive (josla lapas augšā).'); return null; }
  if (!/pdf$/i.test(fl.name) && fl.type !== 'application/pdf') { toast('Izvēlies PDF failu'); return null; }
  const j = await saglabatDrive(cels, nosaukums, fl, 'application/pdf');
  return j && { id: j.id, saite: j.webViewLink || '', nosaukums };
}
const driveSaite = (f, teksts = 'Drive') => f?.saite ? `<a class="link" href="${h(f.saite)}" target="_blank" rel="noopener noreferrer" style="font-size:.9rem">${teksts} ↗</a>` : '';
function laiksLv(iso) { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${datumsLv(isoLokali(d))}`; }
/** Statusa josla virs satura. */
function raditDriveStatusu(notiek = sinh?.aiznemts?.()) {
  const el = $('#drive'); if (!el) return;
  const m = driveMeta(), poga = (t) => `<button class="link" data-drive-pieslegt style="font-weight:600;color:var(--ink);text-decoration:underline">${t}</button>`;
  let t;
  if (notiek) t = 'Google Drive: sinhronizē…';
  else if (driveKluda) t = `<span style="color:var(--warn)">${h(driveKluda)}</span> ${poga(m.konts ? 'Pieslēgties vēlreiz' : 'Mēģināt vēlreiz')}`;
  else if (!m.konts) t = `Dati glabājas tikai šajā pārlūkā. ${poga('Pieslēgt Google Drive')}`;
  else if (!drive.irAtslega()) t = `<b>Strādā bez Google Drive.</b> ${m.mainits ? 'Izmaiņas glabājas šajā pārlūkā un tiks apvienotas ar Drive, kad pieslēgsies.' : `Dati var nebūt jaunākie (pēdējā sinhronizācija ${laiksLv(m.sinhronizets)}).`} ${poga('Pieslēgties')}`;
  else t = `Google Drive: ${h(m.konts)} · ${m.mainits ? 'gaida saglabāšanu…' : `sinhronizēts ${laiksLv(m.sinhronizets)} ✓`}`;
  el.innerHTML = t;
  el.classList.toggle('bezdrive', !!m.konts && !drive.irAtslega() && !notiek && !driveKluda);
  const b = $('[data-drive-pieslegt]', el); if (b) b.onclick = pieslegtDrive;
}
/** Modāls jautājums ar pogām. Atgriež izvēlētās pogas id. */
function dialogs({ virsraksts, teksts, pogas }) {
  return new Promise((ok) => {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.innerHTML = `<h3 style="margin-top:0">${h(virsraksts)}</h3><p style="white-space:pre-line">${h(teksts)}</p><div class="row">${pogas.map((p, i) => `<button data-id="${h(p.id)}" class="${i === 0 ? 'primary' : ''}">${h(p.teksts)}</button>`).join('')}</div>`;
    document.body.appendChild(d);
    const beigt = (id) => { d.close(); d.remove(); ok(id); };
    $$('button', d).forEach((b) => b.onclick = () => beigt(b.dataset.id));
    d.addEventListener('cancel', (e) => { e.preventDefault(); beigt(pogas[pogas.length - 1].id); });
    d.showModal();
  });
}
window.addEventListener('beforeunload', (e) => { const m = driveMeta(); if (m.konts && m.mainits) { e.preventDefault(); e.returnValue = ''; } });
let kess = {};                                                     // aprēķinu kešs vienam zīmējumam

function toast(t, ms = 2200) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms); }
/** Lietotāja izmaiņa: saglabā pārlūkā un, ja pieslēgts Google Drive, sinhronizē. */
function saglabatDati() {
  const ok = saglabat(dati);
  const m = driveMeta();
  if (m.konts) { rakstitDriveMeta({ ...m, mainits: true }); planotSinhronizaciju(); }
  return ok;
}
function saglabatUnRadit(zina) { if (!saglabatDati()) toast('Neizdevās saglabāt pārlūkā'); else if (zina) toast(zina); radit(); }
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
/** Žurnāla kolonnai „Pozīcija”: rēķina pozīcijas vai līguma projekts. */
const rekinaPozicijas = (r) => (r?.pozicijas || []).map((p) => String(p.nosaukums || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join('; ');
const pozicijaDarijumam = (d) => { const r = rekinsPecSaites(d.saite); if (r) return rekinaPozicijas(r); return ligumsPecSaites(d.saite)?.projekts || ''; };
/** Ar roku ievadītam ienākumam mērķim pievieno avotu, lai žurnālā un pārskatā grāmatvedis redz, ka tas nav no bankas. */
const infoArAvotu = (d) => d.arRoku ? [d.info, `ievadīts ar roku${AVOTI[d.avots] ? ', ' + AVOTI[d.avots] : ''}`].filter(Boolean).join(' · ') : d.info;
function sdIeraksti() {
  if (kess.sd) return kess.sd;
  const noBankas = dati.darijumi.filter((d) => d.kategorija === 'sd').map((d) => ({ datums: d.datums, summa: d.summa, veids: veidsDarijumam(d), kategorija: 'sd', partneris: d.partneris, info: infoArAvotu(d), pozicija: pozicijaDarijumam(d) }));
  const citur = dati.rekini.filter((r) => r.samaksatsCitur && samaksatsRekinam(r) === 0).map((r) => ({ datums: r.samaksatsCitur.datums, summa: rekinaKopsumma(r), veids: r.veids, kategorija: 'sd',
    partneris: pasutitajs(r.pasutitajsId).nosaukums, info: `Rēķins ${rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne)}, samaksāts citā kontā`, pozicija: rekinaPozicijas(r) }));
  return (kess.sd = [...noBankas, ...citur]);
}
/** Ienākumi, no kuriem nodokļus jau samaksāja cits (izmaksātājs vai AKKA/LAA): žurnālā redzami, aprēķinos neiet. */
const citiIeraksti = () => dati.darijumi.filter((d) => IETURETIE[d.kategorija] && d.virziens !== 'D')
  .map((d) => ({ datums: d.datums, summa: d.summa, partneris: d.partneris, info: infoArAvotu(d), iemesls: IETURETIE[d.kategorija], pozicija: pozicijaDarijumam(d) }));
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
  // VSAOI deklarācijai (D06): iesniegtā summa no EDS/VID deklarācijas; citādi atzīmētajos ceturkšņos ziņotā, pārējos aprēķinātā.
  const atz = (c) => dati.samaksas?.[ceturksnaAtslega(gads, c)], irAtz = [1, 2, 3, 4].some((c) => atz(c));
  const irDekl = g.vsaoiDeklareta !== undefined && g.vsaoiDeklareta !== '';
  const vsaoi = irDekl ? sk(g.vsaoiDeklareta) : r2(q.reduce((s, x, i) => s + (atz(i + 1) ? Number(atz(i + 1).zinots) || 0 : x.jaMaksa), 0));
  const vsaoiAvots = irDekl ? 'deklaracija' : irAtz ? 'atzimes' : 'aprekins';
  const d = gadaDeklaracija({ d3Apliekamie: x.apliekamie, d1Apliekamie: sk(g.d1Apliekamie), d1Ieturetais: sk(g.d1Ieturetais), citiNodokli: sk(g.citiNodokli),
    vsaoi, dzivibasIemaksas: sk(g.dzivibasIemaksas), attaisnotie: sk(g.attaisnotie) }, n);
  return (kess['g' + gads] = { m, q, vsaoi, vsaoiAprekinata, vsaoiAvots, d3: x, d, irDati: ier.some((e) => gadsNo(e.datums) === gads) || irAtz });
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
/**
 * Atlikums ar VID par gadu: VSAOI + IIN pēc deklarācijas (atmaksa ar mīnusu) − samaksātais.
 * Samaksāto ņem no atzīmēm „Iesniegts un samaksāts”; ja gadam atzīmju nav, no bankas izrakstiem (tikai aplēse:
 * VID var būt ieskaitījis pārmaksu, ko izrakstā nevar redzēt). Negatīvs atlikums: VID ir parādā tev.
 */
function nodokluAtlikums(gads) {
  const a = gadaAprekins(gads), atz = gadaAtzimes(dati.samaksas, gads), norekinats = dati.samaksas?.[norekinatsAtslega(gads)] || null;
  const bankas = dati.darijumi.filter((d) => d.kategorija === 'vid-maksajums' && nodokluGads(d) === gads).sort((p, q) => p.datums.localeCompare(q.datums));
  const pecAtzimem = atz.length > 0, iin = r2(a.d.r24 - a.d.r25);
  const samaksats = pecAtzimem ? r2(atz.reduce((s, x) => s + samaksatsAtzimei(x), 0)) : r2(bankas.reduce((s, d) => s + d.summa, 0));
  const saistibas = r2(a.vsaoi + iin);
  return { a, iin, samaksats, saistibas, atlikums: norekinats ? 0 : r2(saistibas - samaksats), pecAtzimem, norekinats, atz, bankas };
}

/** Excel pārskats grāmatvedim par gadu: žurnāls, ceturkšņi, deklarācija, banka, rēķini un noteikumi ar formulām. */
/** Salīdzinājums ar ielādēto VID deklarāciju (ja ir). */
function vidSalidzinajums(gads) {
  const v = dati.gadi[gads]?.vidDekl; if (!v) return null;
  const { n } = gadaNoteikumi(gads), a = gadaAprekins(gads);
  return { ...salidzinat(v, a.d3, n, a.vsaoiAprekinata), id: v.id, iesniegts: v.iesniegts, sagatavotajs: v.sagatavotajs };
}
function lejupieladetParskatu(gads) {
  const { n, provizoriski } = gadaNoteikumi(gads), g = dati.gadi[gads] || {}, a = gadaAprekins(gads);
  const piesaiste = (d) => { const r = rekinsPecSaites(d.saite), l = ligumsPecSaites(d.saite);
    return r ? `Rēķins ${rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne)}` : l ? `Līgums ${l.nr}` : ''; };
  const gadaDarijumi = dati.darijumi.filter((d) => gadsNo(d.datums) === gads || (d.kategorija === 'vid-maksajums' && nodokluGads(d) === gads));
  const nesaistits = (d) => NESAISTITAS.has(d.kategorija) && d.virziens !== 'D';
  const nesaistiti = r2(gadaDarijumi.filter(nesaistits).reduce((a, d) => a + d.summa, 0));
  const darijumi = gadaDarijumi.filter((d) => !nesaistits(d)).map((d) => ({
    datums: d.datums, partneris: d.partneris, info: d.info, virziens: d.virziens, summa: d.summa,
    kategorija: d.kategorija === 'vid-maksajums' ? VID_MAKSAJUMS : (KATEGORIJAS[d.kategorija] || d.kategorija), aprekina: d.kategorija === 'sd',
    piesaiste: piesaiste(d), nodokluGads: d.kategorija === 'vid-maksajums' ? nodokluGads(d) : '', avots: d.arRoku ? `ievadīts ar roku${AVOTI[d.avots] ? ', ' + AVOTI[d.avots] : ''}` : `bankas izraksts${d.konts ? ' · ' + kontaNosaukums(d.konts) : ''}` }));
  const rekini = dati.rekini.filter((r) => gadsNo(r.datums) === gads).sort((a, b) => a.nr - b.nr).map((r) => {
    const st = rekinaStatuss(r);
    return { numurs: rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne), datums: r.datums, pasutitajs: pasutitajs(r.pasutitajsId).nosaukums, veids: r.veids,
      summa: st.kopa, samaksats: r.samaksatsCitur && !st.samaksats ? st.kopa : st.samaksats,
      statuss: st.pilniba ? (r.samaksatsCitur && !st.samaksats ? `samaksāts citā kontā ${datumsLv(r.samaksatsCitur.datums)}` : 'apmaksāts') : st.daleji ? 'daļēji apmaksāts' : 'nav apmaksāts' };
  });
  const ligumi = dati.autorligumi.filter((a) => gadsNo(a.datums || '0000') === gads || dati.darijumi.some((d) => ligumsPecSaites(d.saite) === a && gadsNo(d.datums) === gads))
    .map((a) => ({ nr: a.nr, datums: a.datums, pasutitajs: pasutitajs(a.pasutitajsId).nosaukums, veids: a.veids, summa: a.summa, samaksats: samaksatsLigumam(a), ietur: a.izmaksatajsIetur }));
  const ieraksti = sdIeraksti().filter((e) => gadsNo(e.datums) === gads).map((e) => ({ datums: e.datums, partneris: e.partneris, info: e.info, veids: e.veids, summa: e.summa, pozicija: e.pozicija }));
  const fails = gadaParskats({ gads, n, provizoriski, vidSalidzinajums: vidSalidzinajums(gads), vards: dati.profils.vards, izveidots: sodien(), ieraksti, citiIeraksti: citiIeraksti().filter((e) => gadsNo(e.datums) === gads), darijumi, nesaistiti, rekini, ligumi,
    g: { d1Apliekamie: sk(g.d1Apliekamie), d1Ieturetais: sk(g.d1Ieturetais), citiNodokli: sk(g.citiNodokli), dzivibasIemaksas: sk(g.dzivibasIemaksas), attaisnotie: sk(g.attaisnotie),
      vsaoiDeklareta: g.vsaoiDeklareta === undefined || g.vsaoiDeklareta === '' ? (a.vsaoiAvots === 'atzimes' && Math.abs(a.vsaoi - a.vsaoiAprekinata) > 0.005 ? a.vsaoi : '') : sk(g.vsaoiDeklareta) },
    samaksas: [1, 2, 3, 4].map((c) => { const at = dati.samaksas?.[ceturksnaAtslega(gads, c)]; if (!at) return '';
      return `iesniegts ${naudaLv(Number(at.zinots) || 0)} €${(at.maksajumi || []).map((m) => `; samaksāts ${naudaLv(m.summa)} € ${datumsLv(m.datums)}`).join('')}`; }) });
  lejupieladet(`gramatvediba-parskats-${gads}.xlsx`, fails, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  saglabatDrive([String(gads), 'Atskaites'], `gramatvediba-parskats-${gads}.xlsx`, fails, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .then((j) => j && toast('Pārskats saglabāts arī Google Drive mapē Atskaites')).catch((e) => toast(e.message));
  toast('Pārskats lejupielādēts');
}

// ---------- Pasūtītāja izvēlne ----------
/** Kas pasūtītājam trūkst rēķinam. Hanzas Perons blankā viņu rekvizīti jau ir, tāpēc tur vajag tikai nosaukumu un reģ. nr. */
function trukstRekviziti(p) {
  const t = [];
  if (!p.nosaukums) t.push('nosaukums'); if (!p.regNr) t.push('reģistrācijas nr.');
  if (p.veidne !== 'hanzas') { if (!p.adrese?.iela && !p.adrese?.pilseta) t.push('adrese'); if (!p.konts) t.push('konta numurs'); }
  return t;
}
function pasutitajaIzvele(name, izveleta) {
  const lietojums = (x) => (x.biezums || 0) + dati.rekini.filter((r) => r.pasutitajsId === x.id).length + dati.autorligumi.filter((l) => l.pasutitajsId === x.id).length;
  const opcijas = [...dati.pasutitaji].sort((a, b) => lietojums(b) - lietojums(a) || a.nosaukums.localeCompare(b.nosaukums, 'lv'));
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
      <label>Valsts<input data-p="valsts" value="LV"></label><label>Konta numurs<input data-p="konts"></label><label>Banka (ja ir)<input data-p="banka"></label><label>Bankas kods (ja ir)<input data-p="bic"></label><label>E-pasts<input data-p="epasts"></label>
      <label>Rēķina veidne<select data-p="veidne"><option value="standarta">Mana veidne</option><option value="hanzas">Hanzas Perons paraugs</option></select></label>
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
    if (!r.banka && r.bic) r.banka = bankasNosaukums(r.bic);
    for (const k of ['nosaukums', 'regNr', 'iela', 'pilseta', 'indekss', 'valsts', 'epasts', 'konts', 'banka', 'bic']) $(`[data-p="${k}"]`, el).value = r[k];
    toast(r.regNr ? 'Sadalīts. Pārbaudi laukus.' : 'Reģistrācijas numurs netika atrasts. Ievadi to ar roku.');
  };
}
/** pilni: rēķinam vajag visus rekvizītus; līgumam pietiek ar nosaukumu un reģ. nr. */
function nolasitPasutitaju(el, { pilni = true } = {}) {
  const sel = $('[data-pasutitajs]', el);
  if (sel.value !== '__jauns') return sel.value;
  const v = (k) => $(`[data-p="${k}"]`, el);
  const p = { id: uid(), nosaukums: v('nosaukums').value.trim(), regNr: v('regNr').value.trim(),
    adrese: { iela: v('iela').value.trim(), pilseta: v('pilseta').value.trim(), indekss: v('indekss').value.trim(), valsts: v('valsts').value.trim() || 'LV' },
    epasts: v('epasts').value.trim(), konts: v('konts').value.replace(/\s/g, ''), banka: v('banka').value.trim(), bic: v('bic').value.trim().toUpperCase(), veidne: v('veidne').value, budzetaIestade: v('budzetaIestade').checked };
  const t = pilni ? trukstRekviziti(p) : [!p.nosaukums && 'nosaukums', !p.regNr && 'reģistrācijas nr.'].filter(Boolean);
  if (t.length) { toast(`Pasūtītājam jānorāda: ${t.join(', ')}.`); return null; }
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
  const tagad = gads >= gadsNo(sod), sod_ = sod;
  const irEds = !!(g.vidDekl || ['d1Apliekamie', 'd1Ieturetais', 'citiNodokli', 'dzivibasIemaksas', 'attaisnotie'].some((k) => g[k] !== undefined && g[k] !== ''));
  const parada = x.atlikums < -0.005;
  const zimeIin = x.iin < 0 ? `atmaksa ${naudaLv(-x.iin)}` : naudaLv(x.iin);
  const kopsavilkums = `<div class="tbl" style="margin:10px 0"><table><tbody>
      <tr><td>VSAOI (ceturkšņa ziņojumi)</td><td class="n">${naudaLv(a.vsaoi)} €</td></tr>
      <tr><td>IIN pēc deklarācijas${irEds ? '' : ' (aplēse)'}</td><td class="n">${zimeIin} €</td></tr>
      <tr><td>${x.pecAtzimem ? 'Samaksāts (pēc tavām atzīmēm)' : 'Samaksāts (pēc bankas izrakstiem)'}</td><td class="n">−${naudaLv(x.samaksats)} €</td></tr>
    </tbody></table></div>`;
  const atzRinda = (kods, nos, termins, aprek, saite) => {
    const at = dati.samaksas?.[kods], sam = samaksatsAtzimei(at), mainits = at && Math.abs((Number(at.zinots) || 0) - aprek) > 0.005;
    const stat = at ? `<span class="tag ok">${aprek < 0 ? 'iesniegts' : 'samaksāts'}</span> ${sam ? `${naudaLv(Math.abs(sam))} € ${(at.maksajumi || []).map((m) => datumsLv(m.datums)).join(', ')}` : ''}${mainits ? ' <span class="tag warn">aprēķins mainījies</span>' : ''}`
      : `<span class="tag ${termins < sod_ && Math.abs(aprek) > 0.005 ? 'warn' : ''}">${termins < sod_ && Math.abs(aprek) > 0.005 ? 'nav atzīmēts' : 'gaida'}</span>`;
    return `<tr><td>${nos}</td><td>${datumsLv(termins)}</td><td class="n">${aprek < 0 ? `atmaksa ${naudaLv(-aprek)}` : naudaLv(aprek)}</td><td>${stat} <button class="link" ${saite}>${at ? 'atvērt' : 'atzīmēt'}</button></td></tr>`;
  };
  const sal = x.atz.length ? salidzinatSamaksas(x.atz, x.bankas) : null;
  const STAT = { sakrit: '<span class="tag ok">✓ atrasts izrakstā</span>', 'nav-izraksta': '<span class="tag">nav izrakstā</span>', 'nav-atzimets': '<span class="tag warn">nav atzīmēts</span>' };
  v.innerHTML = `<h2>Pārskats</h2><div class="row" style="margin-bottom:14px">${gaduIzvele('pg', gads)}</div>${provBaneris(gads)}
  <div class="grid2">
    <div class="panel"><p class="note" style="margin:0">${tagad ? `Par ${gads}. gadu nodokļiem jāpietur` : `Atlikums ar VID par ${gads}. gadu`}</p>
      <div class="big"><span class="hl">${x.norekinats ? 'norēķināts' : `${naudaLv(Math.abs(x.atlikums))} €`}</span></div>
      ${x.norekinats ? `<p class="note">Tu atzīmēji ${datumsLv(x.norekinats.datums)}, ka ar VID par šo gadu viss ir norēķināts (EDS nodokļu parāds 0,00). <button class="link" data-nenorek="${gads}">atcelt</button></p>` : parada ? '<p class="note"><b>VID ir parādā tev</b>: pārmaksa vai IIN atmaksa.</p>' : ''}
      ${kopsavilkums}
      ${a.vsaoiAvots === 'deklaracija' && Math.abs(a.vsaoi - a.vsaoiAprekinata) > 0.005 ? `<p class="note">VSAOI ņemta no iesniegtajiem ziņojumiem (deklarācijas D06 rinda). Pēc rīka aprēķina būtu ${naudaLv(a.vsaoiAprekinata)} €.</p>` : ''}
      ${x.norekinats && a.d.r25 > 0 ? `<p class="note">Pēc deklarācijas pienākas IIN atmaksa ${naudaLv(a.d.r25)} €. Ja tā vēl nav saņemta, tā nāks papildus.</p>` : ''}
      ${!x.norekinats && !x.pecAtzimem && x.atlikums > 0.5 && !tagad ? `<p class="note"><span class="tag warn">pārbaudi</span> Bankas izrakstos nav atrasti maksājumi par ${naudaLv(x.atlikums)} €. Tas vēl nenozīmē parādu: VID var būt ieskaitījis pārmaksu, vai maksāts no konta, kura izraksts nav ielādēts. Atver EDS → Vienotais nodokļu konts. Ja „Nodokļu parāds” ir 0,00, <button class="link" data-norek="${gads}">atzīmē, ka ar VID viss norēķināts</button>.</p>` : ''}
      ${!x.norekinats && x.pecAtzimem && x.atlikums > 0.5 && !tagad ? `<p class="note"><span class="tag warn">pārbaudi</span> Pēc tavām atzīmēm par šo gadu vēl nav samaksāti ${naudaLv(x.atlikums)} €. Ja EDS vienotajā nodokļu kontā „Nodokļu parāds” ir 0,00, <button class="link" data-norek="${gads}">atzīmē, ka viss norēķināts</button>.</p>` : ''}
      ${irEds ? '' : `<p class="note">IIN ir aplēse${tagad ? ' pēc līdz šim saņemtajiem ienākumiem' : ''}: precīzāka, ja sadaļā „Gada deklarācija” ielādē VID deklarācijas XML.</p>`}
      ${tagad && iepr && !iepr.norekinats && iepr.atlikums > 0.5 ? `<p class="note"><span class="tag warn">uzmanību</span> Par ${gads - 1}. gadu pēc rīka datiem nav samaksāti ${naudaLv(iepr.atlikums)} €. <button class="link" data-iepr>Apskatīt ${gads - 1}. gadu</button></p>` : ''}</div>
    <div class="panel"><h3 style="margin-top:0">Tuvākie termiņi</h3>${nakamie.map((t) => `<p style="margin:6px 0"><b>${datumsLv(t.d)}</b> ${h(t.t)}${t.s ? ` · ${naudaLv(t.s)} €` : ''}</p>`).join('') || '<p class="note">Šim gadam termiņu vairs nav.</p>'}</div>
  </div>
  <h3>Nodokļu maksājumi par ${gads}. gadu</h3>
  <div class="tbl"><table><thead><tr><th></th><th>Termiņš</th><th class="n">Aprēķināts, €</th><th>Statuss</th></tr></thead><tbody>
    ${[1, 2, 3, 4].map((c) => atzRinda(ceturksnaAtslega(gads, c), `${c}. ceturkšņa VSAOI`, termini(gads, c).samaksat, a.q[c - 1].jaMaksa, `data-uzcet="${c}"`)).join('')}
    ${atzRinda(iinAtslega(gads), 'IIN pēc gada deklarācijas', `${gads + 1}-06-23`, x.iin, 'data-uzdekl')}
  </tbody></table></div>
  <p class="note">Kad esi iesniedzis ziņojumu EDS un samaksājis, atzīmē to ceturkšņa ziņojumā vai gada deklarācijā. Tad nodokļu konta izraksts ikdienā nav vajadzīgs: rīks zina, kas samaksāts.</p>
  ${sal ? `<h3>Pārbaude pret bankas izrakstu</h3><div class="tbl"><table><thead><tr><th>Datums</th><th>Par ko</th><th class="n">Atzīmēts, €</th><th class="n">Izrakstā, €</th><th></th></tr></thead><tbody>
    ${sal.rindas.map((r) => `<tr><td>${datumsLv(r.maksajums?.datums || r.banka.datums)}</td><td>${h(r.atzime?.nosaukums || r.banka.info || 'maksājums VID')}</td><td class="n">${r.maksajums ? naudaLv(r.maksajums.summa) : ''}</td><td class="n">${r.banka ? `${naudaLv(r.banka.summa)}${r.banka.datums !== r.maksajums?.datums ? `<br><span class="note">${datumsLv(r.banka.datums)}</span>` : ''}` : ''}</td><td>${STAT[r.statuss]}${r.banka?.arRoku ? ` <button class="link" data-dzv="${h(r.banka.arhivaKods)}">dzēst</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="note">„Nav izrakstā” ir normāli, ja nodokļu konta izraksts par to laiku nav ielādēts. „Nav atzīmēts”: maksājums VID izrakstā ir, bet tu to neesi atzīmējis; ja tas ir par citu gadu, sadaļā „Banka” pie tā izvēlies gadu. Galīgā pārbaude ir EDS vienotajā nodokļu kontā: „Nodokļu parāds” jābūt 0,00.</p>`
    : x.bankas.length ? `<h3>Maksājumi VID bankas izrakstos par ${gads}. gadu</h3><div class="tbl"><table><thead><tr><th>Datums</th><th class="n">Summa</th><th>Avots</th><th></th></tr></thead><tbody>
    ${x.bankas.map((d) => `<tr><td>${datumsLv(d.datums)}</td><td class="n">${naudaLv(d.summa)}</td><td>${d.arRoku ? 'ievadīts ar roku' : h(kontaNosaukums(d.konts) || 'bankas izraksts')}</td><td>${d.arRoku ? `<button class="link" data-dzv="${h(d.arhivaKods)}">Dzēst</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
  <h3>${gads}. gada ienākumi un cik no katra atlikt</h3>
  ${atlikt.length ? `<div class="tbl"><table><thead><tr><th>Datums</th><th>Maksātājs</th><th class="n">Summa</th><th class="n">Atlikt nodokļiem</th></tr></thead><tbody>
    ${atlikt.map((e) => `<tr><td>${datumsLv(e.datums)}</td><td class="wrap">${h(e.partneris)}</td><td class="n">${naudaLv(e.summa)}</td><td class="n">${naudaLv(e.atlikt)}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="note">Šajā gadā nav apstiprinātu ienākumu. Ielādē bankas izrakstu sadaļā „Banka”.</p>'}
  <p class="note">Neapmaksāti rēķini: ${neapm.length}. Nākamais rēķina numurs: ${dati.profils.nakamaisNr}.</p>`;
  $('#pg').onchange = (e) => { parskGads = Number(e.target.value); radit(); };
  $$('[data-uzcet]').forEach((b) => b.onclick = () => { izvGads = gads; izvCet = Number(b.dataset.uzcet); location.hash = '#ceturksnis'; });
  $$('[data-uzdekl]').forEach((b) => b.onclick = () => { deklGads = gads; location.hash = '#deklaracija'; });
  $$('[data-iepr]').forEach((b) => b.onclick = () => { parskGads = gads - 1; radit(); });
  $$('[data-norek]').forEach((b) => b.onclick = () => { dati.samaksas ??= {}; dati.samaksas[norekinatsAtslega(Number(b.dataset.norek))] = { datums: sodien() }; saglabatUnRadit('Atzīmēts: ar VID viss norēķināts'); });
  $$('[data-nenorek]').forEach((b) => b.onclick = () => { delete dati.samaksas[norekinatsAtslega(Number(b.dataset.nenorek))]; saglabatUnRadit('Atzīme noņemta'); });
  $$('[data-dzv]').forEach((b) => b.onclick = () => { dati.darijumi = dati.darijumi.filter((d) => d.arhivaKods !== b.dataset.dzv); saglabatUnRadit('Maksājums dzēsts'); });
}

// ---------- Rēķini ----------
let rekinaForma = null;
let rekFiltrs = { teksts: '', pasutitajsId: '', no: '', lidz: '' };
const rekinaRinda = (r) => { const p = pasutitajs(r.pasutitajsId), st = rekinaStatuss(r);
    const tags = st.pilniba ? `<span class="tag ok">${r.samaksatsCitur && !st.samaksats ? 'apmaksāts citā kontā' : 'apmaksāts'}</span>` : st.daleji ? `<span class="tag warn">daļēji, atlikums ${naudaLv(st.atlikums)}</span>` : r.termins < sodien() ? '<span class="tag warn">kavēts</span>' : '<span class="tag">gaida</span>';
    return `<tr><td>${h(rekinaNumursTeksts(r.nr, p.veidne))}</td><td>${datumsLv(r.datums)}</td><td class="wrap">${h(p.nosaukums)}${p.budzetaIestade ? ' <span class="tag">budžeta iestāde</span>' : ''}</td>
    <td class="n">${naudaLv(st.kopa)}</td><td>${tags}${r.nosutits ? `<div class="note" style="font-size:.78rem">nosūtīts ${datumsLv(r.nosutits)}</div>` : ''}</td>
    <td class="act"><div class="row"><button class="link" data-sutit="${r.id}" style="color:var(--ink);font-weight:600">✉ Sūtīt</button>${p.veidne === 'hanzas' ? `<button class="link" data-hanzas="${r.id}">Excel</button>` : `<button class="link" data-pdf="${r.id}">PDF</button><button class="link" data-xml="${r.id}">XML</button>`}${driveSaite(r.pdfDrive, 'PDF Drive')}${driveSaite(r.driveFails, p.veidne === 'hanzas' ? 'Excel Drive' : 'XML Drive')}<button class="link" data-labot="${r.id}">Labot</button>${st.samaksats === 0 && !r.samaksatsCitur ? `<button class="link" data-dzest="${r.id}">Dzēst</button>` : ''}</div></td></tr>`; };
function zimetRekinuTabulu() {
  const visi = [...dati.rekini].sort((a, b) => b.nr - a.nr), saraksts = filtretRekinus(visi, rekFiltrs), akt = filtrsAktivs(rekFiltrs);
  $('#rTab').innerHTML = `${akt ? `<p class="note" style="margin:0 0 8px">Atrasti ${saraksts.length} no ${visi.length} rēķiniem, kopā ${naudaLv(r2(saraksts.reduce((a, r) => a + rekinaKopsumma(r), 0)))} €. <button class="link" data-notirit>Notīrīt filtrus</button></p>` : ''}
  <div class="tbl"><table><thead><tr><th>Nr.</th><th>Datums</th><th>Pasūtītājs</th><th class="n">Summa</th><th>Statuss</th><th></th></tr></thead><tbody>
  ${saraksts.length ? saraksts.map(rekinaRinda).join('') : `<tr><td colspan="6" class="note">${akt ? 'Nekas netika atrasts.' : 'Rēķinu vēl nav.'}</td></tr>`}
  </tbody></table></div>`;
}
function skatsRekini(v) {
  const arRekiniem = [...new Set(dati.rekini.map((r) => r.pasutitajsId))].map(pasutitajs).filter((p) => p.id).sort((a, b) => a.nosaukums.localeCompare(b.nosaukums, 'lv'));
  if (rekFiltrs.pasutitajsId && !arRekiniem.some((p) => p.id === rekFiltrs.pasutitajsId)) rekFiltrs.pasutitajsId = '';
  v.innerHTML = `<h2>Rēķini</h2><p class="lead">Katram rēķinam tiek sagatavots PDF un e-rēķins XML formātā. Numerācija ir automātiska un viena visiem pasūtītājiem.</p>
  ${rekinaForma ? rekinaRedaktors() : '<p><button class="primary" id="jauns">+ Jauns rēķins</button></p>'}
  ${dati.rekini.length ? `<div class="panel grid" id="rFiltri" style="margin-top:16px">
    <label style="grid-column:span 2">Meklēt pozīcijās<input type="search" id="fTeksts" value="${h(rekFiltrs.teksts)}" placeholder="piem. Ziemassvētku animācija" autocomplete="off"></label>
    <label>Pasūtītājs<select id="fPas"><option value="">Visi</option>${arRekiniem.map((p) => `<option value="${p.id}" ${p.id === rekFiltrs.pasutitajsId ? 'selected' : ''}>${h(p.nosaukums)}</option>`).join('')}</select></label>
    <label>No${datumaLauks('fNo', rekFiltrs.no)}</label><label>Līdz${datumaLauks('fLidz', rekFiltrs.lidz)}</label></div>` : ''}
  <div id="rTab" style="margin-top:16px"></div>`;
  zimetRekinuTabulu();
  const atrast = (id) => dati.rekini.find((r) => r.id === id);
  if ($('#jauns')) $('#jauns').onclick = () => { rekinaForma = { pozicijas: [{ nosaukums: '', daudzums: 1, cena: '' }] }; radit(); };
  if ($('#rFiltri')) {
    piesaistitDatumus($('#rFiltri'));
    $('#fTeksts').oninput = (e) => { rekFiltrs.teksts = e.target.value; zimetRekinuTabulu(); };
    $('#fPas').onchange = (e) => { rekFiltrs.pasutitajsId = e.target.value; zimetRekinuTabulu(); };
    for (const [k, n] of [['no', 'fNo'], ['lidz', 'fLidz']]) $(`#rFiltri [name="${n}"]`).addEventListener('change', (e) => { rekFiltrs[k] = e.target.value; zimetRekinuTabulu(); });
  }
  $('#rTab').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if ('notirit' in d) { rekFiltrs = { teksts: '', pasutitajsId: '', no: '', lidz: '' }; radit(); }
    else if (d.pdf) lejupieladetPdf(atrast(d.pdf));
    else if (d.xml) lejupieladetXml(atrast(d.xml));
    else if (d.hanzas) lejupieladetHanzas(atrast(d.hanzas));
    else if (d.sutit) sutitRekinu(atrast(d.sutit));
    else if (d.labot) { const r = atrast(d.labot); rekinaForma = { ...r, labo: r.id, pozicijas: r.pozicijas.map((p) => ({ ...p })) }; radit(); window.scrollTo({ top: 0 }); }
    else if (d.dzest) { const id = d.dzest;
    const r = atrast(id), pedejais = r.nr === dati.profils.nakamaisNr - 1;
    if (!confirm(`Dzēst rēķinu ${rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne)}?${pedejais ? ' Numurs tiks atbrīvots nākamajam rēķinam.' : ' Numerācijā paliks iztrūkums, jo pēc tā jau ir izrakstīti citi rēķini.'}`)) return;
    dati.rekini = dati.rekini.filter((q) => q.id !== r.id); if (pedejais) dati.profils.nakamaisNr = r.nr;
    saglabatUnRadit('Rēķins dzēsts');
    }
  };
  if (rekinaForma) piesaistitRedaktoru();
}
function rekinaRedaktors() {
  const f = rekinaForma, d = f.datums || sodien(), labo = !!f.labo;
  return `<form class="panel" id="rf"><h3 style="margin-top:0">${labo ? `Labot rēķinu ${h(rekinaNumursTeksts(f.nr, pasutitajs(f.pasutitajsId).veidne))}` : `Jauns rēķins ${h('#' + dati.profils.nakamaisNr)}`}</h3>
  ${labo ? '<p class="note">Ja rēķins jau ir nosūtīts pasūtītājam, pēc labošanas nosūti viņam arī jauno versiju.</p>' : ''}
  <div class="grid">${pasutitajaIzvele('pas', f.pasutitajsId)}
    <label>Datums${datumaLauks('datums', d, { obligats: true })}</label>
    <label>Apmaksas termiņš<span class="note" id="terminsTeksts" style="padding:9px 0">${datumsTeksts(pieskaititDienas(d, TERMINA_DIENAS))} (${TERMINA_DIENAS} dienas)</span></label>
    <label>Valoda<select name="valoda"><option value="lv">Latviešu</option><option value="en" ${f.valoda === 'en' ? 'selected' : ''}>Angļu</option></select></label>
    <label>Līguma nr. (ja ir)<input name="ligumaNr" value="${h(f.ligumaNr || '')}"></label>
    <label>Periods no (Hanzas Perons: obligāti)${datumaLauks('no', f.periods?.no || '')}</label><label>Periods līdz${datumaLauks('lidz', f.periods?.lidz || '')}</label>
    ${veidaIzvele('veids', f.veids)}
  </div>
  <h3>Pozīcijas</h3><div id="poz">${f.pozicijas.map((p, i) => `<div class="poz">
    <label>Nosaukums<textarea name="pn${i}" rows="2" required>${h(p.nosaukums)}</textarea></label><label>Daudzums<input name="pd${i}" inputmode="decimal" value="${h(p.daudzums)}"></label>
    <label>Cena, €<input name="pc${i}" inputmode="decimal" value="${h(p.cena)}"></label><button type="button" class="link" data-dzest-poz="${i}" ${f.pozicijas.length < 2 ? 'disabled' : ''}>Dzēst</button></div>`).join('')}</div>
  <div class="row"><button type="button" id="pozPlus">+ Pozīcija</button><button type="button" id="frazes">Ievietot autordarba frāzi</button></div>
  <p class="note">Rēķinā: „Rēķins sagatavots elektroniski un ir derīgs bez paraksta”, summa vārdiem un tavs logo tiek pievienoti automātiski.</p>
  <div class="row"><button class="primary" type="submit">${labo ? 'Saglabāt izmaiņas' : 'Saglabāt rēķinu'}</button><button type="button" id="atcelt">Atcelt</button></div></form>`;
}
function piesaistitRedaktoru() {
  const form = $('#rf'); piesaistitPasutitajaIzveli(form);
  const pozicijas = () => rekinaForma.pozicijas.map((_, i) => ({ nosaukums: form[`pn${i}`].value.trim(), daudzums: sk(form[`pd${i}`].value) || 1, cena: sk(form[`pc${i}`].value) }));
  // Saglabā formā jau ievadīto, lai pārzīmēšana neko neizdzēš
  form.datums.addEventListener('change', () => { if (form.datums.value) $('#terminsTeksts').textContent = `${datumsTeksts(pieskaititDienas(form.datums.value, TERMINA_DIENAS))} (${TERMINA_DIENAS} dienas)`; });
  const paturet = () => Object.assign(rekinaForma, { pasutitajsId: form.pas.value, datums: form.datums.value, valoda: form.valoda.value, ligumaNr: form.ligumaNr.value,
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
    { const t = trukstRekviziti(pasutitajs(pasId)); if (t.length) { toast(`Pasūtītājam trūkst: ${t.join(', ')}. Papildini sadaļā „Iestatījumi” → Pasūtītāji → Labot.`); return; } }
    if (pasutitajs(pasId).veidne === 'hanzas' && (!form.no.value || !form.lidz.value)) { toast('Hanzas Perons rēķinam norādi pakalpojuma periodu (no un līdz), kā pieņemšanas-nodošanas aktā.'); return; }
    if (pasutitajs(pasId).veidne === 'hanzas' && dati.hanzasBlanka?.pozicijuRindas && poz.length > dati.hanzasBlanka.pozicijuRindas) {
      toast(`Hanzas Perons rēķina paraugā ir vieta ${dati.hanzasBlanka.pozicijuRindas} pozīcijai. Apvieno pozīcijas vienā.`); return; }
    if (!form.datums.value) { toast('Ievadi rēķina datumu formā dd.mm.gggg'); return; }
    const lauki = { datums: form.datums.value, termins: pieskaititDienas(form.datums.value, TERMINA_DIENAS), pasutitajsId: pasId, valoda: form.valoda.value, ligumaNr: form.ligumaNr.value.trim(),
      periods: form.no.value && form.lidz.value ? { no: form.no.value, lidz: form.lidz.value } : null, veids: form.veids.value, pozicijas: poz };
    const p = pasutitajs(pasId);
    if (rekinaForma.labo) { Object.assign(dati.rekini.find((r) => r.id === rekinaForma.labo), lauki, { driveGaida: true }); rekinaForma = null; saglabatUnRadit('Izmaiņas saglabātas'); return; }
    dati.rekini.push({ id: uid(), nr: dati.profils.nakamaisNr, ...lauki, driveGaida: true }); dati.profils.nakamaisNr += 1; rekinaForma = null;
    saglabatUnRadit(p.veidne === 'hanzas' ? 'Rēķins saglabāts. Lejupielādē to ar pogu „Excel”.'
      : p.budzetaIestade ? 'Rēķins saglabāts. Budžeta iestādei sūti e-rēķinu (XML) caur e-adresi.' : 'Rēķins saglabāts');
  };
}
function rekinaXml(r) {
  const p = pasutitajs(r.pasutitajsId), pr = dati.profils, nr = rekinaNumursId(r.nr, p.veidne);
  return { nr, xml: eRekinsXml({ numurs: nr, datums: r.datums, termins: r.termins, ligumaNr: r.ligumaNr, periods: r.periods,
    pardevejs: { nosaukums: pr.vards, regNr: pr.personasKods, adrese: pr.adrese, epasts: pr.epasts },
    pircejs: { nosaukums: p.nosaukums, regNr: p.regNr, adrese: p.adrese, epasts: p.epasts }, pozicijas: r.pozicijas, iban: pr.iban, bic: pr.bic }) };
}
function lejupieladetXml(r) {
  const p = pasutitajs(r.pasutitajsId), { nr, xml } = rekinaXml(r);
  lejupieladet(`e-rekins-${nr}.xml`, xml, 'application/xml');
  if (p.budzetaIestade) toast('Augšupielādē šo XML latvija.lv e-adreses e-rēķinu formā: tad dati VID nonāk automātiski.');
}

const uzBase64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const noBase64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
async function lejupieladetHanzas(r) {
  if (!dati.hanzasBlanka?.fails) { toast('Vispirms ielādē Hanzas Perons rēķina paraugu sadaļā „Iestatījumi”.'); location.hash = '#iestatijumi'; return; }
  try {
    const x = await aizpilditBlanku(noBase64(dati.hanzasBlanka.fails), r, dati.profils);
    lejupieladet(blankasFailaVards(dati.profils.vards, r.datums, r.nr), x, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast('Hanzas Perons rēķins lejupielādēts');
  } catch (e) { toast(e.message); }
}

/** Rēķina fails sūtīšanai: Hanzas Perons — aizpildīta Excel blanka, pārējiem — PDF. */
async function rekinaSutamaisFails(r) {
  const p = pasutitajs(r.pasutitajsId);
  if (p.veidne !== 'hanzas') return rekinaPdfFails(r);
  if (!dati.hanzasBlanka?.fails) throw new Error('Vispirms ielādē Hanzas Perons rēķina paraugu sadaļā „Iestatījumi”.');
  return { nosaukums: blankasFailaVards(dati.profils.vards, r.datums, r.nr), saturs: await aizpilditBlanku(noBase64(dati.hanzasBlanka.fails), r, dati.profils),
    tips: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
/** E-pasta temats un teksts. */
function rekinaVestule(r) {
  const p = pasutitajs(r.pasutitajsId), nr = rekinaNumursTeksts(r.nr, p.veidne).replace(/^(#|Nr\.\s*)/, ''), summa = naudaLv(rekinaKopsumma(r)), vards = dati.profils.vards || '';
  const termins = datumsLv(r.termins).replace(/\.$/, '');
  return r.valoda === 'en'
    ? { temats: `Invoice No. ${nr}`, teksts: `Hello,\n\nPlease find attached invoice No. ${nr} for EUR ${summa}, due ${termins}.\n\nKind regards,\n${vards}` }
    : { temats: `Rēķins Nr. ${nr}`, teksts: `Labdien!\n\nPielikumā rēķins Nr. ${nr} par ${summa} EUR, apmaksas termiņš ${termins}.\n\nAr cieņu,\n${vards}` };
}
/** Rezerves ceļš bez Gmail: ierīces kopīgošanas izvēlne vai lejupielāde + e-pasta programma. */
async function kopigotVaiLejupieladet(fails, temats, teksts, epasts) {
  if (epasts) navigator.clipboard?.writeText(epasts).catch(() => {});
  if (navigator.canShare?.({ files: [fails] })) {
    try { await navigator.share({ files: [fails], title: temats, text: teksts }); return true; }
    catch (e) { if (e.name !== 'AbortError') toast('Neizdevās atvērt kopīgošanu'); return false; }
  }
  lejupieladet(fails.name, fails, fails.type);
  toast('Fails lejupielādēts — pievieno to e-pastam');
  return false;
}
/**
 * Sūtīšana no lietotāja Gmail (atļauja gmail.send). Logā var pārbaudīt un labot adresātu, tematu un tekstu.
 * Atļauju prasa tikai brīdī, kad spiež „Nosūtīt”; tā glabājas tikai atmiņā. Ja nav Google konfigurācijas, paliek kopīgošana.
 */
async function sutitRekinu(r) {
  const p = pasutitajs(r.pasutitajsId), { temats, teksts } = rekinaVestule(r), epasts = (p.epasts || '').trim(), konts = driveMeta().konts || dati.drive?.konts || '';
  gmail.sagatavot();
  const d = document.createElement('dialog'); d.className = 'dlg';
  d.innerHTML = `<h3 style="margin-top:0">✉ Sūtīt rēķinu ${h(rekinaNumursTeksts(r.nr, p.veidne))}</h3>
    ${r.nosutits ? `<p class="banner" style="margin:0 0 12px">Šis rēķins jau nosūtīts ${datumsLv(r.nosutits)}${r.nosutitsKam ? ` uz ${h(r.nosutitsKam)}` : ''}.</p>` : ''}
    <label>Kam<input type="email" data-k="kam" value="${h(epasts)}" placeholder="pasūtītāja e-pasts" autocomplete="off"></label>
    ${epasts ? '' : '<label class="check" style="margin-top:6px"><input type="checkbox" data-k="saglabat" checked> saglabāt adresi pasūtītāja kartītē</label>'}
    <label style="margin-top:10px">Temats<input data-k="temats" value="${h(temats)}"></label>
    <label style="margin-top:10px">Teksts<textarea data-k="teksts" rows="7">${h(teksts)}</textarea></label>
    <p class="row" style="margin:10px 0 0"><span class="note" data-st>Sagatavo pielikumu…</span><button class="link" data-k="apskatit" hidden>Apskatīt</button></p>
    <p class="row" style="margin:14px 0 0"><button class="primary" data-k="sutit" disabled>Nosūtīt no Gmail</button><button data-k="atcelt">Atcelt</button><button class="link" data-k="cits" disabled>Kopīgot vai lejupielādēt</button></p>
    <p class="note" data-k="info" style="font-size:.8rem;margin-bottom:0">Vēstule aizies no tava Gmail${konts ? ` (${h(konts)})` : ''} un būs redzama mapē „Nosūtītie”. Pirmo reizi Google prasīs atļauju sūtīt e-pastus: rīks var tikai sūtīt, lasīt tavu pastu tas nevar.</p>`;
  document.body.appendChild(d);
  const k = (x) => $(`[data-k="${x}"]`, d);
  let url = null, sutaPasreiz = false, neskaidrs = false;
  const beigt = () => { if (sutaPasreiz) return; if (url) setTimeout(() => URL.revokeObjectURL(url), 60_000); d.close(); d.remove(); };
  d.addEventListener('cancel', (e) => { e.preventDefault(); beigt(); });
  k('atcelt').onclick = beigt;
  d.showModal();
  let fails;
  try { const f = await rekinaSutamaisFails(r); fails = new File([f.saturs], f.nosaukums, { type: f.tips }); }
  catch (e) { $('[data-st]', d).textContent = e.message || 'Neizdevās sagatavot pielikumu'; return; }
  $('[data-st]', d).textContent = `Pielikums: ${fails.name}`;
  url = URL.createObjectURL(fails);
  k('apskatit').hidden = false;
  k('apskatit').onclick = () => { if (fails.type === 'application/pdf') window.open(url, '_blank', 'noopener'); else lejupieladet(fails.name, fails, fails.type); };
  k('cits').disabled = false;
  k('cits').onclick = async () => { if (await kopigotVaiLejupieladet(fails, k('temats').value, k('teksts').value, k('kam').value.trim())) { beigt(); r.nosutits = sodien(); saglabatUnRadit('Rēķins nodots e-pastam'); } };
  k('sutit').disabled = false;
  k('sutit').onclick = async () => {
    const kam = k('kam').value.trim();
    if (neskaidrs && !confirm('Iepriekšējā vēstule, iespējams, jau aizgāja. Vai tiešām sūtīt vēlreiz?')) return;
    if (!gmail.derigaAdrese(kam)) { toast('Ievadi derīgu saņēmēja e-pasta adresi (vienu).'); k('kam').focus(); return; }
    const poga = k('sutit'), st = $('[data-st]', d);
    sutaPasreiz = true; poga.disabled = true; k('atcelt').disabled = true;
    try {
      poga.textContent = 'Gaida Google atļauju…';
      const no = await gmail.atlauja(konts);
      poga.textContent = 'Sūta…';
      const vestule = gmail.sagatavotVestuli({ no: { vards: dati.profils.vards, epasts: no }, kam, temats: k('temats').value, teksts: k('teksts').value,
        fails: { nosaukums: fails.name, saturs: new Uint8Array(await fails.arrayBuffer()), tips: fails.type } });
      await gmail.nosutit(vestule);
      sutaPasreiz = false; beigt();
      r.nosutits = sodien(); r.nosutitsKam = kam;
      if (k('saglabat')?.checked && !p.epasts && dati.pasutitaji.includes(p)) p.epasts = kam;
      saglabatUnRadit(`Rēķins nosūtīts uz ${kam}`);
    } catch (e) {
      sutaPasreiz = false; poga.disabled = false; k('atcelt').disabled = false; poga.textContent = 'Nosūtīt no Gmail';
      if (e.kods === 'neskaidrs') {
        // Pieprasījums aizgāja, bet atbilde nepienāca: vēstule, iespējams, ir nosūtīta. Atkārtota sūtīšana tikai pēc apstiprinājuma.
        neskaidrs = true; poga.textContent = 'Sūtīt vēlreiz';
        st.innerHTML = `<span style="color:var(--warn)">${h(e.message)}</span> <button class="link" data-k="aizgaja" style="color:var(--ink);font-weight:600">Vēstule aizgāja — atzīmēt kā nosūtītu</button>`;
        k('aizgaja').onclick = () => { beigt(); r.nosutits = sodien(); r.nosutitsKam = kam; if (k('saglabat')?.checked && !p.epasts && dati.pasutitaji.includes(p)) p.epasts = kam; saglabatUnRadit('Atzīmēts kā nosūtīts'); };
      } else st.innerHTML = `<span style="color:var(--warn)">${h(e.message || 'Neizdevās nosūtīt.')}</span> Vēstule netika nosūtīta.`;
    }
  };
}

// ---------- Autorlīgumi ----------
function skatsLigumi(v) {
  v.innerHTML = `<h2>Autorlīgumi</h2><p class="lead">Ieraksti autorlīgumu, kad to paraksti. Kad maksājums ienāks bankā, rīks to atpazīs pēc līguma numura (vismaz 4 zīmes) vai pēc pasūtītāja un summas.</p>
  <form class="panel" id="lf"><div class="grid">${pasutitajaIzvele('pas')}
    <label>Līguma nr.<input name="nr" required></label><label>Datums${datumaLauks('datums', sodien())}</label>
    <label>Līguma summa, €<input name="summa" inputmode="decimal" required></label>${veidaIzvele('veids')}
    <label>Projekts (nav obligāts)<input name="projekts" placeholder="piem. Ziemassvētku animācija"></label>
    <label class="check"><input type="checkbox" name="ietur"> Izmaksātājs ietur visus nodokļus</label></div>
    <p class="row"><button class="primary" type="submit">Saglabāt līgumu</button></p></form>
  <div class="tbl" style="margin-top:16px"><table><thead><tr><th>Līgums</th><th>Projekts</th><th>Pasūtītājs</th><th>Datums</th><th class="n">Summa</th><th class="n">Saņemts</th><th>Veids</th><th></th></tr></thead><tbody>
  ${dati.autorligumi.map((a) => { const sam = samaksatsLigumam(a); return `<tr><td>${h(a.nr)}</td><td><input data-lproj="${a.id}" value="${h(a.projekts || '')}" placeholder="—" aria-label="Projekts" style="min-width:160px;min-height:34px;padding:4px 8px"></td><td class="wrap">${h(pasutitajs(a.pasutitajsId).nosaukums)}</td><td>${datumsLv(a.datums)}</td><td class="n">${naudaLv(a.summa)}</td><td class="n">${naudaLv(sam)}</td>
    <td>${h(DARBA_VEIDI[a.veids]?.nosaukums)}${a.izmaksatajsIetur ? ' <span class="tag">nodokļus ietur izmaksātājs</span>' : ''}</td><td><div class="row">${a.pdfDrive ? driveSaite(a.pdfDrive, 'PDF Drive') : `<label class="link" style="cursor:pointer;font-size:.9rem;color:var(--muted)" title="Saglabā parakstīto līgumu Google Drive mapē Līgumi">+ PDF Drive<input type="file" accept="application/pdf,.pdf" data-lpdf="${a.id}" hidden></label>`}${sam === 0 ? `<button class="link" data-dzl="${a.id}">Dzēst</button>` : ''}</div></td></tr>`; }).join('') || '<tr><td colspan="8" class="note">Līgumu vēl nav.</td></tr>'}
  </tbody></table></div>`;
  const f = $('#lf'); piesaistitPasutitajaIzveli(f);
  f.onsubmit = (e) => {
    e.preventDefault(); const summa = sk(f.summa.value);
    if (summa <= 0) { toast('Ievadi līguma summu'); return; }
    const pasId = nolasitPasutitaju(f, { pilni: false }); if (!pasId) return;
    dati.autorligumi.push({ id: uid(), nr: f.nr.value.trim(), pasutitajsId: pasId, datums: f.datums.value, summa, veids: f.veids.value, izmaksatajsIetur: f.ietur.checked, projekts: f.projekts.value.trim() });
    saglabatUnRadit('Līgums saglabāts');
  };
  $$('[data-lpdf]').forEach((el) => el.onchange = async () => {
    const a = dati.autorligumi.find((x) => x.id === el.dataset.lpdf), fl = el.files[0]; if (!fl) return;
    try { const f = await augsupieladetPdf(fl, [(a.datums || sodien()).slice(0, 4), 'Līgumi'], `Ligums_${slugs(a.nr)}_${slugs(pasutitajs(a.pasutitajsId).nosaukums)}.pdf`);
      if (f) { a.pdfDrive = f; saglabatUnRadit('Līgums saglabāts Google Drive'); } } catch (e) { toast(e.message); }
  });
  $$('[data-lproj]').forEach((el) => el.onchange = () => { const a = dati.autorligumi.find((x) => x.id === el.dataset.lproj); a.projekts = el.value.trim(); kess.sd = null; if (!saglabatDati()) toast('Neizdevās saglabāt pārlūkā'); else toast('Projekts saglabāts'); });
  $$('[data-dzl]').forEach((b) => b.onclick = () => { if (confirm('Dzēst šo līgumu?')) { dati.autorligumi = dati.autorligumi.filter((a) => a.id !== b.dataset.dzl); saglabatUnRadit('Līgums dzēsts'); } });
}

// ---------- Žurnāls ----------
let zurnGads = null;
function skatsZurnals(v) {
  zurnGads ??= gadsNo(sodien());
  const z = zurnals(sdIeraksti(), citiIeraksti(), zurnGads), irCiti = z.kopa.neieskaitits > 0, nauda = (x) => x === null || x === undefined ? '' : naudaLv(x);
  const kopRinda = (t, k) => `<tr class="kop"><td colspan="5"><b>${t}</b></td><td class="n"><b>${naudaLv(k.ienemumi)}</b></td><td class="n"><b>${naudaLv(k.nosacitie)}</b></td><td class="n"><b>${naudaLv(k.ienakums)}</b></td>${irCiti ? `<td class="n"><b>${k.neieskaitits ? naudaLv(k.neieskaitits) : ''}</b></td>` : ''}${irPoz ? '<td></td>' : ''}</tr>`;
  const cet = z.ceturksni.filter((c) => c.rindas.length), irPoz = cet.some((c) => c.rindas.some((e) => e.pozicija)), kol = 8 + (irCiti ? 1 : 0) + (irPoz ? 1 : 0);
  v.innerHTML = `<h2>Žurnāls</h2><p class="lead">Saimnieciskās darbības ieņēmumi un nosacītie izdevumi hronoloģiski, pēc apstiprinātajiem bankas maksājumiem. Ceturkšņu summas sakrīt ar ceturkšņa ziņojumu, gada summa ar D3.</p>
  <div class="row" style="margin-bottom:14px;align-items:flex-end">${gaduIzvele('zg', zurnGads)}<button id="zParskats">Pārskats grāmatvedim (Excel)</button></div>
  ${cet.length ? `<div class="tbl zurn-tbl"><table class="zurn"><thead><tr><th>Nr.</th><th>Datums</th><th>Maksātājs</th><th>Maksājuma mērķis</th><th>Veids</th><th class="n">Ieņēmumi</th><th class="n">Nosacītie izdevumi</th><th class="n">Ienākums</th>${irCiti ? '<th class="n" title="Nodokļus jau samaksāja izmaksātājs vai AKKA/LAA; nodokļu aprēķinā neiet">Nodokļi jau samaksāti</th>' : ''}${irPoz ? '<th>Pozīcija</th>' : ''}</tr></thead><tbody>
  ${cet.map((c, i) => `${i ? `<tr class="atstarpe"><td colspan="${kol}"></td></tr>` : ''}${c.rindas.map((e) => `<tr${e.sd ? '' : ' class="cits"'}><td>${e.nr}</td><td>${datumsLv(e.datums)}</td><td class="wrap">${h(e.partneris)}</td><td class="wrap">${h(e.info)}</td>
    <td style="white-space:nowrap">${e.sd ? `<span title="${h(e.veidaTeksts)}">${h(e.veids)}</span> <span class="note">· ${e.norma} %</span>` : `<span class="tag" title="${h(e.veidaTeksts)}">${e.veidaTeksts.startsWith('AKKA') ? 'AKKA/LAA' : 'ieturēja izmaksātājs'}</span>`}</td><td class="n">${nauda(e.ienemumi)}</td><td class="n">${nauda(e.nosacitie)}</td><td class="n">${nauda(e.ienakums)}</td>${irCiti ? `<td class="n">${nauda(e.neieskaitits)}</td>` : ''}${irPoz ? `<td class="wrap">${h(e.pozicija)}</td>` : ''}</tr>`).join('')}
  ${kopRinda(`${c.c}. ceturksnis kopā`, c.kopa)}`).join('')}
  <tr class="atstarpe"><td colspan="${kol}"></td></tr>${kopRinda(`${zurnGads}. gadā kopā`, z.kopa)}
  </tbody></table></div>
  ${irCiti ? '<p class="note">Kolonnā „Nodokļi jau samaksāti” ir ienākumi, no kuriem nodokļus jau samaksāja izmaksātājs vai AKKA/LAA. Tie redzami pilnībai, bet neietilpst ceturkšņa ziņojumos, D3 un summā „jāpietur”. Gada deklarācijā tie ir D1 lapā, ko EDS aizpilda pats.</p>' : ''}`
  : `<p class="note">${zurnGads}. gadā vēl nav apstiprinātu saimnieciskās darbības ieņēmumu. Ielādē bankas izrakstu sadaļā „Banka”.</p>`}`;
  $('#zg').onchange = (e) => { zurnGads = Number(e.target.value); radit(); };
  $('#zParskats').onclick = () => lejupieladetParskatu(zurnGads);
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
    ${sesija && r.rokuKods ? `<label class="check" style="margin-top:6px"><input type="checkbox" data-aizst="${atslega}" ${r.aizstat ? 'checked' : ''}> aizstāt ar roku ievadīto (neskaitīt divreiz)</label>` : ''}
    ${sesija && r.manuali && r.partneris ? `<label class="check"><input type="checkbox" data-atc="${atslega}" ${r.atcereties ? 'checked' : ''}> atcerēties šim maksātājam</label>` : ''}
    ${!sesija && r.partneris ? `<label class="check"><input type="checkbox" data-atcm="${atslega}" ${dati.maksataji?.[normalizetNosaukumu(r.partneris)] === r.kategorija ? 'checked' : ''}> atcerēties šim maksātājam</label>` : ''}`;
}
function piesaistitVadiklas(sakne, atrast, pecIzmainam) {
  $$('[data-kat]', sakne).forEach((el) => el.onchange = () => { const r = atrast(el.dataset.kat), veca = r.kategorija; r.kategorija = el.value;
    if (dati.darijumi.includes(r) && r.partneris && dati.maksataji?.[normalizetNosaukumu(r.partneris)] === veca) dati.maksataji[normalizetNosaukumu(r.partneris)] = r.kategorija;   // atcerētais maksātājs seko līdzi
    r.manuali = true; delete r.neatbilstiba; if (!AR_SAITI.has(r.kategorija)) delete r.saite; pecIzmainam(); });
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
  $$('[data-aizst]', sakne).forEach((el) => el.onchange = () => { atrast(el.dataset.aizst).aizstat = el.checked; saglabatSesiju(); });
  $$('[data-atcm]', sakne).forEach((el) => el.onchange = () => {
    const r = atrast(el.dataset.atcm), k = normalizetNosaukumu(r.partneris); dati.maksataji ??= {};
    if (el.checked) dati.maksataji[k] = r.kategorija; else if (dati.maksataji[k] === r.kategorija) delete dati.maksataji[k];
    saglabatUnRadit(el.checked ? 'Rīks atcerēsies šo maksātāju' : 'Šis maksātājs vairs netiek atcerēts');
  });
}
const kontaNosaukums = (konts) => dati.konti?.[konts]?.nosaukums || (konts ? `konts …${String(konts).slice(-4)}` : '');
const rinduTabula = (rindas, sesija, atslega, arKontu = false) => `<div class="tbl"><table><thead><tr><th>Datums</th><th>Maksātājs</th><th>Informācija</th><th class="n">Summa</th><th>Kategorija</th>${sesija ? '' : '<th></th>'}</tr></thead><tbody>
  ${rindas.map((r, i) => `<tr><td>${datumsLv(r.datums)}${arKontu && r.konts ? `<br><span class="note" style="font-size:.78rem">${h(kontaNosaukums(r.konts))}</span>` : ''}</td><td class="wrap">${h(r.partneris)}${r.arRoku ? ` <span class="tag">ar roku${r.avots && AVOTI[r.avots] ? ' · ' + AVOTI[r.avots] : ''}</span>` : ''}</td><td class="wrap">${h(r.info)}${r.pamatojums ? `<br><span class="note">${h(r.pamatojums)}</span>` : ''}</td>
    <td class="n">${r.virziens === 'D' ? '−' : ''}${naudaLv(r.summa)}${r.valuta && r.valuta !== 'EUR' ? ' ' + h(r.valuta) : ''}</td><td>${vadiklas(r, atslega(r, i), sesija)}</td>
    ${sesija ? '' : `<td><button class="link" data-dzd="${h(r.arhivaKods)}">Dzēst</button></td>`}</tr>`).join('')}</tbody></table></div>`;

/** Izraksta periods un konts glabājas, lai redzētu, kuri konti un mēneši jau ielādēti. Vecākiem ierakstiem pieraksta kontu. */
function pierakstitIzrakstu(izr) {
  if (!izr?.konts || !izr.periods?.no || !izr.periods?.lidz) return;
  dati.izraksti ??= {};
  dati.izraksti[`${izr.konts}|${izr.periods.no}|${izr.periods.lidz}`] = { konts: izr.konts, no: izr.periods.no, lidz: izr.periods.lidz };
  const kodi = new Set(izr.darijumi.map((d) => d.arhivaKods));
  for (const d of dati.darijumi) if (!d.konts && !d.arRoku && kodi.has(d.arhivaKods)) d.konts = izr.konts;
}
const rokuSakrit = (a, b) => { const x = normalizetNosaukumu(a), y = normalizetNosaukumu(b); return !!x && (x === y || nosaukumiSakrit(a, b) || nosaukumiSakrit(b, a)); };
const saitesOpcijas = () => `<option value="">— bez rēķina vai līguma —</option>
  ${dati.rekini.filter((x) => !rekinaStatuss(x).pilniba).sort((a, b) => b.nr - a.nr).map((x) => `<option value="r:${x.id}">Rēķins ${h(rekinaNumursTeksts(x.nr, pasutitajs(x.pasutitajsId).veidne))} · ${h(pasutitajs(x.pasutitajsId).nosaukums)} · ${naudaLv(rekinaKopsumma(x))}</option>`).join('')}
  ${dati.autorligumi.map((a) => `<option value="a:${a.id}">Līgums ${h(a.nr)} · ${h(pasutitajs(a.pasutitajsId).nosaukums)}</option>`).join('')}`;
const saiteNoVertibas = (v) => { const [t, id] = String(v || '').split(':'); if (t === 'r') { const x = dati.rekini.find((q) => q.id === id); return x ? { tips: 'rekins', kods: id, nr: x.nr } : null; }
  if (t === 'a') { const a = dati.autorligumi.find((q) => q.id === id); return a ? { tips: 'autorligums', kods: id, nr: a.nr } : null; } return null; };

let bankFiltrs = { teksts: '', kategorija: '', virziens: '', konts: '', bezSaites: false, no: '', lidz: '' }, rokuForma = false;
function zimetDarijumuTabulu() {
  const el = $('#apst'); if (!el) return;
  const gada = dati.darijumi.filter((d) => !bankGads || gadsNo(d.datums) === bankGads).sort((a, b) => b.datums.localeCompare(a.datums));
  const sar = filtretDarijumus(gada, bankFiltrs, pozicijaDarijumam), akt = darijumuFiltrsAktivs(bankFiltrs);
  const sum = (v) => r2(sar.filter((d) => d.virziens === v && (!d.valuta || d.valuta === 'EUR')).reduce((a, d) => a + d.summa, 0));
  const arKontu = new Set(dati.darijumi.map((d) => d.konts).filter(Boolean)).size > 1;
  el.innerHTML = `<p class="note" style="margin:0 0 8px">${akt ? `Atlasīti ${sar.length} no ${gada.length} darījumiem` : `Darījumi: ${gada.length}`} · ienākošie <b>${naudaLv(sum('K'))} €</b>${sum('D') ? ` · izejošie ${naudaLv(sum('D'))} €` : ''}${akt ? ' <button class="link" data-bnotirit>Notīrīt filtrus</button>' : ''}</p>
    ${sar.length ? rinduTabula(sar, false, (r) => r.arhivaKods, arKontu) : `<p class="note">${akt ? 'Nekas netika atrasts.' : 'Šajā periodā nav apstiprinātu darījumu.'}</p>`}`;
  if (bankasSesija) $$('select', el).forEach((x) => { x.disabled = true; x.title = 'Vispirms apstiprini vai atmet ielādēto izrakstu'; });
  else piesaistitVadiklas(el, (k) => dati.darijumi.find((d) => d.arhivaKods === k), () => saglabatUnRadit('Saglabāts'));
  $$('[data-dzd]', el).forEach((b) => b.onclick = () => { if (confirm('Dzēst šo darījumu no rīka? Bankā tas paliek, un to var ielādēt no jauna.')) { dati.darijumi = dati.darijumi.filter((d) => d.arhivaKods !== b.dataset.dzd); saglabatUnRadit('Darījums dzēsts'); } });
  if ($('[data-bnotirit]', el)) $('[data-bnotirit]', el).onclick = () => { bankFiltrs = { teksts: '', kategorija: '', virziens: '', konts: '', bezSaites: false, no: '', lidz: '' }; radit(); };
}

function kontuPanelis() {
  const parkl = kontuParklajums(dati.izraksti), konti = [...new Set([...Object.keys(parkl), ...dati.darijumi.map((d) => d.konts).filter(Boolean)])].sort();
  const bezKonta = dati.darijumi.filter((d) => !d.konts && !d.arRoku).length;
  if (!konti.length) return bezKonta ? `<p class="note">Agrāk ielādētajiem izrakstiem konts nav saglabāts. Ielādē tos vēlreiz: dubultā nekas netiks pievienots, bet rīks redzēs, kuri konti un mēneši ir ielādēti.</p>` : '';
  return `<h3>Konti un ielādētie izraksti</h3><div class="tbl"><table><thead><tr><th>Konts</th><th>Nosaukums</th><th>Ielādēts</th></tr></thead><tbody>
    ${konti.map((k) => { const p = parkl[k]; return `<tr><td style="white-space:nowrap">${h(k)}</td><td><input data-knos="${h(k)}" value="${h(dati.konti?.[k]?.nosaukums || '')}" placeholder="piem. Ienākumu konts" style="min-width:160px"></td>
      <td>${p ? p.periodi.map((x) => `${datumsLv(x.no)} – ${datumsLv(x.lidz)}`).join('<br>') : '<span class="note">periods nav zināms</span>'}${p?.iztrukumi.length ? `<br><span class="tag warn">trūkst</span> <span class="note">${p.iztrukumi.map((x) => `${datumsLv(x.no)} – ${datumsLv(x.lidz)}`).join(', ')}</span>` : ''}</td></tr>`; }).join('')}
    </tbody></table></div>${bezKonta ? `<p class="note">${bezKonta} agrāk ielādētiem darījumiem konts nav zināms. Ja ielādēsi tos pašus izrakstus vēlreiz, rīks to pierakstīs (dubultā nekas netiks pievienots).</p>` : ''}`;
}

function rokuFormaHtml() {
  return `<form class="panel grid" id="rokuF"><h3 style="grid-column:1/-1;margin:0">Ienākums ar roku</h3>
    <p class="note" style="grid-column:1/-1;margin:0">Maksājumam, kura nav nevienā ielādētajā izrakstā: skaidrā naudā vai uz kontu, kura izrakstu neielādē. Ja vēlāk ielādēsi izrakstu ar šo pašu maksājumu, rīks piedāvās tos apvienot.</p>
    <label>Datums${datumaLauks('datums', sodien(), { obligats: true })}</label>
    <label>Maksātājs<input name="partneris" list="rokuPas" required autocomplete="off"><datalist id="rokuPas">${dati.pasutitaji.map((p) => `<option value="${h(p.nosaukums)}">`).join('')}</datalist></label>
    <label>Summa, €<input name="summa" inputmode="decimal" required></label>
    <label style="grid-column:span 2">Mērķis<input name="info" placeholder="piem. Rēķins Nr. 031"></label>
    <label>Kategorija<select name="kategorija">${['sd', 'nodokli-samaksaja-izmaksatajs', 'akka', 'personigs'].map((k) => `<option value="${k}">${KATEGORIJAS[k]}</option>`).join('')}</select></label>
    <label>Rēķins vai līgums<select name="saite">${saitesOpcijas()}</select></label>
    <label>Darba veids<select name="veids">${veidaOpcijas('90.13')}</select></label>
    <label>Kā samaksāts<select name="avots">${Object.entries(AVOTI).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
    <div class="row" style="grid-column:1/-1"><button class="primary" type="submit">Pievienot</button><button type="button" id="rokuAtcelt">Atcelt</button></div></form>`;
}

function skatsBanka(v) {
  const s = bankasSesija; bankGads ??= gadsNo(sodien()); saglabatSesiju();
  let saturs = `<h2>Banka</h2><p class="lead">Ielādē Swedbank izrakstus CSV formātā no visiem saviem kontiem. Rīks katru ienākošo maksājumu piesaista rēķinam, līgumam vai kategorijai. Ja nav pārliecināts, tas jautā tev. Pārskaitījumi starp taviem kontiem netiek skaitīti kā ienākumi.</p>
  <div class="panel row"><label style="flex:1">Izraksts (CSV)<input type="file" id="csv" accept=".csv,text/csv"></label>${rokuForma ? '' : '<button id="rokuJauns">+ Ienākums ar roku</button>'}</div>
  ${rokuForma ? rokuFormaHtml() : ''}`;
  if (s) {
    const ien = s.rindas.filter((r) => r.virziens === 'K'), jaizv = ien.filter((r) => r.kategorija === 'jaizverte').length;
    const bezEur = ien.filter((r) => r.citaValuta && AR_SAITI.has(r.kategorija) && !(r.summaEur > 0)).length;
    const kopa = r2(ien.filter((r) => !r.citaValuta).reduce((a, r) => a + r.summa, 0));
    const poga = `<p class="row" style="margin:12px 0"><button class="primary" data-apstiprinat ${jaizv || bezEur ? 'disabled' : ''}>Apstiprināt ${s.rindas.length} darījumus</button><button data-atmest>Atmest</button>
      ${jaizv ? `<span class="note">Vēl jāizvērtē: ${jaizv}</span>` : ''}${bezEur ? `<span class="note">Jāievada summa eiro: ${bezEur}</span>` : ''}</p>`;
    saturs += `<h3>Izraksts ${datumsLv(s.izraksts.periods.no)} – ${datumsLv(s.izraksts.periods.lidz)} · ${h(kontaNosaukums(s.izraksts.konts))} (${h(s.izraksts.konts)})</h3>
    <p class="note">Jauni darījumi: ${s.rindas.length}${s.jau ? `, jau ielādēti iepriekš: ${s.jau}` : ''}.
    ${s.jau ? '' : (Math.abs(kopa - s.izraksts.apgrozijums.K) < 0.005 ? `Ienākošo maksājumu kopsumma ${naudaLv(kopa)} € sakrīt ar bankas kredīta apgrozījumu ✓` : `<span class="tag warn">uzmanību</span> Ienākošo maksājumu kopsumma ${naudaLv(kopa)} € nesakrīt ar bankas kredīta apgrozījumu ${naudaLv(s.izraksts.apgrozijums.K)} €.`)}
    <b>Darījumi tiek saglabāti grāmatvedībā tikai pēc apstiprināšanas.</b>${s.atjaunots ? ' Šis ir iepriekš ielādētais, vēl neapstiprinātais izraksts: tavas izvēles ir saglabātas.' : ''}</p>
    ${s.rindas.length ? poga + rinduTabula(s.rindas, true, (_, i) => String(i)) + (s.rindas.length > 8 ? poga : '') : '<p class="row"><button data-atmest>Aizvērt</button></p>'}`;
  }
  // Rēķini bez pilna maksājuma
  const neapm = dati.rekini.filter((r) => !rekinaStatuss(r).pilniba), citur = dati.rekini.filter((r) => r.samaksatsCitur && !samaksatsRekinam(r));
  const kaveti = neapm.filter((r) => r.termins && r.termins < sodien() && !r.samaksatsCitur), parkl = kontuParklajums(dati.izraksti);
  saturs += `<h3>Rēķini bez atrasta maksājuma</h3>${neapm.length ? `<div class="tbl"><table><thead><tr><th>Nr.</th><th>Pasūtītājs</th><th class="n">Summa</th><th class="n">Saņemts</th><th>Samaksāts citā kontā</th></tr></thead><tbody>
    ${neapm.map((r) => { const st = rekinaStatuss(r); return `<tr><td>${h(rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne))}${r.termins && r.termins < sodien() ? ' <span class="tag warn">kavēts</span>' : ''}</td><td class="wrap">${h(pasutitajs(r.pasutitajsId).nosaukums)}</td><td class="n">${naudaLv(st.kopa)}</td><td class="n">${naudaLv(st.samaksats)}</td>
    <td>${st.samaksats === 0 ? `<div class="row">${datumaLauks('', '', { attr: `data-citur-d="${r.id}"`, stils: 'width:150px' })}<button class="link" data-citur="${r.id}">Atzīmēt</button></div>` : '<span class="note">daļēji apmaksāts bankā</span>'}</td></tr>`; }).join('')}</tbody></table></div>
    ${kaveti.length ? `<p class="note"><span class="tag warn">pārbaudi</span> ${kaveti.length === 1 ? 'Vienam rēķinam' : `${kaveti.length} rēķiniem`} apmaksas termiņš ir pagājis. Ja klients varēja maksāt uz citu kontu (piemēram, veco), ielādē tā izrakstu.${Object.keys(parkl).length ? ` Ielādēts līdz: ${Object.entries(parkl).map(([k, p]) => `${h(kontaNosaukums(k))} ${datumsLv(p.lidz)}`).join(', ')}` : ''}</p>` : ''}
    <p class="note">Atzīmē tikai tad, ja šī konta izrakstu rīkā neielādēsi. Ja vēlāk ielādēsi arī to, rīks izmantos bankas maksājumu un ienākumu neieskaitīs divreiz.</p>` : '<p class="note">Visiem rēķiniem maksājums ir atrasts.</p>'}
    ${citur.length ? `<p class="note">Atzīmēti kā samaksāti citā kontā: ${citur.map((r) => `${h(rekinaNumursTeksts(r.nr, pasutitajs(r.pasutitajsId).veidne))} (${datumsLv(r.samaksatsCitur.datums)}) <button class="link" data-necitur="${r.id}">atcelt</button>`).join(', ')}</p>` : ''}`;
  saturs += kontuPanelis();
  // Apstiprinātie darījumi: meklēšana, filtri, labošana
  const konti = [...new Set(dati.darijumi.map((d) => d.konts).filter(Boolean))].sort();
  if (bankFiltrs.konts && !konti.includes(bankFiltrs.konts)) bankFiltrs.konts = '';
  saturs += `<h3>Apstiprinātie darījumi</h3><p class="note">Šeit vari meklēt, mainīt kategoriju, piesaistīt maksājumu rēķinam vai izdzēst kļūdaini ielādētu darījumu.</p>
    <div class="panel grid" id="bFiltri">
      <label>Gads<select id="bg"><option value="0" ${!bankGads ? 'selected' : ''}>Visi gadi</option>${gaduSaraksts().map((g) => `<option ${g === bankGads ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label style="grid-column:span 2">Meklēt maksātājā vai mērķī<input type="search" id="bTeksts" value="${h(bankFiltrs.teksts)}" placeholder="piem. Dailes teātris" autocomplete="off"></label>
      <label>Kategorija<select id="bKat"><option value="">Visas</option>${Object.entries(FILTRA_KATEGORIJAS).map(([k, t]) => `<option value="${k}" ${k === bankFiltrs.kategorija ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Virziens<select id="bVirz">${[['', 'Visi'], ['K', 'Ienākošie'], ['D', 'Izejošie']].map(([k, t]) => `<option value="${k}" ${k === bankFiltrs.virziens ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${konti.length > 1 ? `<label>Konts<select id="bKonts"><option value="">Visi</option>${konti.map((k) => `<option value="${h(k)}" ${k === bankFiltrs.konts ? 'selected' : ''}>${h(kontaNosaukums(k))}</option>`).join('')}</select></label>` : ''}
      <label>No${datumaLauks('bNo', bankFiltrs.no)}</label><label>Līdz${datumaLauks('bLidz', bankFiltrs.lidz)}</label>
      <label class="check" style="align-self:end"><input type="checkbox" id="bBez" ${bankFiltrs.bezSaites ? 'checked' : ''}> tikai ienākumi bez rēķina vai līguma</label>
    </div><div id="apst" style="margin-top:12px"></div>`;
  v.innerHTML = saturs;
  zimetDarijumuTabulu();

  $('#csv').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const teksts = await f.text(), izraksts = nolasitSwedbankCsv(teksts), zin = zinamieDarijumi(dati.darijumi);
      const jauni = izraksts.darijumi.filter((d) => !zin(izraksts.konts, d.arhivaKods)), izmantoti = new Set();
      const rindas = klasificet(jauni, registrs()).filter((d) => d.virziens === 'K' || d.kategorija === 'vid-maksajums').map((d) => {
        const r = { ...d, manuali: d.kategorija === 'jaizverte', veids: '90.13' }, m = atrastRokuIerakstu(dati.darijumi, r, rokuSakrit, izmantoti);
        if (m) {
          izmantoti.add(m.arhivaKods); Object.assign(r, { rokuKods: m.arhivaKods, aizstat: true, kategorija: m.kategorija, veids: m.veids || '90.13', manuali: false,
            pamatojums: `tas pats maksājums, kas ievadīts ar roku ${datumsLv(m.datums)}` });
          if (m.saite) r.saite = m.saite; else delete r.saite;
          delete r.neatbilstiba;
        }
        return r;
      });
      bankasSesija = { izraksts, rindas, jau: izraksts.darijumi.length - jauni.length, teksts, faila: f.name };
      if (!rindas.length) { pierakstitIzrakstu(izraksts); saglabatDati(); }
      radit();
    } catch (err) { toast(err.message); }
  };
  // Filtri
  piesaistitDatumus($('#bFiltri'));
  $('#bg').onchange = (e) => { bankGads = Number(e.target.value); zimetDarijumuTabulu(); };
  $('#bTeksts').oninput = (e) => { bankFiltrs.teksts = e.target.value; zimetDarijumuTabulu(); };
  $('#bKat').onchange = (e) => { bankFiltrs.kategorija = e.target.value; zimetDarijumuTabulu(); };
  $('#bVirz').onchange = (e) => { bankFiltrs.virziens = e.target.value; zimetDarijumuTabulu(); };
  if ($('#bKonts')) $('#bKonts').onchange = (e) => { bankFiltrs.konts = e.target.value; zimetDarijumuTabulu(); };
  $('#bBez').onchange = (e) => { bankFiltrs.bezSaites = e.target.checked; zimetDarijumuTabulu(); };
  for (const [k, n] of [['no', 'bNo'], ['lidz', 'bLidz']]) $(`#bFiltri [name="${n}"]`).addEventListener('change', (e) => { bankFiltrs[k] = e.target.value; zimetDarijumuTabulu(); });
  // Konti
  $$('[data-knos]').forEach((el) => el.onchange = () => { dati.konti ??= {}; const t = el.value.trim();
    if (t) dati.konti[el.dataset.knos] = { nosaukums: t }; else delete dati.konti[el.dataset.knos]; saglabatUnRadit('Saglabāts'); });
  // Ienākums ar roku
  if ($('#rokuJauns')) $('#rokuJauns').onclick = () => { rokuForma = true; radit(); $('#rokuF [name=partneris]')?.focus(); };
  if ($('#rokuF')) {
    piesaistitDatumus($('#rokuF'));
    $('#rokuAtcelt').onclick = () => { rokuForma = false; radit(); };
    $('#rokuF [name=saite]').onchange = (e) => { const sa = saiteNoVertibas(e.target.value), f = $('#rokuF');
      if (sa?.tips === 'autorligums') { const a = dati.autorligumi.find((q) => q.id === sa.kods); f.kategorija.value = a.izmaksatajsIetur ? 'nodokli-samaksaja-izmaksatajs' : 'sd'; }
      if (sa?.tips === 'rekins') { const x = dati.rekini.find((q) => q.id === sa.kods); f.kategorija.value = 'sd'; if (!f.summa.value) f.summa.value = String(rekinaKopsumma(x)).replace('.', ','); if (!f.partneris.value) f.partneris.value = pasutitajs(x.pasutitajsId).nosaukums; if (!f.info.value) f.info.value = `Rēķins ${rekinaNumursTeksts(x.nr, pasutitajs(x.pasutitajsId).veidne)}`; } };
    $('#rokuF').onsubmit = (e) => {
      e.preventDefault(); const f = e.target, summa = r2(sk(f.summa.value)), sa = saiteNoVertibas(f.saite.value);
      if (!(summa > 0)) { toast('Ievadi summu'); return; }
      if (!f.datums.value) { toast('Ievadi datumu'); return; }
      const d = { arhivaKods: 'roku-' + uid(), datums: f.datums.value, partneris: f.partneris.value.trim(), info: f.info.value.trim(), summa, valuta: 'EUR', virziens: 'K',
        kategorija: f.kategorija.value, arRoku: true, avots: f.avots.value };
      if (sa && AR_SAITI.has(d.kategorija)) { d.saite = sa; const x = rekinsPecSaites(sa); if (x?.samaksatsCitur) delete x.samaksatsCitur; }
      if (d.kategorija === 'sd' && !d.saite) d.veids = f.veids.value;
      dati.darijumi.push(d); rokuForma = false; saglabatUnRadit('Ienākums pievienots');
    };
  }
  if (s) {
    piesaistitVadiklas(v, (i) => s.rindas[Number(i)] ?? {}, () => radit());
    $$('[data-atmest]').forEach((b) => b.onclick = () => { bankasSesija = null; radit(); });
    $$('[data-apstiprinat]').forEach((b) => b.onclick = () => {
      const konts = s.izraksts.konts;
      for (const r of s.rindas) {
        const ienakums = AR_SAITI.has(r.kategorija), rek = rekinsPecSaites(r.saite), kods = glabajamaisKods(dati.darijumi, konts, r.arhivaKods);
        const d = { arhivaKods: kods, datums: r.datums, partneris: r.partneris, info: r.info, summa: r.citaValuta && ienakums ? r.summaEur : r.summa, valuta: r.citaValuta && !ienakums ? r.valuta : 'EUR',
          virziens: r.virziens, kategorija: r.kategorija, konts };
        if (kods !== r.arhivaKods) d.bankasKods = r.arhivaKods;
        if (r.citaValuta) d.sakotneji = { summa: r.summa, valuta: r.valuta };
        if (ienakums && r.saite) d.saite = r.saite;
        if (r.kategorija === 'sd' && !d.saite) d.veids = r.veids || '90.13';
        if (r.virziens === 'D') {
          const dienas = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
          const roku = dati.darijumi.find((x) => x.arRoku && x.virziens === 'D' && Math.abs(x.summa - r.summa) < 0.005 && dienas(x.datums, r.datums) <= 3);
          d.nodokluGads = roku ? roku.nodokluGads : nodokluGads(r);
          if (roku) dati.darijumi = dati.darijumi.filter((x) => x !== roku);
        }
        if (r.rokuKods && r.aizstat) dati.darijumi = dati.darijumi.filter((x) => x.arhivaKods !== r.rokuKods);   // izraksta maksājums aizstāj ar roku ievadīto
        if (rek?.samaksatsCitur && ienakums) delete rek.samaksatsCitur;       // bankas maksājums ir noteicošais
        dati.darijumi.push(d);
        if (r.atcereties && r.partneris && r.kategorija !== 'jaizverte') dati.maksataji[normalizetNosaukumu(r.partneris)] = r.kategorija;
      }
      const izr = s.izraksts, csv = s.teksts;
      pierakstitIzrakstu(izr);
      bankasSesija = null; saglabatUnRadit('Darījumi apstiprināti un saglabāti');
      if (csv && izr.periods?.lidz) saglabatDrive([izr.periods.lidz.slice(0, 4), 'Bankas izraksti'], `Swedbank_${slugs(izr.konts)}_${izr.periods.no}_${izr.periods.lidz}.csv`, csv, 'text/csv')
        .then((j) => toast(j ? 'Izraksts saglabāts arī Google Drive' : 'Darījumi saglabāti. Izraksts Google Drive netika saglabāts, jo Drive nav pieslēgts.')).catch((e) => toast(e.message));
    });
  }
  $$('[data-citur]').forEach((b) => b.onclick = () => {
    const d = $(`[data-citur-d="${b.dataset.citur}"]`).value; if (!d) { toast('Norādi samaksas datumu'); return; }
    dati.rekini.find((r) => r.id === b.dataset.citur).samaksatsCitur = { datums: d }; saglabatUnRadit('Atzīmēts kā samaksāts citā kontā');
  });
  $$('[data-necitur]').forEach((b) => b.onclick = () => { delete dati.rekini.find((r) => r.id === b.dataset.necitur).samaksatsCitur; saglabatUnRadit('Atzīme noņemta'); });
}

// ---------- Atzīme „Iesniegts un samaksāts” ----------
/** Ceturkšņa ziņojumam vai gada deklarācijai. aprek: aprēķinātā summa (< 0: IIN atmaksa). */
function samaksasPanelis(kods, aprek, { kadMaksa, kadBez, labotLidz } = {}) {
  const at = dati.samaksas?.[kods], bezMaksas = aprek <= 0.005;
  const summaLauks = (v, nos = 'Samaksāts, €') => `<label>${nos}<input id="atzSumma" inputmode="decimal" value="${eds(v)}" style="width:120px"></label>`;
  const datLauks = `<label>Datums${datumaLauks('atzDat', sodien())}</label>`;
  if (!at) return `<div class="panel" id="atzP"><p style="margin-top:0"><b>${bezMaksas ? kadBez : kadMaksa}</b></p>
    <div class="row" style="align-items:flex-end">${bezMaksas ? '' : summaLauks(aprek)}${datLauks}<button class="primary" id="atzOk">${bezMaksas ? 'Iesniegts' : 'Iesniegts un samaksāts'}</button></div>
    <p class="note" style="margin-bottom:0">Ar šo atzīmi rīks zina, kas iesniegts un samaksāts, un nodokļu konta izraksts ikdienā nav vajadzīgs. Gada beigās to var pārbaudīt pret izrakstu sadaļā „Pārskats”.</p></div>`;
  const zin = Number(at.zinots) || 0, sam = samaksatsAtzimei(at), starp = r2(aprek - zin), maks = at.maksajumi || [];
  const sumT = (x) => x < 0 ? `atmaksa ${naudaLv(-x)} €` : `${naudaLv(x)} €`;
  const vest = maks.map((m) => `${m.summa < 0 ? 'atmaksa saņemta' : 'samaksāts'} ${naudaLv(Math.abs(m.summa))} € ${datumsLv(m.datums)}`).join('; ');
  let html = `<div class="panel" id="atzP"><p style="margin-top:0"><span class="tag ok">${zin > 0.005 ? 'iesniegts un samaksāts' : 'iesniegts'}</span> Iesniegtajā: ${sumT(zin)}${vest ? ` · ${vest}` : ''} <button class="link" id="atzAtcelt">atcelt atzīmi</button></p>`;
  if (Math.abs(starp) > 0.005) {
    html += `<p><span class="tag warn">aprēķins mainījies</span> Tagad rīks aprēķina ${sumT(aprek)}, iesniegtajā bija ${sumT(zin)}. ${starp > 0
      ? `Iesniegtais jālabo EDS${labotLidz ? ` (bez soda līdz ${datumsLv(labotLidz)})` : ''}${aprek > 0.005 ? ` un jāpiemaksā ${naudaLv(Math.min(starp, aprek - Math.max(0, sam)))} €` : ''}.`
      : `Ja labosi iesniegto EDS, ${aprek < 0 ? `atmaksa palielināsies par ${naudaLv(-starp)} €` : `pārmaksa ${naudaLv(-starp)} € paliks vienotajā nodokļu kontā`}.`}</p>`;
    const piem = r2(aprek - Math.max(0, sam));
    html += `<div class="row" style="align-items:flex-end">${piem > 0.005 ? summaLauks(piem, 'Piemaksāts, €') : ''}${datLauks}<button id="atzLabots">${piem > 0.005 ? 'Labots un piemaksāts' : 'Labots EDS'}</button></div>`;
  } else if (zin > 0.005 && sam < zin - 0.005) {
    html += `<p class="note">Vēl jāsamaksā ${naudaLv(zin - sam)} €.</p><div class="row" style="align-items:flex-end">${summaLauks(zin - sam)}${datLauks}<button id="atzPiemaksa">Samaksāts</button></div>`;
  } else if (zin < -0.005 && sam > zin + 0.005) {
    html += `<p class="note">Kad atmaksa pienāk kontā:</p><div class="row" style="align-items:flex-end">${summaLauks(sam - zin, 'Atmaksa, €')}${datLauks}<button id="atzAtmaksa">Atmaksa saņemta</button></div>`;
  }
  return html + '</div>';
}
function piesaistitSamaksasPaneli(kods, aprek) {
  const el = $('#atzP'); if (!el) return; piesaistitDatumus(el);
  const dat = () => $('#atzP [name="atzDat"]')?.value || sodien(), summa = () => ($('#atzSumma') ? r2(sk($('#atzSumma').value)) : 0);
  const atz = () => { dati.samaksas ??= {}; return dati.samaksas[kods]; }, pievienot = (s) => { if (Math.abs(s) > 0.005) (atz().maksajumi ??= []).push({ summa: s, datums: dat() }); };
  if ($('#atzOk')) $('#atzOk').onclick = () => { dati.samaksas ??= {}; dati.samaksas[kods] = { zinots: r2(aprek), maksajumi: [] }; pievienot(aprek > 0.005 ? summa() : 0); saglabatUnRadit('Atzīmēts'); };
  if ($('#atzAtcelt')) $('#atzAtcelt').onclick = () => { if (!confirm('Noņemt atzīmi „Iesniegts un samaksāts”?')) return; delete dati.samaksas[kods]; saglabatUnRadit('Atzīme noņemta'); };
  if ($('#atzLabots')) $('#atzLabots').onclick = () => { atz().zinots = r2(aprek); pievienot(summa()); saglabatUnRadit('Atzīmēts'); };
  if ($('#atzPiemaksa')) $('#atzPiemaksa').onclick = () => { pievienot(summa()); saglabatUnRadit('Atzīmēts'); };
  if ($('#atzAtmaksa')) $('#atzAtmaksa').onclick = () => { pievienot(-summa()); saglabatUnRadit('Atzīmēts'); };
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
  ${samaksasPanelis(ceturksnaAtslega(izvGads, izvCet), q.jaMaksa, { kadMaksa: 'Kad ziņojums iesniegts EDS un samaksāts:', kadBez: 'Kad ziņojums iesniegts EDS:', labotLidz: tr.labotLidz })}
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
  piesaistitSamaksasPaneli(ceturksnaAtslega(izvGads, izvCet), q.jaMaksa);
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
  <p class="note">Pārskatā ir žurnāls, ceturkšņu VSAOI, D3 un D lapa, visi bankas darījumi ar kategorijām, rēķini un līgumi, kā arī lapa „Kā aizpildīt EDS”. Aprēķini ir Excel formulas, tāpēc grāmatvedis var pārbaudīt katru skaitli.</p>
  ${vidPanelis(deklGads)}
  <h3>D3 · Ienākumi no saimnieciskās darbības</h3><p class="note">Šos skaitļus ievadi EDS. Uzklikšķini, lai nokopētu. Ja VID priekšaizpildījumā ir citi skaitļi, pareizie ir tie, kas balstīti uz tavu uzskaiti.</p>
  <div class="tbl eds"><table><thead><tr><th></th><th class="n">Rinda</th><th class="n">Nodokļa maksātāja deklarētie dati</th></tr></thead><tbody>
    ${rinda(R.ienemumi, 'Ieņēmumi no citiem saimnieciskās darbības veidiem', a.d3.ienemumi)}
    ${rinda(R.izdevumi, 'Izdevumi, kas saistīti ar citiem saimnieciskās darbības veidiem', a.d3.izdevumi)}
    ${rinda(R.apliekamie, 'Apliekamie ienākumi no saimnieciskās darbības', a.d3.apliekamie, true)}
  </tbody></table></div>
  <h3>Dati, ko EDS pievieno pats</h3><p class="note">${g.vidDekl ? `Aizpildīts no VID deklarācijas Nr. ${h(g.vidDekl.id)}. Ja vajag, vari labot.` : 'Ielādē VID deklarācijas XML (augstāk) vai ievadi tos no EDS. Ja neaizpildīsi, IIN aplēse nebūs pilnīga: galīgo IIN aprēķina EDS.'}</p>
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
  <p class="note">Deklarāciju iesniedz no ${datumsLv(`${deklGads + 1}-03-01`)} līdz ${datumsLv(`${deklGads + 1}-06-01`)} IIN samaksā līdz ${datumsLv(`${deklGads + 1}-06-23`)}${a.d.r24 > n.iinVienaMaksajumaRobeza ? ' Summu var maksāt trīs daļās.' : ''}</p>
  <h3>Iesniegšana</h3>${samaksasPanelis(iinAtslega(deklGads), r2(a.d.r24 - a.d.r25), { kadMaksa: 'Kad deklarācija iesniegta EDS un IIN samaksāts:', kadBez: 'Kad deklarācija iesniegta EDS:' })}`;
  $('#g').onchange = (e) => { deklGads = Number(e.target.value); radit(); };
  $('#parskats').onclick = () => lejupieladetParskatu(deklGads);
  piesaistitSamaksasPaneli(iinAtslega(deklGads), r2(a.d.r24 - a.d.r25));
  $('#vidXml').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const v = lasitVidDeklaraciju(await f.text());
      const { attaisnotie, ...pareji } = gadaLauki(v);
      dati.gadi[v.gads] = { ...(dati.gadi[v.gads] || {}), ...pareji, attaisnotie, vidDekl: v };
      if (v.gads !== deklGads) { deklGads = v.gads; }
      saglabatUnRadit(`Ielādēta ${v.gads}. gada deklarācija Nr. ${v.id}`);
    } catch (err) { toast(err.message || 'Neizdevās nolasīt failu'); }
  };
  if ($('#vidNonemt')) $('#vidNonemt').onclick = () => { if (!confirm('Noņemt ielādēto VID deklarāciju? Ievadītie EDS dati paliks.')) return; delete dati.gadi[deklGads].vidDekl; saglabatUnRadit('Noņemts'); };
  $$('[data-g]').forEach((el) => el.onchange = () => { dati.gadi[deklGads] = { ...(dati.gadi[deklGads] || {}), [el.dataset.g]: el.value.trim() }; saglabatUnRadit(); });
  $$('[data-k]').forEach((td) => td.onclick = () => kopet(td.dataset.k));
}

/** Panelis: VID sagatavotās deklarācijas ielāde un salīdzinājums ar rīka aprēķinu. */
function vidPanelis(gads) {
  const v = dati.gadi[gads]?.vidDekl, ievade = `<label class="check" style="cursor:pointer;display:inline-flex"><span class="tag" style="padding:6px 12px">${v ? 'Ielādēt citu XML…' : 'Ielādēt VID deklarācijas XML…'}</span><input type="file" id="vidXml" accept=".xml,text/xml" hidden></label>`;
  if (!v) return `<h3>Salīdzināt ar VID sagatavoto deklarāciju</h3><div class="panel"><p style="margin-top:0">EDS atver VID sagatavoto ${gads}. gada deklarāciju un lejupielādē to <b>XML</b> formātā. Ielādē to šeit: rīks paņems datus, ko zina VID (AKKA/LAA, procenti, attaisnotie izdevumi, pensiju fondi), aprēķinās pareizo rezultātu un pateiks, kuras rindas EDS jāmaina.</p>
    <p class="note">No faila tiek nolasīti tikai skaitļi. Personas kods, konta numurs un adrese netiek saglabāti.</p>${ievade}</div>`;
  const s = vidSalidzinajums(gads), DARB = { ievadit: '<span class="tag warn">ieraksti EDS</span>', parbaudit: '<span class="tag">EDS pārrēķinās — pārbaudi</span>', sakrit: '<span class="tag ok">✓</span>' };
  const rez = (d) => d.r25 > 0 ? `atmaksa ${naudaLv(d.r25)} €` : `jāmaksā ${naudaLv(d.r24)} €`;
  return `<h3>Salīdzinājums ar VID sagatavoto deklarāciju</h3><div class="panel">
    <p style="margin-top:0">Deklarācija Nr. ${h(v.id)}${v.iesniegts ? ` (${datumsLv(v.iesniegts)})` : ''}, sagatavoja ${h(v.sagatavotajs)}. VID versijā: <b>${rez({ r24: v.D['24'], r25: v.D['25'] })}</b>; pareizi: <b class="hl">${rez(s.pareizi)}</b>${s.starpiba ? ` (${s.starpiba > 0 ? 'par ' + naudaLv(s.starpiba) + ' € labāk tev' : 'par ' + naudaLv(-s.starpiba) + ' € vairāk jāmaksā'})` : ''}.</p>
    ${s.soli.length ? `<h3 style="margin-top:6px">Kā aizpildīt EDS</h3><ol>${s.soli.map((t) => `<li>${h(t)}</li>`).join('')}</ol>` : '<p><b>VID versija jau ir pareiza: deklarācijā nekas nav jāmaina.</b></p>'}
    <div class="tbl eds"><table><thead><tr><th>Lapa</th><th class="n">Rinda</th><th></th><th class="n">VID versija</th><th class="n">Pareizi</th><th></th></tr></thead><tbody>
    ${s.rindas.map((r) => `<tr><td>${r.lapa}</td><td class="n">${r.rinda}</td><td>${h(r.nosaukums)}</td><td class="n">${eds(r.vid)}</td><td class="n c" data-k="${eds(r.pareizi)}">${r.darbiba === 'ievadit' ? `<b>${eds(r.pareizi)}</b>` : eds(r.pareizi)}</td><td>${DARB[r.darbiba]}</td></tr>`).join('')}
    </tbody></table></div>
    ${s.piezimes.map((p) => `<p class="note">${h(p)}</p>`).join('')}
    <p class="row" style="margin-bottom:0">${ievade}<button class="link" id="vidNonemt">Noņemt</button></p></div>`;
}

// ---------- Iestatījumi ----------
let laboPas = null;
function pasutitajaLabosana(x) {
  const a = x.adrese || {}, l = (k, n, v) => `<label>${n}<input data-lp="${k}" value="${h(v ?? '')}"></label>`;
  return `<tr><td colspan="5"><div class="panel" style="margin:4px 0">
    <label>Ielīmē rekvizītus (nav obligāti)<textarea data-lp-ielime rows="3"></textarea></label><p class="row" style="margin:8px 0"><button type="button" data-lp-sadalit>Sadalīt pa laukiem</button></p>
    <div class="grid">${l('nosaukums', 'Nosaukums', x.nosaukums)}${l('regNr', 'Reģ. nr.', x.regNr)}${l('iela', 'Iela, māja', a.iela)}${l('pilseta', 'Pilsēta', a.pilseta)}${l('indekss', 'Pasta indekss', a.indekss)}${l('valsts', 'Valsts', a.valsts || 'LV')}${l('konts', 'Konta numurs', x.konts)}${l('banka', 'Banka (ja ir)', x.banka)}${l('bic', 'Bankas kods (ja ir)', x.bic)}${l('epasts', 'E-pasts', x.epasts)}</div>
    <p class="row" style="margin-bottom:0"><button class="primary" type="button" data-lp-saglabat="${x.id}">Saglabāt</button><button type="button" data-lp-atcelt>Atcelt</button></p></div></td></tr>`;
}
/** Pasūtītāju imports: pievieno tikai tos, kuru vēl nav (pēc reģ. nr. vai nosaukuma). */
function importetPasutitajus(saraksts) {
  if (!Array.isArray(saraksts)) throw new Error('Failā jābūt pasūtītāju sarakstam.');
  const nos = (t) => normalizetNosaukumu(t || '');
  let pievienoti = 0, papildinati = 0, izlaisti = 0;
  for (const x of saraksts) {
    if (!x?.nosaukums) { izlaisti++; continue; }
    const jau = dati.pasutitaji.find((p) => (x.regNr && p.regNr === x.regNr) || nos(p.nosaukums) === nos(x.nosaukums));
    if (jau) {                                                     // esošam pasūtītājam aizpilda tikai tukšos laukus, neko nepārraksta
      let papildinats = false;
      const liec = (obj, k, v) => { if (v && !obj[k]) { obj[k] = String(v); papildinats = true; } };
      for (const k of ['regNr', 'epasts', 'konts', 'banka', 'bic']) liec(jau, k, x[k]);
      jau.adrese ||= {}; for (const k of ['iela', 'pilseta', 'indekss']) liec(jau.adrese, k, x.adrese?.[k]);
      if (!jau.biezums && x.biezums) jau.biezums = x.biezums;
      papildinats ? papildinati++ : izlaisti++; continue;
    }
    dati.pasutitaji.push({ id: uid(), nosaukums: String(x.nosaukums), regNr: String(x.regNr || ''), adrese: { iela: '', pilseta: '', indekss: '', valsts: 'LV', ...(x.adrese || {}) },
      epasts: String(x.epasts || ''), konts: String(x.konts || ''), banka: String(x.banka || ''), bic: String(x.bic || ''), veidne: x.veidne === 'hanzas' ? 'hanzas' : 'standarta', budzetaIestade: !!x.budzetaIestade, biezums: Number(x.biezums) || 0 });
    pievienoti++;
  }
  return { pievienoti, papildinati, izlaisti };
}
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
  <h3>Pasūtītāji</h3><div class="tbl"><table class="pas"><thead><tr><th>Nosaukums</th><th>Reģ. nr.</th><th>Veidne</th><th>Budžeta iestāde</th><th></th></tr></thead><tbody>
  ${dati.pasutitaji.map((x) => x.id === laboPas ? pasutitajaLabosana(x) : `<tr><td class="wrap">${h(x.nosaukums)}${trukstRekviziti(x).length ? ` <span class="tag warn" title="${h(trukstRekviziti(x).join(', '))}">trūkst rekvizītu</span>` : ''}<br><span class="note">${h([x.adrese?.iela, x.adrese?.pilseta, x.adrese?.indekss].filter(Boolean).join(', '))}</span><br><span class="note">${x.epasts ? h(x.epasts) : 'nav e-pasta'}</span></td><td data-l="Reģ. nr.">${h(x.regNr)}</td>
    <td><select data-veidne="${x.id}"><option value="standarta">Mana veidne</option><option value="hanzas" ${x.veidne === 'hanzas' ? 'selected' : ''}>Hanzas Perons</option></select></td>
    <td data-l="Budžeta iestāde"><input type="checkbox" data-budz="${x.id}" ${x.budzetaIestade ? 'checked' : ''} style="width:auto;min-height:0"></td>
    <td><div class="row"><button class="link" data-labopas="${x.id}">Labot</button>${dati.rekini.some((r) => r.pasutitajsId === x.id) || dati.autorligumi.some((l) => l.pasutitajsId === x.id) ? '' : `<button class="link" data-dz="${x.id}">Dzēst</button>`}</div></td></tr>`).join('') || '<tr><td colspan="5" class="note">Pasūtītājus pievieno, izrakstot rēķinu.</td></tr>'}
  </tbody></table></div>
  <p class="row" style="margin-top:8px"><label class="check" style="cursor:pointer"><span class="note" style="text-decoration:underline">Importēt pasūtītājus no faila (.json)</span><input type="file" id="impPas" accept=".json,application/json" hidden></label></p>
  <h3>Hanzas Perons rēķina paraugs</h3><div class="panel">
    <p style="margin-top:0">${dati.hanzasBlanka?.fails ? `Ielādēts paraugs „${h(dati.hanzasBlanka.nosaukums)}” (${datumsLv(dati.hanzasBlanka.ieladeta)}). Rīks to aizpilda katram Hanzas Perons rēķinam: numuru, datumus, periodu, pozīciju, summas un summu vārdiem. Noformējums un pasūtītāja dati paliek kā blankā.`
      : 'Ielādē vienu no saviem Hanzas Perons rēķiniem Excel formātā (.xlsx). Rīks to izmantos kā rēķina paraugu. Ja tev ir .xls fails, atver to Excel vai Numbers un saglabā kā .xlsx.'}</p>
    <div class="row"><label class="check" style="cursor:pointer"><span style="border:1px solid var(--line);border-radius:6px;padding:8px 14px;font-weight:600;background:var(--surface)">${dati.hanzasBlanka?.fails ? 'Nomainīt paraugu' : 'Izvēlēties .xlsx failu'}</span><input type="file" id="hanzasBlanka" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label></div>
    <p class="note">Pasūtītājam jābūt atzīmētam ar veidni „Hanzas Perons” tabulā augstāk.</p></div>
  <h3>Google Drive</h3><div class="panel">${driveMeta().konts ? `<p style="margin-top:0">Pieslēgts kontam <b>${h(driveMeta().konts)}</b>. Dati glabājas Google Drive mapē „${drive.SAKNES_MAPE}” un šajā pārlūkā. Pirms datu pārrakstīšanas Drive katru dienu tiek saglabāta rezerves kopija mapē „${drive.REZERVJU_MAPE}”.</p>
    <div class="row"><button id="drSinh">Sinhronizēt tagad</button><button id="drKopijas">Atjaunot no Drive rezerves kopijas…</button></div><div id="drKopSar"></div>`
    : `<p style="margin-top:0">Pieslēdz Google Drive, lai dati būtu drošībā un pieejami arī citās ierīcēs. Rīks redzēs tikai paša izveidotos failus.</p><div class="row"><button id="drSinh" class="primary">Pieslēgt Google Drive</button></div>`}
    <p class="note">Piekļuvi jebkurā brīdī vari atsaukt Google konta iestatījumos: myaccount.google.com/permissions. <a href="privatums.html">Privātuma politika</a></p></div>
  <p class="note" style="margin-top:18px">Rīka versija ${VERSIJA}. Rīku var instalēt kā aplikāciju: iPhone Safari „Kopīgot → Pievienot sākuma ekrānam”, Mac Safari „Fails → Pievienot Dock”, Chrome — instalēšanas ikona adreses joslā.</p>
  <h3>Dati</h3><div class="panel"><p class="note" style="margin-top:0">Rezerves kopija satur visus tavus datus. Glabā to drošā vietā.</p>
    <div class="row"><button id="eksp">Lejupielādēt rezerves kopiju</button><label class="check" style="cursor:pointer"><span>Atjaunot no faila</span><input type="file" id="imp" accept=".json" hidden></label>
    <button id="dzestVisu" class="link">${driveMeta().konts ? 'Dzēst datus no šī pārlūka (Drive paliek)' : 'Dzēst visus datus šajā pārlūkā'}</button></div></div>`;
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
  $$('[data-labopas]').forEach((b) => b.onclick = () => { laboPas = b.dataset.labopas; radit(); });
  if ($('[data-lp-atcelt]')) $('[data-lp-atcelt]').onclick = () => { laboPas = null; radit(); };
  if ($('[data-lp-sadalit]')) $('[data-lp-sadalit]').onclick = () => {
    const r = sadalitRekvizitus($('[data-lp-ielime]').value);
    if (!r.banka && r.bic) r.banka = bankasNosaukums(r.bic);
    for (const [k, v] of Object.entries(r)) { const el = $(`[data-lp="${k}"]`); if (el && v) el.value = v; }
  };
  if ($('[data-lp-saglabat]')) $('[data-lp-saglabat]').onclick = (e) => {
    const x = dati.pasutitaji.find((p) => p.id === e.target.dataset.lpSaglabat), v = (k) => $(`[data-lp="${k}"]`).value.trim();
    if (!v('nosaukums')) { toast('Ievadi nosaukumu'); return; }
    Object.assign(x, { nosaukums: v('nosaukums'), regNr: v('regNr'), epasts: v('epasts'), konts: v('konts').replace(/\s/g, ''), banka: v('banka'), bic: v('bic').toUpperCase(), adrese: { ...(x.adrese || {}), iela: v('iela'), pilseta: v('pilseta'), indekss: v('indekss'), valsts: v('valsts') || 'LV' } });
    for (const r of dati.rekini) if (r.pasutitajsId === x.id) r.driveGaida = true;          // e-rēķina XML Drive jāatjauno
    laboPas = null; saglabatUnRadit('Pasūtītājs saglabāts');
  };
  $('#impPas').onchange = async (e) => {
    try { const r = importetPasutitajus(JSON.parse(await e.target.files[0].text())); saglabatUnRadit(`Pievienoti: ${r.pievienoti}, papildināti: ${r.papildinati}${r.izlaisti ? `, bez izmaiņām: ${r.izlaisti}` : ''}`); }
    catch (err) { toast(err.message || 'Neizdevās nolasīt failu'); }
  };
  $('#eksp').onclick = () => lejupieladet(`gramatvediba-${sodien()}.json`, eksportet(dati), 'application/json');
  $('#imp').onchange = async (e) => { try { const d = importet(await e.target.files[0].text()); if (confirm(driveMeta().konts ? 'Aizstāt pašreizējos datus ar rezerves kopiju? Tie aizstās arī datus Google Drive (iepriekšējie paliks Drive rezerves kopijā).' : 'Aizstāt pašreizējos datus ar rezerves kopiju?')) { saglabat(d); dati = ieladet(); saglabatUnRadit('Dati atjaunoti'); } } catch (err) { toast(err.message); } };
  $('#dzestVisu').onclick = () => {
    const m = driveMeta();
    if (!confirm(m.konts ? 'Dzēst datus no šī pārlūka un atvienot Google Drive? Dati Google Drive netiks dzēsti: pieslēdzoties vēlreiz, tie ielādēsies atpakaļ.' : 'Dzēst visus datus šajā pārlūkā? Rezerves kopija netiks dzēsta.')) return;
    if (m.mainits && m.konts && !confirm('Uzmanību: daļa izmaiņu vēl nav saglabāta Google Drive un tiks zaudēta. Turpināt?')) return;
    rakstitDriveMeta({}); drive.aizmirstAtslegu(); gmail.aizmirstGmail(); driveKluda = '';            // vispirms atvieno, lai tukšie dati netiktu augšupielādēti
    try { localStorage.removeItem('gramatvediba:dati-pirms-drive'); localStorage.removeItem(BAZE); } catch { /* nav svarīgi */ }
    dati = TUKSI_DATI(); bankasSesija = null; saglabatSesiju(); saglabatUnRadit('Dati dzēsti no šī pārlūka');
  };
  $('#hanzasBlanka').onchange = async (e) => {
    const fl = e.target.files[0]; if (!fl) return;
    try {
      const baiti = new Uint8Array(await fl.arrayBuffer()), p = await parbauditBlanku(baiti);
      if (!p.ok) { toast(`Šis neizskatās pēc Hanzas Perons rēķina parauga: nav atrasts ${p.kludas.join(', ')}.`); return; }
      dati.hanzasBlanka = { fails: uzBase64(baiti), nosaukums: fl.name, ieladeta: sodien(), pozicijuRindas: p.pozicijuRindas };
      saglabatUnRadit('Rēķina paraugs ielādēts');
    } catch (err) { toast(err.message); }
  };
  if ($('#drKopijas')) $('#drKopijas').onclick = async () => {
    const vieta = $('#drKopSar');
    if (!drive.irAtslega()) { await pieslegtDrive(); if (!drive.irAtslega()) return; }
    vieta.innerHTML = '<p class="note">Ielādē sarakstu…</p>';
    try {
      const k = await sinh.kopijas();
      vieta.innerHTML = k.length ? `<p class="note">Izvēlies kopiju. Pašreizējie dati vispirms tiks saglabāti kā jauna rezerves kopija, tāpēc atjaunošanu var atsaukt.</p>
        <div class="tbl"><table><tbody>${k.map((f) => `<tr><td>${h(f.name)}</td><td class="note">${laiksLv(f.modifiedTime)}</td><td><button class="link" data-kop="${h(f.id)}" style="color:var(--ink);font-weight:600">Apskatīt un atjaunot</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="note">Drive vēl nav rezerves kopiju.</p>';
      $$('[data-kop]', vieta).forEach((b) => b.onclick = async () => {
        try {
          const d = importet(await drive.lejupieladet(b.dataset.kop));
          if (!confirm(`Kopijā: ${datuApraksts(d)}.\nPašlaik: ${datuApraksts(dati)}.\n\nAizstāt pašreizējos datus ar šo kopiju? Pašreizējie dati vispirms tiks saglabāti rezervē.`)) return;
          await izpilditSinh(() => sinh.atjaunot(b.dataset.kop)); toast('Dati atjaunoti no rezerves kopijas'); radit();
        } catch (e) { toast(e.message || 'Neizdevās atjaunot'); }
      });
    } catch (e) { vieta.innerHTML = `<p class="note">${h(e.message || 'Neizdevās ielādēt sarakstu')}</p>`; }
  };
  if ($('#drSinh')) $('#drSinh').onclick = () => drive.irAtslega() ? izpilditSinh(() => sinh.sinhronizet()).then(radit) : pieslegtDrive().then(radit);
}

// ---------- Maršruti un sākums ----------
const SKATI = { parskats: skatsParskats, rekini: skatsRekini, ligumi: skatsLigumi, banka: skatsBanka, zurnals: skatsZurnals, ceturksnis: skatsCeturksnis, deklaracija: skatsDeklaracija, iestatijumi: skatsIestatijumi };
/** Sākuma ekrāns: katrā sesijā vispirms piedāvā pieslēgties Drive; darbs bez Drive ir papildu izvēle. */
const BEZ_DRIVE = 'gramatvediba:bez-drive';
const jaradaSakums = () => !drive.irAtslega() && !sessionStorage.getItem(BEZ_DRIVE);
function sakumaEkrans(v) {
  const m = driveMeta();
  document.body.classList.add('sakums');
  v.innerHTML = `<div class="panel sakums-p"><h2 style="margin-top:0">Sveiks!</h2>
    <p>Pieslēdzies Google Drive, lai strādātu ar jaunākajiem datiem no visām ierīcēm.</p>
    ${driveKluda ? `<p style="color:var(--warn)">${h(driveKluda)}</p>` : ''}
    <p><button class="primary" id="sPieslegt" style="font-size:1.05rem;padding:12px 22px">Pieslēgties Google Drive</button></p>
    <p class="note" style="margin:0 0 14px">${m.konts ? h(m.konts) : 'Pirmā pieslēgšana šajā pārlūkā: ja Drive jau ir dati no citas ierīces, tie tiks apvienoti ar šejienes datiem'}${m.konts && m.mainits ? ' · šajā pārlūkā ir izmaiņas, kas vēl nav Drive: pieslēdzoties tās tiks apvienotas' : ''}</p>
    <button class="link" id="sBez">Strādāt bez Drive</button></div>`;
  $('#sPieslegt').onclick = async () => { await pieslegtDrive(); if (drive.irAtslega()) { document.body.classList.remove('sakums'); radit(); } else radit(); };
  $('#sBez').onclick = () => { sessionStorage.setItem(BEZ_DRIVE, '1'); document.body.classList.remove('sakums'); radit(); raditDriveStatusu(); };
}
function radit() {
  if (!Object.keys(noteikumi).length) return;                        // noteikumi vēl ielādējas; sakt() zīmēs pēc tam
  if (jaradaSakums()) { sakumaEkrans($('#view')); return; }
  document.body.classList.remove('sakums');
  kess = {};
  const r = SKATI[location.hash.slice(1)] ? location.hash.slice(1) : 'parskats';
  $$('#nav a').forEach((a) => a.getAttribute('href') === '#' + r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  SKATI[r]($('#view'));
  piesaistitDatumus($('#view'));
}
window.addEventListener('hashchange', radit);

// ---------- PWA: servisa skripts un versijas atjaunošana ----------
// Jauna versija tiek ielādēta fonā; ieslēdzas tikai pēc „Atjaunot”, tāpēc vecie un jaunie faili nekad nesajaucas.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !new URLSearchParams(location.search).has('bez-sw')) {
  let parlade = false;
  const bijaKontrolieris = !!navigator.serviceWorker.controller;          // pirmajā apmeklējumā pārlādēt nevajag: faili jau ir tie paši
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!parlade && bijaKontrolieris) { parlade = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const radit = (w) => { if (!w || !navigator.serviceWorker.controller) return; const b = $('#jaunaVersija'); b.hidden = false;
      $('#atjaunotVersiju').onclick = () => { if (sinh.aiznemts()) { toast('Pagaidi, kamēr beidzas sinhronizācija'); return; } w.postMessage('atjaunot'); }; };
    radit(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed') radit(w); }); });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => { /* bez servisa skripta rīks strādā tāpat */ });
}
(async function sakt() {
  try {
    const { gadi } = await (await fetch('rules/index.json')).json();
    for (const g of gadi) noteikumi[g] = await (await fetch(`rules/${g}.json`)).json();
  } catch { $('#view').innerHTML = '<p class="banner">Neizdevās ielādēt noteikumu failus. Rīks jāatver caur tīmekļa adresi, nevis kā fails no datora.</p>'; return; }
  radit(); raditDriveStatusu();
})();
