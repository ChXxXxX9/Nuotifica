// Sezione admin: chi gestisce Cloro (l'email sta nel secret ADMIN_EMAIL, non nel codice)
// e gli annunci a tutti gli iscritti scritti dall'app.
import { createHash } from 'node:crypto';
import { comeData } from './firestore.js';
import { inParallelo, tokensAttivi } from './invio.js';

/** Crea admin/{uid} per l'account con l'email indicata. Si rifà solo se l'email cambia. */
export async function impostaAdmin({ db, chiamaGoogle, progetto, email, log = console.log }) {
  if (!email) return;
  const firma = createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16);
  const meta = await db.leggi('meta/admin');
  if (meta?.firma === firma && meta.uid) return;
  const r = await chiamaGoogle(`https://identitytoolkit.googleapis.com/v1/projects/${progetto}/accounts:lookup`, {
    method: 'POST',
    body: { email: [email.trim()] },
  });
  const uid = r?.users?.[0]?.localId;
  if (!uid) {
    log('Admin: nessun account con quell\'email. Entra almeno una volta nell\'app, poi si imposta da solo.');
    return;
  }
  await db.scrivi(`admin/${uid}`, { ruolo: 'admin', dal: comeData(new Date().toISOString()) });
  await db.scrivi('meta/admin', { firma, uid, aggiornato: comeData(new Date().toISOString()) });
  log('Admin impostato.');
}

/** Manda gli annunci scritti dall'admin a tutti gli iscritti con le notifiche attive. */
export async function inviaAnnunci({ db, invio, sito, log = console.log }) {
  const annunci = await db.dove('annunci', 'stato', 'da-inviare');
  if (!annunci.length) return 0;
  const utenti = (await db.elenca('users')).filter((u) => u.pushOn !== false && u.tokens?.length);
  let totale = 0;
  for (const a of annunci) {
    // Segnato subito come inviato: se il giro si interrompe non parte due volte.
    await db.aggiorna(`annunci/${a.id}`, { stato: 'inviato', inviato: comeData(new Date().toISOString()) });
    let n = 0;
    await inParallelo(utenti, 8, async (u) => {
      for (const token of tokensAttivi(u)) {
        const esito = await invio.push(token, {
          titolo: String(a.titolo ?? 'Cloro').slice(0, 60),
          corpo: String(a.corpo ?? '').slice(0, 180),
          url: a.url && /^#\//.test(a.url) ? `${sito}/${a.url}` : `${sito}/#/`,
          tag: `annuncio-${a.id}`,
        });
        if (esito === 'ok') n++;
      }
    });
    await db.aggiorna(`annunci/${a.id}`, { notifiche: n });
    totale += n;
    log(`Annuncio "${a.titolo}": ${n} notifiche.`);
  }
  return totale;
}

/** Tempi limite appena pubblicati dall'admin: una notifica a tutti ("ecco quanto ti manca"). */
export async function inviaLimiti({ db, invio, sito, log = console.log }) {
  const nuovi = await db.dove('limiti', 'stato', 'da-notificare');
  if (!nuovi.length) return 0;
  const utenti = (await db.elenca('users')).filter((u) => u.pushOn !== false && u.tokens?.length);
  let totale = 0;
  for (const l of nuovi) {
    await db.aggiorna(`limiti/${l.id}`, { stato: 'pubblicato', notificato: comeData(new Date().toISOString()) });
    let n = 0;
    await inParallelo(utenti, 8, async (u) => {
      for (const token of tokensAttivi(u)) {
        const esito = await invio.push(token, {
          titolo: `Nuovi tempi limite: ${String(l.nome ?? '').slice(0, 40)}`,
          corpo: 'Ecco quanto manca ai tuoi atleti: aprili in Cloro.',
          url: `${sito}/#/limiti/${l.id}`,
          tag: `limiti-${l.id}`,
        });
        if (esito === 'ok') n++;
      }
    });
    await db.aggiorna(`limiti/${l.id}`, { notifiche: n });
    totale += n;
    log(`Tempi limite "${l.nome}": ${n} notifiche.`);
  }
  return totale;
}

/**
 * Lavori chiesti dall'admin dall'app (collezione "lavori"):
 *   stagione  rilegge una stagione delle graduatorie (avvia il workflow "Graduatorie")
 *   gara      fa rileggere tutte le sedi di una gara al prossimo giro
 *   testi     fa rileggere il testo dei PDF degli avvisi
 *   prova     manda una notifica di prova all'admin
 */
export async function eseguiLavori({
  db, invio, sito, log = console.log, avviaWorkflow = avviaGraduatorie,
}) {
  const lavori = await db.dove('lavori', 'stato', 'da-fare');
  for (const l of lavori) {
    let esito = 'fatto';
    let stato = 'fatto';
    try {
      if (l.tipo === 'stagione') {
        await avviaWorkflow(String(l.stagione ?? ''));
        esito = 'graduatorie avviate';
      } else if (l.tipo === 'gara') {
        const live = (await db.leggi('meta/live')) ?? {};
        const gara = live.gare?.[l.gara];
        if (!gara) throw new Error('gara non trovata tra quelle in diretta');
        for (const sede of gara.sedi ?? []) if (live.sedi?.[sede]) live.sedi[sede].firma = null;
        await db.scrivi('meta/live', live);
        esito = `${(gara.sedi ?? []).length} sedi da rileggere`;
      } else if (l.tipo === 'testi') {
        await db.scrivi('meta/testi', { fatti: {} });
        esito = 'si rileggono a gruppi di 6';
      } else if (l.tipo === 'prova') {
        const uid = (await db.leggi('meta/admin'))?.uid;
        const u = uid ? await db.leggi(`users/${uid}`) : null;
        let n = 0;
        for (const token of tokensAttivi(u)) {
          if (await invio.push(token, {
            titolo: 'Notifica di prova', corpo: 'Se la leggi, le notifiche di Cloro funzionano.', url: `${sito}/#/admin`, tag: 'prova',
          }) === 'ok') n++;
        }
        esito = `${n} notifiche`;
      } else {
        esito = 'niente da fare';
      }
    } catch (e) {
      stato = 'errore';
      esito = String(e.message).slice(0, 200);
    }
    await db.aggiorna(`lavori/${l.id}`, { stato, esito, fatto: comeData(new Date().toISOString()) });
    log(`Lavoro ${l.tipo}: ${esito}.`);
  }
  return lavori.length;
}

/** Avvia il workflow delle graduatorie per una stagione (serve GH_TOKEN con permesso "actions: write"). */
export async function avviaGraduatorie(stagione) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  if (!repo || !token) throw new Error('si può avviare solo da GitHub');
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/graduatorie.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'cloro' },
    body: JSON.stringify({ ref: 'main', inputs: { stagione } }),
  });
  if (!r.ok) throw new Error(`GitHub ha risposto ${r.status}`);
}
