// Client Firestore minimo via REST (niente firebase-admin, niente npm install).

/** Valore JS -> valore Firestore. Le date (oggetti Date) diventano timestamp. */
export function codifica(valore) {
  if (valore === null || valore === undefined) return { nullValue: null };
  if (valore instanceof Date) return { timestampValue: valore.toISOString() };
  if (Array.isArray(valore)) {
    return { arrayValue: { values: valore.map(codifica) } };
  }
  switch (typeof valore) {
    case 'boolean': return { booleanValue: valore };
    case 'number':
      return Number.isInteger(valore)
        ? { integerValue: String(valore) }
        : { doubleValue: valore };
    case 'string': return { stringValue: valore };
    case 'object': return { mapValue: { fields: codificaCampi(valore) } };
    default: throw new Error(`Tipo non gestito: ${typeof valore}`);
  }
}

export function codificaCampi(oggetto) {
  const campi = {};
  for (const [chiave, valore] of Object.entries(oggetto)) {
    if (valore === undefined) continue;
    campi[chiave] = codifica(valore);
  }
  return campi;
}

/** Valore Firestore -> valore JS. I timestamp tornano come stringhe ISO. */
export function decodifica(v) {
  if (!v || 'nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return new Date(v.timestampValue).toISOString();
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodifica);
  if ('mapValue' in v) return decodificaCampi(v.mapValue.fields ?? {});
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('bytesValue' in v) return v.bytesValue;
  return null;
}

export function decodificaCampi(campi = {}) {
  return Object.fromEntries(Object.entries(campi).map(([k, v]) => [k, decodifica(v)]));
}

/** Stringa ISO -> Date (così su Firestore diventa un timestamp). */
export function comeData(iso) {
  if (!iso) return null;
  if (iso instanceof Date) return iso;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export function creaFirestore(chiamaGoogle, progetto) {
  const radice = `projects/${progetto}/databases/(default)/documents`;
  const base = `https://firestore.googleapis.com/v1/${radice}`;

  return {
    async leggi(percorso) {
      const doc = await chiamaGoogle(`${base}/${percorso}`, { consenti404: true });
      return doc ? decodificaCampi(doc.fields) : null;
    },

    async scrivi(percorso, dati) {
      await chiamaGoogle(`${base}/${percorso}`, {
        method: 'PATCH',
        body: { fields: codificaCampi(dati) },
      });
    },

    async aggiorna(percorso, dati) {
      const maschera = Object.keys(dati)
        .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
        .join('&');
      await chiamaGoogle(`${base}/${percorso}?${maschera}&currentDocument.exists=true`, {
        method: 'PATCH',
        body: { fields: codificaCampi(dati) },
      });
    },

    /** Scrive più documenti in blocchi da 400 (il limite è 500 per commit). */
    async scriviTanti(elenco) {
      for (let i = 0; i < elenco.length; i += 400) {
        const blocco = elenco.slice(i, i + 400);
        await chiamaGoogle(`${base}:commit`, {
          method: 'POST',
          body: {
            writes: blocco.map(({ percorso, dati }) => ({
              update: { name: `${radice}/${percorso}`, fields: codificaCampi(dati) },
            })),
          },
        });
      }
    },

    async elenca(collezione) {
      const documenti = [];
      let pagina = '';
      do {
        const url = `${base}/${collezione}?pageSize=300${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`;
        const dati = await chiamaGoogle(url);
        for (const doc of dati.documents ?? []) {
          documenti.push({ id: doc.name.split('/').pop(), ...decodificaCampi(doc.fields) });
        }
        pagina = dati.nextPageToken ?? '';
      } while (pagina);
      return documenti;
    },
  };
}
