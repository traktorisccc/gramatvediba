// Hanzas Perons blanka: izdomāta blanka, kas uzbūvēta ar pašu xlsx rakstītāju.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xlsxFails } from '../src/xlsx.js';
import { parbauditBlanku, aizpilditBlanku, nolasitVertibas, periodsTeksts, summaVardiemBlankai, blankasFailaVards, lasitZip } from '../src/hanzas.js';

function blanka({ pozRindas = 1 } = {}) {
  const rindas = [];
  const liec = (n, sunas) => { const r = []; for (const [kol, v] of Object.entries(sunas)) r[kol.charCodeAt(0) - 65] = v; rindas[n - 1] = r; };
  liec(2, { A: 'Rēķins Nr. 001' }); liec(3, { A: '2025. gada 1. janvārī' });
  liec(6, { A: 'Pakalpojuma sniedzējs:', C: 'Vecais Vārds' }); liec(7, { A: 'Dzīvesvietas adrese:', C: 'Veca iela 1', E: 'Reģ. nr.: ', F: 1 });
  liec(8, { A: 'Banka:', C: 'Kāda banka', E: 'PVN Reģ. nr.:', F: 'NAV' }); liec(9, { A: 'Bankas konts:', C: 'LV00VECS' });
  liec(13, { A: 'Pakalpojuma saņēmējs:', C: 'Pasūtītājs, SIA' }); liec(14, { A: 'Juridiskā adrese:', C: 'Iela 2', E: 'Reģ. nr.: ', F: 40000000000 });
  liec(18, { A: 'Darījuma veids: ', C: 'Pakalpojuma sniegšana', E: 'Pakalpojuma sniegšanas datums vai periods:', F: 'vecs periods' });
  liec(19, { A: 'Darījuma pamatojums: ', C: 'Līgums Nr. X/1' }); liec(21, { A: 'Apmaksas termiņš: ', C: { v: '2025-01-15', s: 'datums' } });
  liec(24, { A: 'Nr. p.k.', B: 'Pakalpojumu nosaukums', D: 'Mērv.', E: 'Daudz.', F: 'Cena, EUR', G: 'Summa, EUR' });
  for (let i = 0; i < pozRindas; i++) liec(25 + i, { A: 1, B: 'Vecs teksts', D: '1 gab.', E: 1, F: 100, G: { v: 100, f: `E${25 + i}*F${25 + i}` } });
  const k = 25 + pozRindas;
  liec(k, { A: 'Kopsumma bez PVN', G: { v: 100, f: `SUM(G25:G${k - 1})` } }); liec(k + 1, { A: 'PVN 21%', G: '-' }); liec(k + 2, { A: 'Pavisam apmaksai', G: { v: 100, f: `G${k}` } });
  liec(k + 3, { A: 'Summa apmaksai vārdiem:', C: 'Simts eiro.' });
  for (let i = 0; i < rindas.length; i++) rindas[i] ||= [];
  return xlsxFails([{ nosaukums: 'Paraugs', rindas }]);
}
const profils = { vards: 'Anna Paraugs', personasKods: '010101-10000', adrese: { iela: 'Jaunā iela 5', pilseta: 'Rīga', indekss: 'LV-1001' }, iban: 'LV00 TEST 0000 0000 0000 0', bic: 'HABALV22' };

test('Teksti blankai', () => {
  assert.equal(periodsTeksts('2026-10-01', '2026-10-02'), 'no\n2026. gada 1. oktobra līdz 2026. gada 2. oktobrim');
  assert.equal(periodsTeksts('2026-03-05', '2026-03-05'), '2026. gada 5. martā');
  assert.equal(summaVardiemBlankai(500), 'Pieci simti eiro.');
  assert.match(summaVardiemBlankai(340.5), /^Trīs simti četrdesmit eiro un piecdesmit centi\.$/);
  assert.equal(blankasFailaVards('Ēriks Ūdris', '2026-01-02', 5), 'Eriks_Udris_Rekins_2026_Nr_005_Hanzas_perons.xlsx');
});

test('Blanka atpazīta; nepareizs fails atteikts', async () => {
  assert.deepEqual(await parbauditBlanku(blanka()), { ok: true, kludas: [], pozicijuRindas: 1 });
  const cits = xlsxFails([{ nosaukums: 'X', rindas: [['Kaut kas cits']] }]);
  const p = await parbauditBlanku(cits);
  assert.equal(p.ok, false); assert.ok(p.kludas.includes('„Rēķins Nr.”'));
  await assert.rejects(lasitZip(new TextEncoder().encode('nav zip')), /nav \.xlsx/);
});

test('Aizpildīšana: vecie teksti aizstāti, formulas saglabātas', async () => {
  const r = { nr: 27, datums: '2026-12-03', termins: '2026-12-17', periods: { no: '2026-11-20', lidz: '2026-11-21' }, pozicijas: [{ nosaukums: 'Jauns darbs', daudzums: 2, cena: 320 }] };
  const x = await aizpilditBlanku(blanka(), r, profils), v = await nolasitVertibas(x);
  assert.equal(v.get('A2'), 'Rēķins Nr. 027'); assert.equal(v.get('A3'), '2026. gada 3. decembrī');
  assert.equal(v.get('C6'), 'Anna Paraugs'); assert.equal(v.get('C7'), 'Jaunā iela 5, Rīga, LV-1001'); assert.equal(v.get('F7'), '1010110000');
  assert.equal(v.get('C8'), 'Swedbank, AS'); assert.equal(v.get('C9'), 'LV00TEST0000000000000');
  assert.equal(v.get('F14'), '40000000000'); assert.equal(v.get('C19'), 'Līgums Nr. X/1');
  assert.equal(v.get('F18'), 'no\n2026. gada 20. novembra līdz 2026. gada 21. novembrim');
  assert.equal(v.get('C21'), '46373');
  assert.equal(v.get('B25'), 'Jauns darbs'); assert.equal(v.get('E25'), '2'); assert.equal(v.get('G25'), '640');
  assert.equal(v.get('G26'), '640'); assert.equal(v.get('G28'), '640'); assert.equal(v.get('C29'), 'Seši simti četrdesmit eiro.');
  const lapa = new TextDecoder().decode((await lasitZip(x)).get('xl/worksheets/sheet1.xml'));
  assert.match(lapa, /<c r="G26"[^>]*><f>SUM\(G25:G25\)<\/f><v>640<\/v><\/c>/);
  assert.ok(!lapa.includes('Vecs teksts') && !lapa.includes('Vecais Vārds'));
});

test('Vairākas pozīcijas: lieko rindu iztukšo; par daudz pozīciju → kļūda', async () => {
  const b = blanka({ pozRindas: 2 }), r = { nr: 3, datums: '2026-01-10', termins: '2026-01-24', pozicijas: [{ nosaukums: 'A', daudzums: 1, cena: 50 }] };
  const v = await nolasitVertibas(await aizpilditBlanku(b, r, profils));
  assert.equal(v.get('B25'), 'A'); assert.equal(v.get('B26') ?? '', ''); assert.equal(v.get('G27'), '50');
  await assert.rejects(aizpilditBlanku(blanka(), { ...r, pozicijas: [r.pozicijas[0], r.pozicijas[0]] }, profils), /vieta 1 pozīcijai/);
});
