import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apvienot, atrisinat, stabils } from '../src/apvienot.js';

const D = (x = {}) => ({ versija: 1, profils: { vards: 'A', nakamaisNr: 3 }, rekini: [], autorligumi: [], pasutitaji: [], darijumi: [], maksataji: {}, gadi: {}, ...x });

test('atslēgu secība nerada konfliktu', () => {
  assert.equal(stabils({ a: 1, b: { c: 2, d: 3 } }), stabils({ b: { d: 3, c: 2 }, a: 1 }));
  const b = D({ rekini: [{ id: 'r', nr: 1, summa: 5 }] });
  const r = apvienot(b, D({ rekini: [{ summa: 5, nr: 1, id: 'r' }] }), b);
  assert.equal(r.konflikti.length, 0);
});

test('darījumi pēc arhīva koda; kartes un profils pa laukiem', () => {
  const b = D({ darijumi: [{ arhivaKods: 'k1', kategorija: 'jaizverte' }], maksataji: { x: 'sd' } });
  const l = D({ darijumi: [{ arhivaKods: 'k1', kategorija: 'sd' }, { arhivaKods: 'k2' }], maksataji: { x: 'sd', y: 'personigs' }, profils: { vards: 'A', iban: 'LV1', nakamaisNr: 3 } });
  const a = D({ darijumi: [{ arhivaKods: 'k1', kategorija: 'jaizverte' }, { arhivaKods: 'k3' }], maksataji: {}, profils: { vards: 'B', nakamaisNr: 3 } });
  const r = apvienot(b, l, a);
  assert.equal(r.konflikti.length, 0);
  assert.deepEqual(r.dati.darijumi.map((d) => [d.arhivaKods, d.kategorija]), [['k1', 'sd'], ['k3', undefined], ['k2', undefined]]);
  assert.deepEqual(r.dati.maksataji, { y: 'personigs' });          // x dzēsts Drive, pārlūkā nemainīts
  assert.deepEqual([r.dati.profils.vards, r.dati.profils.iban], ['B', 'LV1']);
});

test('rēķinu numurs: nākamais nekad neatkārto esošu, dubulti numuri tiek parādīti', () => {
  const b = D({ rekini: [{ id: 'a', nr: 1 }, { id: 'b', nr: 2 }] });
  const l = D({ rekini: [...b.rekini, { id: 'l', nr: 3 }], profils: { vards: 'A', nakamaisNr: 4 } });
  const a = D({ rekini: [...b.rekini, { id: 'm', nr: 3 }], profils: { vards: 'A', nakamaisNr: 4 } });
  const r = apvienot(b, l, a);
  assert.equal(r.dati.profils.nakamaisNr, 4);
  assert.deepEqual(r.kopsavilkums.dubultiNumuri, [3]);
  assert.equal(r.dati.rekini.length, 4);
});

test('labots pārlūkā, dzēsts Drive → konflikts; atrisinat ievēro izvēli', () => {
  const b = D({ rekini: [{ id: 'a', nr: 1, summa: 1 }] });
  const r = apvienot(b, D({ rekini: [{ id: 'a', nr: 1, summa: 2 }] }), D());
  assert.equal(r.konflikti.length, 1);
  assert.deepEqual(atrisinat(r, 'parluks').rekini.map((x) => x.summa), [2]);
  const r2 = apvienot(b, D(), D({ rekini: [{ id: 'a', nr: 1, summa: 3 }] }));   // dzēsts pārlūkā, labots Drive
  assert.deepEqual(atrisinat(r2, 'parluks').rekini, []);
  assert.deepEqual(atrisinat(r2, 'drive').rekini.map((x) => x.summa), [3]);
});
