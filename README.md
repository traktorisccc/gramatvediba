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
- `src/glabatuve.js` — datu glabāšana (pagaidām pārlūkā).
- `tests/` — publiskie testi ar VID piemēriem un izdomātiem datiem.

Testi ar īstiem personas datiem glabājas tikai lokāli mapē `private/` un netiek publicēti (sk. `.gitignore`).

## Testi

Vajag Node.js 20 vai jaunāku:

```
npm test
```

Dati glabājas katra lietotāja paša Google Drive, nevis šajā repozitorijā vai kādā serverī.
