// Rēķina nosūtīšana no lietotāja Gmail bez sava servera.
// Atļauja: gmail.send — tikai sūtīšana; rīks nevar lasīt, mainīt vai dzēst vēstules.
// Atslēga ir atsevišķa no Drive atslēgas (include_granted_scopes: false), glabājas tikai atmiņā un tiek prasīta tikai sūtot.
import { CLIENT_ID, ieladetGis } from './drive.js';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const SCOPE = `openid email ${GMAIL_SCOPE}`;            // e-pasts vajadzīgs, lai pārbaudītu, ka sūta no grāmatvedības konta
const SUTIT = 'https://www.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media';   // tas pats augšupielādes serviss, ko izmanto Drive
const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';

export class GmailKluda extends Error {
  constructor(zina, kods) { super(zina); this.kods = kods; }
}

// ---------- Vēstules sagatavošana (tīras funkcijas, testējamas) ----------

/** Viena adrese, bez vārda, komatiem un rindu pārnesumiem (lai nevar pievienot citus saņēmējus vai galvenes). */
export function derigaAdrese(e) {
  const a = String(e ?? '').trim();
  return a.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(a);
}

function base64(baiti) {
  let s = '';
  for (let i = 0; i < baiti.length; i += 0x8000) s += String.fromCharCode(...baiti.subarray(i, i + 0x8000));
  return btoa(s);
}
const utf8 = (t) => new TextEncoder().encode(t);
const rindas76 = (b64) => b64.replace(/.{1,76}/g, '$&\r\n');
/** Galvenes vērtība ar garumzīmēm (RFC 2047), bez rindu pārnesumiem. */
const galvene = (t) => {
  const v = String(t ?? '').replace(/[\r\n]+/g, ' ').trim();
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${base64(utf8(v))}?=`;
};
/** Sūtītāja vārds: ASCII pēdiņās, ar garumzīmēm — RFC 2047. */
const vardsGalvene = (v) => { const t = String(v).replace(/[\r\n"\\]+/g, ' ').trim(); return /^[\x20-\x7e]*$/.test(t) ? `"${t}"` : `=?UTF-8?B?${base64(utf8(t))}?=`; };
/** Faila nosaukums tikai ar drošām ASCII zīmēm. */
export const drosNosaukums = (n) => String(n || 'fails').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'fails';

/**
 * Sagatavo vēstuli RFC 5322 formātā ar vienu pielikumu.
 * v: { no: { vards, epasts }, kam, temats, teksts, fails: { nosaukums, saturs: Uint8Array, tips } }
 */
export function sagatavotVestuli(v, robeza = 'gr-' + Math.random().toString(36).slice(2, 12)) {
  if (!derigaAdrese(v.kam)) throw new GmailKluda('Saņēmēja e-pasta adrese nav derīga.', 'adrese');
  if (v.no?.epasts && !derigaAdrese(v.no.epasts)) throw new GmailKluda('Sūtītāja adrese nav derīga.', 'adrese');
  const no = v.no?.epasts ? (v.no.vards ? `${vardsGalvene(v.no.vards)} <${v.no.epasts}>` : v.no.epasts) : null;
  const nos = drosNosaukums(v.fails.nosaukums), tips = /^[a-z]+\/[a-z0-9.+-]+$/i.test(v.fails.tips || '') ? v.fails.tips : 'application/octet-stream';
  const teksts = String(v.teksts ?? '').replace(/\r?\n/g, '\r\n');
  return [
    ...(no ? [`From: ${no}`] : []),
    `To: ${v.kam.trim()}`,
    `Subject: ${galvene(v.temats)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${robeza}"`,
    '',
    `--${robeza}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    rindas76(base64(utf8(teksts))) + `--${robeza}`,
    `Content-Type: ${tips}; name="${nos}"`,
    `Content-Disposition: attachment; filename="${nos}"`,
    'Content-Transfer-Encoding: base64',
    '',
    rindas76(base64(v.fails.saturs)) + `--${robeza}--`,
    ''
  ].join('\r\n');
}

// ---------- Atļauja un sūtīšana ----------

let atslega = null;            // { token, lidz, epasts }
export const gmailKonts = () => (atslega && atslega.lidz > Date.now() + 60_000 ? atslega.epasts : '');
export const aizmirstGmail = () => {
  const t = atslega?.token; atslega = null;
  if (t) try { window.google?.accounts?.oauth2?.revoke?.(t, () => {}); } catch { /* nav svarīgi */ }
};

/** Ielādē Google pieslēgšanos iepriekš, lai klikšķis uz „Nosūtīt” uzreiz var atvērt Google logu. */
export const sagatavot = () => ieladetGis().catch(() => {});

/**
 * Pieprasa sūtīšanas atļauju (jāizsauc no klikšķa) un pārbauda, kam tā izsniegta.
 * konts: grāmatvedības Google konts; ja norādīts, citu kontu nepieņem.
 */
export async function atlauja(konts = '') {
  if (gmailKonts()) return atslega.epasts;
  await ieladetGis();
  const r = await new Promise((ok, slikti) => {
    const klients = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE, include_granted_scopes: false, ...(konts ? { login_hint: konts } : {}),
      callback: (x) => x.error ? slikti(new GmailKluda(x.error === 'access_denied' ? 'E-pasta sūtīšana netika atļauta.' : `Google atbilde: ${x.error}`, x.error)) : ok(x),
      error_callback: (e) => slikti(new GmailKluda(e?.type === 'popup_failed_to_open' ? 'Pārlūks bloķēja Google logu. Atļauj uznirstošos logus šai vietnei.' : 'Google logs tika aizvērts.', e?.type || 'popup'))
    });
    klients.requestAccessToken({ prompt: '' });
  });
  if (!window.google.accounts.oauth2.hasGrantedAllScopes(r, GMAIL_SCOPE)) throw new GmailKluda('Google logā jāatļauj e-pasta sūtīšana (ķeksītis pie „Send email on your behalf”).', 'scope');
  // Pārbauda pie Google: atslēga izsniegta tieši šim rīkam, ar sūtīšanas atļauju, un kuram kontam.
  const t = await fetch(`${TOKENINFO}?access_token=${encodeURIComponent(r.access_token)}`).then((x) => x.ok ? x.json() : null).catch(() => null);
  const epasts = String(t?.email || '').toLowerCase();
  const atpakal = () => { try { window.google.accounts.oauth2.revoke(r.access_token, () => {}); } catch { /* */ } };
  if (!t || t.aud !== CLIENT_ID || !String(t.scope || '').split(' ').includes(GMAIL_SCOPE) || !epasts) { atpakal(); throw new GmailKluda('Neizdevās pārbaudīt Google atļauju. Mēģini vēlreiz.', 'parbaude'); }
  if (konts && epasts !== konts.toLowerCase()) { atpakal(); throw new GmailKluda(`Atļauja tika dota kontam ${epasts}, bet grāmatvedība ir piesaistīta ${konts}. Mēģini vēlreiz un izvēlies ${konts}.`, 'konts'); }
  atslega = { token: r.access_token, lidz: Date.now() + (Number(r.expires_in) || 3600) * 1000, epasts };
  return epasts;
}

/** Nosūta sagatavotu vēstuli. Atgriež Gmail vēstules id. */
export async function nosutit(vestule) {
  if (!gmailKonts()) throw new GmailKluda('Nav e-pasta sūtīšanas atļaujas.', 'atslega');
  let r;
  try { r = await fetch(SUTIT, { method: 'POST', headers: { Authorization: `Bearer ${atslega.token}`, 'Content-Type': 'message/rfc822' }, body: vestule }); }
  catch { throw new GmailKluda('Gmail atbilde nepienāca, tāpēc nav zināms, vai vēstule aizgāja. Pārbaudi Gmail mapi „Nosūtītie”, pirms sūti vēlreiz.', 'neskaidrs'); }
  if (r.ok) return (await r.json()).id;
  const k = await r.json().catch(() => ({})), iemesls = k?.error?.errors?.[0]?.reason || k?.error?.status || '', zina = String(k?.error?.message || '');
  if (r.status === 401) { atslega = null; throw new GmailKluda('Gmail atļauja beigusies. Spied „Nosūtīt” vēlreiz.', 'atslega'); }
  if (r.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|disabled/i.test(iemesls + zina)) throw new GmailKluda('Google Cloud projektā nav ieslēgts Gmail API (APIs & Services → Library → Gmail API → Enable).', 'api');
  if (r.status === 403) { atslega = null; throw new GmailKluda('Google neatļāva sūtīt. Mēģini vēlreiz un atļauj e-pasta sūtīšanu.', 'atlauja'); }
  if (r.status === 400 && /invalid to|recipient/i.test(zina)) throw new GmailKluda('Gmail nepieņēma saņēmēja adresi.', 'adrese');
  throw new GmailKluda(`Gmail kļūda (${r.status}). Vēstule netika nosūtīta.`, 'http');
}
