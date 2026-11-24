import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaVardiemLv, summaVardiemEn } from '../src/summaVardiem.js';

test('Latviski: centi vārdiem, apaļām summām bez centiem', () => {
  assert.equal(summaVardiemLv(1000.68), 'Viens tūkstotis eiro un sešdesmit astoņi centi');
  assert.equal(summaVardiemLv(1000), 'Viens tūkstotis eiro');
  assert.equal(summaVardiemLv(5300), 'Pieci tūkstoši trīs simti eiro');
  assert.equal(summaVardiemLv(1523.45), 'Viens tūkstotis pieci simti divdesmit trīs eiro un četrdesmit pieci centi');
  assert.equal(summaVardiemLv(21.01), 'Divdesmit viens eiro un viens cents');
  assert.equal(summaVardiemLv(5.21), 'Pieci eiro un divdesmit viens cents');
  assert.equal(summaVardiemLv(11000.11), 'Vienpadsmit tūkstoši eiro un vienpadsmit centi');
  assert.equal(summaVardiemLv(340.5), 'Trīs simti četrdesmit eiro un piecdesmit centi');
  assert.equal(summaVardiemLv(101), 'Simts viens eiro');
  assert.equal(summaVardiemLv(1000000), 'Viens miljons eiro');
  assert.equal(summaVardiemLv(0.1 + 0.2), 'Nulle eiro un trīsdesmit centi');
});

test('Angliski ārzemju pasūtītājiem', () => {
  assert.equal(summaVardiemEn(5300), 'Five thousand three hundred euros');
  assert.equal(summaVardiemEn(1523.45), 'One thousand five hundred twenty-three euros and forty-five cents');
  assert.equal(summaVardiemEn(1.01), 'One euro and one cent');
});
