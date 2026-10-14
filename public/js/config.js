// Configurazione pubblica del progetto Firebase (non contiene segreti:
// questi valori finiscono comunque nel sito, la sicurezza la fanno le regole di Firestore).
// Finché è vuota, l'app parte in modalità anteprima con dati di esempio.
// authDomain va messo uguale all'indirizzo del sito (es. nome-progetto.web.app) e non
// a "firebaseapp.com": così l'accesso con Google funziona anche nell'app installata su iPhone.
export const CONFIG = {
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
  // Chiave pubblica "Web Push" (Impostazioni progetto → Cloud Messaging → Certificati Web Push).
  vapidKey: '',
  // Chi gestisce il servizio, mostrato nella pagina Privacy.
  titolare: '',
  contatto: '',
};
