# Excel pārskats grāmatvedim: lapas, kopsavilkums, rēķini.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vide import ROOT, OUT, PRIV, versija
import json, subprocess, time, sys, openpyxl
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,'-m','http.server','8123'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
dati = {"versija":1,"profils":{"vards":"Testa Lietotājs","personasKods":"","adrese":{"iela":"","pilseta":"","indekss":"","valsts":"LV"},"iban":"","bic":"","epasts":"","vieta":"Rīgā","logo":"","nakamaisNr":2},
 "pasutitaji":[{"id":"p1","nosaukums":"Teātris A","regNr":"40000000000","adrese":{}}],
 "rekini":[{"id":"r1","nr":1,"datums":"2026-01-05","termins":"2026-01-19","pasutitajsId":"p1","valoda":"lv","ligumaNr":"","periods":None,"veids":"90.13","pozicijas":[{"nosaukums":"Scenogrāfija","daudzums":1,"cena":2000}]}],
 "autorligumi":[],"maksataji":{},
 "darijumi":[
  {"arhivaKods":"a1","datums":"2026-01-10","partneris":"TEĀTRIS A","info":"rēķins 1","summa":2000,"valuta":"EUR","virziens":"K","kategorija":"sd","saite":{"tips":"rekins","kods":"r1","nr":1}},
  {"arhivaKods":"a2","datums":"2026-02-01","partneris":"AKKA/LAA","info":"Autoratlīdzība","summa":80,"valuta":"EUR","virziens":"K","kategorija":"akka"},
  {"arhivaKods":"roku-1","datums":"2026-04-23","partneris":"Valsts budžets (VID)","info":"Ievadīts ar roku","summa":100,"valuta":"EUR","virziens":"D","kategorija":"vid-maksajums","nodokluGads":2026,"arRoku":True}],
 "gadi":{"2026":{"attaisnotie":"300"}}}
errs=[]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(accept_downloads=True); pg.add_init_script("sessionStorage.setItem('gramatvediba:bez-drive','1')")
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://localhost:8123/'); pg.evaluate("d => localStorage.setItem('gramatvediba:dati', JSON.stringify(d))", dati)
    pg.goto('http://localhost:8123/#deklaracija'); pg.reload(); time.sleep(0.8)
    pg.select_option('#g', '2026'); time.sleep(0.3)
    with pg.expect_download() as dl: pg.click('#parskats')
    dl.value.save_as(OUT+'/parskats.xlsx'); print('fails:', dl.value.suggested_filename)
    pg.screenshot(path=OUT+'/dekl.png', full_page=False)
    b.close()
srv.terminate()
kl=[]
def ok(c,t):
    print(('✓ ' if c else '✗ ')+t)
    if not c: kl.append(t)
wb = openpyxl.load_workbook(OUT+'/parskats.xlsx', data_only=True)
k = wb['Kopsavilkums']
ok(len(wb.sheetnames)==8 and 'Kā aizpildīt EDS' in wb.sheetnames and 'Žurnāls' in wb.sheetnames, 'Excel: 8 lapas, arī „Žurnāls” un „Kā aizpildīt EDS”: '+str(wb.sheetnames))
vk=[str(c.value) for row in k.iter_rows() for c in row if c.value is not None]
ok(any('2000' in v for v in vk), 'kopsavilkumā ieņēmumi 2000')
rl=[str(c.value) for row in wb['Rēķini un līgumi'].iter_rows() for c in row if c.value is not None]
ok(any('Teātris A' in v for v in rl), 'rēķinu lapā pasūtītājs')
ok(not errs, 'nav kļūdu konsolē: '+str(errs))
print('NEIZDEVĀS:', kl if kl else 'nav')
