/* ============================================================
   Autotestes embutidos. Abra  index.html?selftest  para rodar no próprio navegador.
   Usam um banco de memória isolado: não tocam nos seus dados reais.
   ============================================================ */
function runSelfTests() {
  const results = [];
  const saved = { DB, persist, fixedNow, clockOffset };
  const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} esperado ${JSON.stringify(b)} obtido ${JSON.stringify(a)}`); };
  const ok = (c, m = 'condição falsa') => { if (!c) throw new Error(m); };
  const throwsCode = (fn, code) => {
    try { fn(); } catch (e) { if (e.code === code) return; throw new Error(`esperava ${code}, obtido ${e.code || e.message}`); }
    throw new Error(`esperava erro ${code}, mas nada foi lançado`);
  };
  const at = (y, m, d, h, mi = 0, s = 0) => localToMs(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, h, mi) + s * 1000;
  const clock = (ms) => { fixedNow = ms; };
  const T = (name, fn) => {
    DB = emptyDb(); DB.user = { name: 'Nicolas', id: 'nicolas', goal: 60 }; persist = false; fixedNow = at(2026, 10, 6, 15, 3);
    try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: String(e && e.message || e) }); }
  };
  const sumOf = (start, end, breaks = [], nowMs = null, sched = at(2026, 10, 6, 15), pe = at(2026, 10, 6, 23, 20)) =>
    summarize({ start, end, sched, plannedEnd: pe, breaks: breaks.map(([s, e]) => ({ s, e })) }, nowMs ?? end ?? start);
  const MIN = 60000;

  try {
    /* ---- apartamento / bloco ---- */
    T('apartamento: formatos válidos', () => {
      eq(normalizeApt('241'), { apt: '241', floor: 24 }); eq(normalizeApt(' 241 '), { apt: '241', floor: 24 });
      eq(normalizeApt('21'), { apt: '21', floor: 2 }); eq(normalizeApt('281'), { apt: '281', floor: 28 });
      eq(normalizeApt('ss12'), { apt: 'SS12', floor: 0 }); eq(normalizeApt('SS 3'), { apt: 'SS3', floor: 0 }); eq(normalizeApt('2 4 1'), { apt: '241', floor: 24 });
    });
    T('apartamento: andares 1 a 28 e SS; o resto é recusado', () => {
      for (const bad of ['0101', '291', '240', '', 'abc', 'SS', 'SS123', '1', '011', '300', '-241', '24.1']) throwsCode(() => normalizeApt(bad), 'INVALID_APARTMENT');
    });
    T('bloco: só A1 B1 C1 A2 B2 C2', () => {
      eq(normalizeBlock(' c1 '), 'C1');
      for (const bad of ['', 'D1', 'A3', 'AA', null, 'a 1']) throwsCode(() => normalizeBlock(bad), 'INVALID_BLOCK');
    });
    T('faixas de andar', () => eq([0, 1, 7, 8, 14, 15, 21, 22, 28, null].map(floorBand), ['SS', '1-7', '1-7', '8-14', '8-14', '15-21', '15-21', '22-28', '22-28', null]));

    /* ---- tempo ---- */
    T('fuso: 15:00 de São Paulo = 18:00 UTC', () => {
      eq(localToMs('2026-10-06', 15), Date.UTC(2026, 9, 6, 18, 0)); eq(ymdOf(Date.UTC(2026, 9, 7, 2, 30)), '2026-10-06'); eq(hourOf(Date.UTC(2026, 9, 7, 2, 30)), 23);
      eq(fmtTime(Date.UTC(2026, 9, 6, 18, 3)), '15:03'); eq(addDays('2026-10-31', 1), '2026-11-01'); eq(addDays('2026-03-01', -1), '2026-02-28');
    });

    /* ---- cálculos de jornada ---- */
    T('jornada normal 8h20 sem pausas', () => {
      const s = sumOf(at(2026, 10, 6, 15), at(2026, 10, 6, 23, 20));
      eq([s.gross, s.net, s.lateS, s.over, s.short, s.status, s.planned], [30000, 30000, 0, 0, 0, 'closed', 30000]);
    });
    T('pausas descontadas; sobrepostas não contam duas vezes; recortadas na jornada', () => {
      const a = sumOf(at(2026, 10, 6, 15), at(2026, 10, 6, 23, 20), [[at(2026, 10, 6, 19), at(2026, 10, 6, 19, 30)], [at(2026, 10, 6, 21), at(2026, 10, 6, 21, 10)]]);
      eq(a.pause, 40 * 60); eq(a.net, a.gross - 40 * 60);
      eq(sumOf(at(2026, 10, 6, 15), at(2026, 10, 6, 23, 20), [[at(2026, 10, 6, 19), at(2026, 10, 6, 19, 30)], [at(2026, 10, 6, 19, 15), at(2026, 10, 6, 19, 45)]]).pause, 45 * 60);
      eq(sumOf(at(2026, 10, 6, 15), at(2026, 10, 6, 16), [[at(2026, 10, 6, 14), at(2026, 10, 6, 15, 10)], [at(2026, 10, 6, 15, 50), at(2026, 10, 6, 17)]]).pause, 20 * 60);
    });
    T('atraso só conta acima de 5 min', () => {
      eq(sumOf(at(2026, 10, 6, 15, 5), null, [], at(2026, 10, 6, 16)).lateS, 0);
      eq(sumOf(at(2026, 10, 6, 15, 6), null, [], at(2026, 10, 6, 16)).lateS, 360);
      eq(sumOf(at(2026, 10, 6, 14, 50), null, [], at(2026, 10, 6, 16)).lateS, 0);
    });
    T('hora extra e jornada incompleta com tolerância de 10 min', () => {
      eq(sumOf(at(2026, 10, 6, 15), at(2026, 10, 6, 23, 30)).over, 0);
      eq(sumOf(at(2026, 10, 6, 15), at(2026, 10, 6, 23, 31)).over, 660);
      eq(sumOf(at(2026, 10, 6, 15), at(2026, 10, 6, 23, 10)).short, 0);
      const s = sumOf(at(2026, 10, 6, 15), at(2026, 10, 6, 22)); eq([s.short, s.over], [4800, 0]);
    });
    T('jornada que atravessa a meia-noite (16h → 00:40)', () => {
      const s = sumOf(at(2026, 10, 6, 16, 2), at(2026, 10, 7, 0, 40), [[at(2026, 10, 6, 23, 50), at(2026, 10, 7, 0, 10)]], null, at(2026, 10, 6, 16), at(2026, 10, 7, 0, 40));
      eq([s.gross, s.pause, s.over, s.short], [(8 * 60 + 38) * 60, 1200, 0, 0]);
    });
    T('pausa aberta conta até agora; status', () => {
      const s = sumOf(at(2026, 10, 6, 15), null, [[at(2026, 10, 6, 18), null]], at(2026, 10, 6, 18, 30));
      eq([s.status, s.pause, s.net], ['on_break', 1800, 3 * 3600]);
      eq(sumOf(at(2026, 10, 6, 15), null, [], at(2026, 10, 6, 16)).status, 'open');
      eq(sumOf(at(2026, 10, 6, 16), null, [], at(2026, 10, 6, 15)).net, 0);
    });
    /* ---- turno: entrada, janela, pausas, saída ---- */
    T('entrada: usa o relógio, calcula previsão e atraso', () => {
      const s = startShift(15);
      eq([s.date, s.start, s.sched, s.plannedEnd], ['2026-10-06', at(2026, 10, 6, 15, 3), at(2026, 10, 6, 15), at(2026, 10, 6, 23, 20)]);
      eq(summarize(s, now()).lateS, 0);
    });
    T('entrada: preset inválido, duplicada e fora da janela', () => {
      throwsCode(() => startShift(3), 'INVALID_PRESET');
      startShift(15); throwsCode(() => startShift(15), 'SHIFT_ALREADY_OPEN');
    });
    T('entrada: até 60 min antes vale; um turno por dia', () => {
      clock(at(2026, 10, 6, 14, 5)); const s = startShift(15); eq(s.date, '2026-10-06');
      clock(at(2026, 10, 6, 15, 30)); endShift(); throwsCode(() => startShift(15), 'SHIFT_ALREADY_TODAY');
    });
    T('entrada depois da meia-noite pertence ao dia anterior (turno das 16h)', () => {
      clock(at(2026, 10, 7, 0, 10)); const s = startShift(16);
      eq(s.date, '2026-10-06'); eq(summarize(s, now()).lateS, 8 * 3600 + 10 * 60);
    });
    T('turno esquecido aberto é fechado no fim previsto', () => {
      const s = startShift(15); addDeliveryAt(s);
      clock(at(2026, 10, 7, 15, 5));
      eq(currentOpen(), null); eq([s.closeReason, s.end], ['auto', at(2026, 10, 6, 23, 20)]);
      startShift(15); ok(openShift(), 'novo dia deve abrir');
    });
    T('pausa: fluxo, duplicada e retomada', () => {
      startShift(15); clock(at(2026, 10, 6, 17, 3));
      eq(summarize(startBreak(), now()).status, 'on_break'); throwsCode(() => startBreak(), 'ALREADY_ON_BREAK');
      clock(at(2026, 10, 6, 17, 33)); const s = endBreak(); eq(summarize(s, now()).pause, 1800);
      throwsCode(() => endBreak(), 'NOT_ON_BREAK');
    });
    T('saída fecha pausa aberta e bloqueia novas ações', () => {
      startShift(15); clock(at(2026, 10, 6, 22)); startBreak(); clock(at(2026, 10, 6, 22, 30));
      const s = endShift(); const sm = summarize(s, now());
      eq([sm.status, sm.pause, sm.short], ['closed', 1800, 3000]);
      throwsCode(() => endShift(), 'NO_OPEN_SHIFT'); throwsCode(() => startBreak(), 'NO_OPEN_SHIFT'); throwsCode(() => addDelivery('A1', '241'), 'NO_OPEN_SHIFT');
    });
    T('hora extra depois do fim previsto', () => {
      startShift(15); clock(at(2026, 10, 6, 23, 50)); eq(summarize(endShift(), now()).over, 1800);
    });
    function addDeliveryAt() { clock(at(2026, 10, 6, 15, 30)); addDelivery('A1', '241'); }

    /* ---- entregas ---- */
    T('entrega: normaliza e usa a hora do registro', () => {
      startShift(15); clock(at(2026, 10, 6, 15, 30));
      const r = addDelivery('c1', ' 241 ');
      eq([r.delivery.block, r.delivery.apt, r.delivery.floor, r.delivery.t, r.created], ['C1', '241', 24, at(2026, 10, 6, 15, 30), true]);
      eq(addDelivery('b2', 'ss12').delivery.floor, 0);
    });
    T('entrega: exige turno aberto e não aceita durante pausa', () => {
      throwsCode(() => addDelivery('A1', '241'), 'NO_OPEN_SHIFT');
      startShift(15); clock(at(2026, 10, 6, 15, 10)); startBreak(); throwsCode(() => addDelivery('A1', '241'), 'SHIFT_ON_BREAK');
    });
    T('entrega: validação de bloco e apartamento', () => {
      startShift(15);
      for (const [b, a] of [['Z9', '241'], ['A1', '999'], ['A1', ''], ['A1', '24x'], ['A1', 'SS999'], ['A1', '240']]) { try { addDelivery(b, a); throw new Error('aceitou ' + b + a); } catch (e) { ok(e instanceof AppErr, 'erro inesperado: ' + e.message); } }
      eq(liveDeliveries(openShift()).length, 0);
    });
    T('duplo clique: mesmo requestId devolve a mesma entrega', () => {
      startShift(15);
      const a = addDelivery('A1', '241', { requestId: 'req-1' }), b = addDelivery('A1', '241', { requestId: 'req-1' });
      eq([a.created, b.created, a.delivery.id === b.delivery.id], [true, false, true]); eq(liveDeliveries(openShift()).length, 1);
    });
    T('mesma entrega em 20 s pede confirmação; depois da janela é permitida', () => {
      startShift(15); clock(at(2026, 10, 6, 15, 4)); addDelivery('A1', '241');
      clock(at(2026, 10, 6, 15, 4, 10)); throwsCode(() => addDelivery('A1', '241'), 'DUPLICATE_RECENT');
      eq(addDelivery('A1', '241', { force: true }).created, true);
      clock(at(2026, 10, 6, 15, 10)); eq(addDelivery('A1', '241').created, true);
    });
    T('entrega por foto usa a hora da foto; não aceita foto anterior ao turno', () => {
      startShift(15); clock(at(2026, 10, 6, 15, 30, 12));
      eq(addDelivery('C1', '241', { at: at(2026, 10, 6, 15, 30), source: 'photo' }).delivery.t, at(2026, 10, 6, 15, 30));
      throwsCode(() => addDelivery('C1', '151', { at: at(2026, 10, 6, 14, 0), source: 'photo' }), 'CAPTURE_BEFORE_SHIFT');
    });
    T('correção muda bloco/apto, nunca o horário; exclusão é lógica', () => {
      startShift(15); clock(at(2026, 10, 6, 15, 30)); const d = addDelivery('A1', '241', { review: true }).delivery;
      clock(at(2026, 10, 6, 16)); const u = updateDelivery(d.id, 'B2', '181');
      eq([u.block, u.apt, u.floor, u.t, u.review], ['B2', '181', 18, at(2026, 10, 6, 15, 30), false]);
      throwsCode(() => updateDelivery(d.id, 'B2', '999'), 'INVALID_APARTMENT');
      deleteDelivery(d.id); eq(liveDeliveries(openShift()).length, 0); eq(openShift().deliveries.length, 1);
      throwsCode(() => deleteDelivery(d.id), 'NOT_FOUND');
    });

    /* ---- projeção e alertas ---- */
    const fill = (first, n, every) => { for (let i = 0; i < n; i++) { clock(first + i * every * MIN); addDelivery('A1', `${(i % 28) + 1}${(i % 4) + 1}`); } };
    const alertIds = () => new Set(currentView().alerts.map((a) => a.id));
    T('projeção: no ritmo / em risco com ritmo necessário', () => {
      startShift(15); fill(at(2026, 10, 6, 15, 10), 28, 4); clock(at(2026, 10, 6, 17, 3));
      let v = currentView(); eq(v.pace.perHour, 14); ok(v.proj.onTrack && v.proj.expected > 60 && v.proj.eta, 'deveria estar no ritmo');
      DB.user.goal = 200; v = currentView();
      ok(v.proj.onTrack === false && v.proj.required > v.pace.perHour, 'em risco: precisa de ritmo maior'); ok(v.proj.expected < 200);
    });
    T('projeção: nada nos primeiros 10 min; meta batida', () => {
      startShift(15); clock(at(2026, 10, 6, 15, 8)); addDelivery('A1', '241'); eq(currentView().proj.expected, null);
      DB.user.goal = 3; fill(at(2026, 10, 6, 15, 10), 3, 5); ok(alertIds().has('goal_reached')); eq(currentView().proj.remaining, 0);
    });
    T('sem turno aberto: nada de alertas', () => eq(currentView().shift, null));

    /* ---- relatórios e planilha ---- */
    T('planilha: neutraliza fórmulas e usa separador ;', () => {
      eq(csvSafe('=HYPERLINK(x)'), "'=HYPERLINK(x)"); eq(csvSafe('+1'), "'+1"); eq(csvSafe('@a'), "'@a"); eq(csvSafe('ok'), 'ok'); eq(csvCell('a;b'), '"a;b"');
      startShift(15); fill(at(2026, 10, 6, 15, 10), 3, 5); clock(at(2026, 10, 6, 23, 20)); endShift();
      const lines = buildCsv(7).replace('﻿', '').split('\r\n'); eq(lines.length, 2); eq(lines[1].split(';')[5], '3'); ok(lines[0].startsWith('Dia;Entrada'));
    });

    /* ---- dados: validação de backup ---- */
    T('backup: recusa lixo e limpa dados inválidos', () => {
      for (const bad of [null, 5, 'x', {}, { shifts: 'a' }]) { try { sanitizeDb(bad); throw new Error('aceitou lixo'); } catch (e) { ok(/inválido/.test(e.message), 'mensagem: ' + e.message); } }
      const good = { shifts: [{ id: 'a', date: '2026-10-06', preset: 15, sched: 1, plannedEnd: 5, start: 2, end: 4, breaks: [{ s: 2, e: 1 }, { s: 2, e: 3 }], deliveries: [{ t: 3, block: 'A1', apt: '241' }, { t: 3, block: 'Z9', apt: '241' }, { t: 3, block: 'A1', apt: '999' }, { t: 'x', block: 'A1', apt: '241' }] }, { date: 'lixo' }], user: { name: '<img src=x onerror=1>', goal: -5 } };
      const c = sanitizeDb(good); eq([c.shifts.length, c.shifts[0].breaks.length, c.shifts[0].deliveries.length, c.user.goal], [1, 1, 1, 60]);
    });
    T('backup: só um turno aberto', () => {
      const mk = (id, st) => ({ id, date: '2026-10-06', preset: 15, sched: st, plannedEnd: st + 1e7, start: st, end: null, breaks: [], deliveries: [] });
      eq(sanitizeDb({ shifts: [mk('a', 1000), mk('b', 2000)] }).shifts.filter((s) => s.end == null).length, 1);
    });
    /* ---- valor das entregas ---- */
    T('valor: leitura de dinheiro em vários formatos', () => {
      eq(['52', '52,5', '52,50', 'R$ 1.234,56', '1234.56', '1.234', 'R$52,00', '0'].map(parseMoney), [5200, 5250, 5250, 123456, 123456, 123400, 5200, 0]);
      eq([parseMoney(''), parseMoney(null), parseMoney('   ')], [null, null, null]);
      for (const bad of ['abc', '-5', '10.000.000', '12,345', '100000,00', '5,5,5', '1,2,3']) throwsCode(() => parseMoney(bad), 'INVALID_VALUE');
      ok(brl(5290).includes('52,90') && brl(5290).includes('R$'), 'formato brl'); eq(brl(null), '—');
    });
    T('valor: entrega guarda, corrige, limpa e valida', () => {
      startShift(15); clock(at(2026, 10, 6, 15, 30));
      const d = addDelivery('A1', '241', { value: 5290 }).delivery; eq(d.v, 5290);
      eq(updateDelivery(d.id, 'A1', '241').v, 5290, 'sem value mantém');
      eq(updateDelivery(d.id, 'A1', '241', 6000).v, 6000); eq(updateDelivery(d.id, 'A1', '241', null).v, null);
      throwsCode(() => updateDelivery(d.id, 'A1', '241', -1), 'INVALID_VALUE'); throwsCode(() => addDelivery('B1', '181', { value: 1.5 }), 'INVALID_VALUE');
      eq(addDelivery('B1', '181').delivery.v, null);
    });
    T('valor: desfazer registro automático (some de verdade, só nos 2 primeiros minutos)', () => {
      startShift(15); clock(at(2026, 10, 6, 15, 30)); const d = addDelivery('A1', '241', { value: 100 }).delivery;
      undoDelivery(d.id); eq(openShift().deliveries.length, 0); throwsCode(() => undoDelivery(d.id), 'NOT_FOUND');
      const e = addDelivery('A1', '241').delivery; clock(at(2026, 10, 6, 15, 40)); throwsCode(() => undoDelivery(e.id), 'TOO_LATE');
    });
    T('valor: backup descarta valor inválido', () => {
      const s = { id: 'a', date: '2026-10-06', preset: 15, sched: 1, plannedEnd: 5, start: 2, end: 4, breaks: [], deliveries: [{ t: 3, block: 'A1', apt: '241', v: 5290 }, { t: 3, block: 'A1', apt: '241', v: -5 }, { t: 3, block: 'A1', apt: '241', v: 'x' }, { t: 3, block: 'A1', apt: '241', v: 99999999 }] };
      eq(sanitizeDb({ shifts: [s] }).shifts[0].deliveries.map((d) => d.v), [5290, null, null, null]);
    });
    T('comanda: valor pelo rótulo TOTAL / VALOR / A PAGAR', () => {
      const a = parseComanda('BLOCO C1 APTO 241 TOTAL R$ 52,00'); eq([a.value, a.valueSure, a.confidence], [5200, true, 'alta']);
      eq(parseComanda('VALOR TOTAL: 1.234,56').value, 123456); eq(parseComanda('A PAGAR R$ 8,90').value, 890);
      eq(parseComanda('SUBTOTAL 40,00 TAXA 5,00 TOTAL 45,00').value, 4500, 'SUBTOTAL não pode ser confundido com TOTAL');
    });
    T('comanda: valor com erro típico do OCR e sem rótulo', () => {
      eq(parseComanda('TOTAL R$ 5O,OO').value, 5000); eq(parseComanda('TOTAL 1O5,9O').value, 10590);
      const n = parseComanda('ITEM R$ 12,00 ITEM R$ 52,00'); eq([n.value, n.valueSure], [5200, false]);
      eq(parseComanda('obrigado volte sempre').value, null); eq(parseComanda('TEL 99999-1234').value, null); eq(parseComanda('TOTAL 0,50').value, null);
    });

    /* ---- painel (BI) ---- */
    const biReset = (period = '7') => Object.assign(BI, { period, blocks: new Set(), band: null, day: null, hour: null, dow: null, noValue: false, metric: 'n', sort: { k: 't', dir: -1 }, page: 1 });
    const mkShift = (date, dels) => {
      const sched = localToMs(date, 15);
      const s = { id: uid(), date, preset: 15, sched, plannedEnd: sched + 500 * MIN, start: sched, end: sched + 500 * MIN, closeReason: null, test: false, demo: false, breaks: [], deliveries: [] };
      for (const [h, mi, b, a, v] of dels) { const n = normalizeApt(a); s.deliveries.push({ id: uid(), t: localToMs(date, h, mi), block: b, apt: n.apt, floor: n.floor, review: false, source: 'manual', del: false, v }); }
      DB.shifts.push(s); return s;
    };
    const biFixture = () => {
      mkShift('2026-10-06', [[16, 5, 'A1', '241', 5000], [17, 0, 'A1', '241', 3000], [20, 10, 'C2', '152', null]]);
      mkShift('2026-10-05', [[19, 0, 'B1', 'SS12', 4000], [19, 30, 'B1', '181', 6000]]);
      mkShift('2026-10-04', [[20, 0, 'A1', '241', null]]);
      mkShift('2026-09-28', [[18, 0, 'A1', '241', 2000]]);                  // período anterior
    };
    T('ritmo: mínimo de 3 min líquidos para calcular por hora; pausas descontadas', () => {
      eq([perHour(5, 120), perHour(30, 3600), perHour(7, 7200)], [0, 30, 3.5]);
      const s = { start: at(2026, 10, 6, 15), end: null, breaks: [{ s: at(2026, 10, 6, 15, 30), e: at(2026, 10, 6, 15, 50) }] };
      const p = paceOf([at(2026, 10, 6, 15, 10), at(2026, 10, 6, 15, 20), at(2026, 10, 6, 16)], s, at(2026, 10, 6, 16, 10));
      eq([p.count, p.net, p.perHour], [3, 50 * 60, 3.6]);
      eq(Object.keys(p).sort(), ['count', 'net', 'perHour'], 'sem tempo entre entregas: só contagem e ritmo');
    });
    T('turno: não expõe tempo entre entregas, só o horário de cada registro', () => {
      startShift(15); fill(at(2026, 10, 6, 15, 10), 3, 7);
      const v = currentView(); eq(v.deliveries.map((d) => fmtTime(d.t)), ['15:24', '15:17', '15:10']);   // mais recente primeiro
      eq(Object.keys(v.pace).sort(), ['count', 'net', 'perHour']);
    });
    T('entrada fora do horário: recusa; com confirmação vale como turno normal de hoje', () => {
      clock(at(2026, 10, 6, 10)); throwsCode(() => startShift(15), 'OUTSIDE_SHIFT_WINDOW');
      const s = startShift(15, { anyway: true });
      eq([s.date, s.sched, s.plannedEnd], ['2026-10-06', at(2026, 10, 6, 15), at(2026, 10, 6, 23, 20)]); ok(!('test' in s) && !('demo' in s), 'sem turno de teste');
      eq(DB.shifts.length, 1); eq(periodTotals(7).shifts, 1, 'conta nos totais');
    });
    T('avisos: só os que pedem ação (meta, saída esquecida, conferir)', () => {
      DB.user.goal = 3; startShift(15); clock(at(2026, 10, 6, 15, 40));
      eq(currentView().alerts, [], 'nada de aviso de ociosidade/pausa/ritmo');
      fill(at(2026, 10, 6, 15, 45), 3, 5); ok(alertIds().has('goal_reached'));
      addDelivery('B1', '181', { review: true, source: 'photo', force: true }); ok(alertIds().has('needs_review'));
      clock(at(2026, 10, 6, 23, 25)); ok(!alertIds().has('past_end')); clock(at(2026, 10, 6, 23, 45)); ok(alertIds().has('past_end'));
      eq([...alertIds()].sort(), ['goal_reached', 'needs_review', 'past_end']);
    });
    T('comparação: média por hora dos últimos 7 dias e variação de hoje', () => {
      for (const day of [3, 4, 5]) { clock(at(2026, 10, day, 15, 2)); startShift(15); fill(at(2026, 10, day, 15, 10), 30, 5); clock(at(2026, 10, day, 17, 15)); endShift(); }
      clock(at(2026, 10, 6, 15, 2)); startShift(15); fill(at(2026, 10, 6, 15, 10), 4, 20); clock(at(2026, 10, 6, 16, 20));
      const v = currentView(); ok(v.base.avgPerHour7d > 10 && v.base.delta < -50, 'média e variação'); eq(Object.keys(v.base).sort(), ['avgPerHour7d', 'delta']);
    });
    T('totais do período (tela inicial)', () => {
      startShift(15); fill(at(2026, 10, 6, 15, 10), 3, 5); addDelivery('B2', '182', { value: 5000, force: true }); clock(at(2026, 10, 6, 23, 20)); endShift();
      const t = periodTotals(7); eq([t.shifts, t.deliveries, t.sales], [1, 4, 5000]);
    });
    T('dados antigos de teste/exemplo são descartados ao carregar', () => {
      const mk = (id, extra) => ({ id, date: '2026-10-0' + id, preset: 15, sched: 1, plannedEnd: 5, start: 2, end: 4, breaks: [], deliveries: [{ t: 3, block: 'A1', apt: '241' }], ...extra });
      const c = sanitizeDb({ shifts: [mk('1', {}), mk('2', { test: true }), mk('3', { demo: true })] }); eq(c.shifts.map((s) => s.id), ['1']);
      eq(Object.keys(c).sort(), ['imported', 'prefs', 'shifts', 'user', 'v'], 'sem registro de alterações');
    });
    const LOTE = [['15:22', 'C2', '273', 1908], ['15:39', 'C1', '12', 1166], ['16:40', 'A1', '82', 1178], ['18:02', 'C2', '71', 957], ['18:19', 'B1', '122', 1190], ['18:44', 'C1', '273', 975], ['18:46', 'C2', '214', 1580]];
    T('lançamento do Nicolas: cria o turno do dia com as 7 entregas, na ordem, com bloco, apartamento, valor e hora certos', () => {
      clock(at(2026, 10, 7, 19, 30)); eq(applyLancamentos(), 7);
      const s = DB.shifts.find((x) => x.date === '2026-10-07'); ok(s, 'turno de 07/10'); eq(s.start, localToMs('2026-10-07', 15, 22));
      eq(s.deliveries.map((d) => [fmtTime(d.t), d.block, d.apt, d.v]), LOTE); eq(s.deliveries.map((d) => d.floor), [27, 1, 8, 7, 12, 27, 21]);
      ok(s.deliveries.every((d) => d.late && d.regAt === at(2026, 10, 7, 19, 30)), 'marcadas como lançadas depois, com a hora do registro');
      eq(DB.imported, ['lanc-2026-10-07-b']); eq(applyLancamentos(), 0, 'não reaplica'); eq(s.deliveries.length, 7);
    });
    T('lançamento do Nicolas: entra no turno aberto sem duplicar o que já foi registrado e não volta depois de excluir', () => {
      clock(at(2026, 10, 7, 15, 3)); startShift(15); clock(at(2026, 10, 7, 15, 40)); addDelivery('C1', '12', { value: 1166 });
      clock(at(2026, 10, 7, 19, 30)); eq(applyLancamentos(), 6, 'a C1 12 já existia'); eq(DB.shifts.length, 1); eq(openShift().deliveries.length, 7);
      deleteDelivery(openShift().deliveries.find((x) => x.apt === '214').id); eq(applyLancamentos(), 0); eq(liveDeliveries(openShift()).length, 6, 'excluída continua excluída');
    });
    T('lançamento do Nicolas: só vale para o Nicolas e o controle de lotes sobrevive ao backup', () => {
      DB.user = { name: 'Pedro', id: 'pedro', goal: 60 }; eq(applyLancamentos(), 0); eq(DB.shifts.length, 0); eq(DB.imported, []);
      DB.user = { name: 'Nicolas', id: 'nicolas', goal: 60 }; applyLancamentos(); const c = sanitizeDb(JSON.parse(JSON.stringify(DB))); eq(c.imported, ['lanc-2026-10-07-b']); eq(sanitizeDb({ shifts: [], imported: [5, 'x'] }).imported, ['x']);
    });
    T('painel do aplicativo: o lançamento do Nicolas conta nos totais', () => {
      clock(at(2026, 10, 7, 19, 30)); applyLancamentos(); biReset('tudo'); const all = biRows(), R = biRange('tudo', all), K = biKpis(biApply(all, R), R); eq([K.n, K.sales], [7, 8954]);
    });
    T('painel: indicadores, comparação e cobertura de valor', () => {
      biFixture(); biReset(); const all = biRows(); eq(all.length, 7);
      const R = biRange('7', all), K = biKpis(biApply(all, R), R);
      eq([R.from, R.to], ['2026-09-30', '2026-10-06']);
      eq([K.n, K.sales, K.nv, K.ticket], [6, 18000, 4, 4500]);
      eq([Math.round(K.dN), Math.round(K.dS)], [500, 800]); eq(Math.round(K.salesHour), 720);
    });
    T('painel: filtros se cruzam (bloco, dia, sem valor, dia da semana + hora, andar)', () => {
      biFixture(); biReset(); const all = biRows(), R = biRange('7', all);
      BI.blocks.add('A1'); let K = biKpis(biApply(all, R), R); eq([K.n, K.sales, K.salesHour], [3, 8000, null]);   // recorte por bloco: sem valor/hora
      BI.blocks.clear(); BI.day = '2026-10-05'; eq(biApply(all, R).length, 2);
      BI.day = null; BI.noValue = true; eq(biApply(all, R).map((r) => r.apt).sort(), ['152', '241']);
      BI.noValue = false; BI.dow = 0; BI.hour = 19; eq(biApply(all, R).length, 2);     // segunda-feira às 19h
      BI.dow = null; BI.hour = null; BI.band = 'SS'; eq(biApply(all, R).map((r) => r.apt), ['SS12']);
      BI.band = null; eq(biApply(all, R, { range: true }).length, 7);
      BI.blocks.add('B1'); eq(biApply(all, R, { block: true }).length, 6, 'o gráfico do próprio bloco ignora o filtro de bloco');
    });
    T('painel: períodos (hoje, mês, tudo) e série diária', () => {
      biFixture(); biReset(); const all = biRows();
      eq(biRange('hoje', all), { from: '2026-10-06', to: '2026-10-06', days: 1 }); eq(biRange('mes', all).from, '2026-10-01');
      const t = biRange('tudo', all); eq([t.from, t.all], ['2026-09-28', true]); eq(biApply(all, t).length, 7);
      const d = biDaily(all, biRange('7', all)); eq(d.length, 7); eq(d.map((x) => x.n), [0, 0, 0, 0, 1, 2, 3]);
    });
    T('painel: planilha das entregas com valor e andar', () => {
      biFixture(); biReset(); const all = biRows(), rows = biApply(all, biRange('7', all)).sort((a, b) => a.t - b.t);
      const lines = buildDeliveriesCsv(rows).replace('﻿', '').split('\r\n');
      eq(lines.length, 7); ok(lines[0].startsWith('Data;Hora;Bloco;Apartamento;Andar;Valor (R$)'));
      ok(lines.some((l) => l.includes('B1;SS12;SS;40,00')), 'subsolo com valor'); ok(lines.some((l) => l.includes('C2;152;15;;')), 'entrega sem valor fica vazia');
    });
    T('espelho (planilha de turnos) inclui o vendido', () => {
      biFixture(); const lines = buildCsv(30).replace('﻿', '').split('\r\n'); ok(lines[0].includes('Vendido (R$)')); ok(lines.some((l) => l.startsWith('2026-10-06') && l.includes(';80,00;')), 'vendido do dia 06/10 = 80,00');
    });
    T('XSS: texto do usuário é escapado', () => eq(esc('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;'));

    /* ---- leitura da comanda (interpretação do texto) ---- */
    T('comanda: bloco e apto explícitos = confiança alta, ignora telefone', () => {
      const r = parseComanda('COMANDA 4521\nCliente: Joao da Silva\nTel (65) 99999-1234\nBLOCO C1 APTO 241\nRua X 1500'); eq([r.block, r.apt, r.floor, r.confidence, r.needsReview], ['C1', '241', 24, 'alta', false]);
    });
    T('comanda: variações de escrita', () => {
      eq(parseComanda('Bl. B2  Ap: 1507'.replace('1507', '151')).apt, '151');
      eq(parseComanda('torre a1 apartamento 71').block, 'A1');
      const ss = parseComanda('Bloco C2 SS12'); eq([ss.block, ss.apt, ss.floor], ['C2', 'SS12', 0]);
    });
    T('comanda: formato combinado "C1 241" = confiança média, vai para conferir', () => {
      const r = parseComanda('PEDIDO 88 C1-241 TOTAL 45,90'); eq([r.block, r.apt, r.confidence, r.needsReview], ['C1', '241', 'media', true]);
    });
    T('comanda: apto inválido, só bloco, texto sem nada', () => {
      const a = parseComanda('BLOCO A2 APTO 240'); eq([a.readable, a.block, a.apt, a.confidence], [false, 'A2', null, 'baixa']);
      eq(parseComanda('Obrigado pela preferencia').confidence, 'nenhuma'); eq(parseComanda('').readable, false); eq(parseComanda(null).readable, false);
    });
    T('comanda: corrige confusões típicas do OCR e marca para conferir', () => {
      const c1 = parseComanda('PEDIDO 88 | CLIENTE: PAULO | CC1-241 | TOTAL 45,90'); eq([c1.block, c1.apt, c1.confidence], ['C1', '241', 'media']);
      const c2 = parseComanda('PEDIDO 88 GL-241 TOTAL'); eq([c2.block, c2.apt, c2.needsReview], ['C1', '241', true]);
      const s1 = parseComanda('COMANDA 12 | BLOCO AZ | APTO S812 | RUA A 10'); eq([s1.block, s1.apt, s1.floor, s1.confidence], ['A2', 'SS12', 0, 'media']);
      const s2 = parseComanda('BLOCO A2 APTO 5512'); eq([s2.apt, s2.floor], ['SS12', 0]);
      const d = parseComanda('BLOCO B1 APTO 2O1'); eq([d.block, d.apt], ['B1', '201']);
      eq(parseComanda('BLOCO B1 APTO CASA').apt, null);
      eq(parseComanda('Bl. B2   Ap: 151').confidence, 'alta');
    });
    T('comanda: números longos (telefone, CEP, pedido) não viram apartamento', () => {
      const r = parseComanda('Pedido 123456 CEP 78000-000 Tel 65999991234 BLOCO B1'); eq([r.block, r.apt], ['B1', null]);
    });

    T('esquecida: antes da entrada é aceita; a entrada do turno recua e a original fica guardada', () => {
      clock(at(2026, 10, 6, 19, 19)); startShift(15, { anyway: true }); const s = openShift(); eq(s.start, at(2026, 10, 6, 19, 19));
      addDelivery('A1', '121', { at: at(2026, 10, 6, 17, 30), late: true });
      eq([s.start, s.startOrig], [at(2026, 10, 6, 17, 30), at(2026, 10, 6, 19, 19)]);
      addDelivery('B1', '131', { at: at(2026, 10, 6, 16, 10), late: true }); eq([s.start, s.startOrig], [at(2026, 10, 6, 16, 10), at(2026, 10, 6, 19, 19)], 'recua de novo e mantém a PRIMEIRA entrada batida');
      addDelivery('C1', '141', { at: at(2026, 10, 6, 18, 0), late: true }); eq(s.start, at(2026, 10, 6, 16, 10), 'depois da entrada: não mexe');
      const ex = exportShifts(DB)[0]; eq([ex.entrada, ex.entradaOriginal], [at(2026, 10, 6, 16, 10), at(2026, 10, 6, 19, 19)]);
      const back = sanitizeDb(JSON.parse(JSON.stringify(DB))).shifts[0]; eq([back.start, back.startOrig], [s.start, s.startOrig]);
      eq(summarize(s, now()).gross, 3 * 3600 + 9 * 60, 'as horas contam desde a entrega mais antiga');
    });
    T('esquecida: no máximo 10 por turno (excluídas também contam, para não burlar o limite)', () => {
      startShift(15); clock(at(2026, 10, 6, 20, 0));
      for (let i = 0; i < CFG.maxLate; i++) addDelivery('A1', `${i + 11}1`, { at: at(2026, 10, 6, 16, i), late: true });
      throwsCode(() => addDelivery('A1', '271', { at: at(2026, 10, 6, 17, 0), late: true }), 'TOO_MANY_LATE');
      deleteDelivery(openShift().deliveries[0].id); throwsCode(() => addDelivery('A1', '271', { at: at(2026, 10, 6, 17, 0), late: true }), 'TOO_MANY_LATE');
      addDelivery('A1', '271');                                            // registro normal, na hora, segue livre
      eq(openShift().deliveries.length, CFG.maxLate + 1);
    });
    T('nome do entregador: trava depois de registrar turnos e backup de outra pessoa é recusado', () => {
      eq(identityLocked(), false, 'sem turnos pode corrigir o nome'); startShift(15); eq(identityLocked(), true);
      DB.user = { name: 'Nicolas', id: null, goal: 60 }; eq(identityLocked(), false, 'quem ainda não escolheu o nome não está travado');
      assertSameRider({ id: 'nicolas' }, { id: 'nicolas' }); assertSameRider({ id: 'nicolas' }, { id: null }); assertSameRider({ id: null }, { id: 'pedro' });
      try { assertSameRider({ id: 'nicolas' }, { id: 'pedro' }); throw new Error('aceitou'); } catch (e) { eq(e.code, 'OTHER_RIDER'); }
    });
    T('gravar o banco avisa quem se registrou (o envio ao gerente não fica preso ao banco)', () => {
      persist = true; let n = 0; const f = () => { n++; }; SAVE_HOOKS.push(f);
      try { startShift(15); eq(n >= 1, true); } finally { SAVE_HOOKS.splice(SAVE_HOOKS.indexOf(f), 1); persist = false; try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
    });

    /* ---- entrega esquecida, lançada depois ---- */
    T('esquecida: entra na ordem do horário, fica marcada e guarda quando foi registrada', () => {
      startShift(15);
      clock(at(2026, 10, 6, 16, 0)); addDelivery('A1', '121');
      clock(at(2026, 10, 6, 17, 0)); addDelivery('B2', '241');
      clock(at(2026, 10, 6, 18, 0)); const r = addDelivery('C1', '51', { at: at(2026, 10, 6, 16, 30), late: true, value: 2500 });
      eq(openShift().deliveries.map((d) => d.apt), ['121', '51', '241']);
      eq([r.delivery.late, r.delivery.regAt, r.delivery.t], [true, at(2026, 10, 6, 18, 0), at(2026, 10, 6, 16, 30)]);
      ok(!openShift().deliveries[0].late && !openShift().deliveries[2].late, 'só a esquecida é marcada');
    });
    T('esquecida: horário antes da entrada, no futuro, em pausa ou sem horário é recusado', () => {
      startShift(15);
      clock(at(2026, 10, 6, 16, 0)); startBreak(); clock(at(2026, 10, 6, 16, 20)); endBreak(); clock(at(2026, 10, 6, 18, 0));
      throwsCode(() => addDelivery('A1', '121', { at: at(2026, 10, 6, 13, 0), late: true }), 'BEFORE_WINDOW');          // antes de 1 h antes do início previsto (14:00)
      throwsCode(() => addDelivery('A1', '121', { at: at(2026, 10, 6, 19, 0), late: true }), 'FUTURE_TIME');
      throwsCode(() => addDelivery('A1', '121', { at: at(2026, 10, 6, 16, 10), late: true }), 'IN_BREAK');
      throwsCode(() => addDelivery('A1', '121', { late: true }), 'INVALID_TIME');
      addDelivery('A1', '121', { at: at(2026, 10, 6, 16, 30), late: true });
      eq(openShift().deliveries.length, 1);
    });
    T('esquecida: pode ser lançada com pausa em andamento e, depois da saída, só até 6 h e dentro do turno', () => {
      startShift(15); clock(at(2026, 10, 6, 17, 0)); startBreak();
      addDelivery('A1', '121', { at: at(2026, 10, 6, 16, 0), late: true });          // em pausa agora, mas a entrega foi antes
      clock(at(2026, 10, 6, 17, 30)); endBreak(); clock(at(2026, 10, 6, 20, 0)); endShift();
      clock(at(2026, 10, 6, 21, 0));
      addDelivery('B1', '131', { at: at(2026, 10, 6, 19, 0), late: true });          // turno já fechado: vai para ele
      throwsCode(() => addDelivery('B1', '141', { at: at(2026, 10, 6, 20, 30), late: true }), 'AFTER_SHIFT');
      eq(DB.shifts[0].deliveries.length, 2);
      clock(at(2026, 10, 7, 3, 0)); throwsCode(() => addDelivery('B1', '151', { at: at(2026, 10, 6, 19, 30), late: true }), 'NO_OPEN_SHIFT');
    });
    T('esquecida: entrega igual no mesmo horário pede confirmação', () => {
      startShift(15); clock(at(2026, 10, 6, 16, 0)); addDelivery('A1', '121');
      throwsCode(() => addDelivery('A1', '121', { at: at(2026, 10, 6, 16, 0), late: true }), 'DUPLICATE_RECENT');
      addDelivery('A1', '121', { at: at(2026, 10, 6, 16, 0), late: true, force: true });
      eq(openShift().deliveries.length, 2);
    });
    T('esquecida: horário digitado (HH:MM) vira o instante mais recente que já passou', () => {
      clock(at(2026, 10, 7, 0, 10));
      eq(timeToMs('23:50'), at(2026, 10, 6, 23, 50)); eq(timeToMs('00:05'), at(2026, 10, 7, 0, 5)); eq(timeToMs('0:05'), at(2026, 10, 7, 0, 5));
      eq(timeToMs('00:10'), at(2026, 10, 7, 0, 10)); eq(timeToMs('00:10') <= now(), true);
      eq([timeToMs(''), timeToMs('25x'), timeToMs(null)], [null, null, null]);
    });
    T('esquecida: sobrevive ao salvar e carregar, e vai no fechamento do gerente', () => {
      startShift(15); clock(at(2026, 10, 6, 18, 0)); addDelivery('C1', '51', { at: at(2026, 10, 6, 16, 30), late: true });
      addDelivery('A1', '121');
      const back = sanitizeDb(JSON.parse(JSON.stringify(DB))); const l = back.shifts[0].deliveries;
      eq(l.map((d) => [d.apt, !!d.late]), [['51', true], ['121', false]]); eq(l[0].regAt, at(2026, 10, 6, 18, 0));
      const ex = exportShifts(DB)[0].entregas; eq(ex.map((e) => [e.tardia, e.registradaEm]), [[true, at(2026, 10, 6, 18, 0)], [false, null]]);
    });
    T('esquecida: o desfazer conta a partir de quando foi registrada, não da hora da entrega', () => {
      startShift(15); clock(at(2026, 10, 6, 18, 0));
      const r = addDelivery('C1', '51', { at: at(2026, 10, 6, 16, 30), late: true });
      undoDelivery(r.delivery.id); eq(openShift().deliveries.length, 0);
    });
  } finally {
    DB = saved.DB; persist = saved.persist; fixedNow = saved.fixedNow; clockOffset = saved.clockOffset;
  }
  return results;
}

function runSelfTestsView() {
  const res = runSelfTests();
  const passed = res.filter((r) => r.ok).length;
  window.__selftest = { passed, total: res.length, failed: res.filter((r) => !r.ok) };
  $('boot').classList.add('hide');
  $('setup').classList.add('hide'); $('app').classList.add('hide');
  const box = $('selftest');
  box.classList.remove('hide');
  box.innerHTML = `<div class="wrap" style="padding-top:20px"><h1 style="font-family:Cinzel,serif">Autotestes</h1>
    <div class="card"><b style="font-size:22px" class="${passed === res.length ? 'good' : 'bad'}">${passed} / ${res.length} passaram</b></div>
    ${res.map((r) => `<div class="kv"><span>${r.ok ? '✔' : '✘'} ${esc(r.name)}</span><span class="${r.ok ? 'good' : 'bad'}">${r.ok ? 'ok' : esc(r.err)}</span></div>`).join('')}
    <p><a href="./" style="color:var(--gold2)">Voltar ao sistema</a></p></div>`;
  document.title = `Autotestes ${passed}/${res.length}`;
}
