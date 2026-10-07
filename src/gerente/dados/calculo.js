/* Gerência: turnos calculados, períodos e fatias. */
/* ---------------- camada de cálculo ---------------- */
let MC = null;                                  // cache dos turnos calculados (zerado quando os dados mudam)
const hourStartMs = (ms) => { const p = parts(ms); return ms - (Number(p.minute) * 60 + Number(p.second)) * 1000; };

/** Segundos líquidos (sem pausas) por hora do dia (24) e por dia da semana x hora (168), para o índice ajustado. */
function netByHour(sh) {
  const hours = Array(24).fill(0), cells = Array(168).fill(0), end = sh.nowRef && sh.saida == null ? sh.nowRef : (sh.saida ?? sh.entrada);
  const merged = clipMerge(sh.pausas.map((p) => [p.i, p.f ?? end]), sh.entrada, end);
  let cur = sh.entrada;
  while (cur < end) {
    const hs = hourStartMs(cur), next = Math.min(end, hs + 3600000);
    const sec = Math.max(0, next - cur - overlapMs(merged, cur, next)) / 1000;
    hours[hourOf(cur)] += sec; cells[cellOf(cur)] += sec;
    cur = next;
  }
  return { hours, cells };
}

function compute() {
  if (MC) return MC;
  const shifts = [];
  for (const r of ROSTER) {
    const x = ST.riders[r.id]; if (!x) continue;
    for (const s of x.turnos) {
      if (isIgnored(r.id, s.id)) continue;
      const nowRef = s.saida == null ? Math.max(x.exportadoEm || 0, s.entrada) : s.saida;
      const core = { start: s.entrada, end: s.saida, sched: s.previstoIni, plannedEnd: s.previstoFim, breaks: s.pausas.map((p) => ({ s: p.i, e: p.f })) };
      const sm = summarize(core, nowRef);
      const dels = s.entregas.map((e) => ({ ...e, rid: r.id, sid: s.id, data: s.data }));
      const sh = { rid: r.id, id: s.id, data: s.data, preset: s.preset, previstoIni: s.previstoIni, previstoFim: s.previstoFim, entrada: s.entrada, saida: s.saida, auto: s.saidaAutomatica,
        pausas: s.pausas, nowRef, sm, ex: !!s._ex, dels, live: dels.filter((d) => !d.excluida) };
      const nb = netByHour(sh); sh.byHour = nb.hours; sh.byCell = nb.cells;
      shifts.push(sh);
    }
  }
  MC = { shifts };
  return MC;
}

/* ---------------- períodos e fatias ---------------- */
function mRange(period) {
  const today = ymdOf(now());
  if (period === 'hoje') return { from: today, to: today, days: 1 };
  if (period === 'mes') { const from = today.slice(0, 8) + '01'; return { from, to: today, days: Math.round((Date.parse(today) - Date.parse(from)) / 864e5) + 1 }; }
  if (period === 'tudo') {
    const all = compute().shifts, from = all.length ? all.reduce((m, s) => (s.data < m ? s.data : m), today) : today;
    return { from, to: today, days: Math.round((Date.parse(today) - Date.parse(from)) / 864e5) + 1, all: true };
  }
  const n = Number(period) || 30;
  return { from: addDays(today, -(n - 1)), to: today, days: n };
}
/** Turnos do período e do tipo de turno escolhido (todos os entregadores). */
function sliceShifts(R, preset) { return compute().shifts.filter((s) => s.data >= R.from && s.data <= R.to && (!preset || s.preset === preset)); }
