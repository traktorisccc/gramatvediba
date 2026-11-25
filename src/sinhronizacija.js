// Datu sinhronizācija starp pārlūku un Google Drive.
// Princips: nekad klusi nepārrakstīt datus, kas mainīti citā ierīcē. Ja dati mainīti abās vietās, tos apvieno pa ierakstiem
// (apvienot.js); jautā tikai par ierakstiem, kas laboti abās vietās. Pirms pārrakstīšanas Drive tiek izveidota rezerves kopija.
import { apvienot, atrisinat } from './apvienot.js';

/** Ko darīt, salīdzinot pārlūka un Drive stāvokli. Tīra funkcija. */
export function izlemt({ zinamaVersija, attalais, lokalsMainits, lokaliIrDati }) {
  if (!attalais) return 'izveidot';
  if (zinamaVersija === null || zinamaVersija === undefined) return lokaliIrDati ? 'izvele' : 'lejupieladet';
  if (String(attalais.version) === String(zinamaVersija)) return lokalsMainits ? 'augsupieladet' : 'nekas';
  return lokalsMainits ? 'izvele' : 'lejupieladet';
}

export const irDati = (d) => !!(d && (d.rekini?.length || d.darijumi?.length || d.pasutitaji?.length || d.autorligumi?.length || d.profils?.vards));
export const datuApraksts = (d) => `${d.rekini?.length || 0} rēķini, ${d.autorligumi?.length || 0} līgumi, ${d.darijumi?.length || 0} bankas darījumi`;

/**
 * deps: {
 *   drive,                         — drive.js funkcijas (var aizstāt testos)
 *   meta(), rakstitMeta(m),        — savienojuma stāvoklis šajā pārlūkā
 *   dati(), aizstatDatus(d),       — pārlūka dati; aizstāšana nesaucas par lietotāja izmaiņu
 *   uzTekstu(d), noTeksta(t),      — JSON pārveidošana (eksportet / importet)
 *   jautat({ virsraksts, teksts, pogas: [{ id, teksts }] }) → Promise<id>,
 *   apstiprinat(teksts) → Promise<boolean>,
 *   baze(), rakstitBazi(d),        — pēdējā kopīgā versija trīspusējai apvienošanai
 *   zinot(teksts),                 — īss paziņojums lietotājam
 *   sodien(), tagad()
 * }
 */
export function izveidotSinhronizatoru(deps) {
  const { drive } = deps;
  let notiek = null, velreiz = false;

  async function rezerve(failaId, mapesId, piespiedu = false) {
    const m = deps.meta(), diena = deps.sodien();
    if (!piespiedu && m.rezerve === diena) return;
    const rmape = await drive.mape(drive.REZERVJU_MAPE, mapesId);
    await drive.kopet(failaId, `gramatvediba-dati ${diena}${piespiedu ? ' ' + deps.tagad().slice(11, 16).replace(':', '-') : ''}.json`, rmape);
    deps.rakstitMeta({ ...deps.meta(), rezerve: diena });
  }

  const bazei = (d) => deps.rakstitBazi?.(JSON.parse(JSON.stringify(d)));

  async function augsupieladet(m) {
    const dati = deps.dati(), teksts = deps.uzTekstu(dati);
    if (!m.failaId) {
      const j = await drive.izveidotFailu(drive.DATU_FAILS, m.mapesId, teksts);
      deps.rakstitMeta({ ...deps.meta(), failaId: j.id, versija: String(j.version), mainits: false, sinhronizets: deps.tagad() });
      bazei(dati); return;
    }
    await rezerve(m.failaId, m.mapesId);
    const j = await drive.atjaunotFailu(m.failaId, teksts);
    deps.rakstitMeta({ ...deps.meta(), versija: String(j.version), mainits: false, sinhronizets: deps.tagad() });
    bazei(dati);
  }

  async function lejupieladet(m, attalais, tekstsJau) {
    const d = deps.noTeksta(tekstsJau ?? await drive.lejupieladet(attalais.id));
    deps.aizstatDatus(d);
    deps.rakstitMeta({ ...deps.meta(), failaId: attalais.id, versija: String(attalais.version), mainits: false, sinhronizets: deps.tagad() });
    bazei(d);
  }

  /** Viens sinhronizācijas solis. attalais: undefined = noskaidrot pašam. */
  async function solis(attalais) {
    let m = deps.meta();
    if (attalais === undefined) {
      if (m.failaId) {
        try { attalais = await drive.metadati(m.failaId); }
        catch (e) { if (e.kods !== 'nav') throw e; attalais = await drive.atrastFailu(drive.DATU_FAILS, m.mapesId); }
      } else attalais = await drive.atrastFailu(drive.DATU_FAILS, m.mapesId);
      if (attalais && attalais.id !== m.failaId) { deps.rakstitMeta({ ...m, failaId: attalais.id }); m = deps.meta(); }
      if (!attalais && m.failaId) { deps.rakstitMeta({ ...m, failaId: null, versija: null }); m = deps.meta(); }
    }
    const lokalie = deps.dati();
    const darbiba = izlemt({ zinamaVersija: m.versija, attalais, lokalsMainits: !!m.mainits, lokaliIrDati: irDati(lokalie) });
    if (darbiba === 'nekas') return 'nekas';
    if (darbiba === 'izveidot' || darbiba === 'augsupieladet') { await augsupieladet(deps.meta()); return darbiba; }
    if (darbiba === 'lejupieladet') { await lejupieladet(m, attalais); return darbiba; }

    // Dati mainīti abās vietās (vai pirmā pieslēgšanās, kad abās ir dati): apvieno pa ierakstiem.
    const teksts = await drive.lejupieladet(attalais.id), attalie = deps.noTeksta(teksts);
    const r = apvienot(deps.baze?.() || null, lokalie, attalie);
    let izv = 'drive';
    if (r.konflikti.length) {
      const saraksts = r.konflikti.slice(0, 8).map((k) => `• ${k.nosaukums}${k.l === null ? ' (pārlūkā dzēsts)' : k.a === null ? ' (Drive dzēsts)' : ''}`).join('\n');
      izv = await deps.jautat({
        virsraksts: 'Daži ieraksti laboti abās vietās',
        teksts: `Pārējās izmaiņas no abām vietām ir apvienotas automātiski. Šie ieraksti ir laboti gan šajā pārlūkā, gan citā ierīcē:\n${saraksts}${r.konflikti.length > 8 ? `\n… un vēl ${r.konflikti.length - 8}` : ''}\n\nKuru versiju paturēt šiem ierakstiem? Otra paliks rezerves kopijā.`,
        pogas: [{ id: 'drive', teksts: 'Google Drive versiju' }, { id: 'parluks', teksts: 'Šī pārlūka versiju' }, { id: 'atcelt', teksts: 'Atcelt' }]
      });
      if (izv !== 'drive' && izv !== 'parluks') return 'atcelts';
    }
    const jaunie = atrisinat(r, izv);
    deps.lokalaRezerve?.(lokalie);                                  // pārlūka versija pirms apvienošanas
    await rezerve(attalais.id, m.mapesId, true);                    // Drive versija pirms apvienošanas
    deps.aizstatDatus(jaunie);
    deps.rakstitMeta({ ...deps.meta(), failaId: attalais.id, versija: String(attalais.version), mainits: true });
    await augsupieladet(deps.meta());
    const k = r.kopsavilkums, dal = [];
    if (k.noParluka) dal.push(`${k.noParluka} no šī pārlūka`);
    if (k.noDrive) dal.push(`${k.noDrive} no Drive`);
    if (k.dzesti) dal.push(`${k.dzesti} dzēsti`);
    deps.zinot?.(`Dati apvienoti${dal.length ? ': ' + dal.join(', ') : ''}.${k.dubultiNumuri.length ? ` Uzmanību: vairākiem rēķiniem ir vienāds numurs (${k.dubultiNumuri.join(', ')}). Pārbaudi tos sadaļā „Rēķini”.` : ''}`);
    return 'apvienots';
  }

  /** Sinhronizē; ja jau notiek, atkārto pēc tam (lai pēdējās izmaiņas netiek pazaudētas). */
  async function sinhronizet(attalais) {
    if (notiek) { velreiz = true; return notiek; }
    notiek = (async () => {
      try {
        let r = await solis(attalais);
        while (velreiz) { velreiz = false; r = await solis(); }
        return r;
      } finally { notiek = null; }
    })();
    return notiek;
  }

  /** Pieslēgšanās no lietotāja klikšķa: atslēga, konta pārbaude, mape, sinhronizācija. */
  async function savienot() {
    const m0 = deps.meta(), piesaistits = m0.konts || deps.dati().drive?.konts || '';
    await drive.pieslegties(piesaistits || undefined);
    const epasts = await drive.kontaEpasts();
    if (piesaistits && piesaistits !== epasts) {
      drive.aizmirstAtslegu();
      throw Object.assign(new Error(`Grāmatvedība ir piesaistīta Google kontam ${piesaistits}, bet izvēlēts ${epasts}. Pieslēdzies vēlreiz un izvēlies pareizo kontu.`), { kods: 'konts' });
    }
    if (!piesaistits && !(await deps.apstiprinat(`Pieslēgt grāmatvedību Google kontam ${epasts}?\n\nTurpmāk rīks šajā pārlūkā strādās tikai ar šo kontu.`))) {
      drive.aizmirstAtslegu(); return 'atcelts';
    }
    const mapesId = await drive.mape(drive.SAKNES_MAPE);
    deps.rakstitMeta({ ...deps.meta(), konts: epasts, mapesId });
    deps.piesaistitKontu?.(epasts);                               // konts glabājas arī datos: citas ierīces to pārbauda
    return sinhronizet();
  }

  /** Drive rezerves kopiju saraksts. */
  async function kopijas() {
    const m = deps.meta(); if (!m.mapesId) return [];
    const rm = await drive.mape(drive.REZERVJU_MAPE, m.mapesId, false);
    return rm ? drive.failiMape(rm) : [];
  }
  /** Atjauno no Drive rezerves kopijas: pašreizējie dati vispirms nonāk rezervē (Drive un pārlūkā). */
  async function atjaunot(id) {
    const d = deps.noTeksta(await drive.lejupieladet(id)), m = deps.meta();
    if (m.failaId) await rezerve(m.failaId, m.mapesId, true);
    deps.lokalaRezerve?.(deps.dati());
    deps.aizstatDatus(d);
    deps.rakstitMeta({ ...deps.meta(), mainits: true });
    await augsupieladet(deps.meta());
    return d;
  }

  return { savienot, sinhronizet, kopijas, atjaunot, aiznemts: () => !!notiek };
}
