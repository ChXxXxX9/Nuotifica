// Sezione Admin (anche dal computer, con l'app installata): panoramica e lavori, consigli, annunci, tempi limite,
// categorie, richieste sulle schede, segnali sugli account, atleti nascosti, utenti.
import {
  stato, api, esc, barraTop, disegna, caricamento, paginaErrore, ICONE, avviso, conAttesa, mostraErrore, percorso,
  parametriHash, conCache, impostaNascosti,
} from './nucleo.js';
import {
  quando, tempo, nomeGara, nomeStagione, stagioneCorrente, impostaRegoleCategorie, regoleCategorie,
} from './formato.js';
import {
  regoleInTesto, regoleDaTesto, nomeCodice, anniCodice,
} from './categorie.js';
import { leggiFileLimiti, leggiTabellaLimiti, righeDaTesto, modelloCsv } from './tabella-limiti.js';
import { GARE, leggiTempo } from './viste-classifiche.js';
import { cerca } from './viste-atleti.js';
import { eAdmin } from './viste-consigli.js';
import { comprimiFoto } from './viste-privacy.js';

const SEZIONI = [
  ['panoramica', 'Panoramica'], ['consigli', 'Consigli'], ['annunci', 'Annunci'], ['limiti', 'Tempi limite'],
  ['categorie', 'Categorie'], ['richieste', 'Richieste'], ['segnali', 'Segnali'], ['nascosti', 'Atleti nascosti'], ['utenti', 'Utenti'],
];
const NOME_TIPO = {
  idea: 'Idea', problema: 'Problema', altro: 'Altro', errore: 'Errore nei dati',
};
const STATI = { nuovo: 'Inviato', letto: 'Letto', fatto: 'Fatto!' };
const LAVORI = {
  stagione: 'Rileggi una stagione delle graduatorie', testi: 'Rileggi il testo dei PDF', prova: 'Notifica di prova', gara: 'Rileggi una gara',
};
const COLONNE = ['*', 'EB', 'EA', 'R', 'R14', 'R1', 'R2', 'J', 'J1', 'J2', 'C', 'S'];
// Le categorie dei tempi limite FIN: R14 (solo maschi), R1, R2, J1, J2, Cadetti/e.
const COLONNE_BASE = ['R14', 'R1', 'R2', 'J1', 'J2', 'C'];
const nomeColonna = (c, sx = 'M') => nomeCodice(c, sx);
const qui = () => percorso() === 'admin';

function pagina(sez, corpo) {
  return `
    ${barraTop({ indietro: true, titolo: 'Admin' })}
    <main class="pagina pagina-admin">
      <h1 class="titolo-pagina">Admin</h1>
      <nav class="filtri menu-sezione" aria-label="Sezioni admin">
        ${SEZIONI.map(([id, nome]) => `<a class="chip" href="#/admin?sez=${id}" ${id === sez ? 'aria-current="true"' : ''}>${nome}</a>`).join('')}
      </nav>
      ${corpo}
    </main>`;
}

export async function vistaAdmin() {
  if (!stato.admin && !(await eAdmin())) {
    disegna(`${barraTop({ indietro: true })}<main class="pagina"><h1 class="titolo-pagina">Solo per chi gestisce Cloro</h1><p class="intro">Questa sezione non è disponibile per il tuo account.</p></main>`);
    return;
  }
  stato.admin = true;
  const sez = parametriHash().get('sez') ?? 'panoramica';
  const vista = {
    panoramica, consigli, annunci, limiti, categorie, richieste, segnali, nascosti, utenti,
  }[sez] ?? panoramica;
  try {
    await vista();
  } catch (err) {
    if (qui()) paginaErrore(err);
  }
}

/* ---------- panoramica e lavori ---------- */

async function panoramica() {
  caricamento('Apro la sezione admin…');
  const dati = await api.datiAdmin();
  if (!qui()) return;
  const s = dati.stato ?? {};
  const b = dati.budget ?? {};
  const corrente = Number(stagioneCorrente());
  const stagioni = [];
  for (let x = corrente; x >= 2018; x--) stagioni.push(x);
  disegna(pagina('panoramica', `
    <div class="cifre" style="margin-top:10px">
      <div class="cifra"><b>${dati.utenti ?? '–'}</b><small>Iscritti</small></div>
      <div class="cifra"><b>${dati.atleti ?? '–'}</b><small>Atleti</small></div>
      <div class="cifra"><b>${dati.squadre ?? '–'}</b><small>Squadre</small></div>
      <div class="cifra"><b>${(dati.consigli ?? []).filter((c) => c.stato === 'nuovo').length}</b><small>Consigli nuovi</small></div>
    </div>
    <div class="griglia-admin">
      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">Sistema</h2></div>
        <ul class="elenco elenco-admin">
          <li class="scheda"><b>Ultimo controllo avvisi</b><span>${esc(s.ultimoControllo ? quando(new Date(s.ultimoControllo)) : '–')} · ${esc(s.esito ?? '')}</span></li>
          <li class="scheda"><b>Scritture su Firestore oggi</b><span>${(b.scritture ?? 0) + (dati.budgetGrad?.scritture ?? 0)} su 20.000 (controllore ${b.scritture ?? 0}, graduatorie ${dati.budgetGrad?.scritture ?? 0})</span></li>
          <li class="scheda"><b>Testi dei PDF letti</b><span>${dati.testi ?? 0} documenti</span></li>
          ${s.messaggio ? `<li class="scheda"><b>Ultimo messaggio</b><span>${esc(String(s.messaggio).slice(0, 200))}</span></li>` : ''}
        </ul>
      </section>
      <section class="sezione">
        <div class="sezione-testa"><h2 class="sezione-titolo">Graduatorie lette</h2></div>
        <ul class="stagioni-lette">${stagioni.map((x) => {
    const fatta = dati.graduatorie?.[x];
    return `<li class="${fatta ? 'fatta' : ''}"><b>${nomeStagione(x)}</b><small>${fatta ? esc(quando(new Date(fatta))) : 'da leggere'}</small></li>`;
  }).join('')}</ul>
      </section>
    </div>
    <section class="sezione">
      <div class="sezione-testa"><h2 class="sezione-titolo">Lavori per il controllore</h2></div>
      <p class="nota" style="margin-bottom:10px">Partono al prossimo giro (entro 5 minuti). Le stagioni si leggono di notte o subito se c'è spazio nel limite giornaliero.</p>
      <form class="modulo riga-lavoro" data-lavoro="stagione">
        <select name="stagione" aria-label="Stagione">${stagioni.map((x) => `<option value="${x}">${nomeStagione(x)}</option>`).join('')}</select>
        <button class="bottone bottone-piccolo" type="submit">${ICONE.aggiorna}<span>Rileggi la stagione</span></button>
      </form>
      <form class="modulo riga-lavoro" data-lavoro="gara">
        <input name="gara" placeholder="Id della gara (dall'indirizzo, es. l20261107-…)" aria-label="Id della gara">
        <button class="bottone bottone-piccolo" type="submit">${ICONE.aggiorna}<span>Rileggi la gara</span></button>
      </form>
      <div class="riga-lavoro">
        <button class="bottone bottone-secondario bottone-piccolo" data-lavoro-semplice="testi">Rileggi il testo dei PDF</button>
        <button class="bottone bottone-secondario bottone-piccolo" data-lavoro-semplice="prova">${ICONE.campana}<span>Notifica di prova a me</span></button>
      </div>
      ${dati.lavori?.length ? `<ul class="elenco elenco-admin" style="margin-top:12px">${dati.lavori.map((l) => `
        <li class="scheda"><b>${esc(LAVORI[l.tipo] ?? l.tipo)}${l.stagione ? ` ${esc(nomeStagione(l.stagione))}` : ''}${l.gara ? ` ${esc(l.gara)}` : ''}</b>
          <span>${esc(quando(l.creato))} · ${esc(l.stato === 'fatto' ? `fatto${l.esito ? `: ${l.esito}` : ''}` : l.stato === 'errore' ? `errore: ${l.esito ?? ''}` : 'in attesa')}</span></li>`).join('')}</ul>` : ''}
    </section>`), (el) => {
    el.querySelectorAll('form[data-lavoro]').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tipo = f.dataset.lavoro;
      const dati2 = tipo === 'stagione' ? { stagione: String(f.stagione.value) } : { gara: f.gara.value.trim() };
      if (tipo === 'gara' && !dati2.gara) return;
      try {
        await conAttesa(f.querySelector('button'), () => api.creaLavoro(tipo, dati2));
        avviso('Lavoro in coda.');
        panoramica();
      } catch (err) {
        avviso(err.message, 'errore');
      }
    }));
    el.querySelectorAll('[data-lavoro-semplice]').forEach((x) => x.addEventListener('click', async () => {
      try {
        await conAttesa(x, () => api.creaLavoro(x.dataset.lavoroSemplice));
        avviso('Lavoro in coda.');
        panoramica();
      } catch (err) {
        avviso(err.message, 'errore');
      }
    }));
  }, { classeBody: 'senza-tab' });
}

/* ---------- consigli ---------- */

async function consigli() {
  caricamento('Carico i consigli…');
  const dati = await api.datiAdmin();
  if (!qui()) return;
  const filtro = stato.filtroAdmin ?? 'nuovo';
  const elenco = dati.consigli.filter((c) => filtro === 'tutti' || c.stato === filtro);
  disegna(pagina('consigli', `
    <div class="filtri" role="toolbar" aria-label="Filtra i consigli">
      ${[['nuovo', 'Nuovi'], ['letto', 'Letti'], ['fatto', 'Fatti'], ['tutti', 'Tutti']].map(([id, nome]) => `<button class="chip" data-filtro-admin="${id}" aria-pressed="${filtro === id}">${nome}</button>`).join('')}
    </div>
    ${elenco.length ? `<ul class="elenco griglia-consigli">${elenco.map((c) => `
      <li class="scheda consiglio" data-id="${esc(c.id)}">
        <div class="consiglio-testa"><span class="tipo">${esc(NOME_TIPO[c.tipo] ?? 'Altro')}</span><span>${esc(quando(c.creato))} · ${esc(c.dispositivo ?? '')}</span><span class="stato-consiglio stato-${esc(c.stato)}">${esc(STATI[c.stato] ?? c.stato)}</span></div>
        ${c.rif ? `<p class="nota">Riguarda: <b>${esc(c.rif)}</b></p>` : ''}
        <p>${esc(c.testo)}</p>
        <textarea rows="2" maxlength="500" placeholder="Rispondi (la vede chi l'ha scritto)" aria-label="Risposta">${esc(c.risposta ?? '')}</textarea>
        <div class="dettaglio-azioni">
          <button class="bottone bottone-secondario bottone-piccolo" data-segna="letto">Letto</button>
          <button class="bottone bottone-piccolo" data-segna="fatto">Fatto</button>
        </div>
      </li>`).join('')}</ul>` : '<p class="nota">Nessun consiglio qui.</p>'}`), (el) => {
    el.querySelectorAll('[data-filtro-admin]').forEach((x) => x.addEventListener('click', () => {
      stato.filtroAdmin = x.dataset.filtroAdmin;
      consigli();
    }));
    el.querySelectorAll('[data-segna]').forEach((x) => x.addEventListener('click', async () => {
      const li = x.closest('[data-id]');
      try {
        await conAttesa(x, () => api.aggiornaConsiglio(li.dataset.id, { stato: x.dataset.segna, risposta: li.querySelector('textarea').value.trim() }));
        avviso('Salvato.');
        consigli();
      } catch (err) {
        avviso(err.message, 'errore');
      }
    }));
  }, { classeBody: 'senza-tab' });
}

/* ---------- annunci ---------- */

async function annunci() {
  caricamento('Carico gli annunci…');
  const dati = await api.datiAdmin();
  if (!qui()) return;
  disegna(pagina('annunci', `
    <form class="modulo" data-annuncio novalidate style="max-width:560px">
      <label class="campo">Titolo<input name="titolo" maxlength="60" required placeholder="Es. Nuove classifiche in Cloro"></label>
      <label class="campo">Testo<textarea name="corpo" rows="3" maxlength="180" required placeholder="Arriva come notifica a tutti gli iscritti"></textarea></label>
      <label class="campo">Dove porta (facoltativo)<input name="url" maxlength="120" placeholder="es. #/classifiche"></label>
      <p class="errore" data-errore hidden></p>
      <button class="bottone" type="submit">${ICONE.campana}<span>Manda la notifica a tutti</span></button>
      <p class="nota">Parte al prossimo giro del controllore (entro 5 minuti).</p>
    </form>
    ${dati.annunci.length ? `<ul class="elenco elenco-admin" style="margin-top:12px">${dati.annunci.map((a) => `
      <li class="scheda"><b>${esc(a.titolo)}</b><span>${esc(a.stato === 'inviato' ? `Inviato ${quando(a.inviato)} · ${a.notifiche ?? 0} notifiche` : 'In attesa del prossimo giro')}</span></li>`).join('')}</ul>` : ''}`), (el) => {
    const modulo = el.querySelector('[data-annuncio]');
    modulo.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titolo = modulo.titolo.value.trim();
      const corpo = modulo.corpo.value.trim();
      const url = modulo.url.value.trim();
      if (!titolo || !corpo) {
        mostraErrore(modulo, new Error('Scrivi titolo e testo.'));
        return;
      }
      if (url && !/^#\//.test(url)) {
        mostraErrore(modulo, new Error('L\'indirizzo deve iniziare con #/ (una pagina di Cloro).'));
        return;
      }
      // eslint-disable-next-line no-alert
      if (!window.confirm(`Mandare "${titolo}" a tutti gli iscritti?`)) return;
      try {
        await conAttesa(modulo.querySelector('[type="submit"]'), () => api.creaAnnuncio({ titolo, corpo, ...(url ? { url } : {}) }));
        avviso('Annuncio in partenza.');
        annunci();
      } catch (err) {
        mostraErrore(modulo, err);
      }
    });
  }, { classeBody: 'senza-tab' });
}

/* ---------- tempi limite ---------- */

async function limiti() {
  caricamento('Carico i tempi limite…');
  const tutti = await api.leggiLimiti();
  if (!qui()) return;
  const id = parametriHash().get('id');
  if (id) {
    editorLimite(tutti.find((l) => l.id === id) ?? null);
    return;
  }
  const ordinati = [...tutti].sort((a, b) => String(b.st).localeCompare(String(a.st)) || a.nome.localeCompare(b.nome, 'it'));
  disegna(pagina('limiti', `
    <p class="intro">Inserisci i tempi limite (Regionali, Criteria, Assoluti…). Quando li pubblichi arriva una notifica a tutti; poi ogni tempo nuovo sotto il limite fa partire "ha preso il limite!".</p>
    <a class="bottone" href="#/admin?sez=limiti&id=nuovo" style="margin:10px 0 16px">+ Nuovi tempi limite</a>
    ${ordinati.length ? `<ul class="elenco elenco-admin">${ordinati.map((l) => `
      <li class="scheda riga-limite">
        <a href="#/admin?sez=limiti&id=${encodeURIComponent(l.id)}"><b>${esc(l.nome)}</b><span>${esc(`${nomeStagione(l.st)} · vasca ${l.vasca} m · ${Object.keys(l.t ?? {}).length} tempi`)}</span></a>
        <span class="stato-consiglio stato-${l.stato === 'pubblicato' ? 'fatto' : l.stato === 'bozza' ? 'nuovo' : 'letto'}">${esc({ bozza: 'Bozza', 'da-notificare': 'In pubblicazione', pubblicato: 'Pubblicato' }[l.stato] ?? l.stato)}</span>
      </li>`).join('')}</ul>` : '<p class="nota">Ancora nessuno.</p>'}`), null, { classeBody: 'senza-tab' });
}

function editorLimite(l) {
  const corrente = Number(stagioneCorrente());
  const nuovo = !l;
  const dati = {
    nome: l?.nome ?? '', st: String(l?.st ?? corrente), vasca: Number(l?.vasca ?? 25), t: { ...(l?.t ?? {}) }, stato: l?.stato ?? 'bozza',
  };
  const usate = new Set(Object.keys(dati.t).map((k) => k.split('|')[2]));
  let colonne = COLONNE.filter((c) => usate.has(c));
  if (!colonne.length) colonne = [...COLONNE_BASE];
  let sesso = 'M';
  const colonneSesso = () => colonne.filter((c) => sesso === 'M' || c !== 'R14');

  const ridisegna = (aggiornamento = false) => {
    disegna(pagina('limiti', `
      <a class="link" href="#/admin?sez=limiti">← Tutti i tempi limite</a>
      <form class="modulo editor-limite" novalidate>
        <div class="riga-campi">
          <label class="campo">Nome<input name="nome" maxlength="80" required value="${esc(dati.nome)}" placeholder="Es. Criteria Nazionali Giovanili 2027"></label>
          <label class="campo">Stagione<select name="st">${[corrente + 1, corrente, corrente - 1].map((x) => `<option value="${x}" ${String(x) === dati.st ? 'selected' : ''}>${nomeStagione(x)}</option>`).join('')}</select></label>
          <label class="campo">Vasca<select name="vasca">${[25, 50].map((v) => `<option value="${v}" ${v === dati.vasca ? 'selected' : ''}>${v} m</option>`).join('')}</select></label>
        </div>
        <section class="carica-file">
          <b>Carica da file</b>
          <p class="nota">Un file Excel (.xlsx) o CSV con una riga per gara e sesso e una colonna per categoria. Scarica il modello, compilalo e ricaricalo: si riempie tutto da solo.</p>
          <div class="riga-lavoro">
            <label class="bottone bottone-piccolo">Scegli il file<input type="file" data-file accept=".csv,.txt,.xlsx,.xls" hidden></label>
            <button type="button" class="bottone bottone-secondario bottone-piccolo" data-modello>Scarica il modello</button>
          </div>
        </section>
        <fieldset class="colonne-limite"><legend>Categorie (colonne)</legend>
          ${COLONNE.filter((c) => sesso === 'M' || c !== 'R14').map((c) => `<label class="gettone"><input type="checkbox" data-colonna="${c}" ${colonne.includes(c) ? 'checked' : ''}><span class="gettone-testo">${esc(nomeColonna(c, sesso))}</span></label>`).join('')}
        </fieldset>
        <div class="segmenti" role="tablist" aria-label="Sesso">
          ${['M', 'F'].map((x) => `<button type="button" class="segmento" data-sesso="${x}" aria-selected="${sesso === x}">${x === 'M' ? 'Maschi' : 'Femmine'}</button>`).join('')}
        </div>
        <div class="tabella-scorre">
          <table class="tabella-limiti tabella-modifica">
            <thead><tr><th>Gara</th>${colonneSesso().map((c) => {
    const anni = c === '*' ? null : anniCodice(c, sesso, dati.st, regoleCategorie());
    return `<th>${esc(nomeColonna(c, sesso))}${anni ? `<small class="anni-colonna">${anni.dal === anni.al ? `nat${sesso === 'F' ? 'e' : 'i'} nel ${anni.dal}` : `${anni.dal}–${anni.al}`}</small>` : ''}</th>`;
  }).join('')}</tr></thead>
            <tbody>${GARE.map((g) => `<tr><th>${esc(nomeGara(g, { breve: true }))}</th>${colonneSesso().map((c) => {
    const v = dati.t[`${g}|${sesso}|${c}`];
    return `<td><input data-cella="${g}|${sesso}|${c}" inputmode="decimal" value="${v ? esc(tempo(v)) : ''}" aria-label="${esc(`${nomeGara(g, { breve: true })} ${nomeColonna(c, sesso)}`)}"></td>`;
  }).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
        <details class="incolla">
          <summary>Incolla da una tabella</summary>
          <p class="nota">Come nel modello (righe con <code>;</code>) oppure una riga per tempo: <code>100SL;M;R14;58.50</code>. Categorie: R14, R1, R2, J1, J2, Cadetti, Ragazzi, Juniores, Esordienti A/B, Seniores, Tutti.</p>
          <textarea data-incolla rows="5"></textarea>
          <button type="button" class="bottone bottone-secondario bottone-piccolo" data-applica>Inserisci nella tabella</button>
        </details>
        <p class="errore" data-errore hidden></p>
        <div class="dettaglio-azioni">
          <button class="bottone bottone-secondario" type="submit" data-azione="bozza">Salva bozza</button>
          <button class="bottone" type="submit" data-azione="pubblica">${dati.stato === 'pubblicato' ? 'Salva (già pubblicato)' : 'Pubblica e avvisa tutti'}</button>
          ${nuovo ? '' : '<button class="bottone bottone-pericolo" type="button" data-elimina>Elimina</button>'}
        </div>
      </form>`), (el) => {
      const f = el.querySelector('form');
      const leggiCampi = () => {
        dati.nome = f.nome.value.trim();
        dati.st = f.st.value;
        dati.vasca = Number(f.vasca.value);
        el.querySelectorAll('[data-cella]').forEach((x) => {
          const ms = leggiTempo(x.value);
          if (ms) dati.t[x.dataset.cella] = ms;
          else delete dati.t[x.dataset.cella];
        });
      };
      el.querySelectorAll('[data-colonna]').forEach((x) => x.addEventListener('change', () => {
        leggiCampi();
        colonne = COLONNE.filter((c) => el.querySelector(`[data-colonna="${c}"]`)?.checked ?? colonne.includes(c));
        ridisegna(true);
      }));
      el.querySelectorAll('[data-sesso]').forEach((x) => x.addEventListener('click', () => {
        leggiCampi();
        sesso = x.dataset.sesso;
        ridisegna(true);
      }));
      const inserisci = ({ t, errori }) => {
        leggiCampi();
        Object.assign(dati.t, t);
        const usateOra = new Set(Object.keys(dati.t).map((x) => x.split('|')[2]));
        colonne = COLONNE.filter((c) => colonne.includes(c) || usateOra.has(c));
        ridisegna(true);
        const n = Object.keys(t).length;
        avviso(errori.length
          ? `Inseriti ${n} tempi. Da controllare: ${errori.slice(0, 2).join(' · ')}${errori.length > 2 ? ` e altre ${errori.length - 2}` : ''}`
          : `Inseriti ${n} tempi.`, errori.length && !n ? 'errore' : undefined);
      };
      el.querySelector('[data-applica]').addEventListener('click', () => {
        const testo = el.querySelector('[data-incolla]').value;
        // Una riga per tempo anche con spazi ("100SL M R14 58.50"): si trasformano in colonne.
        const righe = righeDaTesto(testo).map((r) => (r.length === 1 ? r[0].split(/\s+/) : r));
        const conIntestazione = righe.length && !/^\d/.test(righe[0][0]) ? righe : [['Gara', 'Sesso', 'Categoria', 'Tempo'], ...righe];
        inserisci(leggiTabellaLimiti(conIntestazione));
      });
      el.querySelector('[data-file]').addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          inserisci(await leggiFileLimiti(file));
        } catch (err) {
          avviso(err.message, 'errore');
        }
        e.target.value = '';
      });
      el.querySelector('[data-modello]').addEventListener('click', () => {
        const blob = new Blob([modelloCsv()], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'modello-tempi-limite-cloro.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(a.href);
          a.remove();
        }, 1000);
      });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        leggiCampi();
        const pubblica = e.submitter?.dataset.azione === 'pubblica';
        if (!dati.nome) {
          mostraErrore(f, new Error('Dai un nome ai tempi limite.'));
          return;
        }
        if (!Object.keys(dati.t).length) {
          mostraErrore(f, new Error('Inserisci almeno un tempo.'));
          return;
        }
        // eslint-disable-next-line no-alert
        if (pubblica && dati.stato !== 'pubblicato' && !window.confirm(`Pubblicare "${dati.nome}" e mandare la notifica a tutti?`)) return;
        const stato2 = dati.stato === 'pubblicato' ? 'pubblicato' : pubblica ? 'da-notificare' : 'bozza';
        try {
          const id = await conAttesa(e.submitter, () => api.salvaLimite(nuovo ? null : l.id, {
            nome: dati.nome, st: dati.st, vasca: dati.vasca, t: dati.t, stato: stato2,
          }));
          stato.cache.delete('limiti');
          avviso(stato2 === 'da-notificare' ? 'Pubblicati: la notifica parte entro 5 minuti.' : 'Salvato.');
          location.hash = `#/admin?sez=limiti${nuovo ? `&id=${encodeURIComponent(id)}` : ''}`;
          if (!nuovo) limiti();
        } catch (err) {
          mostraErrore(f, err);
        }
      });
      el.querySelector('[data-elimina]')?.addEventListener('click', async (e) => {
        // eslint-disable-next-line no-alert
        if (!window.confirm(`Eliminare "${l.nome}"?`)) return;
        try {
          await conAttesa(e.currentTarget, () => api.eliminaLimite(l.id));
          stato.cache.delete('limiti');
          location.hash = '#/admin?sez=limiti';
        } catch (err) {
          avviso(err.message, 'errore');
        }
      });
    }, { classeBody: 'senza-tab', aggiornamento });
  };
  ridisegna();
}

/* ---------- categorie ---------- */

async function categorie() {
  caricamento('Carico le categorie…');
  const salvate = await api.leggiCategorie().catch(() => null);
  if (!qui()) return;
  if (salvate) impostaRegoleCategorie(salvate);
  disegna(pagina('categorie', `
    <p class="intro">Le categorie per età servono a graduatorie, squadre (Categoria/Esordienti) e tempi limite. Età = anno di fine stagione meno anno di nascita. Una regola vale dalla stagione indicata finché non ne arriva una più nuova.</p>
    <form class="modulo" novalidate style="max-width:560px">
      <label class="campo">Regole (una per riga: stagione, sesso, categoria, età)
        <textarea name="regole" rows="16" spellcheck="false" style="font-family:ui-monospace,Menlo,monospace">${esc(regoleInTesto(regoleCategorie()))}</textarea>
      </label>
      <p class="errore" data-errore hidden></p>
      <button class="bottone" type="submit">Salva</button>
    </form>`), (el) => {
    const f = el.querySelector('form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { regole, errori } = regoleDaTesto(f.regole.value);
      if (errori.length) {
        mostraErrore(f, new Error(`Righe non valide: ${errori.slice(0, 3).join(', ')}`));
        return;
      }
      try {
        await conAttesa(f.querySelector('button'), () => api.salvaCategorie(regole));
        impostaRegoleCategorie(regole);
        avviso('Categorie salvate.');
      } catch (err) {
        mostraErrore(f, err);
      }
    });
  }, { classeBody: 'senza-tab' });
}

/* ---------- atleti nascosti ---------- */

// privato/nascosti: lo leggono solo l'admin e il controllore. Il controllore, al giro dopo, cancella i
// dati dell'atleta ovunque e nelle gare mette "Atleta nascosto"; l'app riceve solo impronte senza nomi.
async function nascosti() {
  caricamento('Carico gli atleti nascosti…');
  let elenco = await api.leggiPrivato('nascosti');
  if (!qui()) return;
  const salva = async (bottone) => {
    try {
      await conAttesa(bottone, () => api.salvaPrivato('nascosti', elenco));
      impostaNascosti(await api.leggiNascosti());
      avviso('Salvato: entro pochi minuti i suoi dati spariscono da tutto Cloro.');
      disegnaPagina();
    } catch (err) {
      avviso(err.message, 'errore');
    }
  };
  const voci = () => Object.entries(elenco).sort((x, y) => String(y[1]?.il ?? '').localeCompare(String(x[1]?.il ?? '')));
  const disegnaPagina = () => disegna(pagina('nascosti', `
    <p class="intro">Chi chiede di togliere la scheda: i suoi dati vengono cancellati da schede, ricerca, classifiche e squadre, nelle gare compare "Atleta nascosto" e non partono più notifiche. Non si ricarica più.</p>
    <label class="cerca"><span class="nascosto">Cerca un atleta</span>${ICONE.cerca}<input type="search" placeholder="Nome e cognome" autocomplete="off"></label>
    <ul class="elenco risultati-ricerca" data-trovati></ul>
    <section class="sezione">
      <div class="sezione-testa"><h2 class="sezione-titolo">Nascosti</h2><span class="nota">${voci().length}</span></div>
      ${voci().length ? `<ul class="elenco elenco-admin">${voci().map(([k, x]) => `
        <li class="scheda"><b>${esc(x?.n ?? k)}</b><small class="nota">${esc(k)}${x?.il ? ` · dal ${esc(quando(new Date(x.il)))}` : ''}</small>
          <button class="bottone bottone-secondario bottone-piccolo" data-mostra="${esc(k)}">Mostra di nuovo</button></li>`).join('')}</ul>
        <p class="nota" style="margin-top:8px">"Mostra di nuovo": i dati tornano con i prossimi caricamenti (la stagione in corso ogni notte).</p>` : '<p class="nota">Nessuno.</p>'}
    </section>`), (el) => {
    const input = el.querySelector('input');
    const box = el.querySelector('[data-trovati]');
    let attesa;
    input.addEventListener('input', () => {
      clearTimeout(attesa);
      attesa = setTimeout(async () => {
        const trovati = input.value.trim().length >= 2 ? await cerca(input.value).catch(() => []) : [];
        box.innerHTML = trovati.slice(0, 10).map((v) => `
          <li><a href="#" data-nascondi="${esc(v.k)}" data-nome="${esc(v.n)}"><b>${esc(v.n)}</b><small>${esc([v.y, v.s].filter(Boolean).join(' · '))} · Nascondi</small></a></li>`).join('');
        box.querySelectorAll('[data-nascondi]').forEach((x) => x.addEventListener('click', (e) => {
          e.preventDefault();
          if (!window.confirm(`Nascondere ${x.dataset.nome}? I suoi dati vengono cancellati da tutto Cloro.`)) return;
          elenco = { ...elenco, [x.dataset.nascondi]: { n: x.dataset.nome, il: new Date().toISOString() } };
          salva(null);
        }));
      }, 150);
    });
    el.querySelectorAll('[data-mostra]').forEach((x) => x.addEventListener('click', () => {
      const { [x.dataset.mostra]: _, ...resto } = elenco;
      elenco = resto;
      salva(x);
    }));
  }, { classeBody: 'senza-tab' });
  disegnaPagina();
}

/* ---------- richieste sulle schede ("Sei questo atleta o un suo genitore?") ---------- */

const STATI_RICHIESTA = {
  nuova: 'Da verificare',
  'in-attesa': 'In attesa: fuori dalla ricerca',
  tolta: 'Verificata: scheda tolta',
  'solo-risultati': 'Verificata: solo risultati',
  respinta: 'Respinta',
  scaduta: 'Scaduta',
};
const TIPO_RICHIESTA = { togli: 'Togli la scheda', 'solo-risultati': 'Solo risultati' };
const CHI_RICHIESTA = { atleta: 'L\'atleta', genitore: 'Un genitore' };
const APERTA = (r) => r.stato === 'nuova' || r.stato === 'in-attesa';
const giorniDa = (d) => (d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : 0);
const senza = (oggetto, k) => Object.fromEntries(Object.entries(oggetto).filter(([x]) => x !== k));

// Le azioni cambiano gli elenchi privati (privato/inAttesa, privato/nascosti, privato/soloRisultati) e lo
// stato della richiesta; il controllore, al giro dopo, toglie o rimette l'atleta nella ricerca e ne cancella i dati.
async function richieste() {
  caricamento('Carico le richieste…');
  const [elenco, inAttesa, nascostiOra, solo] = await Promise.all([
    api.leggiRichiestePrivacy(), api.leggiPrivato('inAttesa'), api.leggiPrivato('nascosti'), api.leggiPrivato('soloRisultati'),
  ]);
  if (!qui()) return;
  const filtro = stato.filtroRichieste ?? 'aperte';
  const mostrate = elenco.filter((r) => (filtro === 'aperte' ? APERTA(r) : !APERTA(r)));
  const aperte = elenco.filter(APERTA).length;

  const esegui = async (r, cosa, bottone) => {
    const nome = r.nome || r.atleta;
    const domande = {
      togli: `Togliere la scheda di ${nome}? I suoi dati vengono cancellati da tutto Cloro.`,
      solo: `Solo risultati per ${nome}? La scheda torna nella ricerca, ma senza avvisi quando compare negli elenchi.`,
      respinta: `Respingere la richiesta per ${nome}? La scheda torna nella ricerca.`,
      scaduta: `Chiudere come scaduta la richiesta per ${nome}? La scheda torna nella ricerca.`,
    };
    if (domande[cosa] && !window.confirm(domande[cosa])) return;
    const voce = { n: nome, il: new Date().toISOString() };
    // Resta fuori dalla ricerca se c'è un'altra richiesta in attesa per lo stesso atleta.
    const altraInAttesa = elenco.some((x) => x.id !== r.id && x.atleta === r.atleta && x.stato === 'in-attesa');
    const liste = { nascosti: nascostiOra, soloRisultati: solo, inAttesa };
    const nuove = {};
    let statoNuovo = cosa;
    if (cosa === 'attesa') {
      nuove.inAttesa = { ...inAttesa, [r.atleta]: voce };
      statoNuovo = 'in-attesa';
    } else {
      if (cosa === 'togli') {
        nuove.nascosti = { ...nascostiOra, [r.atleta]: voce };
        statoNuovo = 'tolta';
      } else if (cosa === 'solo') {
        nuove.soloRisultati = { ...solo, [r.atleta]: voce };
        statoNuovo = 'solo-risultati';
      }
      if (inAttesa[r.atleta] && !altraInAttesa) nuove.inAttesa = senza(inAttesa, r.atleta);
    }
    try {
      await conAttesa(bottone, async () => {
        // Prima si nasconde, poi si toglie dall'attesa: l'atleta non torna mai cercabile nel mezzo.
        for (const nomeLista of ['nascosti', 'soloRisultati', 'inAttesa']) {
          if (nuove[nomeLista] && nuove[nomeLista] !== liste[nomeLista]) await api.salvaPrivato(nomeLista, nuove[nomeLista]);
        }
        await api.aggiornaRichiestaPrivacy(r.id, statoNuovo, statoNuovo !== 'in-attesa');
      });
      impostaNascosti(await api.leggiNascosti());
      avviso({
        attesa: 'Fatto: entro pochi minuti la scheda esce dalla ricerca.',
        tolta: 'Fatto: entro pochi minuti i suoi dati spariscono da tutto Cloro. Ricordati di rispondere per email.',
        'solo-risultati': 'Fatto: niente più avvisi sugli elenchi. Ricordati di rispondere per email.',
        respinta: 'Respinta. Ricordati di rispondere per email.',
        scaduta: 'Chiusa come scaduta.',
      }[cosa === 'attesa' ? 'attesa' : statoNuovo]);
      richieste();
    } catch (err) {
      avviso(err.message, 'errore');
    }
  };

  disegna(pagina('richieste', `
    <p class="intro">Chi chiede di togliere una scheda o di avere "Solo risultati". Verifica dalla foto della tessera che sia l'atleta (almeno 14 anni) o un genitore, poi applica la richiesta entro 48 ore e rispondi per email. La foto si cancella quando chiudi la richiesta (cancella anche le email con foto); gli altri dati della verifica 30 giorni dopo.</p>
    <div class="filtri" role="toolbar" aria-label="Filtra le richieste">
      <button class="chip" data-filtro-richieste="aperte" aria-pressed="${filtro === 'aperte'}">Aperte (${aperte})</button>
      <button class="chip" data-filtro-richieste="chiuse" aria-pressed="${filtro === 'chiuse'}">Chiuse</button>
    </div>
    ${mostrate.length ? `<ul class="elenco griglia-consigli">${mostrate.map((r) => {
    const giorni = giorniDa(r.creato);
    const lunga = APERTA(r) && giorni > 15;
    return `
      <li class="scheda consiglio richiesta${lunga ? ' richiesta-lunga' : ''}" data-id="${esc(r.id)}">
        <div class="consiglio-testa"><span class="tipo">${esc(TIPO_RICHIESTA[r.tipo] ?? r.tipo ?? '')}</span><span>${esc(quando(r.creato))}${r.manuale ? ' · a mano' : ''}</span><span class="stato-consiglio">${esc(STATI_RICHIESTA[r.stato] ?? r.stato)}</span></div>
        ${r.ripulita ? '<p class="nota">Dati della verifica cancellati.</p>' : `
        <p><b>${esc(r.nome || r.atleta)}</b> <small class="nota">${esc(r.atleta ?? '')}</small></p>
        <dl class="dati-richiesta">
          <dt>Chi scrive</dt><dd>${esc(CHI_RICHIESTA[r.chi] ?? r.chi ?? '–')}</dd>
          ${r.prova ? `<dt>Note</dt><dd>${esc(r.prova)}</dd>` : ''}
          <dt>Email</dt><dd>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '–'}</dd>
          <dt>Foto</dt><dd>${!r.foto ? 'nessuna' : APERTA(r) ? '<button class="link" type="button" data-vedi-foto>Vedi la foto della tessera</button>' : 'cancellata alla chiusura'}</dd>
        </dl>
        <div class="foto-tessera" data-box-foto hidden></div>`}
        ${APERTA(r) ? `<p class="${lunga ? 'errore' : 'nota'}">${lunga ? `Aperta da ${giorni} giorni: oltre 15, rispondi o chiudila.` : (giorni ? `Aperta da ${giorni === 1 ? '1 giorno' : `${giorni} giorni`}.` : 'Aperta oggi.')}</p>` : (r.chiusa ? `<p class="nota">Chiusa ${esc(quando(r.chiusa))}.</p>` : '')}
        ${APERTA(r) ? `<div class="dettaglio-azioni azioni-richiesta">
          ${r.stato === 'nuova' ? '<button class="bottone bottone-secondario bottone-piccolo" data-fai="attesa">Nascondi in attesa</button>' : ''}
          <button class="bottone bottone-piccolo" data-fai="togli">Verificata → Togli</button>
          <button class="bottone bottone-piccolo" data-fai="solo">Verificata → Solo risultati</button>
          <button class="bottone bottone-secondario bottone-piccolo" data-fai="respinta">Respinta</button>
          <button class="bottone bottone-secondario bottone-piccolo" data-fai="scaduta">Scaduta</button>
        </div>` : ''}
      </li>`;
  }).join('')}</ul>` : `<p class="nota">${filtro === 'aperte' ? 'Nessuna richiesta aperta.' : 'Nessuna richiesta chiusa.'}</p>`}
    <section class="sezione">
      <div class="sezione-testa"><h2 class="sezione-titolo">Nuova richiesta a mano</h2></div>
      <p class="nota">Per una richiesta arrivata per email.</p>
      <form class="modulo modulo-richiesta" data-manuale novalidate style="max-width:560px">
        <label class="cerca"><span class="nascosto">Cerca l'atleta</span>${ICONE.cerca}<input type="search" data-cerca-atleta placeholder="Cerca l'atleta: nome e cognome" autocomplete="off"></label>
        <ul class="elenco risultati-ricerca" data-trovati></ul>
        <label class="campo">Chiave dell'atleta (oppure l'indirizzo della sua scheda)
          <input name="atleta" maxlength="200" autocomplete="off" placeholder="es. mario-rossi-2012" required>
        </label>
        <label class="campo">Nome dell'atleta
          <input name="nome" maxlength="80" autocomplete="off" required>
        </label>
        <fieldset>
          <legend>Cosa chiede?</legend>
          <label class="opzione"><input type="radio" name="tipo" value="togli" checked><span class="opzione-testo">Togli questa scheda</span></label>
          <label class="opzione"><input type="radio" name="tipo" value="solo-risultati"><span class="opzione-testo">Solo risultati</span></label>
        </fieldset>
        <fieldset>
          <legend>Chi scrive?</legend>
          <label class="opzione"><input type="radio" name="chi" value="atleta"><span class="opzione-testo">L'atleta (almeno 14 anni)</span></label>
          <label class="opzione"><input type="radio" name="chi" value="genitore"><span class="opzione-testo">Un genitore</span></label>
        </fieldset>
        <div class="campo-foto">
          <p class="nota">Foto della tessera (facoltativa: se è arrivata per email). Si cancella alla chiusura.</p>
          <div class="anteprima-foto" data-anteprima hidden><img alt="Foto scelta"></div>
          <label class="bottone bottone-secondario scegli-foto"><input type="file" accept="image/*" data-foto><span data-testo-foto>Aggiungi la foto</span></label>
        </div>
        <label class="campo">Note (facoltative)
          <textarea name="prova" rows="3" maxlength="300"></textarea>
        </label>
        <label class="campo">Email per rispondere
          <input type="email" name="email" maxlength="120" autocomplete="off">
        </label>
        <p class="errore" data-errore hidden></p>
        <button class="bottone" type="submit">Crea la richiesta</button>
      </form>
    </section>`), (el) => {
    el.querySelectorAll('[data-filtro-richieste]').forEach((x) => x.addEventListener('click', () => {
      stato.filtroRichieste = x.dataset.filtroRichieste;
      richieste();
    }));
    el.querySelectorAll('[data-vedi-foto]').forEach((b) => b.addEventListener('click', async () => {
      const li = b.closest('[data-id]');
      const box = li.querySelector('[data-box-foto]');
      if (!box.hidden) {
        box.hidden = true;
        box.innerHTML = '';
        b.textContent = 'Vedi la foto della tessera';
        return;
      }
      try {
        const foto = await conAttesa(b, () => api.leggiFotoRichiesta(li.dataset.id));
        box.innerHTML = foto ? `<img src="${esc(foto)}" alt="Foto della tessera">` : '<p class="nota">La foto non c\'è più.</p>';
        box.hidden = false;
        b.textContent = 'Nascondi la foto';
      } catch (err) {
        avviso(err.message, 'errore');
      }
    }));
    el.querySelectorAll('[data-fai]').forEach((x) => x.addEventListener('click', () => {
      const r = elenco.find((y) => y.id === x.closest('[data-id]').dataset.id);
      if (r) esegui(r, x.dataset.fai, x);
    }));
    const modulo = el.querySelector('[data-manuale]');
    let fotoManuale = null;
    const sceltaFoto = modulo.querySelector('[data-foto]');
    sceltaFoto.addEventListener('change', async () => {
      const file = sceltaFoto.files?.[0];
      if (!file) return;
      try {
        fotoManuale = await comprimiFoto(file);
        modulo.querySelector('[data-anteprima] img').src = fotoManuale;
        modulo.querySelector('[data-anteprima]').hidden = false;
        modulo.querySelector('[data-testo-foto]').textContent = 'Cambia foto';
      } catch (err) {
        mostraErrore(modulo, err);
      }
      sceltaFoto.value = '';
    });
    const input = el.querySelector('[data-cerca-atleta]');
    const box = el.querySelector('[data-trovati]');
    let attesa;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });
    input.addEventListener('input', () => {
      clearTimeout(attesa);
      attesa = setTimeout(async () => {
        const trovati = input.value.trim().length >= 2 ? await cerca(input.value).catch(() => []) : [];
        box.innerHTML = trovati.slice(0, 8).map((v) => `
          <li><a href="#" data-scegli="${esc(v.k)}" data-nome="${esc(v.n)}"><b>${esc(v.n)}</b><small>${esc([v.y, v.s].filter(Boolean).join(' · '))}</small></a></li>`).join('');
        box.querySelectorAll('[data-scegli]').forEach((a) => a.addEventListener('click', (e) => {
          e.preventDefault();
          modulo.atleta.value = a.dataset.scegli;
          modulo.nome.value = a.dataset.nome;
          box.innerHTML = '';
        }));
      }, 150);
    });
    modulo.addEventListener('submit', async (e) => {
      e.preventDefault();
      el.querySelector('[data-errore]').hidden = true;
      let k = modulo.atleta.value.trim();
      const daIndirizzo = k.match(/#\/atleta\/([^?&#]+)/);
      if (daIndirizzo) k = decodeURIComponent(daIndirizzo[1]);
      if (!/^[a-z0-9-]{3,80}$/.test(k)) return mostraErrore(modulo, new Error('Scrivi la chiave dell\'atleta (lettere minuscole, numeri e trattini), o sceglilo dalla ricerca.'));
      if (!modulo.chi.value) return mostraErrore(modulo, new Error('Scegli chi ha scritto.'));
      try {
        await conAttesa(modulo.querySelector('[type="submit"]'), () => api.inviaRichiestaPrivacy(stato.utente.uid, {
          atleta: k,
          nome: (modulo.nome.value.trim() || k).slice(0, 80),
          tipo: modulo.tipo.value,
          chi: modulo.chi.value,
          prova: modulo.prova.value.trim().slice(0, 300),
          email: modulo.email.value.trim().slice(0, 120),
          foto: fotoManuale,
          manuale: true,
        }));
        avviso('Richiesta creata.');
        stato.filtroRichieste = 'aperte';
        richieste();
      } catch (err) {
        mostraErrore(modulo, err);
      }
      return null;
    });
  }, { classeBody: 'senza-tab' });
}

/* ---------- segnali sugli account ---------- */

const STATI_SEGNALE = {
  'da-vedere': 'Da controllare',
  ignorato: 'Ignorato',
  'avviso-da-mandare': 'Avviso in partenza',
  avvisato: 'Avvisato',
  'da-sospendere': 'Sospensione in corso',
  sospeso: 'Sospeso',
  'da-riattivare': 'Riattivazione in corso',
  riattivato: 'Riattivato',
  'da-chiudere': 'Chiusura in corso',
  chiuso: 'Account chiuso',
};
const NOME_AZIONE = {
  ignora: 'Ignora', avviso: 'Avviso', sospendi: 'Sospendi', riattiva: 'Riattiva', chiudi: 'Chiudi',
};
const AZIONI_SEGNALE = {
  'da-vedere': ['ignora', 'avviso', 'sospendi', 'chiudi'],
  ignorato: ['avviso', 'sospendi', 'chiudi'],
  avvisato: ['ignora', 'sospendi', 'chiudi'],
  riattivato: ['ignora', 'avviso', 'sospendi', 'chiudi'],
  sospeso: ['riattiva', 'chiudi'],
};

// privato/segnali/utenti: account che seguono almeno 5 atleti sotto i 14 anni di almeno 3 società diverse
// (li trova il controllore una volta al giorno). La decisione resta scritta; le azioni le fa il controllore.
async function segnali() {
  caricamento('Carico i segnali…');
  const elenco = (await api.leggiSegnali()).sort((x, y) => (x.stato === 'da-vedere' ? 0 : 1) - (y.stato === 'da-vedere' ? 0 : 1)
    || String(y.data ?? '').localeCompare(String(x.data ?? '')));
  if (!qui()) return;
  const data = (v) => {
    const d = v instanceof Date ? v : (v ? new Date(v) : null);
    return d && !Number.isNaN(d.getTime()) ? quando(d) : '';
  };
  disegna(pagina('segnali', `
    <p class="intro">Account che seguono almeno 5 atleti sotto i 14 anni di almeno 3 società diverse. Valuta ogni caso: Ignora, manda un Avviso (una notifica che ricorda le regole), Sospendi l'accesso o Chiudi l'account. Le azioni partono entro pochi minuti.</p>
    ${elenco.length ? `<ul class="elenco griglia-consigli">${elenco.map((x) => `
      <li class="scheda consiglio" data-uid="${esc(x.uid)}" data-n="${Number(x.n) || 0}">
        <div class="consiglio-testa"><span class="tipo">Account …${esc(String(x.uid).slice(-6))}</span><span>${esc(data(x.data))}</span><span class="stato-consiglio">${esc(STATI_SEGNALE[x.stato] ?? x.stato)}</span></div>
        <p>${x.stato === 'da-vedere' ? 'Da controllare: segue' : 'Segue'} ${Number(x.n) || 0} atleti sotto i 14 anni di ${Number(x.m) || 0} società diverse.</p>
        ${(x.atleti ?? []).length ? `<ul class="nota elenco-puntato">${x.atleti.map((a) => `<li>${esc([a.n, a.y, a.s].filter(Boolean).join(' · '))}</li>`).join('')}</ul>` : ''}
        ${x.decisione?.azione ? `<p class="nota">Ultima decisione: ${esc(NOME_AZIONE[x.decisione.azione] ?? x.decisione.azione)}${x.decisione.il ? `, ${esc(data(x.decisione.il))}` : ''}${x.stato === 'avvisato' && x.consegnato === 0 ? ' · nessun dispositivo con le notifiche: avviso non arrivato' : ''}</p>` : ''}
        ${(AZIONI_SEGNALE[x.stato] ?? []).length ? `<div class="dettaglio-azioni azioni-richiesta">${AZIONI_SEGNALE[x.stato].map((a) => `
          <button class="bottone ${a === 'sospendi' || a === 'chiudi' ? '' : 'bottone-secondario '}bottone-piccolo" data-decidi="${a}">${NOME_AZIONE[a]}</button>`).join('')}</div>` : ''}
      </li>`).join('')}</ul>` : '<p class="nota">Nessun segnale.</p>'}`), (el) => {
    el.querySelectorAll('[data-decidi]').forEach((b) => b.addEventListener('click', async () => {
      const li = b.closest('[data-uid]');
      const azione = b.dataset.decidi;
      const domande = {
        sospendi: 'Sospendere questo account? Non potrà più entrare finché non lo riattivi.',
        chiudi: 'Chiudere questo account? Cancelliamo profilo, atleti seguiti e Consigli. Non si può annullare.',
        avviso: 'Mandare l\'avviso con le regole d\'uso a questo account?',
      };
      if (domande[azione] && !window.confirm(domande[azione])) return;
      try {
        await conAttesa(b, () => api.decidiSegnale(li.dataset.uid, azione, Number(li.dataset.n)));
        avviso(azione === 'ignora' ? 'Segnato come ignorato.' : 'Decisione salvata: il controllore la esegue entro pochi minuti.');
        segnali();
      } catch (err) {
        avviso(err.message, 'errore');
      }
    }));
  }, { classeBody: 'senza-tab' });
}

/* ---------- utenti ---------- */

async function utenti() {
  caricamento('Carico gli utenti…');
  const elenco = await conCache('admin-utenti', () => api.leggiUtenti(), { durata: 60_000 });
  if (!qui()) return;
  const conPush = elenco.filter((u) => u.pushOn && u.dispositivi).length;
  const seguiti = elenco.reduce((x, u) => x + u.seguiti, 0);
  const settimana = elenco.filter((u) => u.aggiornato && Date.now() - u.aggiornato.getTime() < 7 * 86_400_000).length;
  disegna(pagina('utenti', `
    <div class="cifre" style="margin-top:10px">
      <div class="cifra"><b>${elenco.length}</b><small>Iscritti</small></div>
      <div class="cifra"><b>${conPush}</b><small>Con notifiche</small></div>
      <div class="cifra"><b>${seguiti}</b><small>Atleti seguiti</small></div>
      <div class="cifra"><b>${settimana}</b><small>Attivi in 7 giorni</small></div>
    </div>
    <p class="nota" style="margin:10px 0">Per la privacy qui non ci sono email né nomi: solo i numeri di ogni account.</p>
    <div class="tabella-scorre">
      <table class="tabella-limiti tabella-utenti">
        <thead><tr><th>Iscritto</th><th>Ultimo cambio</th><th>Avvisi</th><th>Seguiti</th><th>Notifiche</th></tr></thead>
        <tbody>${elenco.map((u) => `<tr><td>${esc(u.creato ? quando(u.creato) : '–')}</td><td>${esc(u.aggiornato ? quando(u.aggiornato) : '–')}</td><td>${u.settori.length}</td><td>${u.seguiti}</td><td>${u.pushOn ? `sì (${u.dispositivi})` : 'no'}</td></tr>`).join('')}</tbody>
      </table>
    </div>`), null, { classeBody: 'senza-tab' });
}
