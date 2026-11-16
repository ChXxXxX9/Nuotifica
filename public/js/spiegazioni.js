// Il tasto "i": spiega come funzionano i numeri di Cloro (punti, Indice Cloro, Indice annata).
// Basta mettere tastoInfo('indice-cloro') nella pagina: il clic apre la spiegazione.
import { ICONE, esc } from './nucleo.js';

const SPIEGAZIONI = {
  'indice-cloro': {
    titolo: 'Indice Cloro',
    testo: `
      <p><strong>I punti World Aquatics</strong> (gli ex "punti FINA") valgono per <strong>un singolo tempo</strong>:
      lo confrontano con un tempo base vicino al record del mondo. 1000 è il livello del record, più vai lento più scendono.
      Servono a confrontare gare diverse: un 100 rana con un 200 farfalla, maschi con femmine, vasca corta con vasca lunga.</p>
      <p><strong>L'Indice Cloro</strong> è invece <strong>un solo numero per atleta</strong>, per stagione: dice quanto vale
      in generale, non in una gara sola. Si prendono le sue <strong>3 specialità migliori</strong> della stagione (per ognuna
      il punteggio più alto fra vasca da 25 e da 50) e si fa una media pesata: <strong>50%</strong> la migliore, <strong>30%</strong>
      la seconda, <strong>20%</strong> la terza.</p>
      <p class="esempio">Esempio: 600 punti nei 100 SL, 560 nei 200 SL e 500 nei 50 dorso danno 0,5 × 600 + 0,3 × 560 + 0,2 × 500 = <strong>568</strong>.</p>
      <p><strong>Perché lo usiamo.</strong> Una media di tutti i punti premierebbe chi nuota poche gare: ogni gara "di servizio"
      in più la abbasserebbe, e nelle classifiche di sempre conterebbero anche gli anni da esordiente. Una somma premierebbe
      invece chi nuota di più. L'Indice Cloro guarda solo le gare migliori, dà più peso alla specialità principale e premia
      un po' chi è forte anche in altre: è il modo più giusto che abbiamo trovato per mettere in fila atleti diversi.</p>
      <p>Chi ha nuotato una sola specialità ha come indice i punti di quella gara. Si calcola sempre su una stagione.
      Per le squadre c'è invece la <strong>Media squadra</strong>, che guarda tutte le gare fatte con la squadra.</p>`,
  },
  'media-squadra': {
    titolo: 'Media squadra',
    testo: `
      <p>La <strong>Media squadra</strong> è fatta solo per le squadre, come una media scolastica: si prendono tutti i "voti"
      di un atleta con quella squadra, si sommano e si dividono per quanti sono.</p>
      <p><strong>Un voto</strong> sono i punti World Aquatics del suo migliore tempo in una gara, in una vasca, in una stagione:
      il 100 rana in vasca da 25 del 2023/24 è un voto, quello in vasca da 50 un altro, il 100 rana del 2024/25 un altro ancora.
      Le gare una per una non le abbiamo per tutti, quindi per essere giusti con tutti si usa il migliore di ogni gara e vasca, stagione per stagione.</p>
      <p class="esempio">Esempio: 520, 560, 480, 610, 530 e 500 punti in sei voti fanno 3200 ÷ 6 = <strong>533</strong>.</p>
      <p><strong>Cosa misura.</strong> Quanto rende in media ogni sua gara con la squadra: premia chi è costante.
      L'<strong>Indice Cloro</strong> invece guarda solo le 3 specialità migliori e dice quanto è forte.</p>
      <p><strong>Due regole.</strong> In classifica entra chi ha almeno 6 voti: con due gare buone sole non si finisce davanti a chi ne ha fatte cinquanta
      (gli altri sono in un elenco a parte). E con il filtro <strong>Categoria</strong> o <strong>Esordienti</strong> contano solo gli anni in cui l'atleta
      era di quel gruppo: così chi è cresciuto in squadra non si porta dietro i punteggi da piccolo.</p>`,
  },
  annata: {
    titolo: 'Indice annata',
    testo: `
      <p>L'<strong>Indice annata</strong> confronta un tempo con la media dei <strong>10 migliori d'Italia nati nello stesso anno</strong>,
      nella stessa gara e vasca, nella stagione. <strong>100</strong> vuol dire andare come loro, sopra 100 più veloce, sotto 100 più lento.</p>
      <p>I punti World Aquatics confrontano con il record del mondo: per un ragazzo di 12 anni sono sempre bassi.
      L'Indice annata invece dice come va rispetto ai suoi coetanei.</p>
      <p>A inizio stagione, quando la sua annata ha ancora pochi tempi, si usano quelli di chi aveva la sua stessa età la stagione scorsa.</p>`,
  },
};

/** Il tasto "i" accanto a un titolo. */
export function tastoInfo(id, etichetta = 'Come funziona') {
  return `<button type="button" class="tasto-info" data-info="${esc(id)}" aria-label="${esc(etichetta)}">${ICONE.info}</button>`;
}

function apri(id) {
  const s = SPIEGAZIONI[id];
  if (!s) return;
  const finestra = document.createElement('dialog');
  finestra.className = 'foglio-info';
  finestra.setAttribute('aria-labelledby', 'foglio-info-titolo');
  finestra.innerHTML = `
    <div class="foglio-info-corpo">
      <h2 id="foglio-info-titolo">${esc(s.titolo)}</h2>
      ${s.testo}
      <button type="button" class="bottone" data-chiudi>Ho capito</button>
    </div>`;
  document.body.append(finestra);
  const chiudi = () => {
    finestra.close();
    finestra.remove();
  };
  finestra.querySelector('[data-chiudi]').addEventListener('click', chiudi);
  // Un tocco fuori dal foglio lo chiude.
  finestra.addEventListener('click', (e) => { if (e.target === finestra) chiudi(); });
  finestra.addEventListener('cancel', (e) => {
    e.preventDefault();
    chiudi();
  });
  if (finestra.showModal) finestra.showModal();
  else finestra.setAttribute('open', '');
}

// Un solo ascoltatore per tutta l'app.
document.addEventListener('click', (e) => {
  const tasto = e.target.closest?.('[data-info]');
  if (!tasto) return;
  e.preventDefault();
  e.stopPropagation();
  apri(tasto.dataset.info);
});
