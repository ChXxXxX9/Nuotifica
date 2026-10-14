// Lettura dei contenuti dei post: link ai file, tipo di documento, settore e gruppo.
import { createHash } from 'node:crypto';
import {
  SLUG_SETTORE, SLUG_GRUPPO, TIPI, TIPO_ALTRO, TIPO_AVVISO, RE_AGGIORNATO,
} from './config.js';

const ENTITA = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', euro: '€', deg: '°',
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
  ordf: 'ª', ordm: 'º', sup1: '¹', sup2: '²', sup3: '³', middot: '·',
};

export function decodificaEntita(testo = '') {
  return testo.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (tutto, cod) => {
    if (cod[0] === '#') {
      const n = cod[1] === 'x' || cod[1] === 'X'
        ? parseInt(cod.slice(2), 16)
        : parseInt(cod.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : tutto;
    }
    return ENTITA[cod] ?? tutto;
  });
}

export function testoPulito(html = '') {
  return decodificaEntita(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const RE_IMMAGINE = /\.(jpe?g|png|gif|webp|svg|bmp|ico)(\?|#|$)/i;
const RE_DOCUMENTO = /\.(pdf|docx?|xlsx?|csv|zip|rar|7z|txt|odt|ods|pptx?)(\?|#|$)/i;

export function normalizzaUrl(url) {
  try {
    const u = new URL(url, 'https://www.finlazio.it/');
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let percorso = u.pathname;
    try { percorso = decodeURI(percorso); } catch { /* lascia com'è */ }
    percorso = percorso.replace(/\/+$/, '');
    return `https://${host}${percorso}${u.search}`;
  } catch {
    return url.trim();
  }
}

export function urlAssoluto(url) {
  try {
    const u = new URL(url, 'https://www.finlazio.it/');
    if (/(^|\.)finlazio\.it$/i.test(u.hostname)) {
      u.protocol = 'https:';
      u.hostname = 'www.finlazio.it';
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function impronta(testo, lunghezza = 10) {
  return createHash('sha1').update(testo).digest('hex').slice(0, lunghezza);
}

function nomeDaFile(url) {
  try {
    const nome = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    return nome
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  } catch {
    return url;
  }
}

/**
 * Estrae i link "utili" dal contenuto HTML di un post.
 * Restituisce [{ id, url, etichetta }], senza doppioni, nell'ordine in cui compaiono.
 */
export function estraiFile(html = '') {
  const risultati = [];
  const visti = new Set();
  const reLink = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = reLink.exec(html)) !== null) {
    const attributi = m[1];
    const hrefMatch = attributi.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!hrefMatch) continue;
    const hrefGrezzo = decodificaEntita((hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '').trim());
    if (!hrefGrezzo || /^(#|mailto:|tel:|javascript:)/i.test(hrefGrezzo)) continue;

    const url = urlAssoluto(hrefGrezzo);
    let etichetta = testoPulito(m[2]);
    if (!etichetta) {
      // Link senza testo: teniamo solo i documenti (es. icona PDF), non le immagini decorative.
      if (RE_IMMAGINE.test(url) || !RE_DOCUMENTO.test(url)) continue;
      etichetta = nomeDaFile(url);
    }
    // Collegamenti di navigazione del sito (categorie, tag) non sono documenti.
    if (/finlazio\.it\/(category|tag|author)\//i.test(url)) continue;

    const chiave = normalizzaUrl(url);
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    risultati.push({ id: impronta(chiave), url, etichetta: etichetta.slice(0, 300) });
  }
  return risultati;
}

/** Riconosce il tipo di documento da etichetta e nome del file. */
export function tipoDocumento(etichetta = '', url = '') {
  const testo = `${etichetta} ${nomeDaFile(url)}`;
  for (const t of TIPI) {
    if (t.re.test(testo)) return t.id;
  }
  return TIPO_ALTRO.id;
}

export function eAggiornato(etichetta = '') {
  return RE_AGGIORNATO.test(etichetta);
}

/**
 * Costruisce la mappa categoria -> slug della radice e slug proprio.
 * categorie: [{ id, slug, parent }]
 */
export function mappaCategorie(categorie) {
  const perId = new Map(categorie.map((c) => [c.id, c]));
  const mappa = new Map();
  for (const c of categorie) {
    let radice = c;
    const visti = new Set();
    while (radice.parent && perId.has(radice.parent) && !visti.has(radice.id)) {
      visti.add(radice.id);
      radice = perId.get(radice.parent);
    }
    mappa.set(c.id, { slug: c.slug, radice: radice.slug });
  }
  return mappa;
}

const SETTORI_DA_TITOLO = [
  ['artistico', /^\s*(nuoto\s+artistico|sincro|sincronizzato)\b/i],
  ['pallanuoto', /^\s*(pallanuoto|pn)\b/i],
  ['propaganda', /^\s*propaganda\b/i],
  ['salvamento', /^\s*salvamento\b/i],
  ['master', /^\s*master\b/i],
  ['tuffi', /^\s*tuffi\b/i],
  ['fondo', /^\s*(fondo|acque libere)\b/i],
  ['nuoto', /^\s*(nuoto|nu)\b(?!\s*(artistic|per salvamento))/i],
];

/** Settori a cui appartiene un post. */
export function settoriDelPost(idCategorie = [], mappa, titolo = '') {
  const settori = new Set();
  for (const id of idCategorie) {
    const info = mappa.get(id);
    if (!info) continue;
    settori.add(SLUG_SETTORE[info.radice] ?? 'comitato');
  }
  for (const [settore, re] of SETTORI_DA_TITOLO) {
    if (re.test(titolo)) {
      settori.add(settore);
      break;
    }
  }
  // "Propaganda NU" e simili: è propaganda, non nuoto agonistico.
  if (settori.has('propaganda') && /^\s*propaganda/i.test(titolo)) settori.delete('nuoto');
  const sportivi = [...settori].filter((s) => s !== 'comitato');
  if (sportivi.length) settori.delete('comitato');
  if (!settori.size) settori.add('comitato');
  return [...settori].sort();
}

const RE_ESORDIENTI = /esordient|\bes\s*[./]?\s*[ab]\b|\bes[ab]\b/i;
const RE_CATEGORIA = /ragazz|junior|juniores|cadett|senior|assolut|\bR\.?J\.?C\b|rjc|di\s+categoria|\bcategoria\b/i;

/**
 * Gruppi del nuoto (categoria / esordienti) toccati dal post.
 * Se non si capisce, il post vale per entrambi: meglio un avviso in più che uno perso.
 */
export function gruppiDelPost(idCategorie = [], mappa, testi = []) {
  const gruppi = new Set();
  for (const id of idCategorie) {
    const info = mappa.get(id);
    if (info && SLUG_GRUPPO[info.slug]) gruppi.add(SLUG_GRUPPO[info.slug]);
  }
  const testo = testi.join(' ');
  if (RE_ESORDIENTI.test(testo)) gruppi.add('esordienti');
  if (RE_CATEGORIA.test(testo.replace(/categoria\s+esordient\w*/gi, ''))) gruppi.add('categoria');
  if (!gruppi.size) return ['categoria', 'esordienti'];
  return [...gruppi].sort();
}

/** Trasforma un post dell'API WordPress nella forma che usiamo noi. */
export function leggiPost(post, mappa) {
  const titolo = testoPulito(post.title?.rendered ?? '');
  const file = estraiFile(post.content?.rendered ?? '').map((f) => ({
    ...f,
    tipo: tipoDocumento(f.etichetta, f.url),
    aggiornato: eAggiornato(f.etichetta),
  }));
  const settori = settoriDelPost(post.categories ?? [], mappa, titolo);
  const gruppi = gruppiDelPost(post.categories ?? [], mappa, [
    titolo,
    ...file.map((f) => `${f.etichetta} ${f.url}`),
  ]);
  return {
    id: String(post.id),
    titolo,
    link: post.link,
    data: aIso(post.date_gmt),
    modificato: aIso(post.modified_gmt),
    settori,
    gruppi,
    file,
  };
}

/** Le date GMT di WordPress arrivano senza fuso ("2026-10-14T12:12:41"): le rendiamo ISO complete. */
export function aIso(dataGmt) {
  if (!dataGmt) return null;
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(dataGmt) ? dataGmt : `${dataGmt}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Tipi presenti in un elenco di file; un post senza file è un avviso/comunicato. */
export function tipiDiFile(file) {
  if (!file.length) return [TIPO_AVVISO.id];
  return [...new Set(file.map((f) => f.tipo))];
}
