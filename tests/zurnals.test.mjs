import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zurnals } from '../src/zurnals.js';
import { d3 } from '../src/calc.js';

const sd = [
  { datums: '2026-05-05', partneris: 'Skola C', info: 'Lekcija', veids: 'lekcija-pakalpojums', summa: 150 },
  { datums: '2026-01-10', partneris: 'Teātris A', info: 'Rēķins #1', veids: '90.13', summa: 2000.25, pozicija: 'Scenogrāfija; Video' },
  { datums: '2026-01-20', partneris: 'Studija B', info: 'Rēķins #2', veids: '59.11', summa: 300 },
  { datums: '2025-12-30', partneris: 'Vecs', info: '', veids: '90.13', summa: 999 }
];
const citi = [{ datums: '2026-01-10', partneris: 'Teātris D', info: 'Autoratlīdzība', summa: 400, iemesls: 'Nodokļus samaksāja izmaksātājs', pozicija: 'Plakāts' }];

test('ceturkšņi, numerācija, starpsummas', () => {
  const z = zurnals(sd, citi, 2026);
  assert.deepEqual(z.ceturksni.map((c) => c.rindas.length), [3, 1, 0, 0]);
  const r = z.ceturksni[0].rindas;
  assert.deepEqual(r.map((x) => x.nr), [1, 2, 3]);
  assert.equal(r[0].sd, true); assert.equal(r[1].sd, false);           // tajā pašā dienā SD rinda pirmā
  assert.equal(r[0].nosacitie, 1000.13); assert.equal(r[0].pozicija, 'Scenogrāfija; Video');
  assert.equal(r[1].ienemumi, null); assert.equal(r[1].neieskaitits, 400); assert.equal(r[1].veidaTeksts, 'Nodokļus samaksāja izmaksātājs');
  assert.deepEqual(z.ceturksni[0].kopa, { ienemumi: 2300.25, nosacitie: 1150.13, ienakums: 1150.12, neieskaitits: 400 });
  assert.equal(z.ceturksni[1].kopa.nosacitie, 0);                       // lekcija kā pakalpojums: 0 %
});

test('gada kopsumma sakrīt ar D3', () => {
  const z = zurnals(sd, citi, 2026), x = d3(sd.map((e) => ({ ...e, kategorija: 'sd' })), 2026);
  assert.equal(z.kopa.ienemumi, x.ienemumi); assert.equal(z.kopa.nosacitie, x.izdevumi); assert.equal(z.kopa.ienakums, x.apliekamie);
  assert.equal(z.kopa.neieskaitits, 400);
});
