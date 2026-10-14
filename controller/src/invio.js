// Invio di notifiche push (Firebase Cloud Messaging), email (Brevo) e verifica email (Firebase Auth).

const ERRORI_TOKEN = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND', 'SENDER_ID_MISMATCH']);

function codiceErroreFcm(errore) {
  const dettagli = errore?.dati?.error?.details ?? [];
  for (const d of dettagli) {
    if (d.errorCode) return d.errorCode;
  }
  return errore?.dati?.error?.status ?? null;
}

export function creaInvio({ chiamaGoogle, progetto, brevoKey, brevoMittente, fetchFn = fetch }) {
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

    /** uid con email verificata (Google o email confermata). */
    async emailVerificate(uids) {
      const verificati = new Set();
      for (let i = 0; i < uids.length; i += 100) {
        const blocco = uids.slice(i, i + 100);
        const dati = await chiamaGoogle(
          `https://identitytoolkit.googleapis.com/v1/projects/${progetto}/accounts:lookup`,
          { method: 'POST', body: { localId: blocco } },
        );
        for (const u of dati.users ?? []) {
          if (u.emailVerified && !u.disabled) verificati.add(u.localId);
        }
      }
      return verificati;
    },

    get emailAttive() {
      return Boolean(brevoKey && brevoMittente);
    },

    async email({ a, oggetto, html, testo, disiscrizione }) {
      const risposta = await fetchFn('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Nuotifica', email: brevoMittente },
          to: [{ email: a }],
          subject: oggetto,
          htmlContent: html,
          textContent: testo,
          headers: { 'List-Unsubscribe': `<${disiscrizione}>` },
          tags: ['avviso'],
        }),
      });
      if (!risposta.ok) {
        throw new Error(`Brevo ha rifiutato l'email (${risposta.status}): ${await risposta.text()}`);
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
