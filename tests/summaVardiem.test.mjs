import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaVardiemLv, summaVardiemEn } from '../src/summaVardiem.js';

test('Latviski: locījumi un skaitļi', () => {
  assert.equal(summaVardiemLv(5300), 'Pieci tūkstoši trīs simti eiro, 00 centi');
  assert.equal(summaVardiemLv(1523.45), 'Viens tūkstotis pieci simti divdesmit trīs eiro, 45 centi');
  assert.equal(summaVardiemLv(21.01), 'Divdesmit viens eiro, 01 cents');
  assert.equal(summaVardiemLv(11000.11), 'Vienpadsmit tūkstoši eiro, 11 centi');
  assert.equal(summaVardiemLv(21000.21), 'Divdesmit viens tūkstotis eiro, 21 cents');
  assert.equal(summaVardiemLv(101), 'Simts viens eiro, 00 centi');
  assert.equal(summaVardiemLv(1000000), 'Viens miljons eiro, 00 centi');
});

test('Hanzas Perons stilā bez centiem', () => {
  assert.equal(summaVardiemLv(820, { arCentiem: false }), 'Astoņi simti divdesmit eiro.');
});

test('Angliski ārzemju pasūtītājiem', () => {
  assert.equal(summaVardiemEn(5300), 'Five thousand three hundred euros and 00 cents');
  assert.equal(summaVardiemEn(1523.45), 'One thousand five hundred twenty-three euros and 45 cents');
  assert.equal(summaVardiemEn(1.01), 'One euro and 01 cent');
});
