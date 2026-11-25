# Versija 2026-11-25.4: bankas filtri, vairāki konti, ienākumi ar roku, atzīmes „Iesniegts un samaksāts”, kopsavilkums.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vide import ROOT, OUT, PRIV, versija
import subprocess, time, sys, json, openpyxl
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,'-m','http.server','8131'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B='http://localhost:8131/'
A_K, B_K = 'LV00TEST0000000000001', 'LV00TEST0000000000002'
P = lambda i, n: {"id": i, "nosaukums": n, "regNr": "40000000000", "adrese": {"iela": "Iela 1", "pilseta": "Rīga", "indekss": "LV-1001", "valsts": "LV"}, "epasts": "", "konts": "", "veidne": "standarta"}
dati = {"versija":1,"profils":{"vards":"Anna Pārbaudītāja","personasKods":"000000-00000","adrese":{"iela":"Parauga iela 1","pilseta":"Rīga","indekss":"LV-1000","valsts":"LV"},"iban":A_K,"bic":"HABALV22","epasts":"","vieta":"Rīgā","logo":"","nakamaisNr":4},
 "pasutitaji":[P('p1','Parauga teātris VSIA'), P('p2','Studija B')],
 "rekini":[
   {"id":"r1","nr":1,"datums":"2026-01-05","termins":"2026-01-19","pasutitajsId":"p1","valoda":"lv","veids":"90.13","pozicijas":[{"nosaukums":"Ziemassvētku animācija","daudzums":1,"cena":1000}]},
   {"id":"r2","nr":2,"datums":"2026-02-01","termins":"2026-02-15","pasutitajsId":"p2","valoda":"lv","veids":"90.13","pozicijas":[{"nosaukums":"Scenogrāfija","daudzums":1,"cena":800}]},
   {"id":"r3","nr":3,"datums":"2026-02-01","termins":"2026-02-10","pasutitajsId":"p1","valoda":"lv","veids":"90.13","pozicijas":[{"nosaukums":"Plakāts","daudzums":1,"cena":250}]}],
 "autorligumi":[],
 "darijumi":[
   {"arhivaKods":"k1","datums":"2026-01-15","partneris":"Parauga teātris VSIA","info":"Rēķins 1","summa":1000,"virziens":"K","kategorija":"sd","saite":{"tips":"rekins","kods":"r1","nr":1}},
   {"arhivaKods":"o1","datums":"2025-05-10","partneris":"Fonds C","info":"Grants","summa":3000,"virziens":"K","kategorija":"sd","veids":"90.13"},
   {"arhivaKods":"o2","datums":"2025-07-20","partneris":"VALSTS BUDŽETS","info":"EDS","summa":100,"virziens":"D","kategorija":"vid-maksajums","nodokluGads":2025}],
 "maksataji":{},"gadi":{}}
def csv(konts, no, lidz, rindas):
    lv=lambda x: f'{x:.2f}'.replace('.',',')
    L=['"Klienta konts";"Ieraksta tips";"Datums";"Saņēmējs/Maksātājs";"Informācija saņēmējam";"Summa";"Valūta";"Debets/Kredīts";"Arhīva kods";"Maksājuma veids";"Refernces numurs";"Dokumenta numurs";',
       f'"{konts}";"10";"{no}";"";"Sākuma atlikums";"0,00";"EUR";"K";"";"AS";"";"";']
    k=sum(float(r[3].replace(',','.')) for r in rindas if r[4]=='K'); d=sum(float(r[3].replace(',','.')) for r in rindas if r[4]=='D')
    for (dat,partn,info,summa,dk,kods) in rindas: L.append(f'"{konts}";"20";"{dat}";"{partn}";"{info}";"{summa}";"EUR";"{dk}";"{kods}";"INB";"";"";')
    L.append(f'"{konts}";"82";"{lidz}";"";"Apgrozījums";"{lv(k)}";"EUR";"K";"";"K2";"";"";')
    L.append(f'"{konts}";"82";"{lidz}";"";"Apgrozījums";"{lv(d)}";"EUR";"D";"";"K2";"";"";')
    L.append(f'"{konts}";"86";"{lidz}";"";"Beigu atlikums";"0,00";"EUR";"K";"";"LS";"";"";')
    return '\r\n'.join(L)
open(OUT+'/a.csv','w').write(csv(A_K,'01.02.2026','28.02.2026',[
  ('10.02.2026','STUDIJA B SIA','Rēķins 2','800,00','K','KOP1'),
  ('20.02.2026','ANNA PĀRBAUDĪTĀJA','Uz nodokļu kontu','200,00','K','A2')]))
errs=[]; kl=[]
def ok(c,t):
    print(('✓ ' if c else '✗ ')+t)
    if not c: kl.append(t)
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(viewport={'width':1280,'height':900}, accept_downloads=True)
    c.add_init_script("sessionStorage.setItem('gramatvediba:bez-drive','1')")
    c.route('https://fonts.googleapis.com/**', lambda r: r.abort()); c.route('https://fonts.gstatic.com/**', lambda r: r.abort())
    pg=c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text else None)
    W=lambda x: pg.wait_for_timeout(int(x*1000))
    D=lambda: pg.evaluate("JSON.parse(localStorage.getItem('gramatvediba:dati'))")
    pg.goto(B+'?bez-sw#banka'); pg.evaluate(f"localStorage.setItem('gramatvediba:dati', {json.dumps(json.dumps(dati))})"); pg.reload(); W(0.8)
    t=pg.inner_text('#view')
    ok('Rēķini bez atrasta maksājuma' in t and 'apmaksas termiņš ir pagājis' in t, 'atgādinājums par kavētiem rēķiniem (vecais konts)')
    ok('konts nav saglabāts' in t, 'vecajiem darījumiem konts nav zināms: piedāvā ielādēt vēlreiz')
    # ---- Ienākums ar roku ----
    pg.click('#rokuJauns'); W(0.3)
    f='#rokuF '
    pg.select_option(f+'[name=saite]', 'r:r2'); W(0.2)
    ok(pg.input_value(f+'[name=summa]')=='800' and pg.input_value(f+'[name=partneris]')=='Studija B', 'izvēloties rēķinu, aizpildās summa un maksātājs')
    pg.fill(f+'.dtxt', '12.02.2026'); pg.locator(f+'.dtxt').blur()
    pg.select_option(f+'[name=avots]', 'cits-konts'); pg.click(f+'button[type=submit]'); W(0.5)
    d=D(); roku=[x for x in d['darijumi'] if x.get('arRoku')]
    ok(len(roku)==1 and roku[0]['saite']['kods']=='r2' and roku[0]['datums']=='2026-02-12' and roku[0]['avots']=='cits-konts', 'ienākums ar roku saglabāts ar rēķina saiti')
    ok('ar roku · uz citu kontu' in pg.inner_text('#apst'), 'tabulā atzīme „ar roku”')
    # ---- Izraksts A: tas pats maksājums aizstāj ar roku ievadīto ----
    pg.set_input_files('#csv',OUT+'/a.csv'); W(0.6)
    t=pg.inner_text('#view')
    ok('tas pats maksājums, kas ievadīts ar roku 12.02.2026' in t and pg.is_checked('[data-aizst="0"]'), 'izraksts atpazīst ar roku ievadīto un piedāvā aizstāt')
    ok('sakrīt ar bankas kredīta apgrozījumu' in t, 'apgrozījuma pārbaude')
    pg.locator('[data-apstiprinat]').first.click(); W(0.6)
    d=D(); s800=[x for x in d['darijumi'] if x['summa']==800]
    ok(len(s800)==1 and not s800[0].get('arRoku') and s800[0]['konts']==A_K and s800[0]['saite']['kods']=='r2', 'apstiprinot ar roku ievadītais aizstāts ar bankas maksājumu (nav dubultā)')
    ok(any(x['kategorija']=='savs-konts' and x['summa']==200 for x in d['darijumi']), 'pārskaitījums no sava konta nav ienākums')
    ok(list(d['izraksti'].values())==[{'konts':A_K,'no':'2026-02-01','lidz':'2026-02-28'}], 'izraksta periods pierakstīts')
    # ---- Ceturksnis 1: atzīme ----
    pg.goto(B+'?bez-sw#ceturksnis'); W(0.5); pg.select_option('#g','2026'); W(0.3); pg.select_option('#c','1'); W(0.4)
    jm=pg.input_value('#atzSumma'); ok(jm not in ('', '0,00'), f'atzīmes forma ar aprēķināto summu {jm}')
    pg.fill('#atzP .dtxt','20.04.2026'); pg.locator('#atzP .dtxt').blur(); pg.click('#atzOk'); W(0.5)
    d=D(); a=d['samaksas'].get('2026-C1')
    ok(a and abs(a['zinots']-float(jm.replace(',','.')))<0.001 and a['maksajumi']==[{'summa':float(jm.replace(',','.')),'datums':'2026-04-20'}], 'atzīme saglabāta: iesniegtā summa un maksājums')
    ok('iesniegts un samaksāts' in pg.inner_text('#atzP'), 'ceturksnī redzams „iesniegts un samaksāts”')
    # ---- Izraksts B (nodokļu konts) ar tādu pašu arhīva kodu kā kontā A ----
    open(OUT+'/b.csv','w').write(csv(B_K,'01.01.2026','30.04.2026',[
      ('21.02.2026','ANNA PĀRBAUDĪTĀJA','No ienākumu konta','200,00','K','KOP1'),
      ('22.04.2026','VALSTS BUDŽETS','EDS 1. ceturksnis',jm,'D','V1')]))
    pg.goto(B+'?bez-sw#banka'); W(0.5); pg.set_input_files('#csv',OUT+'/b.csv'); W(0.6)
    ok('Jauni darījumi: 2' in pg.inner_text('#view'), 'cita konta darījums ar tādu pašu kodu nav uzskatīts par jau ielādētu')
    pg.locator('[data-apstiprinat]').first.click(); W(0.6)
    d=D(); kodi=sorted(x['arhivaKods'] for x in d['darijumi'])
    ok('KOP1' in kodi and 'KOP1@0002' in kodi, 'abu kontu darījumi saglabāti atsevišķi: '+str(kodi))
    pg.set_input_files('#csv',OUT+'/b.csv'); W(0.5)
    ok('Jauni darījumi: 0' in pg.inner_text('#view'), 'atkārtoti ielādējot, nekas netiek dublēts'); pg.locator('[data-atmest]').first.click(); W(0.3)
    # ---- Konti ----
    t=pg.inner_text('#view')
    ok(A_K in t and B_K in t and '01.02.2026. – 28.02.2026.' in t and '01.01.2026. – 30.04.2026.' in t, 'kontu saraksts ar ielādētajiem periodiem')
    pg.fill(f'[data-knos="{A_K}"]','Ienākumu konts'); pg.locator(f'[data-knos="{A_K}"]').blur(); W(0.4)
    ok(D()['konti'][A_K]['nosaukums']=='Ienākumu konts', 'kontam var dot nosaukumu')
    # ---- Filtri ----
    pg.select_option('#bg','2026'); W(0.2)
    pg.fill('#bTeksts','studija'); W(0.3)
    ok('Atlasīti 1 no' in pg.inner_text('#apst') and '800,00' in pg.inner_text('#apst'), 'meklēšana maksātājā')
    pg.fill('#bTeksts','scenografija'); W(0.3)
    ok('Atlasīti 1 no' in pg.inner_text('#apst'), 'meklēšana rēķina pozīcijās (bez garumzīmēm)')
    pg.fill('#bTeksts',''); pg.select_option('#bKat','vid-maksajums'); W(0.3)
    ok('Atlasīti 1 no' in pg.inner_text('#apst') and 'izejošie' in pg.inner_text('#apst'), 'filtrs pēc kategorijas: maksājumi VID')
    pg.select_option('#bKat',''); pg.select_option('#bKonts', A_K); W(0.3)
    ok('Atlasīti 2 no' in pg.inner_text('#apst') and 'ienākošie 1000,00' in pg.inner_text('#apst').replace(' ',' ').replace(' 000','000'), 'filtrs pēc konta un kopsumma: '+pg.inner_text('#apst')[:120])
    pg.click('[data-bnotirit]'); W(0.3); pg.check('#bBez'); W(0.3)
    ok('Nekas netika atrasts' in pg.inner_text('#apst'), 'filtrs „bez rēķina”: visi ienākumi piesaistīti')
    pg.uncheck('#bBez'); W(0.2)
    pg.screenshot(path=OUT+'/shots/v5_banka.png', full_page=True)
    # ---- Vēlāks ienākums 1. ceturksnī: aprēķins mainās ----
    pg.click('#rokuJauns'); W(0.3)
    pg.fill(f+'[name=partneris]','Galerija D'); pg.fill(f+'[name=summa]','600'); pg.fill(f+'.dtxt','20.03.2026'); pg.locator(f+'.dtxt').blur(); pg.select_option(f+'[name=avots]','skaidra')
    pg.click(f+'button[type=submit]'); W(0.4)
    pg.goto(B+'?bez-sw#ceturksnis'); W(0.5); pg.select_option('#g','2026'); W(0.3); pg.select_option('#c','1'); W(0.4)
    t=pg.inner_text('#atzP')
    ok('aprēķins mainījies' in t and 'jāpiemaksā' in t, 'brīdina: ziņojums jālabo un jāpiemaksā')
    piem=pg.input_value('#atzSumma'); pg.click('#atzLabots'); W(0.4)
    a=D()['samaksas']['2026-C1']
    ok(len(a['maksajumi'])==2 and abs(a['maksajumi'][1]['summa']-float(piem.replace(',','.')))<0.001 and 'aprēķins mainījies' not in pg.inner_text('#atzP'), f'labots un piemaksāts {piem}')
    # ---- Žurnāls: ar roku ievadītais redzams ----
    pg.goto(B+'?bez-sw#zurnals'); W(0.5); pg.select_option('#zg','2026'); W(0.3)
    ok('ievadīts ar roku, skaidrā naudā' in pg.inner_text('#view'), 'žurnālā redzams, ka ienākums ievadīts ar roku')
    # ---- Pārskats 2026 ----
    pg.goto(B+'?bez-sw#parskats'); W(0.5); pg.select_option('#pg','2026'); W(0.4)
    t=pg.inner_text('#view')
    ok('Par 2026. gadu nodokļiem jāpietur' in t and 'Samaksāts (pēc tavām atzīmēm)' in t and 'IIN pēc deklarācijas (aplēse)' in t, 'kopsavilkums: VSAOI, IIN, samaksāts pēc atzīmēm')
    ok('Pārbaude pret bankas izrakstu' in t and 'atrasts izrakstā' in t and 'nav izrakstā' in t, 'pārbaude: viens maksājums atrasts, piemaksa nav izrakstā')
    ok('Galīgā pārbaude ir EDS vienotajā nodokļu kontā' in t, 'atgādinājums par vienoto nodokļu kontu')
    pg.screenshot(path=OUT+'/shots/v5_parskats.png', full_page=True)
    # ---- Pārskats 2025: bez atzīmēm, pēc izrakstiem ----
    pg.select_option('#pg','2025'); W(0.4); t=pg.inner_text('#view')
    ok('Atlikums ar VID par 2025. gadu' in t and 'Samaksāts (pēc bankas izrakstiem)' in t and 'Tas vēl nenozīmē parādu' in t, 'pagājušais gads bez atzīmēm: piesardzīgs teksts')
    pg.click('[data-norek="2025"]'); W(0.4)
    ok('norēķināts' in pg.inner_text('#view') and D()['samaksas'].get('2025-norekinats'), 'var atzīmēt, ka ar VID viss norēķināts')
    # ---- Gada deklarācija 2025 ar atmaksu ----
    dd=D(); dd['gadi']['2025']={'d1Ieturetais':'900'}; pg.evaluate(f"localStorage.setItem('gramatvediba:dati', {json.dumps(json.dumps(dd))})")
    pg.goto(B+'?bez-sw#deklaracija'); pg.reload(); W(0.6); pg.select_option('#g','2025'); W(0.4)
    t=pg.inner_text('#atzP')
    ok('Kad deklarācija iesniegta EDS:' in t and pg.locator('#atzSumma').count()==0, 'atmaksas gadījumā: tikai „Iesniegts”, bez summas')
    pg.click('#atzOk'); W(0.4)
    ok('Atmaksa saņemta' in pg.inner_text('#atzP'), 'pēc iesniegšanas: var atzīmēt saņemto atmaksu')
    atm=pg.input_value('#atzSumma'); pg.click('#atzAtmaksa'); W(0.4)
    a=D()['samaksas']['2025-IIN']
    ok(a['zinots']<0 and abs(a['maksajumi'][0]['summa']-a['zinots'])<0.001, f'atmaksa {atm} saglabāta ar mīnusu')
    # ---- Excel: ceturkšņu atzīmes ----
    pg.goto(B+'?bez-sw#zurnals'); W(0.4); pg.select_option('#zg','2026'); W(0.3)
    with pg.expect_download() as dl: pg.click('#zParskats')
    dl.value.save_as(OUT+'/v5.xlsx')
    json.dump(D(), open(OUT+'/v5dati.json','w'))
    b.close()
srv.terminate()
wb=openpyxl.load_workbook(OUT+'/v5.xlsx')
ws=wb['Ceturkšņi']; vals=[str(c.value) for row in ws.iter_rows() for c in row if c.value is not None]
ok(any(v.startswith('iesniegts ') and 'samaksāts' in v for v in vals), 'Excel lapā „Ceturkšņi” redzama atzīme')
zv=[str(c.value) for row in wb['Žurnāls'].iter_rows() for c in row if c.value is not None]
ok(any('Nodokļi jau samaksāti' in v for v in zv) and any('ievadīts ar roku' in v for v in zv), 'Excel žurnālā jaunais kolonnas nosaukums un ar roku ievadītais')
bv=[str(c.value) for ws in wb.worksheets for row in ws.iter_rows() for c in row if c.value is not None]
ok(any('Ienākumu konts' in v for v in bv), 'Excel bankas lapā redzams konta nosaukums')
print('kļūdas:', errs); print('NEIZDEVĀS:', kl)
