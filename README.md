# Cloro

Il nuoto, in diretta: gare con batterie, corsie, tempi e parziali, schede atleta con personali,
punti World Aquatics e progressi, "Segui" con la notifica appena esce un tempo, e gli avvisi del
Comitato (ammessi, start list, orari) sul telefono.

> Servizio **non ufficiale**: non è collegato a federazioni, comitati o organizzatori.
> Fanno fede solo i risultati e le comunicazioni ufficiali.

## Come funziona

```
 fonti pubbliche (indirizzi nel secret FONTI)
        │  ogni 5 minuti (timer cron-job.org → GitHub Actions)
        ▼
 GitHub Actions ── controller/ ──► Firestore (avvisi, gare, atleti, preferenze)
        │                              ▲
        └──► Firebase Cloud Messaging ──► notifiche sul telefono
                                       │
                 public/ (Firebase Hosting) ◄── l'app
```

- **`controller/`**: lo script del controllore, senza dipendenze (`npm install` non serve). A ogni giro:
  1. **avvisi**: riconosce post nuovi e file aggiunti o aggiornati, li salva (più un riassunto unico
     `meta/avvisi` che l'app legge in una volta) e avvisa chi è interessato;
  2. **gare in diretta**: legge le sedi che stanno gareggiando (e, due per volta, quelle mai lette),
     salva le gare "a pacchetti" (una lettura per categoria), calcola punti World Aquatics, personali (PB)
     e stagionali (SB), aggiorna schede atleta e indice di ricerca senza rileggerli, e manda
     "è uscito il tuo tempo" a chi segue l'atleta;
  3. **Italia**: ogni 6 ore il calendario nazionale; poi una gara finita per giro, con la classifica
     completa (le schede si aggiornano solo per gli atleti già conosciuti o per le gare del Lazio).
  Un tetto di sicurezza ferma le scritture opzionali vicino al limite gratuito di Firestore
  (20.000 al giorno); il conteggio sta in `meta/budget`.
- **`public/`**: l'app (PWA) senza build. Sezioni: Per te, Gare, Classifiche (in arrivo), Atleti.
  Con `?demo` nell'indirizzo parte con dati di esempio (nomi inventati).
- **`.github/workflows/controllore.yml`**: fa girare il controllore (timer esterno cron-job.org ogni
  5 minuti; quello interno di GitHub resta di riserva con il "segno di vita").
- **`.github/workflows/pubblica.yml`**: a ogni modifica di `public/` o delle regole pubblica su
  Firebase Hosting e aggiorna regole e indici di Firestore.

## Configurazione (una volta sola)

### Firebase
1. Authentication → Metodo di accesso: attivare **Google** ed **Email/password**.
2. Impostazioni progetto → Le tue app → app web: copiare `firebaseConfig` in `public/js/config.js`.
3. Impostazioni progetto → Account di servizio → **Genera nuova chiave privata** (file JSON), con il
   ruolo **Firebase Admin** in Google Cloud → IAM.

### GitHub (Settings → Secrets and variables → Actions)
| Nome | Tipo | Valore |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Secret | il contenuto del file JSON dell'account di servizio |
| `FONTI` | Secret | JSON con gli indirizzi delle fonti: chiavi `avvisi`, `live`, `liveGara`, `naz` |
| `SITO_URL` | Variable | es. `https://nome-progetto.web.app` (facoltativo) |

Gli indirizzi delle fonti stanno solo nel secret: nel codice e nei log non compaiono.

## Prove in locale

```bash
cd controller
npm test                         # test (con campioni anonimi)
node strumenti/dati-demo.js      # rigenera i dati di esempio dell'app

cd ../public
python3 -m http.server 8080      # poi apri http://localhost:8080/?demo
```
