/* Ações das entregas: registrar (inclusive esquecida), corrigir, excluir, desfazer. */
/** Turno que recebe uma entrega lançada depois: o aberto; se já saiu, o último, até 6 h depois da saída. */
function requireLateShift() {
  const open = currentOpen();
  if (open) return open;
  const last = [...DB.shifts].sort((a, b) => b.start - a.start)[0];
  if (last && last.end != null && now() - last.end <= 6 * 3600000) return last;
  throw new AppErr('NO_OPEN_SHIFT', 'Você não tem turno aberto. Bata a entrada primeiro.');
}
/** Registra uma entrega. `at` = horário da foto (já carimbado); sem foto vale o instante do toque. O horário nunca é editável depois.
 *  `late` = entrega esquecida, lançada depois com o horário em que aconteceu: fica marcada como "lançada depois" e guarda quando foi registrada. */
function addDelivery(blockRaw, aptRaw, { force = false, at = null, source = 'manual', review = false, requestId = null, value = null, late = false } = {}) {
  const s = late ? requireLateShift() : requireOpen();
  if (!late && s.breaks.some((b) => b.e == null)) throw new AppErr('SHIFT_ON_BREAK', 'Você está em pausa. Retome para registrar entregas.');
  const block = normalizeBlock(blockRaw), a = normalizeApt(aptRaw);
  const t = at ?? now();
  if (late && at == null) throw new AppErr('INVALID_TIME', 'Informe o horário da entrega.');
  if (t < s.start && !late) throw new AppErr('CAPTURE_BEFORE_SHIFT', 'A foto foi tirada antes da entrada do turno.');
  if (t > now() + 5000) throw new AppErr('FUTURE_TIME', 'Horário no futuro.');
  if (late) {
    if (t < s.start && t < s.sched - CFG.early) throw new AppErr('BEFORE_WINDOW', `Esse horário é antes do início possível deste turno (${fmtTime(s.sched - CFG.early)}).`);
    if (s.end != null && t > s.end) throw new AppErr('AFTER_SHIFT', `Esse horário é depois da sua saída (${fmtTime(s.end)}).`);
    const br = s.breaks.find((b) => t >= b.s && t < (b.e ?? now()));
    if (br) throw new AppErr('IN_BREAK', `Nesse horário você estava em pausa (${fmtTime(br.s)}–${br.e ? fmtTime(br.e) : 'agora'}).`);
    if (s.deliveries.filter((d) => d.late).length >= CFG.maxLate) throw new AppErr('TOO_MANY_LATE', `Limite de ${CFG.maxLate} entregas esquecidas por turno. Fale com o gerente.`);
  }
  if (requestId) {                           // duplo clique / reenvio: devolve a mesma entrega
    const prev = s.deliveries.find((d) => d.rid === requestId);
    if (prev) return { delivery: prev, created: false };
  }
  if (!force) {
    const dup = s.deliveries.find((d) => !d.del && d.block === block && d.apt === a.apt && Math.abs(d.t - t) <= CFG.dupMs);
    if (dup) throw new AppErr('DUPLICATE_RECENT', 'Entrega igual registrada há instantes. Se for outra entrega, confirme o registro.');
  }
  if (value != null && (!Number.isInteger(value) || value < 0 || value > 1000000)) throw new AppErr('INVALID_VALUE', 'Valor inválido.');
  const d = { id: uid(), t, block, apt: a.apt, floor: a.floor, review: !!review, source, del: false, v: value };
  if (requestId) d.rid = requestId;
  if (late) { d.late = true; d.regAt = now(); }
  if (late && t < s.start) { s.startOrig ??= s.start; s.start = t; }       // esqueceu até de bater a entrada: o turno passa a começar na entrega mais antiga
  s.deliveries.push(d);
  s.deliveries.sort((p, q) => p.t - q.t);     // volta para a ordem do horário
  save();
  return { delivery: d, created: true };
}
function findDelivery(id) {
  for (const s of DB.shifts) { const d = s.deliveries.find((x) => x.id === id && !x.del); if (d) return { s, d }; }
  return null;
}
/** value: undefined = mantém, null = limpa, número = centavos. O horário nunca muda. */
function updateDelivery(id, blockRaw, aptRaw, value) {
  const f = findDelivery(id);
  if (!f) throw new AppErr('NOT_FOUND', 'Entrega não encontrada.');
  const block = normalizeBlock(blockRaw || f.d.block), a = normalizeApt(aptRaw || f.d.apt);
  if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 0 || value > 1000000)) throw new AppErr('INVALID_VALUE', 'Valor inválido.');
  const newV = value === undefined ? f.d.v : value;
  if (block !== f.d.block || a.apt !== f.d.apt || newV !== f.d.v) {      // guarda o original na 1ª correção (o gerente consulta)
    if (!f.d.orig) f.d.orig = { block: f.d.block, apt: f.d.apt, v: f.d.v };
    f.d.edAt = now();
  }
  f.d.block = block; f.d.apt = a.apt; f.d.floor = a.floor; f.d.review = false; f.d.v = newV;
  save();
  return f.d;
}
function deleteDelivery(id) {
  const f = findDelivery(id);
  if (!f) throw new AppErr('NOT_FOUND', 'Entrega não encontrada.');
  f.d.del = true; f.d.delAt = now();
  save();
}
/** Desfaz um registro automático logo após ele acontecer (some de verdade). */
function undoDelivery(id) {
  for (const s of DB.shifts) {
    const i = s.deliveries.findIndex((x) => x.id === id);
    if (i >= 0) { if (now() - (s.deliveries[i].regAt ?? s.deliveries[i].t) > 120000) throw new AppErr('TOO_LATE', 'Já passou do tempo de desfazer. Exclua pela lista.'); s.deliveries.splice(i, 1); save(); return; }
  }
  throw new AppErr('NOT_FOUND', 'Entrega não encontrada.');
}
