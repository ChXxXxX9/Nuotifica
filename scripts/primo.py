import json, re, sys
t = json.loads(open(sys.argv[1], encoding='utf-8').read())['content']
m = re.search(r'class="collegamento"[^>]*?data-value="([^"]+)"[^>]*?data-id="([^"]+)"', t, re.S) or re.search(r'data-value="([^"]+)"\s*data-id="([^"]+)"', t)
if not m:
    i = t.find('collegamento'); print('RAW', t[i-200:i+600]); sys.exit()
chiavi = m.group(1).split(';'); valori = m.group(2).split(';')
print(' '.join(f"--data-urlencode {k}={v}" for k, v in zip(chiavi, valori)))
