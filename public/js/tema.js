// Modalità giorno e notte. La scelta resta sul telefono; "auto" segue l'impostazione del sistema.
const CHIAVE = 'nuotifica.tema';
const SCELTE = ['auto', 'giorno', 'notte'];

export function temaScelto() {
  try {
    const t = JSON.parse(localStorage.getItem(CHIAVE));
    return SCELTE.includes(t) ? t : 'notte';
  } catch {
    return 'notte';
  }
}

/** Colore della barra del telefono uguale allo sfondo dell'app. */
function aggiornaBarra() {
  const colore = getComputedStyle(document.documentElement).getPropertyValue('--fondo').trim() || '#07130f';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colore);
}

export function applicaTema(tema = temaScelto()) {
  try { localStorage.setItem(CHIAVE, JSON.stringify(tema)); } catch { /* pazienza */ }
  document.documentElement.dataset.tema = tema;
  aggiornaBarra();
}

window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', aggiornaBarra);
aggiornaBarra();
