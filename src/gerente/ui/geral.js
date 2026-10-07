/* Interface do gerente: Visão geral. */
/* ---------------- VISÃO GERAL ---------------- */
function prevRange(R) { return R.all ? null : { from: addDays(R.from, -R.days), to: addDays(R.from, -1), days: R.days }; }

function renderGeral(el) {
  if (!hasData()) { el.innerHTML = slicers(null) + emptyState(); return; }
  const R = mRange(MG.period), base = sliceShifts(R, MG.preset);
  const ids = ROSTER.map((r) => r.id).filter((id) => base.some((s) => s.rid === id) || ST.riders[id]);
  const shown = ids.filter((id) => !MG.sel.size || MG.sel.has(id));
  let shifts = base.filter((s) => shown.includes(s.rid));
  if (MG.day) shifts = shifts.filter((s) => s.data === MG.day);
  const K = aggregate(shifts), P = prevRange(R), PK0 = P ? aggregate(sliceShifts(P, MG.preset).filter((s) => shown.includes(s.rid))) : null;
  const PK = PK0 && PK0.shifts >= 3 ? PK0 : null;                           // comparar com um período quase vazio só assusta (ex.: +4900%)
  const rows = shown.map((id) => {
    const rs = shifts.filter((s) => s.rid === id), a = aggregate(rs), adj = adjustedIndex(rs, benchmarkOf(base.filter((s) => s.rid !== id))), t = trendOf(base.filter((s) => s.rid === id));
    return { id, a, adj, t, last: ST.riders[id]?.exportadoEm || 0 };
  });
  const best = (f, dir = 1) => { const v = rows.filter((r) => r.a.enough && f(r) != null).map(f); return v.length > 1 ? (dir > 0 ? Math.max(...v) : Math.min(...v)) : null; };
  const bPH = best((r) => r.a.perHour), bIx = best((r) => r.adj?.index);      // só ritmo e índice recebem destaque: valor vendido depende da comanda, não do entregador
  const cell = (r, v, text, bestV) => (!r.a.enough ? `<td class="low">—</td>` : `<td class="${bestV != null && v === bestV ? 'best' : ''}">${text}</td>`);
  const table = `<div class="scroll"><table class="mtable"><tr><th>Entregador</th><th>Turnos</th><th>Horas</th><th>Entregas</th><th>Entr./h</th><th>Índice</th><th>Vendido</th><th>Ticket</th><th>Com valor</th><th>Tendência</th></tr>
    ${rows.map((r) => `<tr data-act="m-open" data-id="${r.id}"><td>${rlabel(r.id)}${r.a.shifts && !r.a.enough ? ' <span class="lowtag">poucos dados</span>' : ''}${!r.a.shifts ? ' <span class="lowtag">sem turnos</span>' : ''}<small>dados até ${r.last ? fmtDateTime(r.last) : '—'}</small></td>
      <td>${r.a.shifts}</td><td>${dur(r.a.net)}</td><td>${r.a.n}</td>
      ${cell(r, r.a.perHour, num(r.a.perHour), bPH)}${cell(r, r.adj?.index, r.adj ? Math.round(r.adj.index) : '—', bIx)}<td>${brl(r.a.sales)}</td>
      <td>${r.a.ticket != null ? brl(Math.round(r.a.ticket)) : '—'}</td>
      <td>${pc(r.a.coverage)}</td><td class="${r.t.enough ? (r.t.label === 'melhorando' ? 'best' : r.t.label === 'caindo' ? 'bad' : '') : 'low'}">${r.t.enough ? `${r.t.label} ${dtag(r.t.delta)}` : '—'}</td></tr>`).join('')}</table></div>
    <p class="note" style="margin:10px 0 0"><b>Entr./h</b> = entregas por hora líquida (sem pausas). <b>Índice</b> compara com o ritmo dos demais entregadores nos mesmos dias da semana e horas (100 = igual aos demais). Vendido e ticket são informação: dependem da comanda, por isso não recebem destaque. “—” = menos de 4 h no período. <button class="linkbtn" data-act="m-method">Como a comparação é feita</button></p>`;
  const dist = distBlock(shifts), team = rows.map((r) => ({ id: r.id, pts: weeklyRate(shifts.filter((s) => s.rid === r.id)) }));
  const ex = Object.values(ST.riders).some((x) => x.turnos.some((s) => s._ex));
  el.innerHTML = `${slicers('multi')}
    ${ex ? '<div class="exbanner">Há dados de EXEMPLO misturados nesta base. Remova em Dados antes de usar os números.</div>' : ''}
    <p class="mut bi-range">${R.from === R.to ? ymdToDm(R.from) : `${ymdToDm(R.from)} a ${ymdToDm(R.to)}`}${MG.preset ? ` · turno ${MG.preset}h` : ''}${MG.day ? ` · dia ${ymdToDm(MG.day)}` : ''} · ${K.shifts} turnos</p>
    <div class="bi-kpis">
      <div class="kpi-card"><span>Entregas</span><b>${K.n}</b>${dtag(PK ? delta(K.n, PK.n) : null)}</div>
      <div class="kpi-card strong"><span>Vendido</span><b>${brl(K.sales)}</b>${dtag(PK ? delta(K.sales, PK.sales) : null)}</div>
      <div class="kpi-card"><span>Ticket médio</span><b>${K.ticket != null ? brl(Math.round(K.ticket)) : '—'}</b><small>${K.nv} de ${K.n} com valor</small></div>
      <div class="kpi-card"><span>Entregas por hora</span><b>${num(K.perHour)}</b>${dtag(PK && K.perHour != null ? delta(K.perHour, PK.perHour) : null)}<small>${dur(K.net)} líquidas · ${K.days} dias</small></div></div>
    <div class="card"><div class="row-between" style="margin-bottom:10px"><h2 style="margin:0">Desempenho por entregador</h2></div>${table}</div>
    <div class="card"><h2>Entregas por dia</h2>${stackedDays(base.filter((s) => shown.includes(s.rid)), R)}<div class="legend">${shown.map((id) => `<span>${rdot(id)}${esc(rname(id))}</span>`).join('')}</div><p class="mut" style="font-size:12px;margin:8px 0 0">Toque em um dia para filtrar a tela.</p></div>
    <div class="card"><h2>Evolução semanal · entregas por hora</h2>${lineChart(team)}</div>
    <div class="bi-grid">
      <div class="card"><h2>Por bloco</h2>${hbars(dist.blocks, 'var(--gold)')}</div>
      <div class="card"><h2>Por faixa de andar</h2>${hbars(dist.bands, 'var(--gold)')}</div></div>
    <div class="card"><h2>Mapa de calor · dia da semana × hora</h2>${heatmap(shifts)}</div>`;
}
actions['m-open'] = (el) => { MG.rider = el.dataset.id; MG.tab = 'ind'; mRender(); window.scrollTo(0, 0); };

actions['m-method'] = () => sheet(`<h3>Como a comparação é feita</h3>
  <div class="note"><p>Todos os entregadores passam pelas <b>mesmas regras</b>, calculadas só com os arquivos de fechamento que eles enviaram.</p>
  <p><b>Horas líquidas</b> = tempo entre a entrada e a saída, sem as pausas. Turno ainda aberto conta até o momento do envio.</p>
  <p><b>Entregas por hora</b> = entregas ÷ horas líquidas. Só é mostrado com <b>4 h ou mais</b> no período; antes disso aparece “poucos dados” e o entregador não entra no destaque.</p>
  <p><b>Índice</b> = entregas feitas ÷ entregas esperadas se ele tivesse o ritmo dos <b>demais entregadores</b> (ele próprio fica fora da conta) nos <b>mesmos dias da semana e horas</b>. Isso corrige a diferença de movimento entre horários e entre dias (quem pega segunda-feira ou uma hora mais fraca não é penalizado). Quando um dia da semana tem pouco dado, o ritmo é puxado para o da hora. 100 = igual aos demais, 120 = 20% acima. Só aparece com pelo menos 5 entregas esperadas.</p>
  <p><b>Vendido</b> e <b>ticket</b> somam o valor das comandas informadas. É informação, não nota: o valor depende do cliente e do pedido, não do entregador, por isso nenhum deles recebe destaque nem entra em ranking. Veja <b>Com valor</b>: quem informa menos valores aparece com vendido menor.</p>
  <p><b>Tendência</b> compara a média de entregas/h dos últimos turnos com a dos turnos anteriores (mínimo de 6 turnos fechados): acima de +8% = melhorando, abaixo de −8% = caindo.</p>
  <p><b>Entregas excluídas</b> não contam. <b>Corrigidas</b> contam com o valor corrigido e ficam marcadas em Consultas, com o original.</p>
  <p>Não existe nota única: cada número mostra uma dimensão, para a decisão ficar com você.</p></div>
  <button class="btn" id="mClose" style="margin-top:14px">Fechar</button>`) || ($('mClose').onclick = closeSheet);
