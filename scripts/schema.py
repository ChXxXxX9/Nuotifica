# Struttura di un JSON senza nomi di persone: chiavi, tipi ed esempi "mascherati".
import json, re, sys
def maschera(v):
    if isinstance(v, str):
        if re.fullmatch(r"[\d:.,'\"\s+-]*", v) or len(v) <= 4 or re.fullmatch(r'[A-Z0-9_]+', v):
            return v
        return re.sub(r"[A-Za-zÀ-ÿ]", 'x', v)[:40]
    return v
def giro(x, prof=0, max_el=2):
    if isinstance(x, dict):
        return {k: giro(v, prof + 1) for k, v in list(x.items())[:60]}
    if isinstance(x, list):
        return [giro(v, prof + 1) for v in x[:max_el]] + ([f'... {len(x)} elementi'] if len(x) > max_el else [])
    return maschera(x)
raw = open(sys.argv[1], 'rb').read().decode('utf-8-sig', errors='replace')
try:
    d = json.loads(raw)
    print(json.dumps(giro(d), ensure_ascii=False, indent=1)[:6000])
except Exception as e:
    print('NON JSON', e, raw[:300])
