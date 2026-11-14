// Gli indirizzi delle fonti non stanno nel codice (che è pubblico): arrivano dal secret FONTI,
// un JSON con le chiavi "avvisi", "live", "liveGara" e "naz".
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const esegui = promisify(execFile);

export const USER_AGENT = 'Cloro/1.0 (+https://nuotifica.web.app)';

export function leggiFonti(testo = process.env.FONTI) {
  if (!testo) return {};
  try {
    const f = JSON.parse(testo);
    return typeof f === 'object' && f ? f : {};
  } catch {
    throw new Error('Il secret FONTI non è un JSON valido.');
  }
}

const pausa = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Scarica una pagina con curl (in HTTP/2, come un browser moderno: alcuni server rifiutano
 * i client HTTP/1.1). Restituisce il testo. Ritenta un paio di volte sugli errori temporanei.
 */
export async function scarica(url, { metodo = 'GET', modulo = null, tentativi = 3, timeout = 30 } = {}) {
  const argomenti = ['-sS', '--compressed', '--max-time', String(timeout), '-A', USER_AGENT,
    '-w', '\n%{http_code}', '-X', metodo];
  if (url.startsWith('https://')) argomenti.push('--http2');
  for (const [k, v] of Object.entries(modulo ?? {})) argomenti.push('--data-urlencode', `${k}=${v}`);
  argomenti.push(url);
  let ultimo;
  for (let i = 0; i < tentativi; i++) {
    try {
      const { stdout } = await esegui('curl', argomenti, { maxBuffer: 64 * 1024 * 1024 });
      const a = stdout.lastIndexOf('\n');
      const stato = Number(stdout.slice(a + 1));
      const corpo = stdout.slice(0, a);
      if (stato >= 200 && stato < 300) return corpo;
      ultimo = new Error(`Risposta ${stato}`);
      if (stato >= 400 && stato < 500 && stato !== 429) break;
    } catch (e) {
      // Nel messaggio niente indirizzi: i log delle corse sono pubblici.
      ultimo = new Error(`connessione non riuscita${e.code ? ` (curl ${e.code})` : ''}`);
    }
    await pausa(1500 * (i + 1));
  }
  throw ultimo;
}
