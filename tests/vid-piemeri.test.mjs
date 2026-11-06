// Publiskie testi: VID metodiskā materiāla "Nodokļi no autoratlīdzības 2026. gadā" piemēri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { menesuIenakumi, ceturksnaZinojums, vsaoiMenesim } from '../src/calc.js';

const n2026 = JSON.parse(readFileSync(new URL('../rules/2026.json', import.meta.url)));

test('Rolands: 25 % norma, jūlijs 610 €, septembris 2100 €', () => {
  const m = menesuIenakumi([
    { datums: '2026-07-20', summa: 610, veids: 'lekcija-autorligums', kategorija: 'sd' },
    { datums: '2026-09-15', summa: 2100, veids: 'lekcija-autorligums', kategorija: 'sd' }
  ], 2026);
  const q3 = ceturksnaZinojums(m, 3, n2026);
  assert.equal(q3.kopa.vsaoi, 242.35);
  assert.equal(q3.kopa.pens, 125.25);
  // VID materiālā kopsumma norādīta 367,80, bet 242,35 + 125,25 = 367,60 (aritmētikas kļūda materiālā)
  assert.equal(q3.jaMaksa, 367.60);
});

test('1600 € ar 50 % normu vienā mēnesī → VSAOI 244,35 €', () => {
  const v = vsaoiMenesim(800, n2026);
  assert.equal(v.vsaoi + v.pens, 244.35);
});

test('Ienākums zem minimālās algas → tikai 10 %', () => {
  assert.deepEqual(vsaoiMenesim(457.5, n2026), { objekts: 0, vsaoi: 0, pensObjekts: 457.5, pens: 45.75 });
});
