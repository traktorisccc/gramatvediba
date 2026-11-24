import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtretRekinus, celms, filtrsAktivs } from '../src/meklesana.js';

const R = [
  { id: 'a', datums: '2026-01-10', pasutitajsId: 'p1', pozicijas: [{ nosaukums: 'Ziemassvētku animācija izrādei' }] },
  { id: 'b', datums: '2026-03-05', pasutitajsId: 'p2', pozicijas: [{ nosaukums: 'Scenogrāfija' }, { nosaukums: 'Video animācijas' }] },
  { id: 'c', datums: '2026-12-01', pasutitajsId: 'p1', pozicijas: [{ nosaukums: 'Plakāts' }] },
];
const ids = (x) => x.map((r) => r.id);

test('teksts: bez garumzīmēm, citā locījumā, visi vārdi', () => {
  assert.deepEqual(ids(filtretRekinus(R, { teksts: 'Ziemassvētku animācijas' })), ['a']);
  assert.deepEqual(ids(filtretRekinus(R, { teksts: 'animacija' })), ['a', 'b']);
  assert.deepEqual(ids(filtretRekinus(R, { teksts: 'ANIMĀCIJĀM' })), ['a', 'b']);
  assert.deepEqual(ids(filtretRekinus(R, { teksts: 'animācija plakāts' })), []);
  assert.deepEqual(ids(filtretRekinus(R, { teksts: '   ' })), ['a', 'b', 'c']);
});

test('pasūtītājs un periods', () => {
  assert.deepEqual(ids(filtretRekinus(R, { pasutitajsId: 'p1' })), ['a', 'c']);
  assert.deepEqual(ids(filtretRekinus(R, { no: '2026-03-05', lidz: '2026-11-30' })), ['b']);
  assert.deepEqual(ids(filtretRekinus(R, { pasutitajsId: 'p1', teksts: 'plakatu', no: '2026-06-01' })), ['c']);
});

test('celms un aktīvs filtrs', () => {
  assert.equal(celms('Ziemassvētku'), 'ziemassvetk');
  assert.equal(celms('video'), 'video');
  assert.equal(filtrsAktivs({ teksts: ' ' }), false);
  assert.equal(filtrsAktivs({ no: '2026-01-01' }), true);
});
