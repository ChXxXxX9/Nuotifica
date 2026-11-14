# Rende anonimi i campioni di dati: niente nomi veri di atleti nel repository pubblico.
import json, re, sys, html, itertools
NOMI = ['Luca','Marco','Giulia','Sara','Andrea','Elena','Paolo','Chiara','Davide','Marta','Simone','Alice']
COGNOMI = ['Rossi','Bianchi','Verdi','Neri','Galli','Conti','Ferri','Sala','Moretti','Greco','Costa','Fontana']
gen = itertools.count()
def finto():
    i = next(gen); return NOMI[i % 12], f"{COGNOMI[(i // 12) % 12]}{'' if i < 144 else i}"
modo, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
if modo == 'live':
    d = json.load(open(src))
    r = d['results']; tenuti = {}
    for cat in list(r)[:3]:
        tenuti[cat] = {}
        for gara in list(r[cat])[:3]:
            tenuti[cat][gara] = r[cat][gara]
            for b, atl in r[cat][gara].items():
                for a in atl:
                    n, c = finto()
                    a['athlete']['firstname'], a['athlete']['lastname'] = n, c.upper()
                    a['code'] = str(1000000 + next(gen)); a['id'] = f"x{next(gen)}"
    json.dump({'results': tenuti}, open(dst, 'w'), ensure_ascii=False, indent=1)
elif modo == 'fin':
    d = json.load(open(src)); t = d.get('content', '')
    t = re.sub(r'(class="name"[^>]*>)(.*?)(<)', lambda m: m.group(1) + ' '.join(finto()[::-1]) + m.group(3), t, flags=re.S)
    d['content'] = t
    json.dump(d, open(dst, 'w'), ensure_ascii=False)
