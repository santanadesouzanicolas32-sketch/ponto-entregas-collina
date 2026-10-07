/* Visão do turno atual e totais por período. */
/* ---------------- visão do turno atual ---------------- */
/** Média de entregas por hora dos últimos 7 dias (turnos fechados), para comparar com o turno de hoje. */
function baseline(excludeId, nowMs) {
  const since = addDays(ymdOf(nowMs), -7);
  const rates = [];
  for (const s of DB.shifts) {
    if (s.end == null || s.id === excludeId || s.date < since) continue;
    const p = paceOf(liveDeliveries(s).map((d) => d.t), s, nowMs);
    if (p.perHour > 0) rates.push(p.perHour);
  }
  return { avgPerHour7d: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100 : null };
}
function currentView() {
  const nowMs = now();
  const s = currentOpen();
  if (!s) return { shift: null };
  const dl = liveDeliveries(s).sort((a, b) => b.t - a.t);
  const sm = summarize(s, nowMs);
  const pace = paceOf(dl.map((d) => d.t), s, nowMs);
  const goal = userGoal();
  const proj = projectGoal(dl.length, goal, pace, sm, nowMs, s.plannedEnd);
  const base = baseline(s.id, nowMs);
  const delta = base.avgPerHour7d && pace.perHour ? Math.round(((pace.perHour - base.avgPerHour7d) / base.avgPerHour7d) * 1000) / 10 : null;
  const alerts = shiftAlerts({ sm, nowMs, plannedEnd: s.plannedEnd, count: dl.length, goal, review: dl.filter((d) => d.review).length });
  return { shift: s, deliveries: dl, sm, pace, proj, base: { ...base, delta }, alerts, goal, nowMs };
}

/* ---------------- totais por período (usado na tela inicial) ---------------- */
function periodTotals(days) {
  const nowMs = now(), today = ymdOf(nowMs), start = addDays(today, -(days - 1));
  const shifts = DB.shifts.filter((s) => s.date >= start && s.date <= today);
  let deliveries = 0, sales = 0, net = 0;
  for (const s of shifts) {
    const dl = liveDeliveries(s);
    deliveries += dl.length; net += summarize(s, nowMs).net;
    for (const d of dl) sales += d.v || 0;
  }
  return { shifts: shifts.length, deliveries, sales, net, perHour: perHour(deliveries, net) };
}
