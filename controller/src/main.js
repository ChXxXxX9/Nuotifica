// Cloro – controllore.
// Gira su GitHub Actions ogni 5 minuti:
// 1. avvisi: legge gli ultimi post del sito degli avvisi, li confronta con quelli già visti,
//    salva i cambiati su Firestore (più un riassunto unico per l'app) e manda le notifiche;
// 2. gare: legge le gare in diretta e aggiorna gare, schede atleta e notifiche dei tempi;
// 3. italia: calendario e risultati ufficiali delle gare di tutta Italia, una gara per giro.
// Gli indirizzi delle fonti arrivano dal secret FONTI (non stanno nel codice, che è pubblico).
//
// Uso:
//   node src/main.js              giro normale (servono FIREBASE_SERVICE_ACCOUNT e FONTI)
//   node src/main.js --anteprima  mostra cosa riconosce negli ultimi post, senza salvare né inviare
import { pathToFileURL } from 'node:url';
import { creaWp } from './wp.js';
import { leggiPost, mappaCategorie, impostaSito } from './parse.js';
import { leggiFonti, scarica } from './fonti.js';
import { aggiornaGare } from './gare.js';
import { aggiornaNazionali } from './nazionali.js';
import { oggiRoma } from './tempi.js';
import {
  confronta, documentoPost, voceIndice, perUtente, messaggiPush,
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
    errori: stato.errori ?? 0,
    messaggio: stato.messaggio ?? '',
  });
}

const POST_NEL_RIASSUNTO = 40;

/** Riassunto unico degli ultimi post: l'app lo legge con una sola lettura invece di 40. */
async function aggiornaRiassunto(db, cambiati, adesso, { daZero = false } = {}) {
  let posts;
  if (daZero) {
    posts = await db.elenca('posts');
  } else {
    posts = (await db.leggi('meta/avvisi'))?.posts ?? [];
    const nuovi = new Map(cambiati.map((p) => [String(p.id), p]));
    posts = [...posts.filter((p) => !nuovi.has(String(p.id))), ...nuovi.values()];
  }
  const tempo = (v) => new Date(v ?? 0).getTime();
  posts = posts
    .map((p) => ({ ...p, id: String(p.id) }))
    .sort((a, b) => tempo(b.ultimoCambio) - tempo(a.ultimoCambio))
    .slice(0, POST_NEL_RIASSUNTO)
    .map((p) => ({
      ...p,
      data: comeData(p.data),
      modificato: comeData(p.modificato),
      ultimoCambio: comeData(p.ultimoCambio),
      novita: p.novita ? { ...p.novita, quando: comeData(p.novita.quando) } : null,
      file: (p.file ?? []).map((f) => ({ ...f, aggiuntoIl: comeData(f.aggiuntoIl) })),
    }));
  await db.scrivi('meta/avvisi', { posts, aggiornato: comeData(adesso) });
}

/** Manda le notifiche agli utenti interessati. */
export async function avvisa({ db, invio, cambi, sito, log = console.log }) {
  const utenti = await db.elenca('users');
  const daAvvisare = [];
  for (const utente of utenti) {
    if (utente.pushOn === false || !utente.tokens?.length) continue;
    const loro = cambi.map((c) => perUtente(utente, c)).filter(Boolean);
    if (loro.length) daAvvisare.push({ utente, loro });
  }

  const conteggi = { push: 0, errori: 0 };
  await inParallelo(daAvvisare, 8, async ({ utente, loro }) => {
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
  });
  log(`Avvisati ${daAvvisare.length} utenti: ${conteggi.push} notifiche, ${conteggi.errori} errori.`);
  return conteggi;
}

/** Un giro completo del controllore. */
export async function controlla({ wp, db, invio, sito, adesso = new Date().toISOString(), log = console.log }) {
  const indice = (await db.leggi('meta/indice')) ?? {};
  indice.posts ??= {};

  // Controllo rapido: una sola richiesta piccola. Se l'ultimo post modificato è lo stesso
  // della volta scorsa, il sito non è cambiato e ci fermiamo qui (leggero per il sito FIN).
  let firma = null;
  try {
    const ultima = await wp.ultimaModifica();
    firma = ultima ? `${ultima.id}@${ultima.modificato}` : null;
  } catch (e) {
    throw new ErroreSito(e.message);
  }
  // Il riassunto per l'app si crea una volta sola con tutti i post già salvati.
  if (indice.avviato && indice.riassunto !== 1) {
    await aggiornaRiassunto(db, [], adesso, { daZero: true });
    indice.riassunto = 1;
    await db.scrivi('meta/indice', { ...indice, aggiornato: comeData(adesso) });
  }
  if (indice.avviato && firma && indice.firma === firma) {
    await scriviStato(db, { adesso, esito: 'ok', messaggio: 'Nessuna novità.' });
    log('Nessuna novità (controllo rapido).');
    return { avvio: false, rapido: true, cambi: [], scritture: 0 };
  }

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
    await aggiornaRiassunto(db, scritture.map((x) => x.dati), adesso);
    await db.scrivi('meta/indice', {
      posts: indice.posts, avviato: true, firma, riassunto: 1, aggiornato: comeData(adesso),
    });
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

  let conteggi = { push: 0, errori: 0 };
  if (scritture.length) {
    await db.scriviTanti(scritture);
    await aggiornaRiassunto(db, scritture.map((x) => x.dati), adesso);
  }
  if (cambi.length) {
    conteggi = await avvisa({ db, invio, cambi, sito, log });
  }
  if (scritture.length || indice.firma !== firma) {
    potaIndice(indice, adesso);
    await db.scrivi('meta/indice', {
      posts: indice.posts, avviato: true, firma, riassunto: indice.riassunto ?? 1, aggiornato: comeData(adesso),
    });
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

// Tetto di sicurezza: il piano gratuito di Firestore permette 20.000 scritture al giorno.
const TETTO_SCRITTURE = 15_000;

async function principale() {
  const fonti = leggiFonti();
  if (!fonti.avvisi) {
    throw new Error('Manca il secret FONTI (Settings → Secrets and variables → Actions): vedi il README.');
  }
  impostaSito(fonti.avvisi);
  const wp = creaWp({ base: fonti.avvisi });
  if (process.argv.includes('--anteprima')) {
    await anteprima(wp);
    return;
  }

  const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
  const progetto = account.project_id;
  const sito = (process.env.SITO_URL || `https://${progetto}.web.app`).replace(/\/+$/, '');
  const chiamaGoogle = creaClientGoogle(creaGestoreToken(account));
  const db = creaFirestore(chiamaGoogle, progetto);
  const invio = creaInvio({ chiamaGoogle, progetto });

  const adesso = new Date().toISOString();
  const giorno = oggiRoma(adesso);
  const budget = (await db.leggi('meta/budget')) ?? {};
  const giaScritte = budget.giorno === giorno ? (budget.scritture ?? 0) : 0;
  const giaLette = budget.giorno === giorno ? (budget.letture ?? 0) : 0;
  let errore = null;

  // 1. Avvisi.
  try {
    await controlla({ wp, db, invio, sito, adesso });
  } catch (e) {
    if (e instanceof ErroreSito) {
      // Sito momentaneamente giù: non è un nostro errore, riproviamo al prossimo giro.
      console.log(`Sito degli avvisi non raggiungibile, riprovo al prossimo giro: ${e.message}`);
      await scriviStato(db, { adesso, esito: 'sito-non-raggiungibile', messaggio: e.message }).catch(() => {});
    } else {
      await scriviStato(db, { adesso, esito: 'errore', messaggio: String(e.message).slice(0, 900) }).catch(() => {});
      errore = e;
    }
  }

  // 2. Gare in diretta (un problema qui non deve fermare gli avvisi, e viceversa).
  try {
    const esito = await aggiornaGare({
      db, fonti, scarica, invio, sito, adesso,
      puoScrivere: () => giaScritte + db.conta.scritture < TETTO_SCRITTURE,
    });
    if (!esito.saltato) console.log(`Gare: ${JSON.stringify(esito)}`);
    // Quando succede qualcosa, un riassunto compare anche tra le annotazioni della corsa.
    if (process.env.GITHUB_ACTIONS && (esito.gare || esito.nuoviTempi)) {
      console.log(`::notice title=Gare::sedi lette ${esito.sedi}, gare aggiornate ${esito.gare}, `
        + `atleti ${esito.atleti}, tempi nuovi ${esito.nuoviTempi}, notifiche ${esito.push ?? 0} `
        + `(Firestore: ${db.conta.letture} letture, ${db.conta.scritture} scritture)`);
    }
  } catch (e) {
    console.log(`::warning title=Gare::${String(e.message).slice(0, 500)}`);
  }

  // 3. Gare di tutta Italia (calendario e risultati a gara finita), una gara per giro.
  try {
    const esito = await aggiornaNazionali({
      db, fonti, scarica, adesso,
      puoScrivere: () => giaScritte + db.conta.scritture < TETTO_SCRITTURE - 2_000,
    });
    if (!esito.saltato) console.log(`Italia: ${JSON.stringify(esito)}`);
    if (process.env.GITHUB_ACTIONS && esito.lette) {
      console.log(`::notice title=Italia::gare lette ${esito.lette}, schede aggiornate ${esito.atleti}`);
    }
  } catch (e) {
    console.log(`::warning title=Italia::${String(e.message).slice(0, 500)}`);
  }

  await db.scrivi('meta/budget', {
    giorno,
    scritture: giaScritte + db.conta.scritture + 1,
    letture: giaLette + db.conta.letture,
  }).catch(() => {});
  console.log(`Firestore in questo giro: ${db.conta.letture} letture, ${db.conta.scritture} scritture `
    + `(oggi ${giaScritte + db.conta.scritture} scritture).`);
  if (errore) throw errore;
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
