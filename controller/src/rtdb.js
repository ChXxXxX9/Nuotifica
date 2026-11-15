// Realtime Database di Firebase (piano gratuito: nessun limite di scritture al giorno, 1 GB di spazio).
// Qui stanno i dati "grandi" di tutta Italia: migliori di ogni stagione degli atleti, indice di ricerca
// e tabelle delle squadre. Lo usiamo con le chiamate REST, con il token dell'account di servizio.
//
//   a/{chiave}/i            "nome|anno|sesso"
//   a/{chiave}/s{stagione}  "società|regione~gara|vasca|tempo|data|luogo~…"
//   c/{nome normalizzato}~{chiave}   "chiave|nome|anno|società|regione" (una voce per ogni ordine delle parole)
//   sqs/{squadra}/s{stagione}        { n, reg, m: "chiave|nome|anno|sesso~…", t: { "vasca|gara|sesso": "chiave|tempo|data~…" } }

const PEZZO = 2_000; // percorsi per ogni scrittura

/** Indirizzo del database: da RTDB_URL, altrimenti si chiede a Firebase quali database ha il progetto. */
export async function trovaUrlRtdb(chiamaGoogle, progetto) {
  if (process.env.RTDB_URL) return process.env.RTDB_URL.replace(/\/$/, '');
  try {
    const r = await chiamaGoogle(`https://firebasedatabase.googleapis.com/v1beta/projects/${progetto}/locations/-/instances`);
    const istanza = (r.instances ?? []).find((x) => x.type === 'DEFAULT_DATABASE') ?? r.instances?.[0];
    if (istanza?.databaseUrl) return istanza.databaseUrl.replace(/\/$/, '');
  } catch { /* si provano gli indirizzi soliti */ }
  for (const url of [
    `https://${progetto}-default-rtdb.europe-west1.firebasedatabase.app`,
    `https://${progetto}-default-rtdb.firebaseio.com`,
    `https://${progetto}-default-rtdb.asia-southeast1.firebasedatabase.app`,
  ]) {
    try {
      await chiamaGoogle(`${url}/.json?shallow=true`);
      return url;
    } catch { /* il prossimo */ }
  }
  throw new Error('Realtime Database non trovato: crealo nella console di Firebase.');
}

export function creaRtdb(chiamaGoogle, url) {
  const conta = { scritture: 0, byte: 0 };
  const percorso = (p) => `${url}/${p.split('/').map(encodeURIComponent).join('/')}.json`;
  return {
    url,
    conta,
    async leggi(p, parametri = {}) {
      const q = new URLSearchParams(parametri).toString();
      return chiamaGoogle(`${percorso(p)}${q ? `?${q}` : ''}`);
    },
    async scrivi(p, dati) {
      conta.scritture++;
      return chiamaGoogle(`${percorso(p)}?print=silent`, { method: 'PUT', body: dati });
    },
    /** Tante scritture insieme: { "percorso/a/b": valore, … } (a pezzi, per non fare richieste enormi). */
    async aggiorna(voci) {
      const tutte = Object.entries(voci);
      for (let i = 0; i < tutte.length; i += PEZZO) {
        const pezzo = Object.fromEntries(tutte.slice(i, i + PEZZO));
        const corpo = JSON.stringify(pezzo);
        conta.scritture++;
        conta.byte += corpo.length;
        await chiamaGoogle(`${url}/.json?print=silent`, { method: 'PATCH', body: pezzo });
      }
      return tutte.length;
    },
    /** Solo le chiavi figlie di un percorso. */
    async chiavi(p) {
      const r = await chiamaGoogle(`${percorso(p)}?shallow=true`);
      return new Set(Object.keys(r ?? {}));
    },
  };
}
