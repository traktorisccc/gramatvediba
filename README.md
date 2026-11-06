# Grāmatvedības rīks

Rīks saimnieciskās darbības veicējam vispārējā nodokļu režīmā, kas saņem autoratlīdzības ar nosacītajiem izdevumiem (MK noteikumu Nr. 899 57. punkts). No rēķiniem, autorlīgumiem un bankas izraksta tas sagatavo skaitļus pašnodarbinātā ziņojumam un gada deklarācijas D3 pielikumam.

Rīks nav nodokļu konsultants un neko neiesniedz EDS.

## Struktūra

- `rules/` — noteikumi katram gadam (likmes, minimālā alga, neapliekamais minimums, D3 rindu numuri). Jauns gads = jauns fails.
- `src/darbaVeidi.js` — darba veidi un nosacīto izdevumu normas.
- `src/calc.js` — aprēķini: ienākumi pa mēnešiem, VSAOI, ceturkšņa ziņojums, D3, gada deklarācijas aplēse.
- `src/banka.js` — Swedbank CSV izraksta nolasīšana un maksājumu piesaiste rēķiniem un autorlīgumiem.
- `tests/` — publiskie testi ar VID piemēriem un izdomātiem datiem.

Testi ar īstiem personas datiem glabājas tikai lokāli mapē `private/` un netiek publicēti (sk. `.gitignore`).

## Testi

Vajag Node.js 20 vai jaunāku:

```
npm test
```

Dati glabājas katra lietotāja paša Google Drive, nevis šajā repozitorijā vai kādā serverī.
