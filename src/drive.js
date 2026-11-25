// Google Drive savienojums bez sava servera.
// Pieslēgšanās: Google Identity Services (token model). Piekļuves atslēga glabājas tikai šīs lapas atmiņā.
// Piekļuve: drive.file — rīks redz tikai paša izveidotos failus.

export const CLIENT_ID = '333231552776-5gfsdt9m47ukgko3ilh3klad5mr22al2.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const MAPE = 'application/vnd.google-apps.folder';
export const SAKNES_MAPE = 'Grāmatvedība';
export const DATU_FAILS = 'gramatvediba-dati.json';
export const REZERVJU_MAPE = 'Rezerves kopijas';

let atslega = null;           // { token, lidz }
let tokenKlients = null;

export class DriveKluda extends Error {
  constructor(zina, kods) { super(zina); this.kods = kods; }
}

/** Ielādē Google pieslēgšanās skriptu (vienreiz). */
export function ieladetGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((ok, slikti) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => ok(); s.onerror = () => slikti(new DriveKluda('Neizdevās ielādēt Google pieslēgšanos. Pārbaudi interneta savienojumu.', 'tikls'));
    document.head.appendChild(s);
  });
}

export const irAtslega = () => !!atslega && atslega.lidz > Date.now() + 60_000;
export const aizmirstAtslegu = () => {
  const t = atslega?.token; atslega = null;
  if (t) try { window.google?.accounts?.oauth2?.revoke?.(t, () => {}); } catch { /* nav svarīgi */ }
};

/**
 * Pieprasa piekļuves atslēgu. Jāizsauc no lietotāja klikšķa, jo Google atver logu.
 * konts: e-pasts, ko piedāvāt Google (lai nav jāizvēlas no vairākiem kontiem).
 */
export async function pieslegties(konts) {
  await ieladetGis();
  return new Promise((ok, slikti) => {
    const callback = (r) => {
      if (r.error) { slikti(new DriveKluda(r.error === 'access_denied' ? 'Piekļuve netika atļauta.' : `Google atbilde: ${r.error}`, r.error)); return; }
      if (!window.google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) { slikti(new DriveKluda('Google logā jāatļauj piekļuve Drive failiem (ķeksītis pie Drive).', 'scope')); return; }
      atslega = { token: r.access_token, lidz: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
      ok();
    };
    const error_callback = (e) => slikti(new DriveKluda(e?.type === 'popup_failed_to_open' ? 'Pārlūks bloķēja Google logu. Atļauj uznirstošos logus šai vietnei.' : 'Google logs tika aizvērts.', e?.type || 'popup'));
    tokenKlients = window.google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, include_granted_scopes: false, callback, error_callback, ...(konts ? { login_hint: konts } : {}) });
    tokenKlients.requestAccessToken({ prompt: '' });
  });
}

async function pieprasit(url, opcijas = {}, kaTeksts = false) {
  if (!irAtslega()) throw new DriveKluda('Savienojums ar Google Drive beidzies. Pieslēdzies vēlreiz.', 'atslega');
  const r = await fetch(url, { ...opcijas, headers: { Authorization: `Bearer ${atslega.token}`, ...(opcijas.headers || {}) } });
  if (r.status === 401) { atslega = null; throw new DriveKluda('Savienojums ar Google Drive beidzies. Pieslēdzies vēlreiz.', 'atslega'); }
  if (r.status === 404) throw new DriveKluda('Fails Google Drive vairs nav atrodams.', 'nav');
  if (!r.ok) throw new DriveKluda(`Google Drive kļūda (${r.status}).`, 'http');
  return kaTeksts ? r.text() : r.json();
}
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Pieslēgtā konta e-pasts. */
export async function kontaEpasts() {
  const a = await pieprasit(`${API}/about?fields=user(emailAddress)`);
  return String(a.user?.emailAddress || '').toLowerCase();
}

/** Atrod (vai izveido) mapi pēc nosaukuma; vecaks — mapes id vai null saknei. */
export async function mape(nosaukums, vecaks = null, izveidot = true) {
  const vieta = vecaks ? `'${q(vecaks)}' in parents` : `'root' in parents`;
  const r = await pieprasit(`${API}/files?q=${encodeURIComponent(`name='${q(nosaukums)}' and mimeType='${MAPE}' and trashed=false and ${vieta}`)}&fields=files(id)&spaces=drive`);
  if (r.files?.length) return r.files[0].id;
  if (!izveidot) return null;
  const j = await pieprasit(`${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nosaukums, mimeType: MAPE, ...(vecaks ? { parents: [vecaks] } : {}) }) });
  return j.id;
}

/** Atrod failu mapē pēc nosaukuma. Atgriež { id, version, modifiedTime } vai null. */
export async function atrastFailu(nosaukums, mapesId) {
  const r = await pieprasit(`${API}/files?q=${encodeURIComponent(`name='${q(nosaukums)}' and '${q(mapesId)}' in parents and trashed=false`)}&fields=files(id,version,modifiedTime)&orderBy=modifiedTime desc&spaces=drive`);
  return r.files?.[0] || null;
}

/** Faili mapē (jaunākie pirmie), piem., rezerves kopijas. */
export async function failiMape(mapesId) {
  const r = await pieprasit(`${API}/files?q=${encodeURIComponent(`'${q(mapesId)}' in parents and trashed=false and mimeType!='${MAPE}'`)}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=60&spaces=drive`);
  return r.files || [];
}

export async function metadati(id) {
  const m = await pieprasit(`${API}/files/${encodeURIComponent(id)}?fields=id,version,modifiedTime,trashed`);
  if (m.trashed) throw new DriveKluda('Datu fails Google Drive ir izmests miskastē.', 'nav');
  return m;
}

export const lejupieladet = (id) => pieprasit(`${API}/files/${encodeURIComponent(id)}?alt=media`, {}, true);

/** Izveido jaunu failu mapē. saturs: teksts vai Blob. */
export async function izveidotFailu(nosaukums, mapesId, saturs, tips = 'application/json') {
  const robeza = 'gramatvediba' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: nosaukums, parents: [mapesId], mimeType: tips });
  const body = new Blob([`--${robeza}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${robeza}\r\nContent-Type: ${tips}\r\n\r\n`, saturs, `\r\n--${robeza}--`]);
  return pieprasit(`${UPLOAD}/files?uploadType=multipart&fields=id,version,modifiedTime,webViewLink`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${robeza}` }, body });
}

/** Pārraksta esoša faila saturu. */
export const atjaunotFailu = (id, saturs, tips = 'application/json') =>
  pieprasit(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=id,version,modifiedTime,webViewLink`, { method: 'PATCH', headers: { 'Content-Type': tips }, body: saturs });

/** Kopija citā mapē (rezerves kopijām). */
export const kopet = (id, nosaukums, mapesId) =>
  pieprasit(`${API}/files/${encodeURIComponent(id)}/copy?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nosaukums, parents: [mapesId] }) });

/**
 * Saglabā failu mapē pēc ceļa (piem. ['2026', 'Rēķini']) zem saknes mapes; ja tāda nosaukuma fails jau ir, to pārraksta.
 * kesh: { 'ceļš': mapesId } — lai katru reizi nemeklētu mapes; kļūdas gadījumā kešu notīra un mēģina vēlreiz.
 */
export async function saglabatMape(saknesId, cels, nosaukums, saturs, tips, kesh = {}) {
  const meginat = async () => {
    let vecaks = saknesId, atslega = '';
    for (const dala of cels) {
      atslega = atslega ? `${atslega}/${dala}` : dala;
      vecaks = kesh[atslega] || (kesh[atslega] = await mape(dala, vecaks));
    }
    const esošs = await atrastFailu(nosaukums, vecaks);
    return esošs ? atjaunotFailu(esošs.id, saturs, tips) : izveidotFailu(nosaukums, vecaks, saturs, tips);
  };
  try { return await meginat(); }
  catch (e) { if (e.kods !== 'nav') throw e; for (const k of Object.keys(kesh)) delete kesh[k]; return meginat(); }
}
