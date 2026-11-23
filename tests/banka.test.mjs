// Publiskie testi ar izdomātiem datiem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nolasitSwedbankCsv, klasificet, kopsavilkums, rekinaNumurs } from '../src/banka.js';

test('Rēķina numurs dažādos pierakstos', () => {
  assert.equal(rekinaNumurs('Rēķ.Nr.013,09.10.2025.,340.00 EUR'), 13);
  assert.equal(rekinaNumurs('rēķins 14'), 14);
  assert.equal(rekinaNumurs('Rēķins Nr. 15 no 15.12.2025.'), 15);
  assert.equal(rekinaNumurs('Rek.Nr.16'), 16);
  assert.equal(rekinaNumurs('RĒĶINS #11'), 11);
  assert.equal(rekinaNumurs('Rekins Nr. 006, 25.03.2025. Video'), 6);
  assert.equal(rekinaNumurs('Autoratlīdzība'), null);
});

const csv = [
  '"Klienta konts";"Ieraksta tips";"Datums";"Saņēmējs/Maksātājs";"Informācija saņēmējam";"Summa";"Valūta";"Debets/Kredīts";"Arhīva kods";"Maksājuma veids";"Refernces numurs";"Dokumenta numurs";',
  '"LV00TEST0000000000000";"10";"01.01.2026";"";"Sākuma atlikums";"100,00";"EUR";"K";"";"AS";"";"";',
  '"LV00TEST0000000000000";"20";"05.01.2026";"PARAUGA TEĀTRIS VSIA";"Rēķ.Nr.001, scenogrāfija";"1000,00";"EUR";"K";"A1";"INB";"";"";',
  '"LV00TEST0000000000000";"20";"06.01.2026";"\'PARAUGS SIA";"Avanss";"250,00";"EUR";"K";"A2";"INB";"";"";',
  '"LV00TEST0000000000000";"20";"07.01.2026";"JĀNIS PARAUGS";"Maksājums starp saviem kontiem";"50,00";"EUR";"D";"A3";"PRV";"";"";',
  '"LV00TEST0000000000000";"82";"31.01.2026";"";"Apgrozījums";"1250,00";"EUR";"K";"";"K2";"";"";',
  '"LV00TEST0000000000000";"82";"31.01.2026";"";"Apgrozījums";"50,00";"EUR";"D";"";"K2";"";"";'
].join('\r\n');

test('Nezināms ienākums netiek klusi izslēgts', () => {
  const iz = nolasitSwedbankCsv(csv);
  const k = klasificet(iz.darijumi, { savsVards: 'Jānis Paraugs', rekini: [{ nr: 1, summa: 1000, pasutitajs: 'Parauga teātris' }], autorligumi: [] });
  const s = kopsavilkums(k, iz);
  assert.equal(k[0].kategorija, 'sd');
  assert.equal(k[1].partneris, 'PARAUGS SIA');
  assert.equal(k[1].kategorija, 'jaizverte');
  assert.equal(k[2].kategorija, 'ignorets');
  assert.equal(s.sakrit, true);
});

// ---- Pārbaudē atrastās kļūdas (10.11.2026.): šie gadījumi vairs nedrīkst tikt atpazīti automātiski ----
import { klasificet as kl, nosaukumiSakrit, bezMaksajuma, nolasitSwedbankCsv as nol } from '../src/banka.js';
const tx = (o) => ({ datums: '2026-03-01', partneris: '', info: '', summa: 0, valuta: 'EUR', virziens: 'K', arhivaKods: String(Math.random()), ...o });
const REG = () => ({ savsVards: 'Jānis Paraugs', noteikumi: {}, rekini: [{ id: 'r30', nr: 30, summa: 340, pasutitajs: 'Hanzas Perons' }], autorligumi: [{ id: 'a5', nr: '5', summa: 9999, pasutitajs: 'Dailes teātris' }, { id: 'a1', nr: '3-2-40/25', summa: 4000, pasutitajs: 'Dailes teātris' }] });

test('Tukšs vai īss maksātāja nosaukums ar vienādu summu nav ienākums', () => {
  assert.equal(kl([tx({ info: 'ATGRIEZTS DAR. veikals', summa: 340 })], REG())[0].kategorija, 'kartes-atgriesana');
  assert.equal(kl([tx({ partneris: 'PERONS', info: 'dāvana', summa: 340 })], REG())[0].kategorija, 'jaizverte');
  assert.equal(kl([tx({ partneris: 'AB', info: 'x', summa: 340 })], REG())[0].kategorija, 'jaizverte');
  assert.equal(nosaukumiSakrit('HANZAS PERONS SIA', 'Hanzas Perons'), true);
  assert.equal(nosaukumiSakrit('LIEPĀJAS CENTRĀLĀ ADMINISTRĀCIJA', 'Liepāja 2027'), false);
});

test('Īss līguma numurs netiek meklēts tekstā; garš tiek atrasts tikai kā atsevišķs gabals', () => {
  assert.equal(kl([tx({ partneris: 'KĀDS CITS', info: 'Par pusdienām 15.03', summa: 20 })], REG())[0].kategorija, 'jaizverte');
  assert.equal(kl([tx({ partneris: 'DAILES TEĀTRIS VSIA', info: 'Izmaksu saraksts Nr.1880 Autora līg.3-2-40/25', summa: 1500 })], REG())[0].kategorija, 'sd');
  assert.equal(kl([tx({ partneris: 'CITS', info: 'pasūtījums 13-2-40/255', summa: 10 })], REG())[0].kategorija, 'jaizverte');
});

test('Otrs maksājums tam pašam rēķinam netiek ieskaitīts klusi', () => {
  const k = kl([tx({ partneris: 'HANZAS PERONS SIA', info: 'Rēķ.Nr.030', summa: 340 }), tx({ partneris: 'HANZAS PERONS SIA', info: 'Rēķ.Nr.030', summa: 340 })], REG());
  assert.deepEqual(k.map((x) => x.kategorija), ['sd', 'jaizverte']);
  const jauSamaksats = { ...REG(), rekini: [{ id: 'r30', nr: 30, summa: 340, pasutitajs: 'Hanzas Perons', samaksats: 340 }] };
  assert.equal(kl([tx({ partneris: 'HANZAS PERONS SIA', info: 'Rēķ.Nr.030', summa: 340 })], jauSamaksats)[0].kategorija, 'jaizverte');
});

test('Autorlīguma maksājumi pa daļām; pārsniegums jāizvērtē', () => {
  const k = kl([2500, 1500, 500].map((s) => tx({ partneris: 'DAILES TEĀTRIS VSIA', info: 'Autora līg.3-2-40/25', summa: s })), REG());
  assert.deepEqual(k.map((x) => x.kategorija), ['sd', 'sd', 'jaizverte']);
});

test('Maksājums citā valūtā netiek nolasīts kā eiro', () => {
  assert.equal(kl([tx({ partneris: 'US CLIENT INC', info: 'Invoice', summa: 1000, valuta: 'USD' })], REG())[0].citaValuta, true);
});

test('Daļēji apmaksāts rēķins paliek neapmaksāto sarakstā', () => {
  const reg = REG(), dar = [{ kategorija: 'sd', summa: 100, saite: { tips: 'rekins', kods: 'r30', nr: 30 } }];
  assert.equal(bezMaksajuma(reg, dar).length, 1);
  assert.equal(bezMaksajuma(reg, [...dar, { kategorija: 'sd', summa: 240, saite: { tips: 'rekins', kods: 'r30', nr: 30 } }]).length, 0);
});

test('Izraksta periods tiek nolasīts', () => {
  assert.deepEqual(nol(csv).periods, { no: '2026-01-01', lidz: '2026-01-07' });
});

test('Otrs konts (nodokļu konts): pārskaitījums no sava konta un maksājumi VID', () => {
  const nk = [
    '"Klienta konts";"Ieraksta tips";"Datums";"Saņēmējs/Maksātājs";"Informācija saņēmējam";"Summa";"Valūta";"Debets/Kredīts";"Arhīva kods";"Maksājuma veids";"Refernces numurs";"Dokumenta numurs";',
    '"LV00TEST0000000000001";"10";"01.04.2026";"";"Sākuma atlikums";"0,00";"EUR";"K";"";"AS";"";"";',
    '"LV00TEST0000000000001";"20";"10.04.2026";"JĀNIS PARAUGS";"Maksājums starp saviem kontiem";"600,00";"EUR";"K";"N1";"PRV";"";"";',
    '"LV00TEST0000000000001";"20";"22.04.2026";"VALSTS BUDZETS (VID)";"Vienotais nodokļu konts";"294,35";"EUR";"D";"N2";"INB";"";"";',
    '"LV00TEST0000000000001";"20";"20.06.2026";"VALSTS BUDZETS (VID)";"Vienotais nodokļu konts";"212,19";"EUR";"D";"N3";"INB";"";"";',
    '"LV00TEST0000000000001";"82";"30.06.2026";"";"Apgrozījums";"600,00";"EUR";"K";"";"K2";"";"";',
    '"LV00TEST0000000000001";"82";"30.06.2026";"";"Apgrozījums";"506,54";"EUR";"D";"";"K2";"";"";'
  ].join('\r\n');
  const iz = nolasitSwedbankCsv(nk);
  const k = klasificet(iz.darijumi, { savsVards: 'Jānis Paraugs', rekini: [], autorligumi: [] });
  assert.deepEqual(k.map((d) => d.kategorija), ['savs-konts', 'vid-maksajums', 'vid-maksajums']);
  assert.equal(kopsavilkums(k, iz).sakrit, true);
});
