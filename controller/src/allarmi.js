// Avvisi all'admin sul funzionamento di Cloro (piano gratuito di Firebase, senza avvisi di spesa):
// - la sentinella (workflow "Sentinella", ogni 30 minuti) avvisa se il controllore è fermo e quando riparte;
// - il controllore, a fine giro, avvisa quando i suoi consumi si avvicinano ai limiti: scritture su
//   Firestore del giorno e download dal Realtime Database del mese.
// Sul telefono dell'admin arrivano come notifiche; senza un telefono con le notifiche attive la corsa
// della sentinella fallisce, così GitHub manda la sua email.
import { tokensAttivi } from './invio.js';

/** Dopo quanti minuti senza un giro il controllore si considera fermo (gira ogni 5 minuti). */
export const MINUTI_FERMO = 30;
/** Se resta fermo, ogni quante ore lo si ricorda. */
export const ORE_PROMEMORIA = 6;
/** Limite gratuito di download del Realtime Database al mese (oltre, il database si spegne fino al mese dopo). */
export const RTDB_MESE = 10e9;

export async function adminUid(db) {
  return (await db.leggi('meta/admin'))?.uid ?? null;
}

/** Una notifica a un iscritto, su tutti i suoi dispositivi con le notifiche attive. Torna quante ne sono partite. */
export async function pushUtente({
  db, invio, uid, messaggio,
}) {
  const u = await db.leggi(`users/${uid}`);
  let n = 0;
  for (const token of tokensAttivi(u)) if (await invio.push(token, messaggio) === 'ok') n++;
  return n;
}

/** Una notifica all'admin. Torna quante ne sono partite (0 se l'admin non c'è o non ha le notifiche attive). */
export async function avvisaAdmin({
  db, invio, messaggio,
}) {
  const uid = await adminUid(db);
  return uid ? pushUtente({
    db, invio, uid, messaggio,
  }) : 0;
}

const numero = (n) => Math.round(n).toLocaleString('it-IT');
const gb = (byte) => (byte / 1e9).toLocaleString('it-IT', { maximumFractionDigits: 1 });

/** "45 minuti", "3 ore", "2 giorni". */
export function durata(ms) {
  const minuti = Math.max(1, Math.round(ms / 60_000));
  if (minuti < 120) return `${minuti} minut${minuti === 1 ? 'o' : 'i'}`;
  const ore = Math.round(minuti / 60);
  if (ore < 48) return `${ore} ore`;
  return `${Math.round(ore / 24)} giorni`;
}

/** Ora italiana di un momento: "14:05", oppure "22/11 alle 14:05" se non è oggi. */
export function oraRoma(quando, adesso) {
  const fmt = (d, o) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', ...o }).format(new Date(d));
  const ora = fmt(quando, { hour: '2-digit', minute: '2-digit' });
  const giorno = (d) => fmt(d, { day: '2-digit', month: '2-digit' });
  return giorno(quando) === giorno(adesso) ? ora : `${giorno(quando)} alle ${ora}`;
}

/* ---------- sentinella: il controllore è fermo? ---------- */

/**
 * Cosa fare in base all'ultimo giro del controllore (meta/stato) e a quello che la sentinella ha già
 * detto (meta/sentinella). Torna { azione: 'fermo' | 'ancora' | 'ripartito' | null, messaggio, stato }:
 * `stato` è il nuovo meta/sentinella da scrivere (null se non cambia niente).
 */
export function decidiSentinella({
  ultimo, adesso, sentinella = {}, sito = '',
}) {
  const ora = Date.parse(adesso);
  const fermoDa = ultimo ? ora - Date.parse(ultimo) : Infinity;
  const url = `${sito}/#/admin`;
  const dettaglio = ultimo
    ? `Ultimo giro alle ${oraRoma(ultimo, adesso)} (${durata(fermoDa)} fa).`
    : 'Non c\'è traccia di un giro.';
  if (fermoDa > MINUTI_FERMO * 60_000) {
    const primaVolta = !sentinella.fermo;
    const promemoria = !primaVolta && ora - Date.parse(sentinella.avvisato ?? 0) >= ORE_PROMEMORIA * 3_600_000;
    if (!primaVolta && !promemoria) return { azione: null, messaggio: null, stato: null };
    return {
      azione: primaVolta ? 'fermo' : 'ancora',
      messaggio: {
        titolo: primaVolta ? 'Il controllore è fermo' : 'Il controllore è ancora fermo',
        corpo: `${dettaglio} Avvisi, diretta e notifiche non si aggiornano. Guarda GitHub Actions e cron-job.org.`,
        url,
        tag: 'sentinella',
      },
      stato: { fermo: true, dal: ultimo ?? null, avvisato: adesso },
    };
  }
  if (sentinella.fermo) {
    const dal = sentinella.dal ? Date.parse(sentinella.dal) : null;
    return {
      azione: 'ripartito',
      messaggio: {
        titolo: 'Il controllore è ripartito',
        corpo: dal ? `Era fermo dalle ${oraRoma(sentinella.dal, adesso)} (${durata(Date.parse(ultimo) - dal)}).` : 'Ora gira di nuovo.',
        url,
        tag: 'sentinella',
      },
      stato: { fermo: false, ripartito: adesso },
    };
  }
  return { azione: null, messaggio: null, stato: null };
}

/** Un giro della sentinella: 2 letture, e una scrittura solo quando cambia qualcosa. */
export async function giroSentinella({
  db, invio, sito, adesso = new Date().toISOString(), log = console.log,
}) {
  const [stato, sentinella] = [...(await db.leggiTanti(['meta/stato', 'meta/sentinella'])).values()];
  const ultimo = stato?.ultimoControllo ?? null;
  const decisione = decidiSentinella({
    ultimo, adesso, sentinella: sentinella ?? {}, sito,
  });
  if (!decisione.azione) {
    log(`Controllore: ultimo giro ${ultimo ? `${durata(Date.parse(adesso) - Date.parse(ultimo))} fa` : 'mai'}, tutto a posto.`);
    return { ...decisione, inviate: 0 };
  }
  const inviate = await avvisaAdmin({ db, invio, messaggio: decisione.messaggio });
  await db.scrivi('meta/sentinella', decisione.stato);
  log(`${decisione.messaggio.titolo}: ${decisione.messaggio.corpo} (${inviate} notifiche all'admin)`);
  return { ...decisione, inviate };
}

/* ---------- consumi del controllore ---------- */

/**
 * Soglie dei consumi superate e non ancora segnalate. Per ogni consumo si manda solo l'avviso della
 * soglia più alta raggiunta, ma si segnano tutte quelle superate (così non arrivano dopo, una per una).
 *   scritte    scritture su Firestore di oggi (controllore e graduatorie), contro il tetto del controllore
 *   rtdb       byte scaricati dal Realtime Database questo mese (controllore e graduatorie)
 *   avvisati   { giorno: [...], mese: [...] } soglie già segnalate oggi e questo mese
 * Torna { messaggi, giorno, mese } con gli elenchi aggiornati.
 */
export function avvisiConsumi({
  scritte = 0, tetto, rtdb = 0, avvisati = {}, sito = '',
}) {
  const giorno = [...(avvisati.giorno ?? [])];
  const mese = [...(avvisati.mese ?? [])];
  const messaggi = [];
  const url = `${sito}/#/admin`;

  const soglieScritture = [
    {
      id: 'scritture-80',
      oltre: scritte >= 0.8 * tetto,
      titolo: 'Scritture quasi finite',
      corpo: `Oggi il controllore ha già fatto ${numero(scritte)} scritture su ${numero(tetto)}. Al tetto la diretta e le notifiche dei tempi si fermano fino alle 9:00.`,
    },
    {
      id: 'scritture-tetto',
      oltre: scritte >= tetto,
      titolo: 'Tetto delle scritture raggiunto',
      corpo: `Diretta e notifiche dei tempi sono ferme fino alle 9:00 (${numero(scritte)} scritture oggi).`,
    },
  ];
  const soglieRtdb = [3e9, 6e9, 8e9].map((s) => ({
    id: `rtdb-${s / 1e9}`,
    oltre: rtdb >= s,
    titolo: 'Realtime Database: download alto',
    corpo: `Questo mese il controllore ha già scaricato ${gb(rtdb)} GB su ${gb(RTDB_MESE)} GB gratuiti, che valgono anche per l'app: oltre, il database si spegne fino al mese dopo. Guarda Realtime Database → Utilizzo nella console.`,
  }));

  for (const [soglie, gia] of [[soglieScritture, giorno], [soglieRtdb, mese]]) {
    const nuove = soglie.filter((s) => s.oltre && !gia.includes(s.id));
    if (!nuove.length) continue;
    const piuAlta = nuove[nuove.length - 1];
    messaggi.push({
      titolo: piuAlta.titolo, corpo: piuAlta.corpo, url, tag: 'consumi',
    });
    gia.push(...nuove.map((s) => s.id));
  }
  return { messaggi, giorno, mese };
}
