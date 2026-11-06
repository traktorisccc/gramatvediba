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
