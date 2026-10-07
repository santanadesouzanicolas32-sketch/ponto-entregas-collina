/* Interface do entregador: boas-vindas e ciclo de vida. */
/* ---------------- boas-vindas ---------------- */
$('suform').addEventListener('submit', (e) => {
  e.preventDefault();
  const rider = riderById($('suname').value), goal = Number($('sugoal').value);
  if (!rider) return ($('suerr').textContent = 'Escolha o seu nome na lista.');
  if (!Number.isInteger(goal) || goal < 1 || goal > 1000) return ($('suerr').textContent = 'A meta precisa ser um número de 1 a 1000.');
  DB.user = { name: rider.nome, id: rider.id, goal };
  save(); enterApp();
});
function showOnly(id) { for (const x of ['setup', 'app']) $(x).classList.toggle('hide', x !== id); }
function enterApp() { showOnly('app'); buildNav(); render(); }

/* ---------------- ciclo de vida ---------------- */
function startTimers() {
  setInterval(() => { if (!document.hidden && DB.user && !sheetOpen() && UI.tab === 'turno') render({ quiet: true }); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && DB.user && !sheetOpen()) render({ quiet: true }); });
  window.addEventListener('storage', (e) => { if (e.key === KEY) { load(); if (DB.user) render({ quiet: true }); } });   // outra aba mexeu nos dados
  const off = () => $('offline').classList.toggle('hide', navigator.onLine);
  addEventListener('online', off); addEventListener('offline', off); off();
}

/** Aplicativo do entregador: se abriu pelo link do gerente, guarda a conexão e limpa o endereço. */
function adoptSyncHash() {
  const c = parseSyncHash();
  if (!c) return false;
  setSyncConfig(c);
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
  return true;
}

function boot() {
  document.querySelectorAll('img[data-logo]').forEach((i) => { i.src = LOGO; });
  $('ico').href = LOGO; $('ico2').href = LOGO;
  $('suname').innerHTML = riderOptions('');
  load();
  startTimers();
  const linked = adoptSyncHash();                           // abriu pelo link do gerente
  SYNC.listeners.push(() => { if (DB.user && !sheetOpen()) $('topDate').textContent = F_SHORT.format(new Date(now())).replace(/\./g, '') + syncMark(); });
  addEventListener('online', () => syncSoon(1000));
  document.addEventListener('visibilitychange', () => { if (document.hidden) syncPush(); else syncSoon(1500); });
  setInterval(() => { if (!document.hidden && openShift()) syncSoon(500); }, 5 * 60000);    // turno aberto: renova a hora do envio
  if (DB.user) {
    enterApp();
    if (!DB.user.id) askIdentity();
    if (linked) toast('Conectado ao gerente: seus registros vão sozinhos', 5000);
    syncSoon(1500);
  } else showOnly('setup');
  $('boot').classList.add('hide');
}
