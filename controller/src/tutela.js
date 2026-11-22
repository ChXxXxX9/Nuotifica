// Tutela di atleti e iscritti (adeguamento legale, parte B). Documenti che leggono solo l'admin e il controllore:
//   richiestePrivacy/{id}          "Sei questo atleta o un suo genitore?" (l'admin le gestisce in Admin → Richieste)
//   richiestePrivacyFoto/{id}      la foto della tessera della richiesta: si cancella 30 giorni dopo la chiusura
//   privato/segnali                { daFare }: l'admin ha deciso qualcosa su un segnale, da eseguire
//   privato/segnali/utenti/{uid}   account che seguono molti atleti sotto i 14 anni di società diverse
//   meta/manutenzione              quando sono stati fatti i lavori di ogni giorno, mese e stagione
//   meta/inattivi                  account non usati da quasi 3 anni già avvisati
//   privato/inattivi/account/{uid} account inattivi senza notifiche: l'avviso lo manda l'admin per email
import { comeData } from './firestore.js';
import { tokensAttivi } from './invio.js';
import { sotto14 } from './testi.js';
import { stagioneDi } from './categorie.js';

export const SOGLIA_ATLETI = 5;
export const SOGLIA_SOCIETA = 3;
const GIORNO = 86_400_000;
// "I dati usati per la verifica li cancelliamo entro 30 giorni dalla chiusura": si fa al 29° giorno.
const GIORNI_DATI_VERIFICA = 29;
const MESI_AVVISO = 35;
const MESI_ELIMINA = 36;
const MESI_CONSIGLI = 24;
// Richieste privacy ripulite (stato, tipo e date): si cancellano del tutto 3 anni dopo la chiusura.
const MESI_RICHIESTE = 36;
const VECCHIE_AL_GIORNO = 4000;

const auth = (progetto) => `https://identitytoolkit.googleapis.com/v1/projects/${progetto}/accounts`;

/** Mesi interi passati da `da` ad `a` (date o millisecondi). */
export function mesiTra(da, a) {
  const x = new Date(da);
  const y = new Date(a);
  let mesi = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
  if (y.getUTCDate() < x.getUTCDate()) mesi--;
  return mesi;
}

/** La stessa data `mesi` mesi prima. */
const mesiPrima = (adesso, mesi) => {
  const d = new Date(adesso);
  d.setUTCMonth(d.getUTCMonth() - mesi);
  return d;
};

async function adminUid(db) {
  return (await db.leggi('meta/admin'))?.uid ?? null;
}

async function pushUtente({
  db, invio, uid, messaggio,
}) {
  const u = await db.leggi(`users/${uid}`);
  let n = 0;
  for (const token of tokensAttivi(u)) if (await invio.push(token, messaggio) === 'ok') n++;
  return n;
}

/* ---------- B1: richieste "Sei questo atleta o un suo genitore?" ---------- */

/** Richieste appena arrivate: una notifica all'admin (senza nomi) e si segnano come avvisate. */
export async function avvisaRichieste({
  db, invio, sito, log = console.log,
}) {
  const nuove = await db.dove('richiestePrivacy', 'avvisato', false);
  if (!nuove.length) return 0;
  for (const r of nuove) await db.aggiorna(`richiestePrivacy/${r.id}`, { avvisato: true });
  const uid = await adminUid(db);
  const n = uid ? await pushUtente({
    db,
    invio,
    uid,
    messaggio: {
      titolo: nuove.length === 1 ? 'Nuova richiesta su una scheda' : `${nuove.length} nuove richieste sulle schede`,
      corpo: 'Da verificare in Admin → Richieste.',
      url: `${sito}/#/admin?sez=richieste`,
      tag: 'richieste-privacy',
    },
  }) : 0;
  log(`Richieste privacy nuove: ${nuove.length} (${n} notifiche all'admin).`);
  return nuove.length;
}

/**
 * Richieste chiuse da 29 giorni: restano solo stato, tipo e date (i dati della verifica, foto compresa, si
 * cancellano). Le richieste ripulite si cancellano del tutto 3 anni dopo la chiusura (registro e procedura
 * delle richieste).
 */
export async function ripulisciRichieste({ db, adesso, log = console.log }) {
  const limite = new Date(adesso).getTime() - GIORNI_DATI_VERIFICA * GIORNO;
  const fine = mesiPrima(adesso, MESI_RICHIESTE).getTime();
  let n = 0;
  const vecchie = [];
  for (const r of await db.elenca('richiestePrivacy')) {
    if (r.ripulita && r.chiusa && new Date(r.chiusa).getTime() <= fine) {
      vecchie.push(r.id);
      continue;
    }
    if (r.ripulita || !r.chiusa || new Date(r.chiusa).getTime() > limite) continue;
    await db.scrivi(`richiestePrivacy/${r.id}`, {
      stato: r.stato ?? '', tipo: r.tipo ?? '', creato: comeData(r.creato), chiusa: comeData(r.chiusa), ripulita: true, avvisato: true,
    });
    await db.elimina(`richiestePrivacyFoto/${r.id}`);
    n++;
  }
  if (vecchie.length) {
    await db.eliminaTanti(vecchie.flatMap((id) => [`richiestePrivacy/${id}`, `richiestePrivacyFoto/${id}`]));
    log(`Richieste privacy chiuse da più di 3 anni cancellate: ${vecchie.length}.`);
  }
  if (n) log(`Richieste privacy: dati di verifica cancellati da ${n} richieste chiuse.`);
  return n;
}

const APERTA = new Set(['nuova', 'in-attesa']);

/**
 * Foto delle tessere: restano finché la richiesta è aperta e fino a 30 giorni dopo la chiusura (al 29° giorno
 * le cancella ripulisciRichieste con gli altri dati). Qui il controllo di sicurezza: foto di richieste chiuse da
 * più di 29 giorni o già ripulite, e foto rimaste senza richiesta.
 */
export async function cancellaFotoChiuse({ db, adesso = new Date().toISOString(), log = console.log }) {
  const ids = [];
  for (;;) {
    const pagina = await db.nomi('richiestePrivacyFoto', 300);
    const nuovi = pagina.filter((id) => !ids.includes(id));
    ids.push(...nuovi);
    if (pagina.length < 300 || !nuovi.length) break;
  }
  if (!ids.length) return 0;
  const richieste = await db.leggiTanti(ids.map((id) => `richiestePrivacy/${id}`));
  const limite = new Date(adesso).getTime() - GIORNI_DATI_VERIFICA * GIORNO;
  const via = ids.filter((id) => {
    const r = richieste.get(`richiestePrivacy/${id}`);
    if (!r || r.ripulita) return true;
    if (APERTA.has(r.stato)) return false;
    return !r.chiusa || new Date(r.chiusa).getTime() <= limite;
  });
  if (via.length) {
    await db.eliminaTanti(via.map((id) => `richiestePrivacyFoto/${id}`));
    log(`Foto di richieste chiuse cancellate: ${via.length}.`);
  }
  return via.length;
}

/* ---------- B3: segnali sugli account ---------- */

/**
 * Una volta al giorno: chi segue almeno 5 atleti sotto i 14 anni di almeno 3 società diverse diventa un
 * segnale da controllare. Chi è già stato valutato torna "da vedere" solo se ne segue di più.
 */
export async function calcolaSegnali({
  db, rtdb, adesso, log = console.log,
}) {
  const oggi = adesso.slice(0, 10);
  const st = stagioneDi(oggi);
  const admin = new Set((await db.elenca('admin')).map((a) => a.id));
  const utenti = (await db.elenca('users')).filter((u) => !admin.has(u.id) && (u.seguiti ?? []).length >= SOGLIA_ATLETI);
  const schede = new Map();
  const scheda = async (k) => {
    if (schede.has(k)) return schede.get(k);
    let a = null;
    if (rtdb) {
      const [i, ora, prima] = await Promise.all([`a/${k}/i`, `a/${k}/s${st}`, `a/${k}/s${st - 1}`]
        .map((p) => rtdb.leggi(p).catch(() => null)));
      if (i) {
        const [n, y] = String(i).split('|');
        a = { n, y: Number(y) || null, s: String(ora ?? prima ?? '').split('~')[0].split('|')[0] };
      }
    }
    if (!a) {
      const d = await db.leggi(`atleti/${k}`).catch(() => null);
      if (d) a = { n: d.n ?? k, y: Number(d.y) || null, s: d.s ?? '' };
    }
    a ??= { n: k, y: Number(String(k).match(/-(\d{4})$/)?.[1]) || null, s: '' };
    schede.set(k, a);
    return a;
  };
  const esistenti = new Map((await db.elenca('privato/segnali/utenti')).map((d) => [d.id, d]));
  const trovati = new Set();
  let nuovi = 0;
  for (const u of utenti) {
    const giovani = [];
    for (const k of u.seguiti) {
      const a = await scheda(k);
      if (sotto14(a.y, oggi)) giovani.push(a);
    }
    const societa = new Set(giovani.map((a) => a.s).filter(Boolean));
    if (giovani.length < SOGLIA_ATLETI || societa.size < SOGLIA_SOCIETA) continue;
    trovati.add(u.id);
    const dati = {
      n: giovani.length, m: societa.size, atleti: giovani.map(({ n, y, s }) => ({ n, y, s })), data: comeData(adesso),
    };
    const ex = esistenti.get(u.id);
    if (!ex) {
      await db.scrivi(`privato/segnali/utenti/${u.id}`, { ...dati, stato: 'da-vedere', creato: comeData(adesso) });
      nuovi++;
    } else if (ex.stato === 'da-vedere') {
      if (ex.n !== dati.n || ex.m !== dati.m) await db.aggiorna(`privato/segnali/utenti/${u.id}`, dati);
    } else if (['ignorato', 'avvisato', 'riattivato'].includes(ex.stato) && dati.n > (ex.decisione?.n ?? ex.n ?? 0)) {
      await db.aggiorna(`privato/segnali/utenti/${u.id}`, { ...dati, stato: 'da-vedere', riaperto: comeData(adesso) });
      nuovi++;
    }
  }
  // Chi non supera più la soglia ed era ancora da vedere: il segnale non c'è più.
  for (const [uid, ex] of esistenti) {
    if (!trovati.has(uid) && ex.stato === 'da-vedere') await db.elimina(`privato/segnali/utenti/${uid}`);
  }
  if (nuovi) {
    const uid = await adminUid(db);
    log(`Segnali sugli account: ${nuovi} da controllare.`);
    return { nuovi, uid };
  }
  return { nuovi: 0 };
}

/** Elimina un account: Consigli, profilo e accesso (per "Chiudi" e per gli account inattivi). */
export async function eliminaUtente({
  db, chiamaGoogle, progetto, uid,
}) {
  for (;;) {
    const consigli = await db.dove('consigli', 'uid', uid);
    if (!consigli.length) break;
    await db.eliminaTanti(consigli.map((c) => `consigli/${c.id}`));
    if (consigli.length < 50) break;
  }
  await db.elimina(`users/${uid}`);
  try {
    await chiamaGoogle(`${auth(progetto)}:delete`, { method: 'POST', body: { localId: uid } });
  } catch (e) {
    if (!/USER_NOT_FOUND/.test(e.message)) throw e;
  }
}

/** Sospende un account: accesso disattivato, sessioni chiuse, niente più notifiche. */
export async function sospendiUtente({
  db, chiamaGoogle, progetto, uid, attiva = false,
}) {
  await chiamaGoogle(`${auth(progetto)}:update`, {
    method: 'POST',
    body: attiva ? { localId: uid, disableUser: false } : { localId: uid, disableUser: true, validSince: String(Math.floor(Date.now() / 1000)) },
  });
  if (!attiva) await db.aggiorna(`users/${uid}`, { tokens: [] }).catch(() => {});
}

export const AVVISO_SEGNALE = {
  titolo: 'Un messaggio da Cloro',
  corpo: 'Ti ricordiamo le regole d\'uso: Cloro serve a seguire i risultati, non a contattare gli atleti. Tocca per leggerle.',
};

/** Le decisioni dell'admin sui segnali (Avviso, Sospendi, Chiudi, Riattiva): si eseguono al giro dopo. */
export async function eseguiSegnali({
  db, invio, sito, chiamaGoogle, progetto, adesso, log = console.log,
}) {
  const segno = await db.leggi('privato/segnali');
  if (!segno?.daFare) return 0;
  await db.scrivi('privato/segnali', { daFare: false, aggiornato: comeData(adesso) });
  let fatti = 0;
  let errori = 0;
  for (const s of await db.elenca('privato/segnali/utenti')) {
    try {
      let nuovo = null;
      const extra = {};
      if (s.stato === 'avviso-da-mandare') {
        extra.consegnato = await pushUtente({
          db, invio, uid: s.id, messaggio: { ...AVVISO_SEGNALE, url: `${sito}/#/termini`, tag: 'avviso-account' },
        });
        nuovo = 'avvisato';
      } else if (s.stato === 'da-sospendere') {
        await sospendiUtente({
          db, chiamaGoogle, progetto, uid: s.id,
        });
        nuovo = 'sospeso';
      } else if (s.stato === 'da-riattivare') {
        await sospendiUtente({
          db, chiamaGoogle, progetto, uid: s.id, attiva: true,
        });
        nuovo = 'riattivato';
      } else if (s.stato === 'da-chiudere') {
        await eliminaUtente({
          db, chiamaGoogle, progetto, uid: s.id,
        });
        nuovo = 'chiuso';
        extra.atleti = [];
      }
      if (!nuovo) continue;
      await db.aggiorna(`privato/segnali/utenti/${s.id}`, { stato: nuovo, eseguito: comeData(adesso), ...extra });
      fatti++;
      log(`Segnale: decisione eseguita (${nuovo}).`);
    } catch (e) {
      errori++;
      log(`Segnale: decisione non eseguita (${String(e.message).slice(0, 200)}), si riprova.`);
    }
  }
  if (errori) await db.scrivi('privato/segnali', { daFare: true, aggiornato: comeData(adesso) });
  return fatti;
}

/* ---------- B4: account non usati ---------- */

export const AVVISO_INATTIVO = {
  titolo: 'Il tuo account Cloro',
  corpo: 'Non lo usi da quasi 3 anni. Se non lo apri entro 30 giorni verrà eliminato.',
};
const INATTIVI = 'privato/inattivi/account';

/**
 * Una volta al mese: chi non usa Cloro da 35 mesi riceve un avviso (una volta). Chi non ha le notifiche
 * attive va in Admin → Inattivi (privato/inattivi/account/{uid}, con la sua email): l'avviso lo manda l'admin
 * per email e lo segna come mandato. Da 36 mesi, e almeno 30 giorni dopo l'avviso, l'account si elimina; senza
 * avviso mai.
 */
export async function controllaInattivi({
  db, invio, sito, chiamaGoogle, progetto, adesso, log = console.log,
}) {
  const ora = new Date(adesso);
  const meta = (await db.leggi('meta/inattivi')) ?? {};
  const avvisati = meta.avvisati ?? {};
  // Vecchio formato (solo la data).
  for (const [uid, x] of Object.entries(avvisati)) if (typeof x === 'string') avvisati[uid] = { il: x };
  const admin = new Set((await db.elenca('admin')).map((a) => a.id));
  const visti = new Set();
  let avvisi = 0;
  let perEmail = 0;
  let tolti = 0;
  let pagina = '';
  const togliScheda = (uid) => (avvisati[uid]?.email ? db.elimina(`${INATTIVI}/${uid}`) : null);
  do {
    const r = await chiamaGoogle(`${auth(progetto)}:batchGet?maxResults=500${pagina ? `&nextPageToken=${encodeURIComponent(pagina)}` : ''}`);
    for (const u of r?.users ?? []) {
      const uid = u.localId;
      visti.add(uid);
      if (admin.has(uid)) continue;
      const ultimo = Math.max(Number(u.lastLoginAt) || 0, Date.parse(u.lastRefreshAt ?? '') || 0, Number(u.createdAt) || 0);
      if (!ultimo) continue;
      const mesi = mesiTra(ultimo, ora);
      if (mesi < MESI_AVVISO) {
        // È tornato: si dimentica l'avviso.
        if (avvisati[uid]) {
          await togliScheda(uid);
          delete avvisati[uid];
        }
        continue;
      }
      if (!avvisati[uid]) {
        const n = await pushUtente({
          db, invio, uid, messaggio: { ...AVVISO_INATTIVO, url: `${sito}/#/`, tag: 'account-inattivo' },
        });
        if (n) {
          avvisati[uid] = { il: adesso, notifiche: n };
        } else {
          // Nessun dispositivo con le notifiche: l'avviso lo manda l'admin per email.
          avvisati[uid] = { il: null, email: true };
          await db.scrivi(`${INATTIVI}/${uid}`, {
            email: u.email ?? '', ultimo: comeData(new Date(ultimo).toISOString()), stato: 'da-avvisare', creato: comeData(adesso),
          });
          perEmail++;
        }
        avvisi++;
        continue;
      }
      const av = avvisati[uid];
      if (av.email && !av.il) {
        const scheda = await db.leggi(`${INATTIVI}/${uid}`);
        if (scheda?.mandata) av.il = new Date(scheda.mandata).toISOString();
      }
      if (mesi >= MESI_ELIMINA && av.il && ora - new Date(av.il) >= 30 * GIORNO) {
        await eliminaUtente({
          db, chiamaGoogle, progetto, uid,
        });
        await togliScheda(uid);
        delete avvisati[uid];
        tolti++;
      }
    }
    pagina = r?.nextPageToken ?? '';
  } while (pagina);
  for (const uid of Object.keys(avvisati)) {
    if (visti.has(uid)) continue;
    await togliScheda(uid);
    delete avvisati[uid];
  }
  await db.scrivi('meta/inattivi', { avvisati, controllato: comeData(adesso) });
  if (perEmail) {
    const uid = await adminUid(db);
    if (uid) {
      await pushUtente({
        db,
        invio,
        uid,
        messaggio: {
          titolo: 'Account da avvisare per email',
          corpo: `${perEmail === 1 ? 'Un account non usato' : `${perEmail} account non usati`} da quasi 3 anni senza notifiche: scrivigli da Admin → Inattivi.`,
          url: `${sito}/#/admin?sez=inattivi`,
          tag: 'inattivi',
        },
      });
    }
  }
  log(`Account inattivi: ${avvisi} avvisati (${perEmail} da avvisare per email), ${tolti} eliminati.`);
  return { avvisi, perEmail, tolti };
}

/* ---------- B5: conservazione ---------- */

/** Consigli più vecchi di 24 mesi. */
export async function pulisciConsigliVecchi({ db, adesso, log = console.log }) {
  const limite = mesiPrima(adesso, MESI_CONSIGLI).getTime();
  const vecchi = (await db.elenca('consigli', { campi: ['creato'] }))
    .filter((c) => c.creato && new Date(c.creato).getTime() < limite).map((c) => `consigli/${c.id}`);
  if (vecchi.length) await db.eliminaTanti(vecchi);
  log(`Consigli più vecchi di ${MESI_CONSIGLI} mesi cancellati: ${vecchi.length}.`);
  return vecchi.length;
}

/**
 * A stagione nuova: il testo dei PDF letti prima dell'inizio della stagione si cancella. Nell'elenco dei
 * fatti restano segnati, così non si rileggono.
 */
export async function pulisciTestiStagione({ db, adesso, log = console.log }) {
  const inizio = `${stagioneDi(adesso.slice(0, 10))}-09-01`;
  const vecchi = (await db.elenca('testi', { campi: ['agg'] })).filter((t) => !t.agg || new Date(t.agg).toISOString().slice(0, 10) < inizio);
  if (!vecchi.length) return 0;
  await db.eliminaTanti(vecchi.map((t) => `testi/${t.id}`));
  const stato = (await db.leggi('meta/testi')) ?? {};
  stato.fatti ??= {};
  for (const t of vecchi) if (stato.fatti[t.id]) stato.fatti[t.id] = `tolto ${adesso}`;
  await db.scrivi('meta/testi', stato);
  log(`Testi dei documenti della stagione passata cancellati: ${vecchi.length}.`);
  return vecchi.length;
}

/** Vecchie copie non più usate (indici, pacchi, cerca, meta/atleti-noti): un po' per volta. */
export async function pulisciVecchieRaccolte({ db, massimo = 600, log = console.log }) {
  const live = await db.leggi('meta/live');
  // Il vecchio indice serve ancora solo se la migrazione alla ricerca nuova non è stata fatta.
  const migrato = live?.indiceV === 3;
  const raccolte = ['pacchi', 'cerca', ...(migrato ? ['indici'] : [])];
  let tolti = 0;
  for (const r of raccolte) {
    while (tolti < massimo) {
      const nomi = await db.nomi(r, Math.min(300, massimo - tolti));
      if (!nomi.length) break;
      await db.eliminaTanti(nomi.map((id) => `${r}/${id}`));
      tolti += nomi.length;
    }
  }
  const finito = tolti < massimo;
  if (finito && migrato) await db.elimina('meta/atleti-noti');
  if (tolti) log(`Vecchie copie cancellate: ${tolti} documenti${finito ? ' (finito)' : ''}.`);
  return { tolti, finito };
}

/* ---------- tutto insieme, a ogni giro ---------- */

export async function tutela({
  db, rtdb, invio, sito, chiamaGoogle, progetto, adesso, log = console.log,
}) {
  const esito = {};
  const prova = async (nome, fn) => {
    try {
      esito[nome] = await fn();
      return true;
    } catch (e) {
      log(`::warning title=Tutela (${nome})::${String(e.message).slice(0, 300)}`);
      return false;
    }
  };
  // A ogni giro: richieste nuove e decisioni sui segnali.
  await prova('richieste', () => avvisaRichieste({
    db, invio, sito, log,
  }));
  await prova('decisioni', () => eseguiSegnali({
    db, invio, sito, chiamaGoogle, progetto, adesso, log,
  }));

  const m = (await db.leggi('meta/manutenzione')) ?? {};
  const prima = JSON.stringify(m);
  const oggi = adesso.slice(0, 10);
  if (m.giorno !== oggi) {
    const ok = await prova('segnali', async () => {
      const r = await calcolaSegnali({
        db, rtdb, adesso, log,
      });
      if (r.nuovi && r.uid) {
        await pushUtente({
          db,
          invio,
          uid: r.uid,
          messaggio: {
            titolo: 'Account da controllare', corpo: 'Da vedere in Admin → Segnali.', url: `${sito}/#/admin?sez=segnali`, tag: 'segnali',
          },
        });
      }
      return r.nuovi;
    });
    const ok2 = await prova('verifiche', () => ripulisciRichieste({ db, adesso, log }));
    const ok3 = await prova('foto', () => cancellaFotoChiuse({ db, adesso, log }));
    if (ok && ok2 && ok3) m.giorno = oggi;
  }
  if (m.mese !== oggi.slice(0, 7)) {
    const ok = await prova('inattivi', () => controllaInattivi({
      db, invio, sito, chiamaGoogle, progetto, adesso, log,
    }));
    const ok2 = await prova('consigli', () => pulisciConsigliVecchi({ db, adesso, log }));
    if (ok && ok2) m.mese = oggi.slice(0, 7);
  }
  const st = stagioneDi(oggi);
  if (m.stagione !== st && await prova('testi', () => pulisciTestiStagione({ db, adesso, log }))) m.stagione = st;
  if (!m.vecchieFinite) {
    if (m.vecchieGiorno !== oggi) {
      m.vecchieGiorno = oggi;
      m.vecchieOggi = 0;
    }
    if (m.vecchieOggi < VECCHIE_AL_GIORNO) {
      await prova('vecchie', async () => {
        const r = await pulisciVecchieRaccolte({ db, massimo: Math.min(600, VECCHIE_AL_GIORNO - m.vecchieOggi), log });
        m.vecchieOggi += r.tolti;
        if (r.finito) m.vecchieFinite = true;
        return r.tolti;
      });
    }
  }
  if (JSON.stringify(m) !== prima) await db.scrivi('meta/manutenzione', m);
  return esito;
}
