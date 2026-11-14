// Logica pura (niente rete): confronto con lo stato precedente, chi deve ricevere cosa, testi dei messaggi.
import { impronta, tipiDiFile } from './parse.js';
import { comeData } from './firestore.js';
import { NOMI_TIPI, MAX_PUSH_PER_GIRO } from './config.js';

const impEtichetta = (etichetta) => impronta(etichetta, 6);

/** Voce compatta dell'indice: data di modifica e impronta di ogni file. */
export function voceIndice(post) {
  return {
    m: post.modificato,
    f: Object.fromEntries((post.file ?? []).map((f) => [f.id, impEtichetta(f.etichetta)])),
  };
}

/**
 * Cosa è cambiato rispetto a prima.
 * - nessuna voce precedente: post nuovo;
 * - file con indirizzo mai visto: aggiunti;
 * - stesso file ma etichetta cambiata con "aggiornato/rettifica…": aggiornati.
 * Restituisce null se non c'è niente da notificare (es. solo testo modificato).
 */
export function confronta(prev, post) {
  if (!prev) return { tipo: 'nuovo', file: post.file };
  const cambiati = [];
  for (const f of post.file) {
    const prima = prev.f?.[f.id];
    if (prima === undefined) cambiati.push(f);
    else if (prima !== impEtichetta(f.etichetta) && f.aggiornato) cambiati.push(f);
  }
  return cambiati.length ? { tipo: 'aggiunta', file: cambiati } : null;
}

/** Documento da salvare in posts/{id}; conserva la data di arrivo dei file già visti. */
export function documentoPost(post, vecchio, diff, adesso) {
  const prima = new Map((vecchio?.file ?? []).map((f) => [f.id, f]));
  const cambiati = new Set((diff?.file ?? []).map((f) => f.id));
  const file = post.file.map((f) => ({
    id: f.id,
    url: f.url,
    etichetta: f.etichetta,
    tipo: f.tipo,
    aggiornato: Boolean(f.aggiornato),
    aggiuntoIl: comeData(
      cambiati.has(f.id) ? adesso : (prima.get(f.id)?.aggiuntoIl ?? post.modificato ?? adesso),
    ),
  }));
  let novita = null;
  if (diff) {
    novita = { tipo: diff.tipo, quando: comeData(adesso), fileIds: diff.file.map((f) => f.id) };
  } else if (vecchio?.novita) {
    novita = { ...vecchio.novita, quando: comeData(vecchio.novita.quando) };
  }
  return {
    id: post.id,
    titolo: post.titolo,
    link: post.link,
    data: comeData(post.data),
    modificato: comeData(post.modificato),
    settori: post.settori,
    gruppi: post.gruppi,
    tipi: tipiDiFile(post.file),
    file,
    ultimoCambio: comeData(diff ? adesso : (vecchio?.ultimoCambio ?? post.modificato ?? adesso)),
    novita,
  };
}

/**
 * Il cambiamento interessa questo utente? Se sì, restituisce il cambiamento
 * con i soli file dei tipi che l'utente vuole ricevere.
 */
export function perUtente(utente, cambio) {
  const settoriUtente = utente.settori ?? [];
  const comuni = cambio.post.settori.filter((s) => settoriUtente.includes(s));
  if (!comuni.length) return null;

  // Il filtro Categoria/Esordienti vale solo per il nuoto.
  if (comuni.every((s) => s === 'nuoto')) {
    const gruppiUtente = utente.gruppi?.length ? utente.gruppi : ['categoria', 'esordienti'];
    if (!cambio.post.gruppi.some((g) => gruppiUtente.includes(g))) return null;
  }

  const vuoleTutto = !utente.tipi?.length || utente.tipi.includes('tutti');
  if (vuoleTutto) return cambio;

  if (cambio.tipo === 'nuovo' && !cambio.file.length) {
    return utente.tipi.includes('comunicati') ? cambio : null;
  }
  const file = cambio.file.filter((f) => utente.tipi.includes(f.tipo));
  return file.length ? { ...cambio, file } : null;
}

export function accorcia(testo = '', max = 80) {
  const t = testo.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Toglie i prefissi tecnici tipo "comun197-" o "FcrEC –" dalle etichette per renderle leggibili. */
export function etichettaLeggibile(etichetta = '') {
  let aggiornato = false;
  const pulita = etichetta
    .replace(/^\s*comun\s*\d+\s*(aggiornato)?\s*[-–—:]\s*/i, (_, agg) => {
      aggiornato = Boolean(agg);
      return '';
    })
    .replace(/^\s*[A-Z][A-Za-z]{2,7}\s*[-–—]\s+/, '')
    .trim();
  if (!pulita) return etichetta;
  return aggiornato ? `Aggiornato – ${pulita}` : pulita;
}

function urlPost(sito, id) {
  return `${sito}/#/post/${id}`;
}

export function messaggioPush(cambio, sito) {
  const titolo = accorcia(cambio.post.titolo, 90);
  let corpo;
  if (cambio.tipo === 'nuovo') {
    const tipi = [...new Set(cambio.file.map((f) => NOMI_TIPI[f.tipo] ?? 'Altro'))];
    corpo = cambio.file.length ? `Nuovo · ${tipi.join(', ')}` : 'Nuovo comunicato';
  } else {
    const primo = cambio.file[0];
    const altri = cambio.file.length - 1;
    corpo = `${primo.aggiornato ? 'Aggiornato' : 'Aggiunto'}: ${accorcia(etichettaLeggibile(primo.etichetta), 70)}`
      + (altri > 0 ? ` e altri ${altri}` : '');
  }
  return { titolo, corpo, url: urlPost(sito, cambio.post.id), tag: `post-${cambio.post.id}` };
}

export function messaggiPush(cambi, sito) {
  if (cambi.length > MAX_PUSH_PER_GIRO) {
    return [{
      titolo: `${cambi.length} nuovi avvisi del Comitato`,
      corpo: cambi.slice(0, 3).map((c) => accorcia(c.post.titolo, 40)).join(' · '),
      url: `${sito}/#/`,
      tag: 'riepilogo',
    }];
  }
  return cambi.map((c) => messaggioPush(c, sito));
}
