// Servisa skripts: rīka faili tiek glabāti kā viena versija. Jauna versija tiek ielādēta fonā un ieslēgta tikai tad,
// kad lietotājs spiež „Atjaunot” — tāpēc vecie un jaunie faili nekad nesajaucas. Dati šeit netiek glabāti (tie ir pārlūkā un Drive).
const VERSIJA = '2026-11-25.4';
const KESS = `gramatvediba-${VERSIJA}`;
const FAILI = [
  './', 'index.html', 'privatums.html', 'manifest.json',
  'ikonas/ikona-32.png', 'ikonas/ikona-180.png', 'ikonas/ikona-192.png', 'ikonas/ikona-512.png',
  'fonts/GramatvedibaSans-Regular.ttf', 'fonts/GramatvedibaSans-Bold.ttf',
  'rules/index.json', 'rules/2025.json', 'rules/2026.json',
  'src/app.js', 'src/apvienot.js', 'src/konti.js', 'src/banka.js', 'src/calc.js', 'src/darbaVeidi.js', 'src/drive.js', 'src/eRekins.js', 'src/glabatuve.js',
  'src/gmail.js', 'src/hanzas.js', 'src/meklesana.js', 'src/parskats.js', 'src/pdf.js', 'src/rekinsHtml.js', 'src/rekviziti.js',
  'src/sinhronizacija.js', 'src/summaVardiem.js', 'src/versija.js', 'src/vidDeklaracija.js', 'src/xlsx.js', 'src/zurnals.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(KESS).then((c) => c.addAll(FAILI.map((f) => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('gramatvediba-') && k !== KESS) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'atjaunot') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const r = e.request, url = new URL(r.url);
  if (r.method !== 'GET' || url.origin !== self.location.origin) return;     // Google, fonti u. c. — tieši no tīkla
  e.respondWith((async () => {
    const k = await caches.open(KESS);
    const atrasts = await k.match(r, { ignoreSearch: true }) || (r.mode === 'navigate' ? await k.match('index.html') : null);
    return atrasts || fetch(r);
  })());
});
