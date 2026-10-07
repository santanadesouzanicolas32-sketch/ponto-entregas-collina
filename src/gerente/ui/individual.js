/* Interface do gerente: Entregadores (individual). */
/* ---------------- ENTREGADORES (individual) ---------------- */
function renderInd(el) {
  if (!hasData()) { el.innerHTML = slicers(null) + emptyState(); return; }
  const id = MG.rider, r = riderById(id), R = mRange(MG.period), base = sliceShifts(R, MG.preset);
  const rs = base.filter((s) => s.rid === id);
  const x = ST.riders[id];
  if (!x) { el.innerHTML = `${slicers('single')}<div class="card empty">Nenhum arquivo de ${esc(r.nome)} foi importado ainda.</div>`; return; }
  const A = aggregate(rs), P = prevRange(R), PA0 = P ? aggregate(sliceShifts(P, MG.preset).filter((s) => s.rid === id)) : null;
  const PA = PA0 && PA0.shifts >= 3 ? PA0 : null;                         // período anterior com menos de 3 turnos não serve de comparação
  const teamOthers = aggregate(base.filter((s) => s.rid !== id)), adj = adjustedIndex(rs, benchmarkOf(base.filter((s) => s.rid !== id))), allRider = compute().shifts.filter((s) => s.rid === id && (!MG.preset || s.preset === MG.preset));
  const tr = trendOf(allRider), dist = distBlock(rs), fr = freshness(x);
  const vsTeam = A.perHour != null && teamOthers.perHour ? delta(A.perHour, teamOthers.perHour) : null;
  const perShift = rs.filter((s) => s.sm.net >= 1800).sort((a, b) => a.entrada - b.entrada).slice(-40).map((s) => ({ d: s.data, v: s.live.length / (s.sm.net / 3600), n: s.live.length, open: s.saida == null }));
  const mxS = Math.max(1, ...perShift.map((p) => p.v));
  const byDay = {}; for (const s of rs) byDay[s.data] = (byDay[s.data] || 0) + s.live.reduce((a, d) => a + (d.valor || 0), 0);
  const dayList = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).slice(-45), mxD = Math.max(1, ...dayList.map((e) => e[1]));
  const ordered = [...rs].sort((a, b) => b.entrada - a.entrada);
  el.innerHTML = `${slicers('single')}
    <div class="card"><div class="row-between"><div><b style="font-family:Cinzel,serif;font-size:20px">${rlabel(id)}</b><div class="mut" style="font-size:12px;margin-top:4px">dados até ${fmtDateTime(x.exportadoEm)}</div></div>
      <span class="statpill ${fr.cls}">${fr.text}</span></div></div>
    <p class="mut bi-range">${ymdToDm(R.from)} a ${ymdToDm(R.to)}${MG.preset ? ` · turno ${MG.preset}h` : ''} · ${A.shifts} turnos em ${A.days} dias</p>
    ${!A.shifts ? '<div class="card empty">Sem turnos deste entregador no período escolhido.</div>' : `
    <div class="bi-kpis">
      <div class="kpi-card"><span>Entregas</span><b>${A.n}</b>${dtag(PA ? delta(A.n, PA.n) : null)}<small>${num(A.shifts ? A.n / A.shifts : null)} por turno</small></div>
      <div class="kpi-card"><span>Entregas por hora</span><b>${A.enough ? num(A.perHour) : '—'}</b>${A.enough ? dtag(PA && PA.perHour ? delta(A.perHour, PA.perHour) : null) : ''}<small>${A.enough ? (vsTeam != null ? `${vsTeam >= 0 ? '+' : '−'}${Math.abs(Math.round(vsTeam))}% vs. demais` : `${dur(A.net)} líquidas`) : 'poucos dados (menos de 4 h)'}</small></div>
      <div class="kpi-card strong"><span>Índice ajustado</span><b>${adj ? Math.round(adj.index) : '—'}</b><small>${adj ? `${adj.actual} feitas · ${num(adj.expected, 0)} esperadas` : 'dados insuficientes'}</small></div>
      <div class="kpi-card"><span>Vendido</span><b>${brl(A.sales)}</b>${dtag(PA ? delta(A.sales, PA.sales) : null)}<small>ticket ${A.ticket != null ? brl(Math.round(A.ticket)) : '—'} · ${pc(A.coverage)} com valor</small></div>
      <div class="kpi-card"><span>Pontualidade</span><b>${A.shifts - A.late}/${A.shifts}</b><small>entradas no horário · ${A.over ? `hora extra ${dur(A.over)}` : 'sem hora extra'}</small></div></div>
    <div class="card"><h2>Desenvolvimento</h2>
      ${tr.enough ? `<div class="row-between"><div><span class="trendbig ${tr.label === 'melhorando' ? 'good' : tr.label === 'caindo' ? 'bad' : ''}">${tr.label}</span> ${dtag(tr.delta)}</div><div class="mut" style="font-size:13px;text-align:right">últimos ${tr.k} turnos: ${num(tr.last)}/h<br>${tr.k} anteriores: ${num(tr.prev)}/h</div></div>`
        : `<p class="note" style="margin:0">Tendência disponível a partir de 6 turnos fechados (há ${tr.count}).</p>`}
      <h2 style="margin:16px 0 4px">Entregas por hora em cada turno</h2>
      <div class="bi-bars${perShift.length > 31 ? ' thin' : ''}">${perShift.map((p) => `<span class="bi-col" title="${ymdToDm(p.d)}: ${num(p.v)}/h · ${p.n} entregas${p.open ? ' (turno aberto)' : ''}"><span class="bi-bar" style="height:${Math.max(2, (p.v / mxS) * 100)}%;background:${RCOLORS[id]};${p.open ? 'opacity:.55' : ''}"></span></span>`).join('')}</div>
      <div class="axis"><span>${perShift.length ? ymdToDm(perShift[0].d) : ''}</span><span>máx ${num(mxS)}/h</span><span>${perShift.length ? ymdToDm(perShift[perShift.length - 1].d) : ''}</span></div>
      <h2 style="margin:16px 0 4px">Evolução semanal</h2>${lineChart([{ id, pts: weeklyRate(allRider) }, ...(teamOthers.n ? [{ id: 'equipe', pts: weeklyRate(base.filter((s) => s.rid !== id)) }] : [])])}</div>
    <div class="card"><h2>Vendido por dia</h2><div class="bi-bars${dayList.length > 31 ? ' thin' : ''}">${dayList.map(([d, v]) => `<span class="bi-col" title="${ymdToDm(d)}: ${brl(v)}"><span class="bi-bar" style="height:${Math.max(2, (v / mxD) * 100)}%"></span></span>`).join('')}</div>
      <div class="axis"><span>${dayList.length ? ymdToDm(dayList[0][0]) : ''}</span><span>máx ${brl(mxD)}</span><span>${dayList.length ? ymdToDm(dayList[dayList.length - 1][0]) : ''}</span></div></div>
    <div class="bi-grid">
      <div class="card"><h2>Por bloco</h2>${hbars(dist.blocks, RCOLORS[id])}</div>
      <div class="card"><h2>Por faixa de andar</h2>${hbars(dist.bands, RCOLORS[id])}</div></div>
    <div class="card"><h2>Mapa de calor · dia da semana × hora</h2>${heatmap(rs)}</div>
    <div class="card"><h2>Qualidade do registro</h2><div class="kvlist">
      <div class="kv"><span>Entregas lidas por foto</span><span>${pc(A.photoPct)}</span></div><div class="kv"><span>Entregas com valor informado</span><span>${pc(A.coverage)}</span></div>
      <div class="kv"><span>Entregas lançadas depois (esquecidas)</span><span>${pc(A.postedPct)}</span></div><div class="kv"><span>Entregas corrigidas depois</span><span>${pc(A.editedPct)}</span></div><div class="kv"><span>Entregas excluídas</span><span>${pc(A.deletedPct)}</span></div>
      <div class="kv"><span>Saídas esquecidas (fechadas automaticamente)</span><span>${A.auto}</span></div></div></div>
    <div class="card"><h2>Turnos · toque para ver os registros</h2><div class="scroll"><table class="mtable"><tr><th>Dia</th><th>Entrada</th><th>Saída</th><th>Líquido</th><th>Entr.</th><th>Entr./h</th><th>Vendido</th><th>Obs.</th></tr>
      ${ordered.slice(0, 60).map((s) => { const sv = s.live.reduce((a, d) => a + (d.valor || 0), 0), ph = s.sm.net >= 1800 ? s.live.length / (s.sm.net / 3600) : null; return `<tr data-act="m-shift" data-r="${s.rid}" data-s="${esc(s.id)}"><td>${ymdToDm(s.data)}</td><td>${fmtTime(s.entrada)}</td><td>${s.saida ? fmtTime(s.saida) : '<span class="gold">aberto</span>'}</td><td>${dur(s.sm.net)}</td><td>${s.live.length}</td><td>${num(ph)}</td><td>${brl(sv)}</td><td>${[s.sm.lateS ? 'atraso ' + dur(s.sm.lateS) : '', s.sm.over ? 'extra ' + dur(s.sm.over) : '', s.entradaOriginal ? 'entrada recuada' : '', s.auto ? 'saída automática' : '', s.ex ? 'EXEMPLO' : ''].filter(Boolean).join(', ') || '—'}</td></tr>`; }).join('')}</table></div></div>`}`;
}

actions['m-shift'] = (el) => {
  const s = compute().shifts.find((x) => x.rid === el.dataset.r && x.id === el.dataset.s);
  if (!s) return;
  const ds = [...s.dels].sort((a, b) => a.t - b.t);
  sheet(`<h3>${rlabel(s.rid)} · ${ymdToDm(s.data)}</h3>
    <div class="kvlist"><div class="kv"><span>Previsto</span><span>${fmtTime(s.previstoIni)} – ${fmtTime(s.previstoFim)}</span></div><div class="kv"><span>Entrada registrada</span><span>${fmtTime(s.entrada)}</span></div>
      ${s.entradaOriginal ? `<div class="kv"><span>Entrada ajustada</span><span>batida às ${fmtTime(s.entradaOriginal)}, recuada para ${fmtTime(s.entrada)} por entrega lançada depois</span></div>` : ''}
      <div class="kv"><span>Saída registrada</span><span>${s.saida ? fmtTime(s.saida) + (s.auto ? ' (automática)' : '') : 'não bateu'}</span></div>
      <div class="kv"><span>Pausas</span><span>${s.pausas.length ? s.pausas.map((p) => `${fmtTime(p.i)}–${p.f ? fmtTime(p.f) : '…'}`).join(' · ') : 'nenhuma'}</span></div>
      <div class="kv"><span>Horas líquidas</span><span>${dur(s.sm.net)}</span></div></div>
    <h2 style="margin:14px 0 4px">Registros (${s.live.length}${ds.length !== s.live.length ? ` + ${ds.length - s.live.length} excluídas` : ''})</h2>
    ${ds.map((d) => `<button class="item" data-act="m-del" data-r="${s.rid}" data-d="${esc(d.id)}"><span class="dest">${esc(d.bloco)} ${esc(d.apto)}</span><span class="t">${fmtTimeSec(d.t)}</span>${d.excluida ? '<span class="badge">EXCLUÍDA</span>' : d.original ? '<span class="badge">CORRIGIDA</span>' : ''}${d.tardia ? '<span class="badge">DEPOIS</span>' : ''}${d.valor != null ? `<span class="gold amt">${brl(d.valor)}</span>` : ''}</button>`).join('') || '<div class="empty">Sem registros.</div>'}
    <div class="card" style="margin-top:14px"><label for="ignMotivo">Este turno não deveria estar aqui?</label>
      <select id="ignMotivo">${['Nome escolhido errado', 'Turno de teste', 'Turno duplicado', 'Outro motivo'].map((m) => `<option>${m}</option>`).join('')}</select>
      <button class="btn sm red" id="ignGo" style="width:100%;margin-top:8px">Ignorar nas análises</button>
      <p class="note" style="margin:8px 0 0">Não apaga nada: o turno continua guardado e pode ser restaurado em Dados.</p></div>
    <button class="btn" id="mClose" style="margin-top:14px">Fechar</button>`);
  $('mClose').onclick = closeSheet;
  $('ignGo').onclick = async () => {
    const b = $('ignGo');
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Toque de novo para confirmar'; return; }
    await ignoreShift(s.rid, s.id, $('ignMotivo').value); closeSheet(); mRender(); toast('Turno ignorado nas análises');
  };
};
const fmtTimeSec = (ms) => `${fmtTime(ms)}:${String(parts(ms).second).padStart(2, '0')}`;

/** Ficha de um registro: tudo o que o gerente precisa para responder a uma dúvida do entregador. */
actions['m-del'] = (el) => {
  const s = compute().shifts.find((x) => x.rid === el.dataset.r && x.dels.some((d) => d.id === el.dataset.d));
  const d = s?.dels.find((x) => x.id === el.dataset.d);
  if (!d) return;
  const ord = [...s.dels].sort((a, b) => a.t - b.t), i = ord.findIndex((x) => x.id === d.id), prev = ord[i - 1], next = ord[i + 1];
  const nb = (x, l) => (x ? `<div class="kv"><span>${l}</span><span>${esc(x.bloco)} ${esc(x.apto)} às ${fmtTime(x.t)}</span></div>` : '');
  sheet(`<h3>${esc(d.bloco)} ${esc(d.apto)}</h3><p class="mut" style="margin:0 0 8px;font-size:13px">${rlabel(d.rid)} · ${ymdToDm(d.data)}</p>
    <div class="kvlist">
      <div class="kv"><span>Horário registrado</span><span class="gold">${fmtTimeSec(d.t)}</span></div>
      <div class="kv"><span>Bloco / apartamento</span><span>${esc(d.bloco)} / ${esc(d.apto)} (${d.andar === 0 ? 'subsolo' : d.andar + 'º andar'})</span></div>
      <div class="kv"><span>Valor da comanda</span><span>${d.valor != null ? brl(d.valor) : 'não informado'}</span></div>
      <div class="kv"><span>Origem</span><span>${d.origem === 'photo' ? 'foto da comanda' : 'digitado'}</span></div>
      <div class="kv"><span>Situação</span><span>${statusOf(d)}</span></div>
      ${d.tardia ? `<div class="kv"><span>Lançada depois</span><span>entrega às ${fmtTimeSec(d.t)} · registrada às ${fmtTimeSec(d.registradaEm)} (${fmtLag(d.registradaEm - d.t)} depois)</span></div>` : ''}
      ${d.original ? `<div class="kv"><span>Valores originais</span><span>${esc(d.original.bloco)} ${esc(d.original.apto)} · ${d.original.valor != null ? brl(d.original.valor) : 'sem valor'}</span></div><div class="kv"><span>Corrigida em</span><span>${d.editadaEm ? fmtDateTime(d.editadaEm) : '—'}</span></div>` : ''}
      ${d.excluida ? `<div class="kv"><span>Excluída em</span><span>${d.excluidaEm ? fmtDateTime(d.excluidaEm) : '—'}</span></div>` : ''}
      <div class="kv"><span>Turno</span><span>${fmtTime(s.entrada)} – ${s.saida ? fmtTime(s.saida) : 'aberto'}</span></div>
      ${s.pausas.length ? `<div class="kv"><span>Pausas no turno</span><span>${s.pausas.map((p) => `${fmtTime(p.i)}–${p.f ? fmtTime(p.f) : '…'}`).join(' · ')}</span></div>` : ''}
      ${nb(prev, 'Registro anterior')}${nb(next, 'Registro seguinte')}</div>
    <button class="btn" id="mClose" style="margin-top:14px">Fechar</button>`);
  $('mClose').onclick = closeSheet;
};
