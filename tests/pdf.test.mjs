// Rēķina PDF: struktūra, latviešu burti un teksta kopēšana (ToUnicode).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rekinsPdf, pdfFailaVards, lasitFontu, aplauzt, platums } from '../src/pdf.js';

const fonts = (n) => readFileSync(new URL(`../fonts/GramatvedibaSans-${n}.ttf`, import.meta.url));
const fonti = { regular: fonts('Regular'), bold: fonts('Bold') };
const r = { nr: 27, datums: '2026-11-23', termins: '2026-12-07', valoda: 'lv', pozicijas: [{ nosaukums: 'Scenogrāfija un video\nizrādei „Ūdenszirgs”', daudzums: 1, cena: 1212 }] };
const profils = { vards: 'Anna Paraugs', personasKods: '010101-10000', iban: 'LV00TEST0000000000000', bic: 'HABALV22', vieta: 'Rīgā', adrese: { iela: 'Jaunā iela 5', pilseta: 'Rīga', indekss: 'LV-1001' } };
const pas = { nosaukums: 'Parauga pārvalde', regNr: '90000000001', adrese: { iela: 'Rožu iela 1', pilseta: 'Paraugi', indekss: 'LV-3401' }, konts: 'LV00UNLA0000000000001' };

async function straumes(pdf) {
  let t = ''; for (const b of pdf) t += String.fromCharCode(b);   // baiti 1:1 (ne windows-1252)
  const rez = [];
  for (const m of t.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    const b = Uint8Array.from(m[1], (c) => c.charCodeAt(0));
    try { rez.push(new TextDecoder().decode(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())); } catch { /* fonts */ }
  }
  return { t, rez };
}

test('Fonts satur latviešu burtus un €', () => {
  const f = lasitFontu(fonti.regular);
  for (const ch of 'āčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽ€„”–') assert.ok(f.karte.get(ch.codePointAt(0)), ch);
  assert.ok(platums(f, 'Rēķins', 11) > 30);
  const rindas = aplauzt(f, 'viens divi trīs četri pieci seši', 11, 40);
  assert.ok(rindas.length > 1 && rindas.every((x) => platums(f, x, 11) <= 40)); assert.equal(rindas.join(' '), 'viens divi trīs četri pieci seši');
  assert.deepEqual(aplauzt(f, 'a\nb', 11, 100), ['a', 'b']);
});

test('PDF: derīga struktūra, iegulti fonti, teksts kopējams', async () => {
  const pdf = await rekinsPdf(r, profils, pas, fonti);
  const { t, rez } = await straumes(pdf);
  assert.ok(t.startsWith('%PDF-1.7'), 'galva'); assert.ok(t.trimEnd().endsWith('%%EOF'), 'beigas');
  assert.equal((t.match(/\/FontFile2/g) || []).length, 2);
  assert.ok(rez.length >= 4, `straumes ${rez.length}`);
  const f = lasitFontu(fonti.bold), hex = [...'RĒĶINS'].map((c) => f.karte.get(c.codePointAt(0)).toString(16).padStart(4, '0').toUpperCase()).join('');
  assert.ok(rez.some((s) => s.includes(`<${hex}`)), 'virsraksts kā glifi');
  const tu = rez.filter((s) => s.includes('beginbfchar')).join('\n');
  assert.match(tu, /<0101>/);            // ā → U+0101 kopējot
  assert.ok(pdf.length < 80000, `izmērs ${pdf.length}`);
});

test('Faila nosaukums', () => {
  assert.equal(pdfFailaVards('Ēriks Ūdris', r, 'Liepājas Kultūras pārvalde'), 'Eriks_Udris_rekins_27_2026_Liepajas_Kulturas_parvalde.pdf');
});
