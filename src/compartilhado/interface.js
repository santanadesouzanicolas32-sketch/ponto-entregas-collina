/* Componentes de interface compartilhados: folhas (modais), avisos, ações por delegação de eventos. */
/* ---------------- folhas, avisos, ações ---------------- */
function sheet(html) {
  $('sheet').innerHTML = html;
  $('scrim').classList.add('on');
  const first = $('sheet').querySelector('[autofocus],input:not([type=hidden]):not([type=checkbox]),select,textarea');
  if (first && matchMedia('(min-width:600px)').matches) first.focus();
}
const closeSheet = () => $('scrim').classList.remove('on');
const sheetOpen = () => $('scrim').classList.contains('on');
let toastTimer;
function toast(msg, ms = 2400) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('act'); t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
function toastAction(msg, label, fn, ms = 8000) {
  const t = $('toast');
  t.innerHTML = `${esc(msg)} <button class="toast-btn" id="toastBtn">${esc(label)}</button>`;
  t.classList.add('on', 'act');
  $('toastBtn').onclick = () => { t.classList.remove('on', 'act'); fn(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on', 'act'), ms);
}
const skeleton =(n = 2) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');
async function busy(btn, fn) {
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  try { return await fn(); } finally { if (btn.isConnected) btn.disabled = false; }
}
function confirmSheet({ title, text = '', ok = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    sheet(`<h3>${esc(title)}</h3><p class="mut" style="font-size:14px">${esc(text)}</p>
      <div class="grid2" style="margin-top:14px"><button class="btn" id="cNo">Cancelar</button><button class="btn ${danger ? 'red' : 'gold'}" id="cYes">${esc(ok)}</button></div>`);
    $('cNo').onclick = () => { closeSheet(); resolve(false); };
    $('cYes').onclick = () => { closeSheet(); resolve(true); };
  });
}
const actions = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
$('scrim').addEventListener('click', (e) => { if (e.target.id === 'scrim') closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
function attempt(btn, fn) {
  return busy(btn, async () => { try { await fn(); } catch (e) { if (e instanceof AppErr) toast(e.message, 3600); else { console.error(e); toast('Algo deu errado. Tente de novo.', 3600); } } });
}


function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
