import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { VERSIJA } from '../src/versija.js';

const sakne = new URL('../', import.meta.url), sw = readFileSync(new URL('sw.js', sakne), 'utf8');
const faili = JSON.parse(`[${sw.match(/const FAILI = \[([\s\S]*?)\];/)[1].replace(/'/g, '"')}]`);

test('servisa skripta versija sakrīt ar rīka versiju', () => {
  assert.equal(sw.match(/const VERSIJA = '([^']+)'/)[1], VERSIJA);
});
test('kešā ir visi rīka faili, un visi saraksta faili eksistē', () => {
  for (const f of readdirSync(new URL('src/', sakne))) if (f.endsWith('.js')) assert.ok(faili.includes(`src/${f}`), `trūkst src/${f}`);
  for (const f of JSON.parse(readFileSync(new URL('rules/index.json', sakne))).gadi) assert.ok(faili.includes(`rules/${f}.json`), `trūkst rules/${f}.json`);
  for (const f of faili) if (f !== './') assert.ok(existsSync(new URL(f, sakne)), `nav faila ${f}`);
});
test('manifests un ikonas', () => {
  const m = JSON.parse(readFileSync(new URL('manifest.json', sakne)));
  assert.equal(m.display, 'standalone'); assert.equal(m.start_url, './');
  for (const i of m.icons) assert.ok(faili.includes(i.src), i.src);
});
