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
  const db = F.getFirestore(app);

  // Esito di un eventuale accesso con Google "a redirect".
  let erroreRedirect = null;
  A.getRedirectResult(auth).catch((e) => { erroreRedirect = messaggioErrore(e); });

  const comeData = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
  const postDaDoc = (snap) => {
    const p = snap.data();
    return {
      ...p,
      id: snap.id,
      data: comeData(p.data),
      ultimoCambio: comeData(p.ultimoCambio),
      novita: p.novita ? { ...p.novita, quando: comeData(p.novita.quando) } : null,
      file: (p.file ?? []).map((f) => ({ ...f, aggiuntoIl: comeData(f.aggiuntoIl) })),
    };
  };

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

    prendiErroreAccesso() {
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
