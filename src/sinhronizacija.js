// Datu sinhronizācija starp pārlūku un Google Drive.
// Princips: nekad klusi nepārrakstīt datus, kas mainīti citā ierīcē. Pirms pārrakstīšanas Drive tiek izveidota rezerves kopija.

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

  async function augsupieladet(m) {
    const teksts = deps.uzTekstu(deps.dati());
    if (!m.failaId) {
      const j = await drive.izveidotFailu(drive.DATU_FAILS, m.mapesId, teksts);
      deps.rakstitMeta({ ...deps.meta(), failaId: j.id, versija: String(j.version), mainits: false, sinhronizets: deps.tagad() });
      return;
    }
    await rezerve(m.failaId, m.mapesId);
    const j = await drive.atjaunotFailu(m.failaId, teksts);
    deps.rakstitMeta({ ...deps.meta(), versija: String(j.version), mainits: false, sinhronizets: deps.tagad() });
  }

  async function lejupieladet(m, attalais, tekstsJau) {
    const d = deps.noTeksta(tekstsJau ?? await drive.lejupieladet(attalais.id));
    deps.aizstatDatus(d);
    deps.rakstitMeta({ ...deps.meta(), failaId: attalais.id, versija: String(attalais.version), mainits: false, sinhronizets: deps.tagad() });
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

    // izvele: Drive un pārlūkā ir atšķirīgi dati
    const teksts = await drive.lejupieladet(attalais.id), attalie = deps.noTeksta(teksts);
    const pirma = m.versija === null || m.versija === undefined;
    const izv = await deps.jautat({
      virsraksts: pirma ? 'Google Drive jau ir grāmatvedības dati' : 'Dati mainīti citā ierīcē',
      teksts: pirma
        ? `Google Drive: ${datuApraksts(attalie)}.\nŠajā pārlūkā: ${datuApraksts(lokalie)}.\n\nKurus datus paturēt? Otri netiks izdzēsti: tie paliks rezerves kopijā.`
        : `Kopš pēdējās sinhronizācijas dati Google Drive mainīti citā ierīcē, un arī šeit ir nesaglabātas izmaiņas.\nGoogle Drive: ${datuApraksts(attalie)}.\nŠajā pārlūkā: ${datuApraksts(lokalie)}.\n\nKurus datus paturēt? Otri paliks rezerves kopijā.`,
      pogas: [{ id: 'drive', teksts: 'Paturēt Google Drive datus' }, { id: 'parluks', teksts: 'Paturēt šī pārlūka datus' }, { id: 'atcelt', teksts: 'Atcelt' }]
    });
    if (izv === 'drive') { deps.lokalaRezerve?.(lokalie); await lejupieladet(m, attalais, teksts); return 'lejupieladet'; }
    if (izv === 'parluks') {
      await rezerve(attalais.id, m.mapesId, true);
      deps.rakstitMeta({ ...deps.meta(), failaId: attalais.id, versija: String(attalais.version), mainits: true });
      await augsupieladet(deps.meta());
      return 'augsupieladet';
    }
    return 'atcelts';
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

  return { savienot, sinhronizet, aiznemts: () => !!notiek };
}
