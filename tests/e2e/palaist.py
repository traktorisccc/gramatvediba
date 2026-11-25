#!/usr/bin/env python3
# Palaiž visus pārlūka testus pēc kārtas. Ja ir mape private/e2e (tikai tavā datorā), palaiž arī tos.
# Vajag: python3, playwright (pip install playwright && playwright install chromium), openpyxl, poppler-utils (pdftotext, pdfimages).
# Lietošana: python3 tests/e2e/palaist.py   (rezultāti un ekrānuzņēmumi: $E2E_OUT vai <tmp>/gramatvediba-e2e)
import os, sys, glob, signal, subprocess
TE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(TE, '..', '..'))
skripti = sorted(glob.glob(os.path.join(TE, '[!_]*.py'))) + sorted(glob.glob(os.path.join(ROOT, 'private', 'e2e', '*.py')))
skripti = [s for s in skripti if os.path.basename(s) != 'palaist.py']
slikti = 0
for s in skripti:
    p = subprocess.Popen([sys.executable, s], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
    try: out, _ = p.communicate(timeout=300)
    except subprocess.TimeoutExpired: out = 'pārsniegts laiks'
    finally:
        try: os.killpg(p.pid, signal.SIGTERM)          # aptur arī testa palaisto serveri
        except ProcessLookupError: pass
    labi, kludas = out.count('✓ '), out.count('✗ ')
    derigs = p.returncode == 0 and kludas == 0
    slikti += not derigs
    print(f"{'✓' if derigs else '✗'} {os.path.relpath(s, ROOT):45} {labi} pārbaudes" + ('' if derigs else f", {kludas} neizdevās, kods {p.returncode}"))
    if not derigs: print('\n'.join('    ' + r for r in out.splitlines() if r.startswith('✗') or 'Error' in r or 'NEIZDEVĀS' in r))
print('\nVISI TESTI IZDEVĀS' if not slikti else f'\nNEIZDEVĀS: {slikti} skripti'); sys.exit(1 if slikti else 0)
