// Collegamento a Firebase (Auth, Firestore, Cloud Messaging) con l'SDK ufficiale dal CDN di Google.
import { impronta } from './impronta.js';

const V = '12.19.0';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

function inApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function messaggioErrore(e) {
  const codici = {
    'auth/invalid-email': 'L\'indirizzo email non è scritto correttamente.',
    'auth/missing-password': 'Scrivi la password.',
    'auth/weak-password': 'La password deve avere almeno 6 caratteri.',
    'auth/email-already-in-use': 'C\'è già un account con questa email: usa "Ho già un account".',
    'auth/invalid-credential': 'Email o password non corrette.',
    'auth/wrong-password': 'Email o password non corrette.',
    'auth/user-not-found': 'Non c\'è nessun account con questa email.',
    'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
    'auth/user-disabled': 'Account sospeso. Questo account non rispetta i Termini d\'uso. Per chiarimenti scrivi a cloroita@gmail.com.',
    'auth/network-request-failed': 'Connessione assente. Controlla internet e riprova.',
    'auth/popup-closed-by-user': 'Accesso con Google annullato.',
    'auth/cancelled-popup-request': 'Accesso con Google annullato.',
    'auth/requires-recent-login': 'Per sicurezza esci, rientra e ripeti l\'operazione.',
    'auth/unauthorized-domain': 'Questo indirizzo non è autorizzato per l\'accesso (Firebase → Authentication → Impostazioni → Domini autorizzati).',
    'unavailable': 'Connessione assente. Controlla internet e riprova.',
    'permission-denied': 'Operazione non permessa.',
  };
  const err = new Error(codici[e?.code] ?? `Qualcosa non ha funzionato (${e?.code ?? e?.message ?? e}).`);
  err.code = e?.code;
  return err;
}

// Copie sul telefono delle letture dal Realtime Database (il service worker non le cancella).
const COPIE_RTDB = 'cloro-rtdb';

export async function creaBackendFirebase(config) {
  // App Check (reCAPTCHA): solo se c'è la chiave e non in prova sul computer.
  const chiaveAppCheck = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : (config.appCheck?.chiave ?? '');
  const [{ initializeApp }, A, F, AC] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
    chiaveAppCheck ? import(`${CDN}/firebase-app-check.js`).catch(() => null) : null,
  ]);
  const app = initializeApp(config.firebase);
  // Prima di Auth e Firestore: così anche le loro richieste portano il "gettone" di App Check.
  let appCheck = null;
  if (AC) {
    try {
      appCheck = AC.initializeAppCheck(app, {
        provider: config.appCheck.enterprise ? new AC.ReCaptchaEnterpriseProvider(chiaveAppCheck) : new AC.ReCaptchaV3Provider(chiaveAppCheck),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      appCheck = null;
    }
  }
  /** Intestazione per le letture dal Realtime Database (fatte senza SDK). */
  const intestazioniAppCheck = async () => {
    if (!appCheck) return {};
    try {
      const { token } = await AC.getToken(appCheck, false);
      return token ? { 'X-Firebase-AppCheck': token } : {};
    } catch {
      return {};
    }
  };
  const auth = A.getAuth(app);
  auth.languageCode = 'it';
  // Copia dei dati sul telefono (IndexedDB): le pagine già viste si riaprono subito, anche offline.
  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentSingleTabManager() }),
    });
  } catch {
    db = F.getFirestore(app);
  }

  /**
   * Legge un documento: se c'è la copia sul telefono risponde subito con quella e intanto chiede
   * la versione fresca; se è diversa la passa a `fresco`. Senza copia aspetta la rete.
   */
  async function leggiVeloce(rif, trasforma, fresco) {
    const dati = (snap) => (snap.exists() ? trasforma(snap) : null);
    let copia;
    try {
      copia = dati(await F.getDocFromCache(rif));
    } catch { /* niente copia */ }
    const dallaRete = F.getDocFromServer(rif).then(dati);
    if (copia !== undefined && copia !== null) {
      dallaRete.then((nuovo) => {
        if (fresco && JSON.stringify(nuovo) !== JSON.stringify(copia)) fresco(nuovo);
      }).catch(() => {});
      return copia;
    }
    try {
      return await dallaRete;
    } catch (e) {
      // Offline o rete lenta: ultima possibilità, la lettura normale (usa la copia se c'è).
      return dati(await F.getDoc(rif).catch(() => { throw e; }));
    }
  }

  // Esito di un eventuale accesso con Google "a redirect".
  let erroreRedirect = null;
  A.getRedirectResult(auth).catch((e) => { erroreRedirect = messaggioErrore(e); });

  const comeData = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
  const postDaDoc = (snap) => postDaDati(snap.data(), snap.id);
  function postDaDati(p, id) {
    return {
      ...p,
      id: String(id),
      data: comeData(p.data),
      ultimoCambio: comeData(p.ultimoCambio),
      novita: p.novita ? { ...p.novita, quando: comeData(p.novita.quando) } : null,
      file: (p.file ?? []).map((f) => ({ ...f, aggiuntoIl: comeData(f.aggiuntoIl) })),
    };
  }

  async function avvolgi(fn) {
    try {
      return await fn();
    } catch (e) {
      throw messaggioErrore(e);
    }
  }

  /**
   * Realtime Database (tutta Italia: atleti, ricerca, squadre), con il token di chi ha fatto l'accesso.
   * Con `veloce` la risposta resta anche sul telefono: la volta dopo si mostra subito quella e intanto
   * si chiede la versione nuova (se è diversa arriva a `fresco`).
   */
  // Classifiche su richiesta: id "stagione-vasca-gara-sesso-regione-categoria" (sei pezzi).
  const suRichiesta = (id) => String(id).split('-').length === 6;
  const comeClassifica = (x) => (x ? { ...x, righe: x.righe ? String(x.righe).split('~') : [] } : null);

  async function leggiRtdb(percorso, parametri = {}, { veloce = false, fresco } = {}) {
    if (!config.rtdb) return null;
    const indirizzo = `${config.rtdb}/${percorso.split('/').map(encodeURIComponent).join('/')}.json`;
    const chiaveCopia = `${indirizzo}?${new URLSearchParams(parametri)}`;
    const dallaRete = async () => {
      const utente = auth.currentUser;
      if (!utente) throw Object.assign(new Error('Accedi per vedere i dati.'), { code: 'permission-denied' });
      const [token, intestazioni] = await Promise.all([utente.getIdToken(), intestazioniAppCheck()]);
      const q = new URLSearchParams({ ...parametri, auth: token });
      const r = await fetch(`${indirizzo}?${q}`, { headers: intestazioni });
      if (r.status === 401 || r.status === 403) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
      if (!r.ok) throw Object.assign(new Error(`rete ${r.status}`), { code: 'unavailable' });
      const dati = await r.json();
      if (veloce && 'caches' in window) {
        caches.open(COPIE_RTDB).then((c) => c.put(chiaveCopia, new Response(JSON.stringify(dati)))).catch(() => {});
      }
      return dati;
    };
    if (veloce && 'caches' in window) {
      try {
        const copia = await (await (await caches.open(COPIE_RTDB)).match(chiaveCopia))?.json();
        if (copia !== undefined) {
          dallaRete().then((nuovo) => {
            if (fresco && JSON.stringify(nuovo) !== JSON.stringify(copia)) fresco(nuovo);
          }).catch(() => {});
          return copia;
        }
      } catch { /* niente copia */ }
    }
    return dallaRete();
  }

  /**
   * Firestore senza SDK (REST), per i documenti con la foto della tessera: così la foto non resta nella
   * copia dei dati sul telefono (né di chi la manda né dell'admin che la guarda). Le regole valgono uguale.
   */
  const RADICE = `projects/${config.firebase.projectId}/databases/(default)/documents`;
  async function firestoreRest(metodo, percorso, corpo) {
    const utente = auth.currentUser;
    if (!utente) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    const [token, intestazioni] = await Promise.all([utente.getIdToken(), intestazioniAppCheck()]);
    let r;
    try {
      r = await fetch(`https://firestore.googleapis.com/v1/${RADICE}${percorso}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...intestazioni },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
    }
    if (r.status === 404) return null;
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
    if (!r.ok) throw Object.assign(new Error(`rete ${r.status}`), { code: 'unavailable' });
    return r.json();
  }
  const campiRest = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) }]));
  const scritturaNuova = (percorso, campi) => ({
    update: { name: `${RADICE}/${percorso}`, fields: campiRest(campi) },
    updateTransforms: [{ fieldPath: 'creato', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: false },
  });

  return {
    demo: false,

    seguiAccesso(callback) {
      return A.onAuthStateChanged(auth, (u) => callback(u ? {
        uid: u.uid,
        email: u.email,
        nome: u.displayName,
        verificata: u.emailVerified,
        conGoogle: u.providerData.some((p) => p.providerId === 'google.com'),
      } : null));
    },

    async prendiErroreAccesso() {
      const e = erroreRedirect;
      erroreRedirect = null;
      return e;
    },

    accediGoogle: () => avvolgi(async () => {
      const provider = new A.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await A.signInWithPopup(auth, provider);
      } catch (e) {
        const nonSupportato = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'];
        if (nonSupportato.includes(e.code) || (inApp() && e.code === 'auth/internal-error')) {
          await A.signInWithRedirect(auth, provider);
          return;
        }
        throw e;
      }
    }),

    registrati: (email, password) => avvolgi(async () => {
      const { user } = await A.createUserWithEmailAndPassword(auth, email, password);
      await A.sendEmailVerification(user, { url: `${location.origin}/` });
    }),

    accediEmail: (email, password) => avvolgi(() => A.signInWithEmailAndPassword(auth, email, password)),

    recuperaPassword: (email) => avvolgi(() => A.sendPasswordResetEmail(auth, email, { url: `${location.origin}/` })),

    rimandaVerifica: () => avvolgi(() => A.sendEmailVerification(auth.currentUser, { url: `${location.origin}/` })),

    ricaricaUtente: () => avvolgi(async () => {
      await auth.currentUser?.reload();
      return auth.currentUser?.emailVerified ?? false;
    }),

    esci: async () => {
      // I dati si vedono solo con l'accesso: uscendo si tolgono anche le copie sul telefono.
      if ('caches' in window) await caches.delete(COPIE_RTDB).catch(() => {});
      return A.signOut(auth);
    },

    leggiProfilo: (uid) => avvolgi(async () => {
      const snap = await F.getDoc(F.doc(db, 'users', uid));
      return snap.exists() ? snap.data() : null;
    }),

    salvaProfilo: (uid, dati) => avvolgi(async () => {
      const rif = F.doc(db, 'users', uid);
      const snap = await F.getDoc(rif);
      // Conferma dell'età e accettazione di Termini e Privacy: versione dei testi e ora del server.
      if (dati.accettato) dati = { ...dati, accettato: { v: dati.accettato.v, eta: true, il: F.serverTimestamp() } };
      if (snap.exists()) {
        await F.updateDoc(rif, { ...dati, aggiornato: F.serverTimestamp() });
      } else {
        await F.setDoc(rif, {
          tokens: [],
          pushOn: true,
          ...dati,
          creato: F.serverTimestamp(),
          aggiornato: F.serverTimestamp(),
        });
      }
    }),

    /** Accettazione dei testi nuovi (utenti già iscritti). */
    salvaAccettato: (uid, v) => avvolgi(() => F.updateDoc(F.doc(db, 'users', uid), {
      accettato: { v, eta: true, il: F.serverTimestamp() }, aggiornato: F.serverTimestamp(),
    })),

    /** Elimina l'account: prima i Consigli mandati, poi il profilo, poi l'accesso. */
    eliminaAccount: (uid) => avvolgi(async () => {
      const consigli = await F.getDocs(F.query(F.collection(db, 'consigli'), F.where('uid', '==', uid)));
      await Promise.all(consigli.docs.map((d) => F.deleteDoc(d.ref)));
      await F.deleteDoc(F.doc(db, 'users', uid));
      await A.deleteUser(auth.currentUser);
    }),

    leggiPost: (settori) => avvolgi(async () => {
      if (!settori?.length) return [];
      const q = F.query(
        F.collection(db, 'posts'),
        F.where('settori', 'array-contains-any', settori.slice(0, 30)),
        F.orderBy('ultimoCambio', 'desc'),
        F.limit(40),
      );
      const snap = await F.getDocs(q);
      return snap.docs.map(postDaDoc);
    }),

    /** Avvisi: un solo documento riassuntivo (una lettura); se manca, la ricerca di prima. */
    leggiAvvisi: (settori, fresco) => avvolgi(async () => {
      // Prima la copia sul telefono (subito), poi la versione fresca arriva a `fresco`.
      const daCopia = await leggiVeloce(
        F.doc(db, 'meta', 'avvisi'),
        (s) => (s.data().posts ?? []).map((p) => postDaDati(p, p.id)),
        fresco,
      ).catch(() => null);
      if (daCopia) return daCopia;
      const snap = await F.getDoc(F.doc(db, 'meta', 'avvisi'));
      if (!snap.exists()) {
        if (!settori?.length) return [];
        const q = F.query(
          F.collection(db, 'posts'),
          F.where('settori', 'array-contains-any', settori.slice(0, 30)),
          F.orderBy('ultimoCambio', 'desc'),
          F.limit(40),
        );
        return (await F.getDocs(q)).docs.map(postDaDoc);
      }
      return (snap.data().posts ?? []).map((p) => postDaDati(p, p.id));
    }),

    /** Elenco delle gare (Lazio in diretta e, quando ci sono, le altre). */
    leggiGare: (fresco) => avvolgi(async () => {
      const ultimi = { diretta: [], italia: [] };
      const unisci = () => {
        const perId = new Map([...ultimi.italia, ...ultimi.diretta].map((g) => [g.id, g]));
        return [...perId.values()].sort((a, b) => (b.dal ?? '').localeCompare(a.dal ?? '') || a.nome.localeCompare(b.nome));
      };
      const leggiElenco = (id, chiave) => leggiVeloce(F.doc(db, 'meta', id), (s) => s.data().gare ?? [], (nuovo) => {
        ultimi[chiave] = nuovo ?? [];
        fresco?.(unisci());
      }).catch(() => []);
      [ultimi.diretta, ultimi.italia] = await Promise.all([leggiElenco('gare-diretta', 'diretta'), leggiElenco('gare-italia', 'italia')]);
      ultimi.diretta ??= [];
      ultimi.italia ??= [];
      return unisci();
    }),

    leggiGara: (id, fresco) => avvolgi(() => leggiVeloce(F.doc(db, 'gare', id), (s) => ({ id, ...s.data() }), fresco)),

    leggiCategoria: (id, doc, fresco) => avvolgi(() => leggiVeloce(F.doc(db, 'gare', id, 'categorie', doc), (s) => s.data(), fresco)),

    leggiAtleta: (k, fresco) => avvolgi(() => leggiVeloce(F.doc(db, 'atleti', k), (s) => s.data(), fresco)),

    leggiIndice: (lettera) => avvolgi(async () => (await leggiVeloce(F.doc(db, 'indici', lettera), (s) => s.data().l ?? [])) ?? []),

    /** Un atleta di tutta Italia: i migliori di ogni stagione (Realtime Database). */
    leggiAtletaItalia: (k, fresco) => avvolgi(() => leggiRtdb(`a/${k}`, {}, { veloce: true, fresco })),

    /** Ricerca in tutta Italia: voci "chiave|nome|anno|società|regione" il cui nome inizia con `testo`. */
    cercaItalia: (testo, quanti = 80) => avvolgi(async () => Object.values(await leggiRtdb('c', {
      orderBy: '"$key"', startAt: JSON.stringify(testo), endAt: JSON.stringify(`${testo}\uf8ff`), limitToFirst: String(quanti),
    }) ?? {})),

    /** Una squadra, stagione per stagione (Realtime Database): tutto, pesante. */
    leggiSquadraItalia: (id) => avvolgi(() => leggiRtdb(`sqs/${id}`)),

    /** Riassunto di una squadra (leggero): componenti, migliori di sempre, punti di sempre. */
    leggiRiassuntoSquadra: (id) => avvolgi(() => leggiRtdb(`sqx/${id}`, {}, { veloce: true })),

    /** Una sola stagione di una squadra. */
    leggiStagioneSquadraItalia: (id, st) => avvolgi(() => leggiRtdb(`sqs/${id}/s${st}`, {}, { veloce: true })),

    /** Staffette di una squadra da tutte le gare lette (Realtime Database): voci "gara|sesso|vasca|tempo|data|gara|categoria". */
    leggiStaffetteSquadra: (id) => avvolgi(async () => Object.values(await leggiRtdb(`sqr/${id}`, {}, { veloce: true }) ?? {})),

    /** Segui una squadra scegliendo le notifiche ("tempi", "pb", "staffette"); o cambia le notifiche. */
    seguiSquadra: (uid, id, notifiche) => avvolgi(() => F.updateDoc(
      F.doc(db, 'users', uid),
      'squadre', F.arrayUnion(id),
      new F.FieldPath('notSq', id), notifiche,
      'aggiornato', F.serverTimestamp(),
    )),

    smettiSquadra: (uid, id) => avvolgi(() => F.updateDoc(
      F.doc(db, 'users', uid),
      'squadre', F.arrayRemove(id),
      new F.FieldPath('notSq', id), F.deleteField(),
      'aggiornato', F.serverTimestamp(),
    )),

    /** Indice annata: medie dei 10 migliori d'Italia per anno di nascita in una stagione. */
    leggiAnnate: (st) => avvolgi(() => leggiRtdb(`ann/s${st}`)),

    /** Tutte le gare di un atleta seguito (Realtime Database), o null. */
    leggiStorico: (k, fresco) => avvolgi(() => leggiRtdb(`st/${k}`, {}, { veloce: true, fresco })),

    /** Chiede al controllore lo storico di un atleta (se c'è già una richiesta, va bene così). */
    chiediStorico: (k) => F.setDoc(F.doc(db, 'richiesteStorico', k), { creato: F.serverTimestamp() }).catch(() => null),

    /** Pezzo dell'indice di ricerca: atleti con una parola del nome che inizia con queste due lettere. */
    leggiRicerca: (prefisso) => avvolgi(async () => (await leggiVeloce(F.doc(db, 'ricerca', prefisso), (s) => s.data().l ?? [])) ?? []),

    leggiSquadre: (fresco) => avvolgi(async () => (await leggiVeloce(F.doc(db, 'meta', 'squadre'), (s) => s.data().squadre ?? {}, fresco)) ?? {}),

    leggiSquadra: (id, fresco) => avvolgi(() => leggiVeloce(F.doc(db, 'squadre', id), (s) => ({ id, ...s.data() }), fresco)),

    leggiStagioneSquadra: (id, st) => avvolgi(() => leggiVeloce(F.doc(db, 'squadre', id, 'stagioni', String(st)), (s) => s.data())),

    leggiTesto: (id) => avvolgi(() => leggiVeloce(F.doc(db, 'testi', id), (s) => s.data())),

    /* ---------- consigli e admin ---------- */

    sonoAdmin: async (uid) => {
      try {
        return (await F.getDoc(F.doc(db, 'admin', uid))).exists();
      } catch {
        return false;
      }
    },

    mandaConsiglio: (uid, {
      testo, tipo, dispositivo, rif,
    }) => avvolgi(() => F.addDoc(F.collection(db, 'consigli'), {
      uid, testo, tipo, dispositivo, ...(rif ? { rif: String(rif).slice(0, 200) } : {}), stato: 'nuovo', creato: F.serverTimestamp(),
    })),

    /* ---------- richieste privacy ("Sei questo atleta o un suo genitore?") ---------- */

    /**
     * Richiesta e foto della tessera insieme (o tutte e due o niente). La foto sta in un documento a parte
     * (richiestePrivacyFoto/{id}) che legge solo l'admin. `manuale`: creata dall'admin (non serve avvisarlo).
     */
    inviaRichiestaPrivacy: (uid, {
      atleta, nome, tipo, chi, prova, email, foto = null, manuale = false,
    }) => avvolgi(async () => {
      const id = F.doc(F.collection(db, 'richiestePrivacy')).id;
      await firestoreRest('POST', ':commit', {
        writes: [
          scritturaNuova(`richiestePrivacy/${id}`, {
            uid, atleta, nome, tipo, chi, prova, email, foto: Boolean(foto), stato: 'nuova', avvisato: manuale, ...(manuale ? { manuale: true } : {}),
          }),
          ...(foto ? [scritturaNuova(`richiestePrivacyFoto/${id}`, { uid, foto })] : []),
        ],
      });
    }),

    /** Solo admin: la foto della tessera di una richiesta (null se non c'è o è già cancellata). */
    leggiFotoRichiesta: (id) => avvolgi(async () => {
      const doc = await firestoreRest('GET', `/richiestePrivacyFoto/${encodeURIComponent(id)}`);
      const foto = doc?.fields?.foto?.stringValue ?? null;
      return typeof foto === 'string' && foto.startsWith('data:image/') ? foto : null;
    }),

    /** Solo admin. */
    leggiRichiestePrivacy: () => avvolgi(async () => {
      const snap = await F.getDocs(F.query(F.collection(db, 'richiestePrivacy'), F.orderBy('creato', 'desc'), F.limit(200)));
      return snap.docs.map((d) => ({
        id: d.id, ...d.data(), creato: comeData(d.data().creato), chiusa: comeData(d.data().chiusa),
      }));
    }),

    /** Solo admin: cambia lo stato di una richiesta (con la data di chiusura se è chiusa). */
    // La foto della tessera resta 30 giorni dopo la chiusura, poi la cancella il controllore con gli altri dati.
    aggiornaRichiestaPrivacy: (id, stato, chiusa) => avvolgi(() => F.updateDoc(F.doc(db, 'richiestePrivacy', id), {
      stato, ...(chiusa ? { chiusa: F.serverTimestamp() } : {}),
    })),

    /** Solo admin: account inattivi senza notifiche, da avvisare per email (privato/inattivi/account/{uid}). */
    leggiInattivi: () => avvolgi(async () => {
      const snap = await F.getDocs(F.collection(db, 'privato', 'inattivi', 'account'));
      return snap.docs.map((d) => {
        const x = d.data();
        return {
          uid: d.id, ...x, ultimo: comeData(x.ultimo), creato: comeData(x.creato), mandata: comeData(x.mandata),
        };
      });
    }),
    segnaEmailMandata: (uid) => avvolgi(() => F.updateDoc(F.doc(db, 'privato', 'inattivi', 'account', uid), {
      stato: 'avvisato', mandata: F.serverTimestamp(),
    })),

    /** Solo admin: segnali sugli account (privato/segnali/utenti/{uid}). */
    leggiSegnali: () => avvolgi(async () => {
      const snap = await F.getDocs(F.collection(db, 'privato', 'segnali', 'utenti'));
      return snap.docs.map((d) => {
        const x = d.data();
        return {
          uid: d.id, ...x, data: comeData(x.data), decisione: x.decisione ? { ...x.decisione, il: comeData(x.decisione.il) } : null,
        };
      });
    }),
    /** Solo admin: decisione su un segnale (resta scritta). Le azioni le esegue il controllore al giro dopo. */
    decidiSegnale: (uid, azione, n) => avvolgi(async () => {
      const stato = {
        ignora: 'ignorato', avviso: 'avviso-da-mandare', sospendi: 'da-sospendere', chiudi: 'da-chiudere', riattiva: 'da-riattivare',
      }[azione];
      await F.updateDoc(F.doc(db, 'privato', 'segnali', 'utenti', uid), {
        decisione: { azione, n: n ?? null, il: F.serverTimestamp() },
        decisioni: F.arrayUnion({ azione, n: n ?? null, il: new Date().toISOString() }),
        stato,
      });
      if (azione !== 'ignora') await F.setDoc(F.doc(db, 'privato', 'segnali'), { daFare: true, aggiornato: F.serverTimestamp() }, { merge: true });
    }),

    mieiConsigli: (uid) => avvolgi(async () => {
      const snap = await F.getDocs(F.query(F.collection(db, 'consigli'), F.where('uid', '==', uid)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data(), creato: comeData(d.data().creato) }))
        .sort((a, b) => (b.creato?.getTime() ?? 0) - (a.creato?.getTime() ?? 0));
    }),

    datiAdmin: () => avvolgi(async () => {
      const conta = (rif) => F.getCountFromServer(rif).then((r) => r.data().count).catch(() => null);
      const meta = (id) => F.getDoc(F.doc(db, 'meta', id)).then((x) => (x.exists() ? x.data() : {})).catch(() => ({}));
      const [utenti, atleti, consigli, annunci, statoSnap, budgetSnap, grad, budgetGrad, testi, lavori, squadre] = await Promise.all([
        conta(F.collection(db, 'users')),
        conta(F.collection(db, 'atleti')),
        F.getDocs(F.query(F.collection(db, 'consigli'), F.orderBy('creato', 'desc'), F.limit(100))),
        F.getDocs(F.query(F.collection(db, 'annunci'), F.orderBy('creato', 'desc'), F.limit(5))),
        F.getDoc(F.doc(db, 'meta', 'stato')),
        F.getDoc(F.doc(db, 'meta', 'budget')).catch(() => null),
        meta('graduatorie'),
        meta('budget-grad'),
        meta('testi'),
        F.getDocs(F.query(F.collection(db, 'lavori'), F.orderBy('creato', 'desc'), F.limit(15))).catch(() => null),
        conta(F.collection(db, 'squadre')),
      ]);
      const s = statoSnap.exists() ? statoSnap.data() : {};
      return {
        utenti,
        atleti,
        squadre,
        graduatorie: grad.fatte ?? {},
        budgetGrad,
        testi: Object.keys(testi.fatti ?? {}).length,
        lavori: lavori?.docs.map((d) => ({ id: d.id, ...d.data(), creato: comeData(d.data().creato) })) ?? [],
        consigli: consigli.docs.map((d) => ({ id: d.id, ...d.data(), creato: comeData(d.data().creato) })),
        annunci: annunci.docs.map((d) => ({ id: d.id, ...d.data(), inviato: comeData(d.data().inviato) })),
        stato: { ...s, ultimoControllo: comeData(s.ultimoControllo)?.toISOString() },
        budget: budgetSnap?.exists() ? budgetSnap.data() : {},
      };
    }),

    aggiornaConsiglio: (id, dati) => avvolgi(() => F.updateDoc(F.doc(db, 'consigli', id), dati)),

    creaAnnuncio: ({ titolo, corpo, url }) => avvolgi(() => F.addDoc(F.collection(db, 'annunci'), {
      titolo, corpo, stato: 'da-inviare', creato: F.serverTimestamp(), ...(url ? { url } : {}),
    })),

    leggiUtenti: () => avvolgi(async () => {
      const snap = await F.getDocs(F.collection(db, 'users'));
      return snap.docs.map((d) => {
        const u = d.data();
        return {
          id: d.id,
          creato: comeData(u.creato),
          aggiornato: comeData(u.aggiornato),
          settori: u.settori ?? [],
          seguiti: (u.seguiti ?? []).length,
          pushOn: u.pushOn !== false,
          dispositivi: (u.tokens ?? []).length,
        };
      }).sort((a, b) => (b.creato?.getTime() ?? 0) - (a.creato?.getTime() ?? 0));
    }),

    creaLavoro: (tipo, dati = {}) => avvolgi(() => F.addDoc(F.collection(db, 'lavori'), {
      tipo, ...dati, stato: 'da-fare', creato: F.serverTimestamp(),
    })),

    /** Impronte degli atleti nascosti (h) e fuori dalla ricerca (r): per tutti, senza nomi. */
    leggiNascosti: () => avvolgi(async () => {
      const snap = await F.getDoc(F.doc(db, 'config', 'nascosti'));
      return snap.exists() ? snap.data() : { h: [], r: [] };
    }),

    /** Solo admin: privato/nascosti, privato/inAttesa, privato/soloRisultati ({ chiave: { n, il } }). */
    leggiPrivato: (nome) => avvolgi(async () => {
      const snap = await F.getDoc(F.doc(db, 'privato', nome));
      return snap.exists() ? (snap.data().atleti ?? {}) : {};
    }),

    /** Solo admin: salva un elenco privato e subito le impronte per l'app (il controllore poi cancella i dati). */
    salvaPrivato: (nome, atleti) => avvolgi(async () => {
      await F.setDoc(F.doc(db, 'privato', nome), { atleti, aggiornato: F.serverTimestamp() });
      const leggi = async (x) => (x === nome ? atleti : ((await F.getDoc(F.doc(db, 'privato', x))).data()?.atleti ?? {}));
      const [nascosti, inAttesa] = await Promise.all([leggi('nascosti'), leggi('inAttesa')]);
      await F.setDoc(F.doc(db, 'config', 'nascosti'), {
        h: Object.keys(nascosti).map(impronta).sort(), r: Object.keys(inAttesa).map(impronta).sort(), aggiornato: F.serverTimestamp(),
      });
    }),

    leggiLimiti: () => avvolgi(async () => {
      const snap = await F.getDocs(F.collection(db, 'limiti'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }),

    salvaLimite: (id, dati) => avvolgi(async () => {
      if (id) {
        await F.setDoc(F.doc(db, 'limiti', id), { ...dati, aggiornato: F.serverTimestamp() }, { merge: true });
        return id;
      }
      const rif = await F.addDoc(F.collection(db, 'limiti'), { ...dati, creato: F.serverTimestamp(), aggiornato: F.serverTimestamp() });
      return rif.id;
    }),

    eliminaLimite: (id) => avvolgi(() => F.deleteDoc(F.doc(db, 'limiti', id))),

    /**
     * Classifica: quelle del Lazio preparate di notte stanno in Firestore (id "stagione-vasca-gara-sesso");
     * quelle su richiesta (Italia e regioni, id con regione e categoria) nel Realtime Database, intere.
     */
    leggiClassifica: (id, fresco) => avvolgi(async () => {
      if (!suRichiesta(id)) return leggiVeloce(F.doc(db, 'classifiche', id), (s) => s.data(), fresco);
      return comeClassifica(await leggiRtdb(`cl/${id}`, {}, { veloce: true, fresco: fresco && ((nuovo) => fresco(comeClassifica(nuovo))) }));
    }),

    /** Lettura senza copia locale (per vedere se una classifica chiesta è pronta). */
    leggiClassificaRete: (id) => avvolgi(async () => {
      if (suRichiesta(id)) return comeClassifica(await leggiRtdb(`cl/${id}`));
      const snap = await F.getDocFromServer(F.doc(db, 'classifiche', id));
      return snap.exists() ? snap.data() : null;
    }),

    /** Chiede al controllore di preparare (o aggiornare) una classifica. Se è già stata chiesta, va bene così. */
    chiediClassifica: (r) => avvolgi(async () => {
      const id = `${r.st}-${r.v}-${r.c}-${r.sx}-${r.reg}-${r.cat}`;
      try {
        await F.setDoc(F.doc(db, 'richieste', id), { ...r, creato: new Date().toISOString() });
      } catch { /* già in coda */ }
    }),

    salvaObiettivi: (uid, obiettivi) => avvolgi(() => F.updateDoc(F.doc(db, 'users', uid), { obiettivi, aggiornato: F.serverTimestamp() })),

    salvaLimitiSeguiti: (uid, limiti) => avvolgi(() => F.updateDoc(F.doc(db, 'users', uid), { limiti, aggiornato: F.serverTimestamp() })),

    /** Tempi limite pubblicati (per tutti) — l'admin li legge tutti con leggiLimiti. */
    leggiLimitiPubblicati: () => avvolgi(async () => {
      const snap = await F.getDocs(F.query(F.collection(db, 'limiti'), F.where('stato', 'in', ['pubblicato', 'da-notificare'])));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }),

    leggiCategorie: () => avvolgi(async () => (await leggiVeloce(F.doc(db, 'config', 'categorie'), (s) => s.data().regole ?? null)) ?? null),

    salvaCategorie: (regole) => avvolgi(() => F.setDoc(F.doc(db, 'config', 'categorie'), { regole, aggiornato: F.serverTimestamp() })),

    segui: (uid, k) => avvolgi(() => F.updateDoc(F.doc(db, 'users', uid), {
      seguiti: F.arrayUnion(k),
      aggiornato: F.serverTimestamp(),
    })),

    smettiDiSeguire: (uid, k) => avvolgi(() => F.updateDoc(F.doc(db, 'users', uid), {
      seguiti: F.arrayRemove(k),
      aggiornato: F.serverTimestamp(),
    })),

    leggiUnPost: (id) => avvolgi(async () => {
      const snap = await F.getDoc(F.doc(db, 'posts', id));
      return snap.exists() ? postDaDoc(snap) : null;
    }),

    leggiStato: async (fresco) => {
      try {
        return await leggiVeloce(F.doc(db, 'meta', 'stato'), (snap) => {
          const s = snap.data();
          return { ...s, ultimoControllo: comeData(s.ultimoControllo) };
        }, fresco);
      } catch {
        return null;
      }
    },

    /** Da chiamare dentro il clic: su iPhone il permesso va chiesto subito. */
    attivaPush: (uid, registrazione) => avvolgi(async () => {
      const M = await import(`${CDN}/firebase-messaging.js`);
      if (!(await M.isSupported())) {
        const e = new Error('Questo browser non supporta le notifiche.');
        e.code = 'non-supportato';
        throw e;
      }
      // Senza chiave Web Push propria, Firebase usa la sua chiave predefinita.
      const opzioni = { serviceWorkerRegistration: registrazione };
      if (config.vapidKey) opzioni.vapidKey = config.vapidKey;
      const token = await M.getToken(M.getMessaging(app), opzioni);
      if (!token) throw new Error('Non sono riuscito a registrare questo dispositivo.');
      // Con il token si salva anche l'indirizzo da cui arriva: il controllore manda le notifiche
      // solo ai dispositivi del nuovo indirizzo (niente doppioni dal vecchio).
      await F.updateDoc(
        F.doc(db, 'users', uid),
        'tokens', F.arrayUnion(token),
        new F.FieldPath('th', token), location.host,
        'pushOn', true,
        'aggiornato', F.serverTimestamp(),
      );
      return token;
    }),

    disattivaPushQui: (uid, token) => avvolgi(async () => {
      await F.updateDoc(
        F.doc(db, 'users', uid),
        'tokens', F.arrayRemove(token),
        new F.FieldPath('th', token), F.deleteField(),
        'aggiornato', F.serverTimestamp(),
      );
    }),
  };
}
