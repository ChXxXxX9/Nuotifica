// Prepara l'indirizzo nuovo dell'app: crea il sito di Firebase Hosting (cloro, oppure cloro14 se
// "cloro" è già preso da qualcun altro) e lo aggiunge ai domini autorizzati per l'accesso.
// Scrive l'id del sito in GITHUB_OUTPUT (sito=...). Uso: node src/sito.js
import { appendFile } from 'node:fs/promises';
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';

const PREFERITI = ['cloro', 'cloro14'];

function annota(livello, testo) {
  const t = String(testo).replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
  console.log(process.env.GITHUB_ACTIONS ? `::${livello} title=Sito::${t}` : testo);
}

async function principale() {
  const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
  const progetto = account.project_id;
  const google = creaClientGoogle(creaGestoreToken(account));
  const hosting = `https://firebasehosting.googleapis.com/v1beta1/projects/${progetto}/sites`;

  // 1. Il sito esiste già nel progetto? Altrimenti si prova a crearlo, nell'ordine di preferenza.
  const { sites = [] } = await google(hosting);
  const nostri = sites.map((s) => s.name.split('/').pop());
  let sito = PREFERITI.find((p) => nostri.includes(p));
  if (!sito) {
    for (const p of PREFERITI) {
      try {
        await google(`${hosting}?siteId=${p}`, { method: 'POST', body: {} });
        sito = p;
        annota('notice', `Creato il sito ${p}.web.app`);
        break;
      } catch (e) {
        annota('notice', `${p}.web.app non disponibile: ${String(e.message).slice(0, 200)}`);
      }
    }
  }
  if (!sito) throw new Error('Nessuno degli indirizzi preferiti è disponibile.');

  // 2. Domini autorizzati per l'accesso (Firebase Authentication).
  const config = `https://identitytoolkit.googleapis.com/admin/v2/projects/${progetto}/config`;
  try {
    const attuale = await google(config);
    const domini = new Set(attuale.authorizedDomains ?? []);
    const servono = [`${sito}.web.app`, `${sito}.firebaseapp.com`];
    if (servono.some((d) => !domini.has(d))) {
      servono.forEach((d) => domini.add(d));
      await google(`${config}?updateMask=authorizedDomains`, {
        method: 'PATCH',
        body: { authorizedDomains: [...domini] },
      });
      annota('notice', `Domini autorizzati aggiornati: ${servono.join(', ')}`);
    }
  } catch (e) {
    annota('warning', `Domini autorizzati non aggiornati (vanno aggiunti a mano): ${String(e.message).slice(0, 300)}`);
  }

  annota('notice', `Indirizzo dell'app: https://${sito}.web.app`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `sito=${sito}\n`);
}

principale().catch((e) => {
  annota('error', e.message ?? e);
  process.exit(1);
});
