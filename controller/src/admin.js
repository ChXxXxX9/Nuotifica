// Sezione admin: chi gestisce Cloro (l'email sta nel secret ADMIN_EMAIL, non nel codice)
// e gli annunci a tutti gli iscritti scritti dall'app.
import { createHash } from 'node:crypto';
import { comeData } from './firestore.js';
import { inParallelo } from './invio.js';

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
      for (const token of u.tokens) {
        const esito = await invio.push(token, {
          titolo: String(a.titolo ?? 'Cloro').slice(0, 60),
          corpo: String(a.corpo ?? '').slice(0, 180),
          url: `${sito}/#/`,
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
