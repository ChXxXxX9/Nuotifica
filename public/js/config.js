// Configurazione pubblica del progetto Firebase (non contiene segreti:
// questi valori finiscono comunque nel sito, la sicurezza la fanno le regole di Firestore).
// Finché è vuota, l'app parte in modalità anteprima con dati di esempio.
// authDomain va messo uguale all'indirizzo del sito (es. nome-progetto.web.app) e non
// a "firebaseapp.com": così l'accesso con Google funziona anche nell'app installata su iPhone.
export const CONFIG = {
  firebase: {
    apiKey: 'AIzaSyDU-4W2quk3t7ronsbIMT73sqIUQLiu1rc',
    authDomain: 'nuotifica.web.app',
    projectId: 'nuotifica',
    storageBucket: 'nuotifica.firebasestorage.app',
    messagingSenderId: '929572098468',
    appId: '1:929572098468:web:4701760e8219fdca14b131',
  },
  // Chiave pubblica "Web Push" (facoltativa): se vuota, Firebase usa la sua chiave predefinita.
  vapidKey: '',
  // Chi gestisce il servizio, mostrato nella pagina Privacy.
  titolare: '',
  contatto: '',
};
