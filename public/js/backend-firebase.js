// Collegamento a Firebase (Auth, Firestore, Cloud Messaging) con l'SDK ufficiale dal CDN di Google.
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

export async function creaBackendFirebase(config) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  const app = initializeApp(config.firebase);
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

    esci: () => A.signOut(auth),

    leggiProfilo: (uid) => avvolgi(async () => {
      const snap = await F.getDoc(F.doc(db, 'users', uid));
      return snap.exists() ? snap.data() : null;
    }),

    salvaProfilo: (uid, dati) => avvolgi(async () => {
      const rif = F.doc(db, 'users', uid);
      const snap = await F.getDoc(rif);
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

    eliminaAccount: (uid) => avvolgi(async () => {
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
    leggiAvvisi: (settori) => avvolgi(async () => {
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

    /* ---------- consigli e admin ---------- */

    sonoAdmin: async (uid) => {
      try {
        return (await F.getDoc(F.doc(db, 'admin', uid))).exists();
      } catch {
        return false;
      }
    },

    mandaConsiglio: (uid, { testo, tipo, dispositivo }) => avvolgi(() => F.addDoc(F.collection(db, 'consigli'), {
      uid, testo, tipo, dispositivo, stato: 'nuovo', creato: F.serverTimestamp(),
    })),

    mieiConsigli: (uid) => avvolgi(async () => {
      const snap = await F.getDocs(F.query(F.collection(db, 'consigli'), F.where('uid', '==', uid)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data(), creato: comeData(d.data().creato) }))
        .sort((a, b) => (b.creato?.getTime() ?? 0) - (a.creato?.getTime() ?? 0));
    }),

    datiAdmin: () => avvolgi(async () => {
      const conta = (rif) => F.getCountFromServer(rif).then((r) => r.data().count).catch(() => null);
      const [utenti, atleti, consigli, annunci, statoSnap, budgetSnap] = await Promise.all([
        conta(F.collection(db, 'users')),
        conta(F.collection(db, 'atleti')),
        F.getDocs(F.query(F.collection(db, 'consigli'), F.orderBy('creato', 'desc'), F.limit(100))),
        F.getDocs(F.query(F.collection(db, 'annunci'), F.orderBy('creato', 'desc'), F.limit(5))),
        F.getDoc(F.doc(db, 'meta', 'stato')),
        F.getDoc(F.doc(db, 'meta', 'budget')).catch(() => null),
      ]);
      const s = statoSnap.exists() ? statoSnap.data() : {};
      return {
        utenti,
        atleti,
        consigli: consigli.docs.map((d) => ({ id: d.id, ...d.data(), creato: comeData(d.data().creato) })),
        annunci: annunci.docs.map((d) => ({ id: d.id, ...d.data(), inviato: comeData(d.data().inviato) })),
        stato: { ...s, ultimoControllo: comeData(s.ultimoControllo)?.toISOString() },
        budget: budgetSnap?.exists() ? budgetSnap.data() : {},
      };
    }),

    aggiornaConsiglio: (id, dati) => avvolgi(() => F.updateDoc(F.doc(db, 'consigli', id), dati)),

    creaAnnuncio: ({ titolo, corpo }) => avvolgi(() => F.addDoc(F.collection(db, 'annunci'), {
      titolo, corpo, stato: 'da-inviare', creato: F.serverTimestamp(),
    })),

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

    leggiStato: async () => {
      try {
        const snap = await F.getDoc(F.doc(db, 'meta', 'stato'));
        if (!snap.exists()) return null;
        const s = snap.data();
        return { ...s, ultimoControllo: comeData(s.ultimoControllo) };
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
      await F.updateDoc(F.doc(db, 'users', uid), {
        tokens: F.arrayUnion(token),
        pushOn: true,
        aggiornato: F.serverTimestamp(),
      });
      return token;
    }),

    disattivaPushQui: (uid, token) => avvolgi(async () => {
      await F.updateDoc(F.doc(db, 'users', uid), {
        tokens: F.arrayRemove(token),
        aggiornato: F.serverTimestamp(),
      });
    }),
  };
}
