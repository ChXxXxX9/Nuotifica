// Notifiche a chi segue una squadra: tempi nuovi dei suoi atleti (tutti o solo i personali) e staffette.
// Ognuno sceglie cosa ricevere per ogni squadra (users/{uid}.notSq[squadra]: "tempi", "pb", "staffette").
import { chiaveSquadra } from './ricerca.js';
import { stessaSquadra } from './gare.js';
import { tokensAttivi, senzaToken } from './invio.js';
import { formatta } from './tempi.js';

export const NOTIFICHE_BASE = ['pb', 'staffette'];
const MAX_PER_PERSONA = 2;

/** Dal nome scritto nella gara alla squadra dell'elenco (anche se scritto un po' diverso). */
export function trovaSquadra(nome, elenco) {
  if (!nome) return null;
  let migliore = null;
  for (const [id, n] of elenco) {
    const v = stessaSquadra(n, nome);
    if (!migliore || v > migliore[1]) migliore = [id, v];
  }
  return migliore && migliore[1] >= 0.5 ? migliore[0] : chiaveSquadra(nome);
}

/** Il testo della notifica per una squadra. */
export function messaggioSquadra({
  nome, id, tempi, staffette, sito,
}) {
  const pb = tempi.filter((t) => t.b === 'PB');
  const pezzi = [];
  if (tempi.length === 1) {
    const t = tempi[0];
    pezzi.push(`${t.n}: ${t.b === 'PB' ? 'nuovo personale, ' : ''}${t.gara?.breve ?? ''} in ${formatta(t.t)}`);
  } else if (tempi.length) {
    const nomi = [...new Set(tempi.map((t) => t.n.split(' ').slice(-1)[0]))];
    pezzi.push(`${tempi.length} tempi nuovi${pb.length ? ` (${pb.length} ${pb.length === 1 ? 'personale' : 'personali'})` : ''}: ${nomi.slice(0, 4).join(', ')}${nomi.length > 4 ? ' e altri' : ''}`);
  }
  for (const s of staffette.slice(0, 2)) pezzi.push(`staffetta ${s.nome} in ${formatta(s.t)}`);
  if (staffette.length > 2) pezzi.push(`altre ${staffette.length - 2} staffette`);
  return {
    titolo: nome,
    corpo: pezzi.join(' · ').slice(0, 180),
    url: `${sito}/#/squadra/${encodeURIComponent(id)}`,
    tag: `squadra-${id}`,
  };
}

/**
 * `nuoviTempi`: tempi individuali nuovi (con s = società, b = PB/SB); `staffette`: { squadra, nome, t } nuove.
 * Chi segue già un atleta riceve la sua notifica personale: qui non si ripete.
 */
export async function avvisaSquadre({
  db, invio, nuoviTempi = [], staffette = [], sito, log = console.log,
}) {
  if (!nuoviTempi.length && !staffette.length) return { push: 0, utenti: 0 };
  const elencoDoc = (await db.leggi('meta/squadre'))?.squadre ?? {};
  const elenco = Object.entries(elencoDoc).map(([id, riga]) => [id, String(riga).split('|')[0]]);
  const perSquadra = new Map();
  const aggiungi = (id, campo, x) => {
    if (!perSquadra.has(id)) perSquadra.set(id, { tempi: [], staffette: [] });
    perSquadra.get(id)[campo].push(x);
  };
  for (const t of nuoviTempi) {
    const id = trovaSquadra(t.s, elenco);
    if (id) aggiungi(id, 'tempi', t);
  }
  for (const s of staffette) {
    const id = trovaSquadra(s.squadra, elenco);
    if (id) aggiungi(id, 'staffette', s);
  }
  if (!perSquadra.size) return { push: 0, utenti: 0 };
  const utenti = await db.contieneUno('users', 'squadre', [...perSquadra.keys()]);
  const conteggi = { push: 0, utenti: 0 };
  for (const u of utenti) {
    if (u.pushOn === false || !u.tokens?.length) continue;
    const seguiti = new Set(u.seguiti ?? []);
    const messaggi = [];
    for (const id of u.squadre ?? []) {
      const novita = perSquadra.get(id);
      if (!novita) continue;
      const scelte = u.notSq?.[id] ?? NOTIFICHE_BASE;
      const tempi = scelte.includes('tempi') ? novita.tempi : scelte.includes('pb') ? novita.tempi.filter((t) => t.b === 'PB') : [];
      const loro = tempi.filter((t) => !seguiti.has(t.k));
      const staff = scelte.includes('staffette') ? novita.staffette : [];
      if (!loro.length && !staff.length) continue;
      messaggi.push(messaggioSquadra({
        nome: String(elencoDoc[id] ?? '').split('|')[0] || id, id, tempi: loro, staffette: staff, sito,
      }));
    }
    if (!messaggi.length) continue;
    conteggi.utenti++;
    const nonValidi = new Set();
    for (const token of tokensAttivi(u)) {
      for (const m of messaggi.slice(0, MAX_PER_PERSONA)) {
        const esito = await invio.push(token, m);
        if (esito === 'ok') conteggi.push++;
        else if (esito === 'token-non-valido') {
          nonValidi.add(token);
          break;
        }
      }
    }
    if (nonValidi.size) await db.aggiorna(`users/${u.id}`, senzaToken(u, nonValidi)).catch(() => {});
  }
  if (conteggi.utenti) log(`Squadre: avvisate ${conteggi.utenti} persone (${conteggi.push} notifiche).`);
  return conteggi;
}

const impronta = (t) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
};

/**
 * Staffette nelle pagine delle squadre (Realtime Database, sqr/{squadra}/{impronta}):
 * "gara|sesso|vasca|tempo|data|id gara|categoria". `staffette`: { squadra (nome scritto nella gara), voce }.
 */
export async function salvaStaffette({ db, rtdb, staffette }) {
  if (!staffette?.length || !rtdb) return 0;
  const elenco = Object.entries((await db.leggi('meta/squadre'))?.squadre ?? {}).map(([id, riga]) => [id, String(riga).split('|')[0]]);
  const voci = {};
  for (const x of staffette) {
    const id = trovaSquadra(x.squadra, elenco);
    if (id) voci[`sqr/${id}/${impronta(x.voce)}`] = x.voce;
  }
  await rtdb.aggiorna(voci);
  return Object.keys(voci).length;
}
