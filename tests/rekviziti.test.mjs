import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sadalitRekvizitus } from '../src/rekviziti.js';

test('Rekvizīti ar juridisko un faktisko adresi', () => {
  const r = sadalitRekvizitus(`Nodibinājums “Nodibinājums Parauga fonds”
Juridiskā adrese: Parauga iela 6, Liepāja, Latvija, LV3401
Faktiskā adrese: Testa iela 4/8, 2.stāvs, Liepāja, Latvija, LV-3401
Reģ. nr. 40008000001
Banka: AS “SEB banka” Kods: UNLALV2X
Konts: LV00UNLA0000000000002`);
  assert.deepEqual(r, { nosaukums: 'Nodibinājums “Nodibinājums Parauga fonds”', regNr: '40008000001', iela: 'Parauga iela 6', pilseta: 'Liepāja', indekss: 'LV-3401', valsts: 'LV', epasts: '',
    konts: 'LV00UNLA0000000000002', banka: 'AS “SEB banka”', bic: 'UNLALV2X' });
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
  assert.deepEqual(r, { nosaukums: 'Parauga teātris VSIA', regNr: '40003000005', iela: 'Brīvības iela 75', pilseta: 'Rīga', indekss: 'LV-1001', valsts: 'LV', epasts: 'gramatvediba@paraugs.lv',
    konts: 'LV00TEST0000000000000', banka: '', bic: '' });
});

test('Tukšs vai nesaprotams teksts neko neizdomā', () => {
  assert.deepEqual(sadalitRekvizitus('labdien, nosūtu vēlāk'), { nosaukums: 'labdien, nosūtu vēlāk', regNr: '', iela: '', pilseta: '', indekss: '', valsts: 'LV', epasts: '', konts: '', banka: '', bic: '' });
});

test('Pašvaldības rekvizīti ar uzrakstiem un bankas datiem', () => {
  const r = sadalitRekvizitus(`Pasūtītājs: Parauga pilsētas pašvaldības administrācija
Adrese: Rožu iela 1, Paraugi, LV-3401
Reģistrācijas Nr.: 90000000001
Konta numurs: LV00UNLA0000000000001
Banka: A/S SEB Bankas Paraugu filiāle
Bankas kods: UNLALV2X`);
  assert.deepEqual(r, { nosaukums: 'Parauga pilsētas pašvaldības administrācija', regNr: '90000000001', iela: 'Rožu iela 1', pilseta: 'Paraugi', indekss: 'LV-3401', valsts: 'LV', epasts: '',
    konts: 'LV00UNLA0000000000001', banka: 'A/S SEB Bankas Paraugu filiāle', bic: 'UNLALV2X' });
});

test('Uzraksts „Saņēmējs:” netiek iekļauts nosaukumā', () => {
  assert.equal(sadalitRekvizitus('Saņēmējs: Parauga kultūras pārvalde\nReģ. Nr. 90000000002').nosaukums, 'Parauga kultūras pārvalde');
});
