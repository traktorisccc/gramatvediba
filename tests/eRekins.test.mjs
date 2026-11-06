// Publiskie testi ar izdomātiem datiem. Īsto atbilstību pārbauda ar Peppol validatoru.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eRekinsXml } from '../src/eRekins.js';

export const PARAUGS = {
  numurs: '027', datums: '2026-11-10', termins: '2026-11-24', ligumaNr: 'L-2026/15',
  pardevejs: { nosaukums: 'Jānis Paraugs', regNr: '01010112345', adrese: { iela: 'Parauga iela 1-2', pilseta: 'Rīga', indekss: 'LV-1001' }, epasts: 'janis@example.com' },
  pircejs: { nosaukums: 'Parauga pilsētas pašvaldības iestāde', regNr: '90000000001', adrese: { iela: 'Rātslaukums 1', pilseta: 'Paraugpils', indekss: 'LV-3401' } },
  pozicijas: [{ nosaukums: 'Atlīdzība par autordarba "Video projekcijas" radīšanu un izmantošanas tiesību nodošanu', daudzums: 1, cena: 350 }],
  iban: 'LV00 TEST 0000 0000 0000 0', bic: 'HABALV22'
};

// Vienkārša tagu līdzsvara pārbaude (vai XML ir labi formēts)
function labiFormets(xml) {
  const steks = [];
  for (const m of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) steks.push(m[2]); else if (steks.pop() !== m[2]) return false;
  }
  return steks.length === 0;
}

test('E-rēķins ir labi formēts un satur Peppol obligātos elementus', () => {
  const x = eRekinsXml(PARAUGS);
  assert.ok(labiFormets(x));
  for (const s of ['urn:fdc:peppol.eu:2017:poacc:billing:3.0', '<cbc:InvoiceTypeCode>380', 'schemeID="0218">01010112345', 'schemeID="0218">90000000001',
    '<cbc:BuyerReference>L-2026/15', '<cbc:ID>O</cbc:ID>', 'VATEX-EU-O', '<cbc:ID>LV00TEST0000000000000</cbc:ID>'])
    assert.ok(x.includes(s), `trūkst: ${s}`);
  assert.ok(!x.includes('<cbc:Percent>'), 'kategorijai O likmi nenorāda');
  assert.ok(!x.includes('PartyTaxScheme'), 'PVN numurus nenorāda');
});

test('Summas sakrīt un ir ar diviem cipariem aiz komata', () => {
  const x = eRekinsXml({ ...PARAUGS, pozicijas: [{ nosaukums: 'A', daudzums: 3, cena: 116.67 }, { nosaukums: 'B', daudzums: 1, cena: 0.5 }] });
  assert.equal((x.match(/<cbc:PayableAmount currencyID="EUR">([\d.]+)</) || [])[1], '350.51');
  assert.ok(x.includes('<cbc:LineExtensionAmount currencyID="EUR">350.01</cbc:LineExtensionAmount><cac:Item><cbc:Name>A'));
});

test('Pēdiņas un & tiek pareizi aizsargāti', () => {
  const x = eRekinsXml({ ...PARAUGS, pircejs: { ...PARAUGS.pircejs, nosaukums: 'SIA "A & B"' } });
  assert.ok(x.includes('SIA &quot;A &amp; B&quot;'));
});
