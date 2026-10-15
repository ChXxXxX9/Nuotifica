// Nuotifica – controllore.
// Gira su GitHub Actions ogni 15 minuti:
// 1. legge gli ultimi post del sito finlazio.it (API WordPress pubbliche);
// 2. li confronta con quelli già visti (indice su Firestore);
// 3. salva i post cambiati su Firestore (l'app li mostra da lì);
// 4. avvisa con push ed email chi è interessato.
//
// Uso:
//   node src/main.js              giro normale (serve FIREBASE_SERVICE_ACCOUNT)
//   node src/main.js --anteprima  mostra cosa riconosce negli ultimi post, senza salvare né inviare
import { pathToFileURL } from 'node:url';
import { creaWp } from './wp.js';
import { leggiPost, mappaCategorie } from './parse.js';
import {
  confronta, documentoPost, voceIndice, perUtente, messaggiPush, costruisciEmail,
} from './logica.js';
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore, comeData } from './firestore.js';
import { creaInvio, inParallelo } from './invio.js';
import {
  PER_PAGINA, MAX_PAGINE, POST_INIZIALI, GIORNI_INDICE, NOMI_TIPI, SETTORI,
} from './config.js';

class ErroreSito extends Error {}

/** Post da esaminare: i più recenti per data di modifica e per data di pubblicazione. */
export async function postRecenti(wp, indice) {
  const perId = new Map();
  for (const ordine of ['modified', 'date']) {
    for (let pagina = 1; pagina <= MAX_PAGINE; pagina++) {
      let posts;
      try {
        posts = await wp.paginaPost(ordine, pagina);
      } catch (e) {
        throw new ErroreSito(e.message);
      }
      let cambiati = 0;
      for (const p of posts) {
        if (!perId.has(p.id)) perId.set(p.id, p);
        const prev = indice.posts[String(p.id)];
        const modificato = p.modified_gmt ? new Date(`${p.modified_gmt}Z`).toISOString() : null;
        if (!prev || prev.m !== modificato) cambiati++;
      }
      // Se in questa pagina c'è anche un solo post già visto, le pagine dopo sono più vecchie: ci fermiamo.
      if (posts.length < PER_PAGINA || cambiati < posts.length) break;
    }
  }
  return [...perId.values()];
}

function potaIndice(indice, adesso) {
  const limite = new Date(adesso).getTime() - GIORNI_INDICE * 86_400_000;
  for (const [id, voce] of Object.entries(indice.posts)) {
    if (!voce?.m || new Date(voce.m).getTime() < limite) delete indice.posts[id];
  }
}

async function scriviStato(db, stato) {
  await db.scrivi('meta/stato', {
    ultimoControllo: comeData(stato.adesso),
    esito: stato.esito,
    postCambiati: stato.postCambiati ?? 0,
    push: stato.push ?? 0,
    email: stato.email ?? 0,
    errori: stato.errori ?? 0,
    messaggio: stato.messaggio ?? '',
  });
}

/** Manda gli avvisi agli utenti interessati. */
export async function avvisa({ db, invio, cambi, sito, log = console.log }) {
  const utenti = await db.elenca('users');
  const daAvvisare = [];
  for (const utente of utenti) {
    const loro = cambi.map((c) => perUtente(utente, c)).filter(Boolean);
    if (loro.length) daAvvisare.push({ utente, loro });
  }

  let verificati = new Set();
  const perEmail = daAvvisare.filter(({ utente }) => utente.emailOn && utente.email);
  if (perEmail.length && invio.emailAttive) {
    try {
      verificati = await invio.emailVerificate(perEmail.map(({ utente }) => utente.id));
    } catch (e) {
      log(`Verifica email non riuscita: ${e.message}`);
    }
  }

  const conteggi = { push: 0, email: 0, errori: 0 };
  await inParallelo(daAvvisare, 8, async ({ utente, loro }) => {
    if (utente.pushOn && utente.tokens?.length) {
      const messaggi = messaggiPush(loro, sito);
      const nonValidi = new Set();
      for (const token of utente.tokens) {
        for (const m of messaggi) {
          const esito = await invio.push(token, m);
          if (esito === 'ok') conteggi.push++;
          else if (esito === 'token-non-valido') { nonValidi.add(token); break; } else conteggi.errori++;
        }
      }
      if (nonValidi.size) {
        try {
          await db.aggiorna(`users/${utente.id}`, {
            tokens: utente.tokens.filter((t) => !nonValidi.has(t)),
          });
        } catch (e) {
          log(`Pulizia token non riuscita per ${utente.id}: ${e.message}`);
        }
      }
    }
    if (utente.emailOn && utente.email && utente.unsubToken && invio.emailAttive && verificati.has(utente.id)) {
      try {
        await invio.email({ a: utente.email, ...costruisciEmail(utente, loro, sito) });
        conteggi.email++;
      } catch (e) {
        conteggi.errori++;
        log(e.message);
      }
    }
  });
  log(`Avvisati ${daAvvisare.length} utenti: ${conteggi.push} push, ${conteggi.email} email, ${conteggi.errori} errori.`);
  return conteggi;
}

/** Un giro completo del controllore. */
export async function controlla({ wp, db, invio, sito, adesso = new Date().toISOString(), log = console.log }) {
  const indice = (await db.leggi('meta/indice')) ?? {};
  indice.posts ??= {};

  let mappa;
  try {
    mappa = mappaCategorie(await wp.categorie());
  } catch (e) {
    throw new ErroreSito(e.message);
  }

  // Primo avvio: memorizza lo stato attuale senza mandare notifiche a nessuno.
  if (!indice.avviato) {
    const grezzi = [];
    for (let pagina = 1; grezzi.length < POST_INIZIALI && pagina <= 10; pagina++) {
      let posts;
      try {
        posts = await wp.paginaPost('modified', pagina, 50);
      } catch (e) {
        throw new ErroreSito(e.message);
      }
      grezzi.push(...posts);
      if (posts.length < 50) break;
    }
    const scritture = [];
    for (const g of grezzi.slice(0, POST_INIZIALI)) {
      const post = leggiPost(g, mappa);
      scritture.push({ percorso: `posts/${post.id}`, dati: documentoPost(post, null, null, adesso) });
      indice.posts[post.id] = voceIndice(post);
    }
    await db.scriviTanti(scritture);
    await db.scrivi('meta/indice', { posts: indice.posts, avviato: true, aggiornato: comeData(adesso) });
    const messaggio = `Primo avvio: memorizzati ${scritture.length} post, nessuna notifica inviata.`;
    await scriviStato(db, { adesso, esito: 'ok', messaggio });
    log(messaggio);
    return { avvio: true, post: scritture.length, cambi: [] };
  }

  const grezzi = await postRecenti(wp, indice);
  const cambi = [];
  const scritture = [];
  for (const g of grezzi) {
    const post = leggiPost(g, mappa);
    let prev = indice.posts[post.id];
    if (prev && prev.m === post.modificato) continue;

    const vecchio = await db.leggi(`posts/${post.id}`);
    // Post uscito dall'indice ma già salvato in passato: confrontiamo con quello.
    if (!prev && vecchio) prev = voceIndice(vecchio);

    const diff = confronta(prev, post);
    const documento = documentoPost(post, vecchio, diff, adesso);
    scritture.push({ percorso: `posts/${post.id}`, dati: documento });
    indice.posts[post.id] = voceIndice(post);
    if (diff) {
      cambi.push({ tipo: diff.tipo, file: diff.file, post });
      log(`${diff.tipo === 'nuovo' ? 'NUOVO' : 'AGGIUNTE'}: ${post.titolo} (${diff.file.length} file)`);
    }
  }

  let conteggi = { push: 0, email: 0, errori: 0 };
  if (scritture.length) {
    await db.scriviTanti(scritture);
  }
  if (cambi.length) {
    conteggi = await avvisa({ db, invio, cambi, sito, log });
  }
  if (scritture.length) {
    potaIndice(indice, adesso);
    await db.scrivi('meta/indice', { posts: indice.posts, avviato: true, aggiornato: comeData(adesso) });
  }
  await scriviStato(db, {
    adesso,
    esito: 'ok',
    postCambiati: cambi.length,
    ...conteggi,
    messaggio: cambi.length ? cambi.map((c) => c.post.titolo).join(' | ').slice(0, 900) : 'Nessuna novità.',
  });
  if (!cambi.length) log(`Nessuna novità (${scritture.length} post rivisti, ${grezzi.length} letti).`);
  return { avvio: false, cambi, scritture: scritture.length, ...conteggi };
}

/** Modalità anteprima: stampa come vengono classificati gli ultimi post. Non servono credenziali. */
export async function anteprima(wp, quanti = 30, log = console.log) {
  const mappa = mappaCategorie(await wp.categorie());
  const posts = await wp.paginaPost('modified', 1, quanti);
  const righe = [];
  for (const g of posts) {
    const p = leggiPost(g, mappa);
    righe.push('', p.titolo);
    righe.push(`  modificato: ${p.modificato}  |  settori: ${p.settori.map((s) => SETTORI[s]).join(', ')}  |  gruppi: ${p.gruppi.join(', ')}`);
    for (const f of p.file) {
      righe.push(`  - [${NOMI_TIPI[f.tipo]}] ${f.etichetta}${f.aggiornato ? '  (AGGIORNATO)' : ''}`);
    }
    if (!p.file.length) righe.push('  (nessun file: avviso/comunicato)');
  }
  log(righe.join('\n'));
  // Su GitHub: anche nel riepilogo della corsa e come annotazione, così si legge senza aprire i log.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Anteprima\n\n\`\`\`\n${righe.join('\n')}\n\`\`\`\n`);
    const testo = righe.join('\n').slice(0, 60_000)
      .replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    log(`::notice title=Anteprima::${testo}`);
  }
}

async function principale() {
  const wp = creaWp();
  if (process.argv.includes('--anteprima')) {
    await anteprima(wp);
    return;
  }

  const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
  const progetto = account.project_id;
  const sito = (process.env.SITO_URL || `https://${progetto}.web.app`).replace(/\/+$/, '');
  const chiamaGoogle = creaClientGoogle(creaGestoreToken(account));
  const db = creaFirestore(chiamaGoogle, progetto);
  const invio = creaInvio({
    chiamaGoogle,
    progetto,
    brevoKey: process.env.BREVO_API_KEY,
    brevoMittente: process.env.BREVO_MITTENTE,
  });
  if (!invio.emailAttive) console.log('Email disattivate: mancano BREVO_API_KEY o BREVO_MITTENTE.');

  const adesso = new Date().toISOString();
  try {
    await controlla({ wp, db, invio, sito, adesso });
  } catch (e) {
    if (e instanceof ErroreSito) {
      // Sito FIN momentaneamente giù: non è un nostro errore, riproviamo al prossimo giro.
      console.log(`Sito non raggiungibile, riprovo al prossimo giro: ${e.message}`);
      await scriviStato(db, { adesso, esito: 'sito-non-raggiungibile', messaggio: e.message }).catch(() => {});
      return;
    }
    await scriviStato(db, { adesso, esito: 'errore', messaggio: String(e.message).slice(0, 900) }).catch(() => {});
    throw e;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principale().catch((e) => {
    console.error(e);
    // Su GitHub l'errore compare anche come annotazione della corsa, leggibile senza aprire i log.
    if (process.env.GITHUB_ACTIONS) {
      const testo = String(e?.message ?? e).slice(0, 4000).replace(/%/g, '%25').replace(/\r?\n/g, '%0A');
      console.log(`::error title=Controllore::${testo}`);
    }
    process.exit(1);
  });
}
