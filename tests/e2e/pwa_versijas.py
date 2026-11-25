# PWA: servisa skripts, jaunas versijas josla „Atjaunot”, darbs bez interneta, manifests.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _vide import ROOT, OUT, versija, serveris
import json, shutil
from playwright.sync_api import sync_playwright
V = versija(); JAUNA = V + '-jauna'
KOP = OUT + '/gr-kopija'; shutil.rmtree(KOP, ignore_errors=True); shutil.copytree(ROOT, KOP, ignore=shutil.ignore_patterns('private', 'tests', '.git'))
assert f"'{V}'" in open(KOP + '/sw.js', encoding='utf-8').read(), 'sw.js un src/versija.js versijām jābūt vienādām'
serveris(8140, KOP); B = 'http://localhost:8140/'
errs = []; kl = []
def ok(c, t):
    print(('✓ ' if c else '✗ ') + t)
    if not c: kl.append(t)
dati = {"versija": 1, "profils": {"vards": "Paraugs", "nakamaisNr": 1}, "pasutitaji": [], "rekini": [], "autorligumi": [], "maksataji": {}, "gadi": {}, "darijumi": []}
with sync_playwright() as p:
    b = p.chromium.launch(); c = b.new_context(viewport={'width': 1280, 'height': 900}); c.add_init_script("sessionStorage.setItem('gramatvediba:bez-drive','1')")
    c.route('https://fonts.googleapis.com/**', lambda r: r.abort())
    pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(B); pg.evaluate("d=>localStorage.setItem('gramatvediba:dati', JSON.stringify(d))", dati); pg.wait_for_timeout(1500)
    ok(pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r&&!!r.active)"), 'servisa skripts aktīvs')
    ok(pg.evaluate(f"caches.keys().then(k=>k.some(x=>x==='gramatvediba-{V}'))"), f'faili kešā ar versiju {V}')
    pg.reload(); pg.wait_for_timeout(800)
    ok(pg.evaluate("!!navigator.serviceWorker.controller"), 'lapu apkalpo servisa skripts')
    sw = open(KOP + '/sw.js', encoding='utf-8').read().replace(V, JAUNA); open(KOP + '/sw.js', 'w', encoding='utf-8').write(sw)
    open(KOP + '/src/versija.js', 'w', encoding='utf-8').write(f"export const VERSIJA = '{JAUNA}';\n")
    pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.update())"); pg.wait_for_timeout(2500)
    ok(pg.locator('#jaunaVersija').is_visible(), 'parādās „Pieejama jauna rīka versija”')
    ok(f"'{V}'" in pg.evaluate("fetch('src/versija.js').then(r=>r.text())"), 'kamēr nav atjaunots, darbojas vecā versija (faili nesajaucas)')
    pg.click('#atjaunotVersiju'); pg.wait_for_timeout(2500)
    ok(JAUNA in pg.evaluate("fetch('src/versija.js').then(r=>r.text())"), 'pēc „Atjaunot”: jaunā versija')
    pg.goto(B + '#iestatijumi'); pg.wait_for_timeout(600); ok(f'Rīka versija {JAUNA}' in pg.inner_text('#view'), 'versija redzama iestatījumos')
    c.set_offline(True); pg.reload(); pg.wait_for_timeout(1200)
    ok('Rēķini' in pg.inner_text('#nav'), 'rīks atveras bez interneta')
    c.set_offline(False)
    mf = pg.evaluate("fetch('manifest.json').then(r=>r.json())"); ok(mf['display'] == 'standalone', 'manifests')
    b.close()
print('kļūdas:', errs); print('NEIZDEVĀS:', kl if kl else 'nav')
