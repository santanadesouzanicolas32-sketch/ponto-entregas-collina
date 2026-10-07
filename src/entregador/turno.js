/* Ações do turno: entrada, pausa e saída. */
/* ---------------- ações (todas validam, nada confia na tela) ---------------- */
function autoCloseStale(s, t) {
  if (s.end != null || t <= s.plannedEnd + CFG.stale) return false;
  const end = s.plannedEnd > s.start ? s.plannedEnd : t;
  s.breaks = s.breaks.filter((b) => b.s < end);
  s.breaks.forEach((b) => { if (b.e == null) b.e = end; });
  s.end = end; s.closeReason = 'auto';
  return true;
}
function currentOpen() {
  const s = openShift();
  if (s && autoCloseStale(s, now())) { save(); return null; }
  return s;
}
function requireOpen() {
  const s = currentOpen();
  if (!s) throw new AppErr('NO_OPEN_SHIFT', 'Você não tem turno aberto. Bata a entrada primeiro.');
  return s;
}

/** Entrada. Fora da janela do turno só com `anyway` (o turno vale normalmente, com a data de hoje). */
function startShift(preset, { anyway = false } = {}) {
  const planned = CFG.presets[preset];
  if (!planned) throw new AppErr('INVALID_PRESET', 'Horário de início inválido.');
  const t = now();
  const open = openShift();
  if (open && !autoCloseStale(open, t)) throw new AppErr('SHIFT_ALREADY_OPEN', 'Você já tem um turno aberto.');
  const today = ymdOf(t);
  let chosen = null;
  for (const d of [today, addDays(today, -1)]) {
    const sched = localToMs(d, preset), pe = sched + planned * 60000;
    if (sched - CFG.early <= t && t <= pe) { chosen = { d, sched, pe }; break; }
  }
  if (!chosen) {
    if (!anyway) throw new AppErr('OUTSIDE_SHIFT_WINDOW', `Fora do horário do turno das ${preset}h. A entrada vale de 1 h antes até o fim da jornada.`);
    const sched = localToMs(today, preset);
    chosen = { d: today, sched, pe: sched + planned * 60000 };
  }
  if (DB.shifts.some((s) => s.date === chosen.d)) throw new AppErr('SHIFT_ALREADY_TODAY', 'Já existe um turno registrado para hoje.');
  const sh = { id: uid(), date: chosen.d, preset, sched: chosen.sched, plannedEnd: chosen.pe, start: t, end: null, closeReason: null, breaks: [], deliveries: [] };
  DB.shifts.push(sh);
  save();
  return sh;
}
function startBreak() {
  const s = requireOpen(), t = now();
  if (s.breaks.some((b) => b.e == null)) throw new AppErr('ALREADY_ON_BREAK', 'Você já está em pausa.');
  if (t <= s.start) throw new AppErr('TOO_SOON', 'Aguarde um instante antes de pausar.');
  s.breaks.push({ s: t, e: null });
  save();
  return s;
}
function endBreak() {
  const s = requireOpen(), t = now();
  const b = s.breaks.find((x) => x.e == null);
  if (!b) throw new AppErr('NOT_ON_BREAK', 'Você não está em pausa.');
  b.e = t > b.s ? t : b.s + 1000;
  save();
  return s;
}
function endShift() {
  const s = requireOpen(), t = now();
  if (t <= s.start) throw new AppErr('TOO_SOON', 'Aguarde um instante antes de bater a saída.');
  s.breaks.forEach((b) => { if (b.e == null) b.e = t > b.s ? t : b.s + 1000; });
  s.end = t;
  save();
  return s;
}
