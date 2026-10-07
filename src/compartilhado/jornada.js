/* Regras da jornada: horas líquidas, pausas, ritmo, meta e avisos. */
function clipMerge(intervals, lo, hi) {
  const c = intervals.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of c) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}
function overlapMs(merged, lo, hi) {
  let t = 0;
  for (const [a, b] of merged) { const s = Math.max(a, lo), e = Math.min(b, hi); if (e > s) t += e - s; }
  return t;
}

function summarize(s, nowMs) {
  const end = Math.max(s.end ?? nowMs, s.start);
  const gross = Math.floor((end - s.start) / 1000);
  const merged = clipMerge(s.breaks.map((b) => [b.s, b.e ?? end]), s.start, end);
  const pause = Math.floor(overlapMs(merged, s.start, end) / 1000);
  const net = Math.max(0, gross - pause);
  const late = s.start - s.sched;
  const lateS = late > CFG.lateTol ? Math.floor(late / 1000) : 0;
  let over = 0, short = 0;
  if (s.end != null) {
    const d = s.end - s.plannedEnd;
    if (d > CFG.otTol) over = Math.floor(d / 1000);
    else if (-d > CFG.otTol) short = Math.floor(-d / 1000);
  }
  const status = s.end != null ? 'closed' : s.breaks.some((b) => b.e == null) ? 'on_break' : 'open';
  return { status, gross, pause, net, lateS, over, short, planned: Math.floor((s.plannedEnd - s.sched) / 1000) };
}
function perHour(count, netS) { return netS < CFG.minRateSec ? 0 : Math.round((count / (netS / 3600)) * 100) / 100; }

function paceOf(times, s, nowMs) {
  const end = s.end ?? nowMs;
  const merged = clipMerge(s.breaks.map((b) => [b.s, b.e ?? end]), s.start, end);
  const net = Math.max(0, Math.floor((end - s.start - overlapMs(merged, s.start, end)) / 1000));
  return { count: times.length, perHour: perHour(times.length, net), net };
}

function projectGoal(count, goal, pace, sm, nowMs, plannedEnd) {
  const remainingS = Math.max(0, Math.floor((plannedEnd - nowMs) / 1000));
  const remaining = Math.max(0, goal - count);
  const ok = sm.net >= CFG.minProjSec && pace.perHour > 0;
  let expected = ok && sm.status !== 'closed' ? Math.round(count + (pace.perHour * remainingS) / 3600) : null;
  if (sm.status === 'closed') expected = count;
  const required = remaining && remainingS > 0 ? Math.round((remaining / (remainingS / 3600)) * 10) / 10 : (remaining ? null : 0);
  const eta = remaining && ok && sm.status !== 'closed' ? nowMs + (remaining / pace.perHour) * 3600e3 : null;
  return { expected, goal, remaining, required, eta, onTrack: expected == null ? null : expected >= goal, remainingS };
}

const minOf = (sec) => Math.max(0, Math.floor(sec / 60));
/** Só avisos que pedem uma ação: meta batida, entregas para conferir e saída não batida. */
function shiftAlerts({ sm, nowMs, plannedEnd, count, goal, review }) {
  const out = [];
  if (sm.status === 'closed') return out;
  if (count >= goal) out.push({ id: 'goal_reached', severity: 'success', message: `Meta de ${goal} entregas batida. Continue assim!` });
  const past = Math.floor((nowMs - plannedEnd) / 1000);
  if (past * 1000 > CFG.otTol) out.push({ id: 'past_end', severity: 'warning', message: `Passou ${minOf(past)} min do horário de saída. Bata a saída quando terminar.` });
  if (review) out.push({ id: 'needs_review', severity: 'warning', message: `${review} entrega(s) para conferir.` });
  return out;
}
