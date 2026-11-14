import json, sys
raw = open(sys.argv[1], encoding='utf-8', errors='replace').read()
try:
    t = json.loads(raw).get('content', raw)
except Exception:
    t = raw
n = int(sys.argv[2]) if len(sys.argv) > 2 else 6000
i = t.find(sys.argv[3]) if len(sys.argv) > 3 else 0
i = max(0, i - 1500)
print(t[i:i+n])
