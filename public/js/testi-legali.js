// Privacy, Termini d'uso, Sicurezza e minori, Domande frequenti (testi versione 2026-11-18, aggiornati il 22/11/2026).
// Si aprono anche senza accesso e dal browser. I testi sono scritti per rispettare GDPR e Codice privacy:
// non cambiarne il senso senza chiedere a chi gestisce Cloro.
import { CONFIG } from './config.js';
import { esc, barraTop, disegna } from './nucleo.js';

const t = esc(CONFIG.titolare);
const mail = `<a href="mailto:${esc(CONFIG.contatto)}">${esc(CONFIG.contatto)}</a>`;
const link = (pagina, testo) => `<a href="#/${pagina}">${testo}</a>`;

// Appendice 1: la tabella diventa un elenco di schede (stesse informazioni).
const DATI_UTENTI = [
  ['Email e codice dell\'account. Se entri con Google, Google ci passa anche nome e immagine del profilo: il nome lo vedi solo tu',
    'Farti entrare e riconoscerti', 'Servizio che chiedi (contratto, art. 6.1.b GDPR)', 'Finché tieni l\'account; cancellato dopo 36 mesi senza usarlo'],
  ['Le tue scelte: avvisi, atleti e squadre seguiti, obiettivi, tempi limite',
    'Mostrarti "Per te" e mandarti le notifiche che chiedi', 'Contratto', 'Come sopra'],
  ['Codici dei dispositivi per le notifiche', 'Mandare le notifiche al tuo telefono o computer',
    'Contratto; le notifiche le attivi tu dal dispositivo e puoi toglierle quando vuoi', 'Finché le notifiche sono attive o tieni l\'account'],
  ['Conferma dell\'età e accettazione di Termini e Privacy (data e versione)', 'Dimostrare che li hai accettati',
    'Legittimo interesse (art. 6.1.f GDPR)', 'Finché tieni l\'account'],
  ['Messaggi mandati in Consigli (testo, tipo, modello di dispositivo)', 'Leggerli e risponderti', 'Legittimo interesse',
    'Cancellati con l\'account, e comunque dopo 24 mesi'],
  ['Dati tecnici: data di iscrizione e di ultimo uso, registri tecnici dei servizi che usiamo', 'Sicurezza e funzionamento',
    'Legittimo interesse', 'Il tempo tecnico necessario (per i registri al massimo 90 giorni)'],
  ['Dati del dispositivo e dell\'uso dell\'app analizzati da reCAPTCHA di Google (per esempio indirizzo IP, tipo di browser e di dispositivo, interazioni con l\'app)',
    'Riconoscere i programmi automatici e proteggere i dati degli atleti dalla copia di massa',
    'Legittimo interesse alla sicurezza del servizio (art. 6.1.f GDPR)', 'Il tempo necessario all\'analisi. Google li tratta per conto di Cloro, solo per questo scopo'],
  ['Atleti seguiti, confrontati con la loro età e la loro società', 'Accorgerci di chi usa Cloro per seguire ragazzi senza motivo, e proteggerli',
    'Legittimo interesse', 'Il tempo della verifica'],
];

const privacy = () => `
  <h1 class="titolo-pagina">Informativa privacy</h1>
  <p class="nota">Ultimo aggiornamento: 22 novembre 2026</p>
  <p>Cloro è un servizio gratuito e non ufficiale: raccoglie risultati, tempi ed elenchi già pubblicati online da federazioni, comitati e organizzatori delle gare, e li mostra in un unico posto, con notifiche. Qui spieghiamo quali dati trattiamo, perché e quali sono i tuoi diritti.</p>

  <h2>1. Chi siamo</h2>
  <p>Il titolare del trattamento è ${t}, che gestisce Cloro. Per qualsiasi domanda o richiesta: ${mail}. Cloro non ha un responsabile della protezione dei dati (DPO), perché per un servizio come questo non è obbligatorio.</p>

  <h2>2. Di chi parla questa informativa</h2>
  <ul>
    <li>Di chi usa l'app (gli utenti).</li>
    <li>Degli atleti di cui Cloro mostra risultati, anche se non usano l'app.</li>
  </ul>

  <h2>3. Gli utenti dell'app</h2>
  <div class="tabella-schede">${DATI_UTENTI.map(([dati, perche, base, tempo]) => `
    <dl class="scheda-dato">
      <dt>Dati</dt><dd>${esc(dati)}</dd>
      <dt>Perché</dt><dd>${esc(perche)}</dd>
      <dt>Base giuridica</dt><dd>${esc(base)}</dd>
      <dt>Per quanto tempo</dt><dd>${esc(tempo)}</dd>
    </dl>`).join('')}
  </div>
  <p>Sul tuo dispositivo Cloro salva copie dei dati e le tue preferenze, solo per aprirsi più in fretta e funzionare anche con poca rete. Per proteggere l'app, reCAPTCHA salva anche un cookie tecnico (_GRECAPTCHA), necessario alla sua analisi. Sono dati tecnici: non usiamo cookie di profilazione né strumenti di statistica, e non serve il tuo consenso. Non facciamo pubblicità e non vendiamo né cediamo i dati a nessuno.</p>

  <h2>4. Gli atleti</h2>
  <p><strong>Quali dati.</strong> Nome e cognome, anno di nascita, sesso, società, regione o comitato, gare nuotate con tempi, parziali, posizioni, batteria, corsia ed esito. Da questi dati Cloro calcola punti World Aquatics, personali e stagionali, Indice Cloro, Indice annata, posizioni in classifica e tempi limite raggiunti.</p>
  <p><strong>Da dove vengono.</strong> Da risultati, classifiche ed elenchi (ammessi, start list, iscritti) pubblicati online da federazioni, comitati e organizzatori delle gare: fonti accessibili al pubblico. Se ce lo chiedi, ti diciamo da quali fonti vengono i tuoi dati.</p>
  <p><strong>Perché.</strong> Per permettere a nuotatori, famiglie, allenatori e appassionati di consultare in un unico posto risultati, progressi e classifiche, e di ricevere notifiche sugli atleti che seguono.</p>
  <p><strong>Base giuridica.</strong> Il legittimo interesse di Cloro e dei suoi utenti a informarsi sullo sport (art. 6.1.f GDPR). Lo abbiamo valutato tenendo conto dei diritti degli atleti, con attenzione particolare ai minori, e abbiamo scelto queste protezioni:</p>
  <ul>
    <li>risultati e schede si vedono solo dopo l'accesso, e non sono visibili ai motori di ricerca;</li>
    <li>niente foto, contatti o luoghi di allenamento;</li>
    <li>ogni account può seguire al massimo 10 atleti;</li>
    <li>controlliamo gli account che seguono molti ragazzi di società diverse, e possiamo sospenderli;</li>
    <li>per gli atleti sotto i 14 anni le notifiche non riportano il titolo del documento;</li>
    <li>chiunque può chiedere di togliere la propria scheda, o quella del figlio (punto 5).</li>
  </ul>
  <p><strong>Testi dei documenti.</strong> Leggiamo il testo degli elenchi pubblicati dal Comitato per avvisare chi segue un atleta quando compare in un elenco. Questi testi li cancelliamo a fine stagione.</p>
  <p><strong>Per quanto tempo.</strong> I risultati restano come archivio sportivo finché Cloro esiste, salvo richiesta di toglierli.</p>
  <p><strong>Punteggi e classifiche.</strong> Sono calcoli automatici sui tempi. Non prendiamo decisioni automatiche che abbiano effetti giuridici o simili sulle persone.</p>

  <h2>5. Togliere una scheda o chiedere "Solo risultati"</h2>
  <p>L'atleta (dai 14 anni) o un genitore possono chiedere:</p>
  <ul>
    <li><strong>Togli questa scheda:</strong> Cloro cancella scheda, storico, presenze in classifiche e squadre. Nelle gare al posto del nome compare "Atleta nascosto". Niente più notifiche, e i suoi dati non vengono più caricati.</li>
    <li><strong>Solo risultati:</strong> la scheda resta, ma chi segue l'atleta non riceve più l'avviso quando compare negli elenchi (ammessi, start list, iscritti).</li>
  </ul>
  <p><strong>Come.</strong> Dalla scheda dell'atleta, "Sei questo atleta o un suo genitore?", oppure scrivendo a ${mail}. Per verificare che sei l'atleta o il genitore chiediamo sempre una foto della tessera federale dell'atleta in cui si vedano solo nome e numero: il numero da solo non basta. Mentre verifichiamo, la scheda viene subito tolta dalla ricerca. Dopo la verifica applichiamo la richiesta entro 48 ore. I dati usati per la verifica li cancelliamo entro 30 giorni dalla chiusura della richiesta: teniamo solo una nota con data ed esito.</p>

  <h2>6. Chi tratta i dati per conto di Cloro, e dove</h2>
  <ul>
    <li><strong>Google (Firebase e reCAPTCHA):</strong> account, database, notifiche, sito e protezione dai programmi automatici. I database sono nell'Unione Europea; alcuni servizi, come l'accesso e l'invio delle notifiche, possono trattare dati negli Stati Uniti.</li>
    <li><strong>GitHub (Microsoft):</strong> esegue il programma che raccoglie i risultati e aggiorna i dati. I suoi registri tecnici restano al massimo 90 giorni.</li>
    <li><strong>Apple:</strong> consegna le notifiche su iPhone e iPad.</li>
  </ul>
  <p>I trasferimenti fuori dall'Unione Europea avvengono con le garanzie previste dal GDPR (decisione di adeguatezza UE-USA o clausole contrattuali standard). Nessun altro ha accesso ai dati oltre al titolare.</p>

  <h2>7. I tuoi diritti</h2>
  <p>Puoi chiedere in ogni momento di accedere ai tuoi dati (comprese le fonti da cui vengono), correggerli, cancellarli, limitarne l'uso, opporti al trattamento e, per i dati del tuo account, riceverli in un formato leggibile. Puoi togliere il permesso alle notifiche dalle impostazioni del dispositivo. Scrivi a ${mail}: rispondiamo entro un mese. Se pensi che i tuoi dati siano trattati in modo scorretto, puoi fare reclamo al Garante per la protezione dei dati personali.</p>

  <h2>8. Minori</h2>
  <p>Per iscriversi a Cloro da soli servono almeno 14 anni. Sotto i 14 anni si usa l'account di un genitore. Se scopriamo un account di una persona sotto i 14 anni iscritta da sola, lo cancelliamo. Per gli atleti minorenni, i diritti del punto 7 li possono esercitare anche i genitori.</p>

  <h2>9. Sicurezza</h2>
  <p>I dati sono protetti da regole d'accesso nei database: ognuno vede solo le proprie scelte, e i dati sportivi solo dopo l'accesso. Gli account di gestione hanno la verifica in due passaggi. Se succede un incidente che mette a rischio i dati, avvisiamo il Garante e, se serve, le persone coinvolte.</p>

  <h2>10. Modifiche</h2>
  <p>Se cambiamo questa informativa in modo importante, lo diciamo nell'app. La data in alto indica l'ultima versione.</p>`;

const termini = () => `
  <h1 class="titolo-pagina">Termini d'uso</h1>
  <p class="nota">Ultimo aggiornamento: 18 novembre 2026</p>
  <p>Questi termini sono le regole per usare Cloro. Iscrivendoti dichiari di averli letti e di accettarli, insieme all'${link('privacy', 'informativa privacy')}.</p>

  <h2>1. Cos'è Cloro</h2>
  <p>Cloro è un servizio gratuito che raccoglie risultati, tempi ed elenchi di gare di nuoto già pubblicati online e li mostra in un unico posto, con notifiche. È gestito da ${t} (${mail}).</p>
  <p>Cloro è un servizio non ufficiale: non è collegato a federazioni, comitati od organizzatori. Fanno fede solo i risultati e le comunicazioni ufficiali.</p>

  <h2>2. Chi può usarlo</h2>
  <ul>
    <li>Per iscriversi da soli servono almeno 14 anni.</li>
    <li>Sotto i 14 anni si usa l'account di un genitore, che ne è responsabile.</li>
    <li>Ogni account è personale: tieni segreta la password e avvisaci se pensi che qualcuno la usi al posto tuo.</li>
  </ul>

  <h2>3. Come puoi usarlo</h2>
  <p>Puoi consultare Cloro e ricevere le notifiche per uso personale e non commerciale: seguire te stesso, i tuoi figli, i tuoi atleti, i tuoi compagni o lo sport che ti piace.</p>

  <h2>4. Cosa non è permesso</h2>
  <ul>
    <li>Copiare, scaricare o raccogliere i dati in modo automatico o in massa (programmi, script, robot), o ripubblicarli altrove.</li>
    <li>Usare Cloro per contattare, seguire, avvicinare o molestare atleti, in particolare minorenni, fuori dal normale contesto sportivo.</li>
    <li>Usare risultati, punteggi e classifiche per offendere, deridere o mettere in difficoltà qualcuno.</li>
    <li>Fingersi un atleta o un genitore, per esempio per togliere o cambiare la scheda di un altro.</li>
    <li>Cercare di entrare in parti riservate, aggirare i limiti del servizio o sovraccaricarlo.</li>
    <li>Usare Cloro o i suoi dati per scopi commerciali senza il nostro permesso scritto.</li>
  </ul>

  <h2>5. Controlli e sospensione</h2>
  <p>Per proteggere gli atleti, soprattutto i più giovani, controlliamo gli usi anomali, come descritto nell'${link('privacy', 'informativa privacy')}. Se un account viola questi termini possiamo avvisarlo, sospenderlo o chiuderlo, anche senza preavviso nei casi gravi. Se c'è il sospetto di un reato, possiamo segnalarlo alle autorità.</p>

  <h2>6. Dati, errori e stime</h2>
  <p>I dati vengono da fonti pubbliche e da calcoli automatici. Possono contenere errori, ritardi o mancanze, anche se li controlliamo. Punti, indici, classifiche, proiezioni e tempi limite sono informazioni non ufficiali: prima di decisioni importanti (iscrizioni, qualificazioni, orari) controlla sempre i documenti ufficiali. Se trovi un errore, segnalacelo e lo correggiamo.</p>

  <h2>7. Notifiche</h2>
  <p>Facciamo il possibile perché le notifiche arrivino in tempo, ma non possiamo garantirlo: dipendono anche dalle fonti, dalla rete e dal tuo dispositivo. Non affidarti solo a Cloro per orari, iscrizioni e scadenze.</p>

  <h2>8. Disponibilità del servizio</h2>
  <p>Cloro è gratuito e può cambiare, fermarsi per un periodo o chiudere in qualsiasi momento, anche senza preavviso. Funzioni e dati disponibili possono cambiare nel tempo.</p>

  <h2>9. Responsabilità</h2>
  <p>Nei limiti consentiti dalla legge, Cloro non risponde di danni dovuti a errori, ritardi o mancanze nei dati, a notifiche non arrivate o all'interruzione del servizio. Restano salvi i casi di dolo o colpa grave e i diritti che la legge non permette di escludere.</p>

  <h2>10. Nome, marchio e contenuti</h2>
  <p>Il nome e il logo Cloro, la grafica, il codice dell'app e i calcoli come l'Indice Cloro e l'Indice annata appartengono a chi gestisce Cloro. I risultati sportivi sono fatti pubblicati dalle loro fonti. I marchi di altri, come World Aquatics, appartengono ai loro titolari e sono citati solo per spiegare come calcoliamo i punti.</p>

  <h2>11. Chiudere l'account</h2>
  <p>Puoi eliminare l'account quando vuoi da Impostazioni → Elimina il mio account. Gli account non usati da 36 mesi vengono cancellati, con un avviso prima.</p>

  <h2>12. Modifiche ai termini</h2>
  <p>Se cambiamo questi termini in modo importante lo diciamo nell'app, e prima di continuare ti chiediamo di accettare la nuova versione. Se non la accetti, puoi eliminare l'account.</p>

  <h2>13. Legge applicabile e contatti</h2>
  <p>Questi termini seguono la legge italiana. Se sei un consumatore, resta competente il giudice del luogo dove abiti. Per domande e segnalazioni: ${mail}.</p>`;

const sicurezza = () => `
  <h1 class="titolo-pagina">Sicurezza e minori</h1>
  <p>Molti atleti su Cloro sono ragazzi e bambini. Per questo Cloro mostra solo i risultati sportivi, e solo a chi ha fatto l'accesso.</p>

  <h2>Cosa mostra Cloro</h2>
  <ul>
    <li>Nome, anno di nascita, società e regione dell'atleta.</li>
    <li>Gare, tempi, parziali, posizioni e punteggi calcolati da questi.</li>
    <li>Quando l'atleta compare in un elenco pubblicato dal Comitato (ammessi, start list, iscritti).</li>
  </ul>
  <p>Sono informazioni già pubblicate da federazioni, comitati e organizzatori delle gare.</p>

  <h2>Cosa non mostra, mai</h2>
  <ul>
    <li>Foto e video.</li>
    <li>Indirizzi, telefoni, email o profili social.</li>
    <li>Dove e quando un atleta si allena.</li>
  </ul>

  <h2>Come proteggiamo i più giovani</h2>
  <ul>
    <li>Risultati e schede si vedono solo dopo l'accesso, e non sui motori di ricerca.</li>
    <li>Ogni account può seguire al massimo 10 atleti.</li>
    <li>Controlliamo gli account che seguono molti ragazzi sotto i 14 anni di società diverse: chi gestisce Cloro valuta ogni caso e può sospendere l'account.</li>
    <li>Per gli atleti sotto i 14 anni le notifiche dicono solo che c'è un elenco nuovo: i dettagli si vedono aprendo l'app.</li>
    <li>Copiare i dati in massa o usare Cloro per avvicinare un atleta fuori dallo sport è vietato dai ${link('termini', 'Termini d\'uso')}.</li>
  </ul>

  <h2>Togliere una scheda o chiedere "Solo risultati"</h2>
  <p>Se sei l'atleta (dai 14 anni) o un genitore puoi chiedere:</p>
  <ul>
    <li><strong>Togli questa scheda:</strong> la scheda sparisce da ricerca, classifiche e squadre, nelle gare compare "Atleta nascosto" e non partono più notifiche.</li>
    <li><strong>Solo risultati:</strong> la scheda resta, ma chi segue l'atleta non viene avvisato quando compare negli elenchi.</li>
  </ul>

  <h2>Come fare</h2>
  <ol>
    <li>Apri la scheda dell'atleta e tocca "Sei questo atleta o un suo genitore?", oppure scrivi a ${mail}.</li>
    <li>Per verificare che sei l'atleta o il genitore ti chiediamo una foto della tessera federale dell'atleta in cui si vedano solo nome e numero (copri il resto). Il numero da solo non basta.</li>
    <li>Intanto la scheda viene subito tolta dalla ricerca.</li>
    <li>Dopo la verifica, applichiamo la richiesta entro 48 ore e ti avvisiamo.</li>
  </ol>
  <p>I dati usati per la verifica li cancelliamo entro 30 giorni dalla chiusura della richiesta.</p>

  <h2>Segnalare un problema</h2>
  <p>Se pensi che qualcuno stia usando Cloro per infastidire un atleta, scrivi subito a ${mail}: lo esaminiamo per primo. Se c'è un pericolo per qualcuno, chiama il 112.</p>`;

const DOMANDE = [
  ['Cos\'è Cloro?', 'Un\'app gratuita per seguire il nuoto: gare quasi in diretta, schede atleta con personali e punti, classifiche, tempi limite e notifiche quando esce un tempo o un elenco.'],
  ['È l\'app ufficiale della federazione o del Comitato?', 'No. Cloro è un servizio non ufficiale e non è collegato a federazioni, comitati od organizzatori. Fanno fede solo i risultati e le comunicazioni ufficiali.'],
  ['Quanto costa?', 'Niente. Non c\'è pubblicità e non vendiamo dati.'],
  ['Da dove vengono i dati?', 'Da risultati, classifiche ed elenchi già pubblicati online da federazioni, comitati e organizzatori delle gare.'],
  ['Perché devo fare l\'accesso?', 'Perché molti atleti sono minorenni: i loro risultati li vede solo chi è iscritto, e non finiscono sui motori di ricerca.'],
  ['Come si installa?', 'Cloro funziona solo come app installata. Su Android apri il sito con Chrome e scegli "Installa app". Su iPhone apri il sito con Safari, tocca Condividi e poi "Aggiungi alla schermata Home". Sul computer usa Chrome o Edge e l\'icona di installazione nella barra dell\'indirizzo.'],
  ['Le notifiche non arrivano. Cosa faccio?', 'Controlla di aver aperto Cloro dall\'icona sulla schermata Home e di aver permesso le notifiche. Su iPhone serve un sistema aggiornato. Poi controlla in Impostazioni che gli avvisi che vuoi siano attivi.'],
  ['Cos\'è l\'Indice Cloro?', 'Un numero unico per atleta: la media pesata (50%, 30%, 20%) dei punti delle sue tre gare migliori della stagione.'],
];

const domande = () => `
  <h1 class="titolo-pagina">Domande frequenti</h1>
  ${DOMANDE.map(([d, r]) => `<h2>${esc(d)}</h2><p>${esc(r)}</p>`).join('')}
  <h2>Ho trovato un tempo sbagliato.</h2>
  <p>Scrivicelo da Consigli nell'app, oppure a ${mail}, con nome dell'atleta, gara e data: lo controlliamo e lo correggiamo.</p>
  <h2>Non voglio comparire, o non voglio che compaia mio figlio.</h2>
  <p>Si può togliere la scheda o chiedere "Solo risultati": trovi come nella pagina ${link('sicurezza', 'Sicurezza e minori')}.</p>`;

export const PAGINE_LEGALI = {
  privacy, termini, sicurezza, domande,
};

/** Una delle quattro pagine (anche senza accesso e dal browser). */
export function vistaTestoLegale(nome) {
  const pagina = PAGINE_LEGALI[nome] ?? privacy;
  disegna(`
    ${barraTop({ indietro: true })}
    <main class="pagina testo-lungo">
      ${pagina()}
      <p class="nota piede-legale">${link('privacy', 'Privacy')} · ${link('termini', 'Termini')} · ${link('sicurezza', 'Sicurezza e minori')} · ${link('domande', 'Domande frequenti')}</p>
    </main>`, null, { classeBody: 'senza-tab' });
}
