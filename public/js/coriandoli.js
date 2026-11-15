// Coriandoli per festeggiare un limite preso (niente librerie, si tolgono da soli).
import { pocoMovimento } from './nucleo.js';

const COLORI = ['#c8ff3d', '#38e1d0', '#ffb13d', '#ff8a7a', '#eafbf3'];

export function coriandoli(quanti = 90) {
  if (pocoMovimento) return;
  const box = document.createElement('div');
  box.className = 'coriandoli';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < quanti; i++) {
    const c = document.createElement('i');
    c.style.cssText = [
      `left:${Math.random() * 100}%`,
      `background:${COLORI[i % COLORI.length]}`,
      `--x:${Math.round(Math.random() * 160 - 80)}px`,
      `--r:${Math.round(Math.random() * 720 - 360)}deg`,
      `--d:${(1.8 + Math.random() * 1.6).toFixed(2)}s`,
      `--w:${(Math.random() * 0.5).toFixed(2)}s`,
      `width:${6 + Math.round(Math.random() * 6)}px`,
      `height:${8 + Math.round(Math.random() * 8)}px`,
    ].join(';');
    box.appendChild(c);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}
