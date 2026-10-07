/* Interface do entregador: Histórico. */
/* ---------------- PAINEL: ver bi.js ---------------- */
actions['export-csv'] = () => { download(`espelho-${ymdOf(now())}.csv`, buildCsv(90), 'text/csv;charset=utf-8'); toast('Planilha gerada (últimos 90 dias)'); };

/* ---------------- HISTÓRICO ---------------- */
function allDeliveries() {
  const out = [];
  for (const s of DB.shifts) for (const d of liveDeliveries(s)) out.push({ ...d, date: s.date });
  return out.sort((a, b) => b.t - a.t);
}
function renderHist(el) {
  el.innerHTML = `<div class="seg"><button data-act="hmode" data-m="ent" class="${UI.hmode === 'ent' ? 'on' : ''}">Entregas</button><button data-act="hmode" data-m="dia" class="${UI.hmode === 'dia' ? 'on' : ''}">Dias (ponto)</button></div><div id="hbody"></div>`;
  UI.hmode === 'ent' ? histEntregas() : histDias();
}
actions.hmode = (el) => { UI.hmode = el.dataset.m; UI.histPage = 1; render(); };
function histEntregas() {
  const body = $('hbody');
  body.innerHTML = `<div class="toolbar"><input id="fq" placeholder="Buscar apto (ex: 241)" value="${esc(UI.f.q)}" maxlength="8" aria-label="Buscar apartamento">
    <select id="fb" aria-label="Bloco"><option value="">Todos os blocos</option>${CFG.blocks.map((b) => `<option ${UI.f.block === b ? 'selected' : ''}>${b}</option>`).join('')}</select>
    <input type="date" id="ff" value="${UI.f.from}" aria-label="De" style="flex:0 1 150px"><input type="date" id="ft" value="${UI.f.to}" aria-label="Até" style="flex:0 1 150px"></div><div class="card" id="entList"></div>`;
  const draw = () => {
    let l = allDeliveries();
    if (UI.f.q) l = l.filter((d) => d.apt.includes(UI.f.q.toUpperCase()));
    if (UI.f.block) l = l.filter((d) => d.block === UI.f.block);
    if (UI.f.from) l = l.filter((d) => d.date >= UI.f.from);
    if (UI.f.to) l = l.filter((d) => d.date <= UI.f.to);
    const shown = l.slice(0, UI.histPage * 50), flagged = l.filter((d) => d.review).length;
    $('entList').innerHTML = `<h2>${l.length} entregas${flagged ? ` · ${flagged} para conferir` : ''}</h2>` + (shown.length
      ? shown.map((d) => `<button class="item" data-act="edit-delivery" data-id="${esc(d.id)}"><span class="dest">${esc(d.block)} ${esc(d.apt)}</span><span class="t">${fmtDateTime(d.t)}</span>${d.review ? '<span class="badge">CONFERIR</span>' : ''}${d.source === 'photo' ? '<span class="tag photo">FOTO</span>' : ''}${d.late ? '<span class="tag">DEPOIS</span>' : ''}${d.v != null ? `<span class="gold amt">${brl(d.v)}</span>` : ''}</button>`).join('') + (shown.length < l.length ? '<button class="btn sm loadmore" data-act="more-del">Carregar mais</button>' : '')
      : '<div class="empty">Nenhuma entrega encontrada.</div>');
  };
  let tm;
  $('fq').oninput = (e) => { UI.f.q = e.target.value.trim(); UI.histPage = 1; clearTimeout(tm); tm = setTimeout(draw, 200); };
  $('fb').onchange = (e) => { UI.f.block = e.target.value; UI.histPage = 1; draw(); };
  $('ff').onchange = (e) => { UI.f.from = e.target.value; UI.histPage = 1; draw(); };
  $('ft').onchange = (e) => { UI.f.to = e.target.value; UI.histPage = 1; draw(); };
  draw();
}
actions['more-del'] = () => { UI.histPage++; histEntregas(); };
function histDias() {
  const nowMs = now();
  const list = [...DB.shifts].sort((a, b) => b.start - a.start).slice(0, 90);
  $('hbody').innerHTML = `<div class="card"><div class="row-between" style="margin-bottom:10px"><h2 style="margin:0">Espelho de ponto</h2><button class="btn sm" data-act="export-csv">Baixar planilha</button></div>` + (list.length
    ? `<div class="scroll"><table class="tbl-click"><tr><th>Dia</th><th>Entrada</th><th>Pausas</th><th>Saída</th><th>Líquido</th><th class="num">Entr.</th><th class="num">Vendido</th><th class="num">Ritmo</th><th>Obs.</th></tr>${list.map((s) => {
      const sm = summarize(s, nowMs), n = liveDeliveries(s).length;
      const obs = [sm.lateS ? `<span class="warnc">atraso ${dur(sm.lateS)}</span>` : '', sm.over ? `<span class="good">extra ${dur(sm.over)}</span>` : '', sm.short ? `<span class="bad">falta ${dur(sm.short)}</span>` : '', s.closeReason === 'auto' ? '<span class="tag auto">AUTO</span>' : ''].filter(Boolean).join(' ');
      return `<tr data-act="shift-detail" data-id="${esc(s.id)}"><td>${ymdToDm(s.date)}</td><td>${fmtTime(s.start)}</td><td>${s.breaks.length ? s.breaks.map((b) => `${fmtTime(b.s)}–${b.e ? fmtTime(b.e) : '…'}`).join(' ') : '—'}</td><td>${s.end ? fmtTime(s.end) : '<span class="gold">aberto</span>'}</td><td>${dur(sm.net)}</td><td class="num">${n}</td><td class="num">${brl(liveDeliveries(s).reduce((x, d) => x + (d.v || 0), 0))}</td><td class="num">${num1(perHour(n, sm.net))}</td><td>${obs || '—'}</td></tr>`;
    }).join('')}</table></div>` : '<div class="empty">Nenhum turno registrado ainda.</div>') + '</div>';
}
actions['shift-detail'] = (el) => {
  const s = DB.shifts.find((x) => x.id === el.dataset.id);
  if (!s) return;
  const sm = summarize(s, now()), dl = liveDeliveries(s).sort((a, b) => a.t - b.t);
  sheet(`<h3>${ymdToDm(s.date)} · ${fmtTime(s.start)}–${s.end ? fmtTime(s.end) : 'aberto'}</h3>
    <div class="trio" style="margin:10px 0"><div><b>${dl.length}</b><span>entregas</span></div><div><b>${num1(perHour(dl.length, sm.net))}</b><span>por hora</span></div><div><b>${dur(sm.net)}</b><span>líquido</span></div></div>
    ${dl.map((d) => `<button class="item" data-act="edit-delivery" data-id="${esc(d.id)}"><span class="dest">${esc(d.block)} ${esc(d.apt)}</span><span class="t">${fmtTime(d.t)}</span>${d.v != null ? `<span class="gold amt">${brl(d.v)}</span>` : ''}</button>`).join('') || '<div class="empty">Sem entregas.</div>'}
    <button class="btn" style="margin-top:14px" id="shClose">Fechar</button>`);
  $('shClose').onclick = closeSheet;
};
