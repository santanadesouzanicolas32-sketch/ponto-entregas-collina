/* Interface do gerente: estrutura, abas e filtros. */
/* ============================================================
   Sistema do gerente - telas: visão geral, entregadores (individual), consultas e dados.
   ============================================================ */
const MG = {
  tab: 'geral', period: '30', preset: 0, sel: new Set(), rider: 'nicolas', day: null,
  q: { riders: new Set(), from: '', to: '', tFrom: '', tTo: '', block: '', apt: '', vMin: '', vMax: '', source: '', status: '' }, qpage: 1, qsort: { k: 't', dir: -1 },
};
const MPERIODS = [['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['mes', 'Este mês'], ['90', '90 dias'], ['tudo', 'Tudo']];
const MTABS = [['geral', 'Visão geral'], ['ind', 'Entregadores'], ['cons', 'Consultas'], ['dados', 'Dados']];
SAVE_ERROR_HOOKS.push((m) => toast(m, 4000));
const MICONS = {
  geral: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  ind: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6"/>',
  cons: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  dados: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
};
const rname = (id) => (id === 'equipe' ? 'Demais' : riderById(id)?.nome || id);
const rdot = (id) => `<i class="dot" style="background:${RCOLORS[id] || '#999'}"></i>`;
const rlabel = (id) => `<span class="rchip">${rdot(id)}${esc(rname(id))}</span>`;
const pc = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const hasData = () => compute().shifts.length > 0;

/* ---------------- navegação e estrutura ---------------- */
function buildMNav() {
  $('nav').innerHTML = `<div class="brand"><img class="logo" data-logo alt="" width="38" height="38"><div><b>Emporio Collina</b><small>Gerência</small></div></div>`
    + MTABS.map(([k, l]) => `<button data-act="m-goto" data-tab="${k}" data-name="${l}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MICONS[k]}</svg><span>${l}</span></button>`).join('');
  document.querySelectorAll('img[data-logo]').forEach((i) => { i.src = LOGO; });
}
actions['m-goto'] = (el) => { MG.tab = el.dataset.tab; mRender(); window.scrollTo(0, 0); };
actions['m-import'] = () => $('mfile').click();

function mRender() {
  document.querySelectorAll('#nav button').forEach((b) => { const on = b.dataset.tab === MG.tab; b.classList.toggle('on', on); if (on) $('pageTitle').textContent = b.dataset.name; });
  const lastUp = Math.max(0, ...Object.values(ST.riders).map((r) => r.exportadoEm || 0));
  const linked = !!syncConfig();
  $('topSub').textContent = (lastUp ? `Dados até ${fmtDateTime(lastUp)}` : 'Sem dados importados') + (linked && PULL.at ? ` · ✓ ${fmtTime(PULL.at)}` : '');
  $('mPull').classList.toggle('hide', !linked); $('mImp').classList.toggle('hide', linked);
  const view = $('view');
  try {
    if (MG.tab === 'geral') renderGeral(view); else if (MG.tab === 'ind') renderInd(view); else if (MG.tab === 'cons') renderCons(view); else renderDados(view);
  } catch (e) { console.error(e); view.innerHTML = '<div class="errbox">Não foi possível exibir esta tela. <button class="btn sm" data-act="reload">Recarregar</button></div>'; }
}
actions.reload = () => location.reload();
const mRefresh = () => mRender();

const emptyState = () => `<div class="card empty" style="padding:34px 16px">Nenhum dado importado ainda.<br>Peça o fechamento de cada entregador (<b>Ajustes → Enviar fechamento ao gerente</b>) e importe os arquivos.<br><button class="btn gold" data-act="m-import" style="margin-top:16px;max-width:320px">Importar arquivos</button></div>`;

/** Barra de filtros fixa: período, turno e (conforme a tela) entregadores. */
function slicers(mode) {
  const ids = ROSTER.map((r) => r.id);
  const riders = mode === 'multi'
    ? `<div class="bi-row" role="group" aria-label="Entregadores">${ids.map((id) => `<button class="chip2${MG.sel.has(id) ? ' on' : ''}" data-act="m-rsel" data-id="${id}">${rdot(id)}${esc(rname(id))}</button>`).join('')}${MG.sel.size ? '<button class="linkbtn" data-act="m-rclear">Todos</button>' : ''}</div>`
    : mode === 'single'
      ? `<div class="bi-row" role="group" aria-label="Entregador">${ids.map((id) => `<button class="chip2${MG.rider === id ? ' on' : ''}" data-act="m-rone" data-id="${id}">${rdot(id)}${esc(rname(id))}</button>`).join('')}</div>` : '';
  return `<div class="bi-filters">
    <div class="bi-row" role="group" aria-label="Período">${MPERIODS.map(([k, l]) => `<button class="chip2${MG.period === k ? ' on' : ''}" data-act="m-period" data-p="${k}">${l}</button>`).join('')}
      <span style="width:8px;flex:none"></span>${[[0, 'Todos os turnos'], [15, 'Turno 15h'], [16, 'Turno 16h']].map(([k, l]) => `<button class="chip2 alt${MG.preset === k ? ' on' : ''}" data-act="m-preset" data-k="${k}">${l}</button>`).join('')}</div>
    ${riders}</div>`;
}
actions['m-period'] = (el) => { MG.period = el.dataset.p; MG.day = null; mRefresh(); };
actions['m-preset'] = (el) => { MG.preset = Number(el.dataset.k); MG.day = null; mRefresh(); };
actions['m-rsel'] = (el) => { const id = el.dataset.id; MG.sel.has(id) ? MG.sel.delete(id) : MG.sel.add(id); MG.day = null; mRefresh(); };
actions['m-rclear'] = () => { MG.sel.clear(); mRefresh(); };
actions['m-rone'] = (el) => { MG.rider = el.dataset.id; mRefresh(); };

const delta = (cur, prev) => (prev > 0 && cur != null ? ((cur - prev) / prev) * 100 : null);
const dtag = (d) => (d == null ? '' : `<em class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d))}%</em>`);
const num = (x, d = 1) => (x == null ? '—' : (Math.round(x * 10 ** d) / 10 ** d).toString().replace('.', ','));
