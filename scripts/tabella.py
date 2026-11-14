# Campi non personali di un file di risultati/start list: per capire batterie, turni, parziali.
import json, sys
d = json.loads(open(sys.argv[1], 'rb').read().decode('utf-8-sig'))
for k in ('Competition', 'Category', 'Round', 'Heat', 'Event', 'Document'):
    v = d.get(k)
    if isinstance(v, dict):
        print(k, {x: v[x] for x in v if x in ('Cod', 'Ita', 'Type', 'Date', 'Time', 'UffDate', 'UffTime', 'Place', 'Revised')})
print('Extra', [f['Field'] for f in d.get('ExtraDetails', {}).get('Ita', [])])
print('StatoBatt', d.get('StatoBatt'), 'chiavi', [k for k in d if k not in ('data',)])
righe = d.get('data') or d.get('heats') or []
print('righe', len(righe))
if righe and isinstance(righe[0], dict):
    print('chiavi riga', list(righe[0].keys()))
for r in righe[:60]:
    if not isinstance(r, dict):
        print(str(r)[:200]); continue
    mf = r.get('MemFields') or []
    print('|'.join(str(r.get(k, '')) for k in ('b', 'PlaCls', 'PlaLane', 'MemRBatt', 'MemRBattCls', 'MemPrest', 'MemQual', 'PlaCat', 'PlaBirth', 'PlaNat', 'MemIscr', 'MemNote', 'Gap', 'Last50')),
          ' SP:', ' '.join(f"{f.get('V','')}/{f.get('P','')}/{f.get('T','')}" for f in mf))
