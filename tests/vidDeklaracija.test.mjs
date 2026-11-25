import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lasitVidDeklaraciju, gadaLauki, salidzinat } from '../src/vidDeklaracija.js';

const n = JSON.parse(readFileSync(new URL('../rules/2025.json', import.meta.url)));
// Izdomāta deklarācija tādā pašā struktūrā kā EDS XML (bez īstiem datiem).
const XML = `<?xml version="1.0" encoding="utf-8"?><DeclarationFile><Declaration Id="DEC"><DokIINGDv13>
<Id>1001</Id><IesniegumaDatums>2026-05-02</IesniegumaDatums><NmrKods>01010110000</NmrKods><TaksGads>2025</TaksGads><IbanNumurs>LV00TEST0000000000000</IbanNumurs>
<PielikumsD1><R><AplIenak>500.00</AplIenak><NodAvanss>127.50</NodAvanss><Vsaoi>0.00</Vsaoi></R><R><AplIenak>100.00</AplIenak><NodAvanss>25.50</NodAvanss><Vsaoi>0</Vsaoi></R></PielikumsD1>
<PielikumsD1p><R><MaksSumma>-0.01</MaksSumma></R></PielikumsD1p>
<PielikumsD3><A05>12000.00</A05><A06>0</A06><A08>12000.00</A08><A09>0</A09><A10>0</A10><A11>12000.00</A11></PielikumsD3>
<PielikumiD4><D4><AttDokumenti><R><Summa>300.00</Summa></R></AttDokumenti><SummaIA>300.00</SummaIA><SummaZP>0</SummaZP><LimitsPersonai>600</LimitsPersonai>
<IeprGaduTabula><D4R><A1>2023</A1><A4>0</A4></D4R><D4R><A1>2024</A1><A4>100.00</A4></D4R></IeprGaduTabula></D4></PielikumiD4>
<SadalaD><D01>12600.00</D01><AIPDati><R><Veids>A</Veids><Summa>500.00</Summa><Gads>2024</Gads></R><R><Veids>P</Veids><Summa>1000.00</Summa><Gads>2025</Gads></R></AIPDati>
<D04>12600.00</D04><D05>0</D05><D06>2000.00</D06><D07>0.00</D07><D08>400</D08><D09>1000.00</D09><D10>3400.00</D10><D11>6120.00</D11><D18>785.40</D18><D19>-0.01</D19><D23>153.00</D23><D24>632.39</D24><D25>0</D25></SadalaD>
</DokIINGDv13></Declaration><UserCredentials><Drawer>VID</Drawer></UserCredentials></DeclarationFile>`;

test('nolasa tikai skaitļus; personas dati netiek atgriezti', () => {
  const v = lasitVidDeklaraciju(XML);
  assert.equal(v.gads, 2025); assert.equal(v.sagatavotajs, 'VID');
  assert.deepEqual(v.d1, { apliekamie: 600, ieturetais: 153, vsaoi: 0 });
  assert.equal(v.d3.ienemumi, 12000); assert.equal(v.d4.izglitibaArstnieciba, 300); assert.equal(v.aipSisGads, 1000);
  assert.ok(!JSON.stringify(v).includes('01010110000') && !JSON.stringify(v).includes('LV00TEST'));
  assert.deepEqual(gadaLauki(v), { d1Apliekamie: 600, d1Ieturetais: 153, citiNodokli: -0.01, dzivibasIemaksas: 1000, attaisnotie: 400, vsaoiDeklareta: 2000 });
  assert.throws(() => lasitVidDeklaraciju('<Cits/>'), /nav gada ienākumu deklarācijas/);
});

test('VID versija tiek atkārtota precīzi; pareizā D3 dod instrukcijas', () => {
  const v = lasitVidDeklaraciju(XML);
  const kaVid = salidzinat(v, { ienemumi: 12000, izdevumi: 0, apliekamie: 12000 }, n);
  assert.equal(kaVid.pareizi.r18, 785.4); assert.equal(kaVid.pareizi.r24, 632.39); assert.equal(kaVid.jaievada, false);
  const s = salidzinat(v, { ienemumi: 12000, izdevumi: 6000, apliekamie: 6000 }, n, 1800);
  assert.equal(s.pareizi.r1, 6600); assert.equal(s.pareizi.r9, 660); assert.equal(s.pareizi.r8, 0);   // limits: 6600−2000−660−6120 < 0
  assert.equal(s.pareizi.r25, 153.01); assert.equal(s.pareizi.attaisnotieParnests, 400);
  assert.deepEqual(s.rindas.filter((r) => r.darbiba === 'ievadit').map((r) => [r.lapa, r.rinda, r.pareizi]), [['D3', '6', 6000]]);
  assert.match(s.soli.join('\n'), /rindā 6 .* ieraksti 6 000,00 €/);
  assert.match(s.soli.join('\n'), /rindā 25 jābūt 153,01 € \(atmaksa\)/);
  assert.ok(s.piezimes.some((p) => /VSAOI deklarācijā/.test(p)));
});
