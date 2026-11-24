import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sagatavotVestuli, derigaAdrese, drosNosaukums } from '../src/gmail.js';

const fails = { nosaukums: 'Paraugs_rekins_2_2026.pdf', saturs: new Uint8Array([37, 80, 68, 70, 0, 255, 1, 2]), tips: 'application/pdf' };
const v = { no: { vards: 'Anna Pārbaudītāja', epasts: 'anna@example.com' }, kam: 'rekini@paraugs.lv', temats: 'Rēķins Nr. 2', teksts: 'Labdien!\n\nPielikumā rēķins.\nAr cieņu', fails };
const dekodet = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
const galv = (m, k) => (m.split('\r\n\r\n')[0].split('\r\n').find((l) => l.startsWith(k + ': ')) || '').slice(k.length + 2);

test('vēstule: galvenes, UTF-8 temats, teksts un pielikums atkodējami', () => {
  const m = sagatavotVestuli(v, 'ROBEZA');
  assert.equal(galv(m, 'To'), 'rekini@paraugs.lv');
  assert.match(galv(m, 'From'), /^=\?UTF-8\?B\?.+\?= <anna@example\.com>$/);
  assert.equal(dekodet(galv(m, 'Subject').slice(10, -2)), 'Rēķins Nr. 2');
  const dalas = m.split('--ROBEZA');
  assert.equal(dalas.length, 4); assert.ok(dalas[3].startsWith('--'));
  const t = dalas[1].split('\r\n\r\n')[1].replace(/\r\n/g, '');
  assert.equal(dekodet(t), 'Labdien!\r\n\r\nPielikumā rēķins.\r\nAr cieņu');
  assert.match(dalas[2], /Content-Disposition: attachment; filename="Paraugs_rekins_2_2026.pdf"/);
  const p = Uint8Array.from(atob(dalas[2].split('\r\n\r\n')[1].replace(/\r\n/g, '')), (c) => c.charCodeAt(0));
  assert.deepEqual([...p], [...fails.saturs]);
  assert.ok(m.split('\r\n').every((l) => l.length <= 998));
});

test('nevar ievietot papildu galvenes vai saņēmējus', () => {
  for (const kam of ['a@b.lv\r\nBcc: x@y.lv', 'a@b.lv, x@y.lv', 'Vārds <a@b.lv>', 'a@b', '', 'a b@c.lv'])
    assert.throws(() => sagatavotVestuli({ ...v, kam }), /adrese/);
  const m = sagatavotVestuli({ ...v, temats: 'Rēķins\r\nBcc: x@y.lv', no: { vards: 'Ann"a\r\nBcc: z@y.lv', epasts: 'anna@example.com' } });
  const g = m.split('\r\n\r\n')[0].split('\r\n');
  assert.ok(!g.some((l) => l.startsWith('Bcc')));
  assert.equal(g.length, 5);
});

test('adreses un faila nosaukums', () => {
  assert.ok(derigaAdrese('vards.uzvards+rekini@sub.example.lv'));
  assert.ok(!derigaAdrese('vārds@piemērs.lv'));
  assert.equal(drosNosaukums('Rēķins 27/2026 "x".pdf'), 'Rekins_27_2026_x_.pdf');
});
