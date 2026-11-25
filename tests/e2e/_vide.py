# Kopīgais pārlūka testiem: ceļi, vietējais serveris, rezultātu uzskaite.
# Testi lieto tikai izdomātus datus. Testi ar īstiem datiem ir mapē private/e2e (nav repozitorijā).
import os, re, sys, pathlib, tempfile, subprocess, time, atexit

ROOT = str(pathlib.Path(__file__).resolve().parents[2])                 # repozitorija sakne
OUT = os.environ.get('E2E_OUT') or str(pathlib.Path(tempfile.gettempdir()) / 'gramatvediba-e2e')
os.makedirs(os.path.join(OUT, 'shots'), exist_ok=True)
PRIV = os.path.join(ROOT, 'private')

def versija():
    """Pašreizējā rīka versija (src/versija.js); sw.js jābūt tai pašai."""
    return re.search(r"'([^']+)'", open(os.path.join(ROOT, 'src', 'versija.js'), encoding='utf-8').read()).group(1)

def serveris(port, cwd=ROOT):
    """Palaiž python -m http.server un aptur to testa beigās."""
    p = subprocess.Popen([sys.executable, '-m', 'http.server', str(port)], cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    atexit.register(p.terminate); time.sleep(1)
    return p
