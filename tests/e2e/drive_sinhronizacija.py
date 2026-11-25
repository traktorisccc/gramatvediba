import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vide import ROOT, OUT, PRIV, versija
import subprocess, time, sys, json, re, urllib.parse
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,'-m','http.server','8125'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
BASE='http://localhost:8125/'
# ---- viltots Google Drive ----
faili={}; nr=[0]; zurn=[]
def jauns(): nr[0]+=1; return 'id%d'%nr[0]
GIS = """window.google={accounts:{oauth2:{initTokenClient:(c)=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'tok',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'}),50)}),hasGrantedAllScopes:()=>true,revoke:(t,cb)=>cb&&cb()}}};"""
def drive(route):
  try:
    return drive2(route)
  except Exception as e:
    import traceback; traceback.print_exc(); route.fulfill(status=500, body='x')
def drive2(route):
    req=route.request; u=urllib.parse.urlparse(req.url); qs=urllib.parse.parse_qs(u.query); p=u.path; m=req.method
    zurn.append(f'{m} {p}')
    assert req.headers.get('authorization')=='Bearer tok', 'nav atslēgas'
    J=lambda o,st=200: route.fulfill(status=st, content_type='application/json', body=json.dumps(o))
    if p.endswith('/about'): return J({'user':{'emailAddress':'Test@Example.com'}})
    if p=='/drive/v3/files' and m=='GET':
        q=qs['q'][0]; par=re.search(r"'([^']*)' in parents",q).group(1)
        if "name='" not in q: return J({'files':[{'id':k,'name':f['name'],'modifiedTime':'2026-11-25T10:00:00Z'} for k,f in faili.items() if f['parent']==par and not f['folder']]})
        name=re.search(r"name='([^']*)'",q).group(1)
        fold='folder' in q
        r=[{'id':k,'version':str(f['version']),'modifiedTime':'x'} for k,f in faili.items() if f['name']==name and f['parent']==par and f['folder']==fold]
        return J({'files':r})
    if p=='/drive/v3/files' and m=='POST':
        b=json.loads(req.post_data); k=jauns(); faili[k]={'name':b['name'],'parent':(b.get('parents') or ['root'])[0],'folder':True,'version':1,'saturs':''}; return J({'id':k})
    if p=='/upload/drive/v3/files' and m=='POST':
        body=req.post_data; meta=json.loads(re.search(r'\r\n\r\n(\{.*?\})\r\n--',body,re.S).group(1)); saturs=body.split('\r\n\r\n',2)[2].rsplit('\r\n--',1)[0]
        k=jauns(); faili[k]={'name':meta['name'],'parent':meta['parents'][0],'folder':False,'version':1,'saturs':saturs}; return J({'id':k,'version':'1'})
    mm=re.match(r'/upload/drive/v3/files/([^/]+)$',p)
    if mm and m=='PATCH':
        f=faili[mm.group(1)]; f['saturs']=req.post_data; f['version']+=1; return J({'id':mm.group(1),'version':str(f['version'])})
    mm=re.match(r'/drive/v3/files/([^/]+)/copy$',p)
    if mm: b=json.loads(req.post_data); k=jauns(); faili[k]={**faili[mm.group(1)],'name':b['name'],'parent':b['parents'][0]}; return J({'id':k})
    mm=re.match(r'/drive/v3/files/([^/]+)$',p)
    if mm:
        f=faili.get(mm.group(1))
        if not f: return J({'error':'nav'},404)
        if qs.get('alt')==['media']: return route.fulfill(status=200, content_type='application/json', body=f['saturs'])
        return J({'id':mm.group(1),'version':str(f['version']),'trashed':False})
    return J({'error':'?'},400)
def datu_fails(): return [f for f in faili.values() if f['name']=='gramatvediba-dati.json']
errs=[]; ok=lambda c,t: print(('✓ ' if c else '✗ ')+t)
def lapa(ctx):
    pg=ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('pageerror '+str(e)))
    pg.on('console', lambda mm: errs.append(mm.text) if mm.type=='error' and 'fonts.g' not in mm.text else None)
    return pg
with sync_playwright() as p:
    b=p.chromium.launch()
    def ctx():
        c=b.new_context(accept_downloads=True)
        c.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(status=200, content_type='application/javascript', body=GIS))
        c.route('https://www.googleapis.com/**', drive)
        c.route('https://fonts.googleapis.com/**', lambda r: r.abort()); c.route('https://fonts.gstatic.com/**', lambda r: r.abort())
        return c
    # ---- ierīce A ----
    A=lapa(ctx()); W=lambda x: A.wait_for_timeout(int(x*1000)); A.goto(BASE+'#iestatijumi'); W(0.5)
    ok('Pieslēgties Google Drive' in A.inner_text('#view') and 'Pirmā pieslēgšana' in A.inner_text('#view'), 'jaunā pārlūkā arī vispirms sākuma ekrāns')
    A.click('#sBez'); W(0.4)
    ok('Pieslēgt Google Drive' in A.inner_text('#drive'), 'statusa josla piedāvā pieslēgt Drive')
    A.fill('input[name=vards]','Anna Paraugs'); A.fill('input[name=personasKods]','010101-10000'); A.fill('input[name=iban]','LV00TEST0000000000000')
    A.click('#pf button[type=submit]'); W(0.3)
    A.click('#drSinh'); A.wait_for_selector('dialog.dlg'); ok('test@example.com' in A.inner_text('dialog.dlg'), 'jautā apstiprināt kontu')
    A.click('dialog.dlg button[data-id=ja]'); W(1.5)
    ok('sinhronizēts' in A.inner_text('#drive'), 'statuss: sinhronizēts')
    ok(len(datu_fails())==1 and json.loads(datu_fails()[0]['saturs'])['profils']['vards']=='Anna Paraugs', 'dati augšupielādēti Drive')
    # izmaiņa → automātiska augšupielāde
    A.goto(BASE+'#ligumi'); W(0.4)
    A.select_option('select[name=pas]','__jauns'); A.fill('[data-p=nosaukums]','Teātris A'); A.fill('[data-p=regNr]','40000000001'); A.fill('input[name=nr]','AL-2026-1'); A.fill('input[name=summa]','1500')
    A.click('#lf button[type=submit]'); W(2.5)
    d=json.loads(datu_fails()[0]['saturs'])
    ok(len(d['autorligumi'])==1 and d['drive']['konts']=='test@example.com', 'izmaiņa automātiski saglabāta Drive (+konta slēdzene datos)')
    # ---- ierīce B (tukša) ----
    B=lapa(ctx()); B.goto(BASE+'#ligumi'); W(0.4)
    B.click('#sPieslegt'); B.wait_for_selector('dialog.dlg'); B.click('dialog.dlg button[data-id=ja]'); W(1)
    ok(B.locator('#nav').is_visible(), 'jaunā ierīce pieslēdzas no sākuma ekrāna')
    ok('AL-2026-1' in B.inner_text('#view'), 'jaunā ierīce ielādē datus no Drive')
    B.fill('input[name=nr]','AL-2026-2'); B.select_option('select[name=pas]', index=1); B.fill('input[name=summa]','700'); B.click('#lf button[type=submit]'); W(2.5)
    A.goto(BASE+'#iestatijumi'); W(0.3); A.click('#drSinh'); W(1); A.goto(BASE+'#ligumi'); W(0.4)
    ok('AL-2026-2' in A.inner_text('#view'), 'otras ierīces izmaiņa redzama pirmajā')
    # konflikts: abās ierīcēs izmaiņas
    B.fill('input[name=nr]','B-3'); B.select_option('select[name=pas]', index=1); B.fill('input[name=summa]','1'); B.click('#lf button[type=submit]'); W(2.5)
    A.evaluate("() => { const m = JSON.parse(localStorage.getItem('gramatvediba:drive')); m.versija = String(Number(m.versija)); }")
    A.fill('input[name=nr]','A-3'); A.select_option('select[name=pas]', index=1); A.fill('input[name=summa]','2'); A.click('#lf button[type=submit]')
    W(3)
    ok(A.locator('dialog.dlg').count()==0, 'abās ierīcēs jauni līgumi: apvieno bez jautāšanas')
    ok('B-3' in A.inner_text('#view') and 'A-3' in A.inner_text('#view'), 'apvienoti abu ierīču līgumi')
    d=json.loads(datu_fails()[0]['saturs']); ok({'A-3','B-3'} <= {a['nr'] for a in d['autorligumi']}, 'Drive ir abu ierīču līgumi')
    ok(A.evaluate("() => JSON.parse(localStorage.getItem('gramatvediba:dati-pirms-drive')).autorligumi.some(a => a.nr === 'A-3')"), 'pārlūka versija pirms apvienošanas saglabāta lokālā rezervē')
    ok(any(f['name'].startswith('gramatvediba-dati 2') for f in faili.values()), 'Drive rezerves kopija izveidota')
    # konflikts: viens un tas pats līgums labots abās ierīcēs → jautā tikai par to
    B.goto(BASE+'#iestatijumi'); W(0.3); B.click('#drSinh'); W(1.5); B.goto(BASE+'#ligumi'); W(0.4)
    A.evaluate("() => { const d = JSON.parse(localStorage.getItem('gramatvediba:dati')); }")
    B.locator('[data-lproj]').first.fill('Projekts B'); B.locator('[data-lproj]').first.dispatch_event('change'); W(2.5)
    A.evaluate("() => { const m = JSON.parse(localStorage.getItem('gramatvediba:drive')); }")
    A.locator('[data-lproj]').first.fill('Projekts A'); A.locator('[data-lproj]').first.dispatch_event('change')
    A.wait_for_selector('dialog.dlg', timeout=6000); ok('laboti abās vietās' in A.inner_text('dialog.dlg') and 'līgums' in A.inner_text('dialog.dlg'), 'konfliktā jautā tikai par vienā ierakstā labotajiem')
    A.click('dialog.dlg button[data-id=parluks]'); W(2)
    d=json.loads(datu_fails()[0]['saturs']); ok(any(a.get('projekts')=='Projekts A' for a in d['autorligumi']) and {'A-3','B-3'} <= {a['nr'] for a in d['autorligumi']}, 'paturēta pārlūka versija konfliktējošam ierakstam, pārējais saglabāts')
    # atjaunošana no Drive rezerves kopijas
    A.goto(BASE+'#iestatijumi'); W(0.3); A.click('#drKopijas'); W(1)
    ok(A.locator('[data-kop]').count()>=1, 'rezerves kopiju saraksts')
    A.once('dialog', lambda dlg: dlg.accept()); A.locator('[data-kop]').last.click(); W(2.5)
    ok(any(f['name'].startswith('gramatvediba-dati 2') for f in faili.values()) and len([f for f in faili.values() if f['name'].startswith('gramatvediba-dati 2')])>=2, 'pirms atjaunošanas izveidota jauna rezerves kopija')
    # sākuma ekrāns, atverot no jauna (atslēga tikai atmiņā; „bez Drive” izvēle der tikai sesijai)
    A.evaluate("sessionStorage.clear()"); A.reload(); W(1)
    ok('Pieslēgties Google Drive' in A.inner_text('#view') and A.locator('#nav').is_hidden(), 'atverot rīku, vispirms sākuma ekrāns ar pieslēgšanos')
    A.click('#sBez'); W(0.5)
    ok(A.locator('#nav').is_visible() and 'Strādā bez Google Drive' in A.inner_text('#drive'), 'var strādāt bez Drive; josla to atgādina')
    # dzēst no pārlūka: Drive paliek
    pirms=datu_fails()[0]['saturs']
    A.goto(BASE+'#iestatijumi'); W(0.3); A.once('dialog', lambda dlg: dlg.accept()); A.click('#dzestVisu'); W(2.5)
    ok(datu_fails()[0]['saturs']==pirms, 'dzēšana pārlūkā nepārraksta Drive')
    ok('Pieslēgt Google Drive' in A.inner_text('#drive') and A.evaluate("() => JSON.parse(localStorage.getItem('gramatvediba:dati')).autorligumi.length")==0, 'pārlūks notīrīts un atvienots')
    # atslēgas nav glabātuvē
    ok('tok' not in json.dumps(B.evaluate("() => Object.fromEntries(Object.entries(localStorage))")), 'piekļuves atslēga netiek glabāta pārlūkā')
    b.close()
srv.terminate()
print('kļūdas:', errs)
