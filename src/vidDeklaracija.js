// VID sagatavotās gada ienākumu deklarācijas (EDS XML, DokIINGDv…) nolasīšana un salīdzināšana ar rīka aprēķinu.
// No faila tiek ņemti tikai skaitļi. Personas kods, IBAN, adrese, tālrunis un e-pasts netiek nolasīti un netiek glabāti.
import { r2, gadaDeklaracija } from './calc.js';

const atkodet = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
/** Pirmā tagu satura vērtība (bez ligzdotiem tāda paša nosaukuma tagiem). */
const tags = (xml, v) => { const m = xml.match(new RegExp(`<${v}(?:\\s[^>]*)?>([\\s\\S]*?)</${v}>`)); return m ? atkodet(m[1].trim()) : null; };
const visi = (xml, v) => [...xml.matchAll(new RegExp(`<${v}(?:\\s[^>]*)?>([\\s\\S]*?)</${v}>`, 'g'))].map((m) => m[1]);
const sk = (x) => { const v = Number(String(x ?? '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
const skTags = (xml, v) => sk(tags(xml, v));
const summa = (rindas, v) => r2(rindas.reduce((a, r) => a + skTags(r, v), 0));

/** Nolasa EDS XML. Atgriež tikai skaitļus un dokumenta identifikāciju. */
export function lasitVidDeklaraciju(xml) {
  const t = String(xml || '');
  if (!/<DokIINGDv\d+[\s>]/.test(t)) throw new Error('Šis nav gada ienākumu deklarācijas XML fails no EDS.');
  const dok = t.match(/<DokIINGDv\d+[\s\S]*<\/DokIINGDv\d+>/)[0];
  const gads = Number(tags(dok, 'TaksGads'));
  if (!gads) throw new Error('Deklarācijā nav norādīts taksācijas gads.');
  const sadala = (v) => tags(dok, v) || '';
  const d1 = visi(sadala('PielikumsD1'), 'R'), d1p = visi(sadala('PielikumsD1p'), 'R');
  const D3 = sadala('PielikumsD3'), D = sadala('SadalaD'), D4 = visi(sadala('PielikumiD4'), 'D4');
  const aip = visi(tags(D, 'AIPDati') || '', 'R').map((r) => ({ veids: tags(r, 'Veids'), summa: skTags(r, 'Summa'), gads: Number(tags(r, 'Gads')) }));
  const ieprGadi = D4.flatMap((x) => visi(x, 'D4R').map((r) => ({ gads: Number(tags(r, 'A1')), summa: skTags(r, 'A4') })));
  const d = (nr) => skTags(D, `D${nr}`);
  return {
    gads, id: tags(dok, 'Id') || '', iesniegts: tags(dok, 'IesniegumaDatums') || '', precizejums: tags(dok, 'Precizejums') === 'true',
    sagatavotajs: /<Drawer>\s*VID\s*<\/Drawer>/.test(t) ? 'VID' : 'lietotājs',
    d1: { apliekamie: summa(d1, 'AplIenak'), ieturetais: summa(d1, 'NodAvanss'), vsaoi: summa(d1, 'Vsaoi') },
    d1p: { rezultats: summa(d1p, 'MaksSumma') },
    d3: { ienemumi: skTags(D3, 'A05'), izdevumi: skTags(D3, 'A06'), apliekamie: skTags(D3, 'A08'), arvalstis: skTags(D3, 'A09'), minimalais: skTags(D3, 'A10'), d11: skTags(D3, 'A11') },
    d4: { izglitibaArstnieciba: r2(D4.reduce((a, x) => a + skTags(x, 'SummaIA'), 0)), ziedojumi: r2(D4.reduce((a, x) => a + skTags(x, 'SummaZP'), 0)),
      ieprGadi, limits: D4.length ? skTags(D4[0], 'LimitsPersonai') || 600 : 600 },
    aip, aipSisGads: r2(aip.filter((x) => x.gads === gads).reduce((a, x) => a + x.summa, 0)),
    D: Object.fromEntries(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '17', '18', '19', '20', '22', '23', '24', '25'].map((k) => [k, d(k)]))
  };
}

/** Lauki rīka gada datiem (dzeltenās šūnas), aizpildīti no VID deklarācijas. */
export function gadaLauki(v) {
  const iepr = r2(v.d4.ieprGadi.reduce((a, x) => a + x.summa, 0));
  return {
    d1Apliekamie: v.d1.apliekamie,
    d1Ieturetais: r2(v.d1.ieturetais + v.d3.arvalstis + v.D['07']),
    citiNodokli: v.d1p.rezultats,
    dzivibasIemaksas: v.aipSisGads,
    attaisnotie: r2(v.d4.izglitibaArstnieciba + iepr),
    vsaoiDeklareta: v.D['06']
  };
}

/**
 * Salīdzina VID deklarāciju ar rīka D3. Atgriež { pareizi, rindas: [{ lapa, rinda, nosaukums, vid, pareizi, darbiba }], soli, piezimes }.
 * darbiba: 'ievadit' — jāieraksta EDS; 'parbaudit' — EDS pārrēķina pats, jāpārbauda; 'sakrit'.
 */
export function salidzinat(v, d3, n, vsaoiAprekinata) {
  const g = gadaLauki(v);
  const pareizi = gadaDeklaracija({ d3Apliekamie: d3.apliekamie, d1Apliekamie: g.d1Apliekamie, d1Ieturetais: g.d1Ieturetais, citiNodokli: g.citiNodokli,
    vsaoi: g.vsaoiDeklareta, dzivibasIemaksas: g.dzivibasIemaksas, attaisnotie: g.attaisnotie }, n);
  const R = n.d3Rindas, D = n.dRindas, rinda = (lapa, nr, nosaukums, vid, par, ievadit) => ({ lapa, rinda: nr, nosaukums, vid: r2(vid), pareizi: r2(par),
    darbiba: Math.abs(r2(vid) - r2(par)) < 0.005 ? 'sakrit' : ievadit ? 'ievadit' : 'parbaudit' });
  const rindas = [
    rinda('D3', R.ienemumi, 'Ieņēmumi no citiem saimnieciskās darbības veidiem', v.d3.ienemumi, d3.ienemumi, true),
    rinda('D3', R.izdevumi, 'Izdevumi, kas saistīti ar citiem saimnieciskās darbības veidiem', v.d3.izdevumi, d3.izdevumi, true),
    rinda('D3', R.apliekamie, 'Apliekamie ienākumi no saimnieciskās darbības', v.d3.apliekamie, d3.apliekamie),
    rinda('D', D.apliekamie, 'Latvijas Republikā gūtie apliekamie ienākumi', v.D['01'], pareizi.r1),
    rinda('D', D.vsaoi, 'Valsts sociālās apdrošināšanas obligātās iemaksas', v.D['06'], pareizi.r6),
    rinda('D', D.attaisnotie, 'Par izglītību, ārstnieciskajiem pakalpojumiem, ziedojumiem', v.D['08'], pareizi.r8),
    rinda('D', D.dzivibasApdr, 'Pensiju fondi, dzīvības apdrošināšana', v.D['09'], pareizi.r9),
    rinda('D', D.attaisnotieKopa, 'Attaisnotie izdevumi kopā', v.D['10'], pareizi.r10),
    rinda('D', D.nodoklis, 'Nodoklis kopā', v.D['18'], pareizi.r18),
    rinda('D', D.ieturetais, 'Avansā samaksātais (ieturētais) nodoklis', v.D['23'], pareizi.r23),
    rinda('D', D.maksajams, 'Maksājamais nodoklis', v.D['24'], pareizi.r24),
    rinda('D', D.parmaksa, 'Pārmaksātais nodoklis (atmaksa)', v.D['25'], pareizi.r25)
  ];
  const jaievada = rindas.filter((r) => r.darbiba === 'ievadit');
  const rez = pareizi.r25 > 0 ? { rinda: D.parmaksa, teksts: 'atmaksa', summa: pareizi.r25 } : { rinda: D.maksajams, teksts: 'jāmaksā', summa: pareizi.r24 };
  const soli = jaievada.length ? [
    'EDS atver šī gada ienākumu deklarāciju un izvēlies „Precizēt” (vai turpini VID sagatavoto melnrakstu).',
    ...jaievada.map((r) => `Cilnē ${r.lapa}, rindā ${r.rinda} („${r.nosaukums}”) ieraksti ${eur(r.pareizi)} (tagad ${eur(r.vid)}).`),
    `Atver cilni D un pārbaudi: rindā ${rez.rinda} jābūt ${eur(rez.summa)} (${rez.teksts}). Ja ir cits skaitlis, neiesniedz — salīdzini ar tabulu.`,
    'Paraksti un iesniedz.'
  ] : [];
  const piezimes = [];
  if (vsaoiAprekinata !== undefined && Math.abs(r2(vsaoiAprekinata) - v.D['06']) >= 0.01)
    piezimes.push(`VSAOI deklarācijā (${eur(v.D['06'])}) ņemta no tavos ceturkšņa ziņojumos deklarētā un atšķiras no rīka aprēķina (${eur(vsaoiAprekinata)}). Deklarācijā to nemaina: ja ziņojumi bija nepareizi, labo ziņojumus.`);
  if (v.d4.ziedojumi > 0) piezimes.push('Deklarācijā ir ziedojumi. Rīks tos aprēķinā neierobežo, tāpēc pārbaudi D lapas 8. rindu EDS.');
  if (pareizi.attaisnotieParnests > 0) piezimes.push(`Attaisnotie izdevumi par izglītību un ārstniecību ${eur(pareizi.attaisnotieParnests)} netiks izmantoti šogad un EDS tos pārnesīs uz nākamajiem gadiem.`);
  return { pareizi, rindas, soli, piezimes, jaievada: jaievada.length > 0, starpiba: r2((pareizi.r25 - pareizi.r24) - (v.D['25'] - v.D['24'])) };
}

const eur = (x) => `${(Math.round(x * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
