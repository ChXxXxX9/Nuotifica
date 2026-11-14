// Il passaggio da Nuotifica a Cloro: un'animazione che si vede una volta sola,
// solo da chi usava già Nuotifica su questo dispositivo.
import { memoria, pocoMovimento, ICONE, esc } from './nucleo.js';

// Va letto subito, prima che l'app sovrascriva i dati salvati con il formato nuovo.
const eraNuotifica = (() => {
  try {
    const copia = JSON.parse(localStorage.getItem('nuotifica.copia') ?? 'null');
    return Boolean((copia && copia.v === 1) || localStorage.getItem('nuotifica.token')
      || localStorage.getItem('nuotifica.visti') || localStorage.getItem('nuotifica.filtro'));
  } catch {
    return false;
  }
})();

const CHIAVE = 'benvenuto-cloro';

export function forseBenvenuto({ forza = false } = {}) {
  if (!forza && memoria(CHIAVE)) return;
  if (!forza && !eraNuotifica) {
    memoria(CHIAVE, true);
    return;
  }
  if (document.querySelector('.benvenuto')) return;
  memoria(CHIAVE, true);
  mostraBenvenuto();
}

function bolle(quante) {
  let html = '';
  for (let i = 0; i < quante; i++) {
    const lato = 8 + Math.round(Math.random() * 26);
    const stile = [
      `left:${Math.round(Math.random() * 96)}%`,
      `width:${lato}px`,
      `height:${lato}px`,
      `--d:${(2.2 + Math.random() * 1.8).toFixed(2)}s`,
      `--r:${(0.9 + Math.random() * 1.4).toFixed(2)}s`,
      `--x:${Math.round(Math.random() * 60 - 30)}px`,
    ].join(';');
    html += `<span class="bolla" style="${stile}"></span>`;
  }
  return html;
}

function mostraBenvenuto() {
  const lettere = [...'Nuotifica'].map((c, i) => `<span class="lettera" style="--i:${i}">${esc(c)}</span>`).join('');
  const el = document.createElement('div');
  el.className = 'benvenuto';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'benvenuto-titolo');
  el.innerHTML = `
    <div class="benvenuto-scena">
      ${pocoMovimento ? '' : `<div class="bolle" aria-hidden="true">${bolle(22)}</div>`}
      <button class="benvenuto-salta" data-chiudi>Salta</button>
      ${pocoMovimento ? '' : `<div class="vecchio-nome" aria-hidden="true">${lettere}<span class="vecchio-nome-sotto">CAMBIA NOME</span></div>`}
      <div class="nuovo-marchio">
        <span class="tessera" aria-hidden="true">Cl</span>
        <span class="logo-parola">cloro</span>
        <p>Il nuoto, in diretta.</p>
      </div>
      <div class="cosa-cambia">
        <p id="benvenuto-titolo"><strong>Nuotifica ora si chiama Cloro.</strong> Stesso account, stesse notifiche, e molto di più:</p>
        <ul>
          <li>${ICONE.cronometro}<div><strong>Gare quasi in diretta</strong><span>Batterie, corsie, tempi e parziali man mano che arrivano.</span></div></li>
          <li>${ICONE.persone}<div><strong>Schede atleta e "Segui"</strong><span>Personali, punti e progressi. Segui chi vuoi e ti avvisiamo appena esce un suo tempo.</span></div></li>
          <li>${ICONE.campana}<div><strong>Gli avvisi di sempre</strong><span>Ammessi, start list e orari del Comitato: li trovi in "Per te", come prima.</span></div></li>
        </ul>
      </div>
      <button class="bottone" data-chiudi data-principale>Entra in Cloro</button>
    </div>`;
  document.body.append(el);
  document.documentElement.style.overflow = 'hidden';
  const principale = el.querySelector('[data-principale]');
  setTimeout(() => principale.focus({ preventScroll: true }), pocoMovimento ? 0 : 4300);

  const chiudi = () => {
    document.documentElement.style.overflow = '';
    if (pocoMovimento) {
      el.remove();
      return;
    }
    el.classList.add('esce');
    setTimeout(() => el.remove(), 450);
  };
  el.querySelectorAll('[data-chiudi]').forEach((b) => b.addEventListener('click', chiudi));
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') chiudi(); });
}
