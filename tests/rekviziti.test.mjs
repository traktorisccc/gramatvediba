import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sadalitRekvizitus } from '../src/rekviziti.js';

test('Rekvizīti ar juridisko un faktisko adresi', () => {
  const r = sadalitRekvizitus(`Nodibinājums “Nodibinājums Liepāja 2027”
Juridiskā adrese: Rožu iela 6, Liepāja, Latvija, LV3401
Faktiskā adrese: Dārza iela 4/8, 2.stāvs, Liepāja, Latvija, LV-3401
Reģ. nr. 40008325039
Banka: AS “SEB banka” Kods: UNLALV2X
Konts: LV39UNLA0055003549403`);
  assert.deepEqual(r, { nosaukums: 'Nodibinājums “Nodibinājums Liepāja 2027”', regNr: '40008325039', iela: 'Rožu iela 6', pilseta: 'Liepāja', indekss: 'LV-3401', valsts: 'LV', epasts: '' });
});

test('Rekvizīti īsā formā ar komatu aiz nosaukuma', () => {
  const r = sadalitRekvizitus(`SIA “LIEPĀJAS REĢIONA TŪRISMA INFORMĀCIJAS BIROJS”,
reģ. Nr. 40003302839
Juridiskā adrese Rožu laukums 5/6, Liepāja, LV-3401`);
  assert.equal(r.nosaukums, 'SIA “LIEPĀJAS REĢIONA TŪRISMA INFORMĀCIJAS BIROJS”');
  assert.equal(r.regNr, '40003302839');
  assert.deepEqual([r.iela, r.pilseta, r.indekss], ['Rožu laukums 5/6', 'Liepāja', 'LV-3401']);
});

test('Bez marķieriem: numurs, adrese un e-pasts tiek atrasti, konts netiek sajaukts ar reģ. nr.', () => {
  const r = sadalitRekvizitus(`Parauga teātris VSIA
40003000005
Brīvības iela 75, Rīga, LV-1001
gramatvediba@paraugs.lv
LV00TEST0000000000000`);
  assert.deepEqual(r, { nosaukums: 'Parauga teātris VSIA', regNr: '40003000005', iela: 'Brīvības iela 75', pilseta: 'Rīga', indekss: 'LV-1001', valsts: 'LV', epasts: 'gramatvediba@paraugs.lv' });
});

test('Tukšs vai nesaprotams teksts neko neizdomā', () => {
  assert.deepEqual(sadalitRekvizitus('labdien, nosūtu vēlāk'), { nosaukums: 'labdien, nosūtu vēlāk', regNr: '', iela: '', pilseta: '', indekss: '', valsts: 'LV', epasts: '' });
});
