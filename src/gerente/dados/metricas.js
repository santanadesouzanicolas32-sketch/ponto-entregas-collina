/* Gerência: métricas, comparação e tendência (mesma regra para todos). */
/* ---------------- métricas (mesma regra para todos) ---------------- */
function aggregate(shifts) {
  let n = 0, sales = 0, nv = 0, net = 0, photo = 0, edited = 0, deleted = 0, all = 0, late = 0, over = 0, auto = 0, posted = 0;
  const days = new Set();
  for (const s of shifts) {
    net += s.sm.net; days.add(s.data); if (s.sm.lateS) late++; over += s.sm.over; if (s.auto) auto++;
    all += s.dels.length; deleted += s.dels.length - s.live.length;
    for (const d of s.live) { n++; if (d.valor != null) { sales += d.valor; nv++; } if (d.origem === 'photo') photo++; if (d.original) edited++; if (d.tardia) posted++; }
  }
  return {
    shifts: shifts.length, days: days.size, n, sales, nv, net, late, over, auto,
    perHour: net >= MIN_NET_FOR_RATE ? n / (net / 3600) : null, enough: net >= MIN_NET_FOR_RATE,
    ticket: nv ? sales / nv : null,
    coverage: n ? nv / n : null, photoPct: n ? photo / n : null, editedPct: n ? edited / n : null, postedPct: n ? posted / n : null, deletedPct: all ? deleted / all : null,
  };
}

const BENCH_PRIOR_SEC = 2 * 3600;             // peso do ritmo da hora ao estimar o ritmo de um dia da semana (evita ruído com poucos dados)

/** Ritmo de referência dos OUTROS entregadores (o próprio não entra na conta): por hora do dia e por dia da semana x hora. */
function benchmarkOf(others) {
  const hs = Array(24).fill(0), hd = Array(24).fill(0), cs = Array(168).fill(0), cd = Array(168).fill(0);
  for (const s of others) {
    s.byHour.forEach((v, h) => { hs[h] += v; });
    s.byCell.forEach((v, c) => { cs[c] += v; });
    for (const d of s.live) { hd[hourOf(d.t)]++; cd[cellOf(d.t)]++; }
  }
  return { hour: hs.map((v, h) => (v >= MIN_TEAM_HOURS ? { rate: hd[h] / (v / 3600), sec: v } : null)), cellSec: cs, cellDel: cd };
}
/** Entregas por hora esperadas numa casa (dia da semana x hora): o ritmo daquele dia, puxado para o ritmo da hora quando há pouco dado. null = sem referência. */
function expectedRate(bench, cell) {
  const hb = bench.hour[cell % 24];
  if (!hb) return null;
  const k = BENCH_PRIOR_SEC / 3600;
  return (bench.cellDel[cell] + k * hb.rate) / (bench.cellSec[cell] / 3600 + k);
}
/** Índice ajustado: entregas feitas ÷ entregas esperadas se o entregador tivesse o ritmo dos demais nos MESMOS dias da semana e horas. 100 = igual aos demais. */
function adjustedIndex(riderShifts, bench) {
  let actual = 0, expected = 0;
  for (const s of riderShifts) {
    s.byCell.forEach((v, c) => { if (v > 0) { const r = expectedRate(bench, c); if (r != null) expected += (v / 3600) * r; } });
    for (const d of s.live) if (expectedRate(bench, cellOf(d.t)) != null) actual++;
  }
  return expected >= MIN_EXPECTED ? { index: (actual / expected) * 100, actual, expected } : null;
}

const weekStart = (ymd) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
/** Série semanal de entregas por hora de um grupo de turnos. */
function weeklyRate(shifts) {
  const m = {};
  for (const s of shifts) { const k = weekStart(s.data); const o = (m[k] ||= { n: 0, net: 0 }); o.n += s.live.length; o.net += s.sm.net; }
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([w, o]) => ({ w, rate: o.net >= 3600 ? o.n / (o.net / 3600) : null, n: o.n, net: o.net }));
}
/** Tendência: média de entregas/h dos últimos turnos contra os turnos anteriores (precisa de pelo menos 6 turnos fechados). */
function trendOf(riderShifts) {
  const v = riderShifts.filter((s) => s.saida != null && s.sm.net >= 3600).sort((a, b) => a.entrada - b.entrada).map((s) => s.live.length / (s.sm.net / 3600));
  if (v.length < 6) return { enough: false, count: v.length };
  const k = Math.min(5, Math.floor(v.length / 2)), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const last = mean(v.slice(-k)), prev = mean(v.slice(-2 * k, -k)), delta = prev > 0 ? ((last - prev) / prev) * 100 : null;
  return { enough: true, k, last, prev, delta, label: delta == null ? 'estável' : delta > 8 ? 'melhorando' : delta < -8 ? 'caindo' : 'estável' };
}
