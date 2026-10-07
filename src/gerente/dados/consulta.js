/* Gerência: consulta de registros e pontos de atenção. */
/* ---------------- consulta de registros ---------------- */
function allDeliveries() { return compute().shifts.flatMap((s) => s.dels); }
function queryDeliveries(q) {
  const apt = String(q.apt || '').trim().toUpperCase(), tFrom = q.tFrom ? q.tFrom.split(':').map(Number) : null, tTo = q.tTo ? q.tTo.split(':').map(Number) : null;
  const minOfDay = (ms) => { const p = parts(ms); return Number(p.hour) % 24 * 60 + Number(p.minute); };
  return allDeliveries().filter((d) => {
    if (q.riders?.size && !q.riders.has(d.rid)) return false;
    if (q.from && d.data < q.from) return false;
    if (q.to && d.data > q.to) return false;
    if (tFrom && minOfDay(d.t) < tFrom[0] * 60 + tFrom[1]) return false;
    if (tTo && minOfDay(d.t) > tTo[0] * 60 + tTo[1]) return false;
    if (q.block && d.bloco !== q.block) return false;
    if (apt && !d.apto.includes(apt)) return false;
    if (q.vMin != null && (d.valor == null || d.valor < q.vMin)) return false;
    if (q.vMax != null && (d.valor == null || d.valor > q.vMax)) return false;
    if (q.source && d.origem !== q.source) return false;
    if (q.status === 'normal' && (d.excluida || d.original || d.conferir)) return false;
    if (q.status === 'editada' && !d.original) return false;
    if (q.status === 'excluida' && !d.excluida) return false;
    if (q.status === 'conferir' && !d.conferir) return false;
    if (q.status === 'tardia' && !d.tardia) return false;
    return true;
  });
}
/** 35 min · 1h05 */
const fmtLag = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
const statusOf = (d) => (d.excluida ? 'Excluída' : d.original ? 'Corrigida' : d.conferir ? 'Para conferir' : 'Normal');

/** Com a conexão automática ligada, "último envio" é só a última atividade do entregador: folga não é atraso. */
const isLinked = () => !!syncConfig();
const MAX_LATE_SHARE = 0.10;                  // acima disso, entregas lançadas depois viram ponto de atenção
/** Situação do envio de um entregador: { cls, text }. */
function freshness(x) {
  if (isLinked()) return { cls: 'ok', text: 'automático' };
  const age = (now() - x.exportadoEm) / 864e5;
  return age > STALE_DAYS ? { cls: 'warn', text: `há ${Math.floor(age)} dias` } : { cls: 'ok', text: 'em dia' };
}

/** Pontos de atenção na base. */
function dataQuality() {
  const items = [];
  const shifts = compute().shifts;
  for (const r of ROSTER) {
    const x = ST.riders[r.id];
    if (!x) { items.push({ level: 'warn', text: `${r.nome}: ${isLinked() ? 'ainda não enviou nada pela conexão automática' : 'nenhum arquivo importado ainda'}.` }); continue; }
    const age = (now() - x.exportadoEm) / 864e5;
    if (!isLinked() && age > STALE_DAYS) items.push({ level: 'warn', text: `${r.nome}: dados só até ${fmtDateTime(x.exportadoEm)} (${Math.floor(age)} dias atrás). Peça um novo fechamento.` });
    if (x.exportadoEm > now() + 10 * 60000) items.push({ level: 'warn', text: `${r.nome}: o relógio do aparelho está adiantado (envio marcado para ${fmtDateTime(x.exportadoEm)}). Os horários dele podem estar errados.` });
    const turnos = activeTurnos(r.id), byDate = {};
    for (const s of turnos) byDate[s.data] = (byDate[s.data] || 0) + 1;
    const dup = Object.entries(byDate).filter(([, n]) => n > 1).map(([d]) => ymdToDm(d));
    if (dup.length) items.push({ level: 'warn', text: `${r.nome}: mais de um turno no mesmo dia (${dup.slice(0, 5).join(', ')}). Pode ser outro aparelho; use "Ignorar" no turno que sobrar.` });
    const recuadas = turnos.filter((s) => s.entradaOriginal).length;
    if (recuadas) items.push({ level: 'info', text: `${r.nome}: ${recuadas} turno(s) com a entrada recuada por entrega lançada depois (a entrada batida está na ficha do turno).` });
    const open = turnos.filter((s) => s.saida == null).length;
    if (open) items.push({ level: 'info', text: `${r.nome}: ${open} turno(s) sem saída batida.` });
    const mine = shifts.filter((s) => s.rid === r.id), n = mine.reduce((a, s) => a + s.live.length, 0), late = mine.reduce((a, s) => a + s.live.filter((d) => d.tardia).length, 0);
    if (late >= 5 && n && late / n > MAX_LATE_SHARE) items.push({ level: 'warn', text: `${r.nome}: ${Math.round((late / n) * 100)}% das entregas (${late} de ${n}) foram lançadas depois, como esquecidas. Vale conferir em Consultas → Situação.` });
  }
  if (Object.values(ST.riders).some((x) => x.turnos.some((s) => s._ex))) items.unshift({ level: 'warn', text: 'Há dados de EXEMPLO misturados. Remova-os em Dados antes de analisar.' });
  return items;
}
