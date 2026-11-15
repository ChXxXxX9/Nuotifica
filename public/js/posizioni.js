// Dove si piazza un tempo: nelle graduatorie della sua stagione, nel Lazio e in Italia,
// in assoluto, nella categoria e nell'anno (R14, J1…). Si usa nella scheda di ogni risultato.
import { stato, api, esc, conCache } from './nucleo.js';
import { codiciAtleta, nomeCodice } from './categorie.js';
import { regoleCategorie, nomeStagione } from './formato.js';

const ORE_VALIDITA = 24;
const leggi = (id) => conCache(`classifica:${id}`, (fresco) => api.leggiClassifica(id, fresco), { durata: 600_000 }).catch(() => null);
const dataDi = (d) => (d?.agg?.toDate ? d.agg.toDate() : d?.agg ? new Date(d.agg) : null);

function righe(doc) {
  const nascosti = new Set(stato.nascosti ?? []);
  return (doc?.righe ?? []).map((riga) => {
    const [k, , y, , valore] = riga.split('|');
    return { k, y: Number(y) || null, valore: Number(valore) };
  }).filter((r) => !nascosti.has(r.k));
}

/** Classifica pronta oppure chiesta al controllore (null + "in preparazione"). */
async function classifica(r, idNotte) {
  if (idNotte) {
    const notte = await leggi(idNotte);
    if (notte) return { doc: notte };
  }
  const id = `${r.st}-${r.v}-${r.c}-${r.sx}-${r.reg}-${r.cat}`;
  const doc = await leggi(id);
  const corrente = Number(r.st) === Number(new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1);
  const vecchia = doc && corrente && Date.now() - (dataDi(doc)?.getTime() ?? 0) > ORE_VALIDITA * 3_600_000;
  if (!doc || vecchia) api.chiediClassifica(r).catch(() => {});
  return { doc, attesa: !doc };
}

/** Posizione di un tempo in una lista (l'atleta stesso non si conta). */
function posizione(lista, t, k, parziale) {
  const altri = lista.filter((x) => x.k !== k);
  const davanti = altri.filter((x) => x.valore < t).length;
  if (parziale && davanti >= altri.length) return { testo: `oltre ${altri.length}°`, tot: null };
  return { testo: `${davanti + 1}°`, tot: altri.length + 1 };
}

export async function posizioniTempo({
  t, c, v, sx, st, y, k,
}) {
  const base = {
    st: String(st), v: Number(v), c, sx,
  };
  const codici = y ? codiciAtleta(y, sx, st, regoleCategorie()) : [];
  const [lazio, italia, ...italiaCat] = await Promise.all([
    classifica({ ...base, reg: '12', cat: 'tutte' }, Number(st) >= 2018 ? `${st}-${v}-${c}-${sx}` : null),
    classifica({ ...base, reg: 'it', cat: 'tutte' }),
    ...codici.map((cod) => classifica({ ...base, reg: 'it', cat: cod })),
  ]);
  const colonne = [{ cod: 'tutte', nome: 'Assoluti' }, ...codici.map((cod) => ({ cod, nome: nomeCodice(cod, sx) }))];
  const listaLazio = lazio.doc ? righe(lazio.doc) : [];
  const righeTabella = [
    {
      dove: 'Lazio',
      celle: colonne.map((col) => {
        if (!lazio.doc) return { attesa: true };
        const lista = col.cod === 'tutte' ? listaLazio
          : listaLazio.filter((x) => codiciAtleta(x.y, sx, st, regoleCategorie()).includes(col.cod));
        return posizione(lista, t, k, false);
      }),
    },
    {
      dove: 'Italia',
      celle: colonne.map((col, i) => {
        const r = i === 0 ? italia : italiaCat[i - 1];
        if (!r.doc) return { attesa: true };
        return posizione(righe(r.doc), t, k, r.doc.parziale);
      }),
    },
  ];
  return { colonne, righe: righeTabella, st };
}

export function htmlPosizioni(p) {
  const attesa = p.righe.some((r) => r.celle.some((c) => c.attesa));
  return `
    <div class="posizioni-tempo">
      <p class="posizioni-titolo">Con questo tempo, nelle graduatorie ${esc(nomeStagione(p.st))}</p>
      <div class="tabella-scorre">
        <table class="tabella-posizioni">
          <thead><tr><th></th>${p.colonne.map((c) => `<th>${esc(c.nome)}</th>`).join('')}</tr></thead>
          <tbody>${p.righe.map((r) => `
            <tr><th>${esc(r.dove)}</th>${r.celle.map((c) => `<td>${c.attesa ? '<span class="nota">…</span>' : `<b>${esc(c.testo)}</b>${c.tot ? `<small> su ${c.tot}</small>` : ''}`}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${attesa ? '<p class="nota">… = classifica in preparazione: riapri tra qualche minuto.</p>' : ''}
    </div>`;
}

/** Riempie il riquadro [data-posizioni] dentro `el` (si chiama dopo aver aperto la scheda). */
export async function riempiPosizioni(el, dati) {
  const box = el.querySelector('[data-posizioni]');
  if (!box || !dati.t || !['M', 'F'].includes(dati.sx) || !dati.v || !dati.c) {
    box?.remove();
    return;
  }
  box.innerHTML = '<p class="nota">Calcolo la posizione in classifica…</p>';
  try {
    const p = await posizioniTempo(dati);
    if (box.isConnected) box.innerHTML = htmlPosizioni(p);
  } catch {
    if (box.isConnected) box.innerHTML = '';
  }
}
