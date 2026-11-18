// Prova temporanea: la pagina delle graduatorie (campi del modulo) e alcuni filtri per escludere i passaggi.
// Tutto finisce solo nel file cifrato; nel log nessun indirizzo.
import { writeFileSync, mkdirSync } from 'node:fs';
import { leggiFonti, scarica } from './fonti.js';
import { leggiGraduatoria } from './graduatorie.js';

const pausa = (ms) => new Promise((r) => { setTimeout(r, ms); });
const fonti = leggiFonti();
const cartella = process.argv[2];
mkdirSync(cartella, { recursive: true });
const out = { chiavi: Object.keys(fonti), naz: fonti.naz };
const prova = async (nome, fn) => {
  try {
    out[nome] = await fn();
  } catch (e) {
    out[nome] = `errore: ${e.message}`;
  }
  await pausa(700);
};
const u = new URL(fonti.naz);
const pagine = [`${u.origin}${u.pathname}`];
const senza = new URL(fonti.naz);
senza.searchParams.delete('format');
senza.searchParams.delete('view');
pagine.push(senza.toString());
for (const [i, p] of pagine.entries()) {
  await prova(`pagina${i}`, async () => {
    const html = await scarica(p, { timeout: 60 });
    writeFileSync(`${cartella}/pagina${i}.html`, html);
    const script = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => /solr|gradu|federnuoto|custom|template/i.test(s)).slice(0, 12);
    for (const [j, s] of script.entries()) {
      try {
        const js = await scarica(new URL(s, p).toString(), { timeout: 60 });
        writeFileSync(`${cartella}/pagina${i}-script${j}.js`, js);
      } catch { /* niente */ }
      await pausa(500);
    }
    return { lunghezza: html.length, script, campi: [...new Set([...html.matchAll(/solr\[[a-z_]+\]/g)].map((m) => m[0]))] };
  });
}
// Il caso di prova: 100 SL maschi vasca 25, 2025/26, nati nel 2009, Lazio.
const base = {
  'solr[settore]': 'NUO', 'solr[sesso]': 'M', 'solr[id_lunghezza_vasca]': '1', 'solr[kindtime]': '3', 'solr[stagione]': '2025', 'solr[codice_gara]': '01', 'solr[id_comitato]': '12', 'solr[limit]': '5000', 'solr[dalyob]': '2009', 'solr[alyob]': '2009',
};
const extra = [
  {}, { 'solr[kindtime]': '1' }, { 'solr[kindtime]': '2' }, { 'solr[kindtime]': '4' }, { 'solr[kindtime]': '5' },
  { 'solr[turno]': 'I' }, { 'solr[tipo_turno]': 'I' }, { 'solr[id_tipo_turno]': '1' }, { 'solr[passaggi]': '0' },
  { 'solr[split]': '0' }, { 'solr[individuale]': '1' }, { 'solr[tipo]': 'I' }, { 'solr[tipotempo]': '1' }, { 'solr[id_turno]': '1' },
];
out.casi = [];
for (const e of extra) {
  try {
    const righe = leggiGraduatoria(await scarica(`${fonti.naz}&currentpage=1&format=json&view=grricerca`, { metodo: 'POST', timeout: 90, modulo: { ...base, ...e } }));
    const p = righe.filter((r) => /PULCINI/.test(r.nome));
    out.casi.push({
      extra: e, righe: righe.length, turni: [...new Set(righe.map((r) => r.turno))], pulcini: p.map((r) => [r.ms, r.turno, r.data, r.idGara]),
    });
    console.log(`prova ${Object.keys(e).join(',') || 'base'}: ${righe.length} righe, ${p.length} righe del caso`);
  } catch (err) {
    out.casi.push({ extra: e, errore: err.message });
  }
  await pausa(700);
}
writeFileSync(`${cartella}/filtri.json`, JSON.stringify(out, null, 1));
