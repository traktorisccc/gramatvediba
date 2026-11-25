import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zinamieDarijumi, glabajamaisKods, kontuParklajums, parklats, atrastRokuIerakstu, gadaAtzimes, samaksatsAtzimei, salidzinatSamaksas, ceturksnaAtslega, iinAtslega } from '../src/konti.js';
import { filtretDarijumus, darijumuFiltrsAktivs } from '../src/meklesana.js';

const A = 'LV00TEST0000000000001', B = 'LV00TEST0000000000002';

test('darījums atpazīts pēc konta un koda; vecie ieraksti bez konta pēc koda', () => {
  const zin = zinamieDarijumi([{ arhivaKods: 'X1', konts: A }, { arhivaKods: 'X2' }, { arhivaKods: 'X3@0002', bankasKods: 'X3', konts: B }]);
  assert.equal(zin(A, 'X1'), true);
  assert.equal(zin(B, 'X1'), false, 'cita konta darījums ar tādu pašu kodu nav tas pats');
  assert.equal(zin(B, 'X2'), true, 'vecam ierakstam konts nav zināms');
  assert.equal(zin(B, 'X3'), true, 'glabātais ar galotni atpazīts pēc bankas koda');
});

test('kods glabāšanai nesaplūst ar cita konta darījumu', () => {
  const d = [{ arhivaKods: 'K1', konts: A }];
  assert.equal(glabajamaisKods(d, A, 'K1'), 'K1');
  assert.equal(glabajamaisKods(d, B, 'K1'), 'K1@0002');
  assert.equal(glabajamaisKods(d, B, 'K2'), 'K2');
});

test('izrakstu periodi apvienoti, iztrūkumi atrasti', () => {
  const p = kontuParklajums({
    a: { konts: A, no: '2026-01-01', lidz: '2026-01-31' }, b: { konts: A, no: '2026-02-01', lidz: '2026-03-31' },
    c: { konts: A, no: '2026-05-01', lidz: '2026-05-31' }, d: { konts: B, no: '2026-01-01', lidz: '2026-06-30' }, e: { konts: A, no: '2026-01-10', lidz: '2026-01-20' }
  });
  assert.deepEqual(p[A].periodi, [{ no: '2026-01-01', lidz: '2026-03-31' }, { no: '2026-05-01', lidz: '2026-05-31' }]);
  assert.deepEqual(p[A].iztrukumi, [{ no: '2026-04-01', lidz: '2026-04-30' }]);
  assert.equal(p[A].lidz, '2026-05-31');
  assert.equal(parklats(p, A, '2026-04-15'), false);
  assert.equal(parklats(p, B, '2026-04-15'), true);
});

test('izraksta maksājums atrod ar roku ievadīto: summa, ±7 dienas, maksātājs vai rēķins', () => {
  const d = [
    { arhivaKods: 'roku-1', arRoku: true, virziens: 'K', summa: 500, datums: '2026-03-10', partneris: 'Teātris A' },
    { arhivaKods: 'roku-2', arRoku: true, virziens: 'K', summa: 300, datums: '2026-03-10', partneris: 'Cits', saite: { tips: 'rekins', kods: 'r9' } },
    { arhivaKods: 'B1', virziens: 'K', summa: 500, datums: '2026-03-10', partneris: 'Teātris A' }
  ];
  assert.equal(atrastRokuIerakstu(d, { virziens: 'K', summa: 500, datums: '2026-03-15', partneris: 'Teātris A' })?.arhivaKods, 'roku-1');
  assert.equal(atrastRokuIerakstu(d, { virziens: 'K', summa: 500, datums: '2026-03-25', partneris: 'Teātris A' }), null, 'par tālu');
  assert.equal(atrastRokuIerakstu(d, { virziens: 'K', summa: 500.5, datums: '2026-03-10', partneris: 'Teātris A' }), null, 'cita summa');
  assert.equal(atrastRokuIerakstu(d, { virziens: 'K', summa: 300, datums: '2026-03-12', partneris: 'X', saite: { tips: 'rekins', kods: 'r9' } })?.arhivaKods, 'roku-2');
  assert.equal(atrastRokuIerakstu(d, { virziens: 'K', summa: 500, datums: '2026-03-10', partneris: 'Teātris A' }, undefined, new Set(['roku-1'])), null, 'katru izmanto vienreiz');
});

test('atzīmes: samaksātais, atmaksa ar mīnusu, salīdzinājums ar izrakstu', () => {
  const s = {
    [ceturksnaAtslega(2026, 1)]: { zinots: 154.8, maksajumi: [{ summa: 154.8, datums: '2026-04-20' }] },
    [ceturksnaAtslega(2026, 2)]: { zinots: 200, maksajumi: [{ summa: 150, datums: '2026-07-20' }, { summa: 50, datums: '2026-08-02' }] },
    [iinAtslega(2026)]: { zinots: -222.73, maksajumi: [{ summa: -10.54, datums: '2027-07-14' }] },
    [ceturksnaAtslega(2025, 4)]: { zinots: 1, maksajumi: [] }
  };
  const a = gadaAtzimes(s, 2026);
  assert.deepEqual(a.map((x) => x.kods), ['2026-C1', '2026-C2', '2026-IIN']);
  assert.equal(samaksatsAtzimei(a[1]), 200);
  assert.equal(samaksatsAtzimei(a[2]), -10.54);
  const r = salidzinatSamaksas(a, [{ datums: '2026-04-22', summa: 154.8 }, { datums: '2026-07-21', summa: 150 }, { datums: '2026-10-01', summa: 99 }]).rindas;
  assert.deepEqual(r.map((x) => x.statuss), ['sakrit', 'sakrit', 'nav-izraksta', 'nav-atzimets'], 'atmaksa (negatīva) netiek meklēta izrakstā');
});

test('bankas filtri: teksts, kategorija, virziens, periods, konts, bez saites', () => {
  const D = [
    { arhivaKods: '1', datums: '2026-01-05', partneris: 'DAILES TEĀTRIS VSIA', info: 'Rēķins 12', summa: 1000, virziens: 'K', kategorija: 'sd', konts: A, saite: { tips: 'rekins', kods: 'r' } },
    { arhivaKods: '2', datums: '2026-02-05', partneris: 'Fonds C', info: 'Grants', summa: 300, virziens: 'K', kategorija: 'sd', konts: B },
    { arhivaKods: '3', datums: '2026-02-23', partneris: 'VALSTS BUDŽETS', info: 'EDS', summa: 154.8, virziens: 'D', kategorija: 'vid-maksajums', konts: B },
    { arhivaKods: '4', datums: '2026-03-01', partneris: 'AKKA/LAA', info: 'autoratlīdzība', summa: 50, virziens: 'K', kategorija: 'akka', konts: A }
  ];
  const ids = (f, p) => filtretDarijumus(D, f, p).map((d) => d.arhivaKods);
  assert.deepEqual(ids({ teksts: 'dailes teatri' }), ['1']);
  assert.deepEqual(ids({ teksts: 'scenogrāfija' }, (d) => d.arhivaKods === '1' ? 'Scenogrāfija izrādei' : ''), ['1'], 'meklē arī rēķina pozīcijās');
  assert.deepEqual(ids({ kategorija: 'sd' }), ['1', '2']);
  assert.deepEqual(ids({ virziens: 'D' }), ['3']);
  assert.deepEqual(ids({ no: '2026-02-01', lidz: '2026-02-28' }), ['2', '3']);
  assert.deepEqual(ids({ konts: A }), ['1', '4']);
  assert.deepEqual(ids({ bezSaites: true }), ['2'], 'tikai ienākumi bez rēķina; AKKA un VID neskaitās');
  assert.equal(darijumuFiltrsAktivs({ teksts: ' ' }), false);
  assert.equal(darijumuFiltrsAktivs({ bezSaites: true }), true);
});
