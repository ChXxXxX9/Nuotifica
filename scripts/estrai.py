import json, re, sys, html
p = sys.argv[1]
raw = open(p, encoding='utf-8', errors='replace').read()
try:
    d = json.loads(raw); t = d.get('content', '') if isinstance(d, dict) else raw
    print('status', d.get('status') if isinstance(d, dict) else '?')
except Exception:
    t = raw
links = sorted(set(re.findall(r'href="([^"#][^"]*)"', t)))
testo = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' | ', t)))
testo = re.sub(r'(\|\s*)+', '| ', testo)
print('caratteri', len(t), 'link', len(links))
print('TESTO:', testo[:2500])
print('LINK:')
for l in links[:120]: print(' ', l)
