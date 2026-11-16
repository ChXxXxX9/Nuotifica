// Prova temporanea: tutto quello che sappiamo di un atleta (per capire perché un tempo manca in una squadra).
// I risultati vanno in una cartella che il workflow cifra.
import { mkdirSync, writeFileSync } from 'node:fs';
import { leggiFonti, scarica } from './fonti.js';
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';
import { trovaUrlRtdb, creaRtdb } from './rtdb.js';
import { leggiGraduatoria } from './graduatorie.js';
import { chiaveSquadra } from './ricerca.js';

const dir = process.argv[2] ?? 'indagine';
const cerca = (process.argv[3] ?? 'pulcini ettore').toLowerCase();
mkdirSync(dir, { recursive: true });
const fonti = leggiFonti();
const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
const chiama = creaClientGoogle(creaGestoreToken(account));
const db = creaFirestore(chiama, account.project_id);
const rtdb = creaRtdb(chiama, await trovaUrlRtdb(chiama, account.project_id));
const esito = { cerca, atleti: {} };
const voci = await rtdb.leggi('c', { orderBy: '"$key"', startAt: JSON.stringify(cerca), endAt: JSON.stringify(`${cerca}`), limitToFirst: '20' });
esito.voci = voci;
const chiavi = [...new Set(Object.values(voci ?? {}).map((v) => String(v).split('|')[0]))];
const post = (view, campi) => scarica(`${fonti.naz}&currentpage=1&format=json&view=${view}`, {
  metodo: 'POST', timeout: 90, tentativi: 2, modulo: { 'solr[settore]': 'NUO', ...campi },
});
for (const k of chiavi) {
  const a = await rtdb.leggi(`a/${k}`);
  const st = await rtdb.leggi(`st/${k}`);
  const scheda = await db.leggi(`atleti/${k}`);
  const x = {
    a, st, scheda: scheda ? { ...scheda, r: (scheda.r ?? []).filter((v) => v.c === '100SL') } : null, squadre: {},
  };
  // Squadre delle sue stagioni: le sue righe nelle tabelle di stagione e nel riassunto.
  for (const [s, testo] of Object.entries(a ?? {})) {
    if (!/^s\d{4}$/.test(s)) continue;
    const societa = String(testo).split('~')[0].split('|')[0];
    const id = chiaveSquadra(societa);
    const tab = await rtdb.leggi(`sqs/${id}/${s}`);
    const mie = Object.fromEntries(Object.entries(tab?.t ?? {}).map(([kt, r]) => [kt, String(r).split('~').filter((riga) => riga.startsWith(`${k}|`))]).filter(([, r]) => r.length));
    x.squadre[`${id}/${s}`] = { societa, esiste: !!tab, membro: String(tab?.m ?? '').includes(`${k}|`), righe: mie };
    if (!x.squadre[`sqx/${id}`]) {
      const sqx = await rtdb.leggi(`sqx/${id}`);
      x.squadre[`sqx/${id}`] = {
        esiste: !!sqx,
        cento25: String(sqx?.t?.['25|100SL|M'] ?? '').split('~').length,
        mio25: String(sqx?.t?.['25|100SL|M'] ?? '').split('~').filter((r) => r.startsWith(`${k}|`)),
        mio50: String(sqx?.t?.['50|100SL|M'] ?? '').split('~').filter((r) => r.startsWith(`${k}|`)),
      };
    }
  }
  // Fonte: tutte le gare nei 100 SL e, per le sue stagioni, la sua riga nella graduatoria (con il turno).
  const id = st?.f ?? a?.f ?? [...(scheda?.fin ?? [])].pop();
  if (id) x.fonte100 = JSON.parse(await post('grspecialitaatleta', { 'solr[id_atleta]': id, 'solr[codice_gara]': '01', 'solr[limit]': '1000' })).content?.replace(/\s+/g, ' ').slice(0, 20000);
  const [, y] = String(a?.i ?? '').split('|');
  x.graduatorie = {};
  for (const s of Object.keys(a ?? {}).filter((z) => /^s\d{4}$/.test(z)).slice(-4)) {
    for (const [v, idv] of [[25, '1'], [50, '2']]) {
      const righe = leggiGraduatoria(await post('grricerca', {
        'solr[sesso]': 'M', 'solr[id_lunghezza_vasca]': idv, 'solr[kindtime]': '3', 'solr[stagione]': s.slice(1), 'solr[codice_gara]': '01',
        'solr[id_comitato]': '', 'solr[dalyob]': y, 'solr[alyob]': y, 'solr[limit]': '5000',
      }));
      x.graduatorie[`${s}-${v}`] = righe.filter((r) => /PULCINI/i.test(r.nome));
    }
  }
  esito.atleti[k] = x;
}
writeFileSync(`${dir}/esito.json`, JSON.stringify(esito, null, 1));
console.log(`Atleti trovati: ${chiavi.length}`);
