# Nuotifica

Avvisi (notifiche sul telefono o email) quando sul sito del Comitato Regionale Lazio FIN
([finlazio.it](https://www.finlazio.it)) escono ammessi, start list, orari, risultati e comunicati.

> Servizio **non ufficiale**: non è collegato alla Federazione Italiana Nuoto né al Comitato
> Regionale Lazio. Fa fede solo il sito finlazio.it.

## Come funziona

```
 finlazio.it (API WordPress pubbliche)
        │  ogni 15 minuti
        ▼
 GitHub Actions ── controller/ ──► Firestore (post, preferenze utenti)
        │                              ▲
        ├──► Firebase Cloud Messaging ──► notifiche sul telefono
        └──► Brevo ─────────────────────► email
                                       │
                 public/ (Firebase Hosting) ◄── l'app che usano gli iscritti
```

- **`controller/`**: lo script che controlla il sito. Non ha dipendenze (`npm install` non serve).
  Riconosce i post nuovi e i file aggiunti o "aggiornati" dentro post già usciti,
  capisce sport, gruppo (Categoria / Esordienti) e tipo di documento, salva tutto su Firestore
  e avvisa chi è interessato. Al primo avvio memorizza lo stato del sito senza mandare notifiche.
- **`public/`**: l'app (PWA) senza build: accesso con Google o email, scelte, guida per aggiungerla
  alla schermata Home su iPhone e Android, elenco dei post e dettaglio con i file.
  Finché `public/js/config.js` è vuoto parte in **anteprima** con dati di esempio
  (si può forzare con `?demo` nell'indirizzo).
- **`.github/workflows/controllore.yml`**: fa girare il controllore ogni 15 minuti, con il
  "segno di vita" automatico che evita lo spegnimento dopo 60 giorni di inattività.
- **`.github/workflows/pubblica.yml`**: a ogni modifica di `public/` o delle regole pubblica
  su Firebase Hosting e aggiorna regole e indici di Firestore.

## Configurazione (una volta sola)

### Firebase
1. Authentication → Metodo di accesso: attivare **Google** ed **Email/password**.
2. Impostazioni progetto → Le tue app → app web: copiare `firebaseConfig` in `public/js/config.js`.
3. Impostazioni progetto → Cloud Messaging → Certificati Web Push → generare la coppia di chiavi
   e copiare la chiave pubblica in `vapidKey` dentro `public/js/config.js`.
4. Impostazioni progetto → Account di servizio → **Genera nuova chiave privata** (file JSON).
   Nella console Google Cloud → IAM, a quell'account (`firebase-adminsdk-…`) aggiungere il ruolo
   **Firebase Admin**, che serve per pubblicare il sito.

### GitHub (Settings → Secrets and variables → Actions)
| Nome | Tipo | Valore |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Secret | tutto il contenuto del file JSON dell'account di servizio |
| `BREVO_API_KEY` | Secret | chiave API di Brevo (SMTP & API → API Keys) |
| `BREVO_MITTENTE` | Variable | indirizzo mittente verificato su Brevo |
| `SITO_URL` | Variable | es. `https://nome-progetto.web.app` (facoltativo) |

Poi in **Actions** avviare a mano "Pubblica il sito" e "Controllore".
Con l'opzione *anteprima* il controllore mostra cosa riconosce sul sito senza salvare né inviare niente.

## Prove in locale

```bash
cd controller
npm test                       # test del controllore
node src/main.js --anteprima   # cosa riconosce oggi sul sito (serve internet)

cd ../public
python3 -m http.server 8080    # poi apri http://localhost:8080/?demo
```
