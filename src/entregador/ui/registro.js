/* Interface do entregador: registro de entrega (inclusive esquecida). */
/* ---------------- registro de entrega ---------------- */
const centsToInput = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
/** "HH:MM" -> instante mais recente com essa hora que já passou (hoje ou, se passar da meia-noite, ontem). */
function timeToMs(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const t = now(), h = +m[1], mi = +m[2];
  let ms = localToMs(ymdOf(t), h, mi);
  if (ms > t + 60000) ms = localToMs(addDays(ymdOf(t), -1), h, mi);
  return Math.min(ms, t);
}
function deliverySheet({ title, block = null, apt = '', at = null, source = 'manual', review = false, note = '', edit = null, value = null, lateAt = null }) {
  const requestId = uid();                     // repetir o toque com o mesmo id não duplica
  let chosen = edit ? edit.block : block;
  const canLate = !edit && !at && source === 'manual';
  sheet(`<h3>${esc(edit ? 'Corrigir entrega' : title)}</h3>
    ${canLate ? `<div class="chips" id="whenSeg" style="margin-bottom:6px"><button type="button" class="chip ${lateAt ? '' : 'on'}" data-w="now">Agora</button><button type="button" class="chip ${lateAt ? 'on' : ''}" data-w="late">Esqueci de registrar</button></div>
    <div id="whenBox" class="${lateAt ? '' : 'hide'}"><label for="atTime">Horário em que entregou</label>
    <input id="atTime" type="time" value="${lateAt ? esc(fmtTime(lateAt)) : ''}">
    <p class="mut lockp" style="margin:6px 0 0">Entra na ordem do horário e fica marcada como “lançada depois”. Depois de salvar, o horário não muda.</p></div>` : ''}
    ${note ? `<div class="ocr-note ${note.startsWith('!') ? 'warn' : ''}">${esc(note.replace(/^!/, ''))}</div>` : ''}
    <label>Bloco</label>
    <div class="chips" id="chips">${CFG.blocks.map((b) => `<button type="button" class="chip ${chosen === b ? 'on' : ''}" data-b="${b}">${b}</button>`).join('')}</div>
    <label for="apt">Apartamento <span class="mut">(241 = 24º andar, final 1 · SS12 = subsolo)</span></label>
    <input id="apt" inputmode="text" autocapitalize="characters" autocomplete="off" maxlength="8" value="${esc(edit ? edit.apt : apt)}">
    <label for="val">Valor da comanda (R$) <span class="mut">opcional</span></label>
    <input id="val" inputmode="decimal" autocomplete="off" maxlength="12" placeholder="0,00" value="${esc(centsToInput(edit ? edit.v : value))}">
    ${edit ? `<p class="mut lockp">Horário registrado: <b class="gold">${fmtTime(edit.t)}</b>. Não pode ser alterado.</p>` : at ? `<p class="mut lockp">Horário da foto: <b class="gold">${fmtTime(at)}</b></p>` : ''}
    <p id="dErr" class="lerr" role="alert" style="text-align:left;margin:10px 0 0"></p>
    <div class="${edit ? 'grid2' : ''}" style="margin-top:12px">${edit ? '<button class="btn red" id="dDel" type="button">Excluir</button>' : ''}<button class="btn gold" id="dOk" type="button">${edit ? 'Salvar' : 'Registrar'}</button></div>`);
  const err = (m) => { $('dErr').textContent = m || ''; };
  $('chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    chosen = c.dataset.b;
    document.querySelectorAll('#chips .chip').forEach((x) => x.classList.toggle('on', x === c));
    $('apt').focus();
  });
  let when = lateAt ? 'late' : 'now';
  if (canLate) {
    $('whenSeg').addEventListener('click', (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      when = c.dataset.w;
      document.querySelectorAll('#whenSeg .chip').forEach((x) => x.classList.toggle('on', x === c));
      $('whenBox').classList.toggle('hide', when !== 'late');
      if (when === 'late') $('atTime').focus();
    });
  }
  if (!edit && !apt && !lateAt) setTimeout(() => $('apt').focus(), 60);
  $('apt').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('dOk').click(); });
  $('dOk').onclick = () => busy($('dOk'), async () => {
    err('');
    const apartment = $('apt').value.trim();
    if (!chosen || !apartment) return err('Escolha o bloco e informe o apartamento.');
    let cents = null;
    try { cents = parseMoney($('val').value); } catch (e) { return err(e.message); }
    try {
      if (edit) { updateDelivery(edit.id, chosen, apartment, cents); toast('Entrega atualizada'); }
      else {
        // "para conferir" só se o funcionário aceitou a leitura automática sem alterar
        const accepted = source === 'photo' && review && chosen === block && normalizeApt(apartment).apt === apt;
        const o = { at, source, review: accepted, requestId, value: cents };
        if (canLate && when === 'late') {
          const lt = timeToMs($('atTime').value);
          if (lt == null) return err('Informe o horário em que a entrega foi feita.');
          o.at = lt; o.late = true;
        }
        try { addDelivery(chosen, apartment, o); }
        catch (e) {
          if (e.code !== 'DUPLICATE_RECENT') throw e;
          const again = await confirmSheet({ title: o.late ? 'Já existe uma entrega igual nesse horário' : 'Mesma entrega há instantes', text: e.message, ok: 'Registrar de novo' });
          if (!again) return deliverySheet({ title, block: chosen, apt: apartment, at, source, review, note, value: cents, lateAt: o.late ? o.at : null });
          addDelivery(chosen, apartment, { ...o, force: true, requestId: uid() });
        }
        toast(o.late ? `✓ ${chosen} ${normalizeApt(apartment).apt} às ${fmtTime(o.at)} (lançada depois)` : `✓ ${chosen} ${normalizeApt(apartment).apt}`);
        try { navigator.vibrate?.(40); } catch { /* ignore */ }
      }
      closeSheet(); render();
    } catch (e) {
      if (e instanceof AppErr) err(e.message); else { console.error(e); err('Não foi possível registrar. Tente de novo.'); }
    }
  });
  if (edit) {
    $('dDel').onclick = () => busy($('dDel'), async () => {
      if (!$('dDel').dataset.sure) { $('dDel').dataset.sure = '1'; $('dDel').textContent = 'Toque de novo para excluir'; return; }
      try { deleteDelivery(edit.id); toast('Entrega excluída'); closeSheet(); render(); } catch (e) { err(e.message); }
    });
  }
}
