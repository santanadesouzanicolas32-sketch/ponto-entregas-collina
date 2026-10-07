/* Lançamentos prontos: entregas passadas pelo dono do sistema para entrar no histórico de UMA pessoa.
   Cada lote entra uma única vez por aparelho (o id fica em DB.imported), mesmo que a entrega seja excluída depois.
   Entram como "lançadas depois": o painel do gerente vê a hora real da entrega e a hora em que foram registradas.
   Para lançar outro lote, acrescente um item em LANCAMENTOS com id novo. Valor em centavos; hora no relógio de São Paulo. */
const LANCAMENTOS = [
  { id: 'lanc-2026-10-07-b', date: '2026-10-07', rider: 'nicolas', items: [
    { h: 15, m: 22, block: 'C2', apt: '273', v: 1908 },
    { h: 15, m: 39, block: 'C1', apt: '12', v: 1166 },
    { h: 16, m: 40, block: 'A1', apt: '82', v: 1178 },
    { h: 18, m: 2, block: 'C2', apt: '71', v: 957 },
    { h: 18, m: 19, block: 'B1', apt: '122', v: 1190 },
    { h: 18, m: 46, block: 'C2', apt: '214', v: 1580 },
    { h: 18, m: 44, block: 'C1', apt: '273', v: 975 },
  ] },
];

/** Aplica os lotes ainda não aplicados deste entregador. Vai para o turno do dia (o aberto, se houver); sem turno, cria um começando na 1ª entrega.
 *  Pula entrega idêntica já registrada (mesmo bloco e apartamento a até 5 min). Devolve quantas entregas entraram. */
function applyLancamentos() {
  let added = 0, touched = false;
  for (const batch of LANCAMENTOS) {
    if (DB.imported.includes(batch.id) || DB.user?.id !== batch.rider) continue;      // lote é de uma pessoa só
    const items = batch.items.map((i) => ({ ...i, t: localToMs(batch.date, i.h, i.m), n: normalizeApt(i.apt), block: normalizeBlock(i.block) }));
    let s = DB.shifts.find((x) => x.date === batch.date && x.end == null) || DB.shifts.find((x) => x.date === batch.date);
    if (!s) {
      const sched = localToMs(batch.date, 15);
      s = { id: uid(), date: batch.date, preset: 15, sched, plannedEnd: sched + CFG.presets[15] * 60000, start: Math.min(...items.map((i) => i.t)), end: null, closeReason: null, breaks: [], deliveries: [] };
      DB.shifts.push(s);
    }
    for (const i of items) {
      if (s.deliveries.some((d) => !d.del && d.block === i.block && d.apt === i.n.apt && Math.abs(d.t - i.t) <= 300000)) continue;
      if (i.t < s.start) { if (s.startOrig == null) s.startOrig = s.start; s.start = i.t; }
      s.deliveries.push({ id: uid(), t: i.t, block: i.block, apt: i.n.apt, floor: i.n.floor, review: false, source: 'manual', del: false, v: i.v, late: true, regAt: now() });
      added++;
    }
    s.deliveries.sort((p, q) => p.t - q.t);
    DB.imported.push(batch.id); touched = true;
  }
  if (touched) save();
  return added;
}
