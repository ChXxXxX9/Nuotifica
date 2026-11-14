import json, re, sys, html
t = json.loads(open(sys.argv[1], encoding='utf-8').read())['content']
blocchi = t.split('nat_eve_container')[1:]
for b in blocchi:
    tipo = b.split('"', 1)[0].strip()
    g = re.findall(r'nat_eve_d">(\d+)</span>\s*<span class="nat_eve_m">(\w+)</span>\s*<span class="nat_eve_y">(\d+)', b)
    tit = re.search(r'nat_eve_title"[^>]*><span>(.*?)</span>', b, re.S)
    luogo = re.findall(r'nat_eve_loc">\s*(.*?)\s*</p>', b, re.S)
    ide = re.search(r'data-id="(\d+)"', b)
    et = re.search(r'data-callbk="_viewDettaglio"\s*>(\w+)<', b)
    print(ide.group(1) if ide else '-', '|', tipo, '|', ' / '.join('-'.join(x) for x in g), '|', html.unescape(tit.group(1)) if tit else '', '|', ' '.join(l.strip() for l in luogo), '|', et.group(1) if et else '')
