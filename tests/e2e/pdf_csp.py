# Rēķina PDF ar logo un e-rēķins XML; CSP nebloķē nevienu resursu.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vide import ROOT, OUT, PRIV, versija
import subprocess, time, sys
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,'-m','http.server','8126'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
dati={"versija":1,"profils":{"vards":"Anna Paraugs","personasKods":"010101-10000","adrese":{"iela":"Iela 1","pilseta":"Rīga","indekss":"LV-1001","valsts":"LV"},"iban":"LV00TEST0000000000000","bic":"HABALV22","epasts":"","vieta":"Rīgā","logo":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","nakamaisNr":2},
 "pasutitaji":[{"id":"p1","nosaukums":"Teātris A","regNr":"40000000000","adrese":{}}],
 "rekini":[{"id":"r1","nr":1,"datums":"2026-01-05","termins":"2026-01-19","pasutitajsId":"p1","valoda":"lv","ligumaNr":"","periods":None,"veids":"90.13","pozicijas":[{"nosaukums":"Scenogrāfija","daudzums":1,"cena":2000}]}],
 "autorligumi":[],"maksataji":{},"darijumi":[],"gadi":{}}
errs=[]; kl=[]
def ok(c,t):
    print(('✓ ' if c else '✗ ')+t)
    if not c: kl.append(t)
with sync_playwright() as p:
    b=p.chromium.launch(); c=b.new_context(accept_downloads=True); c.add_init_script("sessionStorage.setItem('gramatvediba:bez-drive','1')"); pg=c.new_page()
    c.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8126/'); pg.evaluate("d => localStorage.setItem('gramatvediba:dati', JSON.stringify(d))", dati)
    pg.goto('http://localhost:8126/#rekini'); pg.reload(); pg.wait_for_timeout(500)
    dati['pasutitaji'][0]['konts']='LV00UNLA0000000000001'
    with pg.expect_download() as dl: pg.click('[data-pdf]')
    dl.value.save_as(OUT+'/csp.pdf')
    t=subprocess.run(['pdftotext',OUT+'/csp.pdf','-'],capture_output=True,text=True).stdout
    ok('Scenogrāfija' in t and 'divi tūkstoši' in t.lower(), 'PDF satur rēķinu un summu vārdiem: '+dl.value.suggested_filename)
    im=subprocess.run(['pdfimages','-list',OUT+'/csp.pdf'],capture_output=True,text=True).stdout
    ok('image' in im, 'logo ir PDF failā')
    with pg.expect_download() as dl: pg.click('[data-xml]')
    ok(dl.value.suggested_filename.endswith('.xml'), 'e-rēķins XML: '+dl.value.suggested_filename)
    b.close()
srv.terminate(); ok(not [e for e in errs if 'fonts.g' not in e], 'nav kļūdu konsolē (arī CSP): '+str(errs)); print('NEIZDEVĀS:', kl if kl else 'nav')
