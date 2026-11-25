// Sinhronizācija ar Google Drive: viltots Drive atmiņā, izdomāti dati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { izlemt, izveidotSinhronizatoru } from '../src/sinhronizacija.js';

test('Lēmumu tabula', () => {
  const v = (zinamaVersija, attalais, lokalsMainits, lokaliIrDati = true) => izlemt({ zinamaVersija, attalais, lokalsMainits, lokaliIrDati });
  assert.equal(v(null, null, false), 'izveidot');
  assert.equal(v(null, { version: '3' }, false, false), 'lejupieladet');   // jauna ierīce, tukšs pārlūks
  assert.equal(v(null, { version: '3' }, false, true), 'izvele');          // pirmā saite, abās pusēs dati
  assert.equal(v('3', { version: '3' }, false), 'nekas');
  assert.equal(v('3', { version: '3' }, true), 'augsupieladet');
  assert.equal(v('3', { version: '5' }, false), 'lejupieladet');           // mainīts citā ierīcē
  assert.equal(v('3', { version: '5' }, true), 'izvele');                  // konflikts
});

/** Viltots Drive: faili atmiņā, versija palielinās ar katru izmaiņu. */
function viltotsDrive(epasts = 'anna@example.com') {
  const faili = new Map(); let nr = 0;
  const d = {
    SAKNES_MAPE: 'Grāmatvedība', DATU_FAILS: 'gramatvediba-dati.json', REZERVJU_MAPE: 'Rezerves kopijas', faili,
    aizmirsts: 0,
    pieslegties: async () => {}, aizmirstAtslegu: () => { d.aizmirsts++; }, kontaEpasts: async () => epasts,
    mape: async (n, v = null) => { for (const [id, f] of faili) if (f.mape && f.name === n && f.vecaks === v) return id; const id = 'm' + ++nr; faili.set(id, { name: n, mape: true, vecaks: v }); return id; },
    atrastFailu: async (n, m) => { for (const [id, f] of faili) if (!f.mape && f.name === n && f.vecaks === m) return { id, version: String(f.version) }; return null; },
    metadati: async (id) => { const f = faili.get(id); if (!f) throw Object.assign(new Error('nav'), { kods: 'nav' }); return { id, version: String(f.version) }; },
    lejupieladet: async (id) => faili.get(id).saturs,
    izveidotFailu: async (n, m, saturs) => { const id = 'f' + ++nr; faili.set(id, { name: n, vecaks: m, saturs, version: 1 }); return { id, version: 1 }; },
    atjaunotFailu: async (id, saturs) => { const f = faili.get(id); f.saturs = saturs; f.version++; return { id, version: f.version }; },
    kopet: async (id, n, m) => { const f = faili.get(id), k = 'f' + ++nr; faili.set(k, { ...f, name: n, vecaks: m }); return { id: k }; }
  };
  return d;
}

/** Viena ierīce: pārlūka dati un savienojuma stāvoklis. */
function ierice(drive, sakuma, atbilde = 'drive') {
  const st = { dati: sakuma, meta: {}, jautats: [], rezerve: null, baze: null, zinas: [] };
  const s = izveidotSinhronizatoru({
    drive, meta: () => st.meta, rakstitMeta: (m) => { st.meta = m; }, dati: () => st.dati, aizstatDatus: (d) => { st.dati = d; },
    lokalaRezerve: (d) => { st.rezerve = d; }, uzTekstu: (d) => JSON.stringify(d), noTeksta: (t) => JSON.parse(t),
    jautat: async (j) => { st.jautats.push(j.virsraksts); return atbilde; }, apstiprinat: async () => true,
    baze: () => st.baze, rakstitBazi: (d) => { st.baze = d; }, zinot: (t) => st.zinas.push(t),
    sodien: () => '2026-11-23', tagad: () => '2026-11-23T12:00:00.000Z'
  });
  const mainit = (fn) => { fn(st.dati); st.meta = { ...st.meta, mainits: true }; };
  return { st, s, mainit };
}
const dati = (rekini = []) => ({ versija: 1, profils: { vards: '' }, rekini, darijumi: [], pasutitaji: [], autorligumi: [] });

test('Pirmā pieslēgšana: pārlūka dati augšupielādēti Drive', async () => {
  const D = viltotsDrive(), A = ierice(D, dati([{ nr: 1 }]));
  assert.equal(await A.s.savienot(), 'izveidot');
  assert.equal(A.st.meta.konts, 'anna@example.com');
  const f = await D.atrastFailu('gramatvediba-dati.json', A.st.meta.mapesId);
  assert.deepEqual(JSON.parse(await D.lejupieladet(f.id)).rekini, [{ nr: 1 }]);
  assert.equal(A.st.meta.mainits, false);
});

test('Divas ierīces: izmaiņas pāriet; konfliktā nekas netiek zaudēts', async () => {
  const D = viltotsDrive(), A = ierice(D, dati([{ nr: 1 }]));
  await A.s.savienot();
  const B = ierice(D, dati());                                     // jauna, tukša ierīce
  assert.equal(await B.s.savienot(), 'lejupieladet');
  assert.deepEqual(B.st.dati.rekini, [{ nr: 1 }]);
  assert.equal(B.st.jautats.length, 0);

  B.mainit((d) => d.rekini.push({ nr: 2 }));
  assert.equal(await B.s.sinhronizet(), 'augsupieladet');
  assert.equal(await A.s.sinhronizet(), 'lejupieladet');           // A nebija izmaiņu → paņem B izmaiņas
  assert.equal(A.st.dati.rekini.length, 2);

  // Abās ierīcēs izmaiņas vienlaikus → apvieno bez jautāšanas; pārlūka versija pirms apvienošanas paliek lokālā rezervē
  B.mainit((d) => d.rekini.push({ nr: 3 }));
  await B.s.sinhronizet();
  A.mainit((d) => d.rekini.push({ nr: 99 }));
  assert.equal(await A.s.sinhronizet(), 'apvienots');
  assert.deepEqual(A.st.jautats, []);
  assert.deepEqual(A.st.dati.rekini.map((r) => r.nr).sort((x, y) => x - y), [1, 2, 3, 99]);
  assert.deepEqual(A.st.rezerve.rekini.map((r) => r.nr), [1, 2, 99]);
  assert.match(A.st.zinas.at(-1), /Dati apvienoti: 1 no šī pārlūka, 1 no Drive/);
  assert.equal(await B.s.sinhronizet(), 'lejupieladet');
  assert.equal(B.st.dati.rekini.length, 4);
});

test('Pirmā pieslēgšana ar datiem abās vietās: apvieno, neko nedzēš (arī nejaušs „viens rēķins” neizdzēš pārējos)', async () => {
  const D = viltotsDrive(), A = ierice(D, dati([{ id: 'a', nr: 1 }, { id: 'b', nr: 2 }, { id: 'c', nr: 3 }]));
  await A.s.savienot();
  const B = ierice(D, dati([{ id: 'x', nr: 4 }]), 'parluks');     // jauna ierīce ar vienu rēķinu, izrakstītu bez Drive
  assert.equal(await B.s.savienot(), 'apvienots');
  assert.deepEqual(B.st.jautats, []);
  const f = await D.atrastFailu('gramatvediba-dati.json', B.st.meta.mapesId);
  assert.deepEqual(JSON.parse(await D.lejupieladet(f.id)).rekini.map((r) => r.id).sort(), ['a', 'b', 'c', 'x']);
});

test('Viens ieraksts labots abās vietās: jautā tikai par to; izvēle tiek ievērota, otra versija rezervē', async () => {
  for (const [atbilde, gaid] of [['parluks', 200], ['drive', 300]]) {
    const D = viltotsDrive(), A = ierice(D, dati([{ id: 'a', nr: 1, summa: 100 }]));
    await A.s.savienot();
    const B = ierice(D, dati(), atbilde); await B.s.savienot();
    A.mainit((d) => { d.rekini[0].summa = 300; d.rekini.push({ id: 'n', nr: 2 }); }); await A.s.sinhronizet();
    B.mainit((d) => { d.rekini[0].summa = 200; });
    assert.equal(await B.s.sinhronizet(), 'apvienots');
    assert.deepEqual(B.st.jautats, ['Daži ieraksti laboti abās vietās']);
    assert.equal(B.st.dati.rekini.find((r) => r.id === 'a').summa, gaid);
    assert.ok(B.st.dati.rekini.some((r) => r.id === 'n'), 'otras ierīces jaunais rēķins nav pazaudēts');
    const rezerves = [...D.faili.values()].filter((x) => !x.mape && x.name.startsWith('gramatvediba-dati 2026-11-23'));
    assert.ok(rezerves.some((x) => JSON.parse(x.saturs).rekini.some((r) => r.summa === 300)), 'Drive versija rezervē');
  }
});

test('Dzēšana pāriet uz otru ierīci tikai tad, ja otra to nav mainījusi', async () => {
  const D = viltotsDrive(), A = ierice(D, dati([{ id: 'a', nr: 1 }, { id: 'b', nr: 2 }]));
  await A.s.savienot();
  const B = ierice(D, dati()); await B.s.savienot();
  A.mainit((d) => { d.rekini = d.rekini.filter((r) => r.id !== 'a'); }); await A.s.sinhronizet();
  B.mainit((d) => { d.rekini.push({ id: 'c', nr: 3 }); });
  assert.equal(await B.s.sinhronizet(), 'apvienots');
  assert.deepEqual(B.st.dati.rekini.map((r) => r.id).sort(), ['b', 'c']);
});

test('Cits Google konts tiek atteikts', async () => {
  const D = viltotsDrive('anna@example.com'), A = ierice(D, dati([{ nr: 1 }]));
  await A.s.savienot();
  const D2 = { ...viltotsDrive('cits@example.com'), faili: D.faili };
  const A2 = izveidotSinhronizatoru({ drive: { ...D2, aizmirstAtslegu: () => {} }, meta: () => A.st.meta, rakstitMeta: () => assert.fail('nedrīkst mainīt'), dati: () => A.st.dati,
    aizstatDatus: () => assert.fail('nedrīkst aizstāt'), uzTekstu: JSON.stringify, noTeksta: JSON.parse, jautat: async () => 'atcelt', apstiprinat: async () => true, sodien: () => '2026-11-23', tagad: () => '' });
  await assert.rejects(A2.savienot(), /piesaistīta Google kontam anna@example.com/);
});

test('Ja datu fails Drive izdzēsts, pārlūka dati tiek augšupielādēti no jauna', async () => {
  const D = viltotsDrive(), A = ierice(D, dati([{ nr: 1 }]));
  await A.s.savienot();
  D.faili.delete(A.st.meta.failaId);
  A.mainit((d) => d.rekini.push({ nr: 2 }));
  assert.equal(await A.s.sinhronizet(), 'izveidot');
  const f = await D.atrastFailu('gramatvediba-dati.json', A.st.meta.mapesId);
  assert.equal(JSON.parse(await D.lejupieladet(f.id)).rekini.length, 2);
});

test('Rezerves kopija Drive tiek veidota ne biežāk kā reizi dienā', async () => {
  const D = viltotsDrive(), A = ierice(D, dati([{ nr: 1 }]));
  await A.s.savienot();
  for (let i = 2; i < 6; i++) { A.mainit((d) => d.rekini.push({ nr: i })); await A.s.sinhronizet(); }
  assert.equal([...D.faili.values()].filter((x) => !x.mape && x.name.startsWith('gramatvediba-dati 2026-11-23')).length, 1);
});
