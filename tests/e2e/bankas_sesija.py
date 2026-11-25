import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vide import ROOT, OUT, PRIV, versija
import subprocess, time, sys, openpyxl
from playwright.sync_api import sync_playwright
srv = subprocess.Popen([sys.executable,'-m','http.server','8124'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
csv='\r\n'.join(['"Klienta konts";"Ieraksta tips";"Datums";"Saņēmējs/Maksātājs";"Informācija saņēmējam";"Summa";"Valūta";"Debets/Kredīts";"Arhīva kods";"Maksājuma veids";"Refernces numurs";"Dokumenta numurs";',
 '"LV00TEST0000000000000";"10";"01.01.2026";"";"Sākuma atlikums";"0,00";"EUR";"K";"";"AS";"";"";',
 '"LV00TEST0000000000000";"20";"05.01.2026";"PARAUGA TEĀTRIS VSIA";"Scenogrāfija";"1000,00";"EUR";"K";"A1";"INB";"";"";',
 '"LV00TEST0000000000000";"20";"06.01.2026";"MARTA PARAUGA";"Rīsi";"40,00";"EUR";"K";"A2";"INB";"";"";',
 '"LV00TEST0000000000000";"82";"31.01.2026";"";"Apgrozījums";"1040,00";"EUR";"K";"";"K2";"";"";'])
open(OUT+'/t.csv','w').write(csv)
errs=[]; ok=lambda c,t: print(('✓ ' if c else '✗ ')+t)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(accept_downloads=True); pg.add_init_script("sessionStorage.setItem('gramatvediba:bez-drive','1')")
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    pg.goto('http://localhost:8124/#banka'); pg.evaluate("localStorage.clear()"); pg.reload(); time.sleep(0.5)
    pg.set_input_files('#csv',OUT+'/t.csv'); time.sleep(0.5)
    sel = pg.locator('select[data-kat]')
    sel.nth(0).select_option('sd'); time.sleep(0.3)
    pg.locator('select[data-kat]').nth(1).select_option('personigs'); time.sleep(0.3)
    ok('Nav rīkā izrakstītu rēķinu' in pg.content(), 'paskaidrojums tukšajai piesaistes izvēlnei')
    pg.reload(); time.sleep(0.6)
    html=pg.content()
    ok('iepriekš ielādētais, vēl neapstiprinātais' in html, 'sesija atjaunota pēc pārlādēšanas')
    ok(pg.locator('select[data-kat]').nth(1).input_value()=='personigs', 'izvēle saglabāta pēc pārlādēšanas')
    pg.locator('[data-apstiprinat]').first.click(); time.sleep(0.4)
    pg.reload(); time.sleep(0.5)
    ok('vēl neapstiprinātais' not in pg.content() and pg.evaluate("localStorage.getItem('gramatvediba:banka-sesija')") is None, 'pēc apstiprināšanas sesija notīrīta')
    pg.goto('http://localhost:8124/#deklaracija'); time.sleep(0.5); pg.select_option('#g','2026'); time.sleep(0.3)
    with pg.expect_download() as dl: pg.click('#parskats')
    dl.value.save_as(OUT+'/p2.xlsx'); b.close()
srv.terminate()
wb=openpyxl.load_workbook(OUT+'/p2.xlsx', data_only=True)
ok('Rēķini un līgumi' not in wb.sheetnames, 'bez rēķiniem lapas „Rēķini un līgumi” nav')
txt=[c.value for ws in wb.worksheets for row in ws.iter_rows() for c in row if isinstance(c.value,str)]
ok(not any('MARTA' in t for t in txt), 'personīgā maksātāja vārda pārskatā nav')
ok(any(t.startswith('Personīgie darījumi') for t in txt), 'personīgie darījumi kopsummā')
print('kļūdas:', errs)
