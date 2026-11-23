// Pārskats grāmatvedim: izdomāti dati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parskatsLapas, gadaParskats, VID_MAKSAJUMS, PERSONIGIE } from '../src/parskats.js';
import { kolonna, excelDatums } from '../src/xlsx.js';

const n = JSON.parse(readFileSync(new URL('../rules/2026.json', import.meta.url)));
const ie = {
  gads: 2026, n, provizoriski: false, vards: 'Anna Paraugs', izveidots: '2026-11-23',
  ieraksti: [
    { datums: '2026-01-10', partneris: 'Teātris A', info: 'Rēķins #1', veids: '90.13', summa: 2000 },
    { datums: '2026-01-20', partneris: 'Studija B', info: 'Rēķins #2', veids: '59.11', summa: 300 },
    { datums: '2026-05-05', partneris: 'Skola C', info: 'Lekcija', veids: 'lekcija-pakalpojums', summa: 150 }
  ],
  darijumi: [
    { datums: '2026-01-10', partneris: 'Teātris A', info: 'Rēķins #1', virziens: 'K', summa: 2000, kategorija: 'Saimnieciskā darbība', aprekina: true, piesaiste: 'Rēķins #1', nodokluGads: '', avots: 'bankas izraksts' },
    { datums: '2026-02-01', partneris: 'AKKA/LAA', info: 'Autoratlīdzība', virziens: 'K', summa: 80, kategorija: 'AKKA/LAA (D1)', aprekina: false, piesaiste: '', nodokluGads: '', avots: 'bankas izraksts' },
    { datums: '2026-04-23', partneris: 'VID', info: 'VSAOI', virziens: 'D', summa: 100, kategorija: VID_MAKSAJUMS, aprekina: false, piesaiste: '', nodokluGads: 2026, avots: 'ievadīts ar roku' }
  ],
  rekini: [{ numurs: '#1', datums: '2026-01-05', pasutitajs: 'Teātris A', veids: '90.13', summa: 2000, samaksats: 2000, statuss: 'apmaksāts' }],
  ligumi: [],
  g: { d1Apliekamie: 0, d1Ieturetais: 0, citiNodokli: 0, dzivibasIemaksas: 0, attaisnotie: 0, vsaoiDeklareta: '' }
};

const sunas = (lapa) => Object.fromEntries(lapa.rindas.flatMap((r, i) => (r || []).map((c, j) => [kolonna(j) + (i + 1), c])));

test('Kolonnu burti un Excel datumi', () => {
  assert.deepEqual([0, 25, 26, 27].map(kolonna), ['A', 'Z', 'AA', 'AB']);
  assert.equal(excelDatums('2026-01-01'), 46023);
});

test('Kopsavilkuma skaitļi sakrīt ar aprēķinu kodolu', () => {
  const k = sunas(parskatsLapas(ie)[0]);
  // janvāris: 2000 × 50 % + 300 × 50 % → ienākums 1150 ≥ 780 → 242,35 + 37,00; maijs: 150 bez normas → 15,00
  assert.equal(k.B6.v, 2450); assert.equal(k.B7.v, 1150); assert.equal(k.B8.v, 1300);
  assert.equal(k.B9.v, 294.35);
  assert.equal(k.B13.v, 100);                                       // samaksāts VID par 2026
  assert.match(k.B13.f, /SUMIFS/);
});

test('Formulas atsaucas tikai uz esošām lapām', () => {
  const lapas = parskatsLapas(ie), vardi = new Set(lapas.map((l) => l.nosaukums));
  for (const l of lapas) for (const r of l.rindas) for (const c of r || []) {
    if (!c?.f) continue;
    for (const [, v] of c.f.matchAll(/'([^']+)'!/g)) assert.ok(vardi.has(v), `${l.nosaukums}: ${c.f}`);
  }
});

test('Fails ir derīgs ZIP ar 7 lapām', () => {
  const b = gadaParskats(ie);
  assert.equal(String.fromCharCode(b[0], b[1]), 'PK');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), beigas = b.length - 22;
  assert.equal(dv.getUint32(beigas, true), 0x06054b50);
  assert.equal(dv.getUint16(beigas + 10, true), 5 + 7);           // 5 pamatfaili + 7 lapas
});

test('Tukšs gads nesalūzt; bez rēķiniem un līgumiem lapas „Rēķini un līgumi” nav', () => {
  const lapas = parskatsLapas({ ...ie, ieraksti: [], darijumi: [], rekini: [] });
  assert.equal(sunas(lapas[0]).B6.v, 0);
  assert.ok(!lapas.some((l) => l.nosaukums === 'Rēķini un līgumi'));
  assert.ok(!lapas[0].rindas.some((r) => r[0] === 'Rēķini un līgumi'));
  assert.ok(gadaParskats({ ...ie, ieraksti: [], darijumi: [], rekini: [] }).length > 1000);
});

test('Ar darbību nesaistītie maksājumi: tikai kopsumma, bez maksātāja', () => {
  const lapas = parskatsLapas({ ...ie, nesaistiti: 120 }), banka = lapas.find((l) => l.nosaukums === 'Banka');
  const rindas = banka.rindas.map((r) => (r || []).map((c) => (c && typeof c === 'object' ? c.v : c)));
  const citi = rindas.find((r) => r[0] === PERSONIGIE), kopa = rindas.find((r) => r[0] === 'Kopā ienākošie');
  assert.equal(citi[4], 120);
  assert.equal(kopa[4], 2000 + 80 + 120);
});
