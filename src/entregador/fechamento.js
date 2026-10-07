/* Arquivo de fechamento enviado ao gerente (formato v2). */
function exportShifts(db) {
  return [...db.shifts].sort((a, b) => a.start - b.start).map((s) => ({
    id: s.id, data: s.date, preset: s.preset, previstoIni: s.sched, previstoFim: s.plannedEnd, entrada: s.start, saida: s.end ?? null,
    saidaAutomatica: s.closeReason === 'auto', pausas: s.breaks.map((b) => ({ i: b.s, f: b.e ?? null })),
    entregas: s.deliveries.map((d) => ({
      id: d.id, t: d.t, bloco: d.block, apto: d.apt, andar: d.floor, valor: d.v ?? null, origem: d.source, conferir: !!d.review,
      original: d.orig ? { bloco: d.orig.block, apto: d.orig.apt, valor: d.orig.v ?? null } : null, editadaEm: d.edAt ?? null,
      excluida: !!d.del, excluidaEm: d.delAt ?? null, tardia: !!d.late, registradaEm: d.late ? (d.regAt ?? null) : null,
    })),
  }));
}
/** `extra` = turnos que já estão com o gerente e não existem mais aqui (somados, nunca perdidos). Em turno com o mesmo id vale o que está neste aparelho. */
async function buildExport(db, exportedAt = now(), extra = []) {
  const r = riderById(db.user?.id);
  if (!r) throw new AppErr('NO_RIDER', 'Escolha quem você é (Pedro, Bruno, João, Kauã ou Nicolas) em Ajustes.');
  const local = exportShifts(db), ids = new Set(local.map((s) => s.id));
  const turnos = [...local, ...extra.filter((s) => s && typeof s.id === 'string' && Number.isFinite(s.entrada) && !ids.has(s.id))].sort((a, b) => a.entrada - b.entrada);
  const integridade = 'sha256:' + await sha256hex(canonical({ entregador: r.id, turnos }));
  return { formato: EXPORT_FORMAT, versao: 2, entregador: { id: r.id, nome: r.nome }, exportadoEm: exportedAt, turnos, integridade };
}

/** Planilha das entregas (já filtradas pelo painel): uma linha por entrega, com valor. */
function buildDeliveriesCsv(rows) {
  const head = ['Data', 'Hora', 'Bloco', 'Apartamento', 'Andar', 'Valor (R$)', 'Origem', 'Para conferir'];
  const body = rows.map((d) => [d.date, fmtTime(d.t), d.block, d.apt, d.floor === 0 ? 'SS' : d.floor, d.v == null ? '' : (d.v / 100).toFixed(2).replace('.', ','), d.source === 'photo' ? 'foto' : 'manual', d.review ? 'sim' : '']);
  return '﻿' + [head, ...body].map((r) => r.map(csvCell).join(';')).join('\r\n');
}
