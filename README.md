# Grāmatvedības rīks

Rīks saimnieciskās darbības veicējam vispārējā nodokļu režīmā, kas saņem autoratlīdzības ar nosacītajiem izdevumiem (MK noteikumu Nr. 899 57. punkts). No rēķiniem, autorlīgumiem un bankas izraksta tas sagatavo skaitļus pašnodarbinātā ziņojumam un gada deklarācijas D3 pielikumam.

Rīks nav nodokļu konsultants un neko neiesniedz EDS.

## Struktūra

- `index.html` — rīka lapa.
- `rules/` — noteikumi katram gadam (likmes, minimālā alga, neapliekamais minimums, D3 rindu numuri). Jauns gads = jauns fails un ieraksts `rules/index.json`.
- `src/app.js` — saskarne.
- `src/calc.js` — aprēķini: ienākumi pa mēnešiem, VSAOI, ceturkšņa ziņojums, D3, gada deklarācijas aplēse.
- `src/banka.js` — Swedbank CSV izraksta nolasīšana un maksājumu piesaiste rēķiniem un autorlīgumiem.
- `src/eRekins.js` — e-rēķins XML formātā (Peppol BIS Billing 3.0).
- `src/rekinsHtml.js`, `src/summaVardiem.js` — rēķina izskats un summa vārdiem.
- `src/rekviziti.js` — pasūtītāja rekvizītu sadalīšana pa laukiem no ielīmēta teksta.
- `src/darbaVeidi.js` — darba veidi un nosacīto izdevumu normas.
- `src/glabatuve.js` — datu kopija pārlūkā (localStorage).
- `src/drive.js` — Google Drive savienojums: pieslēgšanās (Google Identity Services), mapes un faili. Piekļuve tikai `drive.file`, piekļuves atslēga tikai atmiņā.
- `src/sinhronizacija.js` — sinhronizācija starp pārlūku un Drive: konfliktu atpazīšana pēc faila versijas, ikdienas rezerves kopija Drive, viena konta slēdzene.
- `privatums.html` — privātuma politika (Google prasa publicētai lietotnei).
- `src/parskats.js`, `src/xlsx.js` — gada pārskats grāmatvedim Excel formātā (ar formulām), bez ārējām bibliotēkām.
- `tests/` — publiskie testi ar VID piemēriem un izdomātiem datiem.

Testi ar īstiem personas datiem glabājas tikai lokāli mapē `private/` un netiek publicēti (sk. `.gitignore`).

## Testi

Vajag Node.js 20 vai jaunāku:

```
npm test
```

Dati glabājas katra lietotāja paša Google Drive, nevis šajā repozitorijā vai kādā serverī.

## Drošība

- Nav sava servera; dati ir tikai lietotāja pārlūkā un viņa Google Drive.
- `index.html` satur Content-Security-Policy: skripti tikai no pašas vietnes un Google pieslēgšanās, savienojumi tikai ar Google Drive API.
- Google piekļuves atslēga netiek saglabāta pārlūka glabātuvē. Client ID nav slepens; Google to pieņem tikai no `traktorisccc.github.io`.
- Pirms datu pārrakstīšanas Drive tiek saglabāta rezerves kopija mapē „Rezerves kopijas” (reizi dienā un katrā konfliktā).
- Kodā un publiskajos testos nedrīkst būt īstu personas datu; testi ar īstiem datiem ir mapē `private/`, kas netiek publicēta.
