/* Planilhas do entregador. */
function buildCsv(days) {
  const nowMs = now(), from = addDays(ymdOf(nowMs), -(days - 1));
  const rows = [['Dia', 'Entrada', 'Saida', 'Pausas (min)', 'Liquido (h:mm)', 'Entregas', 'Vendido (R$)', 'Por hora', 'Atraso (min)', 'Hora extra (min)', 'Obs.']];
  for (const s of [...DB.shifts].sort((a, b) => a.start - b.start)) {
    if (s.date < from) continue;
    const sm = summarize(s, nowMs), n = liveDeliveries(s).length;
    rows.push([s.date, fmtTime(s.start), s.end ? fmtTime(s.end) : '', Math.floor(sm.pause / 60), `${Math.floor(sm.net / 3600)}:${String(Math.floor((sm.net % 3600) / 60)).padStart(2, '0')}`,
      n, (liveDeliveries(s).reduce((a, d) => a + (d.v || 0), 0) / 100).toFixed(2).replace('.', ','), String(perHour(n, sm.net)).replace('.', ','), Math.floor(sm.lateS / 60), Math.floor(sm.over / 60), s.closeReason === 'auto' ? 'saída não batida (fechado automaticamente)' : '']);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}
