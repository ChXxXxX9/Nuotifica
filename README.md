# Nuotifica

Notifiche sul telefono quando sul sito del Comitato Regionale Lazio FIN
([finlazio.it](https://www.finlazio.it)) escono ammessi, start list, orari, risultati e comunicati.

> Servizio **non ufficiale**: non è collegato alla Federazione Italiana Nuoto né al Comitato
> Regionale Lazio. Fa fede solo il sito finlazio.it.

## Come funziona

```
 finlazio.it (API WordPress pubbliche)
        │  ogni 5 minuti (timer cron-job.org → GitHub Actions)
        ▼
 GitHub Actions ── controller/ ──► Firestore (post, preferenze utenti)
        │                              ▲
        └──► Firebase Cloud Messaging ──► notifiche sul telefono
                                       │
                 public/ (Firebase Hosting) ◄── l'app che usano gli iscritti
```

- **`controller/`**: lo script che controlla il sito. Non ha dipendenze (`npm install` non serve).
  Riconosce i post nuovi e i file aggiunti o "aggiornati" dentro post già usciti,
  capisce sport, gruppo (Categoria / Esordienti) e tipo di documento, salva tutto su Firestore
  e manda la notifica a chi è interessato. Al primo avvio memorizza lo stato del sito senza mandare notifiche.
- **`public/`**: l'app (PWA) senza build: accesso con Google o email, scelte, guida per aggiungerla
  alla schermata Home su iPhone e Android, elenco dei post e dettaglio con i file.
  Finché `public/js/config.js` è vuoto parte in **anteprima** con dati di esempio
  (si può forzare con `?demo` nell'indirizzo).
- **`.github/workflows/controllore.yml`**: fa girare il controllore. Lo avvia ogni 5 minuti un timer
  esterno gratuito (cron-job.org, chiamata `POST …/actions/workflows/controllore.yml/dispatches` con un
  token GitHub fine-grained "Actions: read and write"); il timer interno di GitHub resta di riserva,
  con il "segno di vita" che evita lo spegnimento dopo 60 giorni. Ogni giro parte con un controllo
  rapido (una sola richiesta piccola al sito) e legge il resto solo se qualcosa è cambiato.
- **`.github/workflows/pubblica.yml`**: a ogni modifica di `public/` o delle regole pubblica
  su Firebase Hosting e aggiorna regole e indici di Firestore.

## Configurazione (una volta sola)

### Firebase
1. Authentication → Metodo di accesso: attivare **Google** ed **Email/password**.
2. Impostazioni progetto → Le tue app → app web: copiare `firebaseConfig` in `public/js/config.js`.
   La chiave Web Push (`vapidKey`) è facoltativa: se resta vuota Firebase usa la sua.
3. Impostazioni progetto → Account di servizio → **Genera nuova chiave privata** (file JSON).
   Nella console Google Cloud → IAM, a quell'account (`firebase-adminsdk-…`) aggiungere il ruolo
   **Firebase Admin**, che serve per pubblicare il sito.

### GitHub (Settings → Secrets and variables → Actions)
| Nome | Tipo | Valore |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Secret | tutto il contenuto del file JSON dell'account di servizio |
| `SITO_URL` | Variable | es. `https://nome-progetto.web.app` (facoltativo) |

Poi in **Actions** avviare a mano "Pubblica il sito" e "Controllore". Se il database Firestore
non esiste ancora, "Pubblica il sito" lo crea. "Prepara i font" scarica i font (SIL OFL) in `public/fonts`.
Con l'opzione *anteprima* il controllore mostra cosa riconosce sul sito senza salvare né inviare niente.

## Prove in locale

```bash
cd controller
npm test                       # test del controllore
node src/main.js --anteprima   # cosa riconosce oggi sul sito (serve internet)

cd ../public
python3 -m http.server 8080    # poi apri http://localhost:8080/?demo
```
