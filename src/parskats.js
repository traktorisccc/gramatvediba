// Gada pārskats grāmatvedim: Excel fails ar formulām, lai katru skaitli var izsekot un pārbaudīt.
// Kešotās vērtības (v) aprēķina ar tām pašām funkcijām kā rīks, lai fails rāda skaitļus arī programmās,
// kas formulas pašas nepārrēķina (piemēram, iPhone priekšskatījumā).
import { r2, menesuIenakumi, ceturksnaZinojums, d3, gadaDeklaracija } from './calc.js';
import { DARBA_VEIDI } from './darbaVeidi.js';
import { xlsxFails } from './xlsx.js';

const MENESI = ['janvāris', 'februāris', 'marts', 'aprīlis', 'maijs', 'jūnijs', 'jūlijs', 'augusts', 'septembris', 'oktobris', 'novembris', 'decembris'];
export const VID_MAKSAJUMS = 'Maksājums VID';
export const PERSONIGIE = 'Personīgie darījumi (nav saistīti ar saimniecisko darbību)';
const N = (v, f, s = 'nauda') => ({ v, f, s });
const T = (v, s) => ({ v, s });

/**
 * ievade: { gads, n, provizoriski, vards, izveidots,
 *   ieraksti: [{ datums, partneris, info, veids, summa }]            — saimnieciskās darbības ieņēmumi (tikai šī gada)
 *   darijumi: [{ datums, partneris, info, virziens, summa, kategorija, aprekina, piesaiste, nodokluGads, avots }]  — bez ar darbību nesaistītajiem
 *   nesaistiti: ar darbību nesaistīto ienākošo maksājumu kopsumma (tikai skaitlis)
 *   rekini:   [{ numurs, datums, pasutitajs, veids, summa, samaksats, statuss }]
 *   ligumi:   [{ nr, datums, pasutitajs, veids, summa, samaksats, ietur }]
 *   g: { d1Apliekamie, d1Ieturetais, citiNodokli, dzivibasIemaksas, attaisnotie, vsaoiDeklareta } }
 * Atgriež lapu sarakstu xlsx.js formātā.
 */
export function parskatsLapas(ie) {
  const { gads, n } = ie, g = ie.g || {};
  const num = (x) => (x === '' || x === undefined || x === null ? 0 : Number(x));
  const ieraksti = [...ie.ieraksti].sort((a, b) => a.datums.localeCompare(b.datums));
  const sd = ieraksti.map((e) => ({ ...e, kategorija: 'sd' }));
  const m = menesuIenakumi(sd, gads), q = [1, 2, 3, 4].map((c) => ceturksnaZinojums(m, c, n)), x3 = d3(sd, gads);
  const vsaoiAprekinata = r2(q.reduce((a, c) => a + c.jaMaksa, 0));
  const vsaoiIr = g.vsaoiDeklareta !== undefined && g.vsaoiDeklareta !== '' && g.vsaoiDeklareta !== null;
  const vsaoi = vsaoiIr ? num(g.vsaoiDeklareta) : vsaoiAprekinata;
  const d = gadaDeklaracija({ d3Apliekamie: x3.apliekamie, d1Apliekamie: num(g.d1Apliekamie), d1Ieturetais: num(g.d1Ieturetais), citiNodokli: num(g.citiNodokli),
    vsaoi, dzivibasIemaksas: num(g.dzivibasIemaksas), attaisnotie: num(g.attaisnotie) }, n);
  const baze = d.baze;

  // ---------- Noteikumi ----------
  const NT = "'Noteikumi'!$B$";
  const noteikumi = { nosaukums: 'Noteikumi', platumi: [46, 14, 60], rindas: [
    [T('Rādītājs', 'galva'), T('Vērtība', 'galvaN'), T('Piezīme', 'galva')],
    ['Gads', gads, ie.provizoriski ? T('Šim gadam nav sava noteikumu faila: izmantoti tuvākā gada noteikumi. Pārbaudi!', 'bridinajums') : ''],
    ['Minimālā mēneša alga, €', N(n.minimalaAlga), 'VSAOI objekts, ja mēneša ienākums to sasniedz'],
    ['VSAOI likme pašnodarbinātajam, %', n.vsaoiLikme, 'no minimālās algas'],
    ['Pensiju apdrošināšanas likme, %', n.pensijuLikme, 'no ienākuma virs minimālās algas (vai no visa, ja zem tās)'],
    ['IIN likme, %', n.iinLikme, ''],
    ['IIN sliekšņa summa gadā, €', N(n.iinSlieksnis), 'virs tās piemēro augstāko likmi'],
    ['IIN augstākā likme, %', n.iinAugstaLikme, ''],
    ['Neapliekamais minimums mēnesī, €', N(n.neapliekamaisMinimumsMenesi), ''],
    ['Dzīvības apdrošināšana: maks. daļa no ienākuma, %', n.dzivibasApdrosinasanaMaxDala, ''],
    ['Dzīvības apdrošināšana: maks. summa gadā, €', N(n.dzivibasApdrosinasanaMaxSumma ?? 999999999), ''],
    ['Avots', n.avots || '', ''],
    [],
    [T('Darba veidi un nosacīto izdevumu normas (MK noteikumi Nr. 899, 57. punkts)', 'sadala')],
    [T('Kods', 'galva'), T('Norma, %', 'galvaN'), T('Nosaukums', 'galva')],
    ...Object.entries(DARBA_VEIDI).map(([k, v]) => [k, v.norma, v.nosaukums + (v.gaidaVid ? ' (gaida VID uzziņu)' : '') + (v.piezime ? ` (${v.piezime})` : '')])
  ] };

  // ---------- Žurnāls ----------
  const zp = 2, zb = Math.max(zp, zp + ieraksti.length - 1), zk = zb + 1;   // pirmā datu rinda, pēdējā, kopsummas rinda
  const zurnals = { nosaukums: 'Žurnāls', platumi: [6, 12, 8, 34, 46, 30, 9, 13, 15, 13], iesaldet: 1, rindas: [
    [T('Nr.', 'galva'), T('Datums', 'galva'), T('Mēnesis', 'galvaN'), T('Maksātājs', 'galva'), T('Dokuments / maksājuma mērķis', 'galva'), T('Darba veids', 'galva'),
      T('Norma, %', 'galvaN'), T('Ieņēmumi, €', 'galvaN'), T('Nosacītie izdevumi, € (žurnāla 20. aile)', 'galvaN'), T('Ienākums, €', 'galvaN')],
    ...ieraksti.map((e, i) => {
      const r = zp + i, nor = DARBA_VEIDI[e.veids]?.norma ?? 0;
      return [i + 1, T(e.datums, 'datums'), { v: Number(e.datums.slice(5, 7)), f: `MONTH(B${r})` }, e.partneris || '', e.info || '',
        `${e.veids} ${DARBA_VEIDI[e.veids]?.nosaukums || ''}`.trim(), nor, N(e.summa), N(e.summa * nor / 100, `H${r}*G${r}/100`), N(e.summa - e.summa * nor / 100, `H${r}-I${r}`)];
    })
  ] };
  if (!ieraksti.length) zurnals.rindas.push([T('Šajā gadā nav saimnieciskās darbības ieņēmumu.', 'piezime')]);
  zurnals.rindas[zk - 1] = [T('Kopā', 'b'), '', '', '', '', '', '', N(x3.ienemumi, `SUM(H${zp}:H${zb})`, 'naudaB'),
    N(ieraksti.reduce((a, e) => a + e.summa * (DARBA_VEIDI[e.veids]?.norma ?? 0) / 100, 0), `SUM(I${zp}:I${zb})`, 'naudaB'), N(ieraksti.reduce((a, e) => a + e.summa * (100 - (DARBA_VEIDI[e.veids]?.norma ?? 0)) / 100, 0), `SUM(J${zp}:J${zb})`, 'naudaB')];
  zurnals.rindas.push([], [T('Ieņēmumi uzskaitīti naudas saņemšanas dienā (pēc bankas izraksta). Nosacītie izdevumi = ieņēmumi × darba veida norma. Ienākumi, no kuriem nodokļus samaksāja izmaksātājs, un AKKA/LAA atlīdzības šeit neietilpst, sk. lapu „Banka”.', 'piezime')]);
  const Z = (k) => `'Žurnāls'!$${k}$${zp}:$${k}$${zb}`;

  // ---------- Ceturkšņi ----------
  const cet = { nosaukums: 'Ceturkšņi', platumi: [16, 13, 13, 13, 14, 14, 16, 14, 14], iesaldet: 1, rindas: [
    [T('Mēnesis', 'galva'), T('Ieņēmumi', 'galvaN'), T('Nosacītie izdevumi', 'galvaN'), T('Ienākums', 'galvaN'), T('VSAOI objekts', 'galvaN'), T('VSAOI (31,07 %)', 'galvaN'),
      T('Objekts pensiju apdr. 10 %', 'galvaN'), T('Pensiju apdr. 10 %', 'galvaN'), T('Kopā mēnesī', 'galvaN')]
  ] };
  const visiM = q.flatMap((c) => c.rindas);
  m.forEach((x, i) => {
    const r = i + 2, v = visiM[i];
    cet.rindas.push([{ v: x.menesis, s: 'parasts' }, N(x.ienemumi, `ROUND(SUMIFS(${Z('H')},${Z('C')},A${r}),2)`), N(x.nosacitie, `ROUND(SUMIFS(${Z('I')},${Z('C')},A${r}),2)`),
      N(x.ienakums, `MAX(0,ROUND(B${r}-C${r},2))`), N(v.objekts, `IF(D${r}>=${NT}3,${NT}3,0)`), N(v.vsaoi, `ROUND(E${r}*${NT}4/100,2)`),
      N(v.pensObjekts, `ROUND(D${r}-E${r},2)`), N(v.pens, `ROUND(G${r}*${NT}5/100,2)`), N(r2(v.vsaoi + v.pens), `F${r}+H${r}`)]);
  });
  const sumC = (k, a, b) => `SUM(${k}${a}:${k}${b})`;
  cet.rindas.push([T('Gadā kopā', 'b'), N(x3.ienemumi, sumC('B', 2, 13), 'naudaB'), N(x3.izdevumi, sumC('C', 2, 13), 'naudaB'), N(r2(m.reduce((a, x) => a + x.ienakums, 0)), sumC('D', 2, 13), 'naudaB'),
    '', '', '', '', N(vsaoiAprekinata, sumC('I', 2, 13), 'naudaB')]);
  cet.rindas.push([]);
  cet.rindas.push([T('Ceturksnis', 'galva'), T('Ieņēmumi', 'galvaN'), T('Nosacītie izdevumi', 'galvaN'), T('Ienākums', 'galvaN'), T('VSAOI objekts', 'galvaN'), T('VSAOI (31,07 %)', 'galvaN'),
    T('Objekts pensiju apdr. 10 %', 'galvaN'), T('Pensiju apdr. 10 %', 'galvaN'), T('Jāmaksā (ziņojumā)', 'galvaN')]);
  const cetPirma = cet.rindas.length + 1;                           // 17. rinda
  q.forEach((c, i) => {
    const a = 2 + i * 3, b = a + 2, mm = m.slice(i * 3, i * 3 + 3), sm = (k) => r2(mm.reduce((s, x) => s + x[k], 0));
    cet.rindas.push([`${i + 1}. ceturksnis`, N(sm('ienemumi'), sumC('B', a, b)), N(sm('nosacitie'), sumC('C', a, b)), N(sm('ienakums'), sumC('D', a, b)),
      N(c.kopa.objekts, sumC('E', a, b)), N(c.kopa.vsaoi, sumC('F', a, b)), N(c.kopa.pensObjekts, sumC('G', a, b)), N(c.kopa.pens, sumC('H', a, b)), N(c.jaMaksa, `ROUND(F${cetPirma + i}+H${cetPirma + i},2)`, 'naudaB')]);
  });
  const cetKopa = cet.rindas.length + 1;
  cet.rindas.push([T('Kopā', 'b'), '', '', '', '', '', '', '', N(vsaoiAprekinata, sumC('I', cetPirma, cetPirma + 3), 'naudaB')]);
  cet.rindas.push([], [T('Mēneša VSAOI: ja ienākums ≥ minimālā alga, maksā likmi no minimālās algas un 10 % no pārējā; ja mazāks, tikai 10 % no ienākuma. Ziņojums jāiesniedz līdz nākamā mēneša pēc ceturkšņa 17. datumam, jāsamaksā līdz 23. datumam.', 'piezime')]);

  // ---------- Deklarācija ----------
  const D = n.dRindas, R = n.d3Rindas;
  const dek = { nosaukums: 'Deklarācija', platumi: [60, 8, 15, 58], rindas: [
    [T(`Gada ienākumu deklarācija par ${gads}. gadu`, 'virsraksts')],
    [],
    [T('D3 pielikums: ienākumi no saimnieciskās darbības', 'galva'), T('Rinda', 'galvaN'), T('Summa, €', 'galvaN'), T('Kā iegūts', 'galva')],
    ['Ieņēmumi no saimnieciskās darbības', R.ienemumi, N(x3.ienemumi, `ROUND('Ceturkšņi'!B14,2)`), 'Ceturkšņi: gada ieņēmumi'],                     // 4
    ['Izdevumi (nosacītie izdevumi)', R.izdevumi, N(x3.izdevumi, `ROUND('Ceturkšņi'!C14,2)`), 'Ceturkšņi: gada nosacītie izdevumi'],                  // 5
    [T('Apliekamie ienākumi no saimnieciskās darbības', 'b'), R.apliekamie, N(x3.apliekamie, 'MAX(0,ROUND(C4-C5,2))', 'naudaB'), 'ieņēmumi − izdevumi'], // 6
    [],
    [T('Dati, ko EDS pievieno no citiem avotiem (dzeltenās šūnas var mainīt)', 'galva'), T('', 'galva'), T('Summa, €', 'galvaN'), T('', 'galva')],   // 8
    ['D1: apliekamie ienākumi (AKKA/LAA u. c.)', '', N(num(g.d1Apliekamie), undefined, 'ievade'), 'no EDS D1 pielikuma'],                          // 9
    ['D1: ieturētais nodoklis', '', N(num(g.d1Ieturetais), undefined, 'ievade'), 'no EDS D1 pielikuma'],                                          // 10
    ['Nodoklis no citiem ienākumiem', '', N(num(g.citiNodokli), undefined, 'ievade'), 'no EDS (D lapas 19. rinda)'],                               // 11
    ['Dzīvības apdrošināšanas iemaksas', '', N(num(g.dzivibasIemaksas), undefined, 'ievade'), 'pirms griestu piemērošanas'],                       // 12
    ['Attaisnotie izdevumi (izglītība, ārstniecība, ziedojumi)', '', N(num(g.attaisnotie), undefined, 'ievade'), 'no EDS D4 pielikuma'],          // 13
    ['VSAOI pēc iesniegtajiem ceturkšņa ziņojumiem', '', vsaoiIr ? N(num(g.vsaoiDeklareta), undefined, 'ievade') : { v: '', s: 'ievade' }, 'tukšs = rīka aprēķins (Ceturkšņi)'], // 14
    [],
    [T('D lapa (aplēse)', 'galva'), T('Rinda', 'galvaN'), T('Summa, €', 'galvaN'), T('Kā iegūts', 'galva')],                                     // 16
    ['Latvijas Republikā gūtie apliekamie ienākumi', D.apliekamie, N(d.r1, 'ROUND(C9+C6,2)'), 'D1 + D3'],                                           // 17
    ['Valsts sociālās apdrošināšanas obligātās iemaksas', D.vsaoi, N(d.r6, `IF(C14="",'Ceturkšņi'!I${cetKopa},ROUND(C14,2))`), 'iesniegtā summa, citādi rīka aprēķins'], // 18
    ['Attaisnotie izdevumi (izglītība, ārstniecība, ziedojumi)', D.attaisnotie, N(d.r8, 'ROUND(C13,2)'), ''],                                     // 19
    ['Pensiju fondi, dzīvības apdrošināšana', D.dzivibasApdr, N(d.r9, `ROUND(MIN(C12,ROUND(C17*${NT}10/100,2),${NT}11),2)`), 'ne vairāk kā daļa no ienākuma un gada griesti'], // 20
    ['Attaisnotie izdevumi kopā', D.attaisnotieKopa, N(d.r10, 'ROUND(C18+C19+C20,2)'), ''],                                                      // 21
    ['Gada neapliekamais minimums', D.neapliekamais, N(d.r11, `ROUND(${NT}9*12,2)`), 'mēneša summa × 12'],                                       // 22
    ['Ar nodokli apliekamais ienākums', '', N(baze, 'MAX(0,ROUND(C17-C21-C22,2))'), 'nav atsevišķas rindas EDS'],                                  // 23
    [T('Nodoklis kopā', 'b'), D.nodoklis, N(d.r18, `ROUND(ROUND(MIN(C23,${NT}7)*${NT}6/100,2)+ROUND(MAX(0,C23-${NT}7)*${NT}8/100,2),2)`, 'naudaB'), 'pamatlikme līdz slieksnim, augstākā virs tā'], // 24
    ['Nodoklis no citiem ienākumiem', D.citiNodokli, N(d.r19, 'ROUND(C11,2)'), ''],                                                              // 25
    ['Avansā samaksātais (ieturētais) nodoklis', D.ieturetais, N(d.r23, 'ROUND(C10,2)'), ''],                                                    // 26
    [T('Maksājamais nodoklis', 'b'), D.maksajams, N(d.r24, 'MAX(0,ROUND(C24+C25-C26,2))', 'naudaB'), ''],                                        // 27
    [T('Pārmaksātais nodoklis', 'b'), D.parmaksa, N(d.r25, 'MAX(0,-ROUND(C24+C25-C26,2))', 'naudaB'), ''],                                       // 28
    [],
    [T('Rindu numuri atbilst EDS formai šim gadam. D lapa ir aplēse: EDS pievieno arī datus no citiem avotiem, tāpēc galīgais skaitlis jāsalīdzina ar EDS.', 'piezime')]
  ] };

  // ---------- Banka ----------
  const darijumi = [...ie.darijumi].sort((a, b) => a.datums.localeCompare(b.datums));
  const bp = 2, bb = Math.max(bp, bp + darijumi.length - 1);
  const banka = { nosaukums: 'Banka', platumi: [12, 34, 46, 11, 13, 30, 10, 22, 10, 16], iesaldet: 1, rindas: [
    [T('Datums', 'galva'), T('Maksātājs / saņēmējs', 'galva'), T('Informācija', 'galva'), T('Virziens', 'galva'), T('Summa, €', 'galvaN'), T('Kategorija', 'galva'),
      T('Aprēķinā', 'galva'), T('Rēķins / līgums', 'galva'), T('Nodokļu gads', 'galvaN'), T('Avots', 'galva')],
    ...darijumi.map((x) => [T(x.datums, 'datums'), x.partneris || '', x.info || '', x.virziens === 'D' ? 'Izejošs' : 'Ienākošs', N(x.summa), x.kategorija,
      x.aprekina ? 'Jā' : 'Nē', x.piesaiste || '', x.nodokluGads || '', x.avots || ''])
  ] };
  if (!darijumi.length) banka.rindas.push([T('Šim gadam nav apstiprinātu bankas darījumu.', 'piezime')]);
  const B = (k) => `'Banka'!$${k}$${bp}:$${k}$${bb}`, Bl = (k) => `$${k}$${bp}:$${k}$${bb}`;
  banka.rindas.length = bb;
  banka.rindas.push([]);
  banka.rindas.push([T('Ienākošie maksājumi pa kategorijām', 'galva'), T('', 'galva'), T('', 'galva'), T('', 'galva'), T('Summa, €', 'galvaN'), T('Kur tiek ņemts vērā', 'galva')]);
  const kategorijas = [...new Set(darijumi.filter((x) => x.virziens !== 'D').map((x) => x.kategorija))];
  const katPirma = banka.rindas.length + 1;
  const kurNem = { 'Saimnieciskā darbība': 'D3 (Žurnāls)', 'AKKA/LAA (D1)': 'D1, nodokli ietur AKKA/LAA', 'Nodokļus samaksāja izmaksātājs': 'neiet ziņojumos un D3' };
  for (const k of kategorijas) {
    const r = banka.rindas.length + 1;
    banka.rindas.push([k, '', '', '', N(r2(darijumi.filter((x) => x.virziens !== 'D' && x.kategorija === k).reduce((a, x) => a + x.summa, 0)), `SUMIFS(${Bl('E')},${Bl('F')},A${r},${Bl('D')},"Ienākošs")`), kurNem[k] || 'nav ienākums']);
  }
  const nesaistiti = r2(ie.nesaistiti || 0);
  banka.rindas.push([PERSONIGIE, '', '', '', N(nesaistiti), 'rādīts tikai, lai kopsumma sakristu ar izrakstu']);
  banka.rindas.push([T('Kopā ienākošie', 'b'), '', '', '', N(r2(darijumi.filter((x) => x.virziens !== 'D').reduce((a, x) => a + x.summa, 0) + nesaistiti), `SUM(E${katPirma}:E${banka.rindas.length})`, 'naudaB'), 'jāsakrīt ar izrakstu kredīta apgrozījumu']);
  banka.rindas.push([], [T('Lapā ir ienākošie maksājumi, kas saistīti ar darbību vai nodokļiem, un maksājumi VID. Personīgie darījumi (pārskaitījumi no ģimenes, no saviem kontiem, kartes darījumu atgriešana, procenti) nav saistīti ar saimniecisko darbību un parādīti tikai vienā kopsummā, lai kopsumma sakristu ar izraksta kredīta apgrozījumu. Citi izejošie maksājumi rīkā netiek glabāti. Rēķini, kas atzīmēti kā samaksāti citā kontā, ir tikai Žurnālā. Ārvalstu valūtas maksājumi norādīti eiro, kā tie ienākuši kontā.', 'piezime')]);

  // ---------- Rēķini un līgumi ----------
  const rl = { nosaukums: 'Rēķini un līgumi', platumi: [12, 12, 40, 30, 13, 13, 13, 26], rindas: [
    [T('Šeit ir tikai rīkā izrakstītie rēķini un ievadītie autorlīgumi. Ārpus rīka izrakstītie rēķini šeit nav, bet to apmaksa ir lapās „Žurnāls” un „Banka”. Nodokļu aprēķins balstās uz saņemtajiem maksājumiem, nevis uz šo sarakstu.', 'piezime')],
    [],
    [T('Rēķini', 'sadala')],
    [T('Numurs', 'galva'), T('Datums', 'galva'), T('Pasūtītājs', 'galva'), T('Darba veids', 'galva'), T('Summa, €', 'galvaN'), T('Samaksāts, €', 'galvaN'), T('Atlikums, €', 'galvaN'), T('Statuss', 'galva')]
  ] };
  if (!ie.rekini.length) rl.rindas.push([T('Šajā gadā rīkā nav izrakstītu rēķinu.', 'piezime')]);
  for (const x of ie.rekini) { const r = rl.rindas.length + 1; rl.rindas.push([x.numurs, T(x.datums, 'datums'), x.pasutitajs, DARBA_VEIDI[x.veids]?.nosaukums || x.veids || '', N(x.summa), N(x.samaksats), N(r2(x.summa - x.samaksats), `E${r}-F${r}`), x.statuss]); }
  rl.rindas.push([], [T('Autorlīgumi', 'sadala')],
    [T('Līgums', 'galva'), T('Datums', 'galva'), T('Pasūtītājs', 'galva'), T('Darba veids', 'galva'), T('Summa, €', 'galvaN'), T('Saņemts, €', 'galvaN'), T('Atlikums, €', 'galvaN'), T('Piezīme', 'galva')]);
  if (!ie.ligumi.length) rl.rindas.push([T('Šajā gadā nav ievadītu autorlīgumu.', 'piezime')]);
  for (const x of ie.ligumi) { const r = rl.rindas.length + 1; rl.rindas.push([x.nr, T(x.datums, 'datums'), x.pasutitajs, DARBA_VEIDI[x.veids]?.nosaukums || x.veids || '', N(x.summa), N(x.samaksats), N(r2(x.summa - x.samaksats), `E${r}-F${r}`), x.ietur ? 'nodokļus ietur izmaksātājs' : '']); }

  // ---------- Kopsavilkums ----------
  const vidSamaksats = r2(darijumi.filter((x) => x.kategorija === VID_MAKSAJUMS && Number(x.nodokluGads) === gads).reduce((a, x) => a + x.summa, 0));
  const kop = { nosaukums: 'Kopsavilkums', platumi: [58, 16, 60], rindas: [
    [T(`Grāmatvedības pārskats par ${gads}. gadu`, 'virsraksts')],
    [ie.vards || ''],
    [`Sagatavots ${ie.izveidots.split('-').reverse().join('.')}. ar grāmatvedības rīku. Visi aprēķini ir Excel formulas: uzklikšķinot uz šūnas, redzams, kā skaitlis iegūts.`],
    ie.provizoriski ? [T(`Uzmanību: ${gads}. gadam rīkā nav sava noteikumu faila, aprēķins veikts pēc tuvākā gada likmēm.`, 'bridinajums')] : [],
    [T('Galvenie skaitļi', 'galva'), T('€', 'galvaN'), T('Kur skatīt', 'galva')],
    ['Saimnieciskās darbības ieņēmumi', N(x3.ienemumi, "'Deklarācija'!C4"), 'Žurnāls → Ceturkšņi → Deklarācija (D3)'],          // 6
    ['Nosacītie izdevumi', N(x3.izdevumi, "'Deklarācija'!C5"), 'norma pēc darba veida, sk. Noteikumi'],                            // 7
    [T('Apliekamie ienākumi no saimnieciskās darbības', 'b'), N(x3.apliekamie, "'Deklarācija'!C6", 'naudaB'), `D3 pielikuma ${R.apliekamie}. rinda`], // 8
    ['VSAOI pēc rīka aprēķina', N(vsaoiAprekinata, `'Ceturkšņi'!I${cetKopa}`), 'četru ceturkšņa ziņojumu summa'],                  // 9
    ['VSAOI, kas izmantota deklarācijā', N(d.r6, "'Deklarācija'!C18"), 'ja ievadīta iesniegtā summa, tā'],                         // 10
    [T('IIN maksājams (aplēse)', 'b'), N(d.r24, "'Deklarācija'!C27", 'naudaB'), `D lapas ${D.maksajams}. rinda`],                    // 11
    ['IIN pārmaksa (aplēse)', N(d.r25, "'Deklarācija'!C28"), `D lapas ${D.parmaksa}. rinda`],                                        // 12
    ['Samaksāts VID par šo gadu', N(vidSamaksats, `SUMIFS(${B('E')},${B('F')},"${VID_MAKSAJUMS}",${B('I')},${gads})`), 'Banka: maksājumi VID ar šo nodokļu gadu'], // 13
    [T('Vēl jāsamaksā (VSAOI + IIN − samaksātais)', 'b'), N(r2(Math.max(0, d.r6 + d.r24 - vidSamaksats)), 'MAX(0,ROUND(B10+B11-B13,2))', 'naudaB'), ''], // 14
    [],
    [T('Kā rīks rēķina', 'galva'), T('', 'galva'), T('', 'galva')],
    [T('• Ieņēmumi uzskaitīti naudas saņemšanas dienā pēc bankas izraksta, nevis rēķina datumā.', 'piezime')],
    [T('• Nosacītie izdevumi: 50 % autordarbiem (MK noteikumi Nr. 899, 57. p.); norma piesaistīta katra maksājuma darba veidam.', 'piezime')],
    [T('• VSAOI aprēķināta katram mēnesim atsevišķi, tāpat kā pašnodarbinātā ziņojumā.', 'piezime')],
    [T('• Ienākumi, no kuriem nodokļus samaksāja izmaksātājs, neiet ziņojumos un D3. AKKA/LAA atlīdzības ir D1 pielikumā.', 'piezime')],
    [T('• Dzeltenās šūnas lapā „Deklarācija” ir dati no EDS; tos var mainīt, un aprēķins atjaunosies.', 'piezime')],
    [],
    [T('Lapas', 'galva'), T('', 'galva'), T('', 'galva')],
    ['Žurnāls', '', 'katrs saimnieciskās darbības ieņēmums'],
    ['Ceturkšņi', '', 'mēnešu un ceturkšņu VSAOI kā pašnodarbinātā ziņojumā'],
    ['Deklarācija', '', 'D3 pielikums un D lapas aplēse'],
    ['Banka', '', 'visi apstiprinātie darījumi ar kategorijām, arī tie, kas neiet aprēķinā'],
    ['Rēķini un līgumi', '', 'izrakstītie rēķini un autorlīgumi ar apmaksas stāvokli'],
    ['Noteikumi', '', 'gada likmes un normas, ko izmanto formulas']
  ] };

  const irRl = ie.rekini.length > 0 || ie.ligumi.length > 0;       // bez rēķiniem un līgumiem lapa tikai mulsinātu
  kop.rindas = kop.rindas.filter((r) => irRl || r[0] !== 'Rēķini un līgumi');   // saraksts „Lapas” ir aiz formulu rindām
  return [kop, zurnals, cet, dek, banka, ...(irRl ? [rl] : []), noteikumi];
}

export const gadaParskats = (ievade) => xlsxFails(parskatsLapas(ievade));
