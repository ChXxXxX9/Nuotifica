// Invio delle notifiche push con Firebase Cloud Messaging.

const ERRORI_TOKEN = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND', 'SENDER_ID_MISMATCH']);

function codiceErroreFcm(errore) {
  const dettagli = errore?.dati?.error?.details ?? [];
  for (const d of dettagli) {
    if (d.errorCode) return d.errorCode;
  }
  return errore?.dati?.error?.status ?? null;
}

export function creaInvio({ chiamaGoogle, progetto }) {
  return {
    /** 'ok' | 'token-non-valido' | 'errore' */
    async push(token, messaggio) {
      try {
        await chiamaGoogle(`https://fcm.googleapis.com/v1/projects/${progetto}/messages:send`, {
          method: 'POST',
          body: {
            message: {
              token,
              // Solo "data": la notifica la mostra il nostro service worker (sw.js),
              // così funziona allo stesso modo su iPhone, Android e computer.
              data: {
                titolo: messaggio.titolo,
                corpo: messaggio.corpo,
                url: messaggio.url,
                tag: messaggio.tag,
              },
              webpush: { headers: { Urgency: 'high', TTL: '172800' } },
            },
          },
        });
        return 'ok';
      } catch (e) {
        const codice = codiceErroreFcm(e);
        if (e.status === 404 || (e.status === 400 && ERRORI_TOKEN.has(codice))) return 'token-non-valido';
        console.error(`Push non inviata: ${e.message}`);
        return 'errore';
      }
    },
  };
}

/** Esegue le promesse con al massimo `n` in parallelo. */
export async function inParallelo(elementi, n, funzione) {
  const risultati = new Array(elementi.length);
  let prossimo = 0;
  async function lavoratore() {
    while (prossimo < elementi.length) {
      const i = prossimo++;
      risultati[i] = await funzione(elementi[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, elementi.length) }, lavoratore));
  return risultati;
}

// Indirizzo dell'app: le notifiche vanno solo ai dispositivi che si sono registrati da qui.
const HOST_APP = (() => {
  try {
    return new URL(process.env.SITO_URL || 'https://cloro.web.app').host;
  } catch {
    return 'cloro.web.app';
  }
})();

/**
 * I token a cui mandare le notifiche di un utente. Ogni token salvato dall'app nuova ha accanto
 * l'indirizzo (th): se ce n'è almeno uno, si usano solo quelli dell'app nuova (niente doppioni dalla
 * vecchia); altrimenti tutti, come prima.
 */
export function tokensAttivi(u, host = HOST_APP) {
  const tutti = u?.tokens ?? [];
  const th = u?.th ?? {};
  const nuovi = tutti.filter((t) => th[t] === host);
  return nuovi.length ? nuovi : tutti;
}


/** Campi da aggiornare per togliere i token non più validi (anche dalla mappa degli indirizzi). */
export function senzaToken(u, nonValidi) {
  return {
    tokens: (u.tokens ?? []).filter((t) => !nonValidi.has(t)),
    th: Object.fromEntries(Object.entries(u.th ?? {}).filter(([t]) => !nonValidi.has(t) && (u.tokens ?? []).includes(t))),
  };
}
