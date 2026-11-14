import json, re, sys, html, collections
raw = open(sys.argv[1], encoding='utf-8', errors='replace').read()
try:
    d = json.loads(raw); t = d.get('content', ''); print('status', d.get('status'))
except Exception as e:
    print('non json', e); t = raw
print('caratteri', len(t))
classi = collections.Counter(re.findall(r'class="([^"]+)"', t))
print('classi', classi.most_common(40))
print('th', [html.unescape(re.sub('<[^>]+>', '', x)).strip() for x in re.findall(r'<th[^>]*>(.*?)</th>', t, re.S)][:30])
attr = collections.Counter(re.findall(r'(data-[a-z_-]+)="', t)); print('data-attr', attr.most_common(20))
print('data-view', sorted(set(re.findall(r'data-view="([^"]+)"', t))))
print('data-value', sorted(set(re.findall(r'data-value="([^"]+)"', t))))
print('link', sorted(set(re.findall(r'href="([^"]+)"', t)))[:30])
testo = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' | ', t)))
testo = re.sub(r'(\|\s*)+', '| ', testo)
ok = {'Batteria','Serie','Finale','Stile','Libero','Dorso','Rana','Farfalla','Misti','Maschi','Femmine','Tempo','Pos','Atleta','Anno','Società','Esordienti','Ragazzi','Juniores','Cadetti','Senior','Assoluti','Categoria','Vasca','Risultati','Classifica','Passaggi','Staffetta','Data','Luogo','Gara','Corsia'}
masch = re.sub(r"\b[A-ZÀ-Ý][A-Za-zÀ-ÿ'’]+\b", lambda m: m.group(0) if m.group(0) in ok else 'X', testo)
print('TESTO (nomi mascherati):', masch[:3500])
