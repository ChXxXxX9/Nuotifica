// Misura dei consumi di Firebase (solo lettura): Firestore, Realtime Database, Hosting, App Check, reCAPTCHA.
// Legge le metriche di Cloud Monitoring degli ultimi giorni e i contatori del controllore (meta/budget).
// Nei log solo numeri aggregati.
import { leggiAccountServizio, creaGestoreToken, creaClientGoogle } from './google.js';
import { creaFirestore } from './firestore.js';

const PREFISSI = [
  'firestore.googleapis.com/',
  'firebasedatabase.googleapis.com/',
  'firebasehosting.googleapis.com/',
  'firebaseappcheck.googleapis.com/',
  'recaptchaenterprise.googleapis.com/',
];
const GIORNI = Number(process.argv[2]) || 8;

async function principale() {
  const account = leggiAccountServizio(process.env.FIREBASE_SERVICE_ACCOUNT);
  const progetto = account.project_id;
  const chiama = creaClientGoogle(creaGestoreToken(account));
  const db = creaFirestore(chiama, progetto);
  const base = `https://monitoring.googleapis.com/v3/projects/${progetto}`;
  const fine = new Date();
  const inizio = new Date(fine.getTime() - GIORNI * 86_400_000);
  const righe = [];
  for (const prefisso of PREFISSI) {
    let descrittori = [];
    try {
      const r = await chiama(`${base}/metricDescriptors?filter=${encodeURIComponent(`metric.type = starts_with("${prefisso}")`)}`);
      descrittori = r.metricDescriptors ?? [];
    } catch (e) {
      righe.push(`${prefisso}: descrittori non letti (${String(e.message).slice(0, 160)})`);
      continue;
    }
    const valori = [];
    for (const d of descrittori) {
      if (d.valueType === 'DISTRIBUTION' || d.valueType === 'BOOL' || d.valueType === 'STRING') continue;
      const gauge = d.metricKind === 'GAUGE';
      const parametri = new URLSearchParams({
        filter: `metric.type = "${d.type}"`,
        'interval.startTime': inizio.toISOString(),
        'interval.endTime': fine.toISOString(),
        'aggregation.alignmentPeriod': '86400s',
        'aggregation.perSeriesAligner': gauge ? 'ALIGN_MAX' : (d.metricKind === 'CUMULATIVE' ? 'ALIGN_DELTA' : 'ALIGN_SUM'),
        'aggregation.crossSeriesReducer': gauge ? 'REDUCE_MAX' : 'REDUCE_SUM',
      });
      try {
        const r = await chiama(`${base}/timeSeries?${parametri}`);
        const punti = (r.timeSeries ?? []).flatMap((s) => s.points ?? []);
        if (!punti.length) continue;
        const perGiorno = punti.map((p) => [p.interval.endTime.slice(5, 10), Number(p.value.int64Value ?? p.value.doubleValue ?? 0)])
          .sort((a, b) => a[0].localeCompare(b[0]));
        const fmt = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(Math.round(v * 100) / 100));
        valori.push(`${d.type.slice(prefisso.length)}${gauge ? ' (max)' : ''}: ${perGiorno.map(([g, v]) => `${g} ${fmt(v)}`).join(', ')}`);
      } catch (e) {
        valori.push(`${d.type.slice(prefisso.length)}: errore ${String(e.message).slice(0, 120)}`);
      }
    }
    righe.push(`${prefisso} (${descrittori.length} metriche) — ${valori.join(' | ') || 'nessun dato'}`);
  }
  // Contatori del controllore (solo il suo consumo di Firestore).
  const [budget, budgetGrad] = await Promise.all([db.leggi('meta/budget'), db.leggi('meta/budget-grad')]);
  righe.push(`Controllore oggi (${budget?.giorno ?? '?'}): ${budget?.letture ?? '?'} letture, ${budget?.scritture ?? '?'} scritture (giro ogni 5 minuti); graduatorie notturne (${budgetGrad?.giorno ?? '?'}): ${budgetGrad?.scritture ?? '?'} scritture, ${budgetGrad?.letture ?? '?'} letture.`);
  for (const r of righe) {
    console.log(r);
    if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Consumi::${r.slice(0, 3800).replace(/%/g, '%25').replace(/\n/g, ' ')}`);
  }
}

principale().catch((e) => {
  console.log(`::error title=Consumi::${String(e.message).slice(0, 500)}`);
  process.exit(1);
});
