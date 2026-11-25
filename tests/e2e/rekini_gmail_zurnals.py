# Jaunā versija: Gmail sūtīšana, rēķinu meklēšana, žurnāls, atcerēties maksātāju, dizains.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vide import ROOT, OUT, PRIV, versija
import subprocess, time, sys, json, base64, re
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,'-m','http.server','8126'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
CID = '333231552776-5gfsdt9m47ukgko3ilh3klad5mr22al2.apps.googleusercontent.com'
GIS = """window.__gis=[];window.google={accounts:{oauth2:{initTokenClient:(c)=>{window.__gis.push({scope:c.scope,igs:c.include_granted_scopes,hint:c.login_hint});return {requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'gtok',expires_in:3600,scope:c.scope}),30)}},
 hasGrantedAllScopes:(r,s)=>r.scope.split(' ').includes(s),revoke:(t,cb)=>{window.__revoked=(window.__revoked||0)+1;cb&&cb()}}}};"""
P = lambda i, **k: {"id": i, "nosaukums": k.get('n', i), "regNr": "40000000000", "adrese": {"iela": "Iela 1", "pilseta": "Rīga", "indekss": "LV-1001", "valsts": "LV"}, "epasts": k.get('e', ''), "konts": "LV00TEST0000000000001", "veidne": "standarta"}
dati = {"versija":1,"profils":{"vards":"Anna Pārbaudītāja","personasKods":"000000-00000","adrese":{"iela":"Parauga iela 1","pilseta":"Rīga","indekss":"LV-1000","valsts":"LV"},"iban":"LV00TEST0000000000000","bic":"HABALV22","epasts":"","vieta":"Rīgā","logo":"","nakamaisNr":4},
 "drive": {"konts": "anna@example.com"},
 "pasutitaji":[P('p1', n='Parauga teātris VSIA'), P('p2', n='Studija B', e='rekini@studija.lv')],
 "rekini":[
   {"id":"r1","nr":1,"datums":"2026-01-05","termins":"2026-01-19","pasutitajsId":"p1","valoda":"lv","veids":"90.13","pozicijas":[{"nosaukums":"Ziemassvētku animācija izrādei","daudzums":1,"cena":1000}]},
   {"id":"r2","nr":2,"datums":"2026-05-20","termins":"2026-06-03","pasutitajsId":"p2","valoda":"lv","veids":"90.13","pozicijas":[{"nosaukums":"Scenogrāfija","daudzums":1,"cena":500},{"nosaukums":"Video animācijas","daudzums":1,"cena":300}]},
   {"id":"r3","nr":3,"datums":"2026-11-20","termins":"2026-12-04","pasutitajsId":"p1","valoda":"lv","veids":"90.13","pozicijas":[{"nosaukums":"Plakāts","daudzums":1,"cena":1000.68}]}],
 "autorligumi":[{"id":"a1","nr":"AL-2026-7","pasutitajsId":"p2","datums":"2026-02-01","summa":400,"veids":"90.13","izmaksatajsIetur":True,"projekts":"Pavasara izrāde"}],
 "darijumi":[
   {"arhivaKods":"k1","datums":"2026-01-15","partneris":"Parauga teātris VSIA","info":"Rēķins 1","summa":1000,"virziens":"K","kategorija":"sd","saite":{"tips":"rekins","kods":"r1","nr":1}},
   {"arhivaKods":"k2","datums":"2026-02-10","partneris":"Studija B","info":"AL-2026-7","summa":400,"virziens":"K","kategorija":"nodokli-samaksaja-izmaksatajs","saite":{"tips":"autorligums","kods":"a1","nr":"AL-2026-7"}},
   {"arhivaKods":"k3","datums":"2026-03-03","partneris":"AKKA/LAA","info":"Autoratlīdzība","summa":80,"virziens":"K","kategorija":"akka"},
   {"arhivaKods":"k4","datums":"2026-06-01","partneris":"Studija B","info":"Rēķins 2","summa":800,"virziens":"K","kategorija":"sd","saite":{"tips":"rekins","kods":"r2","nr":2}},
   {"arhivaKods":"k5","datums":"2026-07-07","partneris":"Fonds C","info":"Grants","summa":300,"virziens":"K","kategorija":"sd","veids":"90.13"}],
 "maksataji":{},"gadi":{}}
errs=[]; kl=[]
def ok(c,t):
    print(('✓ ' if c else '✗ ')+t)
    if not c: kl.append(t)
sutits=[]
def gmail_route(r):
    sutits.append({'body': r.request.post_data, 'auth': r.request.headers.get('authorization'), 'ct': r.request.headers.get('content-type')})
    r.fulfill(status=200, content_type='application/json', body='{"id":"m1"}')
TI = {'v': {'aud': CID, 'scope': 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.send', 'email': 'anna@example.com'}}
with sync_playwright() as p:
    b=p.chromium.launch()
    def lapa(**opts):
        c=b.new_context(**opts, accept_downloads=True); c.add_init_script("sessionStorage.setItem('gramatvediba:bez-drive','1')")
        c.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(status=200, content_type='application/javascript', body=GIS))
        c.route('https://oauth2.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(TI['v'])))
        c.route('https://www.googleapis.com/upload/gmail/**', gmail_route)
        c.route('https://fonts.googleapis.com/**', lambda r: r.abort()); c.route('https://fonts.gstatic.com/**', lambda r: r.abort())
        pg=c.new_page()
        pg.on('pageerror', lambda e: errs.append(pg.url+' '+e.stack[:500])); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text else None)
        pg.goto('http://localhost:8126/'); pg.evaluate("d=>localStorage.setItem('gramatvediba:dati', JSON.stringify(d))", dati)
        return pg
    pg=lapa(viewport={'width':1280,'height':900})
    # ---------- Meklēšana ----------
    pg.goto('http://localhost:8126/#rekini'); pg.reload(); pg.wait_for_timeout(500)
    rows=lambda: pg.locator('#rTab tbody tr').count()
    ok(rows()==3, 'visi 3 rēķini')
    pg.fill('#fTeksts','ziemassvetku animacijas'); pg.wait_for_timeout(200)
    ok(rows()==1 and 'Parauga teātris' in pg.inner_text('#rTab'), 'teksts bez garumzīmēm un citā locījumā atrod 1')
    ok(pg.evaluate('document.activeElement.id')=='fTeksts', 'fokuss paliek meklēšanas laukā')
    pg.fill('#fTeksts','animācija'); pg.wait_for_timeout(200); ok(rows()==2, 'animācija → 2 rēķini')
    ok('Atrasti 2 no 3' in pg.inner_text('#rTab') and '1800,00' in pg.inner_text('#rTab').replace(' ',' ').replace(' ',''), 'kopsumma atrastajiem')
    pg.select_option('#fPas','p2'); pg.wait_for_timeout(200); ok(rows()==1, 'pasūtītāja filtrs')
    pg.click('[data-notirit]'); pg.wait_for_timeout(300); ok(rows()==3 and pg.input_value('#fTeksts')=='', 'notīrīt filtrus')
    pg.locator('#rFiltri .dtxt').nth(0).fill('01.03.2026'); pg.locator('#rFiltri .dtxt').nth(1).fill('30.06.2026'); pg.wait_for_timeout(300)
    ok(rows()==1 and '#2' in pg.inner_text('#rTab'), 'periods no–līdz')
    pg.screenshot(path=OUT+'/shots/v3_rekini.png', full_page=True)
    pg.click('[data-notirit]'); pg.wait_for_timeout(300)
    # ---------- Gmail: pasūtītājs bez e-pasta ----------
    pg.locator('[data-sutit="r3"]').click(); pg.wait_for_timeout(1200)
    dlg=pg.locator('dialog')
    ok(dlg.locator('[data-k="kam"]').input_value()=='', 'Kam tukšs, jo pasūtītājam nav e-pasta')
    ok('Pielikums:' in dlg.inner_text() and '.pdf' in dlg.inner_text(), 'pielikums sagatavots')
    dlg.locator('[data-k="sutit"]').click(); pg.wait_for_timeout(300)
    ok(len(sutits)==0 and pg.locator('dialog').count()==1, 'bez adreses nesūta')
    dlg.locator('[data-k="kam"]').fill('a@b.lv\nBcc: x@y.lv'); dlg.locator('[data-k="sutit"]').click(); pg.wait_for_timeout(300)
    ok(len(sutits)==0, 'adrese ar galveni netiek pieņemta')
    dlg.locator('[data-k="kam"]').fill('rekini@paraugs.lv')
    dlg.locator('[data-k="teksts"]').fill('Labdien!\n\nPielikumā rēķins Nr. 3.\n\nAr cieņu,\nAnna')
    pg.screenshot(path=OUT+'/shots/v3_dialogs.png')
    dlg.locator('[data-k="sutit"]').click(); pg.wait_for_timeout(1500)
    ok(len(sutits)==1, 'nosūtīts vienreiz')
    if sutits:
        m=sutits[0]['body']
        ok(sutits[0]['auth']=='Bearer gtok' and sutits[0]['ct']=='message/rfc822', 'Gmail upload ar atsevišķu atslēgu un message/rfc822')
        hd=m.split('\r\n\r\n')[0]; ok('\r\nTo: rekini@paraugs.lv\r\n' in hd and '<anna@example.com>' in hd and 'Bcc' not in hd and len(hd.split('\r\n'))==5, 'galvenes pareizas')
        att=m.split('Content-Disposition: attachment')[1].split('\r\n\r\n')[1].split('--')[0].replace('\r\n','')
        ok(base64.b64decode(att)[:5]==b'%PDF-', 'pielikums ir PDF')
        body=m.split('charset=UTF-8')[1].split('\r\n\r\n')[1].split('--')[0].replace('\r\n','')
        ok('Pielikumā rēķins Nr. 3.' in base64.b64decode(body).decode(), 'labotais teksts nosūtīts')
    g=pg.evaluate('window.__gis')
    ok(any('gmail.send' in x['scope'] and x['igs']==False and x['hint']=='anna@example.com' for x in g), 'Gmail atļauja ar include_granted_scopes=false un konta norādi')
    ok(pg.locator('dialog').count()==0 and 'nosūtīts' in pg.inner_text('#rTab'), 'logs aizvērts, statusā nosūtīts')
    d=json.loads(pg.evaluate("localStorage.getItem('gramatvediba:dati')"))
    ok(d['pasutitaji'][0].get('epasts')=='rekini@paraugs.lv', 'adrese saglabāta pasūtītāja kartītē')
    ok(next(r for r in d['rekini'] if r['id']=='r3').get('nosutitsKam')=='rekini@paraugs.lv', 'rēķinam atzīmēts adresāts')
    # Otrā sūtīšana: brīdinājums, atslēga atmiņā (Google logs vairs netiek prasīts)
    pg.locator('[data-sutit="r3"]').click(); pg.wait_for_timeout(1000)
    ok('jau nosūtīts' in pg.locator('dialog').inner_text(), 'brīdinājums par jau nosūtītu')
    ok(pg.locator('dialog [data-k="kam"]').input_value()=='rekini@paraugs.lv', 'adrese tagad no kartītes')
    pg.locator('dialog [data-k="atcelt"]').click()
    pg.close()
    # ---------- Gmail: cits konts tiek atteikts ----------
    TI['v']={**TI['v'], 'email':'cits@example.com'}
    pg=lapa(viewport={'width':1280,'height':900}); pg.goto('http://localhost:8126/#rekini'); pg.reload(); pg.wait_for_timeout(500)
    pg.locator('[data-sutit="r2"]').click(); pg.wait_for_timeout(1000)
    ok(pg.locator('dialog [data-k="kam"]').input_value()=='rekini@studija.lv', 'adrese no kartītes')
    pg.locator('dialog [data-k="sutit"]').click(); pg.wait_for_timeout(800)
    ok(len(sutits)==1 and 'cits@example.com' in pg.locator('dialog').inner_text() and pg.evaluate('window.__revoked')==1, 'svešs konts: nesūta, atsauc atļauju, paskaidro')
    TI['v']={**TI['v'], 'email':'anna@example.com','aud':'cits-klients'}
    pg.locator('dialog [data-k="sutit"]').click(); pg.wait_for_timeout(800)
    ok(len(sutits)==1 and 'Neizdevās pārbaudīt' in pg.locator('dialog').inner_text(), 'svešam klientam izsniegta atslēga netiek pieņemta')
    TI['v']={**TI['v'], 'aud':CID}
    pg.close()
    # ---------- Gmail: atbilde nepienāk (tīkla kļūda pēc sūtīšanas) ----------
    pg=lapa(viewport={'width':1280,'height':900})
    pg.context.route('https://www.googleapis.com/upload/gmail/**', lambda r: r.abort())
    pg.goto('http://localhost:8126/#rekini'); pg.reload(); pg.wait_for_timeout(500)
    pg.locator('[data-sutit="r2"]').click(); pg.wait_for_timeout(1000)
    ok(pg.locator('dialog [data-k="temats"]').input_value()=='Rēķins Nr. 2', 'temats bez dubulta Nr.')
    pg.locator('dialog [data-k="sutit"]').click(); pg.wait_for_timeout(800)
    tx=pg.locator('dialog').inner_text()
    ok('nav zināms, vai vēstule aizgāja' in tx and pg.locator('dialog [data-k="sutit"]').inner_text()=='Sūtīt vēlreiz', 'neskaidrs iznākums: brīdina, poga „Sūtīt vēlreiz”')
    pg.once('dialog', lambda d: d.dismiss()); pg.locator('dialog [data-k="sutit"]').click(); pg.wait_for_timeout(300)
    ok(pg.locator('dialog').count()==1, 'atkārtoti sūta tikai pēc apstiprinājuma')
    pg.locator('dialog [data-k="aizgaja"]').click(); pg.wait_for_timeout(400)
    d=json.loads(pg.evaluate("localStorage.getItem('gramatvediba:dati')"))
    ok(next(r for r in d['rekini'] if r['id']=='r2').get('nosutits') and pg.locator('dialog').count()==0, 'var atzīmēt kā nosūtītu')
    pg.close()
    # ---------- Žurnāls ----------
    pg=lapa(viewport={'width':1280,'height':900}); pg.goto('http://localhost:8126/#zurnals'); pg.reload(); pg.wait_for_timeout(600)
    t=pg.inner_text('#view')
    ok('1. ceturksnis kopā' in t and '2. ceturksnis kopā' in t and '3. ceturksnis kopā' in t and '2026. gadā kopā' in t, 'ceturkšņu starpsummas')
    ok('Nodokļi jau samaksāti' in t and 'ieturēja izmaksātājs' in t and 'AKKA/LAA' in t, 'atzīmētas rindas ar jau samaksātiem nodokļiem')
    ok('Ziemassvētku animācija izrādei' in t and 'Scenogrāfija; Video animācijas' in t and 'Pavasara izrāde' in t, 'kolonna Pozīcija no rēķiniem un līguma projekta')
    gk=pg.locator('tr.kop').last.inner_text().replace(' ',' ')
    ok('2100,00' in gk.replace(' ','') and '1050,00' in gk.replace(' ','') and '480,00' in gk.replace(' ',''), 'gada kopā: 2100 ieņēmumi, 1050 nosacītie, 480 nav ieskaitīts')
    pg.screenshot(path=OUT+'/shots/v3_zurnals.png', full_page=True)
    pg.set_viewport_size({'width':1280,'height':420}); pg.wait_for_timeout(200)
    pg.evaluate("document.querySelector('.zurn-tbl').scrollTop=400"); pg.wait_for_timeout(200)
    tb=pg.locator('.zurn-tbl').bounding_box(); th=pg.locator('table.zurn thead th').first.bounding_box()
    ok(abs(th['y']-tb['y'])<2, 'galvene paliek redzama, ritinot žurnālu')
    pg.screenshot(path=OUT+'/shots/v3_zurnals_sticky.png')
    pg.set_viewport_size({'width':1280,'height':900})
    with pg.expect_download() as dl: pg.click('#zParskats')
    ok(dl.value.suggested_filename=='gramatvediba-parskats-2026.xlsx', 'Excel no žurnāla sadaļas')
    # ---------- Banka: atcerēties apstiprinātajos ----------
    pg.goto('http://localhost:8126/#banka'); pg.wait_for_timeout(500)
    cb=pg.locator('[data-atcm="k5"]'); ok(cb.count()==1 and not cb.is_checked(), 'ķeksis apstiprinātajos')
    cb.check(); pg.wait_for_timeout(400)
    d=json.loads(pg.evaluate("localStorage.getItem('gramatvediba:dati')")); mk=d['maksataji']
    ok(list(mk.values())==['sd'], 'maksātājs atcerēts: '+json.dumps(mk, ensure_ascii=False))
    ok(pg.locator('[data-atcm="k5"]').is_checked(), 'pēc pārzīmēšanas atzīmēts')
    pg.select_option('[data-kat="k5"]','personigs'); pg.wait_for_timeout(400)
    d=json.loads(pg.evaluate("localStorage.getItem('gramatvediba:dati')")); ok(list(d['maksataji'].values())==['personigs'], 'mainot kategoriju, atcerētais seko')
    pg.locator('[data-atcm="k5"]').uncheck(); pg.wait_for_timeout(400)
    d=json.loads(pg.evaluate("localStorage.getItem('gramatvediba:dati')")); ok(d['maksataji']=={}, 'noņemot ķeksi, aizmirst')
    pg.select_option('[data-kat="k5"]','sd'); pg.wait_for_timeout(300)
    # ---------- Līgums: projekts ----------
    pg.goto('http://localhost:8126/#ligumi'); pg.wait_for_timeout(400)
    ok(pg.locator('[data-lproj="a1"]').input_value()=='Pavasara izrāde', 'līguma projekts redzams un labojams')
    pg.locator('[data-lproj="a1"]').fill('Rudens izrāde'); pg.locator('[data-lproj="a1"]').dispatch_event('change'); pg.wait_for_timeout(300)
    pg.goto('http://localhost:8126/#zurnals'); pg.wait_for_timeout(400); ok('Rudens izrāde' in pg.inner_text('#view'), 'žurnālā redzams jaunais projekts')
    for h_ in ['parskats','ceturksnis','iestatijumi']:
        pg.goto(f'http://localhost:8126/#{h_}'); pg.wait_for_timeout(400); pg.screenshot(path=OUT+f'/shots/v3_{h_}.png', full_page=True)
    pg.close()
    for nos, opts in [('tumss', dict(viewport={'width':1280,'height':900}, color_scheme='dark')), ('tel', dict(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True))]:
        pg=lapa(**opts)
        for h_ in ['ceturksnis','iestatijumi','zurnals','parskats']:
            pg.goto(f'http://localhost:8126/#{h_}'); pg.reload(); pg.wait_for_timeout(500); pg.screenshot(path=OUT+f'/shots/v3_{nos}_{h_}.png', full_page=True)
        if nos=='tel':
            ok(all(pg.locator('.poga88').nth(i).is_visible() for i in range(3)), 'telefonā redzamas visas 3 pogas')
            ok(pg.evaluate("[...document.querySelectorAll('.poga88')].every(e=>e.scrollHeight<=e.clientHeight+1 && e.scrollWidth<=e.clientWidth+1)"), 'pogu teksts nav nogriezts')
        pg.close()
    b.close()
srv.terminate()
print('kļūdas:', errs)
print('NEIZDEVĀS:', kl if kl else 'nav')
