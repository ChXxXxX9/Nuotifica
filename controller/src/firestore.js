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
  // Conteggio di letture e scritture del giro: il piano gratuito ha un tetto giornaliero.
  const conta = { letture: 0, scritture: 0 };

  return {
    conta,

    async leggi(percorso) {
      conta.letture++;
      const doc = await chiamaGoogle(`${base}/${percorso}`, { consenti404: true });
      return doc ? decodificaCampi(doc.fields) : null;
    },

    async scrivi(percorso, dati) {
      conta.scritture++;
      await chiamaGoogle(`${base}/${percorso}`, {
        method: 'PATCH',
        body: { fields: codificaCampi(dati) },
      });
    },

    async aggiorna(percorso, dati) {
      conta.scritture++;
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
        conta.scritture += blocco.length;
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

    /**
     * Scritture "avanzate" in blocchi da 400: ognuna può aggiornare solo alcuni campi (maschera),
     * aggiungere elementi a una lista senza leggerla prima (aggiungi) e mettere l'ora del server.
     */
    async commit(elenco) {
      for (let i = 0; i < elenco.length; i += 400) {
        const blocco = elenco.slice(i, i + 400);
        conta.scritture += blocco.length;
        await chiamaGoogle(`${base}:commit`, {
          method: 'POST',
          body: {
            writes: blocco.map((w) => {
              const scrittura = { update: { name: `${radice}/${w.percorso}`, fields: codificaCampi(w.dati ?? {}) } };
              if (w.maschera) scrittura.updateMask = { fieldPaths: w.maschera };
              const trasformazioni = [];
              for (const [campo, valori] of Object.entries(w.aggiungi ?? {})) {
                if (valori.length) trasformazioni.push({ fieldPath: campo, appendMissingElements: { values: valori.map(codifica) } });
              }
              for (const campo of w.oraServer ?? []) trasformazioni.push({ fieldPath: campo, setToServerValue: 'REQUEST_TIME' });
              if (trasformazioni.length) scrittura.updateTransforms = trasformazioni;
              return scrittura;
            }),
          },
        });
      }
    },

    /** Legge più documenti con una sola richiesta. Restituisce una Map percorso -> dati (o null). */
    async leggiTanti(percorsi) {
      const esito = new Map(percorsi.map((p) => [p, null]));
      for (let i = 0; i < percorsi.length; i += 100) {
        const blocco = percorsi.slice(i, i + 100);
        conta.letture += blocco.length;
        const risposte = await chiamaGoogle(`${base}:batchGet`, {
          method: 'POST',
          body: { documents: blocco.map((p) => `${radice}/${p}`) },
        });
        for (const r of risposte ?? []) {
          if (r.found) esito.set(r.found.name.slice(radice.length + 1), decodificaCampi(r.found.fields));
        }
      }
      return esito;
    },

    /** Documenti di una collezione con un campo-lista che contiene almeno uno dei valori. */
    async contieneUno(collezione, campo, valori) {
      const documenti = [];
      for (let i = 0; i < valori.length; i += 30) {
        const blocco = valori.slice(i, i + 30);
        const risposte = await chiamaGoogle(`${base}:runQuery`, {
          method: 'POST',
          body: {
            structuredQuery: {
              from: [{ collectionId: collezione }],
              where: {
                fieldFilter: {
                  field: { fieldPath: campo },
                  op: 'ARRAY_CONTAINS_ANY',
                  value: { arrayValue: { values: blocco.map(codifica) } },
                },
              },
            },
          },
        });
        conta.letture += Math.max(1, (risposte ?? []).filter((r) => r.document).length);
        for (const r of risposte ?? []) {
          if (!r.document) continue;
          const id = r.document.name.split('/').pop();
          if (!documenti.some((d) => d.id === id)) documenti.push({ id, ...decodificaCampi(r.document.fields) });
        }
      }
      return documenti;
    },

    async elenca(collezione) {
      const documenti = [];
      let pagina = '';
      do {
        const url = `${base}/${collezione}?pageSize=300${pagina ? `&pageToken=${encodeURIComponent(pagina)}` : ''}`;
        const dati = await chiamaGoogle(url);
        conta.letture += Math.max(1, (dati.documents ?? []).length);
        for (const doc of dati.documents ?? []) {
          documenti.push({ id: doc.name.split('/').pop(), ...decodificaCampi(doc.fields) });
        }
        pagina = dati.nextPageToken ?? '';
      } while (pagina);
      return documenti;
    },
  };
}
