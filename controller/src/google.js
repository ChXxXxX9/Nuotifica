// Accesso alle API Google (Firestore, Realtime Database, FCM, Identity Toolkit) con l'account di servizio Firebase,
// senza librerie esterne: firmiamo noi il JWT e chiediamo il token di accesso.
import { createSign } from 'node:crypto';

const SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export function leggiAccountServizio(json) {
  if (!json) throw new Error('Manca FIREBASE_SERVICE_ACCOUNT (il file JSON dell\'account di servizio).');
  let dati;
  try {
    dati = JSON.parse(json);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT non è un JSON valido.');
  }
  for (const campo of ['client_email', 'private_key', 'project_id']) {
    if (!dati[campo]) throw new Error(`FIREBASE_SERVICE_ACCOUNT: manca il campo ${campo}.`);
  }
  return dati;
}

function b64url(oggetto) {
  return Buffer.from(JSON.stringify(oggetto)).toString('base64url');
}

export function creaGestoreToken(account, { fetchFn = fetch } = {}) {
  let token = null;
  let scade = 0;
  return async function ottieniToken() {
    const ora = Math.floor(Date.now() / 1000);
    if (token && ora < scade - 120) return token;
    const intestazione = { alg: 'RS256', typ: 'JWT' };
    const richiesta = {
      iss: account.client_email,
      scope: SCOPE,
      aud: account.token_uri || 'https://oauth2.googleapis.com/token',
      iat: ora,
      exp: ora + 3600,
    };
    const daFirmare = `${b64url(intestazione)}.${b64url(richiesta)}`;
    const firma = createSign('RSA-SHA256').update(daFirmare).sign(account.private_key, 'base64url');
    const chiedi = () => fetchFn(richiesta.aud, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${daFirmare}.${firma}`,
      }),
    });
    let risposta;
    for (let i = 0; ; i++) {
      try {
        risposta = await chiedi();
        break;
      } catch (e) {
        if (i >= 3) throw e;
        await new Promise((r) => { setTimeout(r, 2000 * 2 ** i); });
      }
    }
    if (!risposta.ok) {
      throw new Error(`Accesso Google non riuscito (${risposta.status}): ${await risposta.text()}`);
    }
    const dati = await risposta.json();
    token = dati.access_token;
    scade = ora + (dati.expires_in ?? 3600);
    return token;
  };
}

const pausa = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * fetch con token Google e messaggi d'errore leggibili. Una connessione caduta o una risposta 429/5xx
 * si riprova (fino a 5 volte, aspettando sempre di più): nei giri lunghi capita, e non deve fermare tutto.
 */
export function creaClientGoogle(ottieniToken, { fetchFn = fetch, tentativi = 5, attesa = 2000 } = {}) {
  // Byte scaricati dal Realtime Database (il piano gratuito ne permette 10 GB al mese, app compresa).
  const scaricati = { rtdb: 0 };
  const daRtdb = (url) => /\.(firebasedatabase\.app|firebaseio\.com)\//.test(url);
  async function chiamaGoogle(url, { method = 'GET', body, consenti404 = false } = {}) {
    let risposta;
    for (let i = 0; ; i++) {
      try {
        risposta = await fetchFn(url, {
          method,
          headers: {
            authorization: `Bearer ${await ottieniToken()}`,
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (i + 1 >= tentativi) throw new Error(`Connessione a Google non riuscita dopo ${tentativi} tentativi: ${e.cause?.code ?? e.message}`);
        await pausa(attesa * 2 ** i);
        continue;
      }
      if ((risposta.status === 429 || risposta.status >= 500) && i + 1 < tentativi) {
        const scarto = await risposta.text().catch(() => '');
        if (daRtdb(url)) scaricati.rtdb += Buffer.byteLength(scarto);
        await pausa(attesa * 2 ** i);
        continue;
      }
      break;
    }
    if (consenti404 && risposta.status === 404) return null;
    const testo = await risposta.text();
    if (daRtdb(url)) scaricati.rtdb += Buffer.byteLength(testo);
    const dati = testo ? JSON.parse(testo) : {};
    if (!risposta.ok) {
      const errore = new Error(`${method} ${url} -> ${risposta.status}: ${dati?.error?.message ?? testo}`);
      errore.status = risposta.status;
      errore.dati = dati;
      throw errore;
    }
    return dati;
  }
  chiamaGoogle.scaricati = scaricati;
  return chiamaGoogle;
}
