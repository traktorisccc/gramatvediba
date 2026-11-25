# Grāmatvedības rīks — izstrādātāja rokasgrāmata

Šis dokuments ir domāts tam, kurš rīku mainīs nākotnē: īpašniekam kopā ar Claude jaunā čatā vai jebkuram izstrādātājam. Tajā ir aprakstīts, **kā rīks uzbūvēts**, **kāpēc** daudzi lēmumi pieņemti tieši tā un **kā droši izlaist jaunu versiju**.

Pēdējo reizi atjaunināts: versija **2026-11-25.4** (25.11.2026.).

> **Noteikums:** šo failu papildina katrā versijā, kurā mainās uzbūve, datu formāts, nodokļu loģika vai lēmumi. Ja kods un rokasgrāmata atšķiras, pareizs ir kods, un rokasgrāmata jāizlabo.

---

## 0. Kā sākt darbu jaunā čatā

Iekopē jaunajā čatā (vēlams claude.ai projektā „Grāmatvedības rīks”):

```
Strādāsim pie mana grāmatvedības rīka. Kods: GitHub repozitorijs traktorisccc/gramatvediba
(publicēts https://traktorisccc.github.io/gramatvediba/). Vispirms izlasi docs/ROKASGRAMATA.md
un projekta dokumentu „Grāmatvedības rīks — konteksts”. Ievēro sadaļas „Drošība un privātums”
un „Jaunas versijas izlaišana”. Nebūvē, kamēr es nesaku „aiziet”; idejas pieraksti specifikācijā.
Ja vajag testus ar īstajiem datiem, es augšupielādēšu privāto zip (mape private/).
Tagad gribu: …
```

Ko jaunajam čatam vajag:

| Kas | Kur | Publisks? |
|---|---|---|
| Kods, publiskie testi, šī rokasgrāmata | GitHub `traktorisccc/gramatvediba` | jā |
| Specifikācija ar ideju sarakstu („Nākamajai versijai”) | claude.ai dokuments „Grāmatvedības rīka specifikācija” | nē |
| Personīgais konteksts (nodokļu situācija, atvērtie darbi) | projekta dokuments „Grāmatvedības rīks — konteksts” | nē |
| Privātie testi un īstie dati | `private/` mape: tikai īpašnieka datorā / Drive kā zip | **nekad** |

---

## 1. Kas ir rīks

Rīks saimnieciskās darbības veicējam vispārējā nodokļu režīmā (Latvija, nav PVN maksātājs, vienkāršā ieraksta sistēma), kas saņem autoratlīdzības ar **nosacītajiem izdevumiem** (MK noteikumu Nr. 899 57. punkts). No rēķiniem, autorlīgumiem un bankas izrakstiem tas sagatavo:

- pašnodarbinātā **ceturkšņa ziņojuma** skaitļus EDS izkārtojumā (VSAOI);
- gada deklarācijas **D3 pielikumu un D lapu**, salīdzinājumu ar VID sagatavoto deklarāciju (XML) un soļus, kas EDS jāmaina;
- **ieņēmumu un izdevumu žurnālu** un **Excel pārskatu grāmatvedim** (ar formulām);
- **rēķinus** (PDF, e-rēķins XML, Hanzas Perons Excel paraugs) un to nosūtīšanu caur Gmail.

**Robežas:** rīks neko neiesniedz EDS un nav nodokļu konsultants. Pamatprincips: **rīks nemin** — ja nav drošs, tas jautā lietotājam (piemēram, bankas maksājums nonāk sarakstā „Jāizvērtē”, nevis tiek klusi izslēgts).

**Ārpus darbības jomas (apzināti):** PVN, mikrouzņēmumu nodoklis, faktiskie izdevumi un pamatlīdzekļi, attaisnoto izdevumu čeku ievade (tie paliek EDS/VID lietotnē; rīks tos paņem no VID XML), ienākumu prognoze, tiešs savienojums ar banku, AI un savs serveris.

---

## 2. Uzbūve

**Tehnoloģija:** viena statiska lapa (`index.html`) + JavaScript ES moduļi `src/`. **Nav ārēju bibliotēku**, nav būvēšanas soļa, nav sava servera. XLSX, PDF un XML rīks raksta pats. Darbojas jebkurā mūsdienu pārlūkā; publicēts GitHub Pages; instalējams kā PWA.

**Datu plūsma:** dati ir pārlūkā (`localStorage`) un, ja pieslēgts, lietotāja Google Drive (`Grāmatvedība/gramatvediba-dati.json`). Visi aprēķini notiek pārlūkā pēc gada noteikumu faila (`rules/<gads>.json`).

### Faili

| Fails | Ko dara |
|---|---|
| `index.html` | Lapa, stili, CSP, manifests, fonta saites. |
| `sw.js` | Servisa skripts (PWA): visi faili kešā kā viena versija; jauna versija ieslēdzas tikai pēc „Atjaunot”. **Saraksts `FAILI` jāpapildina ar katru jaunu failu.** |
| `manifest.json`, `ikonas/` | PWA manifests un ikonas (debeszils fons, G, dzeltens pikseļu zibens). |
| `privatums.html` | Privātuma politika (Google prasa publicētai OAuth lietotnei). |
| `rules/<gads>.json`, `rules/index.json` | Gada noteikumi: likmes, minimālā alga, neapliekamais minimums, D3/D rindu numuri. |
| `fonts/` | `GramatvedibaSans` (Liberation Sans 2.1.5 apakškopa, SIL OFL) rēķina PDF. Virsrakstu fonts lapā: Press Start 2P (Google Fonts). |
| `src/app.js` | Visa saskarne: skati (Pārskats, Rēķini, Autorlīgumi, Banka, Žurnāls, Ceturkšņa ziņojums, Gada deklarācija, Iestatījumi), sākuma ekrāns, notikumi. Lielākais fails. |
| `src/calc.js` | Aprēķinu kodols (tīras funkcijas): ienākumi pa mēnešiem, VSAOI, ceturkšņa ziņojums, D3, D lapa. |
| `src/darbaVeidi.js` | Darba veidi un nosacīto izdevumu normas. |
| `src/banka.js` | Swedbank CSV nolasīšana, maksājumu klasifikācija un piesaiste rēķiniem/līgumiem. |
| `src/konti.js` | Vairāki konti (atpazīšana, arhīva kodu sadursmes), izrakstu periodi, ar roku ievadītu ienākumu apvienošana, nodokļu samaksas atzīmes un to salīdzināšana ar izrakstu. |
| `src/meklesana.js` | Rēķinu un bankas darījumu meklēšana/filtri (bez garumzīmēm, ar latviešu galotņu celmiem). |
| `src/zurnals.js` | Žurnāls pa ceturkšņiem (viens avots rīka skatam un Excel). |
| `src/vidDeklaracija.js` | VID sagatavotās deklarācijas XML (EDS `DokIINGDv…`) nolasīšana (tikai skaitļi) un salīdzinājums ar rīka aprēķinu. |
| `src/parskats.js`, `src/xlsx.js` | Excel pārskats grāmatvedim ar formulām; XLSX rakstītājs/lasītājs. |
| `src/pdf.js` | Rēķina PDF (iegults fonts, kopējams teksts, logo). |
| `src/rekinsHtml.js`, `src/summaVardiem.js` | Rēķina numura/summas formatēšana; summa vārdiem (LV ar locījumiem, EN). |
| `src/eRekins.js` | E-rēķins XML (EN 16931 / Peppol BIS Billing 3.0). |
| `src/hanzas.js` | Hanzas Perons Excel rēķina parauga aizpildīšana (lauki tiek atrasti pēc uzrakstiem). |
| `src/rekviziti.js` | Ielīmēta pasūtītāja rekvizītu teksta sadalīšana pa laukiem. |
| `src/glabatuve.js` | Datu struktūra (`TUKSI_DATI`), localStorage, eksports/imports. |
| `src/drive.js` | Google Drive (GIS token model, `drive.file`), mapes, faili, rezerves kopijas. |
| `src/sinhronizacija.js`, `src/apvienot.js` | Sinhronizācija ar Drive; trīspusēja apvienošana pa ierakstiem. |
| `src/gmail.js` | Rēķina nosūtīšana ar `gmail.send` (atsevišķa atslēga, konta pārbaude). |
| `src/versija.js` | Rīka versija; **jābūt tādai pašai kā `sw.js`**. |

---

## 3. Datu modelis

Viens JSON objekts (`src/glabatuve.js`, `TUKSI_DATI`). **Lauki tiek tikai pievienoti, nekad pārdēvēti vai dzēsti** — vecie dati Drive un citās ierīcēs jāspēj nolasīt.

| Lauks | Saturs |
|---|---|
| `versija` | Datu formāta versija (1). |
| `profils` | Lietotāja rekvizīti, logo (data URL), `nakamaisNr` (nākamais rēķina numurs; numerāciju restartē lietotājs pats). |
| `pasutitaji[]` | `{ id, nosaukums, regNr, adrese{iela,pilseta,indekss,valsts}, epasts, konts, banka, bic, veidne: 'standarta'|'hanzas', budzetaIestade }` |
| `rekini[]` | `{ id, nr, datums, termins, pasutitajsId, valoda, veids, ligumaNr, periods, pozicijas[{nosaukums,daudzums,cena}], nosutits, samaksatsCitur{datums}, pdfDrive, driveFails }` |
| `autorligumi[]` | `{ id, nr, pasutitajsId, datums, summa, veids, izmaksatajsIetur, projekts, pdfDrive }` |
| `darijumi[]` | Bankas darījumi un ar roku ievadītie: `{ arhivaKods, bankasKods?, konts?, datums, partneris, info, summa, valuta, virziens 'K'|'D', kategorija, saite{tips:'rekins'|'autorligums',kods,nr}?, veids?, nodokluGads? (VID maksājumiem), arRoku?, avots? }` |
| `maksataji{}` | Atcerētās kategorijas: normalizēts maksātāja nosaukums → kategorija. |
| `gadi{}` | Gads → EDS dati: `d1Apliekamie, d1Ieturetais, citiNodokli, dzivibasIemaksas, attaisnotie, vsaoiDeklareta, vidDekl{…}` (VID XML skaitļi). |
| `samaksas{}` | Atzīmes „Iesniegts un samaksāts”: `'2026-C1'` (ceturkšņa VSAOI), `'2026-IIN'` → `{ zinots, maksajumi[{summa,datums}] }`; `'2025-norekinats'` → `{ datums }`. IIN atmaksa: `zinots` < 0, saņemtā atmaksa — maksājums ar mīnusu. |
| `konti{}` | IBAN → `{ nosaukums }`. |
| `izraksti{}` | `'IBAN|no|lidz'` → `{ konts, no, lidz }` — ielādētie izrakstu periodi. |
| `hanzasBlanka` | Hanzas Perons Excel paraugs (base64). |
| `drive` | Drive piesaiste (konts — viena konta slēdzene). |

**Darījumu kategorijas:** `sd` (saimnieciskā darbība), `nodokli-samaksaja-izmaksatajs`, `akka` (AKKA/LAA, D1), `vid-atmaksa`, `vid-maksajums` (izejošs), `kartes-atgriesana`, `procenti`, `personigs`, `savs-konts`, `jaizverte` (tikai neapstiprinātā izrakstā).

**localStorage atslēgas:** `gramatvediba:dati` (dati), `gramatvediba:banka-sesija` (neapstiprināts izraksts), `gramatvediba:drive` (Drive stāvoklis), `gramatvediba:sinh-baze` (pēdējā kopīgā versija apvienošanai), `gramatvediba:dati-pirms-drive` (rezerve). `sessionStorage` `gramatvediba:bez-drive` — lietotājs šajā sesijā izvēlējās „Strādāt bez Drive”.

---

## 4. Glabāšana, Google Drive un sinhronizācija

- **Drive mapes:** `Grāmatvedība/` ar `gramatvediba-dati.json`, `Rezerves kopijas/` un `<gads>/Rēķini`, `<gads>/Līgumi`, `<gads>/Bankas izraksti`, `<gads>/Atskaites`.
- **Atļauja `drive.file`:** rīks redz tikai paša izveidotos failus. Ar roku Drive iemestu failu rīks neredz.
- **Piekļuves atslēga (token) tikai atmiņā**, nekad localStorage. `include_granted_scopes: false`, lai Drive atslēgai nepievienojas Gmail atļauja.
- **Viena konta slēdzene:** datos ierakstīts Drive konts; ar citu kontu rīks atsakās strādāt, nevis klusi veido jaunu grāmatvedību.
- **Sākuma ekrāns:** ja Drive nav pieslēgts šajā sesijā, vispirms liela poga „Pieslēgties Google Drive”, mazāka „Strādāt bez Drive” (izvēle der līdz cilnes aizvēršanai).
- **Sinhronizācija (`sinhronizacija.js` → `apvienot.js`):** salīdzina Drive faila versiju. Ja dati mainīti abās vietās — **trīspusēja apvienošana pa ierakstiem** ar bāzi (pēdējā kopīgā versija). Kolekcijas pēc atslēgām: rēķini/līgumi/pasūtītāji pēc `id`, darījumi pēc `arhivaKods`; kartes (`maksataji`, `gadi`, `samaksas`, `konti`, `izraksti`) pa atslēgām; profils pa laukiem; `nakamaisNr` = max. Dzēšana tiek pārnesta tikai, ja bāze pierāda, ka ieraksts bija un otra puse to nemainīja; bez bāzes — tikai savienība. Lietotājam jautā tikai par ierakstiem, kas laboti abās vietās. Pirms pārrakstīšanas — rezerves kopija pārlūkā un Drive; Iestatījumos var atjaunot no Drive kopijas.
- **Jauna karte datos** (piemēram, `samaksas`) jāpievieno `KARTES` sarakstam `apvienot.js`, citādi tā apvienojas kā viens vesels lauks.

### Google Cloud

- OAuth Client ID (Web) ir `src/drive.js` (`CLIENT_ID`). Client ID nav slepens; Google to pieņem tikai no atļautā JavaScript avota (`https://traktorisccc.github.io`). **Client secret rīkā nav un nekad nav vajadzīgs.**
- Atļaujas: `drive.file`; Gmail sūtīšanai atsevišķi `openid email gmail.send`. Gmail atslēga tiek pārbaudīta ar `oauth2.googleapis.com/tokeninfo` (`aud`, `scope`, e-pasts = Drive konts).
- Ja maina domēnu vai pievieno atļaujas: Google Cloud Console → APIs & Services → Credentials (atļautie avoti) un OAuth consent screen (atļaujas); papildina `privatums.html` un CSP.

---

## 5. Nodokļu loģika (ar pamatojumu)

Visi aprēķini ir mehāniski, pēc konkrētā gada noteikumu faila; noapaļošana līdz centiem katrā solī kā EDS (`r2`).

### Ieņēmumi un normas
- Ieņēmumi tiek uzskaitīti **naudas saņemšanas dienā** (bankas izraksta datums), nevis rēķina datumā.
- Nosacītie izdevumi = ieņēmumi × darba veida norma (`src/darbaVeidi.js`). 50 % mākslas jaunradei (90.13 — noklusējums), 90.12, 59.11, 74.12, 74.14. Lekcijām 25 % / 0 % (gaida VID uzziņu).
- **Lēmums:** rēķini bez autorlīguma par to pašu darba veidu arī saņem 50 % normu (lietotājam to apstiprinājis VID), ja darbības joma reģistrēta VID profilā.
- **Lēmums:** ienākumi, no kuriem nodokļus ieturēja izmaksātājs (`nodokli-samaksaja-izmaksatajs`), un AKKA/LAA **neiet** saimnieciskās darbības ieņēmumos, ceturkšņa ziņojumos un D3 (tie ir D1, ko EDS aizpilda pats). Žurnālā tie redzami kolonnā „Nodokļi jau samaksāti”.

### Ceturkšņa VSAOI (`calc.js`)
Pa mēnešiem: ienākums = ieņēmumi − nosacītie izdevumi. Ja ienākums ≥ minimālā alga: objekts = minimālā alga × `vsaoiLikme` (31,07 %) + 10 % pensiju apdrošināšanai no pārējā. Ja mazāks: tikai 10 % no ienākuma. Ceturkšņa summa = 3 mēnešu summa. Termiņi: iesniegt līdz 17., samaksāt līdz 23. datumam nākamajā mēnesī pēc ceturkšņa; labot bez soda vēl mēnesi.

### D3 un D lapa (`gadaDeklaracija` `calc.js`)
- D3: ieņēmumi (5. rinda), nosacītie izdevumi (6.), apliekamie (8.). Rindu numuri — `rules/<gads>.json` (`d3Rindas`, `dRindas`).
- **D01** = D1 apliekamie + D3 apliekamie.
- **D06** = VSAOI. Prioritāte: iesniegtā summa (`gadi.vsaoiDeklareta`, no VID XML D06) → atzīmētajos ceturkšņos iesniegtā (`samaksas.zinots`) → aprēķinātā. EDS izmanto iesniegtos ziņojumus, nevis „pareizo” summu.
- **D09** = min(šī gada pensiju fondu / dzīvības apdr. iemaksas, 10 % no D01, 4000).
- **D08** = min(600 €, pieejamie attaisnotie izdevumi ieskaitot pārnestos no iepriekšējiem gadiem, max(0, D01 − D06 − D09 − D11)). Pārējais tiek pārnests (VID „LimitsKopa”).
- **D11** = neapliekamais minimums × 12.
- **D18** = progresīvi: `iinLikme` līdz `iinSlieksnis`, virs tā `iinAugstaLikme`.
- **D24 / D25** = D18 + D19 − D23: pozitīvs — jāmaksā, negatīvs — pārmaksa (atmaksa).
- Šīs formulas pārbaudītas ar īstu gada deklarāciju līdz centam (privātajos testos): VID sagatavotā versija un pareizā versija sakrīt ar EDS pārrēķinu.

### VID deklarācijas XML imports (`vidDeklaracija.js`)
No EDS lejupielādētā `DokIINGDv…` XML tiek nolasīti **tikai skaitļi** (D1, D1¹, D3, D4 ar `SummaIA` un pārnestajiem gadiem, AIP iemaksas, D rindas). Personas kods, IBAN, adrese, tālrunis netiek nolasīti. `gadaLauki()` aizpilda gada laukus; `salidzinat()` dod rindas „VID versija / pareizi / ko darīt” un soļus, kas parādās arī Excel lapā „Kā aizpildīt EDS”.

### Atlikums ar VID (`nodokluAtlikums` `app.js`)
Atlikums = VSAOI (D06 loģika) + IIN (D24 − D25) − samaksātais. Samaksāto ņem no **atzīmēm „Iesniegts un samaksāts”**; ja gadam atzīmju nav — no bankas izrakstu VID maksājumiem (tikai aplēse). **Lēmums:** starpību pēc izrakstiem nesaukt par parādu — VID vienotais nodokļu konts ir viens maks, VID var ieskaitīt pārmaksu, ko izrakstā neredz. Galīgā pārbaude ir EDS „Nodokļu parāds 0,00”; tad lietotājs atzīmē „Ar VID viss norēķināts” (`samaksas['<gads>-norekinats']`).

Ja pēc atzīmēšanas aprēķins mainās (piemēram, vēlāk ielādēts ienākums), rīks brīdina un piedāvā „Labots un piemaksāts”. Bankas VID maksājuma nodokļu gads: janvāra maksājumi — iepriekšējam gadam (4. ceturksnis); marts–augusts — iepriekšējam, ja summa sakrīt ar iepriekšējā gada IIN (vai tā trešdaļu); citādi — tam pašam gadam; lietotājs var mainīt.

---

## 6. Banka

- **Formāts:** Swedbank CSV (`;`, pēdiņas). Ieraksta tipi: `10` sākuma atlikums, `20` darījums, `82` apgrozījums (K/D), `86` beigu atlikums. Ienākošo kopsumma tiek salīdzināta ar bankas kredīta apgrozījumu.
- **Klasifikācija (`klasificet`, bez AI), secība:** rēķina numurs mērķī + tieši tāda summa + rēķins vēl nav apmaksāts → pasūtītājs un summa vienīgajam neapmaksātajam rēķinam → autorlīgums → zināmi maksātāji (AKKA/LAA, VID, kartes atgriešana, procenti, savs vārds = `savs-konts`) → atcerētie maksātāji → citādi „Jāizvērtē”. Izejošie: tikai maksājumi VID, pārējie ignorēti.
- **Vairāki konti:** katram darījumam glabājas `konts`. Dublikāts = tas pats konts + arhīva kods (veciem ierakstiem bez konta — tikai kods). Ja cita konta darījumam kods jau aizņemts, glabā kā `<kods>@<4 pēdējie IBAN cipari>`, oriģinālu `bankasKods`. Atkārtoti ielādējot izrakstu, vecajiem ierakstiem tiek pierakstīts konts.
- **Ienākums ar roku:** `arhivaKods 'roku-…'`, `arRoku`, `avots`. Ielādējot izrakstu, maksājums ar to pašu summu, ±7 dienām un to pašu maksātāju vai rēķinu piedāvā aizstāt ar roku ievadīto.
- Neapstiprinātais izraksts glabājas localStorage, līdz to apstiprina vai atmet; apstiprinātais CSV tiek saglabāts Drive.

---

## 7. Rēķini

- Numerācija viena visiem rēķiniem, automātiska; izskats atkarīgs no pasūtītāja veidnes („#22” vai „Nr. 025”). Termiņš = datums + 14 dienas.
- **Standarta veidne:** PDF (logo, „Rēķins sagatavots elektroniski un ir derīgs bez paraksta”, summa vārdiem) + e-rēķins XML. Budžeta iestādēm XML saglabājas arī Drive.
- **Hanzas Perons:** viņu Excel paraugs, ko lietotājs ielādē vienreiz; rīks aizpilda tikai noteiktās šūnas, atrodot tās pēc uzrakstiem.
- **Sūtīšana:** Gmail (`gmail.send`) no rīka loga ar labojamu Kam/Temats/Teksts; MIME ar pielikumu; galvenes aizsargātas pret injekcijām. Tīkla kļūda = „neskaidrs” iznākums (vēstule var būt aizgājusi) — rīks nesaka „nenosūtīts”, bet iesaka pārbaudīt „Nosūtītie”.

---

## 8. Excel pārskats grāmatvedim (`parskats.js`)

Lapas: **Kopsavilkums, Žurnāls** (pa ceturkšņiem ar SUBTOTAL), **Ceturkšņi** (mēneši, VSAOI, atzīmes „Iesniegts un samaksāts”), **Deklarācija** (D3 un D lapa ar formulām; dzeltenās šūnas maināmas), **Kā aizpildīt EDS** (soļi ar skaitļiem), **Banka** (darījumi ar kategorijām; personīgie tikai kopsummā bez vārdiem), **Rēķini un līgumi** (ja ir), **Noteikumi**. Visi aprēķini ir Excel formulas, lai grāmatvedis var pārbaudīt.

---

## 9. PWA un versijas

- `sw.js` kešo visus failus kā vienu versiju (`gramatvediba-<VERSIJA>`). Jauna versija tiek lejupielādēta fonā; lietotājs redz joslu „Pieejama jauna rīka versija — Atjaunot”; tikai tad `skipWaiting` un pārlāde. Tā vecie un jaunie faili nekad nesajaucas. Pirmajā apmeklējumā lapa netiek pārlādēta.
- `?bez-sw` lapas adresē izslēdz servisa skriptu (atkļūdošanai).
- Firefox uz Mac PWA instalēt nevar (Firefox to atbalsta tikai Windows); Mac: Chrome vai Safari → „Add to Dock”; iPhone: Safari → „Add to Home Screen” (atsevišķa atmiņa — dati nāk no Drive).

---

## 10. Drošība un privātums — obligāti

1. **Publiskajā repozitorijā nedrīkst būt īstu personas datu:** vārds, personas kods, IBAN, adrese, tālrunis, e-pasts, īsti klientu dati, īstas summas no lietotāja dokumentiem. Testos — tikai izdomāti dati (`Anna Paraugs`, `LV00TEST…`).
2. Viss ar īstiem datiem — tikai mapē `private/` (ir `.gitignore`). Pirms katras publicēšanas pārbaudi publiskos failus ar meklēšanu (sk. 12. sadaļu).
3. Google tokeni tikai atmiņā. Client secret nekad. CSP `index.html` atļauj skriptus tikai no pašas vietnes un Google pieslēgšanās; savienojumus tikai ar Google API. Jaunu ārēju adresi pievieno CSP apzināti.
4. Atļaujas minimālas: `drive.file`, `gmail.send`. Nekad `drive` pilnā vai `gmail.readonly`/`modify`.
5. No VID XML glabā tikai skaitļus.
6. Lietotājam: divu soļu pārbaude Google un GitHub kontam; rīku lietot savās ierīcēs; uz svešas ierīces — Iestatījumos „dzēst datus no šī pārlūka”.
7. Personas dati netiek sūtīti nekādiem trešo pušu servisiem (izņemot lietotāja paša Google kontu).

---

## 11. Testi

| Kas | Komanda | Saturs |
|---|---|---|
| Vienību testi | `npm test` (Node 20+) | VID metodiskie piemēri, aprēķini, banka, apvienošana, sinhronizācija, e-rēķins, PDF, XLSX, Gmail MIME, PWA failu saraksts, konti, filtri. |
| Privātie vienību testi | `npm run test:privatie` | Ar īstiem datiem (tikai `private/`). |
| Pārlūka testi | `python3 tests/e2e/palaist.py` | Playwright + Chromium; palaiž arī `private/e2e/`, ja tā ir. Vajag `pip install playwright openpyxl && playwright install chromium`, `poppler-utils`. Rezultāti un ekrānuzņēmumi: `$E2E_OUT` vai `<tmp>/gramatvediba-e2e/shots`. |

Pārlūka testi lieto viltotu Google (GIS, Drive, Gmail tiek aizstāti ar `page.route`), tāpēc īsts konts nav vajadzīgs. Pēc vizuālām izmaiņām apskati ekrānuzņēmumus (arī telefona platumā 390 px).

---

## 12. Jaunas versijas izlaišana (kontrolsaraksts)

1. Izmaiņas kodā. Jauns fails `src/` → pievieno `sw.js` sarakstam `FAILI` (to pārbauda vienību tests).
2. Versija formātā `GGGG-MM-DD.N` **abās vietās**: `sw.js` (`const VERSIJA`) un `src/versija.js`.
3. `npm test`, `npm run test:privatie` (ja ir `private/`), `python3 tests/e2e/palaist.py` — viss zaļš. Jaunai funkcijai — jauns tests.
4. **Privātuma pārbaude:** publiskajos failos meklē īpašnieka vārdu, personas kodu, IBAN un citus `private/` atrodamus identifikatorus; jābūt tukšam.
5. Atjauno šo rokasgrāmatu (un specifikācijā atzīmē uzbūvēto).
6. Publicē: `git push` vai visu publisko failu augšupielāde GitHub (bez `private/`). GitHub Pages atjaunojas dažās minūtēs; lietotāji redz „Atjaunot”.
7. Atgriešanās: iepriekšējā versija ir GitHub vēsturē.

---

## 13. Ikgadējais darbs

- **Janvārī:** jauns `rules/<gads>.json` (nokopē iepriekšējo un pārbaudi: `minimalaAlga`, `vsaoiLikme`, `pensijuLikme`, `iinLikme`, `iinSlieksnis`, `iinAugstaLikme`, `neapliekamaisMinimumsMenesi`, `dzivibasApdrosinasanaMaxDala`, `dzivibasApdrosinasanaMaxSumma`, `attaisnotieMaxPersonai`, `iinVienaMaksajumaRobeza`, `avots`). Avoti: VID metodiskie materiāli, likumi (likumi.lv). Pievieno gadu `rules/index.json` un failu `sw.js` sarakstam. Bez faila rīks rāda brīdinājumu un lieto tuvākā gada noteikumus.
- **Pavasarī (deklarāciju laikā):** pārbaudi, vai D3 un D lapas rindu numuri EDS nav mainījušies (`d3Rindas`, `dRindas`), un vai VID XML formāts (`DokIINGDv…`) joprojām nolasās (vienību tests ar sintētisku XML + privātais ar īsto).
- Rēķinu numerāciju (ja vajag) restartē lietotājs Iestatījumos.

---

## 14. Lēmumi, kurus nemainīt bez iemesla

- Nav sava servera un ārēju bibliotēku (drošība, neatkarība, rīks strādā bez Claude).
- Ieņēmumi pēc naudas saņemšanas datuma; neatpazīts ienākums nekad netiek klusi izslēgts.
- Izmaksātāja ieturētie un AKKA/LAA ienākumi nav saimnieciskās darbības ieņēmumi (sk. 5. sadaļu).
- Sinhronizācija apvieno, nevis pārraksta; dzēšana tikai ar bāzes pierādījumu.
- Datu lauki tikai tiek pievienoti.
- Attaisnotos izdevumus rīkā neievada (tie nāk no VID XML).
- Žurnālam paliek rīka kolonnu izkārtojums (nevis VID 24 ailes); `.xlsx`, nevis `.xls`.
- Samaksātie nodokļi — no atzīmēm, bankas izraksts tikai pārbaudei; EDS vienotais nodokļu konts ir galīgā patiesība.
- Datuma formāts saskarnē: `dd.mm.gggg`.

---

## 15. Zināmie ierobežojumi un idejas

- Bankas formāts: tikai Swedbank CSV.
- Iespējamās nākotnes idejas un atvērtie jautājumi ir specifikācijas sadaļās „Atklātie jautājumi” un „Nākamajai versijai”.
- E-rēķina `EndpointID` shēma ar personas kodu jāpārbauda Latvijas nacionālajā standartā.
- Lekciju normas (25 % / 0 %) gaida VID uzziņu.

---

## Versiju vēsture (īsi)

- **2026-11-25.4** — bankas meklēšana un filtri; vairāki konti un izrakstu periodi; ienākums ar roku; atzīmes „Iesniegts un samaksāts” ceturkšņiem un IIN; kopsavilkums ar IIN atmaksu; „Ar VID viss norēķināts”; kolonna „Nodokļi jau samaksāti”; pārlūka testi repozitorijā; šī rokasgrāmata.
- **2026-11-25.1–.3** — droša sinhronizācija ar apvienošanu, sākuma ekrāns, PWA, VID XML imports un „Kā aizpildīt EDS”; žurnāla galvene paliek redzama.
- **24.11.2026.** — Gmail sūtīšana, žurnāla sadaļa, rēķinu meklēšana, dizains.
- **23.11.2026.** — Google Drive, Hanzas Perons, savs PDF, pasūtītāju imports.
- **Līdz 14.11.2026.** — pirmā versija, aprēķinu pārbaude.
