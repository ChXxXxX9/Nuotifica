// Configurazione pubblica del progetto Firebase (non contiene segreti:
// questi valori finiscono comunque nel sito, la sicurezza la fanno le regole di Firestore).
// Finché è vuota, l'app parte in modalità anteprima con dati di esempio.
// authDomain va messo uguale all'indirizzo del sito (es. nome-progetto.web.app) e non
// a "firebaseapp.com": così l'accesso con Google funziona anche nell'app installata su iPhone.
// L'accesso con Google passa dallo stesso indirizzo da cui si apre l'app (vecchio o nuovo).
const host = location.hostname;
const nostro = /\.(web\.app|firebaseapp\.com)$/.test(host);

export const CONFIG = {
  firebase: {
    apiKey: 'AIzaSyDU-4W2quk3t7ronsbIMT73sqIUQLiu1rc',
    authDomain: nostro ? host : 'nuotifica.web.app',
    projectId: 'nuotifica',
    storageBucket: 'nuotifica.firebasestorage.app',
    messagingSenderId: '929572098468',
    appId: '1:929572098468:web:4701760e8219fdca14b131',
  },
  // Realtime Database: tutta Italia (atleti di ogni stagione, ricerca, squadre).
  rtdb: 'https://nuotifica-default-rtdb.europe-west1.firebasedatabase.app',
  // Chiave pubblica "Web Push" (facoltativa): se vuota, Firebase usa la sua chiave predefinita.
  vapidKey: '',
  // Indirizzo principale dell'app. Con "trasferimento" attivo, chi la usa dal vecchio indirizzo
  // viene invitato a reinstallarla da quello nuovo.
  indirizzo: 'cloro.web.app',
  trasferimento: true,
  // App Check con reCAPTCHA (facoltativo): la "chiave del sito" registrata in Firebase → App Check.
  // Vuota = App Check spento. enterprise: true se la chiave è di reCAPTCHA Enterprise, false se è reCAPTCHA v3.
  appCheck: { chiave: '6LfvAC0uAAAAAE0ODjgcffM9-tkJMD__fuudLN9j', enterprise: true },
  // Chi gestisce il servizio (titolare del trattamento) e il contatto, nelle pagine Privacy, Termini e Sicurezza.
  titolare: 'Christian Caputi',
  contatto: 'cloroita@gmail.com',
};
