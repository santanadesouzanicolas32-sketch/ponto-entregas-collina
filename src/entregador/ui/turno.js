/* Interface do entregador: aba Turno. */
/* ---------------- TURNO ---------------- */
const deliveryRow = (d) => `<button class="item" data-act="edit-delivery" data-id="${esc(d.id)}"><span class="dest">${esc(d.block)} ${esc(d.apt)}</span><span class="t">${fmtTime(d.t)}</span>${d.review ? '<span class="badge">CONFERIR</span>' : ''}${d.source === 'photo' ? '<span class="tag photo">FOTO</span>' : ''}${d.late ? '<span class="tag">DEPOIS</span>' : ''}${d.v != null ? `<span class="gold amt">${brl(d.v)}</span>` : ''}</button>`;
const alertsHtml = (al) => (al.length ? `<div class="alerts">${al.map((a) => `<div class="alert ${esc(a.severity)}" role="status"><i></i><span>${esc(a.message)}</span></div>`).join('')}</div>` : '');

function hourBars(dl, s) {
  const by = {};
  dl.forEach((d) => { const h = hourOf(d.t); by[h] = (by[h] || 0) + 1; });
  const h0 = hourOf(s.start), hs = Array.from({ length: 9 }, (_, i) => (h0 + i) % 24);
  const mx = Math.max(1, ...hs.map((h) => by[h] || 0));
  return hs.map((h) => `<div class="hrow"><span class="k">${String(h).padStart(2, '0')}h</span><span class="b"><div style="width:${((by[h] || 0) / mx) * 100}%"></div></span><span class="v">${by[h] || 0}</span></div>`).join('');
}

function renderTurno(el) {
  const v = currentView();
  if (!v.shift) return renderNoShift(el);
  const { shift: s, deliveries: dl, sm, pace, proj, base, alerts, goal } = v;
  notifyNew(s, alerts);
  const n = dl.length, pg = Math.min(100, Math.round((n / goal) * 100)), paused = sm.status === 'on_break';
  const sales = dl.reduce((a, d) => a + (d.v || 0), 0), nWith = dl.filter((d) => d.v != null).length;
  el.innerHTML = `
    <div class="card shiftbar">
      <div class="times"><div><span>Entrada</span><b>${fmtTime(s.start)}</b></div><i></i><div><span>Saída prevista</span><b class="gold">${fmtTime(s.plannedEnd)}</b></div></div>
      <div class="acts"><button class="btn sm" data-act="${paused ? 'break-end' : 'break-start'}">${paused ? 'Retomar' : 'Pausar'}</button><button class="btn sm red" data-act="end-shift">Saída</button></div>
    </div>
    ${paused ? `<div class="pausebar">Em pausa desde ${fmtTime(s.breaks[s.breaks.length - 1].s)}. O tempo parado não conta.</div>` : ''}
    ${alertsHtml(alerts)}
    <div class="card">
      <div class="row" style="justify-content:space-between;align-items:baseline"><div class="count"><b>${n}</b><span> / ${goal}</span></div><span class="gold" style="font-weight:700">${n >= goal ? 'Meta batida' : pg + '%'}</span></div>
      <div class="progress"><div style="width:${pg}%"></div></div>
      ${n < goal && proj.expected != null ? `<div class="proj"><span>Previsão ao fim: <b>~${proj.expected}</b></span>${proj.eta ? `<span>Meta às <b>${fmtTime(proj.eta)}</b></span>` : ''}${proj.required ? `<span>Precisa de <b>${num1(proj.required)}/h</b></span>` : ''}</div>` : ''}
      <div class="trio" style="margin-top:14px">
        <div><b>${num1(pace.perHour)}</b><span>por hora ${base.delta != null ? `<em class="${base.delta >= 0 ? 'up' : 'down'}">${pct(base.delta)}</em>` : ''}</span></div>
        <div><b>${brl(sales)}</b><span>vendido</span></div>
        <div><b>${nWith ? brl(Math.round(sales / nWith)) : '—'}</b><span>ticket médio</span></div></div>
    </div>
    <div class="card"><h2>Entregas de hoje</h2>${n ? dl.map(deliveryRow).join('') : '<div class="empty">Nenhuma entrega ainda.<br>Toque em Foto da comanda para registrar a primeira.</div>'}</div>
    <details class="card"><summary>Entregas por hora</summary>${hourBars(dl, s)}</details>`;
  warmUpOcr();
}

function renderNoShift(el) {
  const hr = hourOf(now()), greet = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
  const presets = Object.entries(CFG.presets).map(([h, min]) => {
    const endMin = (Number(h) * 60 + min) % 1440;
    return `<button class="btn gold start" data-act="start-shift" data-hour="${h}"><b>${h}h</b><small>saída ${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}</small></button>`;
  }).join('');
  const r = periodTotals(7);
  el.innerHTML = `
    <div class="hello">${greet}, ${esc(DB.user.name.split(' ')[0])}</div>
    <div class="card"><h2>Bater entrada</h2>
      <p class="mut" style="margin:0 0 14px;font-size:14px">Hoje, <b style="color:var(--txt)">${cap(F_LONG.format(new Date(now())))}</b>. Escolha o seu horário de início.</p>
      <div class="grid2">${presets}</div></div>
    ${r.shifts ? `<div class="card"><h2>Últimos 7 dias</h2><div class="trio"><div><b>${r.deliveries}</b><span>entregas</span></div><div><b>${brl(r.sales)}</b><span>vendido</span></div><div><b>${num1(r.perHour)}</b><span>por hora</span></div></div></div>`
      : `<div class="card"><h2>Comece por aqui</h2><p class="mut" style="font-size:14px;margin:0">Bata a entrada, registre cada entrega com a foto da comanda e acompanhe o seu total de entregas e de vendas no Painel.</p></div>`}`;
}

// aviso (uma vez por turno) quando surge algo que pede ação
function notifyNew(s, alerts) {
  for (const a of alerts) {
    const key = `${s.id}:${a.id}`;
    if (UI.seen.has(key)) continue;
    UI.seen.add(key);
    toast(a.message, 4500);
  }
}

actions['start-shift'] = (btn) => attempt(btn, async () => {
  const hour = Number(btn.dataset.hour);
  try { startShift(hour); }
  catch (e) {
    if (e.code !== 'OUTSIDE_SHIFT_WINDOW') throw e;
    const ok = await confirmSheet({ title: 'Fora do horário do turno', text: `${e.message} Quer registrar a entrada agora mesmo assim?`, ok: 'Registrar entrada' });
    if (!ok) return;
    startShift(hour, { anyway: true });
  }
  toast(`Entrada batida às ${fmtTime(now())}`);
  render();
});
actions['break-start'] = (btn) => attempt(btn, async () => { startBreak(); render(); });
actions['break-end'] = (btn) => attempt(btn, async () => { endBreak(); render(); });
actions['end-shift'] = async () => {
  const v = currentView();
  if (!v.shift) return render();
  const ok = await confirmSheet({ title: 'Bater saída agora?', danger: true, ok: 'Fechar turno', text: `${v.deliveries.length} entregas · ${num1(v.pace.perHour)} por hora.` });
  if (!ok) return;
  try {
    const s = endShift();
    render();
    shiftSummarySheet(s);
  } catch (e) { toast(e.message, 3600); render(); }
};
/** Resumo ao fechar o turno: o total de entregas e quanto foi vendido. */
function shiftSummarySheet(s) {
  const sm = summarize(s, now()), dl = liveDeliveries(s), n = dl.length;
  const sales = dl.reduce((a, d) => a + (d.v || 0), 0), nv = dl.filter((d) => d.v != null).length;
  const ph = perHour(n, sm.net), goal = userGoal(), base = baseline(s.id, now());
  sheet(`<h3>Turno encerrado</h3><p class="mut" style="margin:0 0 12px;font-size:13px">${ymdToDm(s.date)} · ${fmtTime(s.start)} às ${fmtTime(s.end)}</p>
    <div class="bi-kpis" style="margin-bottom:12px">
      <div class="kpi-card"><span>Entregas</span><b>${n}</b><small>${n >= goal ? `meta de ${goal} batida` : `meta ${goal}: faltaram ${goal - n}`}</small></div>
      <div class="kpi-card strong"><span>Vendido</span><b>${brl(sales)}</b><small>${nv ? `ticket médio ${brl(Math.round(sales / nv))}` : 'nenhum valor informado'}</small></div>
      <div class="kpi-card"><span>Entregas por hora</span><b>${num1(ph)}</b><small>${base.avgPerHour7d ? `média 7 dias: ${num1(base.avgPerHour7d)}` : `${dur(sm.net)} líquidas`}</small></div>
      <div class="kpi-card"><span>Vendido por hora</span><b>${sm.net >= CFG.minRateSec ? brl(Math.round(sales / (sm.net / 3600))) : '—'}</b><small>${dur(sm.net)} líquidas</small></div></div>
    ${n - nv ? `<p class="mut" style="font-size:13px;margin:0 0 8px">${n - nv} entrega(s) sem valor. Toque nelas no histórico para informar.</p>` : ''}
    <button class="btn gold" id="sumSend" style="margin-top:14px">Enviar fechamento ao gerente</button>
    <div class="grid2" style="margin-top:8px"><button class="btn" id="sumClose">Fechar</button><button class="btn" id="sumPanel">Ver painel</button></div>`);
  $('sumSend').onclick = () => busy($('sumSend'), sendToManager);
  $('sumClose').onclick = closeSheet;
  $('sumPanel').onclick = () => { closeSheet(); UI.tab = 'rel'; BI.period = 'hoje'; render(); window.scrollTo(0, 0); };
}
actions['edit-delivery'] =(el) => { const f = findDelivery(el.dataset.id); if (f) deliverySheet({ edit: f.d }); };
actions.manual = () => deliverySheet({ title: 'Registrar sem foto' });
actions.photo = () => $('file').click();
