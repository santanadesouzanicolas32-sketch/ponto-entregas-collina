/* Interface do entregador: estrutura, abas e relógio. */
/* ============================================================
   Interface: telas, folhas, leitura da comanda por foto, ajustes e boot.
   ============================================================ */
const UI = { tab: 'turno', hmode: 'ent', f: { q: '', block: '', from: '', to: '' }, seen: new Set(), histPage: 1 };
const ICONS = {
  turno: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  rel: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  hist: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
};
const TABS = [['turno', 'Turno'], ['rel', 'Painel'], ['hist', 'Histórico']];

/* ---------------- navegação ---------------- */
function buildNav() {
  $('nav').innerHTML = `<div class="brand"><img class="logo" data-logo alt="" width="38" height="38"><div><b>Emporio Collina</b><small>Ponto de entregas</small></div></div>`
    + TABS.map(([k, label]) => `<button data-act="goto" data-tab="${k}" data-name="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg><span>${label}</span></button>`).join('');
  document.querySelectorAll('img[data-logo]').forEach((i) => { i.src = LOGO; });
}
/** Marca discreta ao lado da data: os registros estão chegando ao gerente? */
function syncMark() {
  if (!syncConfig() || SYNC.off) return '';
  const s = SYNC.state;
  return s.busy ? ' · enviando…' : s.err ? ' · ⚠ sem envio' : s.at ? ' · ✓ enviado' : '';
}
actions.goto = (el) => { UI.tab = el.dataset.tab; render(); window.scrollTo(0, 0); };

function render({ quiet = false } = {}) {
  document.querySelectorAll('#nav button').forEach((b) => {
    const on = b.dataset.tab === UI.tab;
    b.classList.toggle('on', on);
    if (on) $('pageTitle').textContent = b.dataset.name;
  });
  $('topDate').textContent = F_SHORT.format(new Date(now())).replace(/\./g, '') + syncMark();
  $('userBtn').textContent = (DB.user?.name || '?')[0].toUpperCase();
  $('storageWarn').classList.toggle('hide', storageOk);
  const view = $('view');
  const open = currentOpen();
  const sm = open ? summarize(open, now()) : null;
  $('dock').classList.toggle('hide', !(UI.tab === 'turno' && open && sm.status === 'open'));
  try {
    if (UI.tab === 'turno') renderTurno(view);
    else if (UI.tab === 'rel') renderPainel(view);
    else renderHist(view);
  } catch (e) { console.error(e); view.innerHTML = `<div class="errbox">Não foi possível exibir esta tela. <button class="btn sm" data-act="reload">Recarregar</button></div>`; }
}
actions.reload = () => location.reload();
